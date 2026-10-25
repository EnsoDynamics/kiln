// Stayed in the workspace through the engine (multi-repo PRD AC-OUTSIDE-01 to 04, AC-PRS-06,
// AC-SPACE-03), against real Git with the stand-in claude, which keeps a transcript the way
// Claude Code does: a session that changes a checkout outside the workspace stops at Needs you,
// Kiln changes nothing there, and the person's confirmation clears it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { displayPath } from "./worktree-setup.js";
import type { Sleep } from "../platform/sleep-readings.js";
import { sessionFiles } from "../session/claude-session.js";
import { findTranscripts } from "../session/transcripts.js";
import { readPrdRecord, writeSessionRecord } from "../state/records.js";
import { readJsonLines } from "../state/state-files.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { createRepository, git, posixShellPath } from "../test-support/git-repositories.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const STAYED = "Stayed in the workspace";
const NOTE = "Kiln changed nothing in that checkout, since it may hold other work too.";
const phaseEvents = (h: Harness) =>
  h.events.map((event) => (event.kind === "phase" ? `${event.phaseId} ${event.event}` : event.kind === "pull_request" ? `PR ${event.event}` : event.kind));

/** A design-system checkout beside the PRD's repository, with a commit of its own: the person's, which Kiln must leave alone. */
function designSystem(h: Harness): { path: string; head: () => string; status: () => string } {
  const path = createRepository(h.sandbox, "design-system");
  return { path, head: () => git(h.sandbox, path, "rev-parse", "HEAD").trim(), status: () => git(h.sandbox, path, "status", "--porcelain") };
}

/** Phase 1's session lands its work, and on the way edits and commits in design-system's own checkout. */
function landingOutside(outside: string): ScenarioSession {
  const landing = landingSession("src/intake.txt");
  return {
    actions: [
      { write: { path: join(outside, "src", "tokens", "colors.ts"), content: "export const refunded = '#e6b450';\n" } },
      { bash: `cd ${posixShellPath(outside)} && git add -A && git commit -m "fix(tokens): refunded"` },
      ...landing.actions,
    ],
  };
}

