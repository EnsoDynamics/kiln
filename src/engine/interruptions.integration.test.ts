import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Ctrl+C, a closed terminal, a sleep and resume, against real Git with the stand-in claude, which
// honors the interrupt request and SIGINT the way proof gate 1 recorded the real one doing
// (technical design, "Testing Approach": engine, signals and resume; keep-awake).

import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import { sessionFiles } from "../session/claude-session.js";
import { readPrdRecord, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { readJsonLines } from "../state/state-files.js";
import { createHarness, landingSession, pullRequestSession, readWorktreeFile, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import type { Sleep } from "../platform/sleep-readings.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const IMPLEMENT = "enso-method:implement-from-requirements";
const phaseEvents = (h: Harness) =>
  h.events.map((event) => (event.kind === "phase" ? `${event.phaseId} ${event.event}` : event.kind === "pull_request" ? `PR ${event.event}` : event.kind));
const onDisk = (h: Harness) => readPrdRecord(h.stateDirectory)!;
const sessionOf = (h: Harness, phaseKey: string): SessionRecord => h.engine.latestSession(phaseKey)!;
const flagIn = (h: Harness, name: string) => join(h.sandbox.root, name);

/** A session that starts work and runs a foreground Bash call until it is interrupted, or `ctrlCFile` appears. */
const workingSession = (flag: string, extra: Record<string, unknown> = {}, ctrlCFile?: string) => ({
  ...extra,
  actions: [{ skill: IMPLEMENT }, { text: "Building the intake form." }, { write: { path: "src/partial.txt", content: "half done\n" } }, { touch: flag }, { work: "npm test", ...(ctrlCFile ? { ctrlCFile } : {}) }],
});

describe("Ctrl+C while a session works", () => {
  it("ends the session's turn, records the interruption, keeps the work, and the next kiln run resumes that same session", async () => {
    harness = await createHarness({ sessions: [], logGit: true });
    const h = harness;
    const working = flagIn(h, "working");
    // Work in progress of every kind: a new file, a changed tracked file and a staged one.
    const { actions } = workingSession(working);
    const leftOver = [{ write: { path: "README.md", content: "# acme-shop, half edited\n" } }, { write: { path: "src/staged.txt", content: "staged\n" } }, { stage: "src/staged.txt" }];
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [...actions.slice(0, 3), ...leftOver, ...actions.slice(3)] }, landingSession("src/intake.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    const worktree = h.engine.worktreePath;
    const workState = () => ({
      status: git(h.sandbox, worktree, "status", "--porcelain", "--untracked-files=all"),
      unstaged: git(h.sandbox, worktree, "diff"),
      staged: git(h.sandbox, worktree, "diff", "--cached"),
      files: ["src/partial.txt", "README.md", "src/staged.txt"].map((path) => readWorktreeFile(h, path)),
    });
    const workBefore = workState();
    expect(workBefore.status.split("\n").filter(Boolean).sort()).toEqual([" M README.md", "?? src/partial.txt", "A  src/staged.txt"]);

    const report = await h.engine.stop("sigint");
    expect(report).toEqual({ text: "Interrupted phase 1, Return intake.", grey: "Its session and uncommitted work are kept." });

    const session = sessionOf(h, "1");
    const [run] = session.runs;
    expect(run).toMatchObject({ cause: "launch", interruptedBy: "sigint", interruptedAt: expect.any(String), endedAt: expect.any(String) });
    // The interrupt request ends the turn the way gate 1 recorded it: exit code 1, error result.
    expect(run!.exitCode).toBe(1);
    expect(run!.result).toMatchObject({ subtype: "error_during_execution" });
    expect(run!.interruptedAt! <= run!.endedAt!).toBe(true);
    // No Claude Code process is left behind (AC-KEEP-02).
    expect(await isProcessLive(run!.pid!, run!.processStartTime)).toBe(false);
    // Nothing was judged: no Needs you, no Done (technical design, "Once a stop begins").
    expect(onDisk(h).phases["1"]).toEqual({ sessionIds: [session.sessionId], finishedByPerson: false, repositories: { "acme-shop": { startCommit: expect.any(String) } }, outsideConfirmations: [] });
    // The work in progress stays exactly as it was (AC-KEEP-03), staged and unstaged alike.
    expect(workState()).toEqual(workBefore);

    // The next kiln run: the done check fails, so it resumes that same session (AC-KEEP-04).
    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "resume", phaseKey: "1", sessionId: session.sessionId });
    expect(h.claudeCalls()).toHaveLength(1);
    // Its check, before anything resumes, left the work as it was too.
    expect(workState()).toEqual(workBefore);
    await engine.continue();

    const resumed = h.claudeCalls()[1]!;
    expect(resumed.args.slice(0, 7)).toEqual(["-p", "--input-format", "stream-json", "--resume", session.sessionId, "--model", "claude-opus-5-5"]);
    // Multi-repo design, "Sessions": a resumed run gets no PowerShell tool either.
    expect(resumed.args[resumed.args.indexOf("--disallowedTools") + 1]).toBe("PowerShell");
    expect(resumed.args[resumed.args.indexOf("--effort") + 1]).toBe(session.effort);
    expect(resumed.prompt).toBe(
      `Kiln was interrupted at \`${run!.interruptedAt!.replace(/\.\d+Z$/, "Z")}\` (Ctrl+C) while this session was working, and has resumed it. ` +
        "Carry on with `docs/prds/customer-returns/phase-1-return-intake.md` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.",
    );
    expect(engine.record.phases["1"]).toMatchObject({ sessionIds: [session.sessionId], doneAt: expect.any(String), finishedByPerson: false });
    expect(sessionOf(h, "1").runs.map((r) => r.cause)).toEqual(["launch", "resume"]);
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 resumed", "1 done", "2b started", "2b stopped"]);
    // Neither the stop nor the resume touched Git destructively (AC-GIT-02).
    expect(h.kilnGitCalls().length).toBeGreaterThan(0);
    expect(h.kilnGitCalls().filter((call) => /(^|\s)(reset|stash|clean|push|checkout|switch|rebase)(\s|$)|branch -[dD]/.test(call))).toEqual([]);
  });

  it("counts an interrupted phase whose work already passes the done check as Done, without resuming it", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { push: true }, { touch: working }, { work: "npm run lint" }] }, landingSession("src/b.txt")] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sighup");
    expect(sessionOf(h, "1").runs[0]!.interruptedBy).toBe("sighup");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: false } });
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("holds a pause pressed before the interruption once the resumed session's phase is Done (AC-VIEW-03)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working), landingSession("src/intake.txt"), landingSession("src/credit.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    expect(h.engine.pause()).toEqual({ ok: true });
    await h.engine.stop("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
    await engine.continue();
    expect(engine.record.phases["1"]!.doneAt).toBeDefined();
    expect(buildSnapshot(engine).feature.state).toBe("paused");
    expect(h.claudeCalls()).toHaveLength(2);
  });

  // AC-DONE-03: the check before a resume is the whole done check, so one failing part is enough to resume.
  it.each([
    ["closed and committed, not pushed", [{ close: true }, { commit: "feat: intake" }]],
    ["closed, committed and pushed, with a file left over", [{ close: true }, { commit: "feat: intake" }, { push: true }, { write: { path: "stray.txt", content: "x" } }]],
  ])("resumes an interrupted phase that fails only one part of the done check: %s", async (_name, landed) => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [...landed, { touch: working }, { work: "npm test" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "resume", phaseKey: "1", sessionId: sessionOf(h, "1").sessionId });
    expect(engine.record.phases["1"]!.doneAt).toBeUndefined();
  });

  it("ends the session's whole tree when it doesn't exit after the interrupt, and the session still resumes", async () => {
    harness = await createHarness({ sessions: [], engineOptions: { stopWaitMs: 400, killGraceMs: 400 } });
    const h = harness;
    const working = flagIn(h, "working");
    const toolPidFile = flagIn(h, "tool.pid");
    h.env.KILN_STANDIN_TOOL_PID_FILE = toolPidFile;
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working, { ignoreInterrupt: true }), landingSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working) && existsSync(toolPidFile));
    const toolPid = Number(readFileSync(toolPidFile, "utf8"));
    const toolStart = await processStartTime(toolPid);
    expect(await isProcessLive(toolPid, toolStart)).toBe(true);
    await h.engine.stop("sigterm");
    // The running tool went with the session: the whole tree was ended.
    await waitFor(async () => !(await isProcessLive(toolPid, toolStart)), 5_000);

    const [run] = sessionOf(h, "1").runs;
    expect(run!.interruptedBy).toBe("sigterm");
    if (process.platform === "win32") expect(run!.exitCode).toBe(1);
    else expect(run!.signal).toBe("SIGTERM");
    expect(await isProcessLive(run!.pid!, run!.processStartTime)).toBe(false);

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
  });

  // On Windows the session shares Kiln's console, so the Ctrl+C reaches it as well; here the
  // session gets its Ctrl+C first, the way the console would deliver it, and Kiln's stop arrives
  // after its exit. Node can't send SIGINT to one process on Windows, so there the stand-in takes
  // a file appearing as its Ctrl+C.
  it.each([
    { by: "SIGINT", skip: process.platform === "win32" },
    { by: "a flag file", skip: false },
  ])("marks the run interrupted when the session got the Ctrl+C too and exited before Kiln's handler ran ($by)", async ({ by, skip }) => {
    if (skip) return;
    harness = await createHarness({ sessions: [], engineOptions: { exitGraceMs: 1_000 } });
    const h = harness;
    const working = flagIn(h, "working");
    const ctrlC = flagIn(h, "ctrl-c");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working, {}, by === "a flag file" ? ctrlC : undefined), landingSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    const run = sessionOf(h, "1").runs[0]!;
    if (by === "SIGINT") process.kill(run.pid!, "SIGINT");
    else writeFileSync(ctrlC, "");
    await waitFor(async () => !(await isProcessLive(run.pid!, run.processStartTime)));
    await h.engine.stop("sigint");

    expect(sessionOf(h, "1").runs[0]).toMatchObject({ interruptedBy: "sigint", exitCode: 0 });
    expect(onDisk(h).phases["1"]!.stop).toBeUndefined();
    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
  });

  it("abandons a done check in progress, writing nothing, and kiln run checks it again", async () => {
    harness = await createHarness({ sessions: [], engineOptions: { originRetryMs: 60_000 } });
    const h = harness;
    const committed = flagIn(h, "committed");
    const gate = flagIn(h, "gate");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { touch: committed }, { waitForFile: gate }, { result: "Done." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(committed));
    // origin goes away, so the done check's read of it retries.
    renameSync(h.origin, `${h.origin}.away`);
    writeFileSync(gate, "");
    await waitFor(() => sessionOf(h, "1").runs[0]!.endedAt !== undefined);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const began = Date.now();
    expect(await h.engine.stop("sigint")).toEqual({ text: "Kiln stopped while checking phase 1.", grey: "kiln run checks it again." });
    expect(Date.now() - began).toBeLessThan(5_000);
    expect(onDisk(h).phases["1"]!.stop).toBeUndefined();
    expect(onDisk(h).phases["1"]!.doneAt).toBeUndefined();
    expect(sessionOf(h, "1").runs[0]!.interruptedBy).toBeUndefined();

    renameSync(`${h.origin}.away`, h.origin);
    const engine = h.reopenFromDisk();
    await engine.prepare();
    // It ended on its own: judged by the done check alone, never resumed.
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: false });
  });
});

