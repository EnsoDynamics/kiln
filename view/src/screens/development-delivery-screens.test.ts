// The setting is additive to current schema-5 snapshots; historical restricted drawings remain unchanged.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
import EarlyMergeTarget from "../components/EarlyMergeTarget.svelte";
function page(enabled: boolean) {
  const snapshot=documentsFoundSnapshot();snapshot.settings.developmentDeployments={enabled,targets:[]};snapshot.repositories=snapshot.repositories.map(row=>({...row,github:"github.com/acme/acme-shop"}));
  return render(DocumentsFound,{props:{snapshot,config:{token:"fixture-token",base:"/customer-returns"},connected:true,now:Date.now()}}).body;
}
describe("current execution development setting",()=>{
  it("offers the new off-by-default option with its shared-environment risk",()=>{
    const html=page(false);expect(html).toContain("Allow early merges");expect(html).toContain("existing CI/CD may run before the PRD finishes");const option=html.match(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*Allow early merges(?:(?!<\/label>)[\s\S])*<\/label>/)?.[0];expect(option).toBeDefined();expect(option).not.toContain('checked=""');
  });
  it("identifies the actual repository and base branch for early merges",()=>{
    const html=page(true);expect(html).toContain("github.com/acme/acme-shop");expect(html).toContain("May merge into");expect(html).toContain("Early merges may happen on approved repository branches");expect(html).not.toContain("Never merge, deploy, or touch other branches");expect(html).toContain("Merge the delivery’s pull requests only when you press Merge with Claude Code on the finished page");expect(html).toContain("documents to develop only when you press Continue on the finished page");
  });
});

it("disables a grant action when its screen is disconnected", () => {
  const html = render(EarlyMergeTarget, { props: { name: "pricing", repository: "github.com/acme/pricing", branch: "develop", mode: "grant", disabled: true } }).body;
  expect(html.match(/<button\b[^>]*>/)?.[0]).toMatch(/\bdisabled(?:[\s=>])/);
});

it("summarizes a branch without a second permission checkbox", () => {
  const html = render(EarlyMergeTarget, { props: { name: "pricing", repository: "github.com/acme/pricing", branch: "develop", mode: "summary", disabled: false } }).body;
  expect(html).toContain("May merge into");
  expect(html).not.toMatch(/<input\b|<button\b/);
});

it("shows the complete earlier limited scope before selecting all repositories anew", () => {
  const snapshot = documentsFoundSnapshot();
  snapshot.repositories[0]!.github = "github.com/acme/pricing";
  snapshot.repositories[0]!.name = "pricing";
  snapshot.repositories[0]!.baseBranch = "develop";
  snapshot.repositories.push({ ...snapshot.repositories[0]!, name: "other", github: "github.com/acme/other" });
  snapshot.settings.developmentDeployments = { enabled: true, targets: ["dev-a", "dev-b"].map(environment => ({ target: { repository: "github.com/acme/pricing", baseBranch: "develop", environment }, confirmedNonProduction: true })) };
  const html = render(DocumentsFound, { props: { snapshot, config: { token: "fixture-token", base: "/customer-returns" }, connected: true, now: Date.now() } }).body;
  const section = html.split('aria-label="Early merges"')[1]!.split('</section>')[0]!;
  expect(section).toContain("keeps its earlier branch permissions");
  expect(section).toContain("dev-a, dev-b");
  expect(section).not.toContain('Early merges for other');
});

// AC-PERMIT-03: every new PRD reviews its own choices.
it("explains current-PRD scope without remember or reuse controls", () => {
  const html = page(false);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  expect(text).toContain("Applies to this PRD only. Each new PRD starts with early merges off.");
  expect(text).not.toMatch(/Remember these|Use these saved|Choices are saved locally/);
});