describe("a session that changes a checkout outside the workspace", () => {
  it("stops a one-repository PRD's phase at Needs you though the other three checks pass, and clears once the person confirms (AC-OUTSIDE-01 to 03, AC-SPACE-03)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const headBefore = outside.head();
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingOutside(outside.path), landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const madeCommit = outside.head();
    expect(madeCommit).not.toBe(headBefore);

    // AC-OUTSIDE-01: the fourth check fails alone; AC-OUTSIDE-02: each change and where.
    const shown = displayPath(outside.path);
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop.kind).toBe("done_check");
    expect(stop.checks.map((check) => [check.name, check.passed])).toEqual([
      ["Phase doc closed", true],
      ["Everything committed", true],
      ["Pushed", true],
      [STAYED, false],
    ]);
    expect(stop.checks[3]!.facts).toEqual([`Wrote src/tokens/colors.ts in ${shown}`, `Ran git add in ${shown}`, `Committed ${madeCommit.slice(0, 7)} to develop in ${shown}`, NOTE]);
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped"]);
    // Kiln changed nothing in that checkout.
    expect(outside.head()).toBe(madeCommit);
    expect(outside.status()).toBe("");

    // Needs you: the prompt for the reopened session, the resume command, and the fresh-session prompt carrying the facts.
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.resumeCommand).toContain("claude --resume");
    expect(needsYou.outside).toMatchObject({ changes: stop.checks[3]!.facts.slice(0, 3), missingTranscripts: [], checkouts: ["design-system"], confirmation: { offered: true, ticked: false } });
    expect(needsYou.outside!.prompt).toBe(
      [
        "While working on phase 1, you changed a checkout outside the Kiln workspace, the worktree named in your instructions:",
        ...stop.checks[3]!.facts.slice(0, 3).map((fact) => `- ${fact}`),
        "",
        `Bring the changes you made there into the workspace, committed and pushed on feature/customer-returns, and nothing else from that checkout. design-system isn’t in the workspace yet, so ask Kiln to add it first. Leave ${shown} as it is, and tell me what in it still needs putting back.`,
      ].join("\n"),
    );
    expect(needsYou.freshSessionPrompt).toContain(`The previous session also changed a checkout outside the worktree, and Kiln changed nothing there:\n- Wrote src/tokens/colors.ts in ${shown}`);

    // Check again with nothing ticked: still stopped, nothing resumed.
    await h.engine.checkAgain();
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.checks[3]!.passed).toBe(false);

    // Ticked, then unticked before the next check: taken back.
    expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });
    expect(buildSnapshot(h.engine).needsYou!.outside!.confirmation).toEqual({ offered: true, ticked: true });
    expect(h.engine.setOutsideConfirmation(false)).toEqual({ ok: true });
    expect(h.engine.record.phases["1"]!.outsideConfirmations).toEqual([]);

    // Ticked again, and kept in the record, so it outlasts a restart; then the next kiln run clears it.
    h.engine.setOutsideConfirmation(true);
    expect(readPrdRecord(h.stateDirectory)!.phases["1"]!.outsideConfirmations).toHaveLength(1);
    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: true } });
    expect(engine.record.phases["1"]!.doneAt).toBeDefined();
    // The confirmation is offered only while the check fails.
    expect(engine.setOutsideConfirmation(true)).toMatchObject({ ok: false, status: 409 });
  });

  it("lists the check as passed once confirmed while another check still fails, and fails again for a change after the tick (AC-OUTSIDE-01, 03)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    // The work is committed but not pushed, so Pushed fails too.
    const session = landingOutside(outside.path);
    session.actions = session.actions.filter((action) => !("push" in action));
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [session] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    h.engine.setOutsideConfirmation(true);
    await h.engine.checkAgain();
    const checks = h.engine.record.phases["1"]!.stop!.checks;
    expect(checks.find((check) => check.name === "Pushed")!.passed).toBe(false);
    expect(checks.at(-1)).toEqual({ name: STAYED, passed: true, facts: ["The changes outside the workspace have been dealt with"] });
    expect(buildSnapshot(h.engine).needsYou!.outside).toBeUndefined();

    // The person reopens the session by hand and it stashes in design-system: a change after the tick.
    const session1 = h.engine.latestSession("1")!;
    const file = findTranscripts(join(h.sandbox.root, "claude-config"), session1.sessionId).main!;
    const later = new Date(Date.now() + 1000).toISOString();
    writeFileSync(
      file,
      `${JSON.stringify({ type: "assistant", sessionId: session1.sessionId, timestamp: later, cwd: outside.path, message: { content: [{ type: "tool_use", id: "manual_1", name: "Bash", input: { command: "git stash" } }] } })}\n`,
      { flag: "a" },
    );
    await h.engine.checkAgain();
    const again = h.engine.record.phases["1"]!.stop!.checks.at(-1)!;
    expect(again).toEqual({ name: STAYED, passed: false, facts: [`Ran git stash in ${displayPath(outside.path)}`, NOTE] });
    expect(buildSnapshot(h.engine).needsYou!.outside!.confirmation).toEqual({ offered: true, ticked: false });
  });

  it("fails a session that ran with no transcript, offers the fresh session in place of the resume command, and clears on a tick (OUT-003)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ ...landingSession("src/a.txt"), noTranscript: true }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    const session = h.engine.latestSession("1")!;
    const stayed = h.engine.record.phases["1"]!.stop!.checks.at(-1)!;
    expect(stayed).toEqual({
      name: STAYED,
      passed: false,
      facts: [`No transcript found for session ${session.sessionId} in ${displayPath(join(h.sandbox.root, "claude-config", "projects"))}, so Kiln can't tell what it did outside the workspace`],
    });
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.outside).toMatchObject({ changes: [], missingTranscripts: stayed.facts, checkouts: [], confirmation: { offered: true, ticked: false } });
    expect(needsYou.outside!.prompt).toBeUndefined();

    h.engine.setOutsideConfirmation(true);
    await h.engine.checkAgain();
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    // A tick covers that session only: the next phase's session kept its transcript and passes.
    expect(phaseEvents(h)).toContain("2b done");
  });
});