describe("resuming", () => {
  it("tells a session Kiln was killed outright that Kiln recorded no reason, with its last output's time", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working), landingSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    // As if Kiln had been killed outright: the run has neither an end nor an interruption.
    const session = sessionOf(h, "1");
    for (const field of ["endedAt", "interruptedBy", "interruptedAt", "exitCode", "result"] as const) delete session.runs[0]![field];
    writeSessionRecord(h.stateDirectory, session);
    const lastEvent = readJsonLines<{ at: string }>(sessionFiles(h.stateDirectory, session).events).at(-1)!.at;

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
    await engine.continue();
    expect(h.claudeCalls()[1]!.prompt.split(". ")[0]).toBe(
      `Kiln stopped without recording why while this session was working; its last output was at \`${lastEvent.replace(/\.\d+Z$/, "Z")}\`, and Kiln has resumed it`,
    );
  });

  it("sends a session that can't be resumed to the person, with when it was interrupted, its last lines and the fresh-session prompt", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working), { noInit: true, actions: [] }, landingSession("src/credit.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    const interruptedAt = sessionOf(h, "1").runs[0]!.interruptedAt!;

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
    await engine.continue();

    expect(engine.record.phases["1"]!.stop?.kind).toBe("not_resumable");
    expect(h.claudeCalls()).toHaveLength(2);
    const needsYou = buildSnapshot(engine).needsYou!;
    // An interrupted session that already couldn't be resumed gets no Resume (usage-limit recovery AC-RESUME-01).
    expect(needsYou).toMatchObject({ phaseId: "1", kind: "not_resumable", stoppedAt: interruptedAt, resumeOffered: false });
    expect(needsYou.stoppedAtIsLastOutput).toBeUndefined();
    for (const absent of ["resumeCommand", "exitCode", "signal", "lastSkill", "finalMessage"] as const) expect(needsYou[absent]).toBeUndefined();
    expect(needsYou.lastLines!.map((line) => line.text)).toContain(`No conversation found with session ID: ${sessionOf(h, "1").sessionId}`);
    expect(needsYou.freshSessionPrompt).toContain("A previous session stopped partway through this phase; check the worktree's state before you start.");
    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 resumed", "1 stopped"]);

    // The person finishes it outside Kiln, in the worktree (AC-RUN-07); Check again counts it as theirs and carries on.
    const worktree = engine.worktreePath;
    const doc = join(worktree, "docs/prds/customer-returns/phase-1-return-intake.md");
    const lines = readFileSync(doc, "utf8").split("\n");
    lines.splice(1, 0, "", "**Closed:** 2026-10-18");
    writeFileSync(doc, lines.join("\n"));
    git(h.sandbox, worktree, "add", "-A");
    git(h.sandbox, worktree, "commit", "-q", "-m", "feat: intake, finished by hand");
    git(h.sandbox, worktree, "push", "-q", "-u", "origin", "feature/customer-returns");
    expect(await engine.checkAgain(recoveryRequest(engine, "verify"))).toMatchObject({ ok: true });
    await engine.settled();
    expect(engine.record.phases["1"]).toMatchObject({ finishedByPerson: true, doneAt: expect.any(String) });
    expect(engine.record.phases["1"]!.stop).toBeUndefined();
    expect(phaseEvents(h).slice(4, 6)).toEqual(["1 done", "2b started"]);
    expect(h.claudeCalls()[2]!.prompt).toContain("implement `docs/prds/customer-returns/phase-2b-store-credit.md`");
  });

  it("judges a resumed run that ended on its own by its done check alone: Needs you, never another resume", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working), { actions: [{ text: "Picking up the intake form." }, { result: "I need a decision on the form's fields." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
    await engine.continue();
    expect(engine.record.phases["1"]!.stop?.kind).toBe("done_check");
    expect(buildSnapshot(engine).needsYou).toMatchObject({ kind: "done_check", finalMessage: "I need a decision on the form's fields.", resumeCommand: expect.stringContaining("claude --resume") });
    expect(h.claudeCalls()).toHaveLength(2);
  });

  it("goes to the ordinary Needs you, with no retry, when claude can't be started to resume the session", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working)] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    // claude is gone by the time Kiln resumes. A path with no extension, so that on Windows Node
    // spawns it directly rather than through cmd.exe, which would start and report it missing.
    h.tools.claude = join(h.sandbox.root, "bin", "no-such-claude");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("resume");
    await engine.continue();
    const runs = sessionOf(h, "1").runs;
    // AC-RUN-01: required auth readiness fails before spawn, retaining the original run.
    expect(runs).toHaveLength(1);
    expect(engine.record.billing?.hold?.reason).toContain("authentication");
    // A transcript exists, so this isn't "can't be resumed": the resume command stays.
    expect(engine.record.billing?.hold?.action).toBe("resume");
    expect(buildSnapshot(engine).needsYou!.resumeCommand).toContain("claude --resume");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("holds recovered input loss without cancelling the old operation, then permits explicit hand-back (AC-TAKE-02)", async () => {
    harness = await createHarness({ sessions: [], engineOptions: { stopWaitMs: 1_500 } });
    const h = harness;
    const working = flagIn(h, "working");
    const orphanWorking = flagIn(h, "orphan-working");
    const orphanRelease = flagIn(h, "orphan-release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working), { actions: [{ touch: orphanWorking }, { waitForFile: orphanRelease }, { result: "Operation finished naturally." }] }, landingSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");

    // As if a later Kiln had resumed the session and then been killed outright, leaving its process running.
    const session = sessionOf(h, "1");
    const standIn = fileURLToPath(new URL("../../test/stand-ins/claude-stand-in.mjs", import.meta.url));
    const orphan = spawn(process.execPath, [standIn, "-p", "--resume", session.sessionId, "--model", "claude-opus-5-5"], {
      cwd: h.engine.worktreePath,
      env: h.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "ignore", "ignore"],
    });
    orphan.stdin!.write(`${JSON.stringify({ type: "user", message: { role: "user", content: "resume" } })}\n`);
    await waitFor(() => existsSync(orphanWorking));
    const startTime = await processStartTime(orphan.pid!);
    session.runs.push({ pid: orphan.pid!, ...(startTime ? { processStartTime: startTime } : {}), startedAt: new Date().toISOString(), cause: "resume" });
    writeSessionRecord(h.stateDirectory, session);

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect((await engine.decide()).kind).toBe("needs_you");
    expect(await isProcessLive(orphan.pid!, startTime)).toBe(true);
    await engine.continue(); expect(h.claudeCalls()).toHaveLength(2);
    // Lost input never grants permission to terminate an operation. Once the old
    // attempt exits naturally, the existing manual recovery can continue it.
    writeFileSync(orphanRelease, "finish"); orphan.stdin!.end();
    await waitFor(async () => !await isProcessLive(orphan.pid!, startTime));
    await waitFor(() => engine.stoppedPhaseKey() === "1");
    expect(await engine.resume(recoveryRequest(engine))).toMatchObject({ ok: true, outcome: "resume_requested" });
    await engine.settled();
    expect(engine.record.phases["1"]!.doneAt).toBeDefined();
  });
});

