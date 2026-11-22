// Kiln After Delivery, Phase 2b (the merge session's waits, interruptions and workspace) with real
// Git, a local bare origin, scripted provider sessions, a scripted account reader, the gh stand-in
// replaying GitHub's recorded answers and the control journal. No paid model calls. A merge
// session "merges" by pushing the feature head to the base on the origin and marking the pull
// request merged in the gh stand-in's state, as `gh pr merge` would. Run with `umask 022` on a machine whose
// umask is 0002: Kiln's transcript safety check refuses group-writable transcripts, so Resume is otherwise never offered.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { buildSnapshot } from "./snapshot.js";
import { statusProjection } from "../control/projection.js";
import { afterDeliveryFacts, afterDeliveryText } from "../control/delivered-facts.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import { MERGE_KEY } from "../state/activity-keys.js";
import type { Receipt } from "../control/commands.js";
import type { Engine } from "./engine.js";
import { headerState } from "../../view/src/lib/progress.js";

let h: Harness | undefined;
let claude: ScriptedClaude | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; claude = undefined; });

const MARK_MERGED = fileURLToPath(new URL("../../test/stand-ins/gh-mark-merged.mjs", import.meta.url));
const KEY = "acme/acme-shop#218";
const SUMMARY = "Brought develop into the branch; no conflicts. Unit tests pass. Pushed and merged #218.";
const mergeStep = { bash: `git push -q origin HEAD:develop && node "${MARK_MERGED}" ${KEY} "$(git rev-parse HEAD)"` };
const merging = (extra: Record<string, unknown>[] = []): ScenarioSession => ({ actions: [...extra, mergeStep, { result: SUMMARY }, { exit: 0 }] });
const stopping = (message: string): ScenarioSession => ({ actions: [{ result: message }, { exit: 0 }] });
/** A merge session refused by the 5-hour usage limit before it merged anything. */
const refused = (): ScenarioSession => ({ actions: [{ text: "Bringing develop into the branch." }, { refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] });
/** A merge session that runs until the test interrupts it. */
const hanging = (): ScenarioSession => ({ actions: [{ touch: "merge-started" }, { work: "npm test" }] });

/** A finished run: three phases and pull request #218 opened, GitHub showing it open at the feature head. */
async function finished(after: ScenarioSession[]): Promise<Harness> {
  claude = new ScriptedClaude(() => new Date());
  claude.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 40)])));
  h = await createHarness({ sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218), ...after], engineOptions: { claude } });
  h.useGithubOrigin();
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeDefined();
  show("open");
  expect((await h.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
  return h;
}
/** From here on every account reading shows the 5-hour window used up, so a wait holds until the test resumes it. */
function atLimit(): void {
  (claude as unknown as { queued: unknown[] }).queued.length = 0;
  const resetsAt = new Date(Date.now() + 3_600_000).toISOString();
  claude!.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 100, resetsAt)])));
}
const featureHead = () => git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "HEAD").trim();
const show = (state: "open" | "conflicting" | "closed" | "merged", mergeCommit?: string) => h!.setPullRequestViews({ [KEY]: recordedPullRequest(state, { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), ...(mergeCommit ? { mergeCommit } : {}) }) });
let commands = 0;
async function control(action: string, inputs: Record<string, unknown> = {}, engine: Engine = h!.engine): Promise<Receipt> {
  const command_id = `merge-${++commands}`;
  const answer = engine.commands.submit({ command_id, execution_id: engine.record.executionId!, status_token: engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await engine.commands.settled(); await engine.settled();
  return engine.commands.lookup(command_id).operation as Receipt;
}
const status = (engine: Engine = h!.engine) => statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), engine) as unknown as { state: string; after_delivery: Parameters<typeof afterDeliveryText>[0] & Record<string, unknown>; controls: { name: string; available: boolean; reason: string | null }[] };
const mergeCalls = () => h!.claudeCalls().filter(call => call.prompt.includes("You are merging the finished work") || call.args.includes("--resume") && call.prompt.includes("merging the delivery's pull requests"));
/** Presses Merge and returns once the session is running; its scripted session then waits for the test. */
async function pressWhileRunning(): Promise<void> {
  expect(h!.engine.commands.submit({ command_id: `merge-${++commands}`, execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "merge", inputs: {} }).ok).toBe(true);
  await h!.engine.commands.settled();
  await waitFor(() => existsSync(join(h!.engine.worktreePath, "merge-started")));
}
/** The next `kiln run`: a new engine over the record on disk, prepared and judged, with the restart review unless `--resume`. */
async function kilnRun(resume = false): Promise<Awaited<ReturnType<Engine["decide"]>>> {
  h!.engine = h!.reopenFromDisk();
  await h!.engine.agents.refresh();
  expect(await h!.engine.prepare()).toEqual({ ok: true });
  const decision = await h!.engine.decide(resume ? { resume: true } : { review: true });
  await h!.engine.continue();
  await h!.engine.settled();
  return decision;
}
const controlOf = (name: string) => h!.engine.controlView().controls.find(one => one.name === name)!;
const resumes = () => h!.claudeCalls().filter(call => call.args.includes("--resume"));
const header = () => headerState(buildSnapshot(h!.engine), true, new Date());
function mergeByHand(): void {
  git(h!.sandbox, h!.engine.worktreePath, "push", "-q", "origin", "HEAD:develop");
  show("merged", featureHead());
}

