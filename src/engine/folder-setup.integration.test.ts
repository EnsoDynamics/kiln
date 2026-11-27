// Setting a run up again from the Folder missing page (missing worktree recovery, Phase 2), with
// real Git: the panel's starting points and defaults, and Start from the base branch (a fresh
// execution on a new suffixed branch and folder) or from the run's existing feature branch (the
// missing worktree re-created, git's stale record cleared, the same execution resumed).
//
// Start's rules and refusals. Left-behind work, the page's facts and folders, and the limits Start
// keeps are in the other folder-setup-*.integration.test.ts files; their shared helpers are in
// src/test-support/folder-setup-fixture.ts.
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import type { SetupPanel } from "./folder-setup.js";
import { PR_PHASE_KEY, readPrdRecord, writeSessionRecord } from "../state/records.js";
import { readExecution } from "./continuation-state.js";
import { readStartIntent, writeStartIntent } from "./folder-setup-start.js";
import { buildSnapshot } from "./snapshot.js";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import { folderSetupRuns, panelOf, seedLoops, text } from "../test-support/folder-setup-fixture.js";
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());
let commands = 0;
const { start, landedThenStopped, twoRepositories, failingGit } = folderSetupRuns({ keep: h => { harness = h; }, nextCommand: () => ++commands });

describe("Start from the base branch (AC-SETUP-02, AC-SETUP-03, AC-SETUP-04)", () => {
  it("sets up a new suffixed branch and folder from the base commit the page showed, archives the unfinished execution, and runs the rest of the base plan", async () => {
    const h = await landedThenStopped();
    const oldExecution = h.engine.record.executionId!;
    seedLoops(h);
    const saved = h.engine.worktreePath;
    // The branch is merged into develop, as on 2026-11-06, then the folder is deleted.
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const baseCommit = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    rmSync(saved, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    const recordBefore = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");

    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
    const panel = panelOf(h);
    // Nothing on the branch is missing from develop, so the base branch is suggested.
    expect(panel.suggested).toBe("base");
    expect(panel.fields.featureBranch).toBe("feature/customer-returns-2");
    expect(panel.fields.worktreePath).toBe(join(h.sandbox.root, ".worktrees", "customer-returns-2", "acme-shop"));
    expect(panel.helpLines.featureBranch).toBe("New, so this run’s earlier branch and pull request stay separate.");
    expect(panel.preview.run.map(row => row.id)).toEqual(["2b", "3"]);
    expect(panel.preview.done).toBe("Phases 1 and 2a done on develop");
    expect(panel.preview.startLabel).toBe("Set up & start Phase 2b");
    expect(panel.preview.again).toEqual([]);
    expect(panel.choices.base).toMatchObject({ sha: baseCommit, total: 4, done: 2, holdsAllWork: true });
    expect((panel.choices.base as { line: string }).line).toBe(`origin/develop at ${baseCommit.slice(0, 7)} · 4 phases, 2 done. Has all of this run’s work.`);
    expect(panel.preview.lets.map(row => text(row.parts))).toEqual(["Commit and push to feature/customer-returns-2", "Open one pull request into develop once every phase closes", "Merge the delivery’s pull requests only when you press Merge with Claude Code on the finished page", "Push this PRD’s documents to develop only when you press Continue on the finished page", "Never deploy or touch other branches"]);
    // Editing the panel writes nothing (AC-SAFE-01).
    expect((await h.engine.changeFolderPanel({ start: "base", fields: { keepAwake: false } })).ok).toBe(true);
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(recordBefore);

    const calls = h.claudeCalls().length;
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.executionId).not.toBe(oldExecution);
    expect(record.settings.featureBranch).toBe("feature/customer-returns-2");
    expect(record.settings.keepAwake).toBe(false);
    expect(record.branchStem).toBe("feature/customer-returns");
    // A new run: both loop counts start at zero, at the setup's start (AC-LOOP-04).
    // The count starts again at zero; the run then completes, which holds its limits.
    expect(record.auditLoops).toMatchObject({ epochs: [{ kind: "delivery", at: record.startedAt, cause: "start", loopsBefore: 0 }, { kind: "test", at: record.startedAt, cause: "start", loopsBefore: 0 }], loops: [] });
    expect(record.repositories[0]).toMatchObject({ baseCommit, worktreePath: panel.fields.worktreePath });
    // The new branch starts at the base commit the page showed; the run's earlier branch is kept, locally and on origin (AC-SAFE-03).
    expect(git(h.sandbox, h.repository, "merge-base", baseCommit, "feature/customer-returns-2").trim()).toBe(baseCommit);
    expect(record.repositories[0]!.baseCommit).toBe(baseCommit);
    git(h.sandbox, h.repository, "rev-parse", "--verify", "refs/heads/feature/customer-returns");
    expect(git(h.sandbox, h.repository, "ls-remote", "origin", "refs/heads/feature/customer-returns").trim()).not.toBe("");
    // The unfinished execution is kept as history, ended by this setup.
    const row = record.continuation!.executions.find(one => one.executionId === oldExecution)!;
    expect(row).toMatchObject({ ending: "folder_missing_setup", branch: "feature/customer-returns" });
    expect(row.completedAt).toBeUndefined();
    // Its running time is saved with it, for the PRD total (time totals AC-TOTAL-02).
    expect(row.runningMs).toBeGreaterThanOrEqual(0);
    expect(readExecution(h.stateDirectory, row).record.phases["1"]!.doneAt).toBeDefined();
    // Phase 1, closed in develop, never runs again: the next session is Phase 2b, in the new folder.
    const launched = h.claudeCalls().slice(calls);
    expect(launched.length).toBeGreaterThan(0);
    expect(launched[0]!.cwd).toBe(panel.fields.worktreePath);
    expect(launched[0]!.prompt).toContain("phase-2b-store-credit.md");
    expect(launched.some(call => call.prompt.includes("phase-1-return-intake.md") || call.prompt.includes("phase-2a-card-refunds.md"))).toBe(false);
    // Every later kiln run uses the new branch and folder (AC-SETUP-04).
    h.engine.close();
    const later = h.reopen();
    expect(later.worktreePath).toBe(panel.fields.worktreePath);
    expect(later.record.settings.featureBranch).toBe("feature/customer-returns-2");
    expect(h.engine.folderMissing).toBeUndefined();
  });
});

