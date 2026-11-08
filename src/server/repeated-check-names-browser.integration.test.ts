// A stop saved before the engine merged repeated check names must still render:
// Svelte rejects a duplicate key only in the browser, so these open the built view in real Chrome.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import type { CheckResult } from "../state/records.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { handBackSnapshot, needsYouMessageSnapshot, noReportAuditSnapshot } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const repeated: CheckResult[] = [
  { name: "Audit result recorded", passed: true, facts: ["Outcome needs_you."] },
  { name: "Everything committed", passed: true, facts: ["Every assigned worktree is clean."] },
  { name: "Pushed", passed: true, facts: ["Every assigned head matches origin."] },
  { name: "Audit work resolved", passed: false, facts: ["Restore the named evidence."] },
  { name: "Everything committed", passed: true, facts: ["Every assigned worktree is clean."] },
  { name: "Pushed", passed: true, facts: ["Every assigned head matches origin."] },
];

async function rowsShown(snapshot: Snapshot, path: string, heading: string, selector: string) {
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(`${server.address}${path}`, { width: 1200, height: 1000 });
  try {
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(heading)})`);
    return await page.evaluate<number>(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  } finally { await page.close(); await server.close(); }
}

it("renders the standard Needs you page with every saved row", async () => {
  const snapshot = needsYouMessageSnapshot();
  snapshot.needsYou = { ...snapshot.needsYou!, checks: repeated };
  delete snapshot.needsYou.phaseRecovery;
  expect(await rowsShown(snapshot, "", "Check again", "ul.checks li")).toBe(repeated.length);
});

it("renders the hand-back page with every saved row", async () => {
  const snapshot = handBackSnapshot();
  snapshot.needsYou = { ...snapshot.needsYou!, checks: repeated };
  expect(await rowsShown(snapshot, "", "already done?", "ul.checks li")).toBe(repeated.length);
});

it("renders a waived completion with every saved row", async () => {
  const snapshot = noReportAuditSnapshot();
  const row = snapshot.activities!.find(activity => activity.waivedCompletion)!;
  row.waivedCompletion = { ...row.waivedCompletion!, checks: repeated };
  expect(await rowsShown(snapshot, `/phase/${row.id}`, "not verified by Kiln", "ul.checks li")).toBe(repeated.length);
});
