// Documents found's repository rows and questions in a real browser, against the find
// repositories anywhere mockup's states 1 to 4 (AC-SEE-04): each text inside the Repositories
// list where the mockup puts it, relative to the list, in its color and type. The rest of each
// drawn state is "as today", dimmed or summarized, and is compared by view-in-browser's screens.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findRepositoriesSnapshot, runningRepositoriesSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";

const MOCKUP = new URL("../../docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html", import.meta.url).href;
const VIEW_FONTS = ["instrument-serif/latin-400", "inter/latin-400", "inter/latin-500", "inter/latin-600", "jetbrains-mono/latin-400"]
  .map((name) => new URL(`../../node_modules/@fontsource/${name}.css`, import.meta.url).href);

/** What a field or a select shows is a control's value in the view and drawn text in the mockup; it isn't compared. */
const CONTROL_TEXT = new Set(["main", "develop", "—", "▾", "/Volumes/work/storefront", "~/…"]);

interface TextBox { text: string; box: number[]; color: string; font: string }

/** Every text inside the list, its box relative to the list's top left, its color and type. */
const LIST_LAYOUT = (list: string) => `(() => {
  const list = ${list};
  const origin = list.getBoundingClientRect();
  return [list.getBoundingClientRect().width, [...list.querySelectorAll("*")]
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

/** The list under a state's Repositories heading in the mockup. */
const DRAWN_LIST = (state: number) => `[...document.querySelectorAll("main > section")][${state - 1}].querySelector(".screen ul:has(> li > div)")`;

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

async function drawn(state: number): Promise<[number, TextBox[]]> {
  const page = await chrome.open(MOCKUP);
  try {
    await page.waitFor(`document.readyState === "complete"`);
    await page.evaluate(`(async () => {
      document.querySelector('link[href^="https://fonts.googleapis.com/"]')?.remove();
      await Promise.all(${JSON.stringify(VIEW_FONTS)}.map((href) => new Promise((resolve, reject) => document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href, onload: resolve, onerror: () => reject(new Error(href)) })))));
      await Promise.all([...document.fonts].map((face) => face.load()));
      return true;
    })()`);
    return await page.evaluate<[number, TextBox[]]>(LIST_LAYOUT(DRAWN_LIST(state)));
  } finally { await page.close(); }
}

async function shown(state: 1 | 2 | 3 | 4): Promise<[number, TextBox[]]> {
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: findRepositoriesSnapshot(state) });
  const page = await chrome.open(server.address, { width: 1400 });
  try {
    await page.waitFor(`document.querySelector('ul[aria-labelledby="repos-h"]')`);
    // The mockup draws the page 1240 wide with 40px sides and its two panels at 5:6, a frame wider than the
    // view's own column; the rows are measured in a column of the drawn width.
    await page.evaluate(`(() => { const main = document.querySelector("main"); main.style.maxWidth = "1240px"; main.style.padding = "36px 40px 40px"; document.querySelector(".columns").style.gridTemplateColumns = "minmax(0, 5fr) minmax(0, 6fr)"; return true; })()`);
    // State 2 draws the folder typed into the field, so Use this folder is ready.
    if (state === 2) {
      await page.evaluate(`(() => { const field = document.getElementById("where-acme-labs/storefront"); field.value = "/Volumes/work/storefront"; field.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await page.waitFor(`document.querySelector("button.use.ready")`);
    }
    await page.evaluate(`Promise.all([...document.fonts].map((face) => face.load())).then(() => true)`);
    return await page.evaluate<[number, TextBox[]]>(LIST_LAYOUT(`document.querySelector('ul[aria-labelledby="repos-h"]')`));
  } finally { await page.close(); await server.close(); }
}