describe("Start from the run's existing feature branch (AC-SETUP-02, AC-SETUP-05, AC-SAFE-04)", () => {
  it("clears git's stale record of the missing folder, re-creates it on the branch, and resumes the same execution", async () => {
    const h = await landedThenStopped();
    const execution = h.engine.record.executionId!;
    const loops = seedLoops(h);
    const before2b = h.engine.record.phases["2b"]!.stop!.checkedAt;
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    // Git still records the deleted folder.
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain("prunable");

    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
    const panel = panelOf(h);
    expect(panel.suggested).toBe("branch");
    expect(panel.fields.worktreePath).toBe(saved.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.fixed).toEqual(expect.arrayContaining(["featureBranch", "baseBranch", "agentId"]));
    expect(panel.helpLines).toEqual({ folder: "The run’s saved path.", featureBranch: "The run’s existing branch. Kiln creates no new branch." });
    expect(panel.preview.lets.map(row => text(row.parts))).toContain(`Clear git’s record of the missing folder ${saved.replace(process.env.HOME ?? "\0", "~")}`);
    expect(panel.preview.startLabel).toBe("Set up & start Phase 2b");
    // The base start would run Phase 1 again: its work is only on the feature branch (AC-SAFE-02).
    const base = panel.choices.base as { line: string };
    expect(base.line).toContain("Missing Phase 1’s work.");
    // The fixed branch can't be changed.
    expect(await h.engine.changeFolderPanel({ start: "branch", fields: { featureBranch: "feature/other" } })).toMatchObject({ ok: false, status: 400 });

    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).toBe(execution);
    // The same run keeps both counts (AC-LOOP-04).
    expect(readPrdRecord(h.stateDirectory)!.auditLoops).toEqual(loops);
    expect(existsSync(join(saved, ".git"))).toBe(true);
    const list = git(h.sandbox, h.repository, "worktree", "list", "--porcelain");
    expect(list).not.toContain("prunable");
    expect(list.split("\n").filter(line => line === "branch refs/heads/feature/customer-returns")).toHaveLength(1);
    expect(h.engine.folderMissing).toBeUndefined();
    // The explicit Resume ran the done check for the stopped phase: it still fails, so the run stays in Needs you (AC-SETUP-05).
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    expect(h.engine.record.phases["2b"]!.stop!.checkedAt > before2b).toBe(true);
  });

  it("uses a new suffixed folder when the saved path holds something else, and moves the run's sessions with it", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    git(h.sandbox, h.repository, "worktree", "remove", "--force", saved);
    mkdirSync(saved, { recursive: true });
    writeFileSync(join(saved, "notes.txt"), "someone else's\n");

    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
    const panel = panelOf(h);
    expect(panel.suggested).toBe("branch");
    const moved = join(h.sandbox.root, ".worktrees", "customer-returns-2", "acme-shop");
    expect(panel.fields.worktreePath).toBe(moved.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.helpLines.folder).toBe("New: the saved path holds something else, so Kiln uses a new folder.");
    expect((panel.choices.branch as { line: string }).line).toMatch(/^Last commit [0-9a-f]{7} · 4 phases, 2 done\. Has all of this run’s work\.$/);
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]!.worktreePath).toBe(moved);
    expect(h.engine.record.settings.workspaceFolder).toBe(join(h.sandbox.root, ".worktrees", "customer-returns-2"));
    // The person's folder is untouched.
    expect(readFileSync(join(saved, "notes.txt"), "utf8")).toBe("someone else's\n");
    const session = h.engine.latestSession("2b")!;
    expect(session.workingDirectory).toBe(moved);
  });
});

describe("Start's safety (AC-SAFE-01)", () => {
  it("does nothing when the page it was pressed on is out of date", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const before = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    const branches = git(h.sandbox, h.repository, "branch", "--list");
    expect(await start(h, { previewId: "0".repeat(64) })).toMatchObject({ ok: false, status: 409, code: "folder_setup_changed" });
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(before);
    expect(git(h.sandbox, h.repository, "branch", "--list")).toBe(branches);
    expect(h.engine.folderMissing).toBeDefined();
  });
});

