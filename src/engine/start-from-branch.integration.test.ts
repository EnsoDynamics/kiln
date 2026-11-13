// Starting from a branch that already exists, and catching an untouched branch up (Kiln Run
// Restart, Phase 2: AC-FROM-01 to 05, AC-CURRENT-01), through the engine and its command journal
// against real Git with bare origins and the stand-in claude.

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { readPlanAt } from "./plan-reading.js";
import { createHarness, landingSession, pullRequestSession, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import type { Engine } from "./engine.js";
import { buildSnapshot, documentsFound } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const BRANCH = "feature/customer-returns";
const DIRECTORY = "docs/prds/customer-returns";
const exitsBeforeInit: ScenarioSession = { noInit: true, actions: [] };

/** Documents found as `kiln run` reads it from the person's checkout. */
function checkoutDocuments(h: Harness) {
  const plan = readPlanAt(h.repository, DIRECTORY);
  if (!plan.ok) throw new Error(plan.problem);
  return documentsFound(join(h.repository, DIRECTORY), "customer-returns", plan.plan, { designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 5, repositories: [] }, "acme-shop");
}

/** Adds a phase document's Closed line in a checkout. */
function close(h: Harness, checkout: string, file: string) {
  const path = join(checkout, DIRECTORY, file);
  const lines = readFileSync(path, "utf8").split("\n");
  lines.splice(1, 0, "", "**Closed:** 2026-11-12");
  writeFileSync(path, lines.join("\n"));
}

/** A branch someone built phases 1 and 2b on by hand (2a is closed in the fixture already), pushed, with the person's checkout back on develop. */
function branchBuiltByHand(h: Harness): string {
  git(h.sandbox, h.repository, "switch", "-q", "-c", BRANCH);
  close(h, h.repository, "phase-1-return-intake.md");
  close(h, h.repository, "phase-2b-store-credit.md");
  writeFileSync(join(h.repository, "intake.txt"), "by hand\n");
  git(h.sandbox, h.repository, "add", "-A");
  git(h.sandbox, h.repository, "commit", "-q", "-m", "feat: intake and store credit, by hand");
  git(h.sandbox, h.repository, "push", "-q", "-u", "origin", BRANCH);
  const tip = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "switch", "-q", "develop");
  return tip;
}

/** A commit on develop, pushed: the base moves ahead. */
function advanceDevelop(h: Harness, name: string) {
  writeFileSync(join(h.repository, name), `${name}\n`);
  git(h.sandbox, h.repository, "add", name);
  git(h.sandbox, h.repository, "commit", "-q", "-m", `chore: ${name}`);
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  return git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
}

const originTip = (h: Harness, branch: string) => git(h.sandbox, h.origin, "rev-parse", `refs/heads/${branch}`).trim();

let commandNumber = 0;
async function submit(engine: Engine, action: "start-again" | "resume" | "carry-on", inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const id = `from-${++commandNumber}`;
  const answer = engine.commands.submit({ command_id: id, execution_id: engine.record.executionId!, status_token: engine.controlView().token, action, inputs }, "caller", true);
  expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
  await engine.commands.settled();
  await engine.settled();
  return engine.commands.lookup(id).operation as Receipt;
}

