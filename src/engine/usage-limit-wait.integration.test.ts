import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Waiting out a usage limit (usage-limit recovery PRD AC-AUTO-01 to 05, AC-LIMIT-01 to 05),
// through the engine against real Git with the stand-in claude replaying a refusal as the Agent
// SDK types it, a scripted account reader and a clock the test moves: Kiln waits instead of
// stopping, resumes the same session at the first reading with usage left, and goes to Needs
// you when the wait can't free the account or the person switches it off.

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NOT_SIGNED_IN } from "../account/claude-account.js";
import type { Sleep } from "../platform/sleep-readings.js";
import { claudeConfigFolder, findTranscripts } from "../session/transcripts.js";
import { readPrdRecord } from "../state/records.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import type { Engine, EngineOptions } from "./engine.js";
import { readFileSync } from "node:fs";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const PHASE_1 = "docs/prds/customer-returns/phase-1-return-intake.md";
const CARRY_ON = `Carry on with \`${PHASE_1}\` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.`;
const seconds = (time: string) => time.replace(/\.\d+Z$/, "Z");
const limitOpening = (endedAt: string, limit = " (the 5-hour usage limit)") =>
  `This session stopped at \`${seconds(endedAt)}\` because Claude Code's usage limit${limit} refused its request. Kiln has resumed it on the Claude account signed in now.`;
const phaseEvents = (h: Harness) =>
  h.events.map((event) => (event.kind === "phase" ? `${event.phaseId} ${event.event}` : event.kind === "pull_request" ? `PR ${event.event}` : event.kind));

/** The test's clock: real time moved forward by `advance`, so runs keep their order. */
function testClock() {
  let offset = 0;
  return { now: () => new Date(Date.now() + offset), advance: (ms: number) => void (offset += ms) };
}

/** A phase session that works a little, then is refused by a usage limit. */
function refusedSession(refusal: { rateLimitType?: string | null; resetsAt?: number | null }, extra: Partial<ScenarioSession> = {}): ScenarioSession {
  return {
    actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Building the intake form." }, { write: { path: "src/partial.txt", content: "half done\n" } }, { refuse: refusal }, { exit: 1 }],
    ...extra,
  };
}
/** A resume refused at once, before any response. */
const refusedAgain = (refusal: { rateLimitType?: string | null; resetsAt?: number | null }): ScenarioSession => ({ actions: [{ refuse: refusal }, { exit: 1 }] });

const keepAwakeRecorder = () => {
  const states: boolean[] = [];
  return { states, holder: { error: undefined, set: (on: boolean) => void (states.at(-1) === on ? undefined : states.push(on)) } };
};

interface Setup {
  h: Harness;
  claude: ScriptedClaude;
  clock: ReturnType<typeof testClock>;
  /** The refusal's reset, Unix seconds, an hour after the harness was made. */
  reset: number;
}

/** The account reader for a test: the reading Kiln asks for as phase 1 starts, before any refusal, answered. */
function scriptedClaude(clock: ReturnType<typeof testClock>): ScriptedClaude {
  const claude = new ScriptedClaude(clock.now);
  claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
  return claude;
}

async function setup(sessions: (reset: number) => ScenarioSession[], options: Partial<EngineOptions> = {}): Promise<Setup> {
  const clock = testClock();
  const claude = scriptedClaude(clock);
  const reset = Math.floor(clock.now().getTime() / 1000) + 3_600;
  harness = await createHarness({ sessions: sessions(reset), engineOptions: { claude, now: clock.now, ...options } });
  return { h: harness, claude, clock, reset };
}

/** Starts the PRD and waits until phase 1 is waiting for usage with its first reading asked for. */
async function startToWait(s: Setup): Promise<void> {
  await s.h.engine.start({ refinementConfirmed: true });
  await s.h.engine.settled();
  expect(s.h.engine.waitingPhaseKey()).toBe("1");
  expect(s.claude.waiting).toBe(true);
}

/** Lets a resume Kiln started by itself run to its verdict. */
async function untilSettled(engine: Engine, condition: () => boolean): Promise<void> {
  await waitFor(condition);
  // A fresh next-phase conversation now requires another metadata read. Supply that
  // separate fixture reading after the recovery under test has completed.
  if (engine.isPhaseDone("1") && !engine.record.completedAt && engine.claude instanceof ScriptedClaude) {
    engine.claude.queue(signedIn(engine.claude.account?.limits ?? []));
  }
  await engine.settled();
}

const resetIso = (reset: number) => new Date(reset * 1000).toISOString();

