// The Folder missing page in a real browser, from the mockup's sample data for each of its page
// cases (missing worktree recovery AC-LOOK-01): its heading, introduction, saved folders, plan
// cards, facts, the standing statement, the setup panel's starting points, what will run, field
// labels and help lines and Before you start, and the put-it-back line match the mockup's words
// in order.

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
const REGIONS = { heading: ["#p-h1", "#missing-h"], intro: ["#p-intro", ".intro"], folders: ["#alert", ".alert"], plans: [".kp-plans", ".plans"], facts: ["#facts", ".facts"], lost: ["#p-lost", ".note"], restore: ["#self-text", ".self > div"],
  setupLead: ["#setup", ".setup-lead"], starts: [".kp-starts", ".starts"], willRun: ["#setup .kp-run", ".setup .what"], before: [".kp-before", ".setup .before"] } as const;
/** The setup lead is the paragraph before the mockup's panel. */
const MOCKUP_READS: Partial<Record<keyof typeof REGIONS, string>> = { setupLead: `document.querySelector("#setup").previousElementSibling.innerText` };
/** The settings' labels in order, and every help line under the folder and branch fields (AC-SETUP-01). */
const LABELS = { mockup: `[...document.querySelectorAll("#setup .kp-field-label")].map(e => e.innerText).join("|")`, view: `[...document.querySelectorAll(".setup > .label, .setup .deliver label:not(.check), .setup .deliver .label, .setup .deliver legend")].map(e => e.innerText).join("|")` };
const HELP = { mockup: `[...document.querySelectorAll("#setup .kp-grid .kp-help")].map(e => e.innerText).join("|")`, view: `[...document.querySelectorAll(".setup .deliver .field .help")].map(e => e.innerText).join("|")` };
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
      const blocked = which === "unknown";
      for (const [region, [mockup, view]] of Object.entries(REGIONS) as [keyof typeof REGIONS, readonly [string, string]][]) {
        if (blocked && ["starts", "willRun", "before"].includes(region)) continue;
        const expected = flat(await drawn.evaluate<string>(MOCKUP_READS[region] ?? read(mockup)));
        expect(expected.length, `${which}: ${region} is drawn`).toBeGreaterThan(0);
        expect(flat(await page.evaluate<string>(read(view))), `${which}: ${region}`).toBe(expected);
      }
      if (blocked) expect(flat(await page.evaluate<string>(read(".setup")))).toBe(flat(await drawn.evaluate<string>(read("#setup"))));
      else {
        expect(await page.evaluate<string>(LABELS.view), `${which}: settings labels`).toBe(await drawn.evaluate<string>(LABELS.mockup));
        const help = (await page.evaluate<string>(HELP.view)).split("|");
        for (const line of (await drawn.evaluate<string>(HELP.mockup)).split("|").filter(line => !line.includes("@") && !line.includes("Agent fixed"))) expect(help, `${which}: help line`).toContain(line);
      }
      // The footer's second half, and the Check again button.
      expect(flat(await page.evaluate<string>(read(".footer")))).toBe(flat(await drawn.evaluate<string>(read(".kp-footer"))));
      expect(await page.evaluate<boolean>(`[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Check again")`)).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await drawn.close(); await server.close(); }
  });
});
