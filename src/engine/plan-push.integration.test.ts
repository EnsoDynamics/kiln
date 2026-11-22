// Kiln After Delivery, Phase 3 (Continue pushes the plan first) with real Git, a local bare origin
// behind the run's GitHub address, scripted provider sessions and the control journal. No paid
// model calls. The push session "pushes" with real Git from the person's main checkout; Kiln
// decides Done only from its own reading of origin's base branch.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarness, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { observePlan, retainBaseline } from "./plan-reconciliation.js";
import { recordedPlan } from "./plan-reading.js";
import { writePrdRecord, type PrdRecord } from "../state/records.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { buildSnapshot } from "./snapshot.js";
import { statusProjection } from "../control/projection.js";
import { afterDeliveryFacts, afterDeliveryText } from "../control/delivered-facts.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import { readAcceptance } from "./continuation-state.js";
import { planPushKey } from "../state/activity-keys.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import type { Receipt } from "../control/commands.js";
import type { Engine } from "./engine.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { headerState } from "../../view/src/lib/progress.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const folder = "comet-library"; const directory = `docs/prds/${folder}`;
const phase = "# Phase 1: Catalog\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-COMET-01\n";
const lending = "# Phase 9: Lending\n\n## Acceptance criteria covered\nAC-COMET-01\n\n## Phase dependencies\n1.\n";
const reservations = "# Phase 10: Reservations\n\n## Acceptance criteria covered\nAC-COMET-01\n\n## Phase dependencies\n1.\n";

/** The push session's scripted push, a plain `git push` from the main checkout, as the prompt says. */
const pushing = (before: Record<string, unknown>[] = []): ScenarioSession => ({ actions: [...before, { bash: "git push -q origin develop" }, { result: "Pushed a41c0d2 to develop." }, { exit: 0 }] });
const stopping = (message: string): ScenarioSession => ({ actions: [{ result: message }, { exit: 0 }] });
/** Phase 9's session in the build Continue starts: it stops, which is enough to show the build began. */
const building: ScenarioSession = { actions: [{ result: "Started phase 9." }, { exit: 0 }] };

