import { readFileSync, writeFileSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { observePlan, readBaseline, readLinkedDocuments, retainBaseline, BASELINE_LIMIT, PLAN_LIMIT, PHASE_LIMIT, PlanCapacityError } from "./plan-reconciliation.js";
import { readGitPlan } from "./completed-plan-sources.js";
import * as gitReads from "./git-reads.js";
import type { CompletedPlanCheck } from "./completed-plan-discovery.js";
import { recordedPlan } from "./plan-reading.js";
import { buildSnapshot } from "./snapshot.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { writePrdRecord } from "../state/records.js";
import { statusProjection } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { lastCheckedLine } from "./new-phases-wording.js";
let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const folder = "comet-library"; const directory = `docs/prds/${folder}`;
const phase = "# Phase 1: Catalog\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-COMET-01\n";
const newPhase = "# Phase 9: Lending\n\n## Acceptance criteria covered\nAC-COMET-01\n\n## Phase dependencies\n1.\n";
async function fixture(retained = true, phaseDocument = phase) {
  h = await createHarness({ folder, auditCycles: true, sessions: [], logGit: true, files: { "comet-prd.md": "# PRD: Comet\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n", "comet-technical-design.md": "# Design\nCatalog.\n", "phase-1-catalog.md": phaseDocument } });
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git");
  git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  const source = observePlan(h.repository, directory); const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.repositories = [{ name: "acme-shop", kind: "prd", mainCheckoutPath: h.repository, github: "acme/acme-shop", baseBranch: "develop", worktreePath: join(h.sandbox.root, "old-workspace"), baseCommit: revision, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  h.engine.record.setupCompletedAt = "2026-10-01T10:00:00Z";
  h.engine.record.startedAt = "2026-10-01T10:00:00Z";
  h.engine.record.completedAt = "2026-10-01T12:00:00Z";
  h.engine.record.plan = recordedPlan(source.plan);
  h.engine.record.phases["1"] = { doneAt: "2026-10-01T11:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  h.engine.record.phases.pr = { doneAt: "2026-10-01T12:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  if (retained) h.engine.record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: directory, active: source, sources: [], completions: { "1": { kind: "external", revision } } }).id };
  h.engine.record.pullRequests = [{ repository: "acme-shop", number: 12, title: "Comet catalog delivered", url: "https://github.com/acme/acme-shop/pull/12", head: "feature/comet-library", base: "develop", commits: 2, additions: 20, deletions: 0 }];
  // GitHub shows the delivery merged, its merge commit in develop.
  pullRequest("merged", revision);
  writePrdRecord(h.stateDirectory, h.engine.record);
}
const pullRequest = (state: "open" | "closed" | "merged", mergeCommit?: string) => h.setPullRequestViews({ "acme/acme-shop#12": recordedPullRequest(state, { number: 12, base: "develop", url: "https://github.com/acme/acme-shop/pull/12", ...(mergeCommit ? { mergeCommit } : {}) }) });
const add = () => writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase);
function publish() { git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): extend plan"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop"); }
it("checks restart, HTTP and repeated reads without work; persists history and joins concurrent requests", async () => {
  await fixture(); const completed = h.engine.record.completedAt; const baseline = h.engine.record.planReconciliation!.baselineId;
  expect(await h.engine.prepare()).toEqual({ ok: true });
  expect(h.engine.record.completedPlanCheck?.status).toBe("unchanged");
  // A phase written but not committed is named as not read, never offered (AC-BACK-03).
  add(); const first = h.engine.checkCompletedPlan(); expect(h.engine.checkCompletedPlan()).toBe(first);
  const check = await first;
  expect(check.status).toBe("unchanged"); expect(check.result?.added).toEqual([]);
  expect(check.result?.uncommitted).toEqual([`${directory}/phase-9-lending.md`]);
  expect(h.engine.record.completedAt).toBe(completed); expect(h.engine.record.planReconciliation?.baselineId).toBe(baseline);
  expect(h.engine.record.plan?.map(p => p.id)).toEqual(["1"]);
  publish();
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const response = await fetch(`${new URL(server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ check: { status: "available", result: { added: [{ id: "9" }] } } });
  expect(buildSnapshot(h.engine).continuation?.check?.result?.source).toEqual({ kind: "remote_base", branch: "develop", revision: git(h.sandbox, h.repository, "rev-parse", "HEAD").trim() });
  // kiln status reports the same offer, with the proposal ID continue-with-phases takes (Kiln Deliver When Audit Loops Run Out AC-BOT-02).
  const offered = h.engine.record.completedPlanCheck!;
  const status = statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine) as unknown as { continuation: unknown };
  expect(status.continuation).toMatchObject({ check: { status: "available", attemptedAt: offered.attemptedAt, lastSuccessfulAt: offered.lastSuccessfulAt ?? null, errors: [] }, summary: expect.stringMatching(/^1 phase was added to this PRD after Kiln finished it: 9, in commit [0-9a-f]{7} “test\(comet\): extend plan” on origin\/develop \(.+\)\. Run kiln continue-with-phases to build it\.$/), answer: { source: { kind: "remote_base", branch: "develop" }, notRead: null, uncommitted: [], origin: { kind: "commit", subject: "test(comet): extend plan" }, phases: [{ id: "9", title: "Lending" }] }, proposal: { id: offered.result!.proposal!.id, readiness: offered.result!.proposal!.readiness, phases: [{ id: "9", title: "Lending" }], problems: offered.result!.proposal!.problems } });
  expect(h.claudeCalls()).toEqual([]);
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|worktree add|merge|push)(?: |$)/.test(call))).toBe(false);
  expect(h.reopenFromDisk().record.completedPlanCheck?.status).toBe("available");
});
it("retains a baseline whose saved form exceeds one plan's limit", async () => {
  // A large but valid plan: its documents fit PLAN_LIMIT; JSON escaping doubles each quote in the retained copy.
  await fixture(); add();
  writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "<!--" + "\"".repeat(5 * 1024 * 1024) + "-->\n"); publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check.errors).toEqual([]); expect(check.status).toBe("available"); expect(check.result?.added.map(p => p.id)).toEqual(["9"]);
  expect(statSync(join(h.stateDirectory, "plans", `${check.result!.candidateId}.json`)).size).toBeGreaterThan(PLAN_LIMIT);
});
it("reads the remote base when the main checkout is on another branch, names uncommitted documents and never reports a changed plan (AC-BACK-03)", async () => {
  await fixture(); const original = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim(); add(); publish();
  git(h.sandbox, h.repository, "checkout", "--detach", original);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { source: { kind: "remote_base" }, notRead: { reason: "other_branch", branch: "a detached HEAD" }, added: [{ id: "9" }] } });
  git(h.sandbox, h.repository, "checkout", "-qb", "feature/gift-cards");
  writeFileSync(join(h.repository, directory, "phase-10-other.md"), newPhase.replace("Phase 9: Lending", "Phase 10: Reservations"));
  writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "# Design\nEdited, not committed.\n");
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "remote_base", branch: "develop" }, notRead: { reason: "other_branch", branch: "feature/gift-cards" }, added: [{ id: "9" }], uncommitted: [`${directory}/comet-technical-design.md`, `${directory}/phase-10-other.md`] } });
  const output = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}));
  expect(output).toContain("The main checkout is on feature/gift-cards, so Kiln read the plan from origin/develop only.");
  expect(output).toContain("comet-technical-design.md and phase-10-other.md have edits in your main checkout that aren’t committed. Kiln didn’t read them.");
  expect(output).not.toContain("Plan needs reconciliation");
});
it("never reads another worktree of the repository, even one holding a committed added phase (AC-BACK-03)", async () => {
  await fixture(); add(); publish();
  // A linked worktree on another branch, holding a committed phase 11 that no named place has.
  const other = join(h.sandbox.root, "gift-cards-worktree");
  git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", "feature/gift-cards", other);
  writeFileSync(join(other, directory, "phase-11-holds.md"), newPhase.replace("Phase 9: Lending", "Phase 11: Holds"));
  git(h.sandbox, other, "add", directory); git(h.sandbox, other, "commit", "-qm", "docs(comet): add holds");
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "remote_base", branch: "develop" } } });
  // Read from the main checkout's own branch, never the linked worktree's.
  expect(check.result?.notRead ?? null).toBeNull();
  expect(check.result?.added.map(one => one.id)).toEqual(["9"]);
  expect(check.result?.uncommitted ?? []).toEqual([]);
  expect(JSON.stringify(check.result)).not.toContain("phase-11-holds");
});
it("keeps Plan needs reconciliation off a finished run, even with a failed reconciliation check saved (AC-BACK-01)", async () => {
  await fixture();
  h.engine.record.planReconciliation!.check = { status: "failed", attemptedAt: "2026-10-01T12:30:00Z", problem: "Phase 1's document changed after it closed." };
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged" });
  expect(buildSnapshot(h.engine).continuation?.planCheck).toBeUndefined();
  expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))).not.toContain("Plan needs reconciliation");
});
it("reads the main checkout's committed plan only when it holds unfinished phases the remote base lacks (AC-BACK-03, AC-BACK-04)", async () => {
  await fixture();
  // Ahead with a commit that adds no unfinished phase: the remote base is read.
  writeFileSync(join(h.repository, "notes.txt"), "local\n"); git(h.sandbox, h.repository, "add", "notes.txt"); git(h.sandbox, h.repository, "commit", "-qm", "chore: local note");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged", result: { source: { kind: "remote_base" } } });
  // Behind the remote base: the remote base is read, whatever the checkout lacks.
  const behind = git(h.sandbox, h.repository, "rev-parse", "HEAD~1").trim();
  add(); git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): extend plan");
  const tip = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "main_checkout", branch: "develop", revision: tip }, origin: { kind: "unpushed" }, added: [{ id: "9" }] } });
  expect(check.result?.proposal?.source).toEqual({ kind: "main_checkout", branch: "develop", revision: tip });
  expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))).toContain("1 phase was added to this PRD after Kiln finished it: 9, committed on this machine's develop and not pushed; Continue pushes them first.");
  // The offer lists the commits Continue's push session pushes, each marked as touching only this PRD's documents or not (plan-push.integration.test.ts drives the push itself).
  expect(check.result?.proposal?.commits).toEqual([{ sha: git(h.sandbox, h.repository, "rev-parse", "HEAD~1").trim(), subject: "chore: local note", onlyDocuments: false }, { sha: tip, subject: "test(comet): extend plan", onlyDocuments: true }]);
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { source: { kind: "remote_base", revision: tip }, origin: { kind: "commit", revision: tip } } });
  git(h.sandbox, h.repository, "reset", "-q", "--hard", behind);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { source: { kind: "remote_base", revision: tip }, added: [{ id: "9" }] } });
  expect(h.claudeCalls()).toEqual([]);
});
it("reads the remote base for a diverged main checkout, and finds phases only the remote base holds once they are pushed (AC-BACK-03)", async () => {
  await fixture();
  // Someone else pushes to develop from a second clone; this machine's develop holds a different, non-document commit.
  const elsewhere = join(h.sandbox.root, "elsewhere");
  git(h.sandbox, h.sandbox.root, "clone", "-q", "-b", "develop", h.origin, elsewhere);
  writeFileSync(join(elsewhere, "remote.txt"), "remote\n"); git(h.sandbox, elsewhere, "add", "-A"); git(h.sandbox, elsewhere, "commit", "-qm", "chore: remote note"); git(h.sandbox, elsewhere, "push", "-q", "origin", "develop");
  const remoteTip = git(h.sandbox, elsewhere, "rev-parse", "HEAD").trim();
  writeFileSync(join(h.repository, "notes.txt"), "local\n"); git(h.sandbox, h.repository, "add", "notes.txt"); git(h.sandbox, h.repository, "commit", "-qm", "chore: local note");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged", result: { source: { kind: "remote_base", branch: "develop", revision: remoteTip }, added: [] } });
  // Phase 10 reaches origin from the second clone; this machine then commits phase 9 without pulling.
  writeFileSync(join(elsewhere, directory, "phase-10-reservations.md"), "# Phase 10: Reservations\n\n## Acceptance criteria covered\nAC-COMET-01\n\n## Phase dependencies\n1.\n");
  git(h.sandbox, elsewhere, "add", "-A"); git(h.sandbox, elsewhere, "commit", "-qm", "docs(comet): add reservations"); git(h.sandbox, elsewhere, "push", "-q", "origin", "develop");
  add(); git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "docs(comet): add lending");
  const tip = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const check = await h.engine.checkCompletedPlan();
  // The main checkout's committed copy is read: phase 9 alone, phase 10 waits for Continue's push.
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "main_checkout", branch: "develop", revision: tip } } });
  expect(check.result!.added.map(p => p.id)).toEqual(["9"]);
  expect(h.claudeCalls()).toEqual([]);
});
it("fails the check when the main checkout is not at its path, and reads a fresh clone of the same repository there (AC-BACK-03)", async () => {
  await fixture(); add(); publish();
  // An offer that Continue could build, before the checkout moves.
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.engine.newPhaseControls().find(control => control.name === "continue-with-phases")?.available).toBe(true);
  const moved = join(h.sandbox.root, "moved-checkout");
  renameSync(h.repository, moved);
  const nothing = await h.engine.checkCompletedPlan();
  expect(nothing).toMatchObject({ status: "failed", errors: [`Kiln could not find the main checkout at ${h.engine.record.repository.mainCheckoutPath}: nothing is there. Put it back at that path, then check for new phases again.`] });
  expect(h.engine.newPhaseControls().find(control => control.name === "continue-with-phases")?.available).toBe(false);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(h.repository);
  expect((await h.engine.checkCompletedPlan()).errors[0]).toContain(": a folder that is not a Git repository is there.");
  rmSync(h.repository, { recursive: true });
  const { createRepository, createGithubOrigin } = await import("../test-support/git-repositories.js");
  const other = createGithubOrigin(h.sandbox, "fictional", "other-shop");
  const otherClone = createRepository(h.sandbox, "other-shop", other.url);
  renameSync(otherClone, h.repository);
  expect((await h.engine.checkCompletedPlan()).errors[0]).toContain(": a clone of fictional/other-shop is there.");
  rmSync(h.repository, { recursive: true });
  // A plain folder that now sits inside another repository.
  mkdirSync(h.repository); git(h.sandbox, h.sandbox.root, "init", "-q");
  try { expect((await h.engine.checkCompletedPlan()).errors[0]).toContain(`: a folder inside the repository at ${h.sandbox.root} is there.`); }
  finally { rmSync(join(h.sandbox.root, ".git"), { recursive: true }); rmSync(h.repository, { recursive: true }); }
  // A fresh clone of the same repository at the path reads like the original.
  git(h.sandbox, h.sandbox.root, "clone", "-q", "-b", "develop", h.origin, h.repository);
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git");
  git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  // Continue is available again once the checkout is back and the check succeeded.
  expect(h.engine.newPhaseControls().find(control => control.name === "continue-with-phases")?.available).toBe(true);
  expect(h.claudeCalls()).toEqual([]);
});
it("preserves an earlier successful result after invalid plans and a checkout whose origin changed", async () => {
  await fixture(); add(); publish(); const success = await h.engine.checkCompletedPlan();
  git(h.sandbox, h.repository, "mv", join(directory, "comet-technical-design.md"), join(directory, "hidden.md")); publish();
  const missing = await h.engine.checkCompletedPlan();
  expect(missing).toMatchObject({ status: "failed", lastSuccessfulAt: success.lastSuccessfulAt, earlierResult: { added: [{ id: "9" }] } }); expect(missing.result).toBeUndefined();
  git(h.sandbox, h.repository, "mv", join(directory, "hidden.md"), join(directory, "comet-technical-design.md"));
  writeFileSync(join(h.repository, directory, "phase-9-duplicate.md"), newPhase); publish();
  expect((await h.engine.checkCompletedPlan()).errors.join(" ")).toContain("both have phase id");
  git(h.sandbox, h.repository, "rm", "-q", join(directory, "phase-9-duplicate.md")); publish();
  git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "missing-origin"));
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", earlierResult: { added: [{ id: "9" }] }, errors: [expect.stringContaining("Kiln could not find the main checkout")] });
});
it("rejects a delivery base that moves during an actual Git read and retains the earlier result", async () => {
  await fixture(); add(); publish();
  const success = await h.engine.checkCompletedPlan();
  const original = gitReads.runGit;
  let changed = false;
  const read = vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => {
    const result = await original(...args);
    // Deterministic scheduling only: every Git result still comes from the real repo.
    if (!changed && args[2].join(" ") === "rev-parse HEAD") {
      changed = true;
      writeFileSync(join(h.repository, "moved.txt"), "moved\n"); git(h.sandbox, h.repository, "add", "moved.txt"); git(h.sandbox, h.repository, "commit", "-qm", "chore: move base"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    }
    return result;
  });
  try {
    expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", lastSuccessfulAt: success.lastSuccessfulAt, earlierResult: success.result, errors: ["The delivery base changed during this check. Check for new phases again."] });
    expect(h.engine.record.completedPlanCheck?.result).toBeUndefined();
    expect(changed).toBe(true);
    expect(h.claudeCalls()).toEqual([]);
  } finally { read.mockRestore(); }
});
it("keeps a finished phase finished whatever later happens to its document, and offers every unfinished phase beneath it (AC-BACK-01)", async () => {
  await fixture(); const file = join(h.repository, directory, "phase-1-catalog.md");
  for (const content of [phase.replace("**Closed:** 2026-10-01", ""), phase.replace("Catalog", "Different work"), phase + "\nChanged implementation scope.\n"]) {
    writeFileSync(file, content); publish();
    const check = await h.engine.checkCompletedPlan();
    expect(check).toMatchObject({ status: "unchanged", errors: [], result: { added: [] } });
    expect(JSON.stringify(check)).not.toContain("reconcil");
    // No problem and no list of differing documents on any surface (AC-BACK-01).
    expect(check.result?.proposal?.problems ?? []).toEqual([]);
    for (const surface of [JSON.stringify(check), JSON.stringify(buildSnapshot(h.engine)), formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))]) {
      expect(surface).not.toMatch(/materially changed|previously completed scope|reconcil/i);
    }
  }
  // A finished leaf given children after the run finished stays finished, and every child is offered, the first one included.
  writeFileSync(file, "# Phase 1: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n| [1b](phase-1b-catalog.md) | Shelving |\n");
  writeFileSync(join(h.repository, directory, "phase-1a-catalog.md"), newPhase.replace("Phase 9: Lending", "Phase 1a: Catalog fix").replace("1.", "None."));
  writeFileSync(join(h.repository, directory, "phase-1b-catalog.md"), newPhase.replace("Phase 9: Lending", "Phase 1b: Shelving").replace("1.", "None."));
  publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "1a" }, { id: "1b" }], problems: [] } });
  rmSync(join(h.repository, directory, "phase-1a-catalog.md")); rmSync(join(h.repository, directory, "phase-1b-catalog.md"));
  // A renamed or removed finished document adds nothing and is not reported.
  writeFileSync(file, phase.replace("Catalog", "**Catalog**"));
  renameSync(file, join(h.repository, directory, "phase-1-renamed.md")); git(h.sandbox, h.repository, "add", "-A", directory); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged", result: { added: [] } });
  rmSync(join(h.repository, directory, "phase-1-renamed.md")); add();
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase.replace("1.", "None.")); git(h.sandbox, h.repository, "add", "-A", directory); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))).not.toContain("Plan needs reconciliation");
  expect(h.claudeCalls()).toEqual([]);
});
it("recovers legacy scope only from recorded immutable completion and survives deletion of old workspace and branch", async () => {
  await fixture(false);
  const old = join(h.sandbox.root, "old-workspace"); git(h.sandbox, h.repository, "worktree", "add", "-b", "old-delivery", old);
  h.engine.record.settings.worktreePath = old;
  git(h.sandbox, h.repository, "worktree", "remove", old); git(h.sandbox, h.repository, "branch", "-d", "old-delivery");
  add(); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.engine.record.planReconciliation?.baselineId).toMatch(/^[a-f0-9]{64}$/);
  expect(h.claudeCalls()).toEqual([]);
});
it("recovers legacy scope for a record saved before Kiln read the Attended and Early merge lines (build preflight AC-ATTEND-04)", async () => {
  await fixture(false, "# Phase 1: Catalog\n\n**Closed:** 2026-10-01\n**Early merge:** develop, for AC-COMET-01\n**Attended:** Approve the catalog feed in the vendor console.\n\n## Acceptance criteria covered\nAC-COMET-01\n");
  // A schema-21 Kiln saved the plan without the display-only fields.
  expect(h.engine.record.plan![0]).toMatchObject({ earlyMerge: "develop, for AC-COMET-01", attended: "Approve the catalog feed in the vendor console." });
  h.engine.record.plan = h.engine.record.plan!.map(({ id, title, file, closed, repositories }) => ({ id, title, file, closed, repositories }));
  writePrdRecord(h.stateDirectory, h.engine.record);
  add(); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.claudeCalls()).toEqual([]);
});
it("recovers nested split completion using the original parent's receipt", async () => {
  await fixture(false);
  writeFileSync(join(h.repository, directory, "phase-1-catalog.md"), "# Phase 1: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n");
  writeFileSync(join(h.repository, directory, "phase-1a-catalog.md"), "# Phase 1a: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a1](phase-1a1-catalog.md) | Catalog |\n");
  writeFileSync(join(h.repository, directory, "phase-1a1-catalog.md"), phase.replace("Phase 1:", "Phase 1a1:"));
  publish();
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.plan = recordedPlan(observePlan(h.repository, directory).plan);
  h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha = revision;
  // The original parent session closed its first descendant at this revision.
  h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha = revision;
  add(); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.claudeCalls()).toEqual([]);
});
it("does not establish legacy scope from today's checkout when completion evidence is missing or disagrees", async () => {
  await fixture(false); delete h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha;
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", errors: [expect.stringMatching(/^No retained accepted plan or recorded completion revision\./)] });
  expect(h.engine.record.planReconciliation).toBeUndefined();
  h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.plan![0]!.title = "Another historical title";
  expect((await h.engine.checkCompletedPlan()).errors.join(" ")).toContain("does not match");
  expect(readFileSync(join(h.repository, directory, "phase-1-catalog.md"), "utf8")).toBe(phase);
});

it("checks page mount, reload and button through the real browser while preserving history and no-launch", async () => {
  await fixture(); add(); publish();
  const { launchChrome } = await import("../test-support/headless-chrome.js");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const chrome = await launchChrome();
  const panelText = "(document.querySelector('[aria-label=\"Current plan check\"]')?.innerText ?? '')";
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(server.address, { width, height: 900 });
      try {
        await waitFor(() => !h.engine.checking && h.engine.record.completedPlanCheck?.status === "available");
        await page.waitFor(`${panelText}.includes('planned, not built') && !${panelText}.includes('Checking')`);
        const panel = await page.evaluate<string>(panelText);
        expect(panel).toContain("Phase 9 · Lending · planned, not built");
        expect(panel).toMatch(/Added on [A-Z][a-z]{2} \d+ at \d+:\d{2} [AP]M, in commit [0-9a-f]{7} “test\(comet\): extend plan”\./);
        expect(panel).toContain("Continue builds only this phase, on a new branch from develop, and ends with a new pull request.");
        expect(await page.evaluate("document.body.innerText")).not.toContain("Plan needs reconciliation");
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        await waitFor(() => !h.engine.checking && h.engine.record.completedPlanCheck?.status === "available");
        writeFileSync(`/tmp/kiln-completed-discovery-${width}.png`, await page.screenshot());
        const first = h.engine.record.completedPlanCheck!.attemptedAt;
        expect(await page.evaluate("document.querySelector('a[href=\"https://github.com/acme/acme-shop/pull/12\"]')?.href")).toBe("https://github.com/acme/acme-shop/pull/12");
        await page.evaluate("location.reload()");
        await waitFor(() => h.engine.record.completedPlanCheck?.attemptedAt !== first && h.engine.record.completedPlanCheck?.status === "available", 10_000).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(h.engine.record.completedPlanCheck)}; ${await page.evaluate("document.body.innerText")}`, { cause: error }); });
        await page.waitFor(`${panelText}.includes('1 phase was added to this PRD after Kiln finished it')`);
        const lastSuccess = h.engine.record.completedPlanCheck!.lastSuccessfulAt!;
        // A failed check keeps the earlier answer and says why, and offers Check for new phases again.
        git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "missing-origin"));
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
        await page.waitFor("document.body.innerText.includes('Could not check for new phases') && document.body.innerText.includes('Kiln could not find the main checkout')");
        expect(await page.evaluate(panelText)).toContain("Showing earlier results. The current phase count is unknown.");
        expect(await page.evaluate("document.body.innerText")).not.toContain("No new phases found");
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        expect(await page.evaluate(panelText)).toContain(lastCheckedLine(lastSuccess));
        expect(page.problems.filter(problem => !problem.includes('503'))).toEqual([]);
        writeFileSync(`/tmp/kiln-completed-discovery-failed-${width}.png`, await page.screenshot());
        git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
        const design = join(h.repository, directory, "comet-technical-design.md"); const bytes = readFileSync(design, "utf8");
        writeFileSync(design, "x".repeat(PLAN_LIMIT)); publish();
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
        await page.waitFor("document.body.innerText.includes('8388608 document bytes') && [...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        expect(await page.evaluate("[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Continue with')).every(b => b.disabled)")).toBe(true);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-completed-capacity-${width}.png`, await page.screenshot());
        writeFileSync(design, bytes); publish();
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
        await page.waitFor(`${panelText}.includes('1 phase was added to this PRD after Kiln finished it') && !${panelText}.includes('Showing earlier results')`);
      } finally { await page.close(); }
    }
    expect(h.claudeCalls()).toEqual([]);
  } finally { await chrome.close(); }
}, 90_000);