describe("the pull-request session, interrupted", () => {
  const throughToPullRequest = (working: string) => [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), { actions: [{ touch: working }, { work: "gh pr create" }] }];

  it("is resumed, told to check GitHub first, when no pull request is open yet; then completes", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [...throughToPullRequest(working), pullRequestSession(218)] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    expect(await h.engine.stop("sigint")).toEqual({ text: "Interrupted the pull-request session.", grey: "Its session and uncommitted work are kept." });
    expect(sessionOf(h, "pr").runs[0]!.interruptedBy).toBe("sigint");

    const engine = h.reopenFromDisk();
    await engine.prepare();
    const session = sessionOf(h, "pr");
    expect(await engine.decide()).toEqual({ kind: "resume", phaseKey: "pr", sessionId: session.sessionId });
    await engine.continue();
    expect(h.claudeCalls()[4]!.args).toContain("--resume");
    expect(h.claudeCalls()[4]!.prompt).toContain("Carry on opening the pull request from where you stopped; check GitHub first, because the pull request may already be open.");
    expect(engine.record.completedAt).toBeDefined();
    expect(engine.record.pullRequests?.[0]?.number).toBe(218);
    expect(phaseEvents(h).slice(-2)).toEqual(["PR resumed", "PR opened"]);
  });

  it("completes the feature with no resume when the pull request is already open", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: throughToPullRequest(working) }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    h.setPulls([{ number: 219, title: "Customer returns", url: "https://github.com/acme/acme-shop/pull/219", isDraft: false, isCrossRepository: false, headRefName: "feature/customer-returns", baseRefName: "develop", additions: 3, deletions: 1, commits: [{ oid: "a" }] }]);

    const engine = h.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "complete" });
    expect(engine.record.pullRequests?.[0]?.number).toBe(219);
    expect(h.claudeCalls()).toHaveLength(4);
  });
});

