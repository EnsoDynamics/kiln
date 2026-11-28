// The Models block on Documents found in real Chrome against a real engine and real settings files
// (Kiln Model Modes AC-PRD-01, AC-PRD-02; mockups 5 and 6 and mockup 7 state C), from the built
// view under Kiln's Content Security Policy. The block offers the two ways to pick models; a choice
// applies to this PRD alone at once, with no Save, giving it its own settings while they differ
// from the defaults and returning it to the defaults when they match; and what the one model's
// editor adjusts on its own never writes. Only a real browser shows a person's click reaching the
// files and the republished page following them.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { Engine } from "../engine/engine.js";
import { prdTreeAtHead } from "../engine/worktree-setup.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { writePrdSettings, writeSettings } from "../test-support/model-choices.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { modelDefaultsPath, prdSettingsPath, settingsRevision } from "../models/model-defaults.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); await codex?.sandbox.cleanup(); chrome = undefined; server = undefined; h = undefined; codex = undefined; });

/** Customer returns' Documents found, with the files as `before` wrote them. */
async function opened(before: (h: Harness) => void = () => {}, withCodex = false) {
  h = await createHarness({ sessions: [] });
  if (withCodex) {
    // Codex installed too, so the one model's editor offers both agents.
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
    h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  }
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  before(h);
  await h.engine.refreshAgents();
  if (withCodex) await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  await page.waitFor(`document.querySelector('input[name="prd-mode"]') !== null`);
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
  return { h, page, defaults: modelDefaultsPath(h.env), own: prdSettingsPath(h.stateDirectory), json };
}

const block = (page: BrowserPage) => page.evaluate<string>(`document.querySelector(".field.models").innerText.replace(/\\s+/g, " ").trim()`);
const chosen = (page: BrowserPage) => page.evaluate<string>(`document.querySelector('input[name="prd-mode"]:checked').value`);
const choose = (page: BrowserPage, value: string) => page.evaluate(`(() => { document.querySelector('input[name="prd-mode"][value="${value}"]').click(); return true; })()`);
const editor = `document.querySelector('[role="group"][aria-label="One model for this PRD"]')`;
const pick = (page: BrowserPage, index: number, value: string) => page.evaluate(`(() => { const select = ${editor}.querySelectorAll("select")[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const rowText = (page: BrowserPage, id: string) => page.evaluate<string>(`document.querySelector('[data-phase="${id}"]').innerText.replace(/\\s+/g, " ").trim()`);

it("offers the two choices, and a choice applies to this PRD alone at once, giving it its own settings and back to the defaults when they match (AC-PRD-01, AC-PRD-02)", async () => {
  const { page, defaults, own, json } = await opened(h => writeSettings(h.env, { fallback: { use: "threshold", threshold: 90 } }));
  const defaultsBefore = readFileSync(defaults, "utf8");

  // Mockup 5: the recommended choice selected, its fallback line with the threshold and the Model defaults link, and the Audits line.
  expect(await chosen(page)).toBe("recommended");
  const first = await block(page);
  expect(first).toContain("Models Recommended model for each phase Each phase moves to its fallback when usage reaches 90%. Model defaults One model for this PRD Every phase, both audits, the preflight, and the pull request, merge and push sessions.");
  expect(first).toContain("Audits");
  expect(first).not.toContain("This PRD has its own settings.");
  expect(await page.evaluate<boolean>(`${editor} === null`)).toBe(true);

  // Mockup 6: One model for this PRD, with no Save. The PRD has its own settings at once, carrying the one model shown.
  await choose(page, "one_model");
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null && ${editor} !== null`);
  expect(json(own)).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { use: "threshold", threshold: 90 } });
  expect(readFileSync(defaults, "utf8")).toBe(defaultsBefore);
  const picked = await block(page);
  expect(picked).toContain("At a usage limit this PRD waits and picks up again.");
  expect(picked).toContain("This PRD has its own settings. Use my defaults here");
  expect(picked).toContain("Models for this PRD");
  // No Audits line under one model, the audits' choice not having been changed for this PRD.
  expect(picked).not.toContain("Not a tier: they check the whole PRD.");
  await page.waitFor(`document.querySelector('[data-phase="1"]').innerText.includes("Opus")`);
  expect(await rowText(page, "1")).toMatch(/Claude Code · Opus \d+(\.\d+)* · high/);
  // The editor rendering and filling itself in wrote nothing.
  expect(json(own)).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { use: "threshold", threshold: 90 } });

  // Picking the effort applies at once, and reaches the plan.
  await pick(page, 1, "low");
  await page.waitFor(`document.querySelector('[data-phase="1"]').innerText.includes(" · low")`);
  expect(json(own)).toMatchObject({ oneModel: { agentId: "claude_code", family: "opus", effort: "low" } });

  // Use my defaults here removes the PRD's own settings at once.
  await page.evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Use my defaults here").click()`);
  await page.waitFor(`document.querySelector("[data-own-settings]") === null`);
  expect(existsSync(own)).toBe(false);
  expect(await chosen(page)).toBe("recommended");

  // One model and back: once the PRD's settings match the defaults again, leaving out the one model, it follows them.
  await choose(page, "one_model");
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  await choose(page, "recommended");
  await page.waitFor(`document.querySelector("[data-own-settings]") === null`);
  expect(existsSync(own)).toBe(false);
  expect(readFileSync(defaults, "utf8")).toBe(defaultsBefore);
});