it("kiln run checks completed work before printing a conclusion and starts no session", async () => {
  await fixture(); add(); publish(); h.engine.close();
  const { EventEmitter } = await import("node:events");
  const { delimiter } = await import("node:path");
  const { runKilnCommand } = await import("../kiln-command.js");
  const url = "https://github.com/acme/acme-shop.git";
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, url);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", url);
  let stdout = ""; let stderr = "";
  const signals = new EventEmitter();
  const result = runKilnCommand(["run", directory], { cwd: h.repository, env: { ...h.env, PATH: `${join(h.sandbox.root, "bin")}${delimiter}${process.env.PATH}`, KILN_NO_BROWSER: "1", KILN_PORT_RANGE: await reservePortRange() }, stdout: { write: (text: string) => { stdout += text; } }, stderr: { write: (text: string) => { stderr += text; } }, signals });
  try {
    await waitFor(() => stdout.includes("http://127.0.0.1:") || !!stderr);
    expect(stderr).toBe(""); expect(stdout).toContain("1 phase was added to this PRD after Kiln finished it: 9, in commit");
    expect(stdout).not.toContain("No new phases found"); expect(h.claudeCalls()).toEqual([]);
  } finally { signals.emit("SIGINT"); await result; }
});


async function checkHttp() {
  server ??= await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  return fetch(`${new URL(server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
}
it.each(["git", "baseline", "baseline publication", "accounting", "proposal", "phases"])("returns typed capacity through HTTP for %s without faulting mutation ownership or losing earlier evidence", async boundary => {
  await fixture(); add(); publish(); const success = await h.engine.checkCompletedPlan();
  let restore = () => {};
  if (boundary === "git") {
    const file = join(h.repository, directory, "comet-technical-design.md");
    const small = readFileSync(file, "utf8");
    writeFileSync(file, "x".repeat(PLAN_LIMIT)); publish(); writeFileSync(file, small);
  } else if (boundary === "baseline") {
    writeFileSync(join(h.stateDirectory, "plans", `${h.engine.record.planReconciliation!.baselineId}.json`), " ".repeat(BASELINE_LIMIT + 1));
  } else if (boundary === "baseline publication") {
    // The plan fits; JSON escapes each control character to six bytes, so the retained baseline does not.
    writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "<!--" + "\u0001".repeat(5 * 1024 * 1024) + "-->\n"); publish();
  } else if (boundary === "phases") {
    for (let id = 10; id < PHASE_LIMIT + 10; id++) writeFileSync(join(h.repository, directory, `phase-${id}-extra.md`), `# Phase ${id}: Extra\n\n## Acceptance criteria covered\nAC-COMET-01\n`);
    publish();
  } else {
    // Narrow capacity fault: actual writer limits are exercised separately; this proves
    // the HTTP/publication owner does not misclassify a refusal as an uncertain write.
    if (boundary === "accounting") {
      const module = await import("./completed-plan-accounting.js");
      const spy = vi.spyOn(module, "retainCompletionAccounting").mockImplementation(() => { throw new PlanCapacityError(PLAN_LIMIT, "completion evidence bytes"); }); restore = () => spy.mockRestore();
    } else {
      const module = await import("./continuation-readiness.js");
      const spy = vi.spyOn(module, "retainContinuationProposal").mockImplementation(() => { throw new PlanCapacityError(PLAN_LIMIT, "proposal bytes"); }); restore = () => spy.mockRestore();
    }
  }
  try {
    const response = await checkHttp(); expect(response.status).toBe(413);
    const body = await response.json() as { check: CompletedPlanCheck; reason: string }; expect(body).toMatchObject({ ok: false, code: "plan_too_large", limit: boundary === "phases" ? PHASE_LIMIT : boundary.startsWith("baseline") ? BASELINE_LIMIT : PLAN_LIMIT, check: { status: "failed", earlierResult: success.result, lastSuccessfulAt: success.lastSuccessfulAt } });
    expect(body.reason).toContain("check again"); expect(body.check.result).toBeUndefined();
    expect(h.engine.commands.fault).toBeUndefined(); expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z"); expect(h.claudeCalls()).toEqual([]);
    expect(h.reopenFromDisk().record.completedPlanCheck).toEqual(body.check);
  } finally { restore(); }
}, 120_000);