/** Phase 1 closed, committed and pushed by the person in the worktree, as if they finished it by hand during the wait. */
function finishByHand(h: Harness): void {
  const worktree = h.engine.worktreePath;
  git(h.sandbox, worktree, "checkout", "-q", "--", ".");
  const doc = join(worktree, PHASE_1);
  const lines = readFileSync(doc, "utf8").split("\n");
  lines.splice(1, 0, "", "**Closed:** 2026-10-22");
  writeFileSync(doc, lines.join("\n"));
  git(h.sandbox, worktree, "add", "-A");
  git(h.sandbox, worktree, "commit", "-q", "-m", "feat: intake, finished by hand");
  git(h.sandbox, worktree, "push", "-q", "-u", "origin", "feature/customer-returns");
}

describe("waiting out a usage limit (AC-AUTO-01, AC-AUTO-02)", () => {
  it("waits instead of stopping, keeps waiting at a reading with no usage left, and resumes the same session at the first with usage left", async () => {
    const { states, holder } = keepAwakeRecorder();
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")], { keepAwake: holder });
    const { h, claude, reset } = s;
    await startToWait(s);

    // The phase and the PRD are Waiting for usage; no other phase started; the wait outlasts a restart on disk.
    const wait = h.engine.record.phases["1"]!.wait!;
    expect(wait).toMatchObject({ run: 0, checks: expect.arrayContaining([expect.objectContaining({ passed: false })]) });
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
    expect(readPrdRecord(h.stateDirectory)!.phases["1"]!.wait).toBeDefined();
    const shown = buildSnapshot(h.engine);
    expect(shown.feature.state).toBe("waiting");
    expect(shown.phases.find((phase) => phase.id === "1")!.state).toBe("waiting");
    expect(shown.waiting).toMatchObject({ phaseId: "1", limit: { label: "5-hour window", resetsAt: resetIso(reset), resetPassed: false }, finalMessage: "You've hit your limit" });
    // How the session ended, as Needs you shows it (AC-LIMIT-04, Kiln v1 AC-STOP-02).
    expect(shown.waiting).toMatchObject({ exitCode: 1, lastSkill: { name: "implement-from-requirements" }, stoppedAt: h.engine.latestSession("1")!.runs[0]!.endedAt });
    expect(shown.waiting!.outputLineCount).toBeGreaterThan(0);
    // Before a reading after the refusal, the account card has none.
    expect(shown.waiting!.limit.account).toBeUndefined();
    // The terminal line names the phase, the limit and its reset (AC-LIMIT-05).
    expect(h.events.find((event) => event.kind === "phase" && event.event === "waiting")).toMatchObject({ phaseId: "1", limit: { label: "5-hour window", resetsAt: resetIso(reset) } });
    // Waiting counts as working for keep-awake (AC-AUTO-03).
    expect(states.at(-1)).toBe(true);
    // The refusal is recorded on the run, from Claude Code's report.
    const refused = h.engine.latestSession("1")!.runs[0]!;
    expect(refused.limitRefusal).toMatchObject({ rateLimitType: "five_hour", label: "5-hour window", resetsAt: resetIso(reset) });
    expect(refused.limitRefusal!.account).toBeUndefined();

    // The first reading after the refusal: signed out, so it records no account, and it can't decide; with a reset to come, the wait goes on.
    claude.deliver({ error: NOT_SIGNED_IN, limits: [] });
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.latestSession("1")!.runs[0]!.limitRefusal!.account).toBeUndefined();
    // A reading at 100%: no usage left; it records the refused account.
    void claude.refreshAccount();
    claude.deliver(signedIn([usageRow("session", 100, resetIso(reset))]));
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.latestSession("1")!.runs[0]!.limitRefusal!.account).toEqual({ email: "alex@acme-shop.dev", orgId: "org-alex" });
    expect(buildSnapshot(h.engine).waiting!.limit.account).toMatchObject({ email: "alex@acme-shop.dev", plan: "Max plan", percent: 100, atLimitUntil: resetIso(reset) });
    expect(buildSnapshot(h.engine).waiting!.limit.blockingLimit).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(1);

    // The 5-minute reading shows usage left: Kiln checks, reads the account again, and resumes the same session.
    claude.queue(signedIn([usageRow("session", 2)]), signedIn([usageRow("session", 2)]));
    void claude.refreshAccount();
    await untilSettled(h.engine, () => h.engine.isPhaseDone("1"));
    const session = h.engine.latestSession("1")!;
    const calls = h.claudeCalls();
    expect(calls[1]!.args).toEqual(expect.arrayContaining(["--resume", session.sessionId, "--model", "claude-opus-5-5"]));
    expect(calls[1]!.prompt).toBe(`${limitOpening(session.runs[0]!.endedAt!)} ${CARRY_ON}`);
    expect(session.runs[1]).toMatchObject({ cause: "limit_resume", account: { email: "alex@acme-shop.dev", orgId: "org-alex" } });
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: false });
    expect(h.engine.record.phases["1"]!.wait).toBeUndefined();
    expect(phaseEvents(h).slice(0, 6)).toEqual(["prd_started", "1 started", "1 waiting", "1 resumed", "1 done", "2b started"]);
  });

  it("resumes past the reset at a reading that can't decide, keeps waiting past it at one with no usage left, and reads at the reset", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude, clock } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));

    // Past the reset, a reading that still shows 100% keeps the wait; the weekly limit at 100% is named as what still blocks (AC-LIMIT-01).
    clock.advance(3_700_000);
    const weeklyReset = new Date(clock.now().getTime() + 4 * 86_400_000).toISOString();
    void claude.refreshAccount();
    claude.deliver(signedIn([usageRow("session", 100), usageRow("weekly_all", 100, weeklyReset)]));
    expect(h.engine.waitingPhaseKey()).toBe("1");
    const passed = buildSnapshot(h.engine).waiting!.limit;
    expect(passed).toMatchObject({ resetPassed: true, blockingLimit: { label: "Weekly", resetsAt: weeklyReset } });
    // The stopping limit's own row past its reset shows no amber line.
    expect(passed.account!.atLimitUntil).toBeUndefined();
    // Past the reset, a reading that fails resumes.
    claude.queue({ error: "claude auth status failed", limits: [] }, { error: "claude auth status failed", limits: [] });
    void claude.refreshAccount();
    await untilSettled(h.engine, () => h.engine.isPhaseDone("1"));
    // A resume whose reading failed records no account.
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "limit_resume" });
    expect(h.engine.latestSession("1")!.runs[1]!.account).toBeUndefined();
  });

  it("ignores a reading that started before the refusal, and asks for another that decides the wait", async () => {
    const clock = testClock();
    // The reading asked for as phase 1 starts is left unanswered until after the refusal.
    const claude = scriptedClaude(clock);
    const refused = refusedSession({ rateLimitType: "five_hour", resetsAt: null });
    refused.actions.unshift({ sleepFor: 300 });
    harness = await createHarness({ sessions: [refused], engineOptions: { claude, now: clock.now } });
    await harness.engine.start({ refinementConfirmed: true });
    await waitFor(() => harness!.engine.latestSession("1")?.runs[0]?.pid !== undefined);
    void claude.refreshAccount(); // Began after readiness, but before the provider refusal.
    await harness.engine.settled();
    expect(harness.engine.waitingPhaseKey()).toBe("1");
    const asked = claude.asked;
    // It can't decide, and with no reset time the wait's first reading would send it to Needs you; it isn't the first.
    claude.deliver({ error: NOT_SIGNED_IN, limits: [] });
    expect(harness.engine.waitingPhaseKey()).toBe("1");
    expect(claude.asked).toBe(asked + 1);
    expect(claude.waiting).toBe(true);
    // The fresh reading is the wait's first: it can't decide either, and with no reset time that is Needs you,
    // whose stop asks for one reading of its own and no more.
    claude.deliver({ error: NOT_SIGNED_IN, limits: [] });
    expect(harness.engine.waitingPhaseKey()).toBeUndefined();
    expect(harness.engine.record.phases["1"]!.stop).toMatchObject({ limit: { rateLimitType: "five_hour" } });
    expect(claude.asked).toBe(asked + 2);
  });

  it("takes a reading a minute after the limit's reset time", async () => {
    // Keep Git/setup duration out of the reset window while retaining ordered
    // observation timestamps. The reset timer itself uses real elapsed time.
    const clock = testClock();
    let tick = clock.now().getTime();
    let waitingAt: number | undefined;
    const waitingEngine: { current?: Engine } = {};
    clock.now = () => {
      if (waitingAt === undefined && waitingEngine.current?.waitingPhaseKey() === "1") waitingAt = Date.now();
      return new Date(waitingAt === undefined ? tick++ : tick + Date.now() - waitingAt);
    };
    const claude = scriptedClaude(clock);
    const reset = Math.floor(clock.now().getTime() / 1000) - 55;
    harness = await createHarness({ sessions: [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })], engineOptions: { claude, now: clock.now } });
    waitingEngine.current = harness.engine;
    await harness.engine.start({ refinementConfirmed: true });
    // Observe the wait immediately; unrelated commit reads may settle after
    // the real timer fires on a busy workstation.
    await waitFor(() => harness!.engine.waitingPhaseKey() === "1" && claude.waiting);
    claude.deliver(signedIn([usageRow("session", 100)]));
    const asked = claude.asked;
    await waitFor(() => claude.asked > asked, 10_000);
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(reset * 1000 + 60_000);
    await harness.engine.settled();
  });

  it("asks for a reading on waking from a sleep during a wait (AC-AUTO-03)", async () => {
    let slept = false;
    let reported = false;
    const sleepReader = { next: (): Promise<Sleep[]> => (slept && !reported ? ((reported = true), Promise.resolve([{ at: new Date(Date.now() - 600_000).toISOString(), seconds: 600 }])) : Promise.resolve([])) };
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })], { sleepReader, sleepCheckMs: 50 });
    await startToWait(s);
    s.claude.deliver(signedIn([usageRow("session", 100)]));
    const asked = s.claude.asked;
    slept = true;
    await waitFor(() => s.claude.asked > asked, 5_000);
    expect(s.h.engine.waitingPhaseKey()).toBe("1");
  });
});

