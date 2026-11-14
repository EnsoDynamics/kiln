// The newer version notice in a real browser against the real local server (Kiln Newer Version
// Notice PRD): the page loads without waiting for npm and the pill appears when the answer does
// (AC-NEWER-01); the pill opens the panel, and the pill again, Escape or a press outside closes it
// (AC-NEWER-03); on a phone the panel stays on screen; nothing the page loads leaves the machine.

import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let chrome: HeadlessChrome;
let harness: Harness | undefined;
let server: LocalServer | undefined;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
afterEach(async () => {
  await server?.close();
  server = undefined;
  if (harness) await waitFor(() => harness!.engine.baseCheck !== "checking");
  await harness?.cleanup();
  harness = undefined;
});

async function serve(newerVersion: Promise<string | undefined>) {
  harness = await createHarness({ sessions: [landingSession()] });
  server = await startLocalServer({ engine: harness.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: harness.engine.record.token, newerVersion });
  return server.address;
}

const panelOpen = `Boolean(document.querySelector("[data-testid=newer-kiln]"))`;
const pressOn = (selector: string, type: string) => `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true }))`;

it("shows the pill once npm answers, and opens and closes the panel as the person asks", async () => {
  let settle!: (version: string | undefined) => void;
  const page = await chrome.open(await serve(new Promise(resolve => { settle = resolve; })));
  try {
    await page.waitFor(`document.body.innerText.includes("Customer returns")`);
    expect(await page.evaluate<boolean>(`Boolean(document.querySelector(".newer > .pill"))`)).toBe(false);
    settle("1.2.0");
    await page.waitFor(`document.querySelector(".newer > .pill")`);
    expect(await page.evaluate<string>(`document.querySelector(".newer > .pill").textContent`)).toBe("v1.2.0 available");
    expect(await page.evaluate<boolean>(panelOpen)).toBe(false);

    await page.evaluate(`document.querySelector(".newer > .pill").click()`);
    await page.waitFor(panelOpen);
    expect(await page.evaluate<string>(`document.querySelector("[data-testid=newer-kiln]").innerText`)).toContain("npm install -g @ensodynamics/kiln");
    await page.evaluate(`document.querySelector(".newer > .pill").click()`);
    await page.waitFor(`!${panelOpen}`);

    await page.evaluate(`document.querySelector(".newer > .pill").click()`);
    await page.waitFor(panelOpen);
    // A press inside the panel leaves it open; Escape closes it and gives focus back to the pill.
    await page.evaluate(pressOn("[data-testid=newer-kiln]", "pointerdown"));
    expect(await page.evaluate<boolean>(panelOpen)).toBe(true);
    await page.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await page.waitFor(`!${panelOpen}`);
    expect(await page.evaluate<boolean>(`document.activeElement === document.querySelector(".newer > .pill")`)).toBe(true);

    await page.evaluate(`document.querySelector(".newer > .pill").click()`);
    await page.waitFor(panelOpen);
    await page.evaluate(pressOn("main, .page", "pointerdown"));
    await page.waitFor(`!${panelOpen}`);

    expect(await page.evaluate<string[]>(`performance.getEntriesByType("resource").map(e => e.name).filter(name => !name.startsWith(location.origin))`)).toEqual([]);
    expect(page.problems).toEqual([]);
  } finally {
    await page.close();
  }
});

it("shows no pill when npm has nothing newer", async () => {
  const page = await chrome.open(await serve(Promise.resolve(undefined)));
  try {
    await page.waitFor(`document.body.innerText.includes("Customer returns")`);
    // The answer has arrived once the view has asked for it and rendered the top bar again.
    await page.evaluate(`fetch("/api/newer-version", { headers: { "X-Kiln-Token": document.querySelector('meta[name="kiln-token"]').content } }).then(r => r.json())`);
    expect(await page.evaluate<boolean>(`Boolean(document.querySelector(".newer > .pill"))`)).toBe(false);
  } finally {
    await page.close();
  }
});

it("keeps the open panel on screen at phone width", async () => {
  const page = await chrome.open(await serve(Promise.resolve("1.2.0")), { width: 390, height: 844 });
  try {
    await page.waitFor(`document.querySelector(".newer > .pill")`);
    await page.evaluate(`document.querySelector(".newer > .pill").click()`);
    await page.waitFor(panelOpen);
    const box = await page.evaluate<{ left: number; right: number }>(`(() => { const r = document.querySelector("[data-testid=newer-kiln]").getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
    expect(await page.evaluate<number>(`document.documentElement.scrollWidth`)).toBeLessThanOrEqual(390);
  } finally {
    await page.close();
  }
});