describe("starting on a branch someone built phases on (AC-FROM-01, AC-FROM-02, AC-FROM-04)", () => {
  it("selects the existing branch, reads the plan there, starts at its first open phase and adds to the branch without rewriting it", async () => {
    harness = await createHarness({ sessions: [landingSession("src/dashboard.txt"), pullRequestSession(49)] });
    const h = harness;
    const handTip = branchBuiltByHand(h);
    h.setPulls([{ number: 48, url: "https://github.com/acme/acme-shop/pull/48", title: "Customer returns", isDraft: false, isCrossRepository: false, headRefName: BRANCH, baseRefName: "develop", additions: 1, deletions: 0, commits: 1 }]);
    const documents = checkoutDocuments(h);
    // The checkout's own plan shows only 2a closed.
    expect(documents.plan.closedCount).toBe(1);

    // A branch with the name Kiln would give a new one exists, so A branch that already exists is selected (AC-FROM-01).
    await h.engine.refreshStartPreview();
    expect(h.engine.record.start).toBeUndefined();
    expect(h.engine.startChoice.from).toBe("existing");
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    let snapshot = buildSnapshot(h.engine, documents);
    expect(snapshot.documents!.start).toMatchObject({
      from: "existing",
      planSource: { kind: "branch", branch: BRANCH, sha: handTip },
      closedCount: 3,
      startAt: { id: "3", title: "Returns dashboard" },
      repositories: [{ name: "acme-shop", hasBranch: true, pullRequest: { number: 48 } }],
    });
    expect(snapshot.documents!.start!.branches).toEqual(expect.arrayContaining([{ name: BRANCH, available: true }, { name: "develop", available: false }]));
    expect(snapshot.documents!.start!.catchUp).toBeUndefined();
    // What Kiln found is read at the branch's tip: its closed marks (AC-FROM-02).
    expect(snapshot.documents!.plan.closedCount).toBe(3);
    expect(snapshot.documents!.plan.phases.filter(phase => phase.closed).map(phase => phase.id)).toEqual(["1", "2a", "2b"]);
    expect(snapshot.settings.fieldErrors.featureBranch).toBeUndefined();

    // Start acts on what the page showed: a stale preview is refused.
    expect(await h.engine.start({ refinementConfirmed: true, previewId: "0".repeat(64) })).toMatchObject({ ok: false, status: 409, code: "start_changed" });
    expect(h.engine.record.startedAt).toBeUndefined();
    snapshot = buildSnapshot(h.engine, documents);
    expect(await h.engine.start({ refinementConfirmed: true, previewId: snapshot.documents!.start!.previewId })).toEqual({ ok: true });
    await h.engine.settled();

    const entry = h.engine.record.repositories[0]!;
    expect(entry).toMatchObject({ runStartCommit: handTip, baseCommit: git(h.sandbox, h.repository, "merge-base", handTip, "develop").trim() });
    expect(h.engine.record.start).toEqual({ from: "existing", bringUpToDate: true });
    // Phases closed on the branch count as closed before the run: Kiln's first session is Phase 3's.
    const calls = h.claudeCalls();
    expect(calls[0]!.prompt).toContain("phase-3-returns-dashboard.md");
    expect(h.engine.record.phases["1"]).toBeUndefined();
    expect(h.engine.record.phases["2b"]).toBeUndefined();
    expect(h.engine.record.phases["3"]!.doneAt).toBeDefined();
    // Kiln added to the branch and never rewrote it: the hand-built commit is in origin's branch.
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    expect(git(h.sandbox, h.repository, "merge-base", "--is-ancestor", handTip, `origin/${BRANCH}`)).toBe("");
    expect(git(h.sandbox, h.repository, "log", "--format=%s", `${handTip}..origin/${BRANCH}`).trim().split("\n")).toEqual(["feat: the phase"]);
    // Final delivery uses the branch's open pull request into the base: #48, and no second one (AC-FROM-04).
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.engine.record.pullRequests?.map(pull => pull.number)).toEqual([48]);
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("an untouched branch behind its base (AC-CURRENT-01 at Start)", () => {
  it("offers to bring it up to date, reads the plan at the base's tip, fast-forwards and pushes it at Start, and tells the first session", async () => {
    harness = await createHarness({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), landingSession("src/d.txt"), pullRequestSession()] });
    const h = harness;
    git(h.sandbox, h.repository, "branch", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", BRANCH);
    const before = originTip(h, BRANCH);
    advanceDevelop(h, "one.txt");
    const developTip = advanceDevelop(h, "two.txt");

    await h.engine.refreshStartPreview();
    const snapshot = buildSnapshot(h.engine, checkoutDocuments(h));
    expect(snapshot.documents!.start).toMatchObject({ from: "existing", bringUpToDate: true, catchUp: { base: "develop", repositories: [{ name: "acme-shop", branch: BRANCH, behind: 2 }] }, planSource: { kind: "base_after_catch_up", branch: "develop", sha: developTip } });

    expect(await h.engine.start({ refinementConfirmed: true, previewId: snapshot.documents!.start!.previewId })).toEqual({ ok: true });
    // The fast-forward and the push happened before any session (AC-CURRENT-01).
    expect(originTip(h, BRANCH)).toBe(developTip);
    expect(git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim()).toBe(developTip);
    await h.engine.settled();
    const entry = h.engine.record.repositories[0]!;
    expect(entry.runStartCommit).toBe(developTip);
    expect(entry.catchUp).toBeUndefined();
    expect(h.engine.record.branchCatchUps).toEqual([expect.objectContaining({ repository: "acme-shop", branch: BRANCH, from: before, to: developTip, commits: 2, toldSessionId: h.engine.phaseSessions("1")[0]!.sessionId })]);
    const calls = h.claudeCalls();
    expect(calls[0]!.prompt).toContain(`Kiln brought ${BRANCH} up to date with its base before this session, moving it from ${before.slice(0, 7)} to ${developTip.slice(0, 7)}.`);
    // Told once: the next session's prompt doesn't repeat it.
    expect(calls[1]!.prompt).not.toContain("up to date with its base");
  });

  it("leaves the branch as it is when the box is unticked", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    git(h.sandbox, h.repository, "branch", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", BRANCH);
    const before = originTip(h, BRANCH);
    advanceDevelop(h, "one.txt");
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: false })).toEqual({ ok: true });
    const snapshot = buildSnapshot(h.engine, checkoutDocuments(h));
    expect(snapshot.documents!.start).toMatchObject({ bringUpToDate: false, planSource: { kind: "branch", sha: before } });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: snapshot.documents!.start!.previewId })).toEqual({ ok: true });
    await h.engine.settled();
    expect(originTip(h, BRANCH)).toBe(before);
    expect(h.engine.record.branchCatchUps).toBeUndefined();
  });
});