describe("a usage limit with no reset time (AC-AUTO-02)", () => {
  it("goes to Needs you when the first reading can't decide: a type with no reading row, read on the refused account", async () => {
    const s = await setup(() => [refusedSession({ rateLimitType: "overage", resetsAt: null })]);
    const { h, claude } = s;
    await startToWait(s);
    expect(buildSnapshot(h.engine).waiting!.limit).toEqual({ label: "A usage limit", resetPassed: false, agentId: "claude_code", allowancesObservation: { observedAt: null, state: "unavailable", reason: "No dated Claude usage reading is available after the refusal." } });
    claude.deliver(signedIn([usageRow("session", 40)]));
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop).toMatchObject({ kind: "done_check", limit: { rateLimitType: "overage", label: "A usage limit" } });
    expect(stop.limit!.resetsAt).toBeUndefined();
    expect(h.engine.waitingPhaseKey()).toBeUndefined();
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 waiting", "1 stopped"]);
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou).toMatchObject({ resumeOffered: true, limit: { label: "A usage limit", resetPassed: false, account: { email: "alex@acme-shop.dev" } } });
    expect(needsYou.limit!.account!.percent).toBeUndefined();
  });

  it("resumes when the restarted wait's first reading is of another account, after the first wait learned the refused account", async () => {
    const s = await setup(() => [refusedSession({ rateLimitType: "five_hour", resetsAt: null }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    await h.engine.stop("sigint");
    const engine = h.reopenFromDisk();
    expect((await engine.decide()).kind).toBe("waiting");
    const sam = signedIn([usageRow("session", 5)], { email: "sam@acme-shop.dev", orgId: "org-sam" });
    claude.queue(sam, sam);
    await engine.continue();
    await untilSettled(engine, () => engine.isPhaseDone("1"));
    expect(engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "limit_resume", account: { email: "sam@acme-shop.dev", orgId: "org-sam" } });
    expect(engine.latestSession("1")!.runs[0]!.limitRefusal!.account).toEqual({ email: "alex@acme-shop.dev", orgId: "org-alex" });
  });

  it("ignores a failed reading once one has decided, and applies the first-reading rule again after kiln run restarts the wait", async () => {
    const s = await setup(() => [refusedSession({ rateLimitType: "five_hour", resetsAt: null })]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    void claude.refreshAccount();
    claude.deliver({ error: "claude auth status failed", limits: [] });
    expect(h.engine.waitingPhaseKey()).toBe("1");

    // Ctrl+C during a wait stops nothing; the wait stays in the record (AC-AUTO-03).
    expect(await h.engine.stop("sigint")).toEqual({ text: "Kiln stopped while phase 1 waited for usage.", grey: "kiln run checks it and waits again." });
    const engine = h.reopenFromDisk();
    expect(await engine.decide()).toEqual({ kind: "waiting", phaseKey: "1", limit: { label: "5-hour window" } });
    expect(engine.record.phases["1"]!.wait).toBeDefined();
    const asked = claude.asked;
    await engine.continue();
    expect(claude.asked).toBe(asked + 1);
    claude.deliver({ error: "claude auth status failed", limits: [] });
    expect(engine.record.phases["1"]!.stop).toMatchObject({ kind: "done_check", limit: { label: "5-hour window" } });
  });
});

describe("restarts (AC-AUTO-03)", () => {
  it("waits on restart when Kiln was killed between the refused run's end and its verdict, and takes keep-awake again", async () => {
    const { states, holder } = keepAwakeRecorder();
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })], { keepAwake: holder });
    const { h } = s;
    await startToWait(s);
    await h.engine.stop("sigterm");
    // The record as a Kiln killed before recording its verdict leaves it: the run ended, no wait yet.
    const record = readPrdRecord(h.stateDirectory)!;
    delete record.phases["1"]!.wait;
    writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(record));
    const engine = h.reopenFromDisk();
    expect(await engine.decide()).toEqual({ kind: "waiting", phaseKey: "1", limit: { label: "5-hour window", resetsAt: resetIso(s.reset) } });
    await engine.continue();
    expect(states.at(-1)).toBe(true);
  });

  it("counts the phase Done, finished by the person, when kiln run's check passes during a wait", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })]);
    const { h } = s;
    await startToWait(s);
    await h.engine.stop("sigint");
    finishByHand(h);

    const engine = h.reopenFromDisk();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: true } });
    expect(engine.record.phases["1"]!.wait).toBeUndefined();
  });

  it("goes to Needs you at kiln run when the setting was switched off", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })]);
    await startToWait(s);
    await s.h.engine.stop("sigint");
    const record = readPrdRecord(s.h.stateDirectory)!;
    record.settings.resumeAfterUsageLimit = false;
    writeFileSync(join(s.h.stateDirectory, "prd.json"), JSON.stringify(record));
    const engine = s.h.reopenFromDisk();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
    expect(engine.record.phases["1"]!.stop!.limit).toMatchObject({ label: "5-hour window" });
  });
});

