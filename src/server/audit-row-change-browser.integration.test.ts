// Change on a Delivery audit row that hasn't started changes this PRD's Audits choice (Kiln Phase
// Model Tiers AC-OTHER-01: "with Change on a Delivery audit or Test audit row that hasn't
// started"), pressed in real Chrome from the built view against a real engine in a run underway.
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });

/** Sets a select to a value as a person picking it would. */
const pick = (page: BrowserPage, scope: string, index: number, value: string) => page.evaluate(`(() => { const select = document.querySelectorAll(${JSON.stringify(`${scope} select`)})[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
/** Presses the first button with this text inside the scope. */
const press = (page: BrowserPage, scope: string, label: string) => page.evaluate(`(() => { const button = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); button.click(); return true; })()`);
const hasButton = (scope: string, label: string) => `[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`;

it("changes this PRD's Audits choice, not a phase's, from a planned Delivery audit row's Change (AC-OTHER-01)", async () => {
  // Phase 1 answers and stops at Needs you, so the run is underway and the Delivery audit hasn't started.
  h = await createHarness({ sessions: [{ actions: [{ result: "I think this is done." }] }] });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });

  const audit = `li[data-phase="planned-delivery-audit"]`;
  await page.waitFor(hasButton(audit, "Change"));
  // Before the change it will run on Model defaults' Audits first choice, Claude Code · Opus · high.
  expect(await page.evaluate<string>(`document.querySelector(${JSON.stringify(audit)}).innerText`)).toContain("Claude Code · Opus 5.5 · high");
  await press(page, audit, "Change");
  await page.waitFor(`document.querySelectorAll(${JSON.stringify(`${audit} select`)}).length === 2`);
  await pick(page, audit, 0, "sonnet");
  await pick(page, audit, 1, "low");
  await press(page, audit, "Done");
  await waitFor(() => h!.engine.record.settings.modelChoices.audits !== undefined);
  // The row's Change sent target `audits`: the PRD's Audits choice changed, and no phase's.
  expect(h.engine.record.settings.modelChoices.audits).toEqual({ agentId: "claude_code", model: "sonnet", effort: "low" });
  expect(h.engine.record.settings.modelChoices.phases).toEqual({});
  expect(h.engine.commands.all().at(-1)?.instruction).toMatchObject({ action: "model", inputs: { agent_id: "claude_code", model: "sonnet", effort: "low" } });
  expect(h.engine.commands.all().at(-1)?.instruction.inputs).not.toHaveProperty("phase");
  // The Test audit row, which shares the Audits choice, shows it too.
  await page.waitFor(`document.querySelector('li[data-phase="planned-test-audit"]').innerText.includes("Sonnet 5.5")`);
  expect(await page.evaluate<string>(`document.querySelector(${JSON.stringify(audit)}).innerText`)).toMatch(/Claude Code · Sonnet 5\.5 · low\s*Changed by you · Use the default/);
}, 60_000);
