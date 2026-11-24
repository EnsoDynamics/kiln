// Changing models in real Chrome against a real engine (Kiln Phase Model Tiers AC-PICK-03,
// AC-OTHER-01, AC-DEFAULT-02, AC-FALLBACK-01; mockups 1 and 4), from the built view under Kiln's
// Content Security Policy: a phase's Change on Documents found opens the agent, model and effort
// choices and Done saves them; the Audits line's Change does the same for the PRD's Audits choice;
// the Model defaults link opens the page of its own, where a row's Change and Done save Model
// defaults for every PRD, the fallback switch turns on, and Back returns to the PRD.
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
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

it("changes a phase and the Audits choice on Documents found, then Model defaults on its own page", async () => {
  h = await createHarness({ sessions: [] });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  await h.engine.refreshAgents();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });

  // Phase 3's Change opens the editor; Haiku at low, then Done.
  await page.waitFor(`document.querySelectorAll("li.phase").length > 0`);
  const phase3 = `li.phase[data-phase="3"]`;
  await page.waitFor(hasButton(phase3, "Change"));
  await press(page, phase3, "Change");
  await page.waitFor(`document.querySelectorAll(${JSON.stringify(`${phase3} select`)}).length === 2`);
  await pick(page, phase3, 0, "haiku");
  await pick(page, phase3, 1, "low");
  await press(page, phase3, "Done");
  await waitFor(() => JSON.stringify(h!.engine.record.settings.modelChoices.phases["3"]) === JSON.stringify({ agentId: "claude_code", model: "haiku", effort: "low" }));
  await page.waitFor(`document.querySelector(${JSON.stringify(phase3)}).textContent.includes("Changed by you")`);
  expect(await page.evaluate<string>(`document.querySelector(${JSON.stringify(phase3)}).innerText`)).toMatch(/Claude Code · Haiku 5\.5 · low\s*Changed by you · Use the default/);

  // Use the default returns it to its tier's choice.
  await press(page, phase3, "Use the default");
  await waitFor(() => h!.engine.record.settings.modelChoices.phases["3"] === "default");
  await page.waitFor(`!document.querySelector(${JSON.stringify(phase3)}).textContent.includes("Changed by you")`);

  // The Audits line's Change sets this PRD's Audits choice.
  const audits = `.lines .line:nth-child(2)`;
  await press(page, audits, "Change");
  await page.waitFor(`document.querySelectorAll(${JSON.stringify(`${audits} select`)}).length === 2`);
  await pick(page, audits, 0, "sonnet");
  await pick(page, audits, 1, "medium");
  await press(page, audits, "Done");
  await waitFor(() => JSON.stringify(h!.engine.record.settings.modelChoices.audits) === JSON.stringify({ agentId: "claude_code", model: "sonnet", effort: "medium" }));
  await page.waitFor(`document.querySelector(${JSON.stringify(audits)}).innerText.includes("Sonnet 5.5")`);

  // The Model defaults link opens the page of its own.
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Model defaults")).click()`);
  await page.waitFor(`document.querySelector("h1")?.textContent === "Model defaults" && document.querySelector('[data-row="standard"]')`);
  expect(await page.evaluate<string>("location.pathname")).toBe("/customer-returns/model-defaults");
  expect(await page.evaluate<string>(`document.querySelector('[data-row="standard"]').innerText`)).toContain("Claude Code · Opus · medium");
  await press(page, '[data-row="standard"]', "Change");
  await page.waitFor(`document.querySelectorAll('[data-row="standard"] select').length === 2`);
  await pick(page, '[data-row="standard"]', 0, "sonnet");
  await pick(page, '[data-row="standard"]', 1, "low");
  await press(page, ".table", "Done");
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).rows?.standard?.first?.family === "sonnet"; } catch { return false; } });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).toEqual({ schemaVersion: 1, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
  await page.waitFor(`document.querySelector('[data-row="standard"]').innerText.includes("Claude Code · Sonnet · low")`);

  // The fallback switch, for every PRD.
  await page.evaluate(`document.querySelector(".switch input").click()`);
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).fallback?.enabled === true; } catch { return false; } });
  await page.waitFor(`document.querySelector(".switch .state").textContent === "On"`);

  // Restore Kiln's defaults clears the rows and keeps the switch.
  await press(page, ".restore", "Restore Kiln's defaults");
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).rows === undefined; } catch { return false; } });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).toEqual({ schemaVersion: 1, fallback: { enabled: true } });
  await page.waitFor(`document.querySelector('[data-row="standard"]').innerText.includes("Claude Code · Opus · medium")`);

  // Back returns to the PRD, which shows the fallback switched on.
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.startsWith("Back to"))).click()`);
  await page.waitFor(`location.pathname === "/customer-returns" && document.body.innerText.includes("Use the fallback at 95%")`);
  expect(page.problems).toEqual([]);
});