describe("a run with several repositories (AC-SETUP-07)", () => {
  it("offers one starting point for the run: the existing branch re-creates only the failing repository's worktree, in the saved workspace", async () => {
    const h = await twoRepositories();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    const savedApi = api.worktreePath;
    const prdFolder = h.engine.worktreePath;
    rmSync(savedApi, { recursive: true, force: true });
    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
    const panel = panelOf(h);
    expect(panel.multi).toBe(true);
    // Each line names that start's latest commit and whether it holds all of this run's work (AC-SETUP-03).
    const tip = git(h.sandbox, h.repository, "rev-parse", "--short=7", "feature/customer-returns").trim();
    const developTip = git(h.sandbox, h.repository, "rev-parse", "--short=7", "origin/develop").trim();
    expect((panel.choices.branch as { line: string }).line).toBe(`Re-creates returns-api’s worktree in the saved workspace and keeps acme-shop’s · last commit ${tip} · 4 phases, 1 done. Has all of this run’s work.`);
    expect((panel.choices.base as { line: string }).line).toBe(`A new workspace and branch in both repositories, from origin/develop at ${developTip} · 4 phases, 1 done. Has all of this run’s work.`);
    // Nothing on the branch is missing from develop, so the base branch is suggested; the existing branch can be chosen.
    expect(panel.suggested).toBe("base");
    expect(await h.engine.changeFolderPanel({ start: "branch", fields: {} })).toMatchObject({ ok: true });
    const selected = panelOf(h);
    expect(selected.selected).toBe("branch");
    expect(selected.fixed).toEqual(expect.arrayContaining(["workspaceFolder", "featureBranch", "bases"]));
    expect(selected.helpLines.folder).toBe("The run’s saved workspace. Kiln re-creates returns-api’s worktree in it and keeps acme-shop’s.");
    expect(await start(h, { start: "branch" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(existsSync(join(savedApi, ".git"))).toBe(true);
    expect(h.engine.worktreePath).toBe(prdFolder);
    expect(h.engine.folderMissing).toBeUndefined();
  });

  it("starting from the base branch sets up a new suffixed workspace and branch in every repository, each from its own base", async () => {
    const h = await twoRepositories();
    rmSync(h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    const workspace = join(h.sandbox.root, ".worktrees", "customer-returns-2");
    expect(panel.fields.workspaceFolder).toBe(workspace);
    expect(panel.repositories.map(row => row.name)).toEqual(["acme-shop", "returns-api"]);
    expect(panel.preview.lets.map(row => text(row.parts))[0]).toBe("In each repository, commit and push to feature/customer-returns-2");
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.repositories.map(entry => [entry.name, entry.worktreePath])).toEqual([["acme-shop", join(workspace, "acme-shop")], ["returns-api", join(workspace, "returns-api")]]);
    for (const entry of record.repositories) expect(git(h.sandbox, entry.mainCheckoutPath, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("develop");
    expect(git(h.sandbox, join(workspace, "returns-api"), "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/customer-returns-2");
  });
});

describe("a repository the base plan names that Kiln would ask about (find repositories anywhere AC-ASK-07)", () => {
  it("is left out of a base-branch start, neither listed nor a problem, for the stop before its phase to ask", async () => {
    const h = await twoRepositories();
    // The plan on the base branch names, for phase 3, a repository nothing on this computer has.
    const file = join(h.repository, "docs/prds/customer-returns/phase-3-returns-dashboard.md");
    git(h.sandbox, h.repository, "checkout", "-q", "develop");
    const [title, ...rest] = readFileSync(file, "utf8").split("\n");
    writeFileSync(file, [title, "", "**Repositories:** acme-labs/ledger", ...rest].join("\n"));
    git(h.sandbox, h.repository, "commit", "-q", "-am", "phase 3 names the ledger");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.repositories.map(row => [row.name, row.problem])).toEqual([["acme-shop", undefined], ["returns-api", undefined]]);
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.repositories.map(entry => entry.name)).toEqual(["acme-shop", "returns-api"]);
  });
});

describe("a repository the first phase's preparation reads that Kiln would ask about (find repositories anywhere AC-ASK-07)", () => {
  it("stays a problem that keeps a base-branch start unavailable, in the question's words and what clears it on Check again", async () => {
    const h = await twoRepositories();
    Object.assign(h.env, { HOME: h.sandbox.root });
    git(h.sandbox, h.repository, "checkout", "-q", "develop");
    const directory = join(h.repository, "docs/prds/customer-returns");
    // Phase 1 is closed on the base branch, so phase 2b runs first, and its preparation reads a repository nothing on this computer has.
    const intake = join(directory, "phase-1-return-intake.md");
    const [intakeTitle, ...intakeRest] = readFileSync(intake, "utf8").split("\n");
    writeFileSync(intake, [intakeTitle, "**Closed:** 2026-11-20", ...intakeRest].join("\n"));
    const credit = join(directory, "phase-2b-store-credit.md");
    const [title, ...rest] = readFileSync(credit, "utf8").split("\n");
    writeFileSync(credit, [title, "", "**Repositories:** acme-labs/ledger", ...rest].join("\n") + "\n## Phase-specific notes\nFirst step: merge Phase 2a. In repository `acme-labs/ledger`, merge branch `wt/ledger` at `abcdef1` into this phase's branch before building.\n");
    git(h.sandbox, h.repository, "commit", "-q", "-am", "phase 2b's preparation reads the ledger");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    // The base-branch start is unavailable on that problem, and the repository isn't left out silently.
    expect(h.engine.folderPanel).toMatchObject({ choices: { base: { unavailable: expect.stringMatching(/^Unavailable: [Kk]iln couldn’t find a checkout of acme-labs\/ledger\. Check again once a checkout of it is where the search reaches\.$/) } } });
    expect(await start(h, { start: "base" })).toMatchObject({ ok: false });
  });
});

describe("a repository set up beside one left out with the same short name (find repositories anywhere AC-FOLDER-01)", () => {
  it("gives the one a base-branch start sets up its short name, since the one left out isn't set up with it", async () => {
    const h = await twoRepositories();
    const short = "admin";
    const origin = createGithubOrigin(h.sandbox, "acme", short);
    const admin = createRepository(h.sandbox, "admin-checkout", origin.url);
    git(h.sandbox, admin, "push", "-q", "origin", "develop");
    // The sandbox is the home folder, so the search stays inside it.
    Object.assign(h.env, h.sandbox.env, { HOME: h.sandbox.root });
    // The plan on the base branch names, for phase 3, acme/<short>, found, and other/<short>, which nothing on this computer has.
    const file = join(h.repository, "docs/prds/customer-returns/phase-3-returns-dashboard.md");
    git(h.sandbox, h.repository, "checkout", "-q", "develop");
    const [title, ...rest] = readFileSync(file, "utf8").split("\n");
    writeFileSync(file, [title, "", `**Repositories:** acme/${short}, other/${short}`, ...rest].join("\n"));
    git(h.sandbox, h.repository, "commit", "-q", "-am", "phase 3 names two repositories with one short name");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).repositories.map(row => [row.name, row.problem])).toEqual([["acme-shop", undefined], ["returns-api", undefined], [short, undefined]]);
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const workspace = join(h.sandbox.root, ".worktrees", "customer-returns-2");
    const entry = readPrdRecord(h.stateDirectory)!.repositories.find(one => one.github === `acme/${short}`)!;
    expect([entry.name, entry.shortName, entry.worktreePath]).toEqual([short, undefined, join(workspace, short)]);
    expect(git(h.sandbox, join(workspace, short), "remote", "get-url", "origin").trim()).toBe(origin.url);
  });
});

describe("a repository whose setup was left unfinished (find repositories anywhere AC-NAME-02)", () => {
  it("is set up again from its recorded checkout, not looked for beside the PRD's repository by Kiln's name", async () => {
    const files = prdDirectoryFiles();
    const [title, ...rest] = files["phase-1-return-intake.md"]!.split("\n");
    files["phase-1-return-intake.md"] = [title, "", "**Repositories:** acme/returns-api", ...rest].join("\n");
    harness = await createHarness({ files, sessions: [{ actions: [{ result: "I need a decision." }] }] });
    const h = harness;
    // Checked out away from the PRD's repository, so only the search finds it.
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
    const api = createRepository(h.sandbox, "elsewhere/returns-api", origin.url);
    git(h.sandbox, api, "push", "-q", "origin", "develop");
    Object.assign(h.env, h.sandbox.env, { HOME: h.sandbox.root });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.repositories.find(entry => entry.name === "returns-api")?.mainCheckoutPath).toBe(api);
    // Its setup recorded as unfinished, then the PRD's worktree goes missing.
    delete h.engine.record.repositories.find(entry => entry.name === "returns-api")!.setupCompletedAt;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).repositories.map(row => [row.name, row.problem])).toEqual([["acme-shop", undefined], ["returns-api", undefined]]);
    // A second checkout appears where the search reaches; the start still uses the recorded one.
    createRepository(h.sandbox, "another/returns-api", origin.url);
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const entry = readPrdRecord(h.stateDirectory)!.repositories.find(one => one.name === "returns-api")!;
    expect(entry.mainCheckoutPath).toBe(api);
    expect(git(h.sandbox, api, "worktree", "list")).toContain(entry.worktreePath);
  });
});