describe("an interrupted session that worked outside the workspace (AC-OUTSIDE-04)", () => {
  it("goes to Needs you, shown as interrupted with the resume command, and is never resumed by Kiln", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const working = join(h.sandbox.root, "working");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ bash: `git -C ${posixShellPath(outside.path)} checkout -q -b scratch` }, { text: "Building the intake form." }, { touch: working }, { work: "npm test" }] }] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    const run = h.engine.latestSession("1")!.runs[0]!;

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
    await engine.continue();
    expect(h.claudeCalls()).toHaveLength(1);
    const stop = engine.record.phases["1"]!.stop!;
    expect(stop).toMatchObject({ kind: "done_check", interrupted: { at: run.interruptedAt, atIsLastOutput: false } });
    expect(stop.checks.at(-1)!.facts[0]).toBe(`Ran git checkout in ${displayPath(outside.path)}`);

    const needsYou = buildSnapshot(engine).needsYou!;
    expect(needsYou).toMatchObject({ interrupted: { at: run.interruptedAt }, stoppedAt: run.interruptedAt, resumeCommand: expect.stringContaining("claude --resume") });
    expect(needsYou.finalMessage).toBeUndefined();
    expect(needsYou.lastLines!.map((line) => line.text)).toContain("Building the intake form.");
    expect(needsYou.outside!.prompt).toContain(`- Ran git checkout in ${displayPath(outside.path)}`);

    // Check again and the next kiln run judge it again, keep it interrupted, and never resume it.
    await engine.checkAgain();
    await engine.settled();
    expect(engine.record.phases["1"]!.stop!.interrupted).toBeDefined();
    const next = h.reopenFromDisk();
    await next.prepare();
    expect(await next.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("an interruption by a sleep, or of the pull-request session (AC-OUTSIDE-04)", () => {
  it("stops a session a sleep cut off after it worked outside the workspace, in place of resuming it, while Kiln keeps running", async () => {
    let slept = "";
    let reported = false;
    const sleepReader = {
      next: (): Promise<Sleep[]> => {
        if (reported || !slept || !existsSync(slept)) return Promise.resolve([]);
        reported = true;
        setTimeout(() => writeFileSync(`${slept}.found`, ""), 20);
        return Promise.resolve([{ at: new Date(Date.now() - 600_000).toISOString(), seconds: 600 }]);
      },
    };
    harness = await createHarness({ sessions: [], engineOptions: { sleepReader, sleepCheckMs: 50 } });
    const h = harness;
    const outside = designSystem(h);
    slept = join(h.sandbox.root, "slept");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({
        sessions: [{ actions: [{ bash: `git -C ${posixShellPath(outside.path)} stash list && git -C ${posixShellPath(outside.path)} switch -q -c scratch` }, { text: "Building the intake form." }, { waitForFile: `${slept}.found` }, { stderr: "API Error: Connection error." }, { exit: 1 }] }],
      }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => {
      const session = h.engine.latestSession("1");
      return session !== undefined && h.engine.outputLines(session).some((line) => line.text === "Building the intake form.");
    });
    writeFileSync(slept, "");
    await h.engine.settled();

    const session = h.engine.latestSession("1")!;
    expect(session.runs).toHaveLength(1);
    expect(session.runs[0]).toMatchObject({ interruptedBy: "sleep" });
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "done_check", interrupted: { at: session.runs[0]!.interruptedAt, atIsLastOutput: false } });
    expect(h.engine.record.phases["1"]!.stop!.checks.at(-1)!.facts[0]).toBe(`Ran git switch in ${displayPath(outside.path)}`);
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 interrupted", "1 stopped"]);
  });

  it("stops the pull-request session interrupted after it worked outside the workspace, with no resume", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const working = join(h.sandbox.root, "working");
    const opening = { actions: [{ bash: `git -C ${posixShellPath(outside.path)} push 2>/dev/null; true` }, { touch: working }, { work: "gh pr create" }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), opening] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "pr", again: false });
    expect(h.claudeCalls()).toHaveLength(4);
    const stop = engine.record.phases.pr!.stop!;
    expect(stop).toMatchObject({ kind: "pull_request_check", interrupted: { atIsLastOutput: false } });
    expect(stop.checks.map((check) => [check.name, check.passed])).toEqual([["Pull request open", false], [STAYED, false]]);
    expect(stop.checks[1]!.facts[0]).toBe(`Pushed from ${displayPath(outside.path)}`);
    const run = engine.latestSession("pr")!.runs[0]!;
    expect(stop.interrupted).toEqual({ at: run.interruptedAt, atIsLastOutput: false });
    expect(buildSnapshot(engine).needsYou).toMatchObject({ interrupted: { at: run.interruptedAt }, resumeCommand: expect.stringContaining("claude --resume") });
  });
});

