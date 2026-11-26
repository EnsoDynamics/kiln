// Model defaults' fallback switch in real Chrome against a real engine (Kiln Phase Model Tiers
// AC-FALLBACK-01; mockup 4): the page's switch carries the PRD's wording, is off on a computer
// where nobody has set it, and its threshold reads 95 until the person changes it. The page loads
// its settings after it mounts, so a server render never shows the switch; real Chrome does.
import { readFileSync } from "node:fs";
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

it("shows the switch \"Use the fallback when usage is nearly out\", off, with its threshold at 95 until the person changes it (AC-FALLBACK-01)", async () => {
  h = await createHarness({ sessions: [] });
  await h.engine.refreshAgents();
  server = await startLocalServer({ engine: h.engine, documents: documentsFoundSnapshot().documents!, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width: 1200 });
  await page.waitFor(`[...document.querySelectorAll("a")].some(a => a.textContent.trim() === "Model defaults")`);
  await page.evaluate(`([...document.querySelectorAll("a")].find(a => a.textContent.trim() === "Model defaults")).click()`);
  await page.waitFor(`document.querySelector(".switch input") !== null`);

  // The switch, by the PRD's wording, off by default.
  expect(await page.evaluate<string>(`document.querySelector(".switch strong").textContent.trim()`)).toBe("Use the fallback when usage is nearly out");
  expect(await page.evaluate<boolean>(`document.querySelector(".switch input").type === "checkbox" && !document.querySelector(".switch input").checked`)).toBe(true);
  expect(await page.evaluate<string>(`document.querySelector(".switch .state").textContent.trim()`)).toBe("Off");
  // The threshold: a whole-number percent from 1 to 100, 95 until the person changes it.
  const threshold = `document.querySelector(".threshold input")`;
  expect(await page.evaluate<{ value: string; min: string; max: string; step: string }>(`(() => { const input = ${threshold}; return { value: input.value, min: input.min, max: input.max, step: input.step }; })()`)).toEqual({ value: "95", min: "1", max: "100", step: "1" });

  // Changed, it's kept for the computer, and the page reads it back.
  await page.evaluate(`(() => { const input = ${threshold}; input.value = "90"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await waitFor(() => { try { return JSON.parse(readFileSync(modelDefaultsPath(h!.env), "utf8")).fallback?.threshold === 90; } catch { return false; } });
  await page.waitFor(`${threshold}.value === "90"`);
  expect(page.problems).toEqual([]);
});
