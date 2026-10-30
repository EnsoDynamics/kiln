// Built browser UI: shared wording, mobile layout and inactive controls.
import { isPortFree } from "../state/instance-lock.js";
import { afterEach, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documentsFoundSnapshot, needsYouMessageSnapshot, RUNNING_NOW } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
let chrome: HeadlessChrome | undefined;
let server: ViewFixtureServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); chrome = undefined; server = undefined; });
it.each([390, 1280])("shows branch cards without environment inputs at %s pixels and disables grants while checking", async width => {
  const setup = documentsFoundSnapshot();
  setup.settings.developmentDeployments = { enabled: true, targets: [] };
  setup.repositories[0]!.github = "github.com/acme/pricing";
  setup.repositories[0]!.name = "pricing";
  setup.repositories[0]!.baseBranch = "develop";
  setup.repositories.push({ ...setup.repositories[0]!, name: "long-repository-name-".repeat(4), github: `github.com/example/${"long-repository-name-".repeat(4)}`, baseBranch: "development-integration-".repeat(4) });
  const unavailable = { ...setup.repositories[0]!, name: "unavailable", baseBranch: "" };
  delete unavailable.github;
  setup.repositories.push(unavailable);
  for (let port = 41960; port < 42000; port++) if (await isPortFree(port)) { server = await serveViewFixture({ port, folder: "customer-returns", snapshot: setup }); break; }
  if (!server) throw new Error("No local browser proof port available");
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { width, height: 900, clock: RUNNING_NOW });
  await page.waitFor(`document.querySelector('.merge-target h4')`);
  const words = await page.evaluate<string>(`document.querySelector('.delivery').innerText`);
  expect(words).toContain("Allow early merges");
  expect(words).toContain("May merge into pricing / develop");
  expect(await page.evaluate(`document.querySelectorAll('.delivery input[type=checkbox]').length`)).toBe(1);
  expect(await page.evaluate(`document.querySelector('.delivery input[type=text]') === null`)).toBe(true);
  expect(words).not.toContain("non-production");
  const capture = async (state: string) => {
    const layout = await page.evaluate<{ width: number; scroll: number; right: number }>(`(() => { const e=document.querySelector('.delivery');return {width:e.clientWidth,scroll:e.scrollWidth,right:e.getBoundingClientRect().right};})()`);
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.right).toBeLessThanOrEqual(width);
    const folder = process.env.KILN_SCREENSHOTS;
    if (folder) { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, `early-merges-${state}-${width}.png`), await page.screenshot()); }
  };
  expect(await page.evaluate(`document.querySelectorAll('.merge-target input').length`)).toBe(0);
  expect(words).toContain('Choose a base branch');
  await capture("setup");
  const stopped = needsYouMessageSnapshot();
  stopped.repositories = setup.repositories;
  stopped.developmentDelivery = { executionId: "layout", revision: 0, authorization: { revision: 0, enabled: false, grants: [] }, assessments: [], splits: [], checkpoints: [], repositoryResults: [] };
  server.send("snapshot", stopped);
  await page.waitFor(`document.querySelector('.merge-target button')`);
  expect(await page.evaluate(`document.querySelector('.merge-target button').disabled`)).toBe(false);
  expect(await page.evaluate(`document.querySelector('.merge-target h4').textContent`)).toBe("Allow merging into pricing / develop");
  expect(await page.evaluate(`document.querySelectorAll('.delivery input').length`)).toBe(0);
  expect(await page.evaluate(`document.querySelector('.merge-target:last-child button').disabled`)).toBe(true);
  await capture("needs-you");
  stopped.needsYou!.checking = true; server.send("snapshot", stopped);
  await page.waitFor(`document.querySelector('.merge-target button').disabled`);
  expect(page.problems).toEqual([]);
});
