// Saving on Model defaults in real Chrome against a real engine and real settings files (Kiln
// Model Modes AC-MODE-01, AC-SAVE-01 to AC-SAVE-05; mockups 1 to 4 and 7 state A), from the built
// view under Kiln's Content Security Policy. The page holds every change, Restore included, until
// Save; saves it for every PRD or for this PRD only; says when the PRD has its own settings and
// offers Use my defaults here; and its button back, the Kiln mark and Use my defaults here never
// drop unsaved changes silently. The page loads its settings after it mounts and keeps its draft in
// page memory, so only a real browser shows any of it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { writePrdSettings, writeSettings } from "../test-support/model-choices.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { modelDefaultsPath, prdSettingsPath } from "../models/model-defaults.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });

/** Model defaults, opened from Customer returns' page by its link, with the files as `before` wrote them. */
async function opened(before: (h: Harness) => void = () => {}) {
  h = await createHarness({ sessions: [] });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  before(h);
  await h.engine.refreshAgents();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  // The Models block's link is named Models for this PRD while the PRD has its own settings (Kiln Model Modes mockup 7, state C).
  const link = `[...document.querySelectorAll("a")].find(a => ["Model defaults", "Models for this PRD"].includes(a.textContent.trim()))`;
  await page.waitFor(`${link} !== undefined`);
  await page.evaluate(`${link}.click()`);
  await page.waitFor(`document.querySelector('input[name="mode"]') !== null`);
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
  return { h, page, defaults: modelDefaultsPath(h.env), own: prdSettingsPath(h.stateDirectory), json };
}

