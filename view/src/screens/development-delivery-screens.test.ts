// The setting is additive to current schema-5 snapshots; historical restricted drawings remain unchanged.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
function page(enabled: boolean) {
  const snapshot=documentsFoundSnapshot();snapshot.settings.developmentDeployments={enabled,targets:[]};snapshot.repositories=snapshot.repositories.map(row=>({...row,github:"github.com/acme/acme-shop"}));
  return render(DocumentsFound,{props:{snapshot,config:{token:"fixture-token",base:"/customer-returns"},connected:true,now:Date.now()}}).body;
}
describe("current execution development setting",()=>{
  it("offers the new off-by-default option with its shared-environment risk",()=>{
    const html=page(false);expect(html).toContain("Allow development deployments");expect(html).toContain("shared development environments before the PRD finishes");const option=html.match(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*Allow development deployments(?:(?!<\/label>)[\s\S])*<\/label>/)?.[0];expect(option).toBeDefined();expect(option).not.toContain('checked=""');
  });
  it("identifies actual repository/base and demands an explicit non-production target",()=>{
    const html=page(true);expect(html).toContain("github.com/acme/acme-shop");expect(html).toContain("Approve a target in this repository");expect(html).toContain("Required checkpoint delivery may happen on approved targets");expect(html).not.toContain("Never merge, deploy, or touch other branches");
  });
});