it("for a PRD with its own settings, says so, offers Use my defaults here, and keeps the Audits line with the fallback it will launch on (mockup 7, state C)", async () => {
  const { page } = await opened(h => writePrdSettings(h.stateDirectory, { fallback: { use: "everything" } }));
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  const words = await block(page);
  expect(words).toContain("Models Recommended model for each phase Every phase runs on its fallback for now. Models for this PRD One model for this PRD");
  expect(words).toContain("This PRD has its own settings. Use my defaults here");
  expect(words).toMatch(/Audits Codex · GPT \S+ · \S+ Fallback Change/);
  // The link opens the PRD's own settings.
  await page.evaluate(`[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Models for this PRD").click()`);
  await page.waitFor(`location.pathname === "/customer-returns/model-defaults" && document.querySelector('input[name="mode"]') !== null`);
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
});

it("never writes what the one model's editor fills in on its own: only a person's pick does (Kiln Model Modes, \"A choice in the Models block\")", async () => {
  // A one model saved with no effort: the editor shows the effort it starts on, but that is its own adjustment.
  const saved = { schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "opus" } };
  const { page, own, json } = await opened(h => writePrdSettings(h.stateDirectory, { mode: "one_model", oneModel: { agentId: "claude_code", family: "opus" } }));
  await page.waitFor(`${editor} !== null && ${editor}.querySelectorAll("select").length === 2`);
  expect(await page.evaluate<string>(`${editor}.querySelectorAll("select")[1].value`)).toBe("high");
  // Give a write the editor might send time to land, then check the file is as saved.
  await page.evaluate(`new Promise(resolve => setTimeout(() => resolve(true), 500))`);
  expect(json(own)).toEqual(saved);
  // A person picking the model writes it, with the effort the editor shows.
  await pick(page, 0, "sonnet");
  await page.waitFor(`document.querySelector('[data-phase="1"]').innerText.includes("Sonnet")`);
  expect(json(own)).toMatchObject({ oneModel: { agentId: "claude_code", family: "sonnet", effort: "high" } });
});

it("keeps the choice in force selected and says why when a choice is refused (AC-PRD-02)", async () => {
  const { page, own, defaults } = await opened();
  writeFileSync(defaults, "{ broken");
  // Kiln notices the broken file and republishes the page, which clears any earlier refusal: let that happen before the choice.
  await waitFor(() => (h!.engine as unknown as { settingsSeen: string }).settingsSeen === settingsRevision(h!.engine.settingsPaths));
  await page.waitFor(`document.querySelector('[data-models-block]') !== null`);
  await choose(page, "one_model");
  await page.waitFor(`document.querySelector('[data-models-block] [role="alert"]') !== null`);
  expect(await page.evaluate<string>(`document.querySelector('[data-models-block] [role="alert"]').textContent`)).toContain("isn't valid JSON");
  expect(await chosen(page)).toBe("recommended");
  expect(existsSync(own)).toBe(false);
});

it("moves the one model to the other agent when the person picks it in the editor, at once (AC-PRD-02)", async () => {
  const { page, own, json } = await opened(() => {}, true);
  await choose(page, "one_model");
  await page.waitFor(`${editor} !== null && ${editor}.querySelector('input[value="codex"]') !== null`);
  await page.evaluate(`${editor}.querySelector('input[value="codex"]').click()`);
  await page.waitFor(`document.querySelector('[data-phase="1"]').innerText.includes("Codex")`);
  expect(json(own)).toMatchObject({ mode: "one_model", oneModel: { agentId: "codex" } });
  expect(await rowText(page, "1")).toMatch(/Codex · GPT/);
});
