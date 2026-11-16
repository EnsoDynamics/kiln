// The preflight stop's two controls pressed in real Chrome, from the built view under Kiln's
// Content Security Policy, against a real engine, Git and the stand-in claude (Kiln Build
// Preflight PRD, AC-PREFLIGHT-03): Check Preflight again runs a fresh preflight session whose
// report is read as the first was, and Mark complete sends the offer's check run and goes on.
import { writeFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness | undefined; let chrome: HeadlessChrome | undefined; let server: LocalServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); await h?.cleanup(); chrome = undefined; server = undefined; h = undefined; });

const report = (headline: string, items: string[]) => ({ actions: [{ skill: "enso-method:build-preflight" }, { result: `${headline}\n\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}` }, { exit: 0 }] });
const button = (label: string) => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;

it("Check Preflight again runs a fresh preflight whose new items replace the old, and Mark complete marks it complete with the offer's check run and goes on to Phase 1", { timeout: 120_000 }, async () => {
  const sessions = [landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];
  h = await createHarness({ sessions, preflight: true });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, preflightSessions: [report("Preflight: 1 item needs you", ["Run `aws sso login --profile app-dev`."]), report("Preflight: 1 item needs you", ["Phase 3 needs the vendor's API key."])] }));
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (read.ok) h.engine.record.plan = recordedPlan(read.plan);
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  const key = h.engine.preflightStopKey()!;
  expect(key).toMatch(/^preflight-/);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address);
  await page.waitFor(`document.body.innerText.includes("aws sso login --profile app-dev")`, 20_000);
  // No Reply box and no Resume on the page.
  expect(await page.evaluate<boolean>(`document.querySelector("textarea") === null && ${button("Resume")} === undefined`)).toBe(true);

  await page.waitFor(`${button("Check Preflight again")} && !${button("Check Preflight again")}.disabled`);
  await page.evaluate(`${button("Check Preflight again")}.click()`);
  await waitFor(() => (h!.engine.record.phases[key]?.sessionIds.length ?? 0) === 2);
  await h.engine.settled();
  expect(h.engine.preflightStopKey()).toBe(key);
  expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "items", items: ["Phase 3 needs the vendor's API key."] });
  await page.waitFor(`document.body.innerText.includes("Phase 3 needs the vendor's API key.") && !document.body.innerText.includes("aws sso login")`, 20_000);

  const offer = h.engine.markCompleteOffer();
  if (!offer.offered) throw new Error(offer.reason);
  await page.waitFor(`${button("Mark complete")} && !${button("Mark complete")}.disabled`);
  await page.evaluate(`${button("Mark complete")}.click()`);
  await waitFor(() => h!.engine.record.phases[key]?.waiverId !== undefined);
  const waiver = h.engine.record.waivers!.find(one => one.waiverId === h!.engine.record.phases[key]!.waiverId)!;
  expect(waiver).toMatchObject({ activityKey: key, activityKind: "preflight", effect: "completed", source: { via: "browser" } });
  expect(waiver.items.map(item => item.text)).toEqual(["Phase 3 needs the vendor's API key."]);
  // A page that sends any other check run is refused as stale, so the saved waiver shows it sent the offer's.
  expect(h.engine.commands.all().filter(one => one.state === "refused")).toEqual([]);
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeDefined();
  expect(page.problems).toEqual([]);
});