describe("Kiln's own resume refused again (AC-AUTO-05)", () => {
  it("goes to Needs you, saying so, when the same limit refuses it on the same account before any response", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), refusedAgain({ rateLimitType: "five_hour", resetsAt: reset })]);
    const { h, claude } = s;
    await startToWait(s);
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.stoppedPhaseKey() !== undefined);
    const runs = h.engine.latestSession("1")!.runs;
    expect(h.engine.record.phases["1"]!.stop!.limit).toEqual({ rateLimitType: "five_hour", label: "5-hour window", resetsAt: resetIso(s.reset), refusedAgainAt: runs[1]!.startedAt });
    expect(buildSnapshot(h.engine).needsYou!.limit!.refusedAgainAt).toBe(runs[1]!.startedAt);
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 waiting", "1 resumed", "1 stopped"]);
  });

  it("goes to Needs you when the account couldn't be read, since an unknown account counts as the same", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), refusedAgain({ rateLimitType: "five_hour", resetsAt: reset })]);
    const { h, claude, clock } = s;
    await startToWait(s);
    clock.advance(3_700_000);
    claude.queue({ error: NOT_SIGNED_IN, limits: [] }, { error: NOT_SIGNED_IN, limits: [] });
    await untilSettled(h.engine, () => h.engine.stoppedPhaseKey() !== undefined);
    expect(h.engine.record.phases["1"]!.stop!.limit!.refusedAgainAt).toBe(h.engine.latestSession("1")!.runs[1]!.startedAt);
  });

  it("waits again when the resume is refused on another account", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), refusedAgain({ rateLimitType: "five_hour", resetsAt: reset })]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    // The person signs in to sam's account; the next reading shows usage left.
    const sam = signedIn([usageRow("session", 0)], { email: "sam@acme-shop.dev", orgId: "org-sam" });
    claude.queue(sam, sam);
    void claude.refreshAccount();
    await untilSettled(h.engine, () => h.engine.latestSession("1")!.runs.length === 2 && h.engine.waitingPhaseKey() !== undefined);
    expect(h.engine.record.phases["1"]!.wait).toMatchObject({ run: 1 });
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 waiting", "1 resumed", "1 waiting"]);
  });

  it("waits again when the resume is refused by another limit on the same account", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), refusedAgain({ rateLimitType: "seven_day", resetsAt: reset + 86_400 })]);
    const { h, claude } = s;
    await startToWait(s);
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.latestSession("1")!.runs.length === 2 && h.engine.waitingPhaseKey() !== undefined);
    expect(h.engine.record.phases["1"]!.wait).toMatchObject({ run: 1 });
    expect(h.engine.latestSession("1")!.runs[1]!.limitRefusal).toMatchObject({ rateLimitType: "seven_day", label: "Weekly" });
  });

  it("waits again when the resumed run got a response before a limit refused it, so a plan runs through several resets", async () => {
    const s = await setup((reset) => [
      refusedSession({ rateLimitType: "five_hour", resetsAt: reset }),
      { actions: [{ text: "Carrying on with the intake form." }, { refuse: { rateLimitType: "five_hour", resetsAt: reset + 18_000 } }, { exit: 1 }] },
    ]);
    const { h, claude } = s;
    await startToWait(s);
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.latestSession("1")!.runs.length === 2 && h.engine.waitingPhaseKey() !== undefined);
    expect(h.engine.record.phases["1"]!.wait).toMatchObject({ run: 1 });
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
  });

  it("sends a resume with no init to Needs you as one that can't be picked up (AC-RESUME-04)", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), { actions: [], noInit: true }]);
    const { h, claude } = s;
    await startToWait(s);
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.stoppedPhaseKey() !== undefined);
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop.kind).toBe("not_resumable");
    expect(stop.limit).toBeUndefined();
  });
});

