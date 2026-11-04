// AC-DISPLAY-01/02/03: built browser bundle + real Chrome + SSE under Kiln's CSP.
// Engine/Git correctness is proved separately; this test catches missing client-side rendering.
import { afterEach, expect, it } from "vitest";
import { completeRepositoriesSnapshot, runningRepositoriesSnapshot, RUNNING_NOW } from "../test-support/sample-snapshots.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
let chrome: HeadlessChrome | undefined;
let server: ViewFixtureServer | undefined;
afterEach(async () => { await chrome?.close(); await server?.close(); chrome = undefined; server = undefined; });

it("renders saved authority and observed activity, then distinct merged and review results from a live snapshot update", async () => {
  const running = runningRepositoriesSnapshot();
  const target = { repository: "github.com/acme/returns-api", baseBranch: "develop", environment: "returns-api-dev" };
  const sourceSha = "1".repeat(40); const resultSha = "2".repeat(40); const at = "2026-10-17T15:40:00Z";
  running.developmentDelivery = {
    executionId: "browser-display", phaseId: "2b", revision: 1,
    authorization: { revision: 1, enabled: true, grants: [{ target, source: "start", confirmedAt: at }] },
    assessments: [], splits: [], checkpoints: [], repositoryResults: [],
  };
  running.current!.deliveryActivity = { label: "Verifying", repository: target.repository, environment: target.environment };
  server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: running });
  chrome = await launchChrome();
  const page = await chrome.open(server.address, { clock: RUNNING_NOW, timeZone: "America/New_York" });
  await page.waitFor(`document.body.innerText.includes('Early merges allowed')`);
  const initial = await page.evaluate<string>("document.body.innerText");
  expect(initial).toContain("github.com/acme/returns-api · develop · Existing scope: returns-api-dev");
  expect(initial).toContain("Required checks and reviews still apply; the repository’s existing CI/CD may run before the PRD finishes");
  expect(initial).toMatch(/Verifying\s*· github\.com\/acme\/returns-api · returns-api-dev/);
  expect(initial).not.toContain("It never merges, deploys");

  const complete = completeRepositoriesSnapshot();
  complete.phases = complete.phases.filter(phase => phase.id !== "pr");
  complete.pullRequests = complete.pullRequests!.filter(pr => pr.repository === "storefront");
  const review = complete.pullRequests[0]!;
  const mergeUrl = "https://github.com/acme/returns-api/pull/41";
  complete.developmentDelivery = {
    ...structuredClone(running.developmentDelivery),
    checkpoints: [{
      id: "api-checkpoint", executionId: "browser-display", phaseId: "2b", target,
      featureBranch: "feature/customer-returns", headSha: sourceSha, baseSha: "0".repeat(40),
      criteria: ["AC-RET-01"], dependsOn: [], workflowSource: { path: "README.md", revision: sourceSha },
      requirements: [], requiredChecks: [], requireReview: false, createdAt: at, operations: [], evidence: [],
      merge: { number: 41, url: mergeUrl, sourceHead: sourceSha, mergedHead: sourceSha, resultSha, method: "squash", mergedAt: at },
    }],
    repositoryResults: [
      { repository: "returns-api", state: "delivered", deliveredCheckpointIds: ["api-checkpoint"], reasons: [] },
      { repository: "storefront", state: "review", deliveredCheckpointIds: [], reviewPullRequest: review, reasons: [] },
    ],
  };
  server.send("snapshot", complete);
  await page.waitFor(`document.body.innerText.includes('Development delivered; review remaining')`);
  const result = await page.evaluate<string>("document.body.innerText");
  expect(result).toContain("Merge confirmed");
  expect(result).toContain("returns-api: delivered");
  expect(result).toContain("storefront: review");
  expect(result).toContain("Review #218");
  expect(result).toContain("Remaining work ready for review");
  expect(result).toContain("Kiln keeps the folder and its worktrees until you remove them");
  expect(result).toContain(complete.settings.agent);
  expect(result).not.toContain("Finalize delivery");
  expect(result).not.toContain("Final pull request");
  const links = await page.evaluate<string[]>("[...document.querySelectorAll('a')].map(link => link.href)");
  expect(links).toContain(mergeUrl); expect(links).toContain(review.url);
  expect(page.problems).toEqual([]);
});
