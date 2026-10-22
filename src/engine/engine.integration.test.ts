// The engine against real Git: a local bare repository as origin, the stand-in claude doing
// real commits and pushes in Kiln's worktree, and the stand-in gh answering pull-request
// checks from a file (technical design, "Testing Approach": engine, done check, setup).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { writeSessionRecord } from "../state/records.js";
import { displayPath } from "./worktree-setup.js";
import { buildSnapshot } from "./snapshot.js";
import { launchArguments } from "../session/claude-session.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const phaseEvents = (h: Harness) =>
  h.events.map((event) =>
    event.kind === "phase"
      ? `${event.phaseId} ${event.event}${event.pushedSha ? ` ${event.pushedSha.slice(0, 7)}` : ""}`
      : event.kind === "pull_request"
        ? `PR ${event.event}${event.number ? ` #${event.number}` : ""}`
        : event.kind,
  );
const originTip = (h: Harness, branch: string) => git(h.sandbox, h.repository, "ls-remote", "origin", `refs/heads/${branch}`).split("\t")[0];

describe("the engine from Start to the pull request", () => {
  it("runs each unclosed leaf in plan order in one worktree and branch, then one pull-request session, and completes", async () => {
    harness = await createHarness({
      sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218)],
    });
    const h = harness;
    const developBefore = originTip(h, "develop");

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();

    // AC-RUN-01: 2a was already closed, so the leaves run 1, 2b, 3, then the pull request (AC-PR-01).
    const record = h.engine.record;
    expect(phaseEvents(h)).toEqual([
      "prd_started",
      "1 started",
      `1 done ${record.phases["1"]!.repositories["acme-shop"]!.pushedSha!.slice(0, 7)}`,
      "2b started",
      `2b done ${record.phases["2b"]!.repositories["acme-shop"]!.pushedSha!.slice(0, 7)}`,
      "3 started",
      `3 done ${record.phases["3"]!.repositories["acme-shop"]!.pushedSha!.slice(0, 7)}`,
      "PR started",
      "PR opened #218",
    ]);
    expect(record.completedAt).toBeDefined();
    expect(record.pullRequests?.[0]).toMatchObject({ number: 218, head: "feature/customer-returns", base: "develop", commits: 2, additions: 120, deletions: 4 });

    // AC-START-07: one new branch from develop and one worktree beside the repository, `.worktrees/<folder>/<repository>`.
    const worktree = join(h.sandbox.root, ".worktrees", "customer-returns", "acme-shop");
    expect(h.engine.worktreePath).toBe(worktree);
    expect(git(h.sandbox, worktree, "branch", "--show-current").trim()).toBe("feature/customer-returns");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
    expect(git(h.sandbox, h.repository, "merge-base", "feature/customer-returns", "develop").trim()).toBe(developBefore);

    // AC-RUN-02, AC-RUN-03: a fresh session per leaf, in the worktree, with the PRD's model and effort and the authorization prompt.
    const calls = h.claudeCalls();
    expect(calls).toHaveLength(4);
    const sessionIds = calls.map((call) => call.args[call.args.indexOf("--session-id") + 1]);
    expect(new Set(sessionIds).size).toBe(4);
    for (const call of calls) {
      expect(call.cwd).toBe(worktree);
      expect(call.args).toEqual([
        "-p", "--input-format", "stream-json", "--session-id", call.args[4],
        "--model", "opus", "--effort", "high",
        "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--forward-subagent-text",
        "--permission-mode", "auto", "--permission-prompts", "none",
        // Multi-repo design, "Sessions": no PowerShell tool, so every shell command is one Stayed in the workspace reads.
        "--disallowedTools", "PowerShell",
        // Multi-repo AC-SPACE-03: the workspace folder, so a repository a session adds is writable by mode.
        "--add-dir", join(h.sandbox.root, ".worktrees", "customer-returns"),
      ]);
    }
    expect(calls[0]!.prompt).toBe(
      [
        "Use the implement-from-requirements skill to implement `docs/prds/customer-returns/phase-1-return-intake.md` of the `Customer returns` PRD (`docs/prds/customer-returns/customer-returns-prd.md`).",
        "",
        `Work only in this worktree, \`${worktree}\`, on branch \`feature/customer-returns\`. Kiln created this worktree and branch for this PRD; it is not a shared checkout and not a parallel-session worktree. Don't switch branches, create another branch or worktree, or land work on any other branch, whatever other instructions say.`,
        "",
        `If you need a repository that isn't in this worktree's workspace, run \`kiln add-repository <folder name>\`; Kiln adds a worktree of it on \`feature/customer-returns\` and prints where. Work there, never in a repository's own checkout such as \`${displayPath(h.sandbox.root)}/<folder name>\`. Before you change a repository, read its own \`CLAUDE.md\` and \`AGENTS.md\`, if it has them, and follow them in that repository.`,
        "",
        "You are authorized, without asking, to commit to `feature/customer-returns`, push it to origin (`git push -u origin feature/customer-returns`), and run refactor-pass after the feature commit. You are not authorized to open a pull request, merge, deploy, or touch any other branch.",
        "",
        "Nobody is watching this session and nobody can answer a question. If you need a decision you can't make, stop and put the question in your final message.",
        "",
        "You're finished when `docs/prds/customer-returns/phase-1-return-intake.md` has its `**Closed:**` line and everything is committed and pushed to `origin/feature/customer-returns`.",
      ].join("\n"),
    );
    expect(calls[1]!.prompt).toContain("implement `docs/prds/customer-returns/phase-2b-store-credit.md`");
    expect(calls[3]!.prompt).toContain("Open one pull request in each of these repositories, from `feature/customer-returns` into the base given");
    expect(calls[3]!.prompt).toContain("- `acme-shop` (`acme/acme-shop`), worktree");

    // AC-GIT-01, AC-GIT-03: Kiln made no commit and added nothing to the repository; develop is untouched.
    expect(originTip(h, "develop")).toBe(developBefore);
    expect(git(h.sandbox, h.repository, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(git(h.sandbox, worktree, "log", "--format=%s", `${developBefore}..HEAD`).trim().split("\n")).toEqual(["feat: the phase", "feat: the phase", "feat: the phase"]);
    // Every gh call is the one read AC-PR-02 makes: this repository, this branch into the base, open, ready-for-review facts.
    expect(h.ghCalls().length).toBeGreaterThan(0);
    for (const call of h.ghCalls()) {
      expect(call).toEqual([
        "pr", "list", "--repo", "github.com/acme/acme-shop", "--head", "feature/customer-returns", "--base", "develop", "--state", "open",
        "--json", "number,title,url,isDraft,isCrossRepository,headRefName,baseRefName,additions,deletions,commits",
      ]);
    }

    // Each phase's record: the pushed commit origin holds, one commit each, and its session's facts.
    expect(record.phases["3"]!.repositories["acme-shop"]!.pushedSha).toBe(originTip(h, "feature/customer-returns"));
    expect(record.phases["1"]!.repositories["acme-shop"]!.commitCount).toBe(1);
    const session = h.engine.latestSession("1")!;
    expect(session).toMatchObject({ model: "opus", initModel: "claude-opus-5-5", modelDisplayName: "Opus 5.5", effort: "high", permissionMode: "auto" });
    expect(session.runs).toHaveLength(1);
    expect(session.runs[0]).toMatchObject({ cause: "launch", exitCode: 0, result: { subtype: "success", isError: false, text: "Phase landed." } });
    expect(session.steps.map((step) => step.name)).toEqual(["Build", "Deliverable review", "Commit", "Refactor pass", "Push"]);

    const snapshot = buildSnapshot(h.engine);
    // AC-WATCH-02: Complete's total time and finish come from when the PRD started and completed.
    expect(snapshot.feature).toMatchObject({ name: "Customer returns", state: "complete", phasesDone: 4, phasesTotal: 4, startedAt: record.startedAt, completedAt: record.completedAt });
    // AC-WATCH-01: a Done row's time, pushed commit and who finished it, and its Details, from the record and Git.
    const firstSession = h.engine.latestSession("1")!;
    expect(snapshot.phases[0]).toMatchObject({
      state: "done",
      doneAt: record.phases["1"]!.doneAt,
      pushedSha: record.phases["1"]!.repositories["acme-shop"]!.pushedSha,
      finishedByPerson: false,
      sessionStartedAt: firstSession.runs[0]!.startedAt,
      details: { from: firstSession.runs[0]!.startedAt, to: record.phases["1"]!.doneAt, worktree: worktree, latestCommit: record.phases["1"]!.repositories["acme-shop"]!.pushedSha, sessionId: firstSession.sessionId },
    });
    expect(snapshot.phases.map((phase) => [phase.id, phase.state])).toEqual([
      ["1", "done"],
      ["2", "split"],
      ["2a", "done"],
      ["2b", "done"],
      ["3", "done"],
      ["pr", "done"],
    ]);
    expect(snapshot.phases.find((phase) => phase.id === "2a")?.details).toBeUndefined();
    expect(snapshot.phases[0]!.details).toMatchObject({ model: "Opus 5.5", effort: "high", branch: "feature/customer-returns", commitCount: 1 });
    // AC-PR-04, AC-PR-05: the Complete screen's pull request, from the record, and the pull-request session's own row.
    expect(snapshot.pullRequests).toEqual(record.pullRequests);
    expect(snapshot.pullRequests?.[0]).toMatchObject({ repository: "acme-shop", number: 218, url: expect.stringMatching(/\/pull\/218$/), head: "feature/customer-returns", base: "develop" });
    const prRow = snapshot.phases.at(-1)!;
    expect(prRow).toMatchObject({ id: "pr", title: "Final pull request", file: "pull request session", state: "done" });
    expect(prRow.details).toBeUndefined();
    expect(prRow.pushedSha).toBeUndefined();
  });

  it("follows a phase that splits itself: judges its first child, then carries on with the next unclosed leaf", async () => {
    harness = await createHarness({
      sessions: [
        {
          actions: [
            { skill: "implement-from-requirements" },
            { split: [{ id: "1a", slug: "intake-form", title: "Intake form", closed: true }, { id: "1b", slug: "intake-email", title: "Intake email" }] },
            { commit: "feat: 1a, and split phase 1" },
            { push: true },
            { result: "Split phase 1; 1a is done." },
          ],
        },
        landingSession("src/email.txt"),
        landingSession("src/credit.txt"),
        landingSession("src/dashboard.txt"),
        pullRequestSession(9),
      ],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // AC-RUN-04: "1 started" is followed by "1a done", and Kiln carries on with 1b.
    expect(phaseEvents(h).slice(1, 5)).toEqual(["1 started", expect.stringMatching(/^1a done /), "1b started", expect.stringMatching(/^1b done /)]);
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.claudeCalls()[1]!.prompt).toContain("implement `docs/prds/customer-returns/phase-1b-intake-email.md`");
    const rows = buildSnapshot(h.engine).phases.map((phase) => [phase.id, phase.state]);
    expect(rows.slice(0, 3)).toEqual([["1", "split"], ["1a", "done"], ["1b", "done"]]);
    // The launched leaf's session shows on its judged leaf's row.
    expect(buildSnapshot(h.engine).phases[1]!.details?.sessionId).toBe(h.engine.latestSession("1")!.sessionId);
  });
});

describe("the snapshot while a phase works", () => {
  it("shows the feature's state, every row with its title, and the current phase's session, steps and commits; settings apart from them", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const reached = join(h.sandbox.root, "reached");
    const release = join(h.sandbox.root, "release");
    const working = [
      { skill: "enso-method:implement-from-requirements" },
      { write: { path: "src/intake.txt", content: "wip\n" } },
      { commit: "feat: intake, first part" },
      // Kiln reads the phase's commits from Git at most every 5 seconds while its session works.
      { sleepFor: 5_100 },
      { text: "Carrying on with the intake form." },
      { touch: reached },
      { waitForFile: release },
      { close: true },
      { commit: "feat: intake" },
      { push: true },
      { result: "Phase landed." },
    ];
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: working }, { actions: [{ result: "Stop here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(reached) && buildSnapshot(h.engine).current?.repositories[0]?.commits.length === 1, 15_000);

    const snapshot = buildSnapshot(h.engine);
    const session = h.engine.latestSession("1")!;
    const startedAt = session.runs[0]!.startedAt;
    // AC-WATCH-02: implementing phase 1, with 2a (closed before Start) counted as done.
    expect(snapshot.feature).toMatchObject({ state: "implementing", currentPhaseId: "1", phasesDone: 1, phasesTotal: 4 });
    expect(snapshot.feature.stoppedAt).toBeUndefined();
    // AC-WATCH-01, AC-LOOK-03: every phase in plan order, its title word for word, its state; no pull-request row while a leaf is open (AC-PR-05).
    expect(snapshot.phases.map((phase) => [phase.id, phase.title, phase.file, phase.state])).toEqual([
      ["1", "Return intake", "phase-1-return-intake.md", "implementing"],
      ["2", "Refunds", "phase-2-refunds.md", "split"],
      ["2a", "Card refunds", "phase-2a-card-refunds.md", "done"],
      ["2b", "Store credit", "phase-2b-store-credit.md", "planned"],
      ["3", "Returns dashboard", "phase-3-returns-dashboard.md", "planned"],
    ]);
    expect(snapshot.phases[0]!.sessionStartedAt).toBe(startedAt);
    // AC-WATCH-03, AC-WATCH-06: the current phase's session, what was last seen, its latest line and its commits read from Git.
    const head = git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim();
    expect(snapshot.current).toMatchObject({
      phaseId: "1",
      sessionId: session.sessionId,
      model: "Opus 5.5",
      effort: "high",
      startedAt,
      seenInSession: { text: "first git commit seen" },
      latestLine: { text: "Carrying on with the intake form." },
      repositories: [{ name: "acme-shop", commits: [{ sha: head, subject: "feat: intake, first part" }] }],
    });
    // AC-WATCH-04: Build is finished and Commit current; the steps the session never called stay unreached.
    expect(snapshot.current!.steps.map((step) => [step.name, step.state])).toEqual([
      ["Build", "finished"],
      ["Deliverable review", "unreached"],
      ["Test hardening", "unreached"],
      ["Commit", "current"],
      ["Refactor pass", "unreached"],
      ["Push", "unreached"],
    ]);

    // AC-WATCH-07: a settings change shows in the settings; the working phase keeps what it started with.
    expect(await h.engine.changeSettings({ model: "sonnet", effort: "max" })).toEqual({ ok: true });
    const changed = buildSnapshot(h.engine);
    expect(changed.settings).toMatchObject({ model: { value: "sonnet" }, effort: "max" });
    expect(changed.current).toMatchObject({ model: "Opus 5.5", effort: "high" });

    writeFileSync(release, "");
    await h.engine.settled();
    const done = buildSnapshot(h.engine).phases[0]!;
    expect(done).toMatchObject({ state: "done", details: { model: "Opus 5.5", effort: "high", sessionId: session.sessionId } });
    expect(h.engine.latestSession("2b")).toMatchObject({ model: "sonnet", effort: "max" });
  });
});

describe("a phase that doesn't land", () => {
  it("stops at Needs you without retrying, shows the session's own words, and Check again carries on once the person finishes it", async () => {
    harness = await createHarness({
      sessions: [
        // Exits cleanly saying it finished, but never pushes (AC-DONE-02).
        { actions: [{ skill: "implement-from-requirements" }, { close: true }, { commit: "feat: intake" }, { result: "All done, everything is pushed." }, { exit: 0 }] },
        landingSession("src/credit.txt"),
      ],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped"]);
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop.kind).toBe("done_check");
    expect(stop.checks).toEqual([
      { name: "Phase doc closed", passed: true, facts: ["Closed line in phase-1-return-intake.md"] },
      { name: "Everything committed", passed: true, facts: [expect.stringMatching(/^Latest commit [0-9a-f]{7}, tree clean$/)] },
      { name: "Pushed", passed: false, facts: ["feature/customer-returns isn't on origin yet"] },
    ]);

    // AC-STOP-01, AC-STOP-08: no retry and no later phase, however long Kiln waits.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.pause()).toMatchObject({ ok: false, status: 409 });

    const snapshot = buildSnapshot(h.engine);
    const session = h.engine.latestSession("1")!;
    expect(snapshot.feature.state).toBe("needs_you");
    expect(snapshot.needsYou).toMatchObject({
      phaseId: "1",
      kind: "done_check",
      finalMessage: "All done, everything is pushed.",
      exitCode: 0,
      lastSkill: { name: "implement-from-requirements" },
      // AC-STOP-02: the time the session stopped is its run's end, on the screen and in the header.
      stoppedAt: session.runs[0]!.endedAt,
    });
    expect(snapshot.feature.stoppedAt).toBe(session.runs[0]!.endedAt);
    // AC-STOP-05: the command changes to this PRD's worktree and reopens this session.
    expect(snapshot.needsYou!.resumeCommand).toBe(
      process.platform === "win32" ? `cd '${h.engine.worktreePath}'; claude --resume ${session.sessionId}` : `cd ${h.engine.worktreePath}\nclaude --resume ${session.sessionId}`,
    );
    expect(snapshot.needsYou!.lastLines).toBeUndefined();
    // AC-STOP-06: the fresh-session prompt points at the stopped phase's document.
    expect(snapshot.needsYou!.freshSessionPrompt.split("\n\n")[0]).toMatch(/^Use the implement-from-requirements skill to implement `docs\/prds\/customer-returns\/phase-1-return-intake\.md` of the `Customer returns` PRD/);
    expect(snapshot.needsYou!.freshSessionPrompt).toContain("A previous session stopped partway through this phase; check the worktree's state before you start.");
    expect(snapshot.phases.find((phase) => phase.id === "1")?.state).toBe("needs_you");
    // Full session output identifies the stopped session, with the phase's commits read from Git (AC-WATCH-06, AC-WATCH-10).
    expect(snapshot.needsYou).toMatchObject({ sessionId: session.sessionId, model: session.modelDisplayName, effort: "high", sessionStartedAt: session.runs[0]!.startedAt });
    const head = git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim();
    expect(snapshot.needsYou!.repositories).toEqual([{ name: "acme-shop", commits: [{ sha: head, subject: "feat: intake" }] }]);
    // The stopped row's Details, drawn on the Disconnected layout, has the same commits (AC-WATCH-01).
    expect(snapshot.phases.find((phase) => phase.id === "1")?.details).toMatchObject({ commitCount: 1, latestCommit: head });
    // A fresh session starts in the worktree (UI-007): the path needs no quoting here, and isn't under the home folder.
    expect(snapshot.needsYou!.freshSessionCommand).toBe(process.platform === "win32" ? `cd '${h.engine.worktreePath}'; claude` : `cd ${h.engine.worktreePath}\nclaude`);

    // The person finishes it outside Kiln (AC-RUN-07); Check again finds it done, finished by them (AC-STOP-07).
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    expect(await h.engine.checkAgain()).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]).toMatchObject({ finishedByPerson: true, repositories: { "acme-shop": { pushedSha: expect.stringMatching(/^[0-9a-f]{40}$/) } } });
    expect(h.engine.record.phases["1"]!.stop).toBeUndefined();
    // Its row says the person finished it, with the commit they pushed (AC-WATCH-01).
    expect(buildSnapshot(h.engine).phases[0]).toMatchObject({ id: "1", state: "done", finishedByPerson: true, pushedSha: h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha });
    expect(phaseEvents(h).slice(3, 5)).toEqual([expect.stringMatching(/^1 done /), "2b started"]);
  });

  it("counts a session that crashed as Done when its work passes all three checks", async () => {
    harness = await createHarness({
      sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { push: true }, { stderr: "Error: something broke" }, { exit: 1 }] }, { actions: [{ result: "Stopping." }, { exit: 0 }] }],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(phaseEvents(h).slice(1, 4)).toEqual(["1 started", expect.stringMatching(/^1 done /), "2b started"]);
    expect(h.engine.latestSession("1")!.runs[0]).toMatchObject({ exitCode: 1 });
  });

  it("names uncommitted files, a worktree on another branch, and origin ahead of or apart from the branch", async () => {
    // New files, a changed tracked file and a staged one: everything a session can leave uncommitted.
    const leftOver = [
      { write: { path: "a.txt", content: "a" } },
      { write: { path: "b/c.txt", content: "c" } },
      { write: { path: "README.md", content: "# acme-shop, half edited\n" } },
      { write: { path: "staged.txt", content: "staged" } },
      { stage: "staged.txt" },
    ];
    harness = await createHarness({ sessions: [{ actions: [...leftOver, { exit: 0 }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const checks = () => h.engine.record.phases["1"]!.stop!.checks;
    // Setup's --no-track: the branch has no upstream until a session pushes, so a bare `git push` never targets the base.
    expect(() => git(h.sandbox, h.repository, "rev-parse", "--abbrev-ref", "feature/customer-returns@{upstream}")).toThrow();
    expect(checks().map((check) => check.facts[0])).toEqual(["No Closed line in phase-1-return-intake.md", "4 files changed, not committed", "feature/customer-returns isn't on origin yet"]);
    const snapshot = buildSnapshot(h.engine);
    // No final message: the last output lines show instead, ending with the exit.
    expect(snapshot.needsYou!.finalMessage).toBeUndefined();
    expect(snapshot.needsYou!.lastLines!.at(-1)).toMatchObject({ source: "exit", text: "Process exited with code 0" });

    // AC-GIT-02: Check again and the next kiln run leave the uncommitted work exactly as it is.
    const worktree = h.engine.worktreePath;
    const workState = () => ({
      status: git(h.sandbox, worktree, "status", "--porcelain", "--untracked-files=all"),
      unstaged: git(h.sandbox, worktree, "diff"),
      staged: git(h.sandbox, worktree, "diff", "--cached"),
    });
    const before = workState();
    expect(before.status.split("\n").filter(Boolean).sort()).toEqual([" M README.md", "?? a.txt", "?? b/c.txt", "A  staged.txt"]);
    await h.engine.checkAgain();
    const reopened = h.reopen();
    await reopened.prepare();
    expect(await reopened.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    expect(workState()).toEqual(before);
    expect(readFileSync(join(worktree, "b", "c.txt"), "utf8")).toBe("c");
    expect(readFileSync(join(worktree, "README.md"), "utf8")).toBe("# acme-shop, half edited\n");
    expect(h.claudeCalls()).toHaveLength(1);

    git(h.sandbox, worktree, "add", "-A");
    git(h.sandbox, worktree, "commit", "-q", "-m", "wip");
    git(h.sandbox, worktree, "push", "-q", "origin", "HEAD:feature/customer-returns");
    git(h.sandbox, worktree, "commit", "-q", "--allow-empty", "-m", "local only");
    await h.engine.checkAgain();
    const local = git(h.sandbox, worktree, "rev-parse", "--short=7", "HEAD").trim();
    expect(checks()[2]!.facts[0]).toBe(`${local} isn't on origin yet`);

    git(h.sandbox, worktree, "switch", "-q", "-c", "elsewhere");
    await h.engine.checkAgain();
    expect(checks()[2]!.facts[0]).toBe("The worktree is on elsewhere, not feature/customer-returns");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("goes to Needs you with the spawn error, and no retry, when claude can't be started", async () => {
    harness = await createHarness({ sessions: [], claude: join("/nonexistent", "claude") });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const run = h.engine.latestSession("1")!.runs[0]!;
    expect(run.spawnError?.code).toBe("ENOENT");
    expect(run.endedAt).toBe(run.startedAt);
    expect(run.pid).toBeUndefined();
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou).toMatchObject({ kind: "done_check", spawnError: { code: "ENOENT" } });
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.lastSkill).toBeUndefined();
    expect(needsYou.lastLines!.map((line) => line.text)).toEqual([expect.stringMatching(/^Couldn't start claude in .*customer-returns[/\\]acme-shop: /)]);
    // Nothing ran, so the fresh-session prompt is the phase prompt unchanged.
    expect(needsYou.freshSessionPrompt).not.toContain("A previous session stopped");
    // A session that never started passes Stayed in the workspace, which Needs you lists only when it failed (multi-repo AC-OUTSIDE-01).
    expect(h.engine.record.phases["1"]!.stop!.checks.map((check) => check.name)).toEqual(["Phase doc closed", "Everything committed", "Pushed"]);
    expect(needsYou.outside).toBeUndefined();
  });
});

describe("a session that would ask (AC-RUN-05)", () => {
  // Two real Claude Code sessions recorded with Kiln's launch flags (2026-10-22, Claude Code
  // 2.1.307): one whose Bash call auto mode refused instead of asking, and one told to use
  // AskUserQuestion, which a headless session doesn't offer. Each ended on its own with its
  // question as its final message.
  const recordings = [
    { name: "refused-tool-call-ends-with-question", question: "should the new file be named `alpha.txt` or `beta.txt`?" },
    { name: "ask-user-question-unavailable", question: "Which name do you want: `alpha.txt` or `beta.txt`?" },
  ];
  const fixture = (file: string) => readFileSync(new URL(`../../test/fixtures/proof-gate-1/${file}`, import.meta.url), "utf8");

  it.each(recordings)("$name: was recorded with the flags Kiln launches with, and asked no one", ({ name }) => {
    const meta = JSON.parse(fixture(`${name}.meta.json`)) as { command: string[]; exitCode: number; result: { subtype: string } };
    const sessionId = meta.command[meta.command.indexOf("--session-id") + 1]!;
    // A change to the flags means the recording no longer shows what Kiln's sessions do: record it again.
    expect(meta.command).toEqual(["claude", ...launchArguments(sessionId, "sonnet", "low")]);
    expect(meta).toMatchObject({ exitCode: 0, result: { subtype: "success" } });
    const events = fixture(`${name}.jsonl`).trim().split("\n").map((line) => (JSON.parse(line) as { event: { type: string; subtype?: string; permission_denials?: unknown[] } }).event);
    // Nothing in it waited on a person: no control request went out for an answer.
    expect(events.filter((event) => event.type === "control_request")).toEqual([]);
    if (name === "refused-tool-call-ends-with-question") expect(events.at(-1)!.permission_denials).toHaveLength(1);
  });

  it.each(recordings)("$name: the run ends without input and the phase goes to Needs you with the question as the final message", async ({ name, question }) => {
    harness = await createHarness({ sessions: [{ actions: [{ replay: `proof-gate-1/${name}.jsonl` }, { exit: 0 }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    expect(phaseEvents(h)).toEqual(["prd_started", "1 started", "1 stopped"]);
    const run = h.engine.latestSession("1")!.runs[0]!;
    expect(run).toMatchObject({ exitCode: 0, endedAt: expect.any(String) });
    expect(run.interruptedBy).toBeUndefined();
    const recorded = (JSON.parse(fixture(`${name}.meta.json`)) as { result: { result: string } }).result.result;
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou).toMatchObject({ phaseId: "1", kind: "done_check", finalMessage: recorded });
    expect(needsYou.finalMessage).toContain(question);
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("the done check needs all three", () => {
  it.each([
    ["committed and pushed but a file left over", [{ close: true }, { commit: "feat: x" }, { push: true }, { write: { path: "stray.txt", content: "x" } }], [true, false, true]],
    [
      "committed and pushed but a tracked file changed and another staged",
      [{ write: { path: "staged.txt", content: "1" } }, { close: true }, { commit: "feat: x" }, { push: true }, { write: { path: "README.md", content: "changed\n" } }, { write: { path: "staged.txt", content: "2" } }, { stage: "staged.txt" }],
      [true, false, true],
    ],
    ["committed and pushed but not closed", [{ write: { path: "a.txt", content: "a" } }, { commit: "feat: x" }, { push: true }], [false, true, true]],
  ])("stops when only one check fails: %s", async (_name, actions, passed) => {
    harness = await createHarness({ sessions: [{ actions: [...actions, { result: "Done." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    expect(h.engine.record.phases["1"]!.stop!.checks.map((check) => check.passed)).toEqual(passed);
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("judges a split leaf by its first child's Closed line, not a later child's", async () => {
    harness = await createHarness({
      sessions: [{ actions: [{ split: [{ id: "1a", slug: "intake-form", title: "Intake form" }, { id: "1b", slug: "intake-email", title: "Intake email", closed: true }] }, { commit: "split" }, { push: true }, { result: "Split." }] }],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.checks[0]).toEqual({ name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-1a-intake-form.md"] });
    expect(phaseEvents(h).at(-1)).toBe("1a stopped");
    expect(buildSnapshot(h.engine).needsYou!.phaseId).toBe("1a");
    // The fresh-session prompt points at the leaf judged, the split's first child (AC-STOP-06).
    expect(buildSnapshot(h.engine).needsYou!.freshSessionPrompt).toMatch(/^Use the implement-from-requirements skill to implement `docs\/prds\/customer-returns\/phase-1a-intake-form\.md` /);
  });
});

describe("Kiln's own Git changes", () => {
  it("are the worktree and branch at setup and nothing else; every other git call it makes reads", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(1)], logGit: true });
    const h = harness;
    const refs = (path: string) => git(h.sandbox, path, "for-each-ref", "--format=%(refname) %(objectname)").trim().split("\n");
    const config = () => git(h.sandbox, h.repository, "config", "--local", "--list");
    const refsBefore = refs(h.repository);
    const originRefsBefore = refs(h.origin);
    const configBefore = config();

    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();

    // The only new refs are Kiln's branch and, on origin, the sessions' pushes of it (AC-GIT-01).
    const branch = "refs/heads/feature/customer-returns";
    expect(refs(h.repository).filter((ref) => !refsBefore.includes(ref)).map((ref) => ref.split(" ")[0])).toEqual(
      expect.arrayContaining([branch]),
    );
    for (const ref of refs(h.repository).filter((row) => !refsBefore.includes(row))) {
      expect([branch, "refs/remotes/origin/feature/customer-returns"]).toContain(ref.split(" ")[0]);
    }
    expect(refs(h.origin).filter((ref) => !originRefsBefore.includes(ref)).map((ref) => ref.split(" ")[0])).toEqual([branch]);
    // The one config change is the upstream the sessions' `git push -u` set; Kiln adds the branch with --no-track.
    expect(config().split("\n").filter((line) => !configBefore.includes(line) && line !== "")).toEqual([
      "branch.feature/customer-returns.remote=origin",
      "branch.feature/customer-returns.merge=refs/heads/feature/customer-returns",
    ]);

    // AC-GIT-02: Kiln's own git calls never reset, stash, clean, push, commit, delete a branch or write config.
    const calls = h.kilnGitCalls();
    const subcommands = calls.map((call) => call.split(" ").filter((word, index, words) => !(index > 0 && words[index - 1] === "-C") && word !== "-C")[0]);
    expect(subcommands.filter((name) => ["reset", "stash", "clean", "push", "commit", "config", "branch", "update-ref", "checkout", "switch"].includes(name!))).toEqual([]);
    expect(calls.filter((call) => / worktree add |^worktree add /.test(call))).toHaveLength(1);
  });

  it("fetches a base tip that isn't local with objects only, moving no ref and writing no FETCH_HEAD", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stop." }] }] });
    const h = harness;
    const other = join(h.sandbox.root, "other");
    git(h.sandbox, h.sandbox.root, "clone", "-q", "-b", "develop", h.origin, other);
    writeFileSync(join(other, "unrelated.txt"), "x");
    git(h.sandbox, other, "add", "-A");
    git(h.sandbox, other, "commit", "-q", "-m", "unrelated change on develop");
    git(h.sandbox, other, "push", "-q", "origin", "develop");
    const newTip = git(h.sandbox, other, "rev-parse", "HEAD").trim();
    const trackingBefore = git(h.sandbox, h.repository, "rev-parse", "refs/remotes/origin/develop").trim();

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]?.baseCommit).toBe(newTip);
    expect(git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns~0").trim()).toBe(newTip);
    expect(git(h.sandbox, h.repository, "rev-parse", "refs/remotes/origin/develop").trim()).toBe(trackingBefore);
    expect(existsSync(join(h.repository, ".git", "FETCH_HEAD"))).toBe(false);
  });

  it("starts from origin's default branch when there is no develop", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stop." }] }], branch: "main" });
    const h = harness;
    expect(h.engine.record.settings.baseBranch).toBe("main");
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(git(h.sandbox, h.repository, "merge-base", "feature/customer-returns", "main").trim()).toBe(git(h.sandbox, h.repository, "rev-parse", "main").trim());
  });
});

describe("two PRDs in one repository", () => {
  it("each work only in their own worktree and branch", async () => {
    harness = await createHarness({ sessions: [landingSession("src/returns.txt"), { actions: [{ result: "Stop." }] }, landingSession("src/cards.txt"), { actions: [{ result: "Stop." }] }], extraFolders: ["gift-cards"] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const gifts = await h.engineFor("gift-cards");
    expect(await gifts.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await gifts.settled();

    expect(gifts.worktreePath).toBe(join(h.sandbox.root, ".worktrees", "gift-cards", "acme-shop"));
    expect(gifts.worktreePath).not.toBe(h.engine.worktreePath);
    expect(gifts.stateDirectory).not.toBe(h.engine.stateDirectory);
    const calls = h.claudeCalls();
    expect(calls.map((call) => call.cwd)).toEqual([h.engine.worktreePath, h.engine.worktreePath, gifts.worktreePath, gifts.worktreePath]);
    expect(calls[2]!.prompt).toContain("on branch `feature/gift-cards`");
    // Each branch holds only its own sessions' work.
    const files = (branch: string) => git(h.sandbox, h.repository, "diff", "--name-only", `develop...${branch}`).trim().split("\n");
    expect(files("feature/customer-returns")).toContain("src/returns.txt");
    expect(files("feature/customer-returns")).not.toContain("src/cards.txt");
    expect(files("feature/gift-cards")).toContain("src/cards.txt");
    expect(files("feature/gift-cards")).not.toContain("src/returns.txt");
  });
});

describe("pausing between phases", () => {
  it("holds after the current phase is Done when Pause is pressed during it, and Start carries on", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release-phase-1");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);

    expect(h.engine.pause()).toEqual({ ok: true });
    expect(buildSnapshot(h.engine).pause).toEqual({ pending: true, active: false });
    writeFileSync(release, "");
    await h.engine.settled();

    expect(h.claudeCalls()).toHaveLength(1);
    // A pause taking effect prints no line (AC-START-09): phase 1's done line is the last.
    expect(h.events.at(-1)).toMatchObject({ kind: "phase", phaseId: "1", event: "done" });
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.state).toBe("paused");
    expect(snapshot.pause).toEqual({ pending: false, active: true });
    expect(snapshot.phases.find((phase) => phase.id === "2b")?.state).toBe("next");
    expect(h.engine.cancelPause()).toMatchObject({ ok: false, status: 409 });

    // AC-VIEW-03: a kiln run while the pause is in effect stays paused and starts nothing.
    const reopened = h.reopen();
    await reopened.prepare();
    expect(await reopened.decide()).toEqual({ kind: "paused", beforePhaseKey: "2b" });
    await reopened.continue();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(buildSnapshot(reopened).feature.state).toBe("paused");

    expect(await h.engine.start()).toEqual({ ok: true });
    await waitFor(() => h.claudeCalls().length === 2);
    await h.engine.settled();
    expect(phaseEvents(h).slice(3, 5)).toEqual(["2b started", expect.stringMatching(/^2b done /)]);
  });

  it("lets Keep going cancel a pause until the phase is Done", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, { actions: [{ result: "Question?" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    expect(h.engine.pause()).toEqual({ ok: true });
    expect(h.engine.cancelPause()).toEqual({ ok: true });
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(2);
  });

  it("keeps a pause requested before a Needs you, and holds once Check again passes", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { close: true }, { commit: "feat: x" }, { exit: 0 }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    await h.engine.checkAgain();
    await h.engine.settled();
    expect(buildSnapshot(h.engine).feature.state).toBe("paused");
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("a plan that breaks after Start", () => {
  it("stops before the next phase with the plan's problem, and starts it once the plan reads again", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();

    // While paused, someone removes 2b's file; Start reads the plan and stops on 2b.
    const prdDirectory = join(h.engine.worktreePath, "docs", "prds", "customer-returns");
    const removed = readFileSync(join(prdDirectory, "phase-2b-store-credit.md"), "utf8");
    rmSync(join(prdDirectory, "phase-2b-store-credit.md"));
    await h.engine.start();
    await h.engine.settled();
    const stop = h.engine.record.phases["2b"]!.stop!;
    expect(stop).toMatchObject({ kind: "plan", checks: [{ name: "Phase plan reads", passed: false, facts: ["phase-2-refunds.md lists 2b, which has no file."] }] });
    expect(h.claudeCalls()).toHaveLength(1);
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.resumeCommand).toBeUndefined();
    expect(needsYou.finalMessage).toBeUndefined();
    expect(needsYou.freshSessionPrompt).not.toContain("A previous session stopped");

    // AC-STOP-07: until the plan reads, Check again and kiln run read it again and the stop stays, starting nothing.
    const firstCheckedAt = stop.checkedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await h.engine.checkAgain();
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop).toMatchObject({ kind: "plan", checks: [{ passed: false, facts: ["phase-2-refunds.md lists 2b, which has no file."] }] });
    expect(h.engine.record.phases["2b"]!.stop!.checkedAt > firstCheckedAt).toBe(true);
    const reopened = h.reopen();
    await reopened.prepare();
    expect(await reopened.decide()).toEqual({ kind: "plan_stop", phaseKey: "2b" });
    expect(h.claudeCalls()).toHaveLength(1);

    writeFileSync(join(prdDirectory, "phase-2b-store-credit.md"), removed);
    // Once the plan reads, kiln run clears the stop and starts the phase, marking nothing Done.
    const again = h.reopen();
    await again.prepare();
    expect(await again.decide()).toEqual({ kind: "start_phase", phaseId: "2b" });
    expect(again.record.phases["2b"]?.stop).toBeUndefined();
    expect(again.record.phases["2b"]?.doneAt).toBeUndefined();
    await again.continue();
    // Clearing a plan stop marks nothing Done: 2b then runs as its own session, and the loop goes on to 3.
    expect(h.engine.record.phases["2b"]).toMatchObject({ finishedByPerson: false, doneAt: expect.any(String) });
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-2b-store-credit.md");
  });

  it("holds a pause still waiting once the plan reads again, and marks nothing Done", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    const prdDirectory = join(h.engine.worktreePath, "docs", "prds", "customer-returns");
    const removed = readFileSync(join(prdDirectory, "phase-2b-store-credit.md"), "utf8");
    rmSync(join(prdDirectory, "phase-2b-store-credit.md"));
    // As if Kiln stopped with the pause requested and not yet in effect: kiln run finds the broken plan first.
    h.engine.record.pause = { requestedAt: new Date().toISOString() };
    const engine = h.reopen();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "plan_stop", phaseKey: "2b" });

    writeFileSync(join(prdDirectory, "phase-2b-store-credit.md"), removed);
    await engine.checkAgain();
    await engine.settled();
    expect(buildSnapshot(engine).feature.state).toBe("paused");
    expect(engine.record.phases["2b"]?.doneAt).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("fails the Closed check with the plan's problem when the worktree is gone after a session, never starting the pull request", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ exit: 0 }] }] });
    const h = harness;
    const release = join(h.sandbox.root, "gone");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { exit: 0 }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    const prdDirectory = join(h.engine.worktreePath, "docs", "prds", "customer-returns");
    rmSync(prdDirectory, { recursive: true });
    writeFileSync(release, "");
    await h.engine.settled();
    const stop = h.engine.record.phases["1"]!.stop!;
    expect(stop.kind).toBe("done_check");
    expect(stop.checks[0]!.facts[0]).toBe(`Couldn't read the phase plan: ${prdDirectory} doesn't exist`);
    expect(h.ghCalls()).toHaveLength(0);
  });
});

describe("the pull request", () => {
  it("counts a draft as not open (WORK-001), and Check again completes once it is ready", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(31, true)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop).toMatchObject({ kind: "pull_request_check", checks: [{ name: "Pull request open", passed: false, facts: ["#31 is a draft"] }] });
    // AC-STOP-01: the pull-request session isn't rerun either.
    expect(h.claudeCalls()).toHaveLength(4);
    expect(buildSnapshot(h.engine).needsYou!.freshSessionPrompt).toMatch(/^Every phase of the `Customer returns` PRD/);
    expect(h.engine.pause()).toMatchObject({ ok: false });

    const state = JSON.parse(readFileSync(h.ghStatePath, "utf8")) as { pulls: { isDraft: boolean }[] };
    state.pulls[0]!.isDraft = false;
    writeFileSync(h.ghStatePath, JSON.stringify(state));
    await h.engine.checkAgain();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.engine.record.phases.pr).toMatchObject({ finishedByPerson: true });
  });

  it("completes with no pull-request session when one is already open, ignoring a fork's of the same branch name", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c")] });
    const h = harness;
    const pull = { title: "x", url: "u", headRefName: "feature/customer-returns", baseRefName: "develop", additions: 1, deletions: 0, commits: [] };
    h.setPulls([{ ...pull, number: 5, isDraft: false, isCrossRepository: true }]);
    const release = join(h.sandbox.root, "release");
    // Open our own pull request while the last phase is working.
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("a"), landingSession("b"), { actions: [{ waitForFile: release }, ...landingSession("c").actions] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 3);
    h.setPulls([{ ...pull, number: 5, isDraft: false, isCrossRepository: true }, { ...pull, number: 6, isDraft: false, isCrossRepository: false }]);
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(3);
    expect(h.engine.record.pullRequests?.[0]?.number).toBe(6);
    expect(phaseEvents(h).at(-1)).toBe("PR opened #6");
    expect(phaseEvents(h)).not.toContain("PR started");
  });

  it("offers no pause while the pull-request session works (AC-PR-05)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), { actions: [{ waitForFile: release }, ...pullRequestSession(40).actions] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 4);
    expect(buildSnapshot(h.engine).current?.phaseId).toBe("pr");
    expect(h.engine.pause()).toMatchObject({ ok: false, status: 409 });
    expect(buildSnapshot(h.engine).pause).toEqual({ pending: false, active: false });
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.record.pullRequests?.[0]?.number).toBe(40);
  });

  it("stops at Needs you when the pull-request session opens nothing", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), { actions: [{ result: "Opened it." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop!.checks).toEqual([{ name: "Pull request open", passed: false, facts: ["No open pull request from feature/customer-returns into develop"] }]);
    expect(h.engine.record.completedAt).toBeUndefined();
    expect(phaseEvents(h).at(-1)).toBe("PR stopped");
  });

  it("starts the pull-request session when gh fails before it, and shows gh's error when its own check fails", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), { actions: [{ result: "Couldn't open it." }] }] });
    const h = harness;
    h.setPulls({ fail: "HTTP 502: Bad Gateway" });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(4);
    expect(h.engine.record.phases.pr!.stop!.checks[0]).toEqual({ name: "Pull request open", passed: false, facts: ["HTTP 502: Bad Gateway"] });
  });
});

describe("Start and the settings", () => {
  it("refuses Start until refinement is confirmed and while a field fails, worded as the mockup gives", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    expect(await h.engine.start({})).toMatchObject({ ok: false, status: 400 });

    git(h.sandbox, h.repository, "branch", "feature/customer-returns");
    const taken = join(h.sandbox.root, ".worktrees", "customer-returns", "acme-shop");
    mkdirSync(taken, { recursive: true });
    writeFileSync(join(taken, "x"), "");
    const refused = await h.engine.start({ refinementConfirmed: true });
    expect(refused).toMatchObject({
      ok: false,
      fieldErrors: {
        worktreePath: "That folder already exists and isn’t empty. Choose a new one.",
        featureBranch: "That branch already exists. Choose a name no branch has; a new name starts this PRD over from develop.",
      },
    });
    expect(h.engine.record.startedAt).toBeUndefined();

    // A branch only on origin is taken too.
    git(h.sandbox, h.repository, "branch", "-q", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/feature/customer-returns");
    rmSync(taken, { recursive: true });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, fieldErrors: { featureBranch: expect.stringMatching(/^That branch already exists\./) } });
    expect(h.engine.fieldErrors.worktreePath).toBeUndefined();

    await h.engine.changeSettings({ worktreePath: join(h.repository, "inside"), featureBranch: "bad..name", baseBranch: "nope" });
    expect(h.engine.fieldErrors).toEqual({
      worktreePath: "That folder is inside a checkout of this repository. Choose one outside it.",
      featureBranch: "That isn’t a valid branch name.",
      baseBranch: "nope isn’t on origin.",
    });
    await h.engine.changeSettings({ worktreePath: "relative/path", featureBranch: "", baseBranch: "develop" });
    expect(h.engine.fieldErrors).toEqual({ worktreePath: "Enter a full path, starting with / or ~.", featureBranch: "Enter a branch name." });

    // PRD documents on origin that differ from the checkout's.
    writeFileSync(join(h.repository, "docs", "prds", "customer-returns", "phase-3-returns-dashboard.md"), "# Phase 3: Changed\n\n## Acceptance criteria covered\nAC-DASH-01\n");
    git(h.sandbox, h.repository, "commit", "-qam", "change phase 3");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:develop");
    git(h.sandbox, h.repository, "reset", "-q", "--hard", "HEAD~1");
    await h.engine.changeSettings({ worktreePath: join(h.sandbox.root, "elsewhere"), featureBranch: "feature/x" });
    expect(h.engine.fieldErrors).toEqual({
      baseBranch: "develop on origin has different PRD documents from this checkout. Push them to develop first; every session starts from there.",
    });
  });

  it("fixes the worktree and branches once Start is pressed, while model and effort change for the next session", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, { actions: [{ result: "Stop here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    expect(await h.engine.changeSettings({ featureBranch: "feature/other" })).toMatchObject({ ok: false, status: 409 });
    expect(await h.engine.changeSettings({ effort: "turbo" as never })).toMatchObject({ ok: false, status: 400 });
    expect(await h.engine.changeSettings({ model: "sonnet", effort: "max" })).toEqual({ ok: true });
    writeFileSync(release, "");
    await h.engine.settled();
    const second = h.claudeCalls()[1]!.args;
    expect(second.slice(second.indexOf("--model"), second.indexOf("--model") + 4)).toEqual(["--model", "sonnet", "--effort", "max"]);
    // The session already working keeps what it started with.
    expect(h.engine.latestSession("1")!.model).toBe("opus");
    expect(buildSnapshot(h.engine).settings.fixed).toEqual({ workspaceFolder: true, featureBranch: true, worktreePath: true });
  });
});

describe("setup that fails", () => {
  it("goes back to not started, keeps the branch it made, and a later Start reuses that branch", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stop." }] }] });
    const h = harness;
    // A path whose parent is a file passes the path check, but git can't create the folder.
    const blocker = join(h.sandbox.root, "blocker");
    writeFileSync(blocker, "");
    await h.engine.changeSettings({ worktreePath: join(blocker, "worktree") });
    expect(h.engine.fieldErrors).toEqual({});

    const failed = await h.engine.start({ refinementConfirmed: true });
    expect(failed).toMatchObject({ ok: false, status: 409, reason: expect.stringMatching(/^Couldn’t set up the worktree: /) });
    const record = h.engine.record;
    expect(record.startedAt).toBeUndefined();
    expect(record.repositories[0]?.baseCommit).toBeUndefined();
    expect(record.refinementConfirmedAt).toBeUndefined();
    const branchCommit = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    expect(record.repositories[0]?.createdBranch).toEqual({ name: "feature/customer-returns", commit: branchCommit, baseBranch: "develop" });
    expect(h.engine.startError).toMatch(/^Couldn’t set up the worktree: /);
    expect(h.events.at(-1)).toMatchObject({ kind: "message", text: h.engine.startError });
    expect(buildSnapshot(h.engine, undefined).feature.state).toBe("not_started");

    // Kiln's own branch isn't "taken"; after a new path, Start sets up on it from its recorded commit.
    await h.engine.changeSettings({ worktreePath: join(h.sandbox.root, "good", "worktree") });
    expect(h.engine.fieldErrors).toEqual({});
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(record.repositories[0]?.baseCommit).toBe(branchCommit);
    expect(record.repositories[0]?.createdBranch).toBeUndefined();
    expect(git(h.sandbox, join(h.sandbox.root, "good", "worktree"), "branch", "--show-current").trim()).toBe("feature/customer-returns");
  });
});

describe("the done check's facts", () => {
  it("names origin apart from the branch, a phase no longer in the plan, and an unreachable origin", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: x" }, { push: true }, { result: "ok" }] }] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { close: true }, { commit: "feat: x" }, { push: true }, { exit: 0 }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    // Someone else pushes a different commit to the branch, and the phase's document is renamed away.
    const other = join(h.sandbox.root, "other");
    git(h.sandbox, h.sandbox.root, "clone", "-q", "-b", "develop", h.origin, other);
    git(h.sandbox, other, "commit", "-q", "--allow-empty", "-m", "elsewhere");
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    const worktree = h.engine.worktreePath;
    git(h.sandbox, other, "push", "-q", "-f", "origin", "develop:feature/customer-returns");
    const facts = await (async () => {
      h.engine.record.phases["1"]!.stop = { kind: "done_check", at: "", checks: [], checkedAt: "" };
      delete h.engine.record.phases["1"]!.doneAt;
      await h.engine.checkAgain();
      return h.engine.record.phases["1"]!.stop!.checks;
    })();
    const local = git(h.sandbox, worktree, "rev-parse", "--short=7", "HEAD").trim();
    const remote = git(h.sandbox, other, "rev-parse", "--short=7", "HEAD").trim();
    expect(facts[2]!.facts[0]).toBe(`origin is at ${remote}, not ${local}`);

    const prdDirectory = join(worktree, "docs", "prds", "customer-returns");
    const text = readFileSync(join(prdDirectory, "phase-1-return-intake.md"), "utf8");
    rmSync(join(prdDirectory, "phase-1-return-intake.md"));
    writeFileSync(join(prdDirectory, "phase-4-return-intake.md"), text.replace("Phase 1:", "Phase 4:"));
    git(h.sandbox, worktree, "remote", "set-url", "origin", join(h.sandbox.root, "missing.git"));
    await h.engine.checkAgain();
    const after = h.engine.record.phases["1"]!.stop!.checks;
    expect(after[0]!.facts[0]).toBe("Phase 1 is no longer in the plan");
    expect(after[2]!.facts[0]).toMatch(/^Couldn't reach origin: /);
  });

  it("saves every event as received with its arrival time, leaving out partial-message deltas", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ partial: "Hel" }, { partial: "lo" }, { text: "Hello — “quoted” ✓" }, { result: "Done." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const session = h.engine.latestSession("1")!;
    const events = readFileSync(join(h.stateDirectory, "1", session.sessionId, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { at: string; event: { type: string } });
    expect(events.map((row) => row.event.type)).toEqual(["system", "assistant", "result"]);
    for (const row of events) expect(Number.isNaN(Date.parse(row.at))).toBe(false);
    expect(h.engine.outputLines(session).map((line) => [line.source, line.text])).toEqual([
      ["claude", "Hello — “quoted” ✓"],
      ["exit", "Process exited with code 0"],
    ]);
  });
});

describe("kiln run on a feature underway", () => {
  it("judges a session that ended on its own before its verdict was recorded, as after any session", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    // As if Kiln stopped between phase 1's exit and recording its verdict.
    const record = h.engine.record;
    delete record.phases["1"]!.doneAt;
    delete record.phases["1"]!.repositories["acme-shop"]!.pushedSha;
    record.pause = {};
    const engine = h.reopen();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: false } });
    expect(engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: false });
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("re-checks a stop on kiln run, and launches a session recorded but never started with its own session ID", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: x" }, { exit: 0 }] }, landingSession("src/b.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    let engine = h.reopen();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    expect(h.claudeCalls()).toHaveLength(1);

    // The person pushes; and, as if Kiln had then stopped after writing 2b's session record and before spawning it:
    git(h.sandbox, engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    const sessionId = "0f6a2c1e-0000-4000-8000-000000000001";
    writeSessionRecord(h.stateDirectory, { schemaVersion: 1, sessionId, phaseId: "2b", kind: "phase", createdAt: new Date().toISOString(), model: "opus", modelDisplayName: "opus", effort: "high", runs: [], sleeps: [], steps: [] });
    engine.record.phases["2b"] = { sessionIds: [sessionId], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
    engine = h.reopen();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: true } });
    await engine.continue();
    expect(engine.record.phases["1"]).toMatchObject({ finishedByPerson: true });
    const launched = h.claudeCalls()[1]!.args;
    expect(launched[launched.indexOf("--session-id") + 1]).toBe(sessionId);
    expect(engine.record.phases["2b"]!.sessionIds).toEqual([sessionId]);
  });

  it("re-runs the pull-request check after a pause kiln run made active, so a pull request opened meanwhile completes the feature", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("a"), landingSession("b"), { actions: [{ waitForFile: release }, ...landingSession("c").actions] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 3);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    // As if Kiln stopped after phase 3 was Done, with the pause still only requested.
    h.engine.record.pause = { requestedAt: new Date().toISOString() };
    const engine = h.reopen();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "paused", beforePhaseKey: "pr" });
    h.setPulls([{ number: 12, title: "t", url: "u", isDraft: false, isCrossRepository: false, headRefName: "feature/customer-returns", baseRefName: "develop", additions: 1, deletions: 0, commits: [] }]);
    expect(await engine.start()).toEqual({ ok: true });
    await engine.settled();
    expect(engine.record.pullRequests?.[0]?.number).toBe(12);
    expect(h.claudeCalls()).toHaveLength(3);
  });

  it("finishes an interrupted setup on the next kiln run from the recorded base commit", async () => {
    harness = await createHarness({ sessions: [landingSession()] });
    const h = harness;
    const record = h.engine.record;
    record.startedAt = new Date().toISOString();
    record.repositories = [
      {
        name: "acme-shop",
        kind: "prd",
        mainCheckoutPath: h.repository,
        github: "acme/acme-shop",
        baseBranch: "develop",
        worktreePath: record.settings.worktreePath,
        baseCommit: git(h.sandbox, h.repository, "rev-parse", "develop").trim(),
      },
    ];
    const engine = h.reopen();
    expect(await engine.prepare()).toEqual({ ok: true });
    expect(existsSync(engine.worktreePath)).toBe(true);
    expect(engine.record.setupCompletedAt).toBeDefined();
    expect(await engine.decide()).toEqual({ kind: "start_phase", phaseId: "1" });
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("the account before each phase (AC-WATCH-09)", () => {
  it("is read again just before each phase's session starts, the pull request's included, without waiting for it", async () => {
    const refreshedBefore: number[] = [];
    const claude: ClaudeInfoSource = {
      account: undefined,
      models: undefined,
      modelListError: undefined,
      onChange: () => () => undefined,
      // Never resolves: the engine starts the session without waiting for the account.
      refreshAccount: () => {
        refreshedBefore.push(harness!.claudeCalls().length);
        return new Promise<void>(() => undefined);
      },
    };
    harness = await createHarness({
      sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218)],
      engineOptions: { claude },
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    // Phases 1, 2b and 3, then the pull-request session: each refresh comes before that session's launch.
    expect(refreshedBefore).toEqual([0, 1, 2, 3]);
  });

  it("never waits for a limit to reset: a used-up limit still starts the next phase (AC-WATCH-08, UI-005)", async () => {
    const account = {
      email: "alex@acme-shop.dev",
      plan: "Max",
      updatedAt: new Date().toISOString(),
      limits: [{ label: "5-hour window", shortLabel: "5-hour", percent: 100, resetsAt: new Date(Date.now() + 3_600_000).toISOString(), nearLimit: true }],
    };
    const claude: ClaudeInfoSource = { account, models: undefined, modelListError: undefined, onChange: () => () => undefined, refreshAccount: () => Promise.resolve() };
    harness = await createHarness({ sessions: [landingSession("src/intake.txt"), { actions: [{ result: "Stop here." }] }], engineOptions: { claude } });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(2);
    expect(phaseEvents(h).slice(1, 4)).toEqual(["1 started", expect.stringMatching(/^1 done /), "2b started"]);
  });
});