describe("Resume now (AC-LIMIT-02, AC-RESUME-02)", () => {
  it("takes no note, holds itself and Check again until the run starts, resumes on the account signed in, and waits again when refused again", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), refusedAgain({ rateLimitType: "five_hour", resetsAt: reset })]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Go on." })).toMatchObject({ ok: false, status: 409, reason: "Resume now takes no note." });
    // A pause can't be asked for during a wait, and Check again isn't offered.
    expect(h.engine.pause()).toMatchObject({ ok: false, status: 409 });
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: false, status: 409 });

    // An empty note counts as none.
    const pressed = h.engine.resume({ ...recoveryRequest(h.engine), note: "" });
    expect(buildSnapshot(h.engine).waiting!.checking).toBe(true);
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: false, status: 409, reason: "Kiln is already checking." });
    // The account read just before resuming is still at 100%: Resume now goes ahead anyway.
    claude.queue(signedIn([usageRow("session", 100)]));
    expect(await pressed).toEqual({ ok: true });
    await untilSettled(h.engine, () => h.engine.latestSession("1")!.runs.length === 2 && h.engine.waitingPhaseKey() !== undefined);
    const runs = h.engine.latestSession("1")!.runs;
    expect(runs[1]).toMatchObject({ cause: "person_resume", account: { email: "alex@acme-shop.dev" } });
    expect(runs[1]!.note).toBeUndefined();
    expect(h.claudeCalls()[1]!.prompt).toBe(`${limitOpening(runs[0]!.endedAt!)} ${CARRY_ON}`);
    // A Resume now refused again starts a new wait, not Needs you.
    expect(h.engine.record.phases["1"]!.wait).toMatchObject({ run: 1 });
  });
});