describe("a merge session refused at a usage limit (AC-MERGE-05)", () => {
  it("waits on the Waiting screen naming Merge, and its resume reads GitHub first: a hand merge during the wait closes the activity without resuming", async () => {
    await finished([refused()]);
    atLimit();
    await control("merge");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("waiting");
    expect(page.waiting).toMatchObject({ phaseId: MERGE_KEY });
    expect(page.afterDelivery?.merge?.state).toBe("waiting");
    expect(status().after_delivery).toMatchObject({ merge: { state: "waiting" } });
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Merging: the merge session is waiting for usage.");
    mergeByHand();
    // A reload during the wait only saves what GitHub shows; the wait stays until its resume reads GitHub (Kiln After Delivery, "While open").
    await expect(h!.engine.checkCompletedPlan()).rejects.toThrow("Kiln checks for new phases once it confirms the merge.");
    expect(h!.engine.record.afterDelivery!.pullRequests[0]!.state).toBe("merged");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    expect(await control("resume")).toMatchObject({ state: "completed", outcome: "already_done" });
    expect(h!.engine.waitingPhaseKey()).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);
    expect(h!.engine.currentlyComplete).toBe(true);
  });
});

describe("Ctrl+C and the next kiln run (AC-MERGE-05)", () => {
  it("holds an interrupted merge session on the finished page, marked Interrupted, until Resume resumes the same session", async () => {
    await finished([hanging(), merging()]);
    await pressWhileRunning();
    // While it runs: no Pause after, so the reset line is the running session's (Kiln Run Restart's third reset.reason row).
    expect(controlOf("reset")).toMatchObject({ available: false, reason: "A session is still running. Reset becomes available when it ends." });
    expect(buildSnapshot(h!.engine).feature.timing!.advancing).toBe("running");
    const session = h!.engine.latestSession(MERGE_KEY)!;
    await h!.engine.stop("sigint");
    // `kiln status` with no Kiln running: nothing runs, so the merge reads interrupted, never running.
    expect(afterDeliveryText(afterDeliveryFacts(h!.reopenFromDisk().record) as Parameters<typeof afterDeliveryText>[0], false)).toBe("Merging, interrupted: resume with kiln continue.");

    expect(await kilnRun()).toMatchObject({ kind: "resume", phaseKey: MERGE_KEY });
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("complete");
    expect(page.restartReview).toEqual({ activityKey: MERGE_KEY, action: "resume" });
    expect(page.afterDelivery!.merge!.state).toBe("interrupted");
    expect(page.phases.at(-1)).toMatchObject({ id: MERGE_KEY, interrupted: true });
    expect(header()).toMatchObject({ label: "Merging", facts: expect.arrayContaining(["Interrupted · Resume to carry on"]) });
    // Nothing resumes until Resume, and no preflight is marked on a run that has none.
    expect(resumes()).toEqual([]);
    expect(h!.engine.record.preflight?.due).toBeUndefined();
    expect(controlOf("continue").available).toBe(true);
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Merging, interrupted: resume with kiln continue.");
    expect(status().after_delivery).toMatchObject({ merge: { state: "interrupted" } });

    // Resume (the page's button, and `kiln continue`, submit `continue`) reads GitHub again and resumes the same session.
    await control("continue");
    expect(resumes()).toHaveLength(1);
    expect(resumes()[0]!.args).toContain(session.sessionId);
    expect(resumes()[0]!.prompt).toContain("Carry on merging the delivery's pull requests from where you stopped.");
    expect(h!.engine.record.afterDelivery!.merge).toMatchObject({ summary: SUMMARY, closedAt: expect.any(String) });
    expect(h!.engine.record.preflight?.due).toBeUndefined();
    // Complete again: the totals stop at the merge's close, not at the first completion (time totals AC-TOTAL-03).
    const done = buildSnapshot(h!.engine);
    expect(done.feature.state).toBe("complete");
    expect(done.feature.timing!.advancing).toBeUndefined();
    expect(done.feature.timing!.asOf).toBe(h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(done.feature.completeUntil).toBe(h!.engine.record.afterDelivery!.merge!.closedAt);
  });

  it("closes the activity at kiln run, with no review, when the merge was finished on GitHub meanwhile", async () => {
    await finished([hanging()]);
    await pressWhileRunning();
    await h!.engine.stop("sigint");
    mergeByHand();
    expect(await kilnRun()).toMatchObject({ kind: "complete" });
    expect(h!.engine.restartReview).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBeUndefined();
    expect(resumes()).toEqual([]);
  });

  it("resumes at once with kiln run --resume, and allows the resume with a merge left in progress in the worktree", async () => {
    await finished([hanging(), merging()]);
    await pressWhileRunning();
    await h!.engine.stop("sigint");
    // Interrupted in the middle of a conflict: the merge of the base is still in progress, with a file half resolved.
    const gitDir = git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "--absolute-git-dir").trim();
    writeFileSync(join(gitDir, "MERGE_HEAD"), `${featureHead()}\n`);
    writeFileSync(join(h!.engine.worktreePath, "src", "intake.txt"), "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> develop\n");
    expect(await kilnRun(true)).toMatchObject({ kind: "resume", phaseKey: MERGE_KEY });
    expect(h!.engine.restartReview).toBeUndefined();
    await waitFor(() => !!h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(resumes()).toHaveLength(1);
    expect(h!.engine.record.preflight?.due).toBeUndefined();
  });
});

describe("Ctrl+C and the folders at kiln run (AC-MERGE-05)", () => {
  it("closes the activity without resuming when Resume at the restart hold finds the merge finished on GitHub", async () => {
    await finished([hanging()]);
    await pressWhileRunning();
    await h!.engine.stop("sigint");
    expect(await kilnRun()).toMatchObject({ kind: "resume", phaseKey: MERGE_KEY });
    mergeByHand();
    await control("continue");
    expect(h!.engine.restartReview).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge).toMatchObject({ closedAt: expect.any(String) });
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBeUndefined();
    expect(resumes()).toEqual([]);
  });

  it("stops at Needs you, resuming nothing, when kiln run --resume finds the worktree removed", async () => {
    await finished([hanging()]);
    await pressWhileRunning();
    await h!.engine.stop("sigint");
    rmSync(h!.engine.worktreePath, { recursive: true, force: true });
    await kilnRun(true);
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    const stop = h!.engine.record.phases[MERGE_KEY]!.stop!;
    expect(stop.kind).toBe("merge_check");
    expect(stop.checks.map(check => check.name)).toEqual(["acme-shop #218", "acme-shop worktree"]);
    expect(stop.checks[1]!.facts[0]).toBe(`Kiln can't carry on the merge in acme-shop's worktree, ${h!.engine.record.repositories[0]!.worktreePath}: it is not there.`);
    expect(resumes()).toEqual([]);
  });

  it("stops at the wait's resume, resuming nothing, when the worktree no longer holds the press head", async () => {
    await finished([refused()]);
    atLimit();
    await control("merge");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    git(h!.sandbox, h!.engine.worktreePath, "reset", "-q", "--hard", "HEAD~1");
    await control("resume");
    expect(h!.engine.waitingPhaseKey()).toBeUndefined();
    expect(h!.engine.record.phases[MERGE_KEY]!.stop).toMatchObject({ kind: "merge_check", checks: [expect.objectContaining({ name: "acme-shop #218" }), expect.objectContaining({ name: "acme-shop worktree", facts: [expect.stringContaining("its head no longer contains")] })] });
    expect(resumes()).toEqual([]);
  });
});