describe("what can't be checked, and what a base start leaves out (AC-FACTS-03, AC-SAFE-02, AC-SAFE-03)", () => {
  it("offers only Check again when origin can't be reached", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "no-such-origin.git"));
    await h.engine.folderGuard({ gather: true });
    expect(h.engine.folderPanel).toEqual({ blocked: expect.stringContaining("Kiln couldn’t reach origin") });
    // The branch's in-base result is still read, against the checkout's own develop (Phase 5: AC-FACTS-01; view/src/lib/folder-missing.test.ts words its row).
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.plans.base).toMatchObject({ source: "local" });
    expect(view.repositories[0]!.featureBranch).toMatchObject({ inBase: false, notInBaseCount: 1 });
    // Each repository says where its own base branch was read, so its facts are worded against the checkout's (Phase 8: AC-FACTS-01).
    expect(view.repositories[0]).toMatchObject({ baseBranch: "develop", baseSource: "local" });
  });

  it("names the phase a deleted branch's work leaves behind, and carries a pending pause to the phase it belongs to", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    // Pause after the stopped phase, requested before the folder went.
    h.engine.record.pause.requestedAt = new Date().toISOString();
    rmSync(saved, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.choices.branch).toEqual({ unavailable: "Unavailable: the branch was deleted." });
    expect(panel.suggested).toBe("base");
    expect(panel.preview.again).toEqual(["1"]);
    expect(text(panel.preview.caution!)).toMatch(/^Phase 1 will run again\. Its pushed work \([0-9a-f]{7}\) was on the deleted branch and isn’t in develop\.$/);
    expect(panel.preview.lets.map(row => text(row.parts))).toContain("Kiln will pause after Phase 2b is Done");
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.pause).toMatchObject({ requestedFor: "2b" });
  });
});

describe("a Start that fails partway (AC-SAFE-01)", () => {
  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")("says what it did and what remains, and saves nothing", async () => {
    const h = await landedThenStopped();
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.selected).toBe("base");
    // The new folder's parent can't be written, so the worktree add fails after nothing was made.
    const parent = join(h.sandbox.root, ".worktrees");
    mkdirSync(parent, { recursive: true });
    writeFileSync(join(parent, "customer-returns-2"), "a file where the folder goes\n");
    await h.engine.folderGuard({ gather: true });
    const blocked = panelOf(h);
    // The suffix skips a taken path.
    expect(blocked.fields.featureBranch).toBe("feature/customer-returns-3");
    rmSync(join(parent, "customer-returns-2"));
    await h.engine.folderGuard({ gather: true });
    expect(panelOf(h).fields.featureBranch).toBe("feature/customer-returns-2");
    chmodSync(parent, 0o555);
    let failed;
    try { failed = await start(h); } finally { chmodSync(parent, 0o755); }
    expect(failed).toMatchObject({ ok: false, status: 500, code: "folder_setup_failed", done: [], remaining: expect.arrayContaining(["Start the fresh execution"]) });
    expect(readPrdRecord(h.stateDirectory)!.settings.featureBranch).toBe("feature/customer-returns");
    expect(h.engine.folderMissing!).toBeDefined();
    const retried = await start(h);
    expect(retried).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.settings.featureBranch).toBe("feature/customer-returns-2");
  });
});