describe("the check first, at Resume now and at the end of a wait (AC-RESUME-02, AC-AUTO-02)", () => {
  it("counts the phase Done, finished by the person, when Resume now's check passes, and resumes nothing", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/credit.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    finishByHand(h);
    // A reading for the account read before a resume, so a resume that wrongly went ahead would run.
    claude.queue(signedIn([usageRow("session", 100)]));

    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await untilSettled(h.engine, () => h.claudeCalls().length === 2);
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true });
    expect(h.engine.record.phases["1"]!.wait).toBeUndefined();
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    // The next run is phase 2b's own session, not a resume of phase 1's.
    expect(h.claudeCalls()[1]!.args).not.toContain("--resume");
    expect(phaseEvents(h).slice(0, 5)).toEqual(["prd_started", "1 started", "1 waiting", "1 done", "2b started"]);
  });

  it("counts the phase Done, finished by the person, when the end-of-wait check passes, and resumes nothing", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/credit.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    finishByHand(h);

    claude.deliver(signedIn([usageRow("session", 2)]));
    claude.queue(signedIn([usageRow("session", 2)]));
    await untilSettled(h.engine, () => h.claudeCalls().length === 2);
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true });
    expect(h.engine.record.phases["1"]!.wait).toBeUndefined();
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    expect(h.claudeCalls()[1]!.args).not.toContain("--resume");
    expect(phaseEvents(h).slice(0, 5)).toEqual(["prd_started", "1 started", "1 waiting", "1 done", "2b started"]);
  });

  it("holds Resume now and Check again from the start of Kiln's own resume until its run starts", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 2)]));
    // The check has failed; Kiln is reading the account before resuming.
    await waitFor(() => claude.waiting);
    expect(buildSnapshot(h.engine).waiting!.checking).toBe(true);
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: false, status: 409 });
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: false, status: 409 });
    expect(h.claudeCalls()).toHaveLength(1);

    claude.deliver(signedIn([usageRow("session", 2)]));
    await untilSettled(h.engine, () => h.engine.isPhaseDone("1"));
    expect(h.engine.latestSession("1")!.runs.map((run) => run.cause)).toEqual(["launch", "limit_resume"]);
    expect(h.claudeCalls()[1]!.args).toContain("--resume");
  });
});