/** Each drawn text the view puts elsewhere in the list, or in another color or type, or not at all. */
function differences(mockup: TextBox[], view: TextBox[]): string[] {
  const left = [...view];
  const found: string[] = [];
  for (const box of mockup.filter((one) => !CONTROL_TEXT.has(one.text))) {
    const index = left.findIndex((one) => one.text === box.text);
    if (index === -1) { found.push(`"${box.text}" isn't drawn`); continue; }
    const [mine] = left.splice(index, 1);
    if (box.box.some((value, i) => Math.abs(value - mine!.box[i]!) > 3)) found.push(`"${box.text}" at ${mine!.box.join(",")}, drawn at ${box.box.join(",")}`);
    if (mine!.color !== box.color) found.push(`"${box.text}" color ${mine!.color}, drawn ${box.color}`);
    if (mine!.font !== box.font) found.push(`"${box.text}" font ${mine!.font}, drawn ${box.font}`);
  }
  return found;
}

describe("Documents found's repository rows as the mockup draws them (find repositories anywhere AC-SEE-04)", () => {
  for (const state of [1, 2, 3, 4] as const) {
    it(`state ${state}`, async () => {
      const [mockupWidth, mockup] = await drawn(state);
      const [viewWidth, view] = await shown(state);
      expect(Math.abs(mockupWidth - viewWidth)).toBeLessThanOrEqual(3);
      expect(differences(mockup, view)).toEqual([]);
    });
  }
});

describe("the note under Start while a row asks, as the mockup draws it (AC-SEE-04)", () => {
  const NOTE = { 2: "Tell Kiln where acme-labs/storefront is to start.", 3: "Tell Kiln which checkout of acme-labs/storefront to use to start." } as const;
  const style = (text: string) => `(() => { const note = [...document.querySelectorAll("span")].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && ![...e.children].length); if (!note) return null; const s = getComputedStyle(note); return [s.color, s.fontSize, s.fontWeight]; })()`;
  for (const state of [2, 3] as const) {
    it(`state ${state}`, async () => {
      const mockup = await chrome.open(MOCKUP);
      let drawnStyle: string[] | null;
      try {
        await mockup.waitFor(`document.readyState === "complete"`);
        drawnStyle = await mockup.evaluate<string[] | null>(style(NOTE[state]));
      } finally { await mockup.close(); }
      const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: findRepositoriesSnapshot(state) });
      const page = await chrome.open(server.address, { width: 1400 });
      try {
        await page.waitFor(`document.querySelector('ul[aria-labelledby="repos-h"]')`);
        expect(drawnStyle).toEqual(["rgb(230, 180, 80)", "12.5px", "400"]);
        expect(await page.evaluate<string[] | null>(style(NOTE[state]))).toEqual(drawnStyle);
      } finally { await page.close(); await server.close(); }
    });
  }

  // The check that counts the repositories to locate, in the checks under Start: amber in its colour and type, as drawn.
  for (const state of [2, 3] as const) {
    it(`state ${state}'s "1 repository to locate" check`, async () => {
      const check = "1 repository to locate";
      const mockup = await chrome.open(MOCKUP);
      let drawnStyle: string[] | null;
      try {
        await mockup.waitFor(`document.readyState === "complete"`);
        drawnStyle = await mockup.evaluate<string[] | null>(style(check));
      } finally { await mockup.close(); }
      const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: findRepositoriesSnapshot(state) });
      const page = await chrome.open(server.address, { width: 1400 });
      try {
        await page.waitFor(`document.querySelector('ul[aria-labelledby="repos-h"]')`);
        expect(drawnStyle?.[0]).toBe("rgb(230, 180, 80)");
        expect(await page.evaluate<string[] | null>(style(check))).toEqual(drawnStyle);
      } finally { await page.close(); await server.close(); }
    });
  }
});