describe("a subagent's worktree, outside the workspace", () => {
  it("is named in the prompt by the repository it belongs to, never by its own folder", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    // Claude Code makes a subagent's worktree in the repository's main checkout.
    const agent = join(outside.path, ".claude", "worktrees", "agent-a1b2");
    mkdirSync(join(outside.path, ".claude", "worktrees"), { recursive: true });
    git(h.sandbox, outside.path, "worktree", "add", "-q", "-b", "worktree-agent-a1b2", agent);
    const session = landingSession("src/a.txt");
    session.actions.unshift({ write: { path: join(agent, "src", "tokens.ts"), content: "x\n" } });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [session] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    const outsideView = buildSnapshot(h.engine).needsYou!.outside!;
    expect(outsideView.changes).toEqual([`Wrote src/tokens.ts in ${displayPath(agent)}`]);
    expect(outsideView.checkouts).toEqual(["design-system"]);
    expect(outsideView.prompt).toContain("design-system isn’t in the workspace yet, so ask Kiln to add it first.");
    expect(outsideView.prompt).not.toContain("agent-a1b2 isn’t");
  });

});

describe("the confirmation while a check runs (AC-OUTSIDE-03)", () => {
  it("refuses a tick while a check runs, so a tick never lands unseen", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingOutside(outside.path)] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const checking = h.engine.checkAgain();
    expect(h.engine.setOutsideConfirmation(true)).toMatchObject({ ok: false, status: 409, reason: "Kiln is checking. Tick it once the check ends." });
    await checking;
    await h.engine.settled();
    expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });
  });
});

describe("the pull-request session's check (AC-PRS-06)", () => {
  it("requires that the pull-request session stayed in the workspace, though its pull request is open", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const opening = pullRequestSession(218);
    opening.actions.unshift({ bash: `git -C ${posixShellPath(outside.path)} commit --allow-empty -q -m wip` });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), opening] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    expect(h.engine.record.completedAt).toBeUndefined();
    const stop = h.engine.record.phases.pr!.stop!;
    expect(stop.kind).toBe("pull_request_check");
    expect(stop.checks).toEqual([
      { name: "Pull request open", passed: true, facts: ["#218 open"] },
      { name: STAYED, passed: false, facts: [`Ran git commit in ${displayPath(outside.path)}`, NOTE] },
    ]);
    // The pull-request session changes no code, so it is only asked to leave the checkout and say what to put back.
    expect(buildSnapshot(h.engine).needsYou!.outside!.prompt).toBe(
      [
        "While opening the pull request, you changed a checkout outside the Kiln workspace, the worktree named in your instructions:",
        `- Ran git commit in ${displayPath(outside.path)}`,
        "",
        `Leave ${displayPath(outside.path)} as it is, and tell me what in it still needs putting back.`,
      ].join("\n"),
    );
    // Resume is offered to a pull-request session whose check failed with its pull request open (AC-PRS-05, usage-limit recovery AC-RESUME-01).
    expect(buildSnapshot(h.engine).needsYou!.resumeOffered).toBe(true);

    h.engine.setOutsideConfirmation(true);
    await h.engine.checkAgain();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.engine.record.pullRequests?.[0]?.number).toBe(218);
  });
});