describe("Resume now and the setting (AC-AUTO-04)", () => {
  it("goes ahead when the person pressed Resume now before switching the setting off", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 100)]));
    const pressed = h.engine.resume(recoveryRequest(h.engine));
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, resumeAfterUsageLimit: false })).toEqual({ ok: true });
    expect(h.engine.waitingPhaseKey()).toBe("1");
    claude.queue(signedIn([usageRow("session", 100)]));
    expect(await pressed).toEqual({ ok: true });
    await untilSettled(h.engine, () => h.engine.isPhaseDone("1"));
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "person_resume" });
    expect(phaseEvents(h).slice(0, 5)).toEqual(["prd_started", "1 started", "1 waiting", "1 resumed", "1 done"]);
  });
});

describe("the setting (AC-AUTO-04)", () => {
  it("is on for a new PRD; with it off, a usage-limit stop is Needs you with the limit's facts and Resume", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    expect(h.engine.record.settings.resumeAfterUsageLimit).toBe(true);
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, resumeAfterUsageLimit: false });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "done_check", limit: { label: "5-hour window", resetsAt: resetIso(s.reset) } });
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped"]);
    // The stop asked for a reading at once, so the account card shows one taken after the refusal.
    expect(claude.waiting).toBe(true);
    claude.deliver(signedIn([usageRow("session", 100, resetIso(s.reset))]));
    expect(buildSnapshot(h.engine).needsYou!.limit).toMatchObject({ account: { percent: 100, atLimitUntil: resetIso(s.reset) } });

    // Switched on at Needs you, it changes the setting only.
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, resumeAfterUsageLimit: true });
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    // Resume at Needs you after a usage limit tells the session so.
    claude.queue(signedIn([usageRow("session", 0)]), signedIn([usageRow("session", 0)]));
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await h.engine.settled();
    const runs = h.engine.latestSession("1")!.runs;
    expect(h.claudeCalls()[1]!.prompt).toBe(`${limitOpening(runs[0]!.endedAt!)} ${CARRY_ON}`);
  });

  it("switched off during a wait, turns it into Needs you and lets keep-awake go", async () => {
    const { states, holder } = keepAwakeRecorder();
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset })], { keepAwake: holder });
    const { h } = s;
    await startToWait(s);
    const checks = h.engine.record.phases["1"]!.wait!.checks;
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, resumeAfterUsageLimit: false })).toEqual({ ok: true });
    expect(h.engine.record.phases["1"]!.wait).toBeUndefined();
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "done_check", checks, limit: { label: "5-hour window" } });
    expect(states.at(-1)).toBe(false);
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 waiting", "1 stopped"]);
  });

  it("switched off once the end of a wait has begun, makes the failed check that stop and resumes nothing", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    claude.deliver(signedIn([usageRow("session", 3)]));
    // The check has failed; Kiln is reading the account before resuming.
    await waitFor(() => claude.waiting);
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, resumeAfterUsageLimit: false })).toEqual({ ok: true });
    expect(h.engine.waitingPhaseKey()).toBe("1");
    // A reading during the resume's hold changes the card only, never the refused account.
    claude.deliver(signedIn([usageRow("session", 3)], { email: "sam@acme-shop.dev", orgId: "org-sam" }));
    await untilSettled(h.engine, () => h.engine.stoppedPhaseKey() !== undefined);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.phases["1"]!.stop!.limit).toMatchObject({ label: "5-hour window" });
    expect(h.engine.latestSession("1")!.runs[0]!.limitRefusal!.account).toEqual({ email: "alex@acme-shop.dev", orgId: "org-alex" });
  });
});