describe("which branches can be chosen (AC-FROM-03)", () => {
  it("makes the base, the person's own checkout, a gone worktree and a local copy behind origin's unavailable, each with its reason", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const reasonFor = async (name: string) => {
      await h.engine.changeSettings({ featureBranch: name });
      await h.engine.changeStart({ from: "existing", bringUpToDate: true });
      return buildSnapshot(h.engine).settings.fieldErrors.featureBranch;
    };
    // The base branch.
    expect(await reasonFor("develop")).toBe("That's the base branch. Choose A new feature branch to start from it.");
    // Checked out in the person's own checkout.
    git(h.sandbox, h.repository, "switch", "-q", "-c", "mine");
    expect(await reasonFor("mine")).toMatch(/^That branch is checked out in your own checkout, .+\. Switch that checkout to another branch to start from it\.$/);
    git(h.sandbox, h.repository, "switch", "-q", "develop");
    // Still recorded at a worktree folder that is gone.
    const gone = join(h.sandbox.root, "gone-worktree");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", "elsewhere", gone);
    rmSync(gone, { recursive: true, force: true });
    expect(await reasonFor("elsewhere")).toMatch(/^Git still records this branch at .+gone-worktree, which is gone\. .*worktree prune\.$/);
    git(h.sandbox, h.repository, "worktree", "prune");
    // The feature branch of another PRD Kiln has started in this repository.
    const other = join(dirname(dirname(h.stateDirectory)), "acme-shop-other", "docs--prds--other");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "prd.json"), JSON.stringify({ startedAt: "2026-11-12T00:00:00Z", featureName: "Other returns", settings: { featureBranch: "taken-elsewhere" }, repositories: [{ mainCheckoutPath: h.repository }] }));
    git(h.sandbox, h.repository, "branch", "taken-elsewhere");
    expect(await reasonFor("taken-elsewhere")).toBe("That branch is the feature branch of Other returns, which Kiln has started. Choose another branch.");
    // A worktree git left half made.
    const half = join(h.sandbox.root, "half-made");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", "half", half);
    git(h.sandbox, h.repository, "worktree", "lock", "--reason", "initializing", half);
    expect(await reasonFor("half")).toMatch(/half-made was left half made\. Remove it with git -C .+ worktree remove -f -f .+half-made, then reload\.$/);
    // A local copy behind origin's: Kiln's first push would be rejected.
    git(h.sandbox, h.repository, "branch", "behind");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/behind");
    advanceDevelop(h, "x.txt");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/behind");
    expect(await reasonFor("behind")).toMatch(/Kiln's first push would be rejected/);
    // Diverged from origin's: rejected the same way.
    git(h.sandbox, h.repository, "branch", "diverged", "develop~1");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/diverged");
    git(h.sandbox, h.repository, "worktree", "add", "-q", join(h.sandbox.root, "diverged-tree"), "diverged");
    writeFileSync(join(h.sandbox.root, "diverged-tree", "own.txt"), "own\n");
    git(h.sandbox, join(h.sandbox.root, "diverged-tree"), "add", "own.txt");
    git(h.sandbox, join(h.sandbox.root, "diverged-tree"), "commit", "-q", "-m", "own work");
    git(h.sandbox, h.repository, "worktree", "remove", join(h.sandbox.root, "diverged-tree"));
    expect(await reasonFor("diverged")).toMatch(/behind or diverged from origin's, so Kiln's first push would be rejected/);
    // A local branch ahead of origin's, built by hand and not yet pushed, stays available.
    git(h.sandbox, h.repository, "branch", "ahead", "develop");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop~1:refs/heads/ahead");
    expect(await reasonFor("ahead")).toBeUndefined();
    expect(h.engine.branchChoices!.find(choice => choice.name === "ahead")).toEqual({ name: "ahead", available: true });
    // A branch only on origin is listed too.
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/only-on-origin");
    await h.engine.refreshStartPreview();
    expect(h.engine.branchChoices!.find(choice => choice.name === "only-on-origin")).toEqual({ name: "only-on-origin", available: true });
    await reasonFor("behind");
    expect(h.engine.branchChoices!.find(choice => choice.name === "behind")).toMatchObject({ available: false });
    // Start stays unavailable while the message shows.
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409 });
    expect(h.engine.record.startedAt).toBeUndefined();
  });

  it("adopts a worktree the branch is checked out in, counts its uncommitted files, holds Start while any are in the PRD's directory, and tells the first session", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    const existing = join(h.sandbox.root, "kept", "acme-shop");
    mkdirSync(join(h.sandbox.root, "kept"), { recursive: true });
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", BRANCH, existing);
    git(h.sandbox, existing, "push", "-q", "-u", "origin", BRANCH);
    writeFileSync(join(existing, "notes.txt"), "half done\n");
    writeFileSync(join(existing, DIRECTORY, "draft.md"), "draft\n");

    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    let snapshot = buildSnapshot(h.engine);
    expect(h.engine.startPreview!.repositories[0]!.worktree).toMatchObject({ path: existing, adopted: true, uncommittedFiles: 2, prdFiles: [`${DIRECTORY}/draft.md`] });
    expect(snapshot.settings.fieldErrors.featureBranch).toMatch(/has uncommitted changes in the PRD's directory: docs\/prds\/customer-returns\/draft\.md\. Commit or discard them in that worktree first\.$/);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, status: 409 });

    rmSync(join(existing, DIRECTORY, "draft.md"));
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    snapshot = buildSnapshot(h.engine, checkoutDocuments(h));
    expect(snapshot.documents!.start!.repositories[0]!.worktree).toMatchObject({ adopted: true, uncommittedFiles: 1 });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: snapshot.documents!.start!.previewId })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]).toMatchObject({ worktreePath: existing, adoptedWorktree: true });
    expect(h.engine.worktreePath).toBe(existing);
    expect(h.claudeCalls()[0]!.cwd).toBe(existing);
    expect(h.claudeCalls()[0]!.prompt).toMatch(/has 1 uncommitted file\. Look at them before building/);
  });
});