describe("waits and holds (AC-MERGE-05)", () => {
  it("resumes the same session after the wait when the pull request is still open, and the run counts the time", async () => {
    await finished([refused(), merging()]);
    atLimit();
    await control("merge");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    expect(header()).toMatchObject({ label: "Waiting for usage", facts: [ "Merge", expect.stringMatching(/^Waiting since /) ] });
    expect(buildSnapshot(h!.engine).feature.timing!.advancing).toBe("waiting");
    expect(await control("resume")).toMatchObject({ state: "completed", outcome: "session_resumed" });
    await waitFor(() => !!h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(resumes()).toHaveLength(1);
    expect(h!.engine.latestSession(MERGE_KEY)!.runs).toHaveLength(2);
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBe(SUMMARY);
  });

  it("after Ctrl+C during the wait, kiln run shows the finished page marked Interrupted, and Resume restarts the wait", async () => {
    await finished([refused()]);
    atLimit();
    await control("merge");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    await h!.engine.stop("sigint");
    expect(await kilnRun()).toMatchObject({ kind: "waiting", phaseKey: MERGE_KEY });
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("complete");
    expect(page.afterDelivery!.merge!.state).toBe("interrupted");
    expect(header()).toMatchObject({ label: "Merging", facts: expect.arrayContaining(["Interrupted · Resume to carry on"]) });
    await control("continue");
    expect(h!.engine.restartReview).toBeUndefined();
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    expect(buildSnapshot(h!.engine).feature.state).toBe("waiting");
    expect(resumes()).toEqual([]);
  });

  it("stops at the wait's resume, resuming nothing, when GitHub can't be read", async () => {
    await finished([refused()]);
    atLimit();
    await control("merge");
    h!.setPullRequestViews({ [KEY]: { error: "HTTP 502: Bad Gateway" } });
    await control("resume");
    expect(h!.engine.waitingPhaseKey()).toBeUndefined();
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(h!.engine.record.phases[MERGE_KEY]!.stop!.kind).toBe("merge_check");
    expect(buildSnapshot(h!.engine).needsYou!.checks[0]!.facts[0]).toContain("HTTP 502: Bad Gateway");
    expect(resumes()).toEqual([]);
  });

  it("launches the merge session once the person approves billing and presses Check again", async () => {
    await finished([merging()]);
    h!.env.ANTHROPIC_API_KEY = "merge-billing-canary";
    await h!.engine.refreshBilling();
    await control("merge");
    expect(h!.engine.record.billing?.hold).toMatchObject({ phaseKey: MERGE_KEY });
    // An approval can be given again while the merge activity is open (technical design, "Gates").
    await h!.engine.billingCommand("approval", { executionId: h!.engine.record.executionId, selectionGeneration: h!.engine.record.settings.selectionGeneration ?? 0, readingId: h!.engine.billing.view.next!.readingId, approved: true });
    await control("check-again");
    await waitFor(() => !!h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(h!.engine.record.billing?.hold).toBeUndefined();
    expect(mergeCalls()).toHaveLength(1);
    expect(h!.engine.latestSession(MERGE_KEY)!.runs[0]!.billing).toMatchObject({ route: "metered", approved: true });
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBe(SUMMARY);
  });

  it("shows Needs you at a billing hold, and Check again reads GitHub: a hand merge closes the activity", async () => {
    await finished([merging()]);
    // The launch environment changed after the run finished: the merge session's launch is held for billing.
    h!.env.ANTHROPIC_API_KEY = "merge-billing-canary";
    await h!.engine.refreshBilling();
    await control("merge");
    expect(h!.engine.record.billing?.hold).toMatchObject({ phaseKey: MERGE_KEY, action: "launch" });
    expect(mergeCalls()).toEqual([]);
    expect(buildSnapshot(h!.engine).feature.state).toBe("needs_you");
    expect(buildSnapshot(h!.engine).afterDelivery!.merge!.state).toBe("stopped");
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Merging: the merge session stopped before merging; it needs you.");
    expect(await control("check-again")).toMatchObject({ state: "completed" });
    expect((h!.engine.record.billing!.hold!.checks ?? []).map(check => check.name)).toEqual(["acme-shop #218", "Billing approval"]);
    mergeByHand();
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "already_done" });
    expect(h!.engine.record.billing?.hold).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(mergeCalls()).toEqual([]);
  });
});