describe("the pull-request session (AC-AUTO-01, AC-LIMIT-05)", () => {
  it("waits when a usage limit refuses it with no pull request open, then resumes it and completes the PRD", async () => {
    const s = await setup((reset) => [
      landingSession("src/a.txt"),
      landingSession("src/b.txt"),
      landingSession("src/c.txt"),
      refusedSession({ rateLimitType: "five_hour", resetsAt: reset }),
      pullRequestSession(218),
    ]);
    const { h, claude } = s;
    // Fresh catalogue/account checks for the next two phases and the PR conversation.
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("pr");
    expect(buildSnapshot(h.engine).feature.state).toBe("waiting");
    expect(h.events.find((event) => event.kind === "pull_request" && event.event === "waiting")).toMatchObject({ limit: { label: "5-hour window", resetsAt: resetIso(s.reset) } });
    // Supply the post-refusal allowance and the fresh reading before the same-session resume.
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.record.completedAt !== undefined);
    const runs = h.engine.latestSession("pr")!.runs;
    expect(runs[1]).toMatchObject({ cause: "limit_resume" });
    expect(h.claudeCalls().at(-1)!.prompt).toContain("because Claude Code's usage limit (the 5-hour usage limit) refused its request.");
    expect(phaseEvents(h).slice(-4)).toEqual(["PR started", "PR waiting", "PR resumed", "PR opened"]);
  });
});

describe("what keeps a usage-limit stop from waiting (multi-repo seam)", () => {
  it("doesn't wait for a session that worked outside the workspace before the limit refused it (AC-OUTSIDE-04)", async () => {
    const s = await setup(() => []);
    const { h } = s;
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ write: { path: join(h.repository, "src", "tokens.css"), content: "x\n" } }, { refuse: { rateLimitType: "five_hour", resetsAt: s.reset } }, { exit: 1 }] }] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBeUndefined();
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop.limit).toMatchObject({ label: "5-hour window" });
    expect(stop.checks.some((check) => check.name === "Stayed in the workspace" && !check.passed)).toBe(true);
  });

  it("doesn't wait for a session with no transcript, and Needs you offers no Resume", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }, { noTranscript: true })]);
    await s.h.engine.start({ refinementConfirmed: true });
    await s.h.engine.settled();
    expect(s.h.engine.waitingPhaseKey()).toBeUndefined();
    expect(s.h.engine.record.phases["1"]!.stop!.limit).toMatchObject({ label: "5-hour window" });
    expect(buildSnapshot(s.h.engine).needsYou!.resumeOffered).toBe(false);
  });

  it("goes to Needs you, resuming nothing, when the session's transcript shows work outside the workspace by the end of the wait", async () => {
    const s = await setup((reset) => [refusedSession({ rateLimitType: "five_hour", resetsAt: reset }), landingSession("src/intake.txt")]);
    const { h, claude } = s;
    await startToWait(s);
    // The session, opened by hand in a terminal during the wait, edits a checkout outside the workspace.
    const session = h.engine.latestSession("1")!;
    const transcript = findTranscripts(claudeConfigFolder(h.env), session.sessionId).main!;
    // The PRD repository's own checkout is outside the workspace.
    const outside = join(h.repository, "src", "tokens.css");
    appendFileSync(
      transcript,
      `${JSON.stringify({ type: "assistant", sessionId: session.sessionId, timestamp: new Date().toISOString(), cwd: h.engine.worktreePath, message: { model: "claude-opus-5-5", content: [{ type: "tool_use", id: "toolu_outside", name: "Write", input: { file_path: outside } }] } })}\n`,
    );
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.stoppedPhaseKey() !== undefined);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.phases["1"]!.stop!.checks.some((check) => check.name === "Stayed in the workspace" && !check.passed)).toBe(true);
    expect(h.engine.record.phases["1"]!.stop!.limit).toMatchObject({ label: "5-hour window" });
  });
});

describe("a pending pause through a wait (AC-LIMIT-04)", () => {
  it("stays pending, can't be cancelled while waiting, and takes effect after the resumed phase is Done", async () => {
    const clock = testClock();
    const claude = scriptedClaude(clock);
    harness = await createHarness({ sessions: [], engineOptions: { claude, now: clock.now } });
    const h = harness;
    const working = join(h.sandbox.root, "working");
    const gate = join(h.sandbox.root, "gate");
    const reset = Math.floor(clock.now().getTime() / 1000) + 3_600;
    const refused = refusedSession({ rateLimitType: "five_hour", resetsAt: reset });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: working }, { waitForFile: gate }, ...refused.actions] }, landingSession("src/intake.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    expect(h.engine.pause()).toEqual({ ok: true });
    writeFileSync(gate, "");
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(buildSnapshot(h.engine).pause).toEqual({ pending: true, active: false });
    expect(h.engine.cancelPause()).toMatchObject({ ok: false, status: 409 });
    claude.queue(signedIn([usageRow("session", 3)]), signedIn([usageRow("session", 3)]));
    await untilSettled(h.engine, () => h.engine.isPhaseDone("1"));
    expect(h.engine.record.pause.activeSince).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(2);
  });
});