describe("a failed start's intent (AC-SAFE-01)", () => {
  /** A failed base start that made `feature/customer-returns-2` and its folder at the base commit, then stopped. */
  async function failedBaseStart(h: Harness) {
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const base = git(h.sandbox, h.repository, "rev-parse", "origin/develop").trim();
    const folder = join(h.sandbox.root, ".worktrees", "customer-returns-2", "acme-shop");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "--no-track", "-b", "feature/customer-returns-2", folder, base);
    const settings = { ...structuredClone(h.engine.record.settings), featureBranch: "feature/customer-returns-2", worktreePath: folder, workspaceFolder: join(h.sandbox.root, ".worktrees", "customer-returns-2") };
    const repositories = [{ name: "acme-shop", kind: "prd" as const, github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", baseCommit: base, branch: "feature/customer-returns-2", worktreePath: folder }];
    writeStartIntent(h.stateDirectory, { formatVersion: 1, id: "intent-1", commandId: "earlier-start", executionId: h.engine.record.executionId!, kind: "base", factsId: "a".repeat(64), previewId: "b".repeat(64), createdAt: new Date().toISOString(), settings, repositories,
      steps: [{ name: "worktree:acme-shop", label: "Create feature/customer-returns-2 and its folder", state: "done" }, { name: "plan", label: "Read the plan in the new folder", state: "failed", error: "stopped" }, { name: "activate", label: "Start the fresh execution", state: "pending" }], state: "failed", newExecutionId: "new-execution-1" });
    return folder;
  }

  it("starts the draft from it and keeps its suffix while its folder is untouched", async () => {
    const h = await landedThenStopped();
    await failedBaseStart(h);
    harness!.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    const panel = reopened.folderPanel as SetupPanel;
    expect(panel.selected).toBe("base");
    expect(panel.fields.featureBranch).toBe("feature/customer-returns-2");
  });

  it("refuses a different start while its folder holds work it did not make, and supersedes it once the run's folder is back", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    const folder = await failedBaseStart(h);
    writeFileSync(join(folder, "mine.txt"), "someone's work\n");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    // Its folder is no longer its own, so the base start takes the next suffix.
    expect(panelOf(h).fields.featureBranch).toBe("feature/customer-returns-3");
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    expect(await start(h, { start: "branch" })).toMatchObject({ ok: false, status: 409, code: "folder_setup_work_present", reason: expect.stringContaining("holds work Start did not make. Nothing was removed") });
    expect(readFileSync(join(folder, "mine.txt"), "utf8")).toBe("someone's work\n");
    // The run's own folder put back by hand: Check again leaves the mode and supersedes the failed intent.
    git(h.sandbox, h.repository, "worktree", "add", "-f", saved, "feature/customer-returns");
    await h.engine.checkFoldersAgain();
    expect(h.engine.folderMissing).toBeUndefined();
    expect(readStartIntent(h.stateDirectory, "earlier-start")!.state).toBe("superseded");
  });

  it("settles an interrupted Start's receipt as failed at the next startup, and its intent too", async () => {
    const h = await landedThenStopped();
    await failedBaseStart(h);
    const intent = readStartIntent(h.stateDirectory, "earlier-start")!;
    writeStartIntent(h.stateDirectory, { ...intent, state: "in_progress" });
    h.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    expect(readStartIntent(h.stateDirectory, "earlier-start")!.state).toBe("failed");
  });

  it.skipIf(process.platform === "win32")("supersedes a failed start that a different Start replaces while its folder is untouched, leaving its branch and folder", async () => {
    const h = await landedThenStopped();
    const folder = await failedBaseStart(h);
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    // The different Start fails too, so nothing but that Start can have superseded the earlier one.
    failingGit(h, `*"worktree add"*`);
    expect(await start(h, { start: "branch", commandId: "differing-start" })).toMatchObject({ ok: false, status: 500, code: "folder_setup_failed" });
    expect(readStartIntent(h.stateDirectory, "earlier-start")!.state).toBe("superseded");
    expect(readStartIntent(h.stateDirectory, "differing-start")!.state).toBe("failed");
    expect(existsSync(join(folder, ".git"))).toBe(true);
    git(h.sandbox, h.repository, "rev-parse", "--verify", "refs/heads/feature/customer-returns-2");
  });

  it.each([
    { ended: "in_progress" as const, state: "failed", outcome: "not_applied", intentAfter: "failed" },
    { ended: "resumed" as const, state: "completed", outcome: "folder_setup_started", intentAfter: "resumed" },
  ])("settles a Start's real receipt from its intent at the next startup: $ended becomes $state", async ({ ended, state, outcome, intentAfter }) => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    // Kiln stops while the Start is partway: its receipt is still open and its intent says how far it got.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    (h.engine as unknown as { runBranchStart: () => Promise<void> }).runBranchStart = () => held;
    const running = start(h, { commandId: `receipt-${ended}` });
    await waitFor(() => readStartIntent(h.stateDirectory, `receipt-${ended}`) !== undefined);
    const intent = readStartIntent(h.stateDirectory, `receipt-${ended}`)!;
    writeStartIntent(h.stateDirectory, { ...intent, state: ended });
    const reopened = h.reopen();
    expect(reopened.commands.lookup(`receipt-${ended}`).operation).toMatchObject({ state, stage: "settled", outcome });
    expect(readStartIntent(h.stateDirectory, `receipt-${ended}`)!.state).toBe(intentAfter);
    release();
    await running;
  });
});