/** A finished, merged run of phase 1, whose main checkout then commits phase 9 to develop without pushing it. */
let claude: ScriptedClaude | undefined;
async function finished(sessions: ScenarioSession[]): Promise<Harness> {
  claude = new ScriptedClaude(() => new Date());
  claude.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 40)])));
  h = await createHarness({ folder, auditCycles: true, sessions, engineOptions: { claude }, files: { "comet-prd.md": "# PRD: Comet\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n", "comet-technical-design.md": "# Design\nCatalog.\n", "phase-1-catalog.md": phase } });
  h.useGithubOrigin();
  const source = observePlan(h.repository, directory); const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const record = h.engine.record;
  record.repositories = [{ name: "acme-shop", kind: "prd", mainCheckoutPath: h.repository, github: "acme/acme-shop", baseBranch: "develop", worktreePath: join(h.sandbox.root, "old-workspace"), baseCommit: revision, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  record.setupCompletedAt = "2026-10-01T10:00:00Z"; record.startedAt = "2026-10-01T10:00:00Z"; record.completedAt = "2026-10-01T12:00:00Z";
  record.plan = recordedPlan(source.plan);
  record.phases["1"] = { doneAt: "2026-10-01T11:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  record.phases.pr = { doneAt: "2026-10-01T12:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: directory, active: source, sources: [], completions: { "1": { kind: "external", revision } } }).id };
  record.pullRequests = [{ repository: "acme-shop", number: 12, title: "Comet catalog delivered", url: "https://github.com/acme/acme-shop/pull/12", head: "feature/comet-library", base: "develop", commits: 2, additions: 20, deletions: 0 }];
  h.setPullRequestViews({ "acme/acme-shop#12": recordedPullRequest("merged", { number: 12, base: "develop", url: "https://github.com/acme/acme-shop/pull/12", mergeCommit: revision }) });
  writePrdRecord(h.stateDirectory, record);
  commitLocally("phase-9-lending.md", lending, "docs(comet): add lending");
  return h;
}
function commitLocally(file: string, text: string, message: string): string {
  writeFileSync(join(h!.repository, directory, file), text);
  git(h!.sandbox, h!.repository, "add", join(directory, file)); git(h!.sandbox, h!.repository, "commit", "-qm", message);
  return git(h!.sandbox, h!.repository, "rev-parse", "HEAD").trim();
}
const remoteHead = () => git(h!.sandbox, h!.origin, "rev-parse", "refs/heads/develop").trim();
const localHead = () => git(h!.sandbox, h!.repository, "rev-parse", "HEAD").trim();
/** The offer read from the main checkout, as the page's load reads it. */
async function offer() {
  const check = await h!.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "available", result: { source: { kind: "main_checkout" } } });
  return check.result!.proposal!;
}
/** Continue, from the page. */
async function pressContinue(proposalId: string, commandId = "continue-1") {
  const answer = await h!.engine.continuationCommand("accept", { proposalId, executionId: h!.engine.record.executionId!, commandId, statusToken: h!.engine.controlView().token });
  return answer;
}
let commands = 0;
async function control(action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `push-${++commands}`;
  const answer = h!.engine.commands.submit({ command_id, execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await h!.engine.commands.settled(); await h!.engine.settled();
  return h!.engine.commands.lookup(command_id).operation as Receipt;
}
const pushCalls = () => h!.claudeCalls().filter(call => call.prompt.includes("You are pushing the plan of"));
const buildCalls = () => h!.claudeCalls().filter(call => call.prompt.includes("phase-9-lending.md") && !call.prompt.includes("You are pushing the plan of"));
const status = () => statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { after_delivery: Parameters<typeof afterDeliveryText>[0] & Record<string, unknown>; controls: { name: string; available: boolean; reason: string | null }[] };
/** Waits until the build Continue started has activated its fresh execution and run phase 9's session. */
async function buildStarted(completedExecutionId: string) {
  await waitFor(() => h!.engine.record.executionId !== completedExecutionId && buildCalls().length > 0, 30_000);
  await h!.engine.settled();
}

/** From here on every account reading shows the 5-hour window used up, so a wait holds until the test resumes it. */
function atLimit(): void {
  (claude as unknown as { queued: unknown[] }).queued.length = 0;
  const resetsAt = new Date(Date.now() + 3_600_000).toISOString();
  claude!.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 100, resetsAt)])));
}
/** A push session refused by the 5-hour usage limit before it pushed anything. */
const refused = (): ScenarioSession => ({ actions: [{ text: "Checking the commits." }, { refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] });
/** A push session that runs until the test interrupts it, saying when it started. */
const hanging = (started: string): ScenarioSession => ({ actions: [{ touch: started }, { work: "git fetch origin develop" }] });
/** The next `kiln run`: a new engine over the record on disk, prepared and judged, with the restart review. */
async function kilnRun(): Promise<Awaited<ReturnType<Engine["decide"]>>> {
  h!.engine = h!.reopenFromDisk();
  await h!.engine.agents.refresh();
  expect(await h!.engine.prepare()).toEqual({ ok: true });
  const decision = await h!.engine.decide({ review: true });
  await h!.engine.continue();
  await h!.engine.settled();
  return decision;
}

describe("Continue pushes the plan first (Kiln After Delivery AC-BACK-05, AC-MERGE-05, AC-MERGE-06, AC-BOT-01, AC-BOT-02)", () => {
  it("one press pushes from the main checkout, checks again and starts the build with no second press", async () => {
    await finished([pushing(), building]);
    writeFileSync(join(h!.repository, "scratch.txt"), "uncommitted, not Kiln's\n");
    const proposal = await offer();
    expect(proposal.commits).toEqual([{ sha: localHead(), subject: "docs(comet): add lending", onlyDocuments: true }]);
    const finishedExecution = h!.engine.record.executionId!;
    const tip = localHead();

    const answer = await pressContinue(proposal.id);
    expect(answer).toMatchObject({ ok: true, status: 202 });
    const key = (answer as { planPush: string }).planPush;
    expect(key).toMatch(/^plan-push-/);
    await buildStarted(finishedExecution);

    // One push session, in the main checkout alone, with the commits and the rules (AC-BACK-05).
    expect(pushCalls()).toHaveLength(1);
    const call = pushCalls()[0]!;
    expect(call.cwd).toBe(h!.repository);
    expect(call.args).not.toContain("--add-dir");
    for (const line of ["Work only in the main checkout", `- ${tip.slice(0, 7)} docs(comet): add lending`, "push nothing and end there", "Push with a plain `git push origin develop`. Never force-push.", "Never stash, commit, change or discard uncommitted work", "abort the merge (`git merge --abort`)", "No reply permits a forced push or touching uncommitted work."]) expect(call.prompt).toContain(line);
    expect(remoteHead()).toBe(tip);
    expect(readFileSync(join(h!.repository, "scratch.txt"), "utf8")).toBe("uncommitted, not Kiln's\n");

    // The build started from the base holding the documents, after the push: exactly one acceptance, linked to the push.
    const acceptances = h!.engine.record.continuation!.acceptances.filter(row => row.state !== "superseded");
    expect(acceptances).toHaveLength(1);
    const acceptance = readAcceptance(h!.stateDirectory, acceptances[0]!.id);
    expect(acceptance.planPushKey).toBe(key);
    expect(acceptance.proposal.source).toEqual({ kind: "remote_base", branch: "develop", revision: tip });
    expect(acceptance.repositories[0]!.baseCommit).toBe(tip);

    // The fresh execution shows the Push the plan row Done before its first added phase, read from the archived execution.
    const rows = buildSnapshot(h!.engine).phases;
    const at = rows.findIndex(row => row.id === key);
    expect(rows[at]).toMatchObject({ kind: "plan_push", title: "Push the plan", state: "done", executionId: finishedExecution });
    expect(rows[at + 1]?.id).toBe("9");
    expect(rows[at]!.details?.sessionId).toBeDefined();
    // The archived execution keeps the push's facts and session, closed.
    const archived = h!.engine.historicalExecution(finishedExecution)!.record;
    const push = archived.afterDelivery!.planPushes![0]!;
    expect(push).toMatchObject({ operationId: key.replace("plan-push-", ""), doneAt: expect.any(String), closedAt: expect.any(String), offered: [{ id: "9", phaseScopeDigest: expect.any(String) }] });
    expect(archived.phases[key]!.sessionIds).toHaveLength(1);
  });

  it("shows the push on the finished page while it runs, with no live controls, and kiln status says so", async () => {
    const gate = join(tmpdir(), `kiln-push-gate-${process.pid}-${Date.now()}`);
    await finished([pushing([{ waitForFile: gate }]), building]);
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const answer = await pressContinue(proposal.id);
    const key = (answer as { planPush: string }).planPush;
    await waitFor(() => pushCalls().length === 1 && h!.engine.current?.processRunning === true);
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("complete");
    expect(page.afterDelivery?.planPush).toMatchObject({ key, state: "running", proposalId: proposal.id });
    expect(page.phases.at(-1)).toMatchObject({ id: key, kind: "plan_push", title: "Push the plan", state: "implementing" });
    // Like the pull request session: no message, pause or takeover, and the page says why (AC-MERGE-05).
    const controls = h!.engine.controlView().controls;
    for (const name of ["message", "take-over", "request-pause"]) expect(controls.find(one => one.name === name)).toMatchObject({ available: false, reason: "Like the pull request session, the push session can’t be messaged, paused or taken over while it runs." });
    expect(controls.find(one => one.name === "reset")?.reason).toBe("A session is still running. Reset becomes available when it ends.");
    // Exit Kiln waits for the session to end (Kiln After Delivery AC-EXIT-01).
    expect(controls.find(one => one.name === "exit")).toMatchObject({ available: false, reason: "Exit Kiln returns once the session ends, or once Kiln has started it. Ctrl+C still stops everything, the session included." });
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Pushing the plan: the push session is running.");
    expect(h!.engine.newPhaseControls().find(one => one.name === "continue-with-phases")).toMatchObject({ available: false });
    writeFileSync(gate, "");
    await buildStarted(finishedExecution);
  });

  it("stops at Needs you when the local base holds another commit, then a reply pushes it too and the build starts", async () => {
    const message = "develop on this machine holds another commit that would be pushed along, c93e1b4 “wip: gift card copy”. Nothing was pushed. Reply to push it too, and the session pushes it with the plan.";
    await finished([stopping(message), pushing(), building]);
    writeFileSync(join(h!.repository, "gift-cards.txt"), "copy\n"); git(h!.sandbox, h!.repository, "add", "gift-cards.txt"); git(h!.sandbox, h!.repository, "commit", "-qm", "wip: gift card copy");
    const proposal = await offer();
    expect(proposal.commits?.map(commit => commit.onlyDocuments)).toEqual([true, false]);
    const before = remoteHead();
    const finishedExecution = h!.engine.record.executionId!;
    const answer = await pressContinue(proposal.id);
    const key = (answer as { planPush: string }).planPush;
    await waitFor(() => pushCalls().length === 1);
    expect(pushCalls()[0]!.prompt).toContain("wip: gift card copy (touches more than this PRD's documents)");
    await waitFor(() => h!.engine.stoppedPhaseKey() === key);
    expect(remoteHead()).toBe(before);
    // The existing Needs you page: the last message word for word, Resume and Check again, no Mark complete, carry-on or fresh session (AC-MERGE-06).
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("needs_you");
    expect(page.needsYou).toMatchObject({ phaseId: key, kind: "plan_push_check", finalMessage: message });
    // A push stop on a finished run offers Exit Kiln too (Kiln After Delivery AC-EXIT-01).
    expect(page.exit).toMatchObject({ available: true });
    expect(page.needsYou?.checks).toEqual([expect.objectContaining({ name: "origin/develop", passed: false })]);
    expect(h!.engine.markCompleteOffer()).toMatchObject({ offered: false });
    expect(h!.engine.carryOnControl().offered).toBe(false);
    expect(h!.engine.startAgainControl().offered).toBe(false);
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Pushing the plan: the push session stopped before pushing the plan; it needs you.");
    // Check again reads origin and keeps the stop.
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "completion_checks_failed" });
    expect(h!.engine.stoppedPhaseKey()).toBe(key);

    const reply = await control("reply", { message: "Push it too." });
    expect(reply).toMatchObject({ state: "completed" });
    await buildStarted(finishedExecution);
    expect(pushCalls()).toHaveLength(1);
    // The resume went to the same session with the reply first and the push session's carry-on (AC-MERGE-06).
    const resumed = h!.claudeCalls().find(call => call.prompt.includes("Carry on pushing this PRD's documents"))!;
    expect(resumed.prompt).toContain("Push it too.");
    expect(resumed.cwd).toBe(h!.repository);
    expect(remoteHead()).toBe(git(h!.sandbox, h!.repository, "rev-parse", "develop").trim());
  });

  it("is Done when the person pushes by hand during a stop: Check again starts the build without resuming", async () => {
    await finished([stopping("The push was refused: remote rejected develop (protected branch hook declined)."), building]);
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => h!.engine.stoppedPhaseKey() === key);
    expect(buildSnapshot(h!.engine).needsYou?.finalMessage).toBe("The push was refused: remote rejected develop (protected branch hook declined).");
    git(h!.sandbox, h!.repository, "push", "-q", "origin", "develop");
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "already_done" });
    await buildStarted(finishedExecution);
    expect(h!.claudeCalls().filter(call => call.prompt.includes("Carry on pushing"))).toEqual([]);
  });

  it("shows a refreshed offer for a fresh choice when the push brings in other phases, and nothing starts", async () => {
    const gate = join(tmpdir(), `kiln-push-gate-${process.pid}-${Date.now()}`);
    await finished([pushing([{ waitForFile: gate }, { bash: "git pull -q --no-rebase --no-edit origin develop" }]), { actions: [{ result: "Started phase 9." }, { exit: 0 }] }]);
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    // While the push session works, someone else pushes phase 10 to origin/develop; the session merges it in.
    await waitFor(() => pushCalls().length === 1);
    const elsewhere = join(h!.sandbox.root, "elsewhere");
    git(h!.sandbox, h!.sandbox.root, "clone", "-q", "-b", "develop", h!.origin, elsewhere);
    writeFileSync(join(elsewhere, directory, "phase-10-reservations.md"), reservations);
    git(h!.sandbox, elsewhere, "add", "-A"); git(h!.sandbox, elsewhere, "commit", "-qm", "docs(comet): add reservations"); git(h!.sandbox, elsewhere, "push", "-q", "origin", "develop");
    writeFileSync(gate, "");
    await waitFor(() => !!h!.engine.record.afterDelivery?.planPushes?.[0]?.closedAt);
    await h!.engine.settled();
    expect(h!.engine.record.executionId).toBe(finishedExecution);
    expect(h!.engine.record.continuation?.acceptances ?? []).toEqual([]);
    const check = h!.engine.record.completedPlanCheck!;
    expect(check).toMatchObject({ status: "available", result: { source: { kind: "remote_base" }, added: [{ id: "9" }, { id: "10" }], followsPush: key } });
    expect(h!.engine.record.afterDelivery!.planPushes![0]).toMatchObject({ doneAt: expect.any(String), closedAt: expect.any(String), refreshedScope: check.result!.proposal!.scopeDigest });
    expect(buildSnapshot(h!.engine).feature.state).toBe("complete");
    // The re-check showed an offer that does not match, so Exit Kiln is offered again (Kiln After Delivery AC-EXIT-01).
    expect(h!.engine.controlView().controls.find(one => one.name === "exit")).toMatchObject({ available: true });
    // A person's acceptance of the refreshed offer carries the push, so the build shows its row.
    const accepted = await pressContinue(check.result!.proposal!.id, "continue-2");
    expect(accepted).toMatchObject({ ok: true });
    const acceptance = h!.engine.record.continuation!.acceptances.find(row => row.state !== "superseded")!;
    expect(readAcceptance(h!.stateDirectory, acceptance.id).planPushKey).toBe(key);
    await waitFor(() => h!.claudeCalls().length === 2, 30_000);
    await h!.engine.settled();
    expect(buildSnapshot(h!.engine).phases.find(row => row.id === key)).toMatchObject({ state: "done", executionId: finishedExecution });
  });

  it("is Done, and starts nothing, when the person withdraws the plan by resetting the local base", async () => {
    await finished([stopping("Waiting for you.")]);
    const proposal = await offer();
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => h!.engine.stoppedPhaseKey() === key);
    git(h!.sandbox, h!.repository, "reset", "-q", "--hard", remoteHead());
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "already_done" });
    await waitFor(() => !!h!.engine.record.afterDelivery?.planPushes?.[0]?.closedAt);
    await h!.engine.settled();
    expect(h!.engine.record.completedPlanCheck).toMatchObject({ status: "unchanged" });
    expect(h!.engine.record.continuation?.acceptances ?? []).toEqual([]);
    expect(buildSnapshot(h!.engine).feature.state).toBe("complete");
  });

  it("starts the build at the next kiln run when Kiln stopped after Done and before its check", async () => {
    await finished([stopping("Waiting for you."), building]);
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => h!.engine.stoppedPhaseKey() === key);
    // The plan reaches origin, and Kiln records Done, then stops before the check that follows.
    git(h!.sandbox, h!.repository, "push", "-q", "origin", "develop");
    const record = JSON.parse(JSON.stringify(h!.engine.record)) as PrdRecord;
    const push = record.afterDelivery!.planPushes![0]!;
    push.doneAt = new Date().toISOString(); delete record.phases[key]!.stop; record.phases[key]!.doneAt = push.doneAt;
    await h!.engine.stop("sigint");
    writePrdRecord(h!.stateDirectory, record);
    const engine = h!.reopenFromDisk();
    const decision = await engine.decide({ review: true });
    expect(decision).toEqual({ kind: "plan_push_accepting" });
    // While the push is past Done and its check may start the build, Exit Kiln is unavailable (Kiln After Delivery AC-EXIT-01).
    expect(engine.controlView().controls.find(one => one.name === "exit")).toMatchObject({ available: false, reason: "Kiln is checking for new phases after pushing the plan. Exit Kiln returns once Kiln has started the build or shown what it found." });
    expect(formatDecisionLine(decision, engine, terminalColors({}, {}))).toContain("The plan is pushed. Checking for new phases again before starting the build.");
    await engine.continue();
    await buildStarted(finishedExecution);
    expect(engine.record.continuation!.acceptances.filter(row => row.state !== "superseded")).toHaveLength(1);
    expect(engine.commands.all().filter(receipt => receipt.state === "indeterminate")).toEqual([]);
    expect(existsSync(join(h!.repository, ".git"))).toBe(true);
    expect(planPushKey(push.operationId)).toBe(key);
  });
  it("waits for usage on the Waiting screen naming Push the plan; its resume reads origin first, so a hand push starts the build without resuming", async () => {
    await finished([refused(), building]);
    atLimit();
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => h!.engine.waitingPhaseKey() === key);
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("waiting");
    expect(page.waiting).toMatchObject({ phaseId: key });
    expect(headerState(page, true, new Date())).toMatchObject({ label: "Waiting for usage", facts: expect.arrayContaining(["Push the plan"]) });
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Pushing the plan: the push session is waiting for usage.");
    // The Waiting screen of a push session's wait offers Exit Kiln (Kiln After Delivery AC-EXIT-01).
    expect(page.exit).toMatchObject({ available: true });
    git(h!.sandbox, h!.repository, "push", "-q", "origin", "develop");
    expect(await control("resume")).toMatchObject({ state: "completed", outcome: "already_done" });
    await buildStarted(finishedExecution);
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);
  });

  it("holds a push interrupted by Ctrl+C on the finished page until Resume, which carries on the same session and starts the build", async () => {
    const started = join(tmpdir(), `kiln-push-started-${process.pid}-${Date.now()}`);
    await finished([hanging(started), pushing(), building]);
    const proposal = await offer();
    const finishedExecution = h!.engine.record.executionId!;
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => existsSync(started));
    const session = h!.engine.latestSession(key)!;
    await h!.engine.stop("sigint");
    expect(afterDeliveryText(afterDeliveryFacts(h!.reopenFromDisk().record) as Parameters<typeof afterDeliveryText>[0], false)).toBe("Pushing the plan, interrupted: resume with kiln continue.");

    expect(await kilnRun()).toMatchObject({ kind: "resume", phaseKey: key });
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("complete");
    expect(page.afterDelivery!.planPush!.state).toBe("interrupted");
    expect(page.phases.at(-1)).toMatchObject({ id: key, interrupted: true });
    expect(headerState(page, true, new Date())).toMatchObject({ label: "Pushing the plan", facts: expect.arrayContaining(["Interrupted · Resume to carry on"]) });
    // Held at the restart review, the push session runs nothing, so Exit Kiln is offered (Kiln After Delivery AC-EXIT-01).
    expect(page.exit).toMatchObject({ available: true });
    expect(h!.engine.record.preflight?.due).toBeUndefined();
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);

    await control("continue");
    await buildStarted(finishedExecution);
    const resumed = h!.claudeCalls().filter(call => call.args.includes("--resume"));
    expect(resumed).toHaveLength(1);
    expect(resumed[0]!.args).toContain(session.sessionId);
    expect(resumed[0]!.prompt).toContain("Carry on pushing this PRD's documents");
    expect(remoteHead()).toBe(git(h!.sandbox, h!.repository, "rev-parse", "develop").trim());
  });

  it("refuses Resume at a push stop while the main checkout is on another branch, naming it", async () => {
    await finished([stopping("Waiting for you.")]);
    const proposal = await offer();
    const key = ((await pressContinue(proposal.id)) as { planPush: string }).planPush;
    await waitFor(() => h!.engine.stoppedPhaseKey() === key);
    git(h!.sandbox, h!.repository, "checkout", "-qb", "feature/gift-cards");
    const answer = await h!.engine.resume({});
    expect(answer).toMatchObject({ ok: false, code: "plan_push_folder_not_ready", reason: `Kiln can't push the plan from the main checkout at ${h!.engine.record.repository.mainCheckoutPath}: it is on feature/gift-cards, not develop. Switch it back to develop, then press Resume.` });
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);
    expect(h!.engine.stoppedPhaseKey()).toBe(key);
  });

  it("pushes first through kiln continue-with-phases too, and a later press after the first push closed opens a new key with the first push's facts unchanged", async () => {
    await finished([stopping("Waiting for you."), stopping("Waiting again.")]);
    const proposal = await offer();
    // kiln continue-with-phases submits the journal's continuation acceptance from the command line (control/server.ts).
    const answer = h!.engine.commands.submitInternal({ command_id: "cli-continue", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "continuation-accept", inputs: { proposal_id: proposal.id, via: "command_line" } });
    expect(answer.ok).toBe(true);
    await h!.engine.commands.settled();
    expect(h!.engine.commands.lookup("cli-continue").operation).toMatchObject({ state: "completed", outcome: "plan_push_started" });
    const first = h!.engine.record.afterDelivery!.planPushes![0]!;
    expect(first.via).toBe("command_line");
    const firstKey = planPushKey(first.operationId);
    await waitFor(() => h!.engine.stoppedPhaseKey() === firstKey);
    // The person withdraws the plan by resetting the local base: Check again finds the push Done, and the check that follows finds nothing to build.
    git(h!.sandbox, h!.repository, "reset", "-q", "--hard", remoteHead());
    expect(await control("check-again")).toMatchObject({ outcome: "already_done" });
    await waitFor(() => !!first.closedAt);
    await h!.engine.settled();
    const saved = JSON.stringify(h!.engine.record.afterDelivery!.planPushes![0]);
    // A new phase committed locally: the next Continue opens a new key and a new session.
    commitLocally("phase-9-lending.md", lending, "docs(comet): add lending again");
    const second = ((await pressContinue((await offer()).id, "continue-2")) as { planPush: string }).planPush;
    expect(second).not.toBe(firstKey);
    await waitFor(() => h!.engine.stoppedPhaseKey() === second);
    expect(JSON.stringify(h!.engine.record.afterDelivery!.planPushes![0])).toBe(saved);
    expect(h!.engine.record.phases[second]!.sessionIds).toHaveLength(1);
    expect(h!.engine.record.phases[second]!.sessionIds[0]).not.toBe(h!.engine.record.phases[firstKey]!.sessionIds[0]);
  });
});
