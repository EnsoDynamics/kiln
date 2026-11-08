// Start on the Folder missing page waits for the panel to show the person's latest edit, in a real
// browser (missing worktree recovery AC-SETUP-03, AC-SETUP-01): a starting point just chosen, or a
// value just typed, reaches the engine and comes back in a refreshed panel before Start can be
// pressed, so Start never sends the page the person switched away from.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
import { folderMissingSnapshot, FOLDER_MISSING_NOW } from "../test-support/sample-snapshots.js";
import type { SetupPanel } from "../engine/folder-setup.js";
import type { Snapshot } from "../engine/snapshot.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const START = `document.querySelector(".setup .go button.primary")`;
const panelOf = (snapshot: Snapshot) => snapshot.folderMissing!.panel as SetupPanel;
/** The unmerged case with the panel the engine would publish after the given change. */
function refreshed(change: Partial<SetupPanel>): Snapshot {
  const snapshot = folderMissingSnapshot("unmerged");
  snapshot.folderMissing!.panel = { ...panelOf(snapshot), ...change };
  return snapshot;
}
async function until(test: () => boolean): Promise<void> {
  for (let tries = 0; !test(); tries++) { if (tries > 200) throw new Error("Timed out."); await new Promise(resolve => setTimeout(resolve, 25)); }
}

/** A page whose panel changes are answered only when the test releases them. */
async function open() {
  const held: (() => void)[] = [];
  let answer: Partial<SetupPanel> = {};
  const server: ViewFixtureServer = await serveViewFixture({ port: 0, folder: "invoice-evidence-collection", snapshot: folderMissingSnapshot("unmerged"),
    respond: async (command) => command === "POST /api/folder-setup/panel"
      ? await new Promise(resolve => held.push(() => resolve({ status: 200, body: { ok: true, panel: { ...panelOf(folderMissingSnapshot("unmerged")), ...answer } } })))
      : { status: 200, body: { ok: true } } });
  const page = await chrome.open(server.address, { clock: FOLDER_MISSING_NOW });
  await page.waitFor(`${START} && !${START}.disabled`);
  const starts = () => server.commands.filter(command => command.startsWith("POST /api/folder-setup/start")).map(command => JSON.parse(command.slice(command.indexOf("{"))) as { start: string; previewId: string });
  return { server, page, held, starts, answerWith: (change: Partial<SetupPanel>) => { answer = change; } };
}

describe("Start waits for the panel to show the latest edit (AC-SETUP-03, AC-SETUP-01)", () => {
  it("holds Start while a new starting point is being previewed, then starts the one now shown", async () => {
    const { server, page, held, starts, answerWith } = await open();
    try {
      expect(panelOf(folderMissingSnapshot("unmerged")).selected).toBe("branch");
      await page.evaluate(`document.querySelector('input[name="start"][value="base"]').click()`);
      await until(() => held.length === 1);
      expect(await page.evaluate<boolean>(`${START}.disabled`)).toBe(true);
      await page.evaluate(`${START}.click()`);
      // The engine took the change; its panel hasn't reached the page yet.
      answerWith({ draftRevision: 7 });
      held.shift()!();
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(await page.evaluate<boolean>(`${START}.disabled`)).toBe(true);
      server.send("snapshot", refreshed({ selected: "base", previewId: "f".repeat(64), draftRevision: 7, preview: { ...panelOf(folderMissingSnapshot("unmerged")).preview, startLabel: "Set up & start Phase 4" } }));
      await page.waitFor(`!${START}.disabled && ${START}.innerText === "Set up & start Phase 4"`);
      expect(starts()).toEqual([]);
      await page.evaluate(`${START}.click()`);
      await until(() => starts().length === 1);
      expect(starts()[0]).toMatchObject({ start: "base", previewId: "f".repeat(64) });
    } finally { await page.close(); await server.close(); }
  });

  it("holds Start while a typed Worktree is unsent, sends it, and starts only once the panel shows it", async () => {
    const { server, page, held, starts, answerWith } = await open();
    try {
      await page.evaluate(`(() => { const input = document.querySelector("#fm-worktree"); input.value = "~/devel/.worktrees/elsewhere"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await page.waitFor(`${START}.disabled`);
      await page.evaluate(`${START}.click()`);
      await page.evaluate(`document.querySelector("#fm-worktree").dispatchEvent(new FocusEvent("blur"))`);
      await until(() => held.length === 1);
      expect(server.commands.find(command => command.startsWith("POST /api/folder-setup/panel"))).toContain(`"worktreePath":"~/devel/.worktrees/elsewhere"`);
      answerWith({ draftRevision: 9 });
      held.shift()!();
      server.send("snapshot", refreshed({ previewId: "d".repeat(64), draftRevision: 9, fields: { ...panelOf(folderMissingSnapshot("unmerged")).fields, worktreePath: "~/devel/.worktrees/elsewhere" } }));
      await page.waitFor(`!${START}.disabled`);
      expect(starts()).toEqual([]);
      await page.evaluate(`${START}.click()`);
      await until(() => starts().length === 1);
      expect(starts()[0]).toMatchObject({ start: "branch", previewId: "d".repeat(64) });
    } finally { await page.close(); await server.close(); }
  });
});