describe("more of Start's rules (AC-SETUP-02, 04, 05, AC-SAFE-01, 03)", () => {
  it("creates no new branch when only origin has it: your checkout gets the branch, tracking origin's, at origin's tip", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    git(h.sandbox, h.repository, "push", "-q", "origin", "feature/customer-returns");
    rmSync(saved, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.helpLines.featureBranch).toBe("The run’s existing branch, now only on origin. Kiln creates no new branch; your checkout gets a branch of the same name that tracks it.");
    // Phase 2b's commits that weren't pushed were only on the deleted branch, so Kiln can't say this start holds all the run's work (AC-SAFE-02).
    expect((panel.choices.branch as { line: string }).line).toMatch(/\. Couldn’t check whether it has all of this run’s work\.$/);
    expect(panel.choices.branch).not.toHaveProperty("holdsAllWork");
    expect(text(panel.preview.caution!)).toBe("Phase 2b runs from origin’s copy of the branch. Commits it made that weren’t pushed were only on the deleted branch, and Kiln can’t tell whether there were any.");
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(git(h.sandbox, h.repository, "rev-parse", "refs/heads/feature/customer-returns").trim()).toBe(tip);
    expect(git(h.sandbox, h.repository, "config", "branch.feature/customer-returns.remote").trim()).toBe("origin");
    expect(git(h.sandbox, h.repository, "config", "branch.feature/customer-returns.merge").trim()).toBe("refs/heads/feature/customer-returns");
    expect(existsSync(join(saved, ".git"))).toBe(true);
  });

  it("ends an active pause on an existing-branch start, and a base start keeps the run's early-merge grants and its old branch", async () => {
    const h = await landedThenStopped();
    h.engine.record.pause.activeSince = new Date().toISOString();
    h.engine.record.developmentAuthorization = { revision: 2, enabled: true, grants: [{ target: { repository: "github.com/acme/acme-shop", baseBranch: "develop" }, confirmedAt: new Date().toISOString(), source: "start" }] };
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.developmentAuthorization).toMatchObject({ enabled: true, grants: [{ target: { repository: "github.com/acme/acme-shop", baseBranch: "develop" } }] });
    expect(record.pause.activeSince).toBeUndefined();
  });

  it("ends an active pause when starting from the existing branch", async () => {
    const h = await landedThenStopped();
    h.engine.record.pause.activeSince = new Date().toISOString();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(panelOf(h).selected).toBe("branch");
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.pause.activeSince).toBeUndefined();
  });

  it("pre-selects the existing branch when the base branch has nothing to run, and offers only Check again when neither can be used", async () => {
    const h = await landedThenStopped();
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge", "origin/feature/customer-returns");
    for (const file of ["phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
      const path = join(h.repository, "docs/prds/customer-returns", file);
      const [title, ...rest] = readFileSync(path, "utf8").split("\n");
      writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    }
    git(h.sandbox, h.repository, "commit", "-qam", "Close the rest elsewhere");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    // Work on the branch not in develop, so the existing branch is the test's choice anyway; then it goes too.
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.choices.base).toEqual({ unavailable: "Unavailable: every phase is already closed on develop; there is nothing to start." });
    expect(panel.suggested).toBe("branch");
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    expect(h.engine.folderPanel).toEqual({ blocked: "Neither starting point can be used. Base branch: Every phase is already closed on develop; there is nothing to start. Existing branch: the branch was deleted." });
  });

  it("refuses a feature branch name that already exists, in the field and at Start", async () => {
    const h = await landedThenStopped();
    git(h.sandbox, h.repository, "branch", "someone-elses", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: { featureBranch: "someone-elses" } });
    const panel = panelOf(h);
    expect(panel.fieldErrors.featureBranch).toBe("That branch already exists. Choose a name no branch has.");
    expect(await start(h, { start: "base", fields: { featureBranch: "someone-elses" } })).toMatchObject({ ok: false, status: 409, code: "folder_setup_fields" });
    expect(git(h.sandbox, h.repository, "worktree", "list")).not.toContain("someone-elses");
  });

  it("refreshes the page instead of acting when the base branch moved after the page was shown", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const shown = panelOf(h);
    const factsId = h.engine.folderMissing!.factsId;
    // Someone pushes to develop meanwhile.
    writeFileSync(join(h.repository, "elsewhere.txt"), "moved\n");
    git(h.sandbox, h.repository, "add", "elsewhere.txt");
    git(h.sandbox, h.repository, "commit", "-qm", "Moved on");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const moved = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    expect(await h.engine.folderSetupStartCommand({ commandId: "stale-page", factsId, previewId: shown.previewId, start: "base", fields: {} })).toMatchObject({ ok: false, status: 409, code: "folder_setup_changed" });
    expect((panelOf(h).choices.base as { sha: string }).sha).toBe(moved);
    expect(git(h.sandbox, h.repository, "branch", "--list", "feature/customer-returns-2").trim()).toBe("");
  });

  it("resumes a failed start with the same names, reusing what it made, and activates it", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const base = git(h.sandbox, h.repository, "rev-parse", "origin/develop").trim();
    const folder = join(h.sandbox.root, ".worktrees", "customer-returns-2", "acme-shop");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "--no-track", "-b", "feature/customer-returns-2", folder, base);
    const settings = { ...structuredClone(h.engine.record.settings), featureBranch: "feature/customer-returns-2", worktreePath: folder, workspaceFolder: join(h.sandbox.root, ".worktrees", "customer-returns-2") };
    writeStartIntent(h.stateDirectory, { formatVersion: 1, id: "intent-1", commandId: "earlier-start", executionId: h.engine.record.executionId!, kind: "base", factsId: "a".repeat(64), previewId: "b".repeat(64), createdAt: new Date().toISOString(), settings,
      repositories: [{ name: "acme-shop", kind: "prd", github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", baseCommit: base, branch: "feature/customer-returns-2", worktreePath: folder }],
      steps: [{ name: "worktree:acme-shop", label: "Create feature/customer-returns-2 and its folder", state: "done" }, { name: "plan", label: "Read the plan in the new folder", state: "failed", error: "stopped" }, { name: "activate", label: "Start the fresh execution", state: "pending" }], state: "failed", newExecutionId: "new-execution-1" });
    h.engine.close();
    harness!.engine = h.reopen();
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect([panel.selected, panel.fields.featureBranch, panel.fields.worktreePath]).toEqual(["base", "feature/customer-returns-2", folder]);
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readStartIntent(h.stateDirectory, "earlier-start")).toMatchObject({ state: "activated" });
    expect(h.engine.record.executionId).toBe("new-execution-1");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain").split("\n").filter(line => line === "branch refs/heads/feature/customer-returns-2")).toHaveLength(1);
  });
});