const button = (label: string, scope = "main") => `[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
const press = (page: BrowserPage, label: string, scope?: string) => page.evaluate(`(() => { ${button(label, scope)}.click(); return true; })()`);
const choose = (page: BrowserPage, name: string, value: string) => page.evaluate(`(() => { document.querySelector('input[name="${name}"][value="${value}"]').click(); return true; })()`);
const chosen = (page: BrowserPage, name: string) => page.evaluate<string>(`document.querySelector('input[name="${name}"]:checked').value`);
const pick = (page: BrowserPage, scope: string, index: number, value: string) => page.evaluate(`(() => { const select = document.querySelectorAll(${JSON.stringify(`${scope} select`)})[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const saveDisabled = `${button("Save", "[data-save-bar]")}.disabled`;
const bar = (page: BrowserPage) => page.evaluate<string>(`document.querySelector("[data-save-bar]").innerText.replace(/\\s+/g, " ").trim()`);
const headers = `[...document.querySelectorAll('.head [role="columnheader"]')].map(header => header.innerText.replace(/\\s+/g, " ").trim())`;
const title = (page: BrowserPage) => page.evaluate<string[]>(`[document.querySelector("main .eyebrow").textContent.trim(), document.querySelector("h1").textContent.trim()]`);
const sideOf = (page: BrowserPage, row: string, side: 0 | 1) => page.evaluate<string>(`document.querySelectorAll('[data-row="${row}"] .side .choice')[${side}].textContent.trim()`);

it("offers the two ways to pick models, holds every change until Save, and saves for this PRD only, which then says it has its own settings (AC-MODE-01, AC-SAVE-01, AC-SAVE-04, AC-SAVE-05)", async () => {
  const { h, page, defaults, own, json } = await opened();

  // Two choices, the recommended one selected until the person saves the other, each showing its settings only while selected.
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll('[role="radiogroup"][aria-labelledby="pick-h"] .pick strong')].map(one => one.textContent.trim())`)).toEqual(["Recommended model for each phase", "One model for everything"]);
  expect(await chosen(page, "mode")).toBe("recommended");
  expect(await page.evaluate<number[]>(`[document.querySelectorAll("[data-row]").length, document.querySelectorAll('input[name="fallback"]').length, document.querySelectorAll("[data-one-model]").length]`)).toEqual([5, 3, 0]);
  expect(await title(page)).toEqual(["Kiln settings · every PRD on this computer", "Model defaults"]);
  // The save bar always shows where a save would go, Every PRD on this computer first, and Save is unavailable until something changes.
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Save");
  expect(await chosen(page, "scope")).toBe("every_prd");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(true);

  // One model for everything: its agent, model and effort show in place of the table and the fallback setting.
  await choose(page, "mode", "one_model");
  await page.waitFor(`document.querySelector("[data-one-model]") !== null`);
  expect(await page.evaluate<number>(`document.querySelectorAll('[data-row], input[name="fallback"]').length`)).toBe(0);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("[data-one-model] select")].map(select => select.selectedOptions[0].textContent.trim())`)).toEqual(["Opus, latest (Opus 5.5)", "High"]);
  await pick(page, "[data-one-model]", 0, "sonnet");
  await pick(page, "[data-one-model]", 1, "low");
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Discard Save");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  // Nothing has taken effect: no file is written and the run still resolves from Kiln's rows.
  expect(existsSync(defaults) || existsSync(own)).toBe(false);
  expect(h.engine.notStartedChoice("3")).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });

  // The settings of the choice that isn't selected are kept on the page, and return when it is selected again.
  await choose(page, "mode", "recommended");
  await page.waitFor(`document.querySelectorAll("[data-row]").length === 5`);
  // Selecting the saved choice again leaves only the one model changed, which is still a change.
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  await choose(page, "mode", "one_model");
  await page.waitFor(`document.querySelector("[data-one-model]") !== null`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("[data-one-model] select")].map(select => select.value)`)).toEqual(["sonnet", "low"]);

  // Discard returns the page to what was last saved.
  await press(page, "Discard", "[data-save-bar]");
  await page.waitFor(saveDisabled);
  expect(await chosen(page, "mode")).toBe("recommended");
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Save");

  // For everything marks the columns from the draft, before any save (AC-WHEN-03; mockup 3).
  expect(await page.evaluate<string[]>(headers)).toEqual(["Tier", "First choice", "Fallback"]);
  await choose(page, "fallback", "everything");
  await page.waitFor(`document.querySelector("[data-skipped]") !== null`);
  expect(await page.evaluate<string[]>(headers)).toEqual(["Tier", "First choice Skipped for now", "Fallback Used for everything"]);
  expect(existsSync(defaults) || existsSync(own)).toBe(false);

  // Saved for this PRD only: the PRD gets its own settings, and the defaults are untouched.
  await choose(page, "scope", "this_prd");
  await press(page, "Save", "[data-save-bar]");
  await waitFor(() => existsSync(own));
  expect(json(own)).toEqual({ schemaVersion: 2, fallback: { use: "everything" } });
  expect(existsSync(defaults)).toBe(false);
  // The page is now titled for the PRD, says it has its own settings, keeps This PRD only selected and says where the change was saved (mockup 4).
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  expect(await title(page)).toEqual(["Kiln settings · this PRD only", "Models for Customer returns"]);
  expect(await page.evaluate<string>(`document.querySelector("[data-own-settings]").innerText.replace(/\\s+/g, " ").trim()`)).toBe("This PRD has its own settings. Every other PRD keeps your defaults. Use my defaults here");
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Saved for this PRD only. Save");
  expect(await chosen(page, "scope")).toBe("this_prd");
  expect(await chosen(page, "fallback")).toBe("everything");
  // Its activities that haven't started take their choices from the copy: each moves to its fallback.
  expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "codex", ownSettings: true });

  // The line saying where the last save went stays until the next change.
  await choose(page, "fallback", "never");
  await page.waitFor(`!${saveDisabled}`);
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Discard Save");
  await press(page, "Discard", "[data-save-bar]");

  // Use my defaults here removes the PRD's own settings at once, and the PRD follows the defaults again.
  await press(page, "Use my defaults here");
  await waitFor(() => !existsSync(own));
  await page.waitFor(`document.querySelector("[data-own-settings]") === null`);
  expect(await title(page)).toEqual(["Kiln settings · every PRD on this computer", "Model defaults"]);
  expect(await chosen(page, "scope")).toBe("every_prd");
  expect(await chosen(page, "fallback")).toBe("never");
  expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "claude_code", from: "model_defaults" });
  expect(page.problems).toEqual([]);
});

it("never loses unsaved changes silently: the button back, the Kiln mark and Use my defaults here stay on the page, and browser Back keeps the draft (AC-SAVE-02)", async () => {
  const { page, own, json } = await opened(h => writePrdSettings(h.stateDirectory, { fallback: { use: "everything" } }));
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  // The button at the top is named for the PRD the page was opened from.
  expect(await page.evaluate<string>(`document.querySelector("main a.back").textContent.trim()`)).toBe("Customer returns");
  const alert = () => page.evaluate<string | null>(`document.querySelector('[data-save-bar] [role="alert"]')?.textContent ?? null`);
  const leavePrompt = () => page.evaluate<boolean>(`(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()`);
  expect(await leavePrompt()).toBe(false);

  await choose(page, "mode", "one_model");
  await page.waitFor(`!${saveDisabled}`);
  // The way back and the Kiln mark both stay on the page, and the save bar says what to do (mockup 7, state A).
  for (const link of ["main a.back", "header a.kiln"]) {
    expect(await alert(), link).toBeNull();
    await page.evaluate(`document.querySelector(${JSON.stringify(link)}).click()`);
    await page.waitFor(`document.querySelector('[data-save-bar] [role="alert"]') !== null`);
    expect(await alert(), link).toBe("Save or discard your changes before going back.");
    expect(await page.evaluate<string>("location.pathname"), link).toBe("/customer-returns/model-defaults");
    // The message goes with the next change, so the second way out is seen to refuse too.
    await choose(page, "mode", "recommended");
    await choose(page, "mode", "one_model");
    await page.waitFor(`document.querySelector('[data-save-bar] [role="alert"]') === null`);
  }
  // Use my defaults here is refused the same way, and the PRD keeps its own settings.
  await press(page, "Use my defaults here");
  await page.waitFor(`document.querySelector('[data-save-bar] [role="alert"]') !== null`);
  expect(await alert()).toBe("Save or discard your changes before using your defaults here.");
  expect(json(own)).toEqual({ schemaVersion: 2, fallback: { use: "everything" } });
  // Reloading, closing the tab or leaving Kiln's address brings up the browser's leave-page prompt.
  expect(await leavePrompt()).toBe(true);

  // Browser Back can't be refused, so the draft is kept in page memory and shows again when Model defaults reopens.
  await page.evaluate(`history.back()`);
  await page.waitFor(`location.pathname === "/customer-returns" && document.querySelector("[data-save-bar]") === null`);
  expect(await leavePrompt()).toBe(true);
  await page.evaluate(`history.forward()`);
  await page.waitFor(`document.querySelector("[data-one-model]") !== null`);
  expect(await chosen(page, "mode")).toBe("one_model");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Discard Save");
  expect(await chosen(page, "scope")).toBe("this_prd");

  // Discard drops the draft, the save target the person picked with it, and both ways out work again.
  await choose(page, "scope", "every_prd");
  await press(page, "Discard", "[data-save-bar]");
  await page.waitFor(saveDisabled);
  expect(await chosen(page, "scope")).toBe("this_prd");
  expect(await leavePrompt()).toBe(false);
  await page.evaluate(`document.querySelector("header a.kiln").click()`);
  await page.waitFor(`location.pathname === "/customer-returns"`);
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Models for this PRD" || a.textContent.trim() === "Model defaults")).click()`);
  await page.waitFor(`document.querySelector("main a.back") !== null`);
  await page.evaluate(`document.querySelector("main a.back").click()`);
  await page.waitFor(`location.pathname === "/customer-returns"`);
  expect(page.problems).toEqual([]);
});