it("follows decoded Markdown extensions in saved and Git sources, and never fails the check on a link it can't follow (Kiln Linked Documents AC-LINK-01)", async () => {
  await fixture(); add(); publish(); await h.engine.checkCompletedPlan();
  const design = join(h.repository, directory, "comet-technical-design.md");
  const head = () => git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const context = { git: h.tools.git, env: h.env };
  writeFileSync(design, "# Design\n[Shared](shared-requirements%2Emd)\n"); publish();
  let response = await checkHttp(); expect(response.status).toBe(200);
  expect((await readGitPlan(context, h.repository, directory, head())).unfollowed).toEqual([{ from: `${directory}/comet-technical-design.md`, href: "shared-requirements%2Emd", target: `${directory}/shared-requirements.md`, reason: "not in this repository" }]);
  writeFileSync(join(h.repository, directory, "shared-requirements.md"), "# Shared catalog rules\n"); publish();
  expect(Object.keys(readLinkedDocuments(h.repository, directory).documents)).toContain(`${directory}/shared-requirements.md`);
  expect(Object.keys((await readGitPlan(context, h.repository, directory, head())).source.documents)).toContain(`${directory}/shared-requirements.md`);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { proposal: { readiness: "ready" } } });
  for (const href of ["missing%2Emd", "../../../../outside%2Emd", "%2Foutside%2Emd", "..%5Coutside%2Emd"]) {
    writeFileSync(design, `# Design\n[Background](${href})\n`); publish();
    expect((await h.engine.checkCompletedPlan()).errors).toEqual([]);
  }
  symlinkSync(join(h.repository, directory, "shared-requirements.md"), join(h.repository, directory, "linked.md"));
  writeFileSync(design, "# Design\n[Background](linked%2Emd)\n"); publish();
  expect((await h.engine.checkCompletedPlan()).errors).toEqual([]);
  expect((await readGitPlan(context, h.repository, directory, head())).unfollowed).toMatchObject([{ reason: "a symbolic link" }]);
  response = await checkHttp(); expect(response.status).toBe(200);
  expect(h.claudeCalls()).toEqual([]);
});