describe("a stopped phase's untouched branch (AC-CURRENT-01 at a stop)", () => {
  it("offers the catch-up with the stop, refuses a ticked press once the branch no longer qualifies, and catches up before a command starts the session", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit, landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhase()).toBe("1");
    const developTip = advanceDevelop(h, "merged-elsewhere.txt");
    await h.engine.refreshStoppedWork();
    expect(buildSnapshot(h.engine).needsYou!.catchUp).toEqual({ base: "develop", repositories: [{ name: "acme-shop", branch: BRANCH, behind: 1 }] });

    // Ticked on the page, but the branch has an uncommitted file now: nothing starts (branch_changed).
    const scratch = join(h.engine.worktreePath, "scratch.txt");
    writeFileSync(scratch, "x\n");
    const changed = await submit(h.engine, "start-again", { bring_up_to_date: true });
    expect(changed).toMatchObject({ state: "failed", outcome: "branch_changed", branch_catch_up: [] });
    expect(h.claudeCalls()).toHaveLength(1);
    rmSync(scratch);
    await h.engine.refreshStoppedWork();

    // The command catches the branch up as if ticked, then starts the session (CLI default).
    const before = h.engine.record.repositories[0]!.baseCommit!;
    const started = await submit(h.engine, "start-again");
    expect(started).toMatchObject({ state: "completed", outcome: "session_started", branch_catch_up: [{ repository: "acme-shop", branch: BRANCH, from: before, to: developTip, commits: 1 }] });
    // origin holds the base's tip, and the session's own work on top.
    expect(git(h.sandbox, h.origin, "merge-base", "--is-ancestor", developTip, `refs/heads/${BRANCH}`)).toBe("");
    const entry = h.engine.record.repositories[0]!;
    // Where the run began stays; the phase now starts at the base's tip.
    expect(entry).toMatchObject({ runStartCommit: before, baseCommit: developTip });
    expect(h.claudeCalls()[1]!.prompt).toContain(`moving it from ${before.slice(0, 7)} to ${developTip.slice(0, 7)}`);
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("leaves the branch as it is when the command is told to", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit, exitsBeforeInit] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const before = h.engine.record.repositories[0]!.baseCommit!;
    advanceDevelop(h, "merged-elsewhere.txt");
    const receipt = await submit(h.engine, "start-again", { leave_branch: true });
    expect(receipt.branch_catch_up).toEqual([]);
    expect(git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim()).toBe(before);
    expect(h.engine.record.branchCatchUps).toBeUndefined();
  });
});

