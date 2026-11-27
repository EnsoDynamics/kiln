// The saved settings as the pages show them in real Chrome against a real engine (Kiln Model
// Modes AC-WHEN-03, AC-MODE-02, AC-ROW-01; mockup 3 and mockup 7, state B). The Model defaults
// page loads its settings after it mounts, so a server render never shows its table; real Chrome
// does. The settings come from a written file, as this phase reads them.
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { writeSettings } from "../test-support/model-choices.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });

async function opened(preflight = false) {
  h = await createHarness({ sessions: [], ...(preflight ? { preflight: true } : {}) });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  await h.engine.refreshAgents();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  await page.waitFor(`document.querySelectorAll("li.phase").length > 0`);
  return { h, page };
}
const openModelDefaults = `([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Model defaults")).click()`;
const headers = `[...document.querySelectorAll('.head [role="columnheader"]')].map(header => header.innerText.replace(/\\s+/g, " ").trim())`;

it("marks the First choice column as skipped and the Fallback column as in use while the saved setting uses the fallback for everything, and shows each row's fallback in the plan (AC-WHEN-03)", async () => {
  const { h, page } = await opened();
  // Before the setting: plain column headings, and each phase on its first choice.
  await page.evaluate(openModelDefaults);
  await page.waitFor(`document.querySelectorAll("[data-row]").length === 5`);
  expect(await page.evaluate<string[]>(headers)).toEqual(["Tier", "First choice", "Fallback"]);
  const fallbackSetting = () => page.evaluate<string>(`document.querySelector('input[name="fallback"]:checked').value`);
  expect(await fallbackSetting()).toBe("never");

  // Saved to the file from elsewhere; the running Kiln reads the file's revision and the open page reads it again.
  writeSettings(h.env, { fallback: { use: "everything" } });
  await page.waitFor(`document.querySelector("[data-skipped]") !== null`);
  expect(await page.evaluate<string[]>(headers)).toEqual(["Tier", "First choice Skipped for now", "Fallback Used for everything"]);
  expect(await fallbackSetting()).toBe("everything");
  // The fifth row is on the page with the others (AC-ROW-01).
  expect(await page.evaluate<string>(`document.querySelector('[data-row="preflight_pr"]').innerText.replace(/\\s+/g, " ")`)).toContain("Preflight and pull request The check before the first phase, the pull request session at the end, and the merge and push sessions after it. Claude Code · Opus · medium Change Codex · GPT Sol · medium");

  // Back on the PRD's page, every row that hasn't started shows its fallback, tagged.
  await page.evaluate(`document.querySelector("a.back").click()`);
  await page.waitFor(`document.querySelector('li.phase[data-phase="1"] [data-fallback]') !== null`);
  const phase = await page.evaluate<string>(`document.querySelector('li.phase[data-phase="1"]').innerText.replace(/\\s+/g, " ")`);
  expect(phase).toContain("Codex · GPT Sol · high Fallback");
  expect(phase).not.toContain("Claude Code");
  expect(await page.evaluate<string>(`document.querySelector(".lines").innerText.replace(/\\s+/g, " ")`)).toContain("Recommended model for each phase Every phase runs on its fallback for now.");
  expect(page.problems).toEqual([]);
});

