// The Folder missing page in a real browser, from the mockup's sample data for each of its page
// cases (missing worktree recovery AC-LOOK-01): its heading, introduction, saved folders, plan
// cards, facts, the standing statement and the put-it-back line match the mockup's words in
// order. The setup panel and the words that point at it come in Phase 2, so the mockup's
// references to it are taken out before comparing.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { folderMissingSnapshot, FOLDER_MISSING_NOW, type FolderMissingCase } from "../test-support/sample-snapshots.js";

const MOCKUP = new URL("../../docs/changes/kiln-missing-worktree-recovery/mockups/kiln-missing-worktree-recovery.html", import.meta.url).href;
const TIME_ZONE = "America/New_York";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const flat = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
/** The mockup's words without the Phase 2 setup panel's references. */
const withoutSetup = (text: string) => text
  .replace(/, and a setup to carry on( in a new folder)?\./, ".")
  .replace("set the run up above, or sort", "sort");
const REGIONS = { heading: ["#p-h1", "#missing-h"], intro: ["#p-intro", ".intro"], folders: ["#alert", ".alert"], plans: [".kp-plans", ".plans"], facts: ["#facts", ".facts"], lost: ["#p-lost", ".note"], restore: ["#self-text", ".self > div"] } as const;
const read = (selector: string) => `document.querySelector(${JSON.stringify(selector)}).innerText`;

describe("the Folder missing page, against its mockup (AC-LOOK-01)", () => {
  const cases: FolderMissingCase[] = ["merged", "unmerged", "gone", "elsewhere", "occupied", "multi", "unknown"];
  for (const which of cases) it(`matches the mockup's words, in order, for the ${which} case`, async () => {
    const server = await serveViewFixture({ port: 0, folder: "invoice-evidence-collection", snapshot: folderMissingSnapshot(which) });
    const page = await chrome.open(server.address, { clock: FOLDER_MISSING_NOW, timeZone: TIME_ZONE });
    const drawn = await chrome.open(`${MOCKUP}?case=${which}`, { clock: FOLDER_MISSING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.querySelector("#missing-h")`);
      await drawn.waitFor(`document.querySelector("#p-h1").textContent !== ""`);
      for (const [region, [mockup, view]] of Object.entries(REGIONS)) {
        const expected = withoutSetup(flat(await drawn.evaluate<string>(read(mockup))));
        expect(expected.length, `${which}: ${region} is drawn`).toBeGreaterThan(0);
        expect(flat(await page.evaluate<string>(read(view))), `${which}: ${region}`).toBe(expected);
      }
      // The footer's second half, and the Check again button.
      expect(flat(await page.evaluate<string>(read(".footer")))).toBe(flat(await drawn.evaluate<string>(read(".kp-footer"))));
      expect(await page.evaluate<boolean>(`[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Check again")`)).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await drawn.close(); await server.close(); }
  });
});
