// Resume at Needs you (usage-limit recovery PRD AC-RESUME-01 to 04, with multi-repo AC-OUTSIDE-04's
// part of them), through the engine against real Git with the stand-in claude: Kiln checks
// first, then picks the same session back up with the person's note, and carries on through
// the plan; where there is no session to pick up, Resume isn't offered.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPrdRecord, SCHEMA_VERSION, writeSessionRecord } from "../state/records.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { createRepository, git, posixShellPath } from "../test-support/git-repositories.js";
import type { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { displayPath } from "./worktree-setup.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const PHASE_1 = "docs/prds/customer-returns/phase-1-return-intake.md";
const CARRY_ON = `Carry on with \`${PHASE_1}\` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.`;
const phaseEvents = (h: Harness) =>
  h.events.map((event) => (event.kind === "phase" ? `${event.phaseId} ${event.event}` : event.kind === "pull_request" ? `PR ${event.event}` : event.kind));
const seconds = (time: string) => time.replace(/\.\d+Z$/, "Z");
/** v1's opening for a session that ended on its own and was resumed by the person, at the run's end. */
const stoppedOpening = (endedAt: string) => `This session ended at \`${seconds(endedAt)}\` before its work was done, and the person running Kiln has asked Kiln to resume it.`;

/** A phase session that stops partway to ask something: Needs you, with its question as the last message. */
const askingSession = (question = "Which fields does the intake form need?"): ScenarioSession => ({
  actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Building the intake form." }, { write: { path: "src/partial.txt", content: "half done\n" } }, { result: question }],
});

/** Finishes phase 1 by hand in the worktree: its Closed line, committed and pushed. */
function finishByHand(h: Harness, engine: Engine) {
  const worktree = engine.worktreePath;
  const doc = join(worktree, PHASE_1);
  const lines = readFileSync(doc, "utf8").split("\n");
  lines.splice(1, 0, "", "**Closed:** 2026-10-22");
  writeFileSync(doc, lines.join("\n"));
  git(h.sandbox, worktree, "add", "-A");
  git(h.sandbox, worktree, "commit", "-q", "-m", "feat: intake, finished by hand");
  git(h.sandbox, worktree, "push", "-q", "-u", "origin", "feature/customer-returns");
}

describe("Resume at Needs you (AC-RESUME-01 to 03)", () => {
  it("checks first, then picks up the same session with the note ahead of the instruction, and carries on through the plan", async () => {
    harness = await createHarness({ sessions: [askingSession(), landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.kind).toBe("done_check");
    expect(buildSnapshot(h.engine).needsYou!.resumeOffered).toBe(true);
    const session = h.engine.latestSession("1")!;
    const endedAt = session.runs[0]!.endedAt!;

    expect(await h.engine.resume({ note: "  Use the fields in the returns form mockup.\n" })).toEqual({ ok: true });
    await h.engine.settled();

    // The same session, resumed with its own concrete model, its note first, in the person's words, trimmed.
    const calls = h.claudeCalls();
    expect(calls[1]!.args).toEqual(expect.arrayContaining(["--resume", session.sessionId, "--model", "claude-opus-5-5"]));
    expect(calls[1]!.prompt.split("\n\nThis session runs unattended.")[0]).toBe(`The person running Kiln says:\n\nUse the fields in the returns form mockup.\n\n${stoppedOpening(endedAt)} ${CARRY_ON}`);
    const runs = h.engine.latestSession("1")!.runs;
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ cause: "person_resume", note: "Use the fields in the returns form mockup." });
    // From there Kiln continues as after any session: the resumed session landed the phase, so it is Done, and the next starts.
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: false });
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped", "1 resumed", "1 done", "2b started", "2b stopped"]);
    expect(calls[2]!.prompt).toContain("implement `docs/prds/customer-returns/phase-2b-store-credit.md`");
    // Kept on disk with the current execution/delivery schema.
    expect(readPrdRecord(h.stateDirectory)!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("counts a phase the person finished by hand as Done when Resume's check passes, resuming nothing and dropping the note", async () => {
    harness = await createHarness({ sessions: [askingSession(), landingSession("src/credit.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    finishByHand(h, h.engine);

    expect(await h.engine.resume({ note: "Never sent." })).toEqual({ ok: true, noteSkipped: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true });
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    const calls = h.claudeCalls();
    expect(calls[1]!.args).not.toContain("--resume");
    expect(calls.some((call) => call.prompt.includes("Never sent."))).toBe(false);
    expect(phaseEvents(h).slice(0, 5)).toEqual(["prd_started", "1 started", "1 stopped", "1 done", "2b started"]);
  });

  it("holds Resume and Check again from the press until the session runs again, and sends the instruction alone with no note", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const running = join(h.sandbox.root, "running");
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [askingSession(), { actions: [{ touch: running }, { waitForFile: release }, ...landingSession("src/intake.txt").actions] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const endedAt = h.engine.latestSession("1")!.runs[0]!.endedAt!;

    // Every snapshot from the press until the run starts: Needs you is never shown with its buttons free.
    let unheld = 0;
    const offChange = h.engine.onChange(() => {
      const shown = buildSnapshot(h.engine).needsYou;
      if (shown !== undefined && shown.checking !== true) unheld++;
    });
    // A whitespace note counts as none.
    const pressed = h.engine.resume({ note: "   " });
    expect(buildSnapshot(h.engine).needsYou!.checking).toBe(true);
    expect(await h.engine.checkAgain()).toEqual({ ok: false, status: 409, reason: "Kiln is already checking." });
    expect(await h.engine.resume()).toEqual({ ok: false, status: 409, reason: "Kiln is already checking." });
    expect(await pressed).toEqual({ ok: true });
    // The check has failed; until the run starts Check again is refused, and after it there is no stop to check.
    expect(await h.engine.checkAgain()).toMatchObject({ ok: false, status: 409 });

    await waitFor(() => existsSync(running));
    offChange();
    expect(unheld).toBe(0);
    const working = buildSnapshot(h.engine);
    expect(working.feature.state).toBe("implementing");
    expect(working.needsYou).toBeUndefined();
    expect(working.current?.phaseId).toBe("1");
    expect(working.phases.find((phase) => phase.id === "1")!.state).toBe("implementing");
    expect(h.engine.checking).toBe(false);
    expect(h.claudeCalls()[1]!.prompt).toBe(`${stoppedOpening(endedAt)} ${CARRY_ON}`);
    expect(h.engine.latestSession("1")!.runs[1]!.note).toBeUndefined();

    writeFileSync(release, "");
    await waitFor(() => h.engine.record.phases["1"]!.doneAt !== undefined);
    await h.engine.settled();
  });

  it("is offered the same way after kiln run restarts, and resumes from there", async () => {
    harness = await createHarness({ sessions: [askingSession(), landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    await h.engine.stop("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    expect(buildSnapshot(engine).needsYou!.resumeOffered).toBe(true);
    expect(await engine.resume()).toEqual({ ok: true });
    await engine.settled();
    expect(engine.latestSession("1")!.runs[1]!.cause).toBe("person_resume");
    expect(engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("refuses a note that isn't text or is longer than 4,000 characters, and Resume where nothing is stopped", async () => {
    harness = await createHarness({ sessions: [askingSession()] });
    const h = harness;
    expect(await h.engine.resume()).toMatchObject({ ok: false, status: 409 });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(await h.engine.resume({ note: 42 })).toEqual({ ok: false, status: 400, reason: "The note must be text." });
    expect(await h.engine.resume({ note: "x".repeat(4_001) })).toEqual({ ok: false, status: 400, reason: "The note can be at most 4,000 characters." });
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.checking).toBe(false);
  });
});

describe("where Resume isn't offered (AC-RESUME-01)", () => {
  it("isn't offered when the session's first run never started", async () => {
    harness = await createHarness({ sessions: [], engineOptions: { onTerminal: event => {
      // The executable disappears after readiness succeeds, immediately before spawn.
      // A missing executable during readiness correctly prevents creating a session.
      // A path with no extension, so Windows spawns it directly rather than through cmd.exe.
      if (event.kind === "phase" && event.event === "started") harness!.tools.claude = join(harness!.sandbox.root, "bin", "no-such-claude");
    } } });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // AC-RUN-01 checks required readiness before spawn; a missing executable creates no model attempt.
    expect(h.engine.latestSession("1")!.runs).toHaveLength(0);
    expect(h.engine.record.billing?.hold?.reason).toContain("authentication");
    expect(buildSnapshot(h.engine).needsYou!.resumeOffered).toBe(false);
    expect(await h.engine.resume()).toEqual({ ok: false, status: 409, reason: "Resume isn't offered here." });
  });

  it("isn't offered at a broken-plan stop", async () => {
    harness = await createHarness({ sessions: [askingSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    h.engine.record.phases["1"]!.stop!.kind = "plan";
    expect(h.engine.resumeOffered("1")).toBe(false);
    expect(await h.engine.resume()).toMatchObject({ ok: false, status: 409 });
  });

  it("isn't offered when Claude Code holds no transcript for the session (multi-repo AC-OUTSIDE-01)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ ...askingSession(), noTranscript: true }] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.resumeOffered).toBe(false);
    expect(await h.engine.resume()).toEqual({ ok: false, status: 409, reason: "Resume isn't offered here." });
  });
});

describe("a session that can't be picked up (AC-RESUME-04)", () => {
  it("comes back to Needs you as an interrupted session that can't be resumed does: its last lines, the fresh-session prompt, and no Resume", async () => {
    harness = await createHarness({ sessions: [askingSession(), { noInit: true, actions: [] } as ScenarioSession] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(await h.engine.resume({ note: "Carry on." })).toEqual({ ok: true });
    await h.engine.settled();

    expect(h.engine.record.phases["1"]!.stop!.kind).toBe("not_resumable");
    const needsYou = buildSnapshot(h.engine).needsYou!;
    // Nothing was interrupted: the session had stopped at its first run's end, and the person pressed Resume.
    expect(needsYou).toMatchObject({ kind: "not_resumable", resumeOffered: false, pressedResume: true, stoppedAt: h.engine.latestSession("1")!.runs[0]!.endedAt });
    expect(needsYou.stoppedAtIsLastOutput).toBeUndefined();
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.lastLines!.map((line) => line.text)).toContain(`No conversation found with session ID: ${h.engine.latestSession("1")!.sessionId}`);
    expect(needsYou.freshSessionPrompt).toContain("A previous session stopped partway through this phase");
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped", "1 resumed", "1 stopped"]);
    expect(await h.engine.resume()).toMatchObject({ ok: false, status: 409 });
  });
});

describe("the pull-request session (AC-RESUME-01, AC-RESUME-02)", () => {
  it("is resumed and told to carry on opening the pull request, then completes the feature", async () => {
    harness = await createHarness({
      sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), { actions: [{ result: "gh couldn't reach GitHub." }] }, pullRequestSession(218)],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop!.kind).toBe("pull_request_check");
    expect(buildSnapshot(h.engine).needsYou!.resumeOffered).toBe(true);
    const session = h.engine.latestSession("pr")!;

    expect(await h.engine.resume()).toEqual({ ok: true });
    await h.engine.settled();
    const call = h.claudeCalls()[4]!;
    expect(call.args).toEqual(expect.arrayContaining(["--resume", session.sessionId]));
    expect(call.prompt).toBe(
      `${stoppedOpening(session.runs[0]!.endedAt!)} Carry on opening the pull request from where you stopped; check GitHub first, because the pull request may already be open. Everything in the first message still applies.`,
    );
    expect(h.engine.record.completedAt).toBeDefined();
    const completed = buildSnapshot(h.engine);
    expect(completed.feature.timing).toMatchObject({ asOf: h.engine.record.completedAt });
    expect(completed.feature.timing!.advancing).toBeUndefined();
    expect(completed.phases.filter(phase => phase.timing).every(phase => phase.timing!.advancing === undefined)).toBe(true);
    expect(phaseEvents(h).slice(-3)).toEqual(["PR stopped", "PR resumed", "PR opened"]);
  });

  it("completes the feature, resuming nothing, when Resume's pull-request check passes on a pull request opened by hand", async () => {
    harness = await createHarness({
      sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), { actions: [{ result: "gh couldn't reach GitHub." }] }, pullRequestSession(218)],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop!.kind).toBe("pull_request_check");
    // The person opens the pull request by hand.
    const repo = "acme/acme-shop";
    const opened = { repo, number: 219, title: "Customer returns", url: `https://github.com/${repo}/pull/219`, isDraft: false, isCrossRepository: false, headRefName: "feature/customer-returns", baseRefName: "develop", additions: 120, deletions: 4, commits: [{ oid: "a" }] };
    writeFileSync(h.ghStatePath, JSON.stringify({ pulls: [opened] }));

    expect(await h.engine.resume({ note: "I opened it myself." })).toEqual({ ok: true, noteSkipped: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.engine.latestSession("pr")!.runs).toHaveLength(1);
    expect(h.claudeCalls()).toHaveLength(4);
    expect(phaseEvents(h)).not.toContain("PR resumed");
  });
});

describe("after work outside the workspace (multi-repo AC-OUTSIDE-04)", () => {
  /** A design-system checkout beside the PRD's repository. */
  const designSystem = (h: Harness) => createRepository(h.sandbox, "design-system");

  it("resumes with the note, then the prompt to bring that work in, while the confirmation is unticked", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const landing = landingSession("src/intake.txt");
    const edit = { write: { path: join(outside, "src", "tokens", "colors.ts"), content: "export const refunded = '#e6b450';\n" } };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [edit, ...landing.actions] }, { actions: [{ result: "Moved it." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.outside!.confirmation.ticked).toBe(false);
    expect(needsYou.resumeOffered).toBe(true);
    const endedAt = h.engine.latestSession("1")!.runs[0]!.endedAt!;

    expect(await h.engine.resume({ note: "Copy the token into storefront instead." })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.claudeCalls()[1]!.prompt.split("\n\nThis session runs unattended.")[0]).toBe(
      [
        "The person running Kiln says:",
        "",
        "Copy the token into storefront instead.",
        "",
        "While working on phase 1, you changed a checkout outside the Kiln workspace, the worktree named in your instructions:",
        `- Wrote src/tokens/colors.ts in ${displayPath(outside)}`,
        "",
        `Bring the changes you made there into the workspace, committed and pushed on feature/customer-returns, and nothing else from that checkout. design-system isn’t in the workspace yet, so ask Kiln to add it first. Leave ${displayPath(outside)} as it is, and tell me what in it still needs putting back.`,
        "",
        `${stoppedOpening(endedAt)} ${CARRY_ON}`,
      ].join("\n"),
    );
    // The resumed run reported its init and stopped again: an ordinary Needs you, Resume still offered.
    expect(h.engine.record.phases["1"]!.stop!.kind).toBe("done_check");
    expect(buildSnapshot(h.engine).needsYou!.resumeOffered).toBe(true);
    expect(phaseEvents(h).slice(-2)).toEqual(["1 resumed", "1 stopped"]);
  });

  it("sends no prompt about the outside work once the confirmation covers it, though another check still fails", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const edit = { write: { path: join(outside, "notes.txt"), content: "x\n" } };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [edit, ...askingSession().actions] }, { actions: [{ result: "Carrying on." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.checks.map((check) => [check.name, check.passed])).toContainEqual(["Stayed in the workspace", false]);
    expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });
    const endedAt = h.engine.latestSession("1")!.runs[0]!.endedAt!;

    expect(await h.engine.resume()).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.claudeCalls()[1]!.prompt).toBe(`${stoppedOpening(endedAt)} ${CARRY_ON}`);
  });

  it("honors the confirmation as Check again does: ticked, the check passes and nothing is resumed", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const landing = landingSession("src/intake.txt");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ write: { path: join(outside, "notes.txt"), content: "x\n" } }, ...landing.actions] }, landingSession("src/credit.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });

    expect(await h.engine.resume({ note: "Never sent." })).toEqual({ ok: true, noteSkipped: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true });
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
  });

  it("offers Resume at an interrupted session's Needs you, and resumes it with the interruption's opening after the prompt", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const working = join(h.sandbox.root, "working");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ bash: `git -C ${posixShellPath(outside)} checkout -q -b scratch` }, { text: "Building the intake form." }, { touch: working }, { work: "npm test" }] }, { actions: [{ result: "Put it back." }] }] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    const interruptedAt = h.engine.latestSession("1")!.runs[0]!.interruptedAt!;

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
    expect(buildSnapshot(engine).needsYou).toMatchObject({ interrupted: { at: interruptedAt }, resumeOffered: true });

    expect(await engine.resume()).toEqual({ ok: true });
    await engine.settled();
    const prompt = h.claudeCalls()[1]!.prompt;
    expect(prompt.startsWith("While working on phase 1, you changed a checkout outside the Kiln workspace")).toBe(true);
    expect(prompt.endsWith(`\n\nKiln was interrupted at \`${seconds(interruptedAt)}\` (Ctrl+C) while this session was working, and has resumed it. ${CARRY_ON}`)).toBe(true);
    expect(engine.latestSession("1")!.runs[1]!.cause).toBe("person_resume");
  });
});

describe("manual follow-up after an overnight stop", () => {
  it("preserves Push, excludes overnight time after restart, and returns a substantive answer to Needs you", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const running = join(h.sandbox.root, "reply-running");
    const release = join(h.sandbox.root, "reply-release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [askingSession(), { actions: [{ touch: running }, { waitForFile: release }, { result: "A merge is needed for DEV. Waiting for your decision." }] }, landingSession("src/intake.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const session = h.engine.latestSession("1")!;
    const now = Date.now();
    session.runs[0]!.startedAt = new Date(now - 11 * 3_600_000).toISOString();
    session.runs[0]!.endedAt = new Date(now - 9 * 3_600_000).toISOString();
    session.steps.push({ name: "Push", startedAt: session.runs[0]!.endedAt });
    writeSessionRecord(h.stateDirectory, session);
    await h.engine.stop("sigint");
    const engine = h.reopenFromDisk();
    await engine.prepare();
    await engine.decide();
    await engine.resume({ note: "Why is a merge necessary? Explain before doing it." });
    await waitFor(() => existsSync(running));
    const snapshot = buildSnapshot(engine);
    expect(snapshot.current?.followUp).toBe(true);
    expect(snapshot.current?.steps.find(step => step.name === "Push")?.state).toBe("observed");
    expect(snapshot.current?.steps.some(step => step.state === "current")).toBe(false);
    const timing = snapshot.phases.find(row => row.id === "1")!.timing!;
    expect(timing.runningMs).toBeGreaterThanOrEqual(2 * 3_600_000);
    expect(timing.runningMs).toBeLessThan(2 * 3_600_000 + 60_000);
    expect(timing.waitingMs).toBeGreaterThanOrEqual(9 * 3_600_000);
    expect(timing.advancing).toBe("running");
    // The snapshot classifies recorded causes, not merely the existence of a second run.
    const active = engine.current!.session!;
    const resumedRun = active.runs[1]!;
    const reply = resumedRun.note!;
    delete resumedRun.note;
    expect(buildSnapshot(engine).current!.followUp).toBe(true); // Manual continuation without a reply.
    resumedRun.cause = "limit_resume";
    expect(buildSnapshot(engine).current!.followUp).toBeUndefined();
    resumedRun.cause = "person_resume";
    active.runs[0]!.limitRefusal = { label: "5-hour window", at: active.runs[0]!.endedAt! };
    expect(buildSnapshot(engine).current!.followUp).toBeUndefined(); // Resume now after a limit.
    resumedRun.note = reply;
    expect(buildSnapshot(engine).current!.followUp).toBe(true); // A reply adds follow-up work even after a limit.
    delete active.runs[0]!.limitRefusal;
    expect(h.claudeCalls()[1]!.prompt).toContain("answer clearly in your final message and end this turn before taking that action");
    writeFileSync(release, "");
    await engine.settled();
    expect(buildSnapshot(engine).needsYou?.finalMessage).toContain("Waiting for your decision");
    expect(buildSnapshot(engine).needsYou?.resumeOffered).toBe(true);
    await engine.resume({ note: "Proceed with the authorized work." });
    await engine.settled();
    expect(engine.latestSession("1")!.sessionId).toBe(session.sessionId);
    expect(engine.latestSession("1")!.runs).toHaveLength(3);
    expect(engine.record.phases["1"]?.doneAt).toBeDefined();
  });
});