describe("nothing changes until Start, and Start's own refusals (AC-SAFE-01)", () => {
  /** What a read-only page must leave alone: the saved record, every ref, the worktree list, origin and the shared checkout. */
  const everything = (h: Harness) => ({
    record: readFileSync(join(h.stateDirectory, "prd.json"), "utf8"),
    refs: git(h.sandbox, h.repository, "for-each-ref"),
    worktrees: git(h.sandbox, h.repository, "worktree", "list", "--porcelain"),
    origin: git(h.sandbox, h.origin, "for-each-ref"),
    checkout: git(h.sandbox, h.repository, "status", "--porcelain"),
  });
  const released = (h: Harness) => join(h.sandbox.root, "release-session");
  /** Phase 1 landed; Phase 2b's session is still working when the test goes on. */
  const stillWorking = async (): Promise<Harness> => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession(), { actions: [{ write: { path: "src/credit.txt", content: "half done\n" } }, { commit: "wip: store credit" }, { touch: `${released(h)}-reached` }, { waitForFile: released(h) }, { result: "Stopping here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    // The session must be waiting first: removing its folder sooner makes the stand-in's next step fail.
    await waitFor(() => existsSync(`${released(h)}-reached`));
    return h;
  };

  it("writes nothing and starts no session while showing the state", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    const before = everything(h);
    const calls = h.claudeCalls().length;
    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
    buildSnapshot(h.engine);
    expect(everything(h)).toEqual(before);
    expect(h.claudeCalls()).toHaveLength(calls);
  });

  it("writes no branch, checkout, remote or saved setting while the panel is edited", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const before = everything(h);
    const calls = h.claudeCalls().length;
    expect((await h.engine.changeFolderPanel({ start: "base", fields: { featureBranch: "feature/renamed", worktreePath: join(h.sandbox.root, "elsewhere"), baseBranch: "develop", keepAwake: false, resumeAfterUsageLimit: false } })).ok).toBe(true);
    expect(everything(h)).toEqual(before);
    expect(existsSync(join(h.sandbox.root, "elsewhere"))).toBe(false);
    expect(h.claudeCalls()).toHaveLength(calls);
  });

  it("refuses Start while this Kiln's session runs, says to stop Kiln, and still records the session's end", async () => {
    const h = await stillWorking();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true, mayLeave: false });
    const panel = panelOf(h);
    const busy = "A session is still running. Start becomes available when it ends, or when you stop Kiln in the terminal.";
    expect(panel.busy).toBe(busy);
    const branches = git(h.sandbox, h.repository, "for-each-ref", "refs/heads");
    expect(await start(h)).toMatchObject({ ok: false, status: 409, code: "busy", reason: busy });
    expect(git(h.sandbox, h.repository, "for-each-ref", "refs/heads")).toBe(branches);
    const session = h.engine.latestSession("2b")!;
    expect(session.runs.at(-1)!.endedAt).toBeUndefined();
    writeFileSync(released(h), "");
    await h.engine.settled();
    expect(h.engine.latestSession("2b")!.runs.at(-1)!.endedAt).toBeDefined();
    // Nothing is running any more, so the page stops refusing.
    await h.engine.folderGuard({ gather: true, mayLeave: false });
    expect(panelOf(h).busy).toBeUndefined();
  });

  it.skipIf(process.platform === "win32").each(["a Codex session", "a pull-request session"])("stops %s an earlier Kiln left before any Git write, and says so in the list", async (leftOver) => {
    harness = await createHarness({ logGit: true, sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }, landingSession("src/b.txt"), landingSession("src/c.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // A process-group leader, as a real session is: Kiln stops the whole group.
    const child = spawn("sleep", ["120"], { stdio: "ignore", detached: true });
    try {
      const startTime = await processStartTime(child.pid!);
      // The next Kiln over the same record: its session is one an earlier Kiln left, still running.
      h.reopen();
      await h.engine.refreshAgents();
      let session = h.engine.latestSession("2b")!;
      if (leftOver === "a Codex session") session.agentId = "codex";
      else {
        // Kiln stops a pull-request session whichever agent runs it.
        session = { ...structuredClone(session), kind: "pull_request", createdAt: new Date().toISOString() };
        h.engine.record.phases[PR_PHASE_KEY] = { sessionIds: [session.sessionId], repositories: {} } as unknown as typeof h.engine.record.phases[string];
      }
      const run = session.runs.at(-1)!;
      Object.assign(run, { pid: child.pid, processStartTime: startTime });
      delete run.endedAt;
      writeSessionRecord(h.stateDirectory, session);
      rmSync(h.engine.worktreePath, { recursive: true, force: true });
      await h.engine.folderGuard({ gather: true });
      await h.engine.changeFolderPanel({ start: "base", fields: {} });
      expect(panelOf(h).preview.lets.map(row => text(row.parts))).toContain(`Stop the session left by an earlier Kiln (process ${child.pid})`);
      // The stop runs before Start's first git write; the process itself is really gone afterwards.
      const internal = h.engine as unknown as { stopLiveProcess: (session: unknown) => Promise<void> };
      const stop = internal.stopLiveProcess.bind(h.engine);
      let writesBeforeStop = -1;
      let intentAtStop: ReturnType<typeof readStartIntent>;
      internal.stopLiveProcess = async (one) => { writesBeforeStop = h.kilnGitCalls().filter(call => call.startsWith("worktree add") || call.startsWith("branch ")).length; intentAtStop = readStartIntent(h.stateDirectory, "left-over-start"); await stop(one); };
      const writes = h.kilnGitCalls().filter(call => call.startsWith("worktree add") || call.startsWith("branch ")).length;
      expect(await start(h, { start: "base", commandId: "left-over-start" })).toEqual({ ok: true, status: 200 });
      await h.engine.settled();
      expect(writesBeforeStop).toBe(writes);
      // The durable intent is already there when the first thing Start changes happens.
      expect(intentAtStop!).toMatchObject({ state: "in_progress", kind: "base" });
      expect(intentAtStop!.steps.every(row => row.state === "pending")).toBe(true);
      expect(await isProcessLive(child.pid!, startTime)).toBe(false);
    } finally { child.kill("SIGKILL"); }
  });

  it("leaves the state instead of acting when every folder is back at Start", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    git(h.sandbox, h.repository, "worktree", "add", "-f", saved, "feature/customer-returns");
    const branches = git(h.sandbox, h.repository, "for-each-ref", "refs/heads");
    expect(await h.engine.folderSetupStartCommand({ commandId: `start-${++commands}`, factsId: h.engine.folderMissing!.factsId, previewId: panel.previewId, start: panel.selected, fields: {} })).toMatchObject({ ok: false, status: 409, code: "folder_missing_resolved", reason: "The run’s folders are back, and Kiln checked the run again. Nothing was set up." });
    expect(h.engine.folderMissing).toBeUndefined();
    expect(git(h.sandbox, h.repository, "for-each-ref", "refs/heads")).toBe(branches);
  });

  it("answers 503 and republishes the page when a read fails in Start's recheck", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    const record = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    const branches = git(h.sandbox, h.repository, "for-each-ref", "refs/heads");
    git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "no-such-origin.git"));
    expect(await start(h, { previewId: panel.previewId })).toMatchObject({ ok: false, status: 503, code: "folder_missing_check_failed" });
    expect(h.engine.folderPanel).toEqual({ blocked: expect.stringContaining("Kiln couldn’t reach origin") });
    expect(h.engine.folderMissing).toBeDefined();
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(record);
    expect(git(h.sandbox, h.repository, "for-each-ref", "refs/heads")).toBe(branches);
  });
});