// AC-DISPLAY-01/02/03: exercise the actual screen boundary, not just snapshot helpers.
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { checkpointAgainst, type DeliveryCheckpoint } from "../../../src/state/development-delivery.js";
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
  expect(html).toContain("Early merges allowed");
  expect(html).toContain("github.com/acme/returns-api · develop · Existing scope: returns-api-dev");
  expect(html).toContain("Required checks and reviews still apply; the repository’s existing CI/CD may run before the PRD finishes");
  expect(html).not.toContain("never deploys or touches other branches");
  expect(html).toContain(multi ? "Required early merges may reach approved repository branches" : "approved early merges and any remaining review PRs target");
  // With early merges on, the merge and the plan push are still stated (Kiln After Delivery AC-MERGE-08).
  if (multi) expect(html).toContain("Remaining work stays open for review, and Kiln merges the delivery’s pull requests only when you press Merge with Claude Code on the finished page. In the PRD’s repository, it pushes this PRD’s documents to its base only when you press Continue there.");
  const restricted = words(runningPage(multi ? runningRepositoriesSnapshot() : runningSnapshot()));
  expect(restricted).not.toContain("Early merges allowed");
  expect(restricted).toContain(multi ? "never deploys or touches other branches" : "one PR into");
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
  expect(text).toContain("github.com/acme/returns-api · develop · returns-api-dev : 1 needs attention · latest #41 #41: Artifact verification failed: expected the deployed revision. Merge details (1)");
  expect(html).toMatch(/<details class="merge-details[^"]*"><summary[^>]*>[\s\S]*?Merge details \(1\)<\/summary>[\s\S]*Merge confirmed/);
  expect(html).toContain(`href="${mergeUrl}"`);
  expect(text).toContain("Source 123456789abc · Result abcdef123456");
  expect(text).toContain("deploy: planned / awaiting evidence");
  expect(text).not.toContain("deploy: observed");
  expect(text).toContain("deployment: success · returns-api-dev · abcdef123456");
  expect(text).toContain("verification: unresolved · returns-api-dev · abcdef123456");
  expect(text).toContain("Artifact verification failed: expected the deployed revision.");
  expect(text).toContain(screen === "waiting" ? "Waiting for usage" : screen === "needs you" ? "Needs you" : "Session ID");
});

describe("the early-merges summary line", () => {
  const summary = (snapshot: Snapshot) => words(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body).match(/returns-api-dev : [^]*?(?=Merge details)/)?.[0];
  /** A copy of the fixture checkpoint with its own id, source and merge number; merged and passing unless changed. */
  const another = (snapshot: Snapshot, id: string, number: number | undefined): DeliveryCheckpoint => {
    const base = structuredClone(snapshot.developmentDelivery!.checkpoints[0]!);
    const copy: DeliveryCheckpoint = { ...base, id, headSha: id.padEnd(40, "0"), evidence: base.evidence.map(fact => ({ ...fact, status: "success" as const })), operations: [] };
    delete copy.unresolvedReason;
    if (number === undefined) delete copy.merge; else copy.merge = { ...base.merge!, number, url: `https://github.com/acme/returns-api/pull/${number}`, resultSha: String(number).padEnd(40, "f") };
    return copy;
  };

  it("counts merges by outcome, leaves out a replaced merge, and links the latest", () => {
    const snapshot = enabled(needsYouMessageSnapshot());
    const delivery = snapshot.developmentDelivery!;
    const replaced = { ...another(snapshot, "replaced", undefined), unresolvedReason: "Pull request closed without merging.", supersededBy: "second" };
    const waiting = another(snapshot, "waiting", undefined);
    delivery.checkpoints = [another(snapshot, "first", 50), replaced, another(snapshot, "second", 51), waiting];
    expect(summary(snapshot)).toBe("returns-api-dev : 2 merged · 1 waiting to merge · latest #51 ");
  });

  it("counts an unmerged checkpoint whose merge and checks were all waived as waived, not as needing attention", () => {
    const snapshot = enabled(needsYouMessageSnapshot());
    const skipped = { ...another(snapshot, "skipped", undefined), evidence: [], unresolvedReason: "Workflow 42 finished unsuccessfully." };
    snapshot.developmentDelivery!.checkpoints = [skipped];
    const at = "2026-10-17T15:50:00Z";
    snapshot.waivers = ["requiredMerge", "deploy", "verify"].map(requirementId => ({ at, items: [{ kind: "development_requirement", subject: `skipped/${requirementId}`, against: checkpointAgainst(skipped) }] })) as unknown as Snapshot["waivers"];
    expect(summary(snapshot)).toBe("returns-api-dev : 1 waived ");
  });
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
  expect(text).toContain("Claude Code");
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
  expect(text).toContain("Claude Code");
  expect(text).toContain("Store credit");
  expect(text).toContain("customer-returns");
  expect(text).toContain("Kiln keeps the folder and its worktrees until you remove them");
});