// AC-DISPLAY-01/02/03: exercise the actual screen boundary, not just snapshot helpers.
import type { Snapshot } from "../../../src/engine/snapshot.js";
import type { DeliveryCheckpoint } from "../../../src/state/development-delivery.js";
import { completeRepositoriesSnapshot, completeSnapshot, needsYouMessageSnapshot, runningRepositoriesSnapshot, runningSnapshot, waitingSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";
import NeedsYou from "./NeedsYou.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import Running from "./Running.svelte";
import Waiting from "./Waiting.svelte";

const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const sourceSha = "123456789abc" + "1".repeat(28);
const resultSha = "abcdef123456" + "2".repeat(28);
const target = { repository: "github.com/acme/returns-api", baseBranch: "develop", environment: "returns-api-dev" };
const observedAt = "2026-10-17T15:40:00Z";
const mergeUrl = "https://github.com/acme/returns-api/pull/41";
function enabled(snapshot: Snapshot): Snapshot {
  const source = { path: "README.md", revision: sourceSha };
  const checkpoint: DeliveryCheckpoint = {
    id: "api-checkpoint", executionId: "display-execution", phaseId: "2b", target,
    featureBranch: "feature/customer-returns", headSha: sourceSha, baseSha: "0".repeat(40),
    criteria: ["AC-RET-01"], dependsOn: [], workflowSource: source, requiredChecks: [], requireReview: false, createdAt: observedAt,
    requirements: [
      { id: "deploy", purpose: "deployment", source, match: { kind: "github_deployment" } },
      { id: "verify", purpose: "verification", source, match: { kind: "github_workflow", path: ".github/workflows/deploy.yml", jobs: ["verify"], deploymentJob: "deploy", attempt: 1 } },
    ],
    operations: [{ id: "deploy-intent", kind: "deploy", state: "prepared", preparedAt: observedAt, references: [] }],
    merge: { number: 41, url: mergeUrl, sourceHead: sourceSha, mergedHead: sourceSha, resultSha, method: "squash", mergedAt: observedAt },
    evidence: [
      { requirementId: "deploy", reference: { requirementId: "deploy", kind: "github_deployment", id: "11" }, revision: resultSha, environment: target.environment, observedAt, occurredAt: observedAt, status: "success", rawDigest: "a".repeat(64), rawPath: "/private/display/deploy.json" },
      { requirementId: "verify", reference: { requirementId: "verify", kind: "github_workflow", id: "21" }, revision: resultSha, environment: target.environment, observedAt, occurredAt: observedAt, status: "unresolved", rawDigest: "b".repeat(64), rawPath: "/private/display/verify.json" },
    ],
    unresolvedReason: "Artifact verification failed: expected the deployed revision.",
  };
  snapshot.developmentDelivery = {
    executionId: "display-execution", phaseId: "2b", revision: 3,
    authorization: { revision: 1, enabled: true, grants: [{ target, confirmedAt: observedAt, source: "start" }] },
    assessments: [], checkpoints: [checkpoint], splits: [], repositoryResults: [], checkedAt: observedAt,
  };
  return snapshot;
}
const runningPage = (snapshot: Snapshot) => render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body;
const completePage = (snapshot: Snapshot) => render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body;

it.each([false, true])("shows exact saved authority in ongoing settings for multi-repository=%s without the restricted prohibition", multi => {
  const snapshot = enabled(multi ? runningRepositoriesSnapshot() : runningSnapshot());
  const html = words(runningPage(snapshot));
  expect(html).toContain("Development deployments allowed");
  expect(html).toContain("github.com/acme/returns-api · develop · returns-api-dev");
  expect(html).toContain("Changes may reach these shared environments before the PRD finishes");
  expect(html).not.toContain("never merges, deploys");
  expect(html).toContain(multi ? "Required development work may merge and deploy to approved targets" : "approved development deliveries and any remaining review PRs target");
  const restricted = words(runningPage(multi ? runningRepositoriesSnapshot() : runningSnapshot()));
  expect(restricted).not.toContain("Development deployments allowed");
  expect(restricted).toContain(multi ? "It never merges, deploys, or touches other branches" : "one PR into");
});

it.each(["Merging", "Deploying", "Verifying", "Implementing"])("renders observed %s activity independently of historical Push and Follow-up", label => {
  const snapshot = enabled(runningSnapshot());
  snapshot.current!.deliveryActivity = label === "Implementing" ? { label } : { label, repository: target.repository, environment: target.environment };
  snapshot.current!.followUp = true;
  snapshot.current!.steps = snapshot.current!.steps.map(step => ({ ...step, state: "finished" }));
  const html = runningPage(snapshot);
  const activity = html.match(/<p class="seen-text[^>]*>([\s\S]*?)<\/p>/)?.[1];
  expect(activity && words(activity)).toBe(label === "Implementing" ? label : `${label} · github.com/acme/returns-api · returns-api-dev`);
  const text = words(html);
  expect(text).toContain("Follow-up");
  expect(text).toContain("Push");
  expect(text).toContain("Started");
  expect(text).toContain("Store credit");
});

it.each(["phase detail", "needs you", "waiting"])("retains distinct pending, merged and verification outcomes in %s", screen => {
  const snapshot = enabled(screen === "needs you" ? needsYouMessageSnapshot() : screen === "waiting" ? waitingSnapshot() : runningSnapshot());
  const html = screen === "phase detail"
    ? render(PhaseDetail, { props: { snapshot, phaseId: "2b", connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body
    : screen === "needs you"
      ? render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body
      : render(Waiting, { props: { snapshot, now: RUNNING_NOW } }).body;
  const text = words(html);
  expect(text).toContain("github.com/acme/returns-api · returns-api-dev");
  expect(text).toContain("Merge confirmed");
  expect(html).toContain(`href="${mergeUrl}"`);
  expect(text).toContain("Source 123456789abc · Result abcdef123456");
  expect(text).toContain("deploy: planned / awaiting evidence");
  expect(text).not.toContain("deploy: observed");
  expect(text).toContain("deployment: success · returns-api-dev · abcdef123456");
  expect(text).toContain("verification: unresolved · returns-api-dev · abcdef123456");
  expect(text).toContain("Artifact verification failed: expected the deployed revision.");
  expect(text).toContain(screen === "waiting" ? "Waiting for usage" : screen === "needs you" ? "Needs you" : "Session ID");
});

function delivered(snapshot: Snapshot): Snapshot {
  enabled(snapshot);
  const checkpoint = snapshot.developmentDelivery!.checkpoints[0]!;
  delete checkpoint.unresolvedReason;
  checkpoint.operations = [];
  checkpoint.evidence = checkpoint.evidence.map(fact => ({ ...fact, status: "success" }));
  snapshot.developmentDelivery!.repositoryResults = [{ repository: "returns-api", state: "delivered", deliveredCheckpointIds: [checkpoint.id], reasons: [] }];
  return snapshot;
}

it("renders all-delivered completion without an invented final session or review PR, retaining identity and work history", () => {
  const snapshot = delivered(completeSnapshot());
  snapshot.phases = snapshot.phases.filter(phase => phase.id !== "pr");
  snapshot.pullRequests = [];
  const html = completePage(snapshot); const text = words(html);
  expect(text).toContain("Development delivered");
  expect(text).toContain("returns-api: delivered");
  expect(html).toContain(`href="${mergeUrl}"`);
  expect(text).toContain("Merge confirmed");
  expect(text).not.toContain("Ready for review");
  expect(text).not.toContain("Final pull request");
  expect(text).not.toContain("Finalize delivery");
  expect(text).toContain(snapshot.settings.agent);
  expect(text).toContain("Store credit");
  expect(text).toContain(snapshot.settings.worktreePath);
  expect(text).toContain("Kiln keeps it until you remove it");
});

it("renders mixed repositories with separate historical merges and current review links and a real finalization row", () => {
  const snapshot = delivered(completeRepositoriesSnapshot());
  const api = snapshot.pullRequests!.find(pr => pr.repository === "returns-api")!;
  const web = snapshot.pullRequests!.find(pr => pr.repository === "storefront")!;
  snapshot.pullRequests = [api, web];
  snapshot.phases.find(phase => phase.id === "pr")!.title = "Finalize delivery";
  snapshot.developmentDelivery!.repositoryResults = [
    { repository: "returns-api", state: "mixed", deliveredCheckpointIds: ["api-checkpoint"], reviewPullRequest: api, reasons: [] },
    { repository: "storefront", state: "review", deliveredCheckpointIds: [], reviewPullRequest: web, reasons: [] },
  ];
  const html = completePage(snapshot); const text = words(html);
  expect(text).toContain("Development delivered; review remaining");
  expect(text).toContain("returns-api: mixed");
  expect(text).toContain("storefront: review");
  expect(text).toContain("Merge confirmed");
  expect(text).toContain("Review #57");
  expect(text).toContain("Review #218");
  for (const url of [mergeUrl, api.url, web.url]) expect(html).toContain(`href="${url}"`);
  expect(text).toContain("Remaining work ready for review");
  expect(text).toContain("Finalize delivery");
  expect(text).not.toContain("Final pull request");
  expect(text).toContain(snapshot.settings.agent);
  expect(text).toContain("Store credit");
  expect(text).toContain("customer-returns");
  expect(text).toContain("Kiln keeps the folder and its worktrees until you remove them");
});