it("keeps a failed newly named repository origin read unknown through HTTP with earlier offer/history retained", async () => {
  await fixture(); add(); publish(); const earlier = await h.engine.checkCompletedPlan();
  const { createRepository, createGithubOrigin } = await import("../test-support/git-repositories.js");
  const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api");
  const repo = createRepository(h.sandbox, "lending-api", origin.url); git(h.sandbox, repo, "push", "-qu", "origin", "develop");
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase.replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered")); publish();
  const run = gitReads.runGit;
  const spy = vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => {
    if (args[1] === repo && args[2].join(" ") === "ls-remote --symref origin HEAD refs/heads/*") return { exitCode: 1, stdout: "", stderr: "Required delivery-base read unavailable." };
    return run(...args);
  });
  try {
    const response = await checkHttp(); expect(response.status).toBe(503);
    const body = await response.json() as { check: CompletedPlanCheck; reason: string }; expect(body.check).toMatchObject({ status: "failed", earlierResult: earlier.result, lastSuccessfulAt: earlier.lastSuccessfulAt });
    expect(body.check.errors.join(" ")).toContain("lending-api's delivery bases");
    expect(body.check.errors.join(" ")).toContain("check for new phases again");
    expect(body.check.result).toBeUndefined(); expect(h.claudeCalls()).toEqual([]);
  } finally { spy.mockRestore(); }
});
async function deliveredOnOpenBranch() {
  await fixture(false); const file = join(h.repository, directory, "phase-1-catalog.md");
  // The delivery base holds the plan from before phase 1 closed; the closure exists only on the open pull request's branch.
  writeFileSync(file, phase.replace("**Closed:** 2026-10-01\n\n", "")); publish();
  git(h.sandbox, h.repository, "checkout", "-qb", "feature/comet-library");
  writeFileSync(file, phase); git(h.sandbox, h.repository, "commit", "-qam", "docs(comet): close phase 1");
  git(h.sandbox, h.repository, "push", "-q", "origin", "feature/comet-library");
  const delivered = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.phases["1"]!.repositories["acme-shop"] = { startCommit: delivered, pushedSha: delivered };
  h.engine.record.phases.pr!.repositories["acme-shop"] = { startCommit: delivered, pushedSha: delivered };
  pullRequest("open");
  writePrdRecord(h.stateDirectory, h.engine.record);
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  return { file, delivered };
}
const waitingLine = "New phases: Kiln can check for them once #12 has merged into develop. It checks as soon as it confirms the merge.";
it("reports a delivery whose pull request has not merged only as waiting, whatever the base or the checkout holds (AC-WAIT-01)", async () => {
  await deliveredOnOpenBranch();
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "awaiting_merge", errors: [], awaitingMerge: { repository: "acme-shop", number: 12, baseBranch: "develop", closed: false } });
  expect(check.result).toBeUndefined();
  const output = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}));
  expect(output).toContain(waitingLine);
  expect(output).not.toContain("Plan needs reconciliation");
  // The reported case: the base gains a commit to a linked document outside the PRD folder while the checkout stays behind, then is brought up to date.
  const behind = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  writeFileSync(join(h.repository, "shared-rules.md"), "# Shared rules\n");
  writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "# Design\nCatalog. See [rules](../../../shared-rules.md).\n");
  git(h.sandbox, h.repository, "add", "-A"); git(h.sandbox, h.repository, "commit", "-qm", "docs: shared rules"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  git(h.sandbox, h.repository, "reset", "-q", "--hard", behind);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge", errors: [] });
  git(h.sandbox, h.repository, "pull", "-q", "--ff-only", "origin", "develop");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge", errors: [] });
  expect(buildSnapshot(h.engine).afterDelivery).toMatchObject({ waiting: true, pullRequests: [{ repository: "acme-shop", number: 12, state: "open" }] });
  expect(h.claudeCalls()).toEqual([]);
  // Once GitHub shows it merged, by any method, the check runs against the base.
  git(h.sandbox, h.repository, "merge", "-q", "--no-edit", "feature/comet-library"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  pullRequest("merged", git(h.sandbox, h.repository, "rev-parse", "HEAD").trim());
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged" });
  expect(h.engine.record.afterDelivery?.pullRequests).toEqual([expect.objectContaining({ state: "merged", mergeCommit: git(h.sandbox, h.repository, "rev-parse", "HEAD").trim() })]);
  // A merged reading is final: GitHub is not read again.
  const calls = h.ghCalls().length;
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged" });
  expect(h.ghCalls().length).toBe(calls);
});
it("waits on a closed pull request until a person presses Check now, then says why Continue is unavailable (AC-WAIT-01, AC-WAIT-02)", async () => {
  await deliveredOnOpenBranch(); pullRequest("closed");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge", awaitingMerge: { closed: true } });
  expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))).toContain("New phases: Kiln can check for them once #12 has merged into develop.");
  expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}))).not.toContain("It checks as soon as it confirms the merge.");
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase); publish();
  const pressed = await h.engine.checkCompletedPlan({ press: true });
  expect(pressed).toMatchObject({ status: "blocked", result: { added: [{ id: "9" }] } });
  expect(pressed.result?.problems).toContain("Pull request #12 in acme-shop was closed without merging, so its work is not in develop. Reopen it on GitHub and merge it, and Continue comes back.");
  // A press during a page load's reading is not lost: it reads again as a press.
  pullRequest("open"); expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge" });
  pullRequest("closed");
  const load = h.engine.checkCompletedPlan(); const press = h.engine.checkCompletedPlan({ press: true });
  expect(await load).toMatchObject({ status: "awaiting_merge" });
  expect(await press).toMatchObject({ status: "blocked" });
  // A page load keeps the press; the pull request read open again ends it.
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "blocked" });
  pullRequest("open");
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge" });
  expect(h.engine.record.afterDelivery?.checkedWhileClosedAt).toBeUndefined();
});
it("never waits when the run opened no pull request in the PRD's repository, and fails the check when GitHub cannot be read", async () => {
  await deliveredOnOpenBranch();
  h.setPullRequestViews({ "acme/acme-shop#12": { error: "HTTP 502: Bad Gateway" } });
  const failed = await h.engine.checkCompletedPlan();
  expect(failed).toMatchObject({ status: "failed", errors: [expect.stringContaining("HTTP 502: Bad Gateway")] });
  expect(h.engine.record.afterDelivery?.readError?.problem).toContain("HTTP 502");
  // An earlier reading saved it open: a reading that fails now still fails the check, never shows waiting.
  pullRequest("open"); expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge" });
  h.setPullRequestViews({ "acme/acme-shop#12": { error: "HTTP 401: Bad credentials" } });
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", errors: [expect.stringContaining("HTTP 401: Bad credentials")] });
  delete h.engine.record.pullRequests;
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged" });
});
it("counts a confirmed merge as the finished phases' work in the base, by any merge method (AC-BACK-04)", async () => {
  await deliveredOnOpenBranch();
  // A squash merge: the base holds the merge commit, never the phase's own commit.
  git(h.sandbox, h.repository, "merge", "-q", "--squash", "feature/comet-library"); git(h.sandbox, h.repository, "commit", "-qm", "Comet catalog (#12)");
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase); git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "docs(comet): add lending");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/comet-library"); git(h.sandbox, h.repository, "branch", "-q", "-D", "feature/comet-library");
  const squash = git(h.sandbox, h.repository, "rev-parse", "HEAD~1").trim();
  pullRequest("merged", squash);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }], problems: [] } });
  // A merge commit missing from the base revision read leaves Continue unavailable.
  h.engine.record.afterDelivery!.pullRequests[0]!.mergeCommit = "0".repeat(40);
  const missing = await h.engine.checkCompletedPlan();
  expect(missing).toMatchObject({ status: "blocked" });
  expect(missing.result?.problems.join(" ")).toContain("merge commit 0000000 of acme-shop's pull request is not in origin/develop");
});
it("says once, in the pull request card, that the delivery waits to merge, with Check now, in the real browser (AC-WAIT-02)", async () => {
  await deliveredOnOpenBranch();
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase); publish();
  const { launchChrome } = await import("../test-support/headless-chrome.js");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const chrome = await launchChrome();
  const card = "(document.querySelector('.new-phases')?.innerText ?? '')";
  try {
    for (const width of [1200, 390]) {
      pullRequest("open");
      const page = await chrome.open(server.address, { width, height: 900 });
      try {
        await page.waitFor(`${card}.includes('${waitingLine} Merged it yourself? Check now')`);
        await waitFor(() => !h.engine.checking && h.engine.record.completedPlanCheck?.status === "awaiting_merge");
        expect(await page.evaluate("!!document.querySelector('[aria-label=\"Current plan check\"]')")).toBe(false);
        const text = await page.evaluate<string>("document.body.innerText");
        expect(text.split(waitingLine)).toHaveLength(2);
        expect(text).toContain("PR ready for review");
        expect(text).not.toContain("Waiting for the delivery to merge");
        expect(text).not.toContain("Plan needs reconciliation");
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-after-delivery-waiting-${width}.png`, await page.screenshot());
        // Closed on GitHub: the link reads Check now, and pressing it checks for new phases.
        pullRequest("closed");
        await page.evaluate("[...document.querySelectorAll('.new-phases button')].find(b => b.textContent.includes('Check now')).click()");
        await page.waitFor("!!document.querySelector('[aria-label=\"Current plan check\"]')");
        await waitFor(() => !h.engine.checking && h.engine.record.completedPlanCheck?.status === "blocked");
        await page.waitFor("(document.querySelector('[aria-label=\"Current plan check\"]')?.innerText ?? '').includes('Pull request #12 in acme-shop was closed without merging')");
        expect(await page.evaluate<string>("document.querySelector('[aria-label=\"Current plan check\"]').innerText")).toContain("1 phase was added to this PRD after Kiln finished it");
        expect(await page.evaluate("[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Continue with')).every(b => b.disabled)")).toBe(true);
        writeFileSync(`/tmp/kiln-after-delivery-closed-checked-${width}.png`, await page.screenshot());
        // Read open again: the delivery waits again, and the line is back.
        pullRequest("open");
        await page.evaluate("location.reload()");
        await page.waitFor(`${card}.includes('${waitingLine}')`);
        pullRequest("closed");
        await h.engine.checkCompletedPlan();
        await page.waitFor(`${card}.includes('New phases: Kiln can check for them once #12 has merged into develop. Check now') && !${card}.includes('Merged it yourself')`);
      } finally { await page.close(); }
    }
    expect(h.claudeCalls()).toEqual([]);
  } finally { await chrome.close(); }
}, 90_000);
it("shows on the page the checkout on another branch, uncommitted documents, an unpushed plan and Continue pushing it first (AC-BACK-03, AC-BACK-04, AC-BACK-05)", async () => {
  await fixture();
  // A linked document outside the PRD folder, committed, then edited and not committed.
  writeFileSync(join(h.repository, "shared-rules.md"), "# Shared rules\n");
  writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "# Design\nCatalog. See [rules](../../../shared-rules.md).\n");
  git(h.sandbox, h.repository, "add", "-A"); git(h.sandbox, h.repository, "commit", "-qm", "docs: shared rules"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  writeFileSync(join(h.repository, "shared-rules.md"), "# Shared rules\nEdited, not committed.\n");
  add(); git(h.sandbox, h.repository, "add", join(directory, "phase-9-lending.md")); git(h.sandbox, h.repository, "commit", "-qm", "docs(comet): add lending");
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "main_checkout" }, origin: { kind: "unpushed" }, uncommitted: ["shared-rules.md"] } });
  expect(readFileSync(join(h.repository, "shared-rules.md"), "utf8")).toBe("# Shared rules\nEdited, not committed.\n");
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|stash|commit|add|restore|clean|worktree add|merge|push)(?: |$)/.test(call))).toBe(false);
  const { launchChrome } = await import("../test-support/headless-chrome.js");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const chrome = await launchChrome();
  const panel = "(document.querySelector('[aria-label=\"Current plan check\"]')?.innerText ?? '')";
  try {
    const page = await chrome.open(server.address, { width: 1200, height: 900 });
    try {
      await waitFor(() => h.engine.record.completedPlanCheck?.attemptedAt !== check.attemptedAt && !h.engine.checking);
      await page.waitFor(`${panel}.includes('These documents are committed on this machine’s develop but not pushed. Continue pushes them first.') && ${panel}.includes('shared-rules.md has edits in your main checkout that aren’t committed. Kiln didn’t read them.')`);
      await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Continue with 1 phase') && !b.disabled)");
      // On another branch: the remote base is read, and the page says why the checkout was not.
      git(h.sandbox, h.repository, "checkout", "-qb", "feature/gift-cards");
      writeFileSync(join(h.repository, directory, "phase-10-other.md"), newPhase.replace("Phase 9: Lending", "Phase 10: Reservations")); git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "docs: other feature's phase");
      await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
      await page.waitFor(`${panel}.includes('The main checkout is on feature/gift-cards, so Kiln read the plan from origin/develop only.') && ${panel}.includes('No new phases found')`);
      expect(h.engine.record.completedPlanCheck?.result?.added).toEqual([]);
      // Back on develop, Continue pushes the plan first: the push session runs, and here it stops at Needs you saying so (AC-BACK-05).
      git(h.sandbox, h.repository, "checkout", "-q", "develop");
      await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
      await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Continue with 1 phase') && !b.disabled)");
      for (let attempt = 0; attempt < 5 && !h.engine.record.afterDelivery?.planPushes?.length; attempt++) {
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Continue with 1 phase') && !b.disabled)");
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Continue with 1 phase')).click()");
        // A press made while the offer is re-read is refused and pressed again; an accepted one opens the push within seconds.
        await waitFor(() => !!h.engine.record.afterDelivery?.planPushes?.length, 10_000).catch(() => undefined);
      }
      await page.waitFor("document.body.innerText.includes('The push session stopped before pushing the plan.') && document.body.innerText.includes('Nothing Kiln can see was pushed to origin/develop.')");
      expect(h.engine.record.continuation?.acceptances ?? []).toEqual([]);
    } finally { await page.close(); }
  } finally { await chrome.close(); }
  expect(h.claudeCalls().map(call => call.cwd)).toEqual([h.repository]);
}, 60_000);
it("counts a leaf the execution finished after the plan's last read as finished (AC-BACK-01)", async () => {
  await fixture();
  // Phase 2 closed under its own completion check just before delivery: in the phase facts, not yet in the retained baseline.
  writeFileSync(join(h.repository, directory, "phase-2-shelving.md"), phase.replace("Phase 1: Catalog", "Phase 2: Shelving")); add(); publish();
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.plan = recordedPlan(observePlan(h.repository, directory).plan).filter(row => row.id !== "9");
  h.engine.record.phases["2"] = { doneAt: "2026-10-01T11:30:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  pullRequest("merged", revision);
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(check.result?.leaves?.find(row => row.id === "2")?.classification).toBe("carried_completed");
});
it("keeps an earlier execution's phase whose work is not in the base blocking Continue, even after the delivery merged (AC-BACK-04)", async () => {
  await fixture(); add(); publish();
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  // Phase 1 comes from an earlier execution, recorded at a commit develop never received.
  git(h.sandbox, h.repository, "checkout", "-qb", "earlier-work"); writeFileSync(join(h.repository, "earlier.txt"), "earlier\n"); git(h.sandbox, h.repository, "add", "earlier.txt"); git(h.sandbox, h.repository, "commit", "-qm", "earlier work");
  const elsewhere = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim(); git(h.sandbox, h.repository, "checkout", "-q", "develop");
  const baseline = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
  const { id: _id, ...body } = baseline; void _id;
  h.engine.record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { ...body, completions: { "1": { kind: "kiln", scopeRepositories: [], revision: elsewhere, repositories: { "acme-shop": { identity: "acme/acme-shop", revision: elsewhere } } } } }).id };
  delete h.engine.record.phases["1"];
  pullRequest("merged", revision);
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "blocked", result: { added: [{ id: "9" }] } });
  expect(check.result?.problems.join(" ")).toContain(`Phase 1: acme-shop completion ${elsewhere} is not integrated in origin/develop`);
});
it("never reads a pull request merged into another base, or one whose merge commit the base lacks, as merged (AC-WAIT-01)", async () => {
  await deliveredOnOpenBranch();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "awaiting_merge" });
  const merged = git(h.sandbox, h.repository, "rev-parse", "feature/comet-library").trim();
  h.setPullRequestViews({ "acme/acme-shop#12": recordedPullRequest("merged", { number: 12, base: "main", mergeCommit: merged }) });
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", errors: ["acme-shop #12 merged into main, not develop."] });
  // A failed read keeps the earlier reading; it never infers a state.
  expect(h.engine.record.afterDelivery?.pullRequests).toEqual([expect.objectContaining({ state: "open" })]);
  pullRequest("merged", merged);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", errors: [`develop does not contain the merge commit ${merged.slice(0, 7)} of acme-shop #12.`] });
  expect(h.engine.record.afterDelivery?.pullRequests).toEqual([expect.objectContaining({ state: "open" })]);
});