it("saves for every PRD from a PRD with its own settings by putting only what changed into both, and Restore saved for every PRD ends the PRD's own settings (AC-SAVE-03)", async () => {
  const sol = (effort: string) => ({ agentId: "codex" as const, family: "sol", effort });
  const standard = { first: sol("high"), fallback: { agentId: "claude_code" as const, family: "opus", effort: "high" } };
  const { h, page, defaults, own, json } = await opened(h => {
    // The defaults' Standard row is on the other agents, so a change this PRD's own settings take can be one Model defaults refuse.
    writeSettings(h.env, { rows: { standard, mechanical: { fallback: sol("low") } }, fallback: { use: "threshold", threshold: 90 } });
    writePrdSettings(h.stateDirectory, { rows: { audits: { fallback: sol("low") } }, fallback: { use: "everything" } });
  });
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  const before = { defaults: json(defaults), own: json(own) };

  // A save Kiln refuses changes neither file, says why in the save bar, and keeps the person's change on the page.
  await press(page, "Change", '[data-row="standard"] .side:nth-child(2)');
  await page.waitFor(`document.querySelectorAll('[data-row="standard"] select').length === 2`);
  await pick(page, '[data-row="standard"]', 1, "low");
  await press(page, "Done", ".table");
  await page.waitFor(`!${saveDisabled}`);
  await choose(page, "scope", "every_prd");
  await press(page, "Save", "[data-save-bar]");
  await page.waitFor(`document.querySelector('[data-save-bar] [role="alert"]') !== null`);
  expect(await page.evaluate<string>(`document.querySelector('[data-save-bar] [role="alert"]').textContent`)).toBe("Model defaults: The Standard row's first choice and fallback would both be on Claude Code. To move the row to Claude Code, change both sides in one save. Nothing was saved.");
  expect({ defaults: json(defaults), own: json(own) }).toEqual(before);
  expect(await sideOf(page, "standard", 0)).toBe("Claude Code · Opus · low");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  await press(page, "Discard", "[data-save-bar]");
  await page.waitFor(saveDisabled);
  expect(await sideOf(page, "standard", 0)).toBe("Claude Code · Opus · medium");
  // The page shows the PRD's own settings, not the defaults: its Audits fallback, Kiln's Mechanical fallback, For everything.
  expect(await sideOf(page, "audits", 1)).toBe("Codex · GPT Sol · low");
  expect(await sideOf(page, "mechanical", 1)).toBe("Codex · GPT Sol · high");
  expect(await chosen(page, "fallback")).toBe("everything");
  expect(await chosen(page, "scope")).toBe("this_prd");

  // A row changed on the page, with Done, then saved for every PRD.
  await press(page, "Change", '[data-row="demanding"] .side:nth-child(2)');
  await page.waitFor(`document.querySelectorAll('[data-row="demanding"] select').length === 2`);
  await pick(page, '[data-row="demanding"]', 0, "opus");
  await pick(page, '[data-row="demanding"]', 1, "xhigh");
  await press(page, "Done", ".table");
  await page.waitFor(`!${saveDisabled}`);
  expect(await sideOf(page, "demanding", 0)).toBe("Claude Code · Opus · extra high");
  // The target stays as the person last saw it once there is a draft; they select every PRD themselves.
  expect(await chosen(page, "scope")).toBe("this_prd");
  await choose(page, "scope", "every_prd");
  await press(page, "Save", "[data-save-bar]");
  const opus = { agentId: "claude_code" as const, family: "opus", effort: "xhigh" };
  await waitFor(() => (json(defaults) as { rows: Record<string, unknown> }).rows.demanding !== undefined);
  // Only the changed row went into each file; the rest of each stayed as it was (SAVE-004).
  expect(json(defaults)).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus }, standard, mechanical: { fallback: sol("low") } }, fallback: { use: "threshold", threshold: 90 } });
  expect(json(own)).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus }, audits: { fallback: sol("low") } }, fallback: { use: "everything" } });
  await page.waitFor(`document.querySelector('[data-save-bar] [role="status"]')?.textContent === "Saved for every PRD on this computer."`);
  // The PRD still has its own settings, so the page still shows them and This PRD only is selected again.
  expect(await title(page)).toEqual(["Kiln settings · this PRD only", "Models for Customer returns"]);
  expect(await chosen(page, "scope")).toBe("this_prd");

  // A setting saved from elsewhere while the page is open is read again, and the person's pending change stays over it.
  await choose(page, "fallback", "never");
  await page.waitFor(`!${saveDisabled}`);
  writePrdSettings(h.stateDirectory, { rows: { demanding: { first: opus }, audits: { fallback: sol("medium") } }, fallback: { use: "everything" } });
  await page.waitFor(`document.querySelectorAll('[data-row="audits"] .side .choice')[1].textContent.trim() === "Codex · GPT Sol · medium"`);
  expect(await chosen(page, "fallback")).toBe("never");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  await press(page, "Discard", "[data-save-bar]");
  await page.waitFor(saveDisabled);
  expect(await chosen(page, "fallback")).toBe("everything");

  // Restore Kiln's defaults is held like any change: the page shows Kiln's choices, and both files stay as they are.
  await press(page, "Restore Kiln's defaults");
  await page.waitFor(`!${saveDisabled}`);
  expect(await sideOf(page, "demanding", 0)).toBe("Claude Code · Fable · high");
  expect(await sideOf(page, "audits", 1)).toBe("Codex · GPT Sol · extra high");
  expect(await chosen(page, "fallback")).toBe("never");
  expect(await page.evaluate<string>(`document.querySelector('input[aria-label="Percent of a usage limit"]').value`)).toBe("95");
  expect(json(own)).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus }, audits: { fallback: sol("medium") } }, fallback: { use: "everything" } });
  expect((json(defaults) as { fallback: unknown }).fallback).toEqual({ use: "threshold", threshold: 90 });

  // Saved for every PRD, it restores all of the defaults, the mode and the fallback setting included, and the PRD follows them again.
  await choose(page, "scope", "every_prd");
  await press(page, "Save", "[data-save-bar]");
  await waitFor(() => !existsSync(own));
  expect(json(defaults)).toEqual({ schemaVersion: 2 });
  await page.waitFor(`document.querySelector("[data-own-settings]") === null`);
  expect(await title(page)).toEqual(["Kiln settings · every PRD on this computer", "Model defaults"]);
  expect(await chosen(page, "scope")).toBe("every_prd");
  expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "claude_code", model: "opus", effort: "medium", from: "model_defaults" });
  // With no file holding a field, Restore alone is no longer a change.
  await press(page, "Restore Kiln's defaults");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(true);
  // The browser logs the one refused save, which the route answers 422; nothing else went wrong.
  expect(page.problems).toEqual([expect.stringMatching(/status of 422 \(Unprocessable Entity\) .*\/api\/model-defaults$/)]);
});