describe("an interrupted catch-up (AC-CURRENT-01, settling a saved catchUp)", () => {
  it("records a fast-forward that landed before Kiln stopped, and forgets one that never ran", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const entry = h.engine.record.repositories[0]!;
    const before = entry.baseCommit!;
    const developTip = advanceDevelop(h, "landed.txt");
    // A fast-forward that landed while its record still holds catchUp.
    git(h.sandbox, h.engine.worktreePath, "fetch", "-q", "origin", "develop");
    git(h.sandbox, h.engine.worktreePath, "merge", "-q", "--ff-only", developTip);
    entry.catchUp = { from: before, to: developTip };
    let engine = h.reopen();
    expect(await engine.prepare()).toEqual({ ok: true });
    expect(engine.record.repositories[0]).toMatchObject({ baseCommit: developTip, runStartCommit: before });
    expect(engine.record.repositories[0]!.catchUp).toBeUndefined();
    expect(engine.record.branchCatchUps).toEqual([expect.objectContaining({ from: before, to: developTip, commits: 1 })]);

    // One that never ran: removed, nothing recorded.
    const later = advanceDevelop(h, "never.txt");
    engine.record.repositories[0]!.catchUp = { from: developTip, to: later };
    engine = h.reopen();
    expect(await engine.prepare()).toEqual({ ok: true });
    expect(engine.record.repositories[0]!.catchUp).toBeUndefined();
    expect(engine.record.repositories[0]!.baseCommit).toBe(developTip);
    expect(engine.record.branchCatchUps).toHaveLength(1);
  });
});

