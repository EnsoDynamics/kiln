// `kiln run` on an unfinished run whose saved folder is gone or holds something else (missing
// worktree recovery, Phase 1): every entry point checks the folders first, the terminal and the
// page say Folder missing instead of a phase state, the page shows what Kiln still knows, and
// Check again leaves the mode once the folder is put back.

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { runInspectionCommand } from "./control/client.js";
import { handoffProjection, statusProjection } from "./control/projection.js";
import { readWork } from "./control/private-state.js";
import { stateRoot } from "./state/state-files.js";
import type { Snapshot } from "./engine/snapshot.js";
import { createHarness, landingSession, waitFor, type Harness } from "./test-support/engine-harness.js";
import { git } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";
import { displayPath } from "./engine/worktree-setup.js";
import { readSessionRecord, writePrdRecord, writeSessionRecord } from "./state/records.js";
import { processStartTime } from "./platform/process-start-time.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());
let ports = "";
beforeEach(async () => { ports = await reservePortRange(); });

function kilnEnv(h: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(h.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? h.env.Path ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
}
const withoutKeepAwakeError = (stdout: string) => stdout.split("\n").filter(line => !line.startsWith("✗ Can’t keep this computer awake")).join("\n");

/** `kiln run` until its output shows `until`, `whileRunning` against its served page, then Ctrl+C. */
async function kilnRunUntil(h: Harness, until: (stdout: string) => boolean, whileRunning?: (page: Page, stdout: () => string) => Promise<void>, resume = true) {
  let stdout = ""; let stderr = "";
  const signals = new EventEmitter();
  const done = runKilnCommand(["run", "docs/prds/customer-returns", ...(resume ? ["--resume"] : [])], {
    cwd: h.repository, env: kilnEnv(h), signals,
    stdout: { write: (text: string) => (stdout += text) }, stderr: { write: (text: string) => (stderr += text) },
    openBrowser: async () => ({ kind: "opened" as const }),
  });
  let ended = false;
  void done.then(() => (ended = true));
  let exitCode: number;
  try {
    await waitFor(() => ended || until(withoutKeepAwakeError(stdout)), 40_000);
    expect(until(withoutKeepAwakeError(stdout)), `kiln run ended before its output showed what the test waits for:\n${stdout}${stderr}`).toBe(true);
    const address = /Set the run up again: (\S+)/.exec(stdout)?.[1] ?? /Opened (\S+)/.exec(stdout)?.[1];
    if (whileRunning) await whileRunning(page(address!, h.engine.record.token), () => withoutKeepAwakeError(stdout));
  } finally {
    signals.emit("SIGINT");
    exitCode = await done;
  }
  return { exitCode, stdout: withoutKeepAwakeError(stdout), stderr };
}

interface Page { snapshot(): Promise<Snapshot>; post(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> }
function page(address: string, token: string): Page {
  const origin = new URL(address).origin;
  return {
    snapshot: async () => (await (await fetch(`${origin}/api/snapshot`, { headers: { "X-Kiln-Token": token } })).json()) as Snapshot,
    post: async (path, body = {}) => {
      const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
  };
}

/** Phase 1 closed and committed but not pushed by the session, so it stops at Needs you; the branch is then pushed by hand. */
async function stoppedRun(push = true): Promise<Harness> {
  harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }] });
  const h = harness;
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.record.phases["1"]!.stop).toBeDefined();
  if (push) git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
  return h;
}

const status = (h: Harness) => statusProjection(readWork(stateRoot(h.env), h.stateDirectory)) as unknown as Record<string, unknown>;