describe("the settings while Kiln works follow Documents found's repository rows (AC-SEE-04)", () => {
  /** Each row's label, address path, separator and checkout folder: text, colour and type. */
  const ROW_TYPE = (list: string) => `(() => { const list = ${list}; if (!list) return null; return [...list.querySelectorAll(":scope > li")].map((li) => [...li.querySelectorAll(".repo-name, .where > *")].map((e) => { const s = getComputedStyle(e); return [e.textContent.trim(), s.color, s.fontFamily.split(",")[0].replace(/["']/g, "").trim(), s.fontSize, s.fontWeight, s.fontStyle]; })); })()`;
  const FOUND = `document.querySelector('ul[aria-labelledby="repos-h"]')`;
  const SETTINGS = `document.querySelector("ul.repos")`;

  it("each row's texts in Documents found state 1's colour and type, every field fixed and no Change", async () => {
    const found = findRepositoriesSnapshot(1);
    const foundServer = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: found });
    const foundPage = await chrome.open(foundServer.address, { width: 1400 });
    let drawnRows: string[][][] | null;
    try {
      await foundPage.waitFor(FOUND);
      await foundPage.evaluate(`Promise.all([...document.fonts].map((face) => face.load())).then(() => true)`);
      drawnRows = await foundPage.evaluate<string[][][] | null>(ROW_TYPE(FOUND));
    } finally { await foundPage.close(); await foundServer.close(); }
    const running = runningRepositoriesSnapshot();
    running.repositories = found.repositories.map((row) => ({ ...row, fixed: true }));
    const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: running });
    const page = await chrome.open(server.address, { width: 1400 });
    try {
      await page.waitFor(SETTINGS);
      await page.evaluate(`Promise.all([...document.fonts].map((face) => face.load())).then(() => true)`);
      expect(drawnRows!.map((row) => row.map(([text]) => text))).toEqual([
        ["product", "acme/product", "·", "~/code/acme/product"],
        ["returns-api", "acme/returns-api", "·", "~/code/acme/returns-api"],
        ["storefront", "acme-labs/storefront", "·", "~/code/acme-labs/storefront"],
      ]);
      expect(await page.evaluate<string[][][] | null>(ROW_TYPE(SETTINGS))).toEqual(drawnRows);
      expect(await page.evaluate<number>(`${SETTINGS}.querySelectorAll("button, input, select").length`)).toBe(0);
    } finally { await page.close(); await server.close(); }
  });
});

describe("a field message and a checkout Kiln can't deliver to, as the mockup's notes give them (AC-SEE-04)", () => {
  const MIRROR = { folder: "~/code/mirrors/storefront", remote: "git@git.example.com:acme-labs/storefront.git", pickable: false };
  /** The computed colour, size and weight of the leaf element whose text is given, and the opacity of its option. */
  const LOOK = (text: string) => `(() => { const e = [...document.querySelectorAll(".question *")].find((one) => one.textContent.trim() === ${JSON.stringify(text)} && ![...one.children].length); if (!e) return null; const s = getComputedStyle(e); return [s.color, s.fontSize, s.fontWeight, getComputedStyle(e.closest(".option") ?? e).opacity]; })()`;
  const UNPICKABLE = `(() => [...document.querySelectorAll(".question .option")].filter((one) => one.textContent.includes("mirrors")).map((one) => [getComputedStyle(one).opacity, one.querySelectorAll("input[type=radio]").length]))()`;

  for (const state of [2, 3] as const) {
    it(`state ${state}`, async () => {
      const snapshot = findRepositoriesSnapshot(state);
      const question = snapshot.repositories[2]!.question!;
      snapshot.repositories[2] = { ...snapshot.repositories[2]!, question: { ...question, checkouts: [...question.checkouts, MIRROR], found: question.found + 1, ...(state === 2 ? { fieldError: "That folder isn’t a Git checkout." } : {}) } };
      const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
      const page = await chrome.open(server.address, { width: 1400 });
      try {
        await page.waitFor(`document.querySelector(".question")`);
        // One amber line, 12.5px, under the field.
        if (state === 2) expect(await page.evaluate<string[] | null>(LOOK("That folder isn’t a Git checkout."))).toEqual(["rgb(230, 180, 80)", "12.5px", "400", "1"]);
        // At half opacity, with no radio, "Not on GitHub. …" in #8c8577.
        expect(await page.evaluate<string[][]>(UNPICKABLE)).toEqual([["0.5", 0]]);
        expect((await page.evaluate<string[] | null>(LOOK("Not on GitHub. Kiln delivers only to GitHub.")))?.slice(0, 1)).toEqual(["rgb(140, 133, 119)"]);
      } finally { await page.close(); await server.close(); }
    });
  }
});
