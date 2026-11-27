// Model defaults' fallback setting in real Chrome against a real engine (Kiln Model Modes
// AC-WHEN-01; Kiln Phase Model Tiers AC-FALLBACK-01; mockup 1): under the tier table, Use the
// fallback offers Never, the threshold setting and For everything, with Never selected on a
// computer where nobody has saved another, and the threshold at 95, a whole-number percent from 1
// to 100, until the person changes it. The page loads its settings after it mounts, so a server
// render never shows them; real Chrome does.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { documentsFoundSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { modelDefaultsPath } from "../models/model-defaults.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });

it("offers Never, the threshold setting and For everything under the tier table, with Never selected and the threshold at 95 until the person saves another (AC-WHEN-01)", async () => {
  h = await createHarness({ sessions: [] });
  await h.engine.refreshAgents();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  await page.waitFor(`[...document.querySelectorAll("a")].some(a => a.textContent.trim() === "Model defaults")`);
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Model defaults")).click()`);
  await page.waitFor(`document.querySelector('input[name="fallback"]') !== null`);

  // The three settings, by the PRD's wording, in one group named Use the fallback, after the table.
  const group = `document.querySelector('[role="radiogroup"][aria-labelledby="fallback-l"]')`;
  expect(await page.evaluate<string>(`document.getElementById("fallback-l").textContent.trim()`)).toBe("Use the fallback");
  expect(await page.evaluate<string[]>(`[...${group}.querySelectorAll("label")].map(label => label.innerText.replace(/\\s+/g, " ").trim())`)).toEqual(["Never", "When the first choice's usage reaches % of a limit", "For everything, until you change this"]);
  expect(await page.evaluate<boolean>(`!!(document.querySelector(".table").compareDocumentPosition(${group}) & Node.DOCUMENT_POSITION_FOLLOWING)`)).toBe(true);
  const selected = () => page.evaluate<string>(`document.querySelector('input[name="fallback"]:checked').value`);
  expect(await selected()).toBe("never");
  // The threshold: a whole-number percent from 1 to 100, 95 until the person changes it.
  const threshold = `document.querySelector('input[aria-label="Percent of a usage limit"]')`;
  expect(await page.evaluate<{ value: string; min: string; max: string; step: string }>(`(() => { const input = ${threshold}; return { value: input.value, min: input.min, max: input.max, step: input.step }; })()`)).toEqual({ value: "95", min: "1", max: "100", step: "1" });

  const type = (value: string) => page.evaluate(`(() => { const input = ${threshold}; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const save = `[...document.querySelectorAll("[data-save-bar] button")].find(b => b.textContent.trim() === "Save")`;
  // A threshold outside its limits is refused on the page and changes nothing.
  await type("101");
  await page.waitFor(`document.querySelector(".fallback .message")?.textContent === "The threshold is a whole-number percent from 1 to 100."`);
  expect(await page.evaluate<boolean>(`${save}.disabled`)).toBe(true);

  // The threshold setting at 90, kept for the computer once saved, and read back by the page.
  await type("90");
  await page.evaluate(`document.querySelector('input[name="fallback"][value="threshold"]').click()`);
  await page.waitFor(`!${save}.disabled`);
  expect(existsSync(modelDefaultsPath(h.env))).toBe(false);
  await page.evaluate(`${save}.click()`);
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).fallback?.threshold === 90; } catch { return false; } });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).toEqual({ schemaVersion: 2, fallback: { use: "threshold", threshold: 90 } });
  await page.waitFor(`${save}.disabled`);
  expect(await selected()).toBe("threshold");
  expect(await page.evaluate<string>(`${threshold}.value`)).toBe("90");
  // It behaves as the switch's on does: the launch decision reads usage against it.
  expect(h.engine.fallbackThreshold).toBe(90);
  expect(page.problems).toEqual([]);

  // On a phone each setting's radio stays on the first line of its own words, so the selected one can't be read as its neighbour's.
  const phone = await chrome.open(`${server.address}/model-defaults`, { width: 390 });
  await phone.waitFor(`document.querySelectorAll('input[name="fallback"]').length === 3`);
  const rows = await phone.evaluate<{ radio: { top: number; bottom: number; right: number }; words: { top: number; left: number } }[]>(`[...document.querySelectorAll('[role="radiogroup"][aria-labelledby="fallback-l"] label')].map(label => { const radio = label.querySelector("input").getBoundingClientRect(); const words = label.querySelector(".words").getBoundingClientRect(); return { radio: { top: radio.top, bottom: radio.bottom, right: radio.right }, words: { top: words.top, left: words.left } }; })`);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.words.left).toBeGreaterThan(row.radio.right);
    expect(row.words.top).toBeLessThan(row.radio.bottom);
    expect(row.words.top).toBeGreaterThan(row.radio.top - 12);
  }
  expect(await phone.evaluate<boolean>(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
  expect(phone.problems).toEqual([]);
});