describe("an unfinished run whose folder is missing", () => {
  it("says so in the terminal and on the page instead of a phase state, starts nothing, and leaves the mode once the folder is put back (AC-GONE-01 to 03, AC-FACTS-01, AC-SETUP-06)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    const calls = h.claudeCalls().length;
    const stop = h.engine.record.phases["1"]!.stop!;
    rmSync(saved, { recursive: true, force: true });

    // kiln status's text lead says Folder missing, with no phase progress from the saved plan.
    let printed = "";
    await runInspectionCommand(["status", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), stdout: { write: (text: string) => (printed += text) }, stderr: { write: () => undefined } } as never);
    expect(printed).toContain("Folder missing · nothing has run");
    expect(printed).toContain(`  ${displayPath(saved)}  missing`);
    expect(printed).toContain("Set the run up again: kiln run ");
    expect(printed).not.toMatch(/\d+ of \d+|phase 1/i);

    // kiln status and kiln handoff check the folders at read time, with no controller running.
    const before = status(h);
    expect(before.state).toBe("folder_missing");
    expect(before.stop).toBeNull();
    expect(before.activity).toBeNull();
    expect((before.folder_missing as { repositories: { state: string }[] }).repositories[0]!.state).toBe("missing");
    const handoff = (await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), undefined, h.env)) as unknown as { data: Record<string, unknown> };
    expect(handoff.data).toMatchObject({ resumable: false, resume_command: null, continuation_prompt: null, fresh_session_instructions: null, state: "folder_missing" });

    let seen: { snapshot: Snapshot; resume: number; resumeCode: unknown; again: string; back?: string } | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => {
      const snapshot = await p.snapshot();
      const resume = await p.post("/api/resume");
      const again = await p.post("/api/folder-setup/check");
      // Put the folder back with the command the page shows, then Check again leaves the mode.
      for (const command of snapshot.folderMissing!.restoreCommands) {
        const [, , shared, ...args] = command.split(" ");
        git(h.sandbox, shared!, ...args);
      }
      const back = await p.post("/api/folder-setup/check");
      seen = { snapshot, resume: resume.status, resumeCode: resume.body.code, again: String(again.body.state), back: String(back.body.state) };
    });

    const lines = result.stdout.trimEnd().split("\n");
    // The block, then only the stop line: no phase count or status from the saved plan.
    expect(lines.slice(6).filter(line => !line.startsWith("Kiln stopped"))).toEqual([]);
    expect(lines[0]).toBe("Folder missing · nothing has run");
    expect(lines[1]).toBe("This run’s folder no longer exists:");
    expect(lines[2]).toBe(`  ${displayPath(saved)}  missing`);
    expect(lines[3]).toBe("");
    expect(lines[4]).toMatch(/^The plan on origin\/develop \([0-9a-f]{7}\) has 4 phases, 1 done\. Kiln’s saved plan matches the branch\.$/);
    expect(lines[5]).toMatch(/^Set the run up again: http:\/\/127\.0\.0\.1:\d+\/customer-returns$/);
    // No phase count or status from the saved plan.
    expect(result.stdout).not.toMatch(/phases done|needs you/);
    expect(h.claudeCalls()).toHaveLength(calls);

    const view = seen!.snapshot;
    expect(view.feature.state).toBe("folder_missing");
    expect(view.needsYou).toBeUndefined();
    const repository = view.folderMissing!.repositories[0]!;
    expect(repository).toMatchObject({ name: "acme-shop", state: "missing", gitRecord: "listed", branch: "feature/customer-returns" });
    expect(repository.featureBranch).toMatchObject({ relation: "same", inBase: false, notInBaseCount: 1 });
    expect(repository.featureBranch.local!.sha).toBe(repository.featureBranch.origin!.sha);
    expect(view.folderMissing!.plans.base).toMatchObject({ source: "origin", branch: "develop", total: 4, closed: 1, next: { id: "1", title: "Return intake" } });
    // The latest work lives on the branch, whose plan the saved one matches: phase 1 closed there and in the saved plan.
    expect(view.folderMissing!.plans.saved).toMatchObject({ total: 4, done: 2, label: "matches_branch", comparedWith: "branch" });
    expect(view.folderMissing!.restoreCommands).toEqual([`git -C ${displayPath(h.repository)} worktree add -f ${displayPath(saved)} feature/customer-returns`]);
    expect(seen).toMatchObject({ resume: 409, resumeCode: "folder_missing", again: "folder_missing" });
    // Earlier results only as history, labelled with when they were checked (AC-GONE-02).
    expect(view.folderMissing!.stoppedResult).toEqual({ phaseId: "1", checkedAt: stop.checkedAt, passed: stop.checks.filter(c => c.passed).length, failed: stop.checks.filter(c => !c.passed).length });
    expect(repository.featureBranch.local!.date).toBe(git(h.sandbox, h.repository, "log", "-1", "--format=%cI", repository.featureBranch.local!.sha).trim());
    // Back in place: the startup checks run again (phase 1's pushed work now passes its check) and stop at the restart review, launching nothing.
    expect(seen!.back).toBe("paused");
    expect(readWork(stateRoot(h.env), h.stateDirectory).record.phases["1"]!.doneAt).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(calls);
  });

  it("reads a merged branch and a plan that moved on in the base branch: the 2026-11-06 case (AC-FACTS-01, AC-FACTS-02)", async () => {
    harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    const saved = h.engine.worktreePath;
    // The branch is merged into develop, where the plan then grows and closes more phases.
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    const folder = join(h.repository, "docs/prds/customer-returns");
    writeFileSync(join(folder, "phase-2b-store-credit.md"), "# Phase 2b: Store credit\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-RET-03\n\n## Phase dependencies\n2a\n");
    writeFileSync(join(folder, "phase-4-reports.md"), "# Phase 4: Run reports\n\n## Acceptance criteria covered\nAC-DASH-01\n\n## Phase dependencies\n3\n");
    git(h.sandbox, h.repository, "add", "-A");
    git(h.sandbox, h.repository, "commit", "-q", "-m", "Phases moved on");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(saved, { recursive: true, force: true });

    let view: Snapshot | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => { view = await p.snapshot(); });
    expect(result.stdout.split("\n")[4]).toMatch(/^The plan on origin\/develop \([0-9a-f]{7}\) has 5 phases, 3 done\. Kiln’s saved plan is out of date\.$/);
    const missing = view!.folderMissing!;
    expect(missing.repositories[0]!.featureBranch).toMatchObject({ inBase: true, relation: "same" });
    expect(missing.repositories[0]!.lastPushed).toMatchObject({ phaseId: "1", onOrigin: true, inBase: true });
    expect(missing.plans.base).toMatchObject({ total: 5, closed: 3, next: { id: "3" } });
    expect(missing.plans.saved).toMatchObject({ label: "out_of_date", comparedWith: "base" });
    expect(missing.plans.saved.readAt).toBe(h.engine.record.planReadAt);
    expect(missing.restoreCommands).toHaveLength(1);
  });

  it("names a saved path that now holds a plain folder, and offers no restore command (AC-FACTS-01, AC-SETUP-06)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    mkdirSync(saved, { recursive: true });
    writeFileSync(join(saved, "notes.txt"), "someone else's folder\n");

    let view: Snapshot | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => { view = await p.snapshot(); });
    const lines = result.stdout.split("\n");
    expect(lines[1]).toBe("This run’s folder now holds something else:");
    expect(lines[2]).toBe(`  ${displayPath(saved)}  holds something else`);
    expect(view!.folderMissing!.repositories[0]).toMatchObject({ state: "holds_something_else", holds: "a plain folder, not a git worktree" });
    // Git keeps its record at the path, so the branch shows as checked out in that folder, which is not the run's.
    expect(view!.folderMissing!.restoreCommands).toEqual([]);
    expect(h.engine.folderMissing).toBeUndefined();
  });

  it("reads the shared checkout's own base branch when origin can't be reached, and withholds what depends on origin (AC-FACTS-02, AC-FACTS-03)", async () => {
    // The mockup's case: the local branch is already merged into the local develop, but origin's branch could hold more.
    const h = await stoppedRun();
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "feature/customer-returns");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "no-such-origin.git"));

    let view: Snapshot | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => { view = await p.snapshot(); });
    expect(result.stdout.split("\n")[4]).toMatch(/^The plan on develop \([0-9a-f]{7}\) has 4 phases, 2 done\. Kiln’s saved plan is not compared\.$/);
    const missing = view!.folderMissing!;
    expect(missing.plans.base).toMatchObject({ source: "local", branch: "develop" });
    expect(missing.plans.saved.label).toBe("not_compared");
    expect(missing.repositories[0]!.featureBranch).toMatchObject({ inBase: true });
    expect(missing.restoreCommands).toEqual([]);
    expect(missing.restoreUnknown).toBe(true);
    expect(missing.repositories[0]!.unknown).toContain("feature/customer-returns on origin");
  });

  it("enters Folder missing mid-run at the next command, prints the block, and refuses the command (AC-GONE-01, AC-GONE-03)", async () => {
    const h = await stoppedRun(false);
    let stoppedAt: string | undefined;
    let refused: { status: number; code: unknown } | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Phase 1 still needs you"), async (p, stdout) => {
      const target = (await p.snapshot()).needsYou!.phaseRecovery!.target;
      // kiln run's startup recheck has run; this is the stop as it stands before the folder goes.
      stoppedAt = readWork(stateRoot(h.env), h.stateDirectory).record.phases["1"]!.stop!.checkedAt;
      rmSync(h.engine.worktreePath, { recursive: true, force: true });
      // Verify reruns the folder check before any completion check (AC-GONE-01, replacing AC-VERIFY-01 in part).
      const answer = await p.post("/api/check-again", { target, intent: "verify" });
      refused = { status: answer.status, code: answer.body.code };
      await waitFor(() => stdout().includes("Set the run up again:"));
      expect((await p.snapshot()).feature.state).toBe("folder_missing");
    });
    expect(refused).toEqual({ status: 409, code: "folder_missing" });
    // No completion check ran: the stop is the one recorded before the folder went.
    expect(readWork(stateRoot(h.env), h.stateDirectory).record.phases["1"]!.stop!.checkedAt).toBe(stoppedAt);
    expect(result.stdout).toContain("Folder missing · nothing has run");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("checks the folders again when the page is opened, and shows Folder missing through its event stream (AC-GONE-01)", async () => {
    const h = await stoppedRun(false);
    const result = await kilnRunUntil(h, stdout => stdout.includes("Phase 1 still needs you"), async (_p, stdout) => {
      rmSync(h.engine.worktreePath, { recursive: true, force: true });
      const address = /Opened (\S+)/.exec(stdout())![1]!;
      const abort = new AbortController();
      const events = await fetch(`${new URL(address).origin}/api/events?token=${h.engine.record.token}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]) });
      const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
      let text = ""; let state: string | undefined;
      while (state !== "folder_missing") {
        text += (await reader.read()).value ?? "";
        const latest = [...text.matchAll(/^event: snapshot\ndata: (.*)$/gm)].at(-1);
        if (latest) state = (JSON.parse(latest[1]!) as Snapshot).feature.state;
      }
      abort.abort();
      await waitFor(() => stdout().includes("Set the run up again:"));
    });
    expect(result.stdout).toContain("Folder missing · nothing has run");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("judges nothing when a session ends while its folder is gone, then judges it once the folder is back (AC-GONE-01)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { result: "Stopping here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.folderMissing?.repositories[0]!.state).toBe("missing");
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
    expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    // Put back by hand, as the page's command does: Check again leaves the mode and judges the ended session.
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-f", saved, "feature/customer-returns");
    expect(await h.engine.checkFoldersAgain()).toEqual({ ok: true, folderMissing: false });
    expect(h.engine.record.phases["1"]!.stop?.kind).toBe("done_check");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("checks the folders on the dispatch path, and answers a command once the folder is back with folder_missing_resolved (AC-GONE-01)", async () => {
    // Paused before phase 2b: the next launch is the loop's to make.
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, { actions: [{ result: "unused" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.record.pause.activeSince).toBeDefined();
    h.engine.record.pause = {};
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.continue();
    expect(h.engine.folderMissing).toBeDefined();
    expect(await h.engine.start()).toMatchObject({ ok: false, code: "folder_missing", status: 409 });
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-f", saved, "feature/customer-returns");
    expect(await h.engine.start()).toMatchObject({ ok: false, code: "folder_missing_resolved", status: 409 });
    expect(h.engine.folderMissing).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("puts a folder back with the fetch line first when only origin has the branch (AC-SETUP-06)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    await h.engine.checkFoldersAgain();
    const missing = h.engine.folderMissing!;
    expect(missing.repositories[0]).toMatchObject({ gitRecord: "none", featureBranch: { origin: expect.anything() } });
    expect(missing.repositories[0]!.featureBranch.local).toBeUndefined();
    const shared = displayPath(h.repository);
    expect(missing.restoreCommands).toEqual([`git -C ${shared} fetch origin feature/customer-returns`, `git -C ${shared} worktree add -f ${displayPath(saved)} feature/customer-returns`]);
    for (const command of missing.restoreCommands) { const [, , cwd, ...args] = command.split(" "); git(h.sandbox, cwd!, ...args); }
    expect(await h.engine.checkFoldersAgain()).toEqual({ ok: true, folderMissing: false });
  });

  it("offers no restore command, with the reason, when the existing branch can't be used (AC-SETUP-02's reasons, AC-SETUP-06)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    const branch = "feature/customer-returns";
    const reason = async () => { await h.engine.checkFoldersAgain(); expect(h.engine.folderMissing!.restoreCommands).toEqual([]); const b = h.engine.folderMissing!.existingBranch; return b.available === false ? b.reason : `not unavailable: ${JSON.stringify(b)}`; };
    rmSync(saved, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    const other = join(h.sandbox.root, "scratch");
    git(h.sandbox, h.repository, "worktree", "add", "-q", other, branch);
    expect(await reason()).toBe(`it’s checked out in ${displayPath(other)}, and git allows a branch in one folder at a time.`);
    rmSync(other, { recursive: true, force: true });
    expect(await reason()).toMatch(/^git still records it at .*scratch, a folder that no longer exists/);
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-f", branch, `${branch}~1`);
    expect(await reason()).toBe("your checkout’s branch is behind origin’s, so its first push would be rejected.");
    const behind = h.engine.folderMissing!.repositories[0]!.featureBranch;
    expect(behind.relation).toBe("behind");
    expect(behind.local!.sha).not.toBe(behind.origin!.sha);
    git(h.sandbox, h.repository, "commit-tree", "-m", "x", "-p", `${branch}`, `${branch}^{tree}`);
    const diverged = git(h.sandbox, h.repository, "commit-tree", "-m", "local only", "-p", branch, `${branch}^{tree}`).trim();
    git(h.sandbox, h.repository, "branch", "-f", branch, diverged);
    expect(await reason()).toBe("your checkout’s branch is diverged from origin’s, so its first push would be rejected.");
    expect(h.engine.folderMissing!.repositories[0]!.featureBranch.relation).toBe("diverged");
    git(h.sandbox, h.repository, "branch", "-D", branch);
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", branch);
    expect(await reason()).toBe("the branch was deleted.");
    expect(h.engine.folderMissing!.repositories[0]!.featureBranch.gone).toBe(true);
  });

  it("labels the saved plan Ahead of develop when the deleted branch's pushed work never reached it (AC-FACTS-01, AC-FACTS-02)", async () => {
    harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.checkFoldersAgain();
    const missing = h.engine.folderMissing!;
    expect(missing.plans.saved).toMatchObject({ label: "ahead", aheadPhases: ["1"], comparedWith: "base" });
    expect(missing.repositories[0]!.lastPushed).toMatchObject({ phaseId: "1", onOrigin: false, inBase: false });
  });

  it("names a base-branch plan it couldn't read, and compares nothing (AC-FACTS-03)", async () => {
    const h = await stoppedRun();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/technical-design.md");
    git(h.sandbox, h.repository, "commit", "-q", "-m", "Lose the design");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    let view: Snapshot | undefined;
    const result = await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => { view = await p.snapshot(); });
    expect(result.stdout.split("\n")[4]).toBe("Kiln couldn’t read the plan on develop. Kiln’s saved plan is not compared.");
    expect(view!.folderMissing!.plans.saved.label).toBe("not_compared");
    expect(view!.folderMissing!.plans.base).toMatchObject({ branch: "develop", error: expect.stringContaining("Missing technical design") });
    expect(view!.folderMissing!.repositories[0]!.unknown).toContain("the plan on develop");
  });

  it("withholds the restore command when the feature branch's plan can't be read (AC-FACTS-03, AC-SETUP-06)", async () => {
    const h = await stoppedRun();
    const branch = "feature/customer-returns";
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "checkout", "-q", branch);
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/technical-design.md");
    git(h.sandbox, h.repository, "commit", "-q", "-m", "Lose the design on the branch");
    git(h.sandbox, h.repository, "push", "-q", "origin", branch);
    git(h.sandbox, h.repository, "checkout", "-q", "develop");
    git(h.sandbox, h.repository, "worktree", "add", "-q", h.engine.worktreePath, branch);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.checkFoldersAgain();
    const missing = h.engine.folderMissing!;
    expect(missing.repositories[0]!.unknown).toContain(`the plan on ${branch}`);
    expect(missing.plans.saved.label).toBe("not_compared");
    expect(missing.existingBranch.available).toBe("unknown");
    expect(missing.restoreCommands).toEqual([]);
  });

  it("sets the run up again from the page: a panel edit saves nothing, and Start re-creates the folder and goes on (AC-SETUP-01, AC-SETUP-05, AC-SAFE-01)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    const keepAwakeBefore = h.engine.record.settings.keepAwake;
    rmSync(saved, { recursive: true, force: true });
    let answers: { edit: number; editKeep: unknown; start: number; after: string } | undefined;
    await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => {
      const view = (await p.snapshot()).folderMissing!;
      const panel = view.panel as { selected: "base" | "branch"; previewId: string; fields: { keepAwake: boolean } };
      const before = readWork(stateRoot(h.env), h.stateDirectory).record.settings.keepAwake;
      const edit = await p.post("/api/folder-setup/panel", { start: panel.selected, fields: { keepAwake: !before } });
      const editKeep = readWork(stateRoot(h.env), h.stateDirectory).record.settings.keepAwake === before;
      const refreshed = (await p.snapshot()).folderMissing!;
      const ready = refreshed.panel as { selected: "base" | "branch"; previewId: string };
      const start = await p.post("/api/folder-setup/start", { commandId: "page-start-1", factsId: refreshed.factsId, previewId: ready.previewId, start: ready.selected, fields: {} });
      await waitFor(async () => (await p.snapshot()).feature.state !== "folder_missing");
      answers = { edit: edit.status, editKeep, start: start.status, after: (await p.snapshot()).feature.state };
    });
    expect(answers).toMatchObject({ edit: 200, editKeep: true, start: 200 });
    expect(answers!.after).not.toBe("folder_missing");
    expect(existsSync(join(saved, ".git"))).toBe(true);
    // The panel's edit was saved with Start.
    expect(readWork(stateRoot(h.env), h.stateDirectory).record.settings.keepAwake).toBe(!keepAwakeBefore);
  });
  it("treats a Claude session an earlier Kiln left running as busy when it starts with a folder already missing, and records its end (AC-SAFE-01)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    // An earlier Kiln's Claude session for Phase 1 is still running: its run has a live process and no end.
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    try {
      const startTime = await processStartTime(child.pid!);
      expect(startTime).toBeTruthy();
      const session = h.engine.latestSession("1")!;
      const run = session.runs.at(-1)!;
      delete run.endedAt; run.pid = child.pid!; run.processStartTime = startTime!;
      writeSessionRecord(h.stateDirectory, session);
      rmSync(saved, { recursive: true, force: true });
      let answers: { busy?: string; start: number; code: unknown; after?: string } | undefined;
      await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => {
        const view = (await p.snapshot()).folderMissing!;
        const panel = view.panel as { selected: "base" | "branch"; previewId: string; busy?: string };
        const start = await p.post("/api/folder-setup/start", { commandId: "left-over-start-1", factsId: view.factsId, previewId: panel.previewId, start: panel.selected, fields: {} });
        // Once that process ends, Kiln records the session's end and Start is no longer refused as busy.
        child.kill();
        await waitFor(async () => !((await p.snapshot()).folderMissing!.panel as { busy?: string }).busy);
        answers = { ...(panel.busy ? { busy: panel.busy } : {}), start: start.status, code: start.body.code };
      });
      expect(answers).toEqual({ busy: `A session started by an earlier Kiln is still running (process ${child.pid}). Start becomes available when it ends.`, start: 409, code: "busy" });
      // Start wrote nothing while that session ran: no folder re-created and no new branch.
      expect(existsSync(saved)).toBe(false);
      expect(git(h.sandbox, h.repository, "branch", "--list", "feature/customer-returns*").trim().split("\n").map(line => line.replace(/^[*+ ]+/, ""))).toEqual(["feature/customer-returns"]);
      expect(readSessionRecord(h.stateDirectory, "1", session.sessionId)!.runs.at(-1)!.endedAt).toBeDefined();
    } finally {
      child.kill();
    }
  });
  it("treats the live session of a terminal takeover an earlier Kiln left as busy when it starts with a folder already missing (AC-SAFE-01)", async () => {
    const h = await stoppedRun();
    const saved = h.engine.worktreePath;
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    try {
      const startTime = await processStartTime(child.pid!);
      const session = h.engine.latestSession("1")!;
      const run = session.runs.at(-1)!;
      delete run.endedAt; run.pid = child.pid!; run.processStartTime = startTime!;
      run.control = { operationId: "launch", attemptId: "attempt-1", promptDigest: "0".repeat(64) };
      writeSessionRecord(h.stateDirectory, session);
      // Pause & take over was pending on that session when the earlier Kiln ended.
      const at = new Date().toISOString();
      const record = h.engine.record;
      record.liveControl = { version: 1, revision: 1, takeover: { target: { executionId: record.executionId!, activityId: "1", activityKey: "1", sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: "attempt-1" }, operationId: "hold", instructionId: "hold", requestedAt: at, state: "pending", observedAt: at, reason: "Pausing for terminal takeover." } };
      writePrdRecord(h.stateDirectory, record);
      rmSync(saved, { recursive: true, force: true });
      let busy: string | undefined;
      await kilnRunUntil(h, stdout => stdout.includes("Set the run up again:"), async (p) => {
        busy = ((await p.snapshot()).folderMissing!.panel as { busy?: string }).busy;
        child.kill();
        await waitFor(async () => !((await p.snapshot()).folderMissing!.panel as { busy?: string }).busy);
      });
      expect(busy).toBe(`A session started by an earlier Kiln is still running (process ${child.pid}). Start becomes available when it ends.`);
      expect(readSessionRecord(h.stateDirectory, "1", session.sessionId)!.runs.at(-1)!.endedAt).toBeDefined();
    } finally {
      child.kill();
    }
  });
});