describe("more interruptions (AC-OUTSIDE-04)", () => {
  it("records the last output as the interrupted time when Kiln was killed outright, and doesn't resume", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const working = join(h.sandbox.root, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ write: { path: join(outside.path, "a.ts"), content: "x\n" } }, { touch: working }, { work: "npm test" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    // As if Kiln had been killed outright: the run has neither an end nor an interruption.
    const session = h.engine.latestSession("1")!;
    for (const field of ["endedAt", "interruptedBy", "interruptedAt", "exitCode", "result"] as const) delete session.runs[0]![field];
    writeSessionRecord(h.stateDirectory, session);
    const lastEvent = readJsonLines<{ at: string }>(sessionFiles(h.stateDirectory, session).events).at(-1)!.at;

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
    expect(h.claudeCalls()).toHaveLength(1);
    expect(engine.record.phases["1"]!.stop!.interrupted).toEqual({ at: lastEvent, atIsLastOutput: true });
    expect(buildSnapshot(engine).needsYou).toMatchObject({ stoppedAt: lastEvent, stoppedAtIsLastOutput: true });
  });

  it("stops an interrupted session that kept no transcript, offering the fresh session and no resume command (OUT-003)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = join(h.sandbox.root, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ noTranscript: true, actions: [{ text: "Building the intake form." }, { touch: working }, { work: "npm test" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
    expect(h.claudeCalls()).toHaveLength(1);
    const needsYou = buildSnapshot(engine).needsYou!;
    expect(needsYou.interrupted).toBeDefined();
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.outside).toMatchObject({ changes: [], missingTranscripts: [expect.stringMatching(/^No transcript found for session /)] });
    // No transcript, no Resume, after an interruption too (AC-OUTSIDE-01, usage-limit recovery AC-RESUME-01).
    expect(needsYou.resumeOffered).toBe(false);
    expect(await engine.resume()).toMatchObject({ ok: false, status: 409 });
  });
});

describe("whose checkout it was (AC-OUTSIDE-01, 02)", () => {
  it("names a repository already in the workspace without asking to add it, when the session commits in its own checkout", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const session = landingSession("src/a.txt");
    session.actions.unshift({ bash: `git -C ${h.repository} commit --allow-empty -q -m oops` });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [session] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    const outside = buildSnapshot(h.engine).needsYou!.outside!;
    expect(outside.changes).toEqual([`Ran git commit in ${displayPath(h.repository)}`]);
    expect(outside.checkouts).toEqual(["acme-shop"]);
    expect(outside.prompt).not.toContain("isn’t in the workspace yet");
    expect(outside.prompt).toContain("Bring the changes you made there into the workspace, committed and pushed on feature/customer-returns, and nothing else from that checkout. Leave");
  });

  it("never fails for the person's own work in a checkout outside the workspace, which the transcript doesn't show", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const outside = designSystem(h);
    const working = join(h.sandbox.root, "go");
    const session = landingSession("src/a.txt");
    session.actions.unshift({ waitForFile: working });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [session, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    // Another chat works in design-system while the phase runs.
    writeFileSync(join(outside.path, "theirs.txt"), "in progress\n");
    git(h.sandbox, outside.path, "add", "-A");
    git(h.sandbox, outside.path, "commit", "-q", "-m", "their work");
    writeFileSync(join(outside.path, "dirty.txt"), "uncommitted\n");
    writeFileSync(working, "");
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    expect(phaseEvents(h)).toContain("1 done");
  });
});