it("says one model runs everything, on the plan's rows, the model lines and the Model defaults page (AC-MODE-02)", async () => {
  const { h, page } = await opened();
  writeSettings(h.env, { mode: "one_model", fallback: { use: "everything" } });
  await page.waitFor(`document.querySelector('[data-models-mode="one_model"]') !== null`);
  // The Models block selects One model for this PRD and shows its agent, model and effort (Kiln Model Modes AC-PRD-01).
  expect(await page.evaluate<string>(`document.querySelector('input[name="prd-mode"]:checked').value`)).toBe("one_model");
  await page.waitFor(`document.querySelector('[role="group"][aria-label="One model for this PRD"] select') !== null`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll('[role="group"][aria-label="One model for this PRD"] select')].map(select => select.selectedOptions[0].textContent.trim())`)).toEqual(["Opus, latest (Opus 5.5)", "High"]);
  // Every phase shows the one model, with no Fallback tag: one model has no fallback (AC-MODE-03).
  for (const id of ["1", "2b", "3"]) {
    const row = await page.evaluate<string>(`document.querySelector('li.phase[data-phase="${id}"]').innerText.replace(/\\s+/g, " ")`);
    expect(row, id).toContain("Claude Code · Opus 5.5 · high");
    expect(row, id).not.toContain("Fallback");
  }
  // The Audits line is left out while one model runs everything and the audits' choice isn't changed for this PRD.
  expect(await page.evaluate<string>(`document.querySelector(".lines").innerText.replace(/\\s+/g, " ")`)).not.toContain("Audits");
  await page.evaluate(openModelDefaults);
  await page.waitFor(`document.querySelector("[data-one-model]") !== null`);
  // One model for everything is selected and shows its agent, model and effort; the tier table and the fallback setting show only under the other choice (AC-MODE-01).
  expect(await page.evaluate<string>(`document.querySelector('input[name="mode"]:checked').value`)).toBe("one_model");
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("[data-one-model] select")].map(select => select.selectedOptions[0].textContent.trim())`)).toEqual(["Opus, latest (Opus 5.5)", "High"]);
  expect(await page.evaluate<string>(`document.querySelector('[data-one-model] input[type="radio"]:checked').value`)).toBe("claude_code");
  expect(await page.evaluate<number>(`document.querySelectorAll('[data-row], input[name="fallback"]').length`)).toBe(0);
  // One model has no fallback: at a usage limit a run waits (AC-MODE-03).
  expect(await page.evaluate<string>(`document.querySelector("[data-one-model-account]").textContent`)).toMatch(/^Claude Code.*At a usage limit a run waits and picks up again\.$/);
  expect(page.problems).toEqual([]);
});

it("changes this PRD's Preflight and pull request choice from the Preflight row's Change, and undoes it with Use the default (AC-ROW-01)", async () => {
  const { h, page } = await opened(true);
  const row = `li.preflight-row`;
  const words = () => page.evaluate<string>(`document.querySelector(${JSON.stringify(row)}).innerText.replace(/\\s+/g, " ")`);
  await page.waitFor(`document.querySelector(${JSON.stringify(row)}) !== null && [...document.querySelectorAll(${JSON.stringify(`${row} button`)})].some(b => b.textContent.trim() === "Change")`);
  // The row shows its own row's choice, lighter than the audits'.
  expect(await words()).toContain("Claude Code · Opus 5.5 · medium");
  await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${row} button`)})].find(b => b.textContent.trim() === "Change").click()`);
  await page.waitFor(`document.querySelectorAll(${JSON.stringify(`${row} select`)}).length === 2`);
  const pick = (index: number, value: string) => page.evaluate(`(() => { const select = document.querySelectorAll(${JSON.stringify(`${row} select`)})[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await pick(0, "sonnet");
  await pick(1, "low");
  await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${row} button`)})].find(b => b.textContent.trim() === "Done").click()`);
  // The press reached the PRD's Preflight and pull request entry, not a phase's and not the Audits entry.
  await waitFor(() => JSON.stringify(h.engine.record.settings.modelChoices.preflightPr) === JSON.stringify({ agentId: "claude_code", model: "sonnet", effort: "low" }));
  expect(h.engine.record.settings.modelChoices).toEqual({ phases: {}, preflightPr: { agentId: "claude_code", model: "sonnet", effort: "low" } });
  await page.waitFor(`document.querySelector(${JSON.stringify(row)}).textContent.includes("Changed by you")`);
  expect(await words()).toMatch(/Claude Code · Sonnet 5\.5 · low\s*Changed by you · Use the default/);
  // It reaches the pull request session too, and never the audits.
  expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "sonnet", effort: "low", from: "changed" });
  expect(h.engine.notStartedChoice("audit-planned")).toMatchObject({ model: "opus", effort: "high", from: "model_defaults" });
  await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${row} button`)})].find(b => b.textContent.trim() === "Use the default").click()`);
  await waitFor(() => h.engine.record.settings.modelChoices.preflightPr === "default");
  await page.waitFor(`!document.querySelector(${JSON.stringify(row)}).textContent.includes("Changed by you")`);
  expect(await words()).toContain("Claude Code · Opus 5.5 · medium");
  expect(page.problems).toEqual([]);
});