describe("the merge session's folders at every launch and resume (AC-MERGE-05)", () => {
  it("refuses Resume at a stop, naming the repository and folder, when the worktree was removed or its head no longer holds the press head", async () => {
    await finished([stopping("Waiting on a review.")]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    const worktree = h!.engine.worktreePath;
    const head = featureHead();
    git(h!.sandbox, worktree, "commit", "-q", "--allow-empty", "-m", "base work");
    git(h!.sandbox, worktree, "reset", "-q", "--hard", "HEAD~2");
    const behind = await control("resume");
    expect(behind).toMatchObject({ state: "failed", reason: `Kiln can't carry on the merge in acme-shop's worktree, ${h!.engine.record.repositories[0]!.worktreePath}: its head no longer contains ${head.slice(0, 7)}, the head it had when Merge was pressed.` });
    git(h!.sandbox, worktree, "reset", "-q", "--hard", head);
    rmSync(worktree, { recursive: true, force: true });
    expect(await control("resume")).toMatchObject({ state: "failed", reason: `Kiln can't carry on the merge in acme-shop's worktree, ${h!.engine.record.repositories[0]!.worktreePath}: it is not there.` });
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(resumes()).toEqual([]);
    // A moved main checkout: GitHub can't be read from it, so Resume is refused with the reason and nothing resumes.
    const moved = `${h!.repository}-moved`;
    renameSync(h!.repository, moved);
    expect(await control("resume")).toMatchObject({ state: "failed", reason: expect.stringContaining(h!.repository) });
    expect(resumes()).toEqual([]);
    renameSync(moved, h!.repository);
    // Check again still reads GitHub, so a merge finished by hand is still shown.
    git(h!.sandbox, h!.repository, "push", "-q", "origin", `${head}:refs/heads/develop`);
    h!.setPullRequestViews({ [KEY]: recordedPullRequest("merged", { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head, mergeCommit: head }) });
    expect(await control("check-again")).toMatchObject({ outcome: "already_done" });
  });

  it("gives the session only the worktrees of pull requests still to merge, so a merged repository's removed worktree never stops it", async () => {
    await finished([stopping("Waiting on a review."), merging()]);
    await control("merge");
    // A second repository of the delivery whose pull request merged earlier, and whose worktree was then removed.
    const record = h!.engine.record;
    const gone = join(h!.sandbox.root, "removed-returns-api");
    record.repositories.push({ ...record.repositories[0]!, name: "returns-api", kind: "named", worktreePath: gone, github: "acme/returns-api" });
    record.pullRequests!.push({ ...record.pullRequests![0]!, repository: "returns-api", number: 57, url: "https://github.com/acme/returns-api/pull/57" });
    record.afterDelivery!.pullRequests.push({ repository: "returns-api", number: 57, state: "merged", mergedAt: new Date().toISOString(), mergeCommit: "a".repeat(40), readAt: new Date().toISOString() });
    expect(h!.engine.sessionRepositories.map(entry => entry.name)).toEqual(["acme-shop"]);
    // A Codex session's assigned worktrees and writable roots come from the same set.
    const codex = (h!.engine as unknown as { codexLaunchOptions(cwd: string): { writableRoots: string[]; repositories: { path: string }[] } }).codexLaunchOptions(h!.engine.sessionFolder);
    expect(codex.repositories.map(one => one.path)).toEqual([h!.engine.worktreePath]);
    expect(codex.writableRoots).not.toContain(gone);
    expect(await control("resume")).toMatchObject({ state: "completed" });
    await waitFor(() => !!h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(resumes()).toHaveLength(1);
    expect(resumes()[0]!.args).not.toContain(gone);
    // Once the merge activity is closed, sessions are given every set-up repository again.
    expect(h!.engine.sessionRepositories.map(entry => entry.name)).toEqual(["acme-shop", "returns-api"]);
  });
});