describe("a sleep while Kiln keeps running", () => {
  /**
   * Reports one sleep of ten minutes the first time it is read after the flag file exists, and
   * then writes `<flag>.found`, so a session can wait until the sleep has been detected.
   */
  const sleepWhen = (flag: () => string) => {
    let reported = false;
    return {
      next: (): Promise<Sleep[]> => {
        if (reported || !existsSync(flag())) return Promise.resolve([]);
        reported = true;
        setTimeout(() => writeFileSync(`${flag()}.found`, ""), 20);
        return Promise.resolve([{ at: new Date(Date.now() - 600_000).toISOString(), seconds: 600 }]);
      },
    };
  };

  it("counts an exit with no model response after waking as interrupted, checks the phase, and resumes the session", async () => {
    let slept = "";
    harness = await createHarness({ sessions: [], engineOptions: { sleepReader: sleepWhen(() => slept), sleepCheckMs: 50 } });
    const h = harness;
    slept = flagIn(h, "slept");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({
        sessions: [
          // The network isn't back after the wake: the session gives up with no model response.
          { actions: [{ skill: IMPLEMENT }, { text: "Building the intake form." }, { waitForFile: `${slept}.found` }, { stderr: "API Error: Connection error." }, { exit: 1 }] },
          landingSession(),
        ],
      }),
    );
    await h.engine.start({ refinementConfirmed: true });
    // The computer sleeps only once Kiln has read the session's last response before it.
    await waitFor(() => {
      const session = h.engine.latestSession("1");
      return session !== undefined && h.engine.outputLines(session).some((line) => line.text === "Building the intake form.");
    });
    writeFileSync(slept, "");
    await h.engine.settled();

    const session = sessionOf(h, "1");
    expect(session.sleeps).toEqual([{ at: expect.any(String), seconds: 600, detectedAt: expect.any(String), run: 0 }]);
    expect(session.runs[0]).toMatchObject({ interruptedBy: "sleep", interruptedAt: session.sleeps[0]!.at, exitCode: 1 });
    expect(session.runs[1]).toMatchObject({ cause: "resume" });
    expect(h.claudeCalls()[1]!.prompt).toContain("(the computer slept)");
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    expect(phaseEvents(h).slice(0, 5)).toEqual(["prd_started", "1 started", "1 interrupted", "1 resumed", "1 done"]);
  });

  it("records a sleep the 10-second reading missed at the start of handling the exit, before the exit is judged", async () => {
    let slept = "";
    // No periodic reading during the test: only the readings around the process can find the sleep.
    harness = await createHarness({ sessions: [], engineOptions: { sleepReader: sleepWhen(() => slept), sleepCheckMs: 3_600_000 } });
    const h = harness;
    slept = flagIn(h, "slept");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Building." }, { touch: slept }, { exit: 1 }] }, landingSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const session = sessionOf(h, "1");
    expect(session.sleeps).toHaveLength(1);
    expect(session.runs[0]).toMatchObject({ interruptedBy: "sleep", exitCode: 1 });
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("counts an exit after a model response that arrived after waking as ended on its own, judged by the done check alone", async () => {
    let slept = "";
    harness = await createHarness({ sessions: [], engineOptions: { sleepReader: sleepWhen(() => slept), sleepCheckMs: 50 } });
    const h = harness;
    slept = flagIn(h, "slept");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ skill: IMPLEMENT }, { touch: slept }, { waitForFile: `${slept}.found` }, { text: "Back after the wake." }, { result: "You've hit your usage limit." }, { exit: 1 }] }] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    const session = sessionOf(h, "1");
    expect(session.sleeps).toHaveLength(1);
    expect(session.runs).toHaveLength(1);
    expect(session.runs[0]!.interruptedBy).toBeUndefined();
    expect(h.engine.record.phases["1"]!.stop?.kind).toBe("done_check");
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("keep-awake", () => {
  const recorder = () => {
    const states: boolean[] = [];
    return { states, holder: { error: undefined, set: (on: boolean) => void (states.at(-1) === on ? undefined : states.push(on)) } };
  };

  it("is held only while a session's process runs and the setting is on, applies a change at once, and is released at Needs you", async () => {
    const { states, holder } = recorder();
    harness = await createHarness({ sessions: [], engineOptions: { keepAwake: holder } });
    const h = harness;
    const working = flagIn(h, "working");
    const gate = flagIn(h, "gate");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: working }, { waitForFile: gate }, ...landingSession().actions] }, { actions: [{ result: "I need a decision." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    expect(states).toEqual([true]);
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, keepAwake: false });
    expect(states).toEqual([true, false]);
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, keepAwake: true });
    expect(states).toEqual([true, false, true]);
    writeFileSync(gate, "");
    await h.engine.settled();
    // Phase 1 Done, then phase 2b's session ran and stopped at Needs you: held for it, released after.
    expect(h.engine.record.phases["2b"]!.stop).toBeDefined();
    expect(states).toEqual([true, false, true, false, true, false]);
  });

  it("is released while paused and once the feature is complete, and held again only for a session", async () => {
    const { states, holder } = recorder();
    harness = await createHarness({ sessions: [], engineOptions: { keepAwake: holder } });
    const h = harness;
    const working = flagIn(h, "working");
    const gate = flagIn(h, "gate");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({ sessions: [{ actions: [{ touch: working }, { waitForFile: gate }, ...landingSession().actions] }, landingSession("src/b.txt"), landingSession("src/c.txt"), pullRequestSession(218)] }),
    );
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    expect(h.engine.pause()).toEqual({ ok: true });
    writeFileSync(gate, "");
    await h.engine.settled();
    expect(h.engine.record.pause.activeSince).toBeDefined();
    expect(states).toEqual([true, false]);

    await h.engine.start();
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    // Phases 2b and 3 and the pull-request session each held it, and it was let go after each.
    expect(states).toEqual([true, false, true, false, true, false, true, false]);
  });

  it("is released when Kiln stops", async () => {
    const { states, holder } = recorder();
    harness = await createHarness({ sessions: [], engineOptions: { keepAwake: holder } });
    const h = harness;
    const working = flagIn(h, "working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [workingSession(working)] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(working));
    await h.engine.stop("sigint");
    expect(states).toEqual([true, false]);
  });
});