describe("a Start that fails, is retried, or is interrupted (run restart \"Start\")", () => {
  it("gives back everything an existing-branch Start set when its catch-up fails, removes nothing in git, and the next Start adopts what was left", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    git(h.sandbox, h.repository, "branch", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", BRANCH);
    const before = originTip(h, BRANCH);
    const developTip = advanceDevelop(h, "one.txt");
    // origin refuses the catch-up's push.
    const hook = join(h.origin, "hooks", "pre-receive");
    writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do [ "$ref" = "refs/heads/${BRANCH}" ] && { echo "refused by test" >&2; exit 1; }; done\nexit 0\n`);
    chmodSync(hook, 0o755);
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    const failed = await h.engine.start({ refinementConfirmed: true, previewId: h.engine.startPreview!.previewId });
    expect(failed).toMatchObject({ ok: false, status: 409, reason: expect.stringMatching(/^Couldn’t bring the branch up to date: /) });
    const record = h.engine.record;
    expect(record.startedAt).toBeUndefined();
    expect(record.branchCatchUps).toBeUndefined();
    for (const entry of record.repositories) {
      expect(entry.runStartCommit).toBeUndefined(); expect(entry.baseCommit).toBeUndefined(); expect(entry.catchUp).toBeUndefined(); expect(entry.adoptedWorktree).toBeUndefined(); expect(entry.setupCompletedAt).toBeUndefined();
    }
    // Kiln removed nothing: the worktree and the fast-forwarded local branch stay; origin's copy didn't move.
    expect(git(h.sandbox, h.repository, "rev-parse", BRANCH).trim()).toBe(developTip);
    expect(originTip(h, BRANCH)).toBe(before);

    // The next Start adopts the worktree left behind and finishes the catch-up with its push.
    rmSync(hook);
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    expect(h.engine.startPreview!.repositories[0]).toMatchObject({ worktree: { adopted: true }, qualifies: true });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: h.engine.startPreview!.previewId })).toEqual({ ok: true });
    await h.engine.settled();
    expect(originTip(h, BRANCH)).toBe(developTip);
    expect(h.engine.record.repositories[0]).toMatchObject({ adoptedWorktree: true, runStartCommit: developTip, setupCompletedAt: expect.any(String) });
  });

  it("makes a local branch that tracks one only on origin", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    git(h.sandbox, h.repository, "push", "-q", "origin", `develop:refs/heads/${BRANCH}`);
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    expect(h.engine.startPreview!.repositories[0]).toMatchObject({ hasBranch: true, tipFrom: "origin" });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: h.engine.startPreview!.previewId })).toEqual({ ok: true });
    await h.engine.settled();
    expect(git(h.sandbox, h.repository, "config", `branch.${BRANCH}.remote`).trim()).toBe("origin");
    expect(git(h.sandbox, h.repository, "config", `branch.${BRANCH}.merge`).trim()).toBe(`refs/heads/${BRANCH}`);
    expect(git(h.sandbox, h.engine.worktreePath, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe(BRANCH);
  });

  it("finishes an interrupted Start on the next kiln run, recording a fast-forward that landed and pushing it", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    git(h.sandbox, h.repository, "branch", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", BRANCH);
    const before = originTip(h, BRANCH);
    const developTip = advanceDevelop(h, "one.txt");
    // Start's save happened and the fast-forward landed; then Kiln stopped before recording it.
    const record = h.engine.record;
    record.startedAt = record.refinementConfirmedAt = new Date().toISOString();
    record.start = { from: "existing", bringUpToDate: true };
    record.repositories = [{ name: "acme-shop", kind: "prd", mainCheckoutPath: h.repository, github: "acme/acme-shop", baseBranch: "develop", worktreePath: record.settings.worktreePath, baseCommit: before, runStartCommit: before, catchUp: { from: before, to: developTip } }];
    git(h.sandbox, h.repository, "branch", "-f", BRANCH, developTip);
    const engine = h.reopen();
    expect(await engine.prepare()).toEqual({ ok: true });
    expect(engine.record.repositories[0]).toMatchObject({ runStartCommit: developTip, baseCommit: developTip, setupCompletedAt: expect.any(String) });
    expect(engine.record.repositories[0]!.catchUp).toBeUndefined();
    expect(engine.record.branchCatchUps).toEqual([expect.objectContaining({ from: before, to: developTip, commits: 1 })]);
    expect(originTip(h, BRANCH)).toBe(developTip);
  });
});

describe("more of AC-CURRENT-01 at a stop and AC-FROM-02", () => {
  it("catches the branch up before a resume, through the journal, and a failed push starts nothing", async () => {
    const blocked: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { result: "Blocked before any code." }] };
    harness = await createHarness({ sessions: [blocked, landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedCase("1")).toBe("built_nothing");
    const before = h.engine.record.repositories[0]!.baseCommit!;
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "origin", BRANCH);
    const developTip = advanceDevelop(h, "merged-elsewhere.txt");
    // origin refuses the push: nothing starts, the reason is given, and what moved stays recorded.
    const hook = join(h.origin, "hooks", "pre-receive");
    writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do [ "$ref" = "refs/heads/${BRANCH}" ] && { echo "refused by test" >&2; exit 1; }; done\nexit 0\n`);
    chmodSync(hook, 0o755);
    const failed = await submit(h.engine, "resume");
    expect(failed).toMatchObject({ state: "failed", outcome: "branch_catch_up_failed", branch_catch_up: [{ from: before, to: developTip }] });
    expect(failed.reason).toMatch(/^Kiln couldn't bring the branch up to date, so nothing started: /);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(originTip(h, BRANCH)).toBe(before);
    // The retry only pushes, then resumes the same conversation.
    rmSync(hook);
    const resumed = await submit(h.engine, "resume");
    expect(resumed).toMatchObject({ state: "completed", outcome: "session_resumed", branch_catch_up: [] });
    expect(git(h.sandbox, h.origin, "merge-base", "--is-ancestor", developTip, `refs/heads/${BRANCH}`)).toBe("");
    expect(h.claudeCalls()[1]!.args).toContain("--resume");
    expect(h.claudeCalls()[1]!.prompt).toContain(`moving it from ${before.slice(0, 7)} to ${developTip.slice(0, 7)}`);
  });

  it("maps the page's box through the HTTP route: unticked leaves the branch, ticked catches it up", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit, exitsBeforeInit, exitsBeforeInit] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const before = h.engine.record.repositories[0]!.baseCommit!;
    const developTip = advanceDevelop(h, "merged-elsewhere.txt");
    const { startLocalServer } = await import("../server/local-server.js");
    const server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const press = async (bringUpToDate: boolean) => {
        const origin = new URL(server.address).origin;
        const response = await fetch(`${origin}/api/start-again`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json", "X-Kiln-Status": h.engine.controlView().token, "X-Kiln-Command-Id": `http-${bringUpToDate}` }, body: JSON.stringify({ bringUpToDate }) });
        await h.engine.commands.settled();
        await h.engine.settled();
        // The stand-in exits before beginning a conversation, so each press answers dispatch_not_started once settled.
        return ((await response.json()) as { code?: string }).code;
      };
      expect(await press(false)).toBe("dispatch_not_started");
      expect(git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim()).toBe(before);
      expect(await press(true)).toBe("dispatch_not_started");
      expect(git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim()).toBe(developTip);
    } finally { await server.close(); }
  });

  it("goes straight to final delivery when every phase is closed on the chosen branch", async () => {
    harness = await createHarness({ sessions: [pullRequestSession(52)] });
    const h = harness;
    git(h.sandbox, h.repository, "switch", "-q", "-c", BRANCH);
    for (const file of ["phase-1-return-intake.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) close(h, h.repository, file);
    git(h.sandbox, h.repository, "commit", "-q", "-am", "docs: every phase built by hand");
    git(h.sandbox, h.repository, "push", "-q", "-u", "origin", BRANCH);
    git(h.sandbox, h.repository, "switch", "-q", "develop");
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    expect(h.engine.startPreview).toMatchObject({ closedCount: 4 });
    expect(h.engine.startPreview!.startAt).toBeUndefined();
    expect(await h.engine.start({ refinementConfirmed: true, previewId: h.engine.startPreview!.previewId })).toEqual({ ok: true });
    await h.engine.settled();
    expect(Object.keys(h.engine.record.phases)).toEqual(["pr"]);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.completedAt).toBeDefined();
  });
});