it("shows why a settings file can't be read with the one write allowed over it: Use my defaults here over the PRD's own, Restore over Model defaults", async () => {
  const { page, defaults, own, json } = await opened(h => {
    writeSettings(h.env, { fallback: { use: "threshold" } });
    writePrdSettings(h.stateDirectory, {});
  });
  await page.waitFor(`document.querySelector("[data-own-settings]") !== null`);
  // The PRD's own settings stop parsing under a pending change: Save is refused with the file's reason, and the page offers only Use my defaults here.
  await choose(page, "fallback", "everything");
  await page.waitFor(`!${saveDisabled}`);
  writeFileSync(own, "{ broken");
  await press(page, "Save", "[data-save-bar]");
  await page.waitFor(`document.querySelector('section[aria-label="This PRD\\'s own settings can\\'t be read"]') !== null`);
  expect(readFileSync(own, "utf8")).toBe("{ broken");
  expect(await title(page)).toEqual(["Kiln settings · this PRD only", "Models for Customer returns"]);
  expect(await page.evaluate<string>(`document.querySelector("main .card .message").textContent`)).toContain(`This PRD's own settings at ${own} isn't valid JSON.`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("main button")].map(b => b.textContent.trim())`)).toEqual(["Use my defaults here"]);
  await press(page, "Use my defaults here");
  await waitFor(() => !existsSync(own));
  await page.waitFor(`document.querySelector('input[name="fallback"]') !== null`);
  expect(await title(page)).toEqual(["Kiln settings · every PRD on this computer", "Model defaults"]);
  // The refused save lost nothing: the person's change is still pending, now over the defaults the PRD follows.
  expect(await chosen(page, "fallback")).toBe("everything");
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(false);
  await press(page, "Discard", "[data-save-bar]");
  await page.waitFor(saveDisabled);
  expect(await chosen(page, "fallback")).toBe("threshold");

  // Model defaults stop parsing: Restore writes at once, leaves every setting at Kiln's choice, and says the fallback is now off.
  writeFileSync(defaults, "{ broken");
  await page.waitFor(`document.querySelector('section[aria-label="Model defaults can\\'t be read"]') !== null`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("main button")].map(b => b.textContent.trim())`)).toEqual(["Restore Kiln's defaults"]);
  await press(page, "Restore Kiln's defaults");
  await waitFor(() => { try { return (json(defaults) as { schemaVersion: number }).schemaVersion === 2; } catch { return false; } });
  expect(json(defaults)).toEqual({ schemaVersion: 2 });
  await page.waitFor(`document.querySelector('input[name="fallback"]:checked')?.value === "never"`);
  expect(await page.evaluate<string>(`document.querySelector("main .notice").textContent`)).toBe("Kiln's defaults are restored, and the fallback is now off.");

  // A saved one model its agent no longer offers: the editor shows the first model it can, which is its own adjustment and not a
  // change the person made, so nothing is waiting to be saved and the way back isn't refused.
  writeSettings(h!.env, { mode: "one_model", oneModel: { agentId: "claude_code", family: "retired", effort: "high" } });
  await page.waitFor(`document.querySelector("[data-one-model]") !== null`);
  expect(await page.evaluate<string>(`document.querySelector("[data-one-model] .message").textContent`)).toMatch(/^Claude Code doesn.t offer Retired/);
  expect(await page.evaluate<boolean>(saveDisabled)).toBe(true);
  expect(await bar(page)).toBe("Save changes for Every PRD on this computer This PRD only Save");
  // Picking a model is the person's change.
  await pick(page, "[data-one-model]", 0, "sonnet");
  await page.waitFor(`!${saveDisabled}`);
  await press(page, "Save", "[data-save-bar]");
  await waitFor(() => (json(defaults) as { oneModel?: { family: string } }).oneModel?.family === "sonnet");
  expect(json(defaults)).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "sonnet", effort: "high" } });
  // The browser logs each read of an unreadable file, which the route answers 409; nothing else went wrong.
  expect(page.problems.filter(problem => !/status of 409 \(Conflict\) .*\/api\/model-defaults$/.test(problem))).toEqual([]);
  expect(page.problems.length).toBeGreaterThan(0);
});
