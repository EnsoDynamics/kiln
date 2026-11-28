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
import type { TierView } from "../engine/activity-models.js";

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
  // The six rows, each with its first choice and fallback as AC-DEFAULT-01's table gives them (AC-DEFAULT-02).
  const sides = (row: string) => page.evaluate<string[]>(`[...document.querySelectorAll('[data-row="${row}"] .side .choice')].map(choice => choice.textContent.trim())`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("[data-row]")].map(row => row.dataset.row)`)).toEqual(["demanding", "standard", "mechanical", "audits", "requirements", "refining_design"]);
  expect(await sides("demanding")).toEqual(["Claude Code · Fable · high", "Codex · GPT Astra · high"]);
  expect(await sides("standard")).toEqual(["Claude Code · Opus · medium", "Codex · GPT Sol · high"]);
  expect(await sides("mechanical")).toEqual(["Claude Code · Sonnet · high", "Codex · GPT Sol · high"]);
  expect(await sides("audits")).toEqual(["Claude Code · Opus · high", "Codex · GPT Sol · extra high"]);
  expect(await sides("requirements")).toEqual(["Claude Code · Fable · high", "Codex · GPT Astra · high"]);
  expect(await sides("refining_design")).toEqual(["Claude Code · Opus · high", "Codex · GPT Sol · extra high"]);
  await press(page, '[data-row="standard"]', "Change");
  await page.waitFor(`document.querySelectorAll('[data-row="standard"] select').length === 2`);
  await pick(page, '[data-row="standard"]', 0, "sonnet");
  await pick(page, '[data-row="standard"]', 1, "low");
  await press(page, ".table", "Done");
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).rows?.standard?.first?.family === "sonnet"; } catch { return false; } });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).toEqual({ schemaVersion: 2, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
  await page.waitFor(`document.querySelector('[data-row="standard"]').innerText.includes("Claude Code · Sonnet · low")`);

  // The fallback switch, for every PRD.
  await page.evaluate(`document.querySelector(".switch input").click()`);
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).fallback?.enabled === true; } catch { return false; } });
  await page.waitFor(`document.querySelector(".switch .state").textContent === "On"`);

  // Restore Kiln's defaults clears the rows and keeps the switch.
  await press(page, ".restore", "Restore Kiln's defaults");
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).rows === undefined; } catch { return false; } });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).toEqual({ schemaVersion: 2, fallback: { enabled: true } });
  await page.waitFor(`document.querySelector('[data-row="standard"]').innerText.includes("Claude Code · Opus · medium")`);

  // Back returns to the PRD, which shows the fallback switched on.
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.startsWith("Back to"))).click()`);
  await page.waitFor(`location.pathname === "/customer-returns" && document.body.innerText.includes("Use the fallback at 95%")`);
  expect(page.problems).toEqual([]);
});

it("shows a phase's tier explanation only while the tag is pointed at, focused or pressed open (AC-TIER-02)", async () => {
  h = await createHarness({ sessions: [] });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  await h.engine.refreshAgents();
  // Documents found's phase rows with a tier each, as the engine reads them from the phase documents.
  const documents = documentsFoundSnapshot().documents!;
  const tiers: Record<string, TierView> = { "1": { value: "standard" }, "2a": { value: "demanding", reason: "Money moves on retries." }, "2b": { value: "standard" }, "3": { value: "mechanical", reason: "Repeats phase 1's builder." }, "4": { value: "not_rated" } };
  documents.plan = { ...documents.plan!, phases: documents.plan!.phases.map(phase => { const tier = tiers[phase.id]; return tier ? { ...phase, tier } : phase; }) };
  server = await startLocalServer({ engine: h.engine, documents, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });

  const tag = `li.phase[data-phase="3"] [data-tier]`;
  await page.waitFor(`document.querySelector(${JSON.stringify(tag)})`);
  const shown = () => page.evaluate<string>(`getComputedStyle(document.querySelector(${JSON.stringify(`${tag} [role="tooltip"]`)})).display`);
  const button = `document.querySelector(${JSON.stringify(`${tag} button.info`)})`;

  // Nothing of any explanation shows on load.
  await page.pointAt(undefined);
  expect(await page.evaluate<number>(`document.querySelectorAll("[data-tier]").length`)).toBeGreaterThan(1);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll('[data-tier] [role="tooltip"]')].map(tip => getComputedStyle(tip).display)`)).not.toContain("flex");
  expect(await shown()).toBe("none");

  // Pointing at the tag shows it; moving away hides it.
  await page.pointAt(tag);
  expect(await shown()).toBe("flex");
  await page.pointAt(undefined);
  expect(await shown()).toBe("none");

  // Reaching the information control by keyboard shows it; leaving hides it.
  expect(await page.evaluate<number>(`${button}.tabIndex`)).toBeGreaterThanOrEqual(0);
  await page.evaluate(`${button}.focus()`);
  expect(await page.evaluate<boolean>(`document.activeElement === ${button}`)).toBe(true);
  expect(await shown()).toBe("flex");
  await page.evaluate(`${button}.blur()`);
  expect(await shown()).toBe("none");

  // Pressing it shows it, with the pointer elsewhere and no focus; pressing again closes it.
  await page.evaluate(`${button}.click()`);
  expect(await page.evaluate<boolean>(`document.activeElement === ${button}`)).toBe(false);
  await page.waitFor(`${button}.getAttribute("aria-expanded") === "true"`);
  expect(await shown()).toBe("flex");
  await page.evaluate(`${button}.click()`);
  await page.waitFor(`${button}.getAttribute("aria-expanded") === "false"`);
  expect(await shown()).toBe("none");
  expect(page.problems).toEqual([]);
});

it("remembers the requirements skill named by Change before Start and at Needs you (AC-MODEL-03)", async () => {
  const plan = {
    kilnPlan: 1,
    stages: [
      { skill: "prd-writing-standards", title: "Write the PRD", reaches: [] },
      { skill: "phase-split", title: "Make a phase plan", reaches: ["requirements_finished"] },
    ],
    reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" },
  };
  h = await createHarness({
    sourceBrief: "# Count boxes\n",
    folder: "count-boxes",
    planSessions: [{ actions: [{ result: "```kiln-plan\n" + JSON.stringify(plan) + "\n```" }, { exit: 0 }] }],
    sessions: [{ noInit: true, actions: [] }],
  });
  await h.engine.refreshAgents();
  await waitFor(() => h!.engine.planView().status === "read");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "count-boxes", featureName: "Count boxes", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });

  async function remember(skill: string, family: string, effort: string) {
    const row = `li[data-stage="${skill}#1"]`;
    await page.waitFor(hasButton(row, "Change"));
    await press(page, row, "Change");
    const checkbox = `${row} input[type=checkbox]`;
    const control = `document.querySelector(${JSON.stringify(checkbox)})`;
    expect(await page.evaluate<string>(`${control}.closest("label").textContent.trim()`)).toBe(`Use this for ${skill} on every PRD`);
    await pick(page, row, 0, family);
    await pick(page, row, 1, effort);
    await page.evaluate(`${control}.click()`);
    await press(page, row, "Done");
    await page.waitFor(`document.querySelector(${JSON.stringify(row)}).textContent.includes("Saved for every PRD")`);
    expect(JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).skills[skill]).toEqual({ agentId: "claude_code", family, effort });
  }

  await remember("phase-split", "sonnet", "medium");
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  await page.waitFor(`document.querySelector(".model-changes li[data-stage='prd-writing-standards#1']") !== null`);
  await remember("prd-writing-standards", "haiku", "low");
  expect(page.problems).toEqual([]);
});
