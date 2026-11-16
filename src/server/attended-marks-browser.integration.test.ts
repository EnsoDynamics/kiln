// The Needs you there marker and the early-merge warning in real Chrome, from the built view under
// Kiln's Content Security Policy (Kiln Build Preflight PRD, Phase 2: AC-ATTEND-01, AC-ATTEND-05):
// the marker's text shows on pointing, keyboard focus and a press, and ticking Allow early merges
// removes the warning. What the snapshot carries is proved in src/engine/attended-marks.integration.test.ts.
import { afterEach, expect, it } from "vitest";
import { documentsFoundSnapshot, RUNNING_NOW, runningSnapshot } from "../test-support/sample-snapshots.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";

let chrome: HeadlessChrome | undefined;
let server: ViewFixtureServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); chrome = undefined; server = undefined; });

const ATTENDED = "Create the return-label template in the carrier's desktop console, which has no API.";
/** Whether the marker's text is drawn: a tooltip's text is in innerText only while it is displayed. */
const shown = (page: BrowserPage) => page.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(ATTENDED)})`);

async function proveMarker(page: BrowserPage) {
  await page.waitFor(`document.querySelector(".needs-you-there")`);
  expect(await shown(page)).toBe(false);
  // Pointing at it.
  await page.pointAt(".needs-you-there");
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(ATTENDED)})`);
  expect(await page.evaluate<string>("document.body.innerText")).toContain("From the phase document's Attended line");
  await page.pointAt(undefined);
  await page.waitFor(`!document.body.innerText.includes(${JSON.stringify(ATTENDED)})`);
  // Keyboard focus.
  await page.evaluate(`document.querySelector(".needs-you-there").focus()`);
  expect(await shown(page)).toBe(true);
  await page.evaluate(`document.activeElement.blur()`);
  expect(await shown(page)).toBe(false);
  // A press toggles it, with no pointer over it and nothing focused.
  await page.evaluate(`(() => { const marker = document.querySelector(".needs-you-there"); marker.click(); marker.blur(); return true; })()`);
  expect(await shown(page)).toBe(true);
  expect(await page.evaluate<string | null>(`document.querySelector(".needs-you-there").getAttribute("aria-expanded")`)).toBe("true");
  await page.evaluate(`(() => { const marker = document.querySelector(".needs-you-there"); marker.click(); marker.blur(); return true; })()`);
  expect(await shown(page)).toBe(false);
  expect(page.problems).toEqual([]);
}

it("Documents found's marker shows the Attended text on pointing, focus and a press", async () => {
  const snapshot = documentsFoundSnapshot();
  snapshot.documents!.plan!.phases[0]!.attended = ATTENDED;
  server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  chrome = await launchChrome();
  await proveMarker(await chrome.open(server.address));
});

it("the run's phase plan marker shows the Attended text on pointing, focus and a press", async () => {
  const snapshot = runningSnapshot();
  snapshot.phases = snapshot.phases.map(row => row.id === "3" ? { ...row, attended: ATTENDED } : row);
  snapshot.activities = snapshot.phases;
  server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  chrome = await launchChrome();
  await proveMarker(await chrome.open(server.address, { clock: RUNNING_NOW, timeZone: "America/New_York" }));
});

it("ticking Allow early merges removes the warning, and unticking it brings it back", async () => {
  const snapshot = documentsFoundSnapshot();
  snapshot.documents!.plan!.phases[4]!.earlyMerge = "develop, for AC-RET-09";
  snapshot.settings.developmentDeployments = { enabled: false, targets: [] };
  server = await serveViewFixture({
    port: 0, folder: "customer-returns", snapshot,
    // The saved setting comes back as the server would answer the save.
    respond: async (command, body) => command === "POST /api/settings" ? { status: 200, body: { ok: true, settings: { ...snapshot.settings, ...JSON.parse(body) } } } : { status: 200, body: { ok: true } },
  });
  chrome = await launchChrome();
  const page = await chrome.open(server.address);
  const warning = "The run will stop at Phase 3. It merges into develop early. Tick Allow early merges to keep it going.";
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(warning)})`);
  const box = `[aria-label="Early merges"] input[type="checkbox"]`;
  await page.evaluate(`document.querySelector('${box}').click()`);
  await page.waitFor(`!document.body.innerText.includes("The run will stop at Phase 3.")`);
  expect(await page.evaluate<boolean>(`document.querySelector('${box}').checked`)).toBe(true);
  expect(server.commands.filter(command => command.startsWith("POST /api/settings"))).toHaveLength(1);
  await page.evaluate(`document.querySelector('${box}').click()`);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(warning)})`);
  expect(page.problems).toEqual([]);
});