describe("what Start rechecks, and a Start that stops partway (AC-SAFE-01)", () => {
  it("does nothing when the facts changed though the preview is current", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const before = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    const refs = git(h.sandbox, h.repository, "for-each-ref");
    expect(await start(h, { factsId: "0".repeat(64) })).toMatchObject({ ok: false, status: 409, code: "folder_setup_changed" });
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(before);
    expect(git(h.sandbox, h.repository, "for-each-ref")).toBe(refs);
    expect(h.engine.folderMissing).toBeDefined();
  });

  it.skipIf(process.platform === "win32")("shows the refreshed page instead of activating when the plan in the new folder isn't the one shown", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const before = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    // The new worktree's checkout closes a phase, so its plan differs from the one the page showed.
    const hook = join(h.repository, ".git", "hooks", "post-checkout");
    mkdirSync(dirname(hook), { recursive: true });
    writeFileSync(hook, `#!/bin/sh\nf=docs/prds/customer-returns/phase-3-returns-dashboard.md\n{ head -1 "$f"; echo '**Closed:** 2026-11-08'; tail -n +2 "$f"; } > "$f.new" && mv "$f.new" "$f"\n`);
    chmodSync(hook, 0o755);
    const calls = h.claudeCalls().length;
    expect(await start(h, { start: "base", commandId: "plan-moved" })).toMatchObject({ ok: false, status: 409, code: "folder_setup_changed", reason: "The plan in the new folder isn’t the one the page showed. Review the refreshed page, then press Start again." });
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(before);
    expect(readStartIntent(h.stateDirectory, "plan-moved")!.state).toBe("superseded");
    expect(h.engine.folderMissing).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(calls);
  });

  it("stays in the state when the folders pass while a Start is working, leaving that Start to end it", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    (h.engine as unknown as { runBranchStart: () => Promise<void> }).runBranchStart = () => held;
    const running = start(h, { commandId: "mid-start" });
    await waitFor(() => readStartIntent(h.stateDirectory, "mid-start") !== undefined);
    // Start's own worktree add makes the saved folder pass; a check from the page must not act on that.
    git(h.sandbox, h.repository, "worktree", "add", "-f", saved, "feature/customer-returns");
    expect(await h.engine.folderGuard()).toBe(false);
    expect(h.engine.folderMissing).toBeDefined();
    expect(readStartIntent(h.stateDirectory, "mid-start")!.state).toBe("in_progress");
    release();
    await running;
  });

  it.skipIf(process.platform === "win32")("says which steps a failed existing-branch Start finished, saves nothing, and the next Start does only the rest", async () => {
    const h = await twoRepositories();
    const [shop, api] = h.engine.setUpRepositories;
    for (const entry of [shop!, api!]) rmSync(entry.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: { keepAwake: false } });
    const before = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    failingGit(h, `*"worktree add"*returns-api*`);
    const failed = await start(h, { start: "branch" });
    expect(failed).toMatchObject({
      ok: false, status: 500, code: "folder_setup_failed",
      done: ["Clear git’s record of the missing folder in acme-shop", "Clear git’s record of the missing folder in returns-api", "Create the folder on feature/customer-returns in acme-shop"],
      remaining: ["Create the folder on feature/customer-returns in returns-api", "Save the run’s new folder"],
    });
    // The failed Start changed no saved setting.
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(before);
    expect(readPrdRecord(h.stateDirectory)!.settings.keepAwake).toBe(true);
    expect(h.engine.folderMissing).toBeDefined();
    // Work in the folder the first attempt made: a second `worktree add` there would be refused.
    writeFileSync(join(shop!.worktreePath, "kept.txt"), "kept\n");
    (h.engine as unknown as { git: { git: string } }).git.git = h.tools.git;
    await h.engine.changeFolderPanel({ start: "branch", fields: { keepAwake: false } });
    expect(await start(h, { start: "branch" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(existsSync(join(api!.worktreePath, ".git"))).toBe(true);
    expect(readFileSync(join(shop!.worktreePath, "kept.txt"), "utf8")).toBe("kept\n");
    expect(readPrdRecord(h.stateDirectory)!.settings.keepAwake).toBe(false);
  });
});
