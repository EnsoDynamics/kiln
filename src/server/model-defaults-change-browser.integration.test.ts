// Model defaults' Change on every row in real Chrome against a real engine with Claude Code and
// the Codex work stand-in both installed (Kiln Phase Model Tiers AC-DEFAULT-02: "a Change on each
// that opens the agent, model family and effort choices"). Each of the four rows' first choice and
// fallback opens an editor offering both agents, a model family and an effort, and picking Codex
// in a first-choice editor switches its families to Codex's. The page loads its settings after it
// mounts, so a server render never shows the rows; real Chrome does.
import { afterEach, expect, it } from "vitest";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { Engine } from "../engine/engine.js";
import { prdTreeAtHead } from "../engine/worktree-setup.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => {
  await chrome?.close(); await server?.close(); await h?.cleanup(); await codex?.sandbox.cleanup();
  chrome = undefined; server = undefined; h = undefined; codex = undefined;
});

type Editor = { label: string; agents: string[]; checked: string | null; families: string[]; efforts: number };

/** What each editor opened in this row offers, read off the page. */
const editorsIn = (row: string) => `[...document.querySelectorAll('[data-row="${row}"] .editor')].map(editor => ({
  label: editor.getAttribute("aria-label"),
  agents: [...editor.querySelectorAll(".agent")].filter(label => label.querySelector('input[type="radio"]')).map(label => label.textContent.trim()),
  checked: [...editor.querySelectorAll(".agent")].find(label => label.querySelector('input[type="radio"]').checked)?.textContent.trim() ?? null,
  families: [...(editor.querySelectorAll("select")[0]?.options ?? [])].map(option => option.textContent.trim()),
  efforts: editor.querySelectorAll("select")[1]?.options.length ?? 0,
}))`;

/** Presses the first Change still showing in the row: the first choice, then the fallback. */
const pressChange = (row: string) => `(() => { const button = [...document.querySelectorAll('[data-row="${row}"] button')].find(b => b.textContent.trim() === "Change"); button.click(); return true; })()`;

it("opens, on each of the four rows' Change, the agent (Claude Code or Codex), model family and effort choices for the first choice and the fallback (AC-DEFAULT-02)", async () => {
  h = await createHarness({ sessions: [] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);

  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  await page.waitFor(`[...document.querySelectorAll("a")].some(a => a.textContent.trim() === "Model defaults")`);
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Model defaults")).click()`);
  await page.waitFor(`document.querySelectorAll("[data-row]").length === 4`);
  expect(await page.evaluate<string[]>(`[...document.querySelectorAll("[data-row]")].map(row => row.dataset.row)`)).toEqual(["demanding", "standard", "mechanical", "audits"]);

  const names: Record<string, string> = { demanding: "Demanding", standard: "Standard", mechanical: "Mechanical", audits: "Audits" };
  let switched = false;
  for (const row of ["demanding", "standard", "mechanical", "audits"]) {
    // Both sides start closed, each with its own Change.
    expect(await page.evaluate<number>(`document.querySelectorAll('[data-row="${row}"] .editor').length`)).toBe(0);
    expect(await page.evaluate<number>(`[...document.querySelectorAll('[data-row="${row}"] button')].filter(b => b.textContent.trim() === "Change").length`)).toBe(2);

    await page.evaluate(pressChange(row));
    await page.waitFor(`document.querySelectorAll('[data-row="${row}"] .editor').length === 1`);
    await page.evaluate(pressChange(row));
    await page.waitFor(`document.querySelectorAll('[data-row="${row}"] .editor').length === 2`);

    const editors = await page.evaluate<Editor[]>(editorsIn(row));
    expect(editors.map(editor => editor.label)).toEqual([`${names[row]} first choice`, `${names[row]} fallback`]);
    for (const editor of editors) {
      expect(editor.agents).toEqual(["Claude Code", "Codex"]);
      expect(["Claude Code", "Codex"]).toContain(editor.checked);
      expect(editor.families.length).toBeGreaterThan(0);
      expect(editor.families.every(name => name.includes(", latest ("))).toBe(true);
      expect(editor.efforts).toBeGreaterThan(0);
    }

    // Picking Codex in a first-choice editor on Claude Code switches its families to Codex's.
    if (!switched && editors[0]!.checked === "Claude Code") {
      expect(editors[0]!.families.some(name => /^GPT/.test(name))).toBe(false);
      await page.evaluate(`(() => { const label = [...document.querySelectorAll('[data-row="${row}"] .editor')][0].querySelectorAll(".agent")[1]; label.querySelector('input[type="radio"]').click(); return true; })()`);
      await page.waitFor(`(() => { const editor = document.querySelectorAll('[data-row="${row}"] .editor')[0]; return [...editor.querySelectorAll("select")[0].options].some(option => /^GPT/.test(option.textContent.trim())); })()`);
      const after = (await page.evaluate<Editor[]>(editorsIn(row)))[0]!;
      expect(after.checked).toBe("Codex");
      expect(after.families.length).toBeGreaterThan(0);
      expect(after.families.every(name => /^GPT/.test(name))).toBe(true);
      expect(after.efforts).toBeGreaterThan(0);
      switched = true;
    }

    // Cancel closes both sides without saving.
    await page.evaluate(`(() => { const actions = document.querySelector('[data-row="${row}"]').nextElementSibling; [...actions.querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel").click(); return true; })()`);
    await page.waitFor(`document.querySelectorAll('[data-row="${row}"] .editor').length === 0`);
  }
  expect(switched).toBe(true);
  expect(page.problems).toEqual([]);
});
