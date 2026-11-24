// The stop before a phase that asks where a repository is, in a real browser, against the find
// repositories anywhere mockup's state 8 (AC-SEE-05): each text in the asking card and in the
// card beside it where the mockup puts it, relative to its card, in its color and type. The words
// and their order on every Needs you stop that asks are proved in ask-after-start-screens.test.ts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import { needsYouMessageSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";

const MOCKUP = new URL("../../docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html", import.meta.url).href;
const VIEW_FONTS = ["instrument-serif/latin-400", "inter/latin-400", "inter/latin-500", "inter/latin-600", "jetbrains-mono/latin-400"]
  .map((name) => new URL(`../../node_modules/@fontsource/${name}.css`, import.meta.url).href);

/**
 * Not compared: the folder in the field is a control's value in the view and drawn text in the
 * mockup; the clock time follows the computer's time zone; and the mark-complete line is drawn
 * "as today".
 */
const NOT_COMPARED = [/^\/Volumes\/work\/inventory$/, /^Searches again\. Checked /, /^Marking the phase complete instead/];

interface TextBox { text: string; box: number[]; color: string; font: string }

/** Every text inside the element, its box relative to the element's top left, its color and type. */
const LAYOUT = (element: string) => `(() => {
  const card = ${element};
  const origin = card.getBoundingClientRect();
  return [origin.width, [...card.querySelectorAll("*")]
    .filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => {
      const style = getComputedStyle(e);
      const { x, y, width, height } = e.getBoundingClientRect();
      return {
        text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\\s+/g, " ").trim(),
        box: [x - origin.x, y - origin.y, width, height].map(Math.round),
        color: style.color,
        font: [style.fontFamily.split(",")[0].replace(/["']/g, "").trim(), style.fontSize, style.fontWeight].join(" "),
      };
    })];
})()`;

const DRAWN = { card: `[...document.querySelectorAll("main > section")][7].querySelector(".screen section")`, side: `[...document.querySelectorAll("main > section")][7].querySelector(".screen aside")` };
const SHOWN = { card: `document.querySelector(".column-wide section.card.ended")`, side: `document.querySelector(".column-side aside.card.side")` };

/** The stop before phase 4 as state 8 draws it: one repository Kiln couldn't find, nothing else holding the stop. */
function stateEight(): Snapshot {
  const base = needsYouMessageSnapshot();
  const fact = "phase-4-restock-check-in.md names acme-labs/inventory, and Kiln couldn’t find a checkout of it";
  return {
    ...base,
    feature: { ...base.feature, currentPhaseId: "4", stoppedAt: "2026-10-17T18:05:00Z" },
    needsYou: {
      phaseId: "4", kind: "plan", stoppedAt: "2026-10-17T18:05:00Z", checkedAt: "2026-10-17T18:05:00Z", resumeOffered: false,
      checks: [{ name: "Phase plan reads", passed: false, facts: [fact] }],
      freshSessionPrompt: "", freshSessionCommand: "",
      locate: [{ kind: "where", repository: "acme-labs/inventory", label: "inventory", searchedFrom: "~/code/acme", checkouts: [], found: 0, phaseFile: "phase-4-restock-check-in.md" }],
    },
  };
}

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

async function drawn(): Promise<Record<"card" | "side", [number, TextBox[]]>> {
  const page = await chrome.open(MOCKUP);
  try {
    await page.waitFor(`document.readyState === "complete"`);
    await page.evaluate(`(async () => {
      document.querySelector('link[href^="https://fonts.googleapis.com/"]')?.remove();
      await Promise.all(${JSON.stringify(VIEW_FONTS)}.map((href) => new Promise((resolve, reject) => document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href, onload: resolve, onerror: () => reject(new Error(href)) })))));
      await Promise.all([...document.fonts].map((face) => face.load()));
      return true;
    })()`);
    return { card: await page.evaluate(LAYOUT(DRAWN.card)), side: await page.evaluate(LAYOUT(DRAWN.side)) };
  } finally { await page.close(); }
}

async function shown(): Promise<Record<"card" | "side", [number, TextBox[]]>> {
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: stateEight() });
  const page = await chrome.open(server.address, { width: 1400 });
  try {
    await page.waitFor(`document.querySelector('[id="where-acme-labs/inventory"]')`);
    // The mockup draws the page 1240 wide with 40px sides and a 340px side column, a frame wider than the
    // view's own 320px side column on every Needs you page; the cards are measured in a frame of the drawn widths.
    await page.evaluate(`(() => { const main = document.querySelector("main"); main.style.maxWidth = "1240px"; main.style.padding = "36px 40px 40px"; document.querySelector(".column-side").style.flex = "0 0 340px"; return true; })()`);
    // State 8 draws the folder typed into the field, so Use this folder is ready.
    await page.evaluate(`(() => { const field = document.getElementById("where-acme-labs/inventory"); field.value = "/Volumes/work/inventory"; field.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await page.waitFor(`document.querySelector("button.use.ready")`);
    await page.evaluate(`Promise.all([...document.fonts].map((face) => face.load())).then(() => true)`);
    return { card: await page.evaluate(LAYOUT(SHOWN.card)), side: await page.evaluate(LAYOUT(SHOWN.side)) };
  } finally { await page.close(); await server.close(); }
}

/** Each drawn text the view puts elsewhere in its card, or in another color or type, or not at all. */
function differences(mockup: TextBox[], view: TextBox[]): string[] {
  const left = [...view];
  const found: string[] = [];
  for (const box of mockup.filter((one) => !NOT_COMPARED.some((pattern) => pattern.test(one.text)))) {
    const index = left.findIndex((one) => one.text === box.text);
    if (index === -1) { found.push(`"${box.text}" isn't shown`); continue; }
    const [mine] = left.splice(index, 1);
    if (box.box.some((value, i) => Math.abs(value - mine!.box[i]!) > 3)) found.push(`"${box.text}" at ${mine!.box.join(",")}, drawn at ${box.box.join(",")}`);
    if (mine!.color !== box.color) found.push(`"${box.text}" color ${mine!.color}, drawn ${box.color}`);
    if (mine!.font !== box.font) found.push(`"${box.text}" font ${mine!.font}, drawn ${box.font}`);
  }
  return found;
}

describe("the stop before a phase that asks where a repository is, as mockup state 8 draws it (find repositories anywhere AC-SEE-05)", () => {
  it("lays out the asking card and the card beside it as drawn, in the drawn colors and type", async () => {
    const mockup = await drawn();
    const view = await shown();
    for (const part of ["card", "side"] as const) {
      expect(Math.abs(mockup[part][0] - view[part][0]), part).toBeLessThanOrEqual(3);
      expect(differences(mockup[part][1], view[part][1]), part).toEqual([]);
    }
  }, 60_000);
});
