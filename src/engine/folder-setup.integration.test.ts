// Setting a run up again from the Folder missing page (missing worktree recovery, Phase 2), with
// real Git: the panel's starting points and defaults, and Start from the base branch (a fresh
// execution on a new suffixed branch and folder) or from the run's existing feature branch (the
// missing worktree re-created, git's stale record cleared, the same execution resumed).

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import type { SetupPanel } from "./folder-setup.js";
import { readPrdRecord } from "../state/records.js";
import { readExecution } from "./continuation-state.js";
import { plannedSteps, readStartIntent, writeStartIntent } from "./folder-setup-start.js";
import { buildSnapshot } from "./snapshot.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import type { ModelEntry } from "../account/model-list.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const panelOf = (h: Harness): SetupPanel => {
  const panel = h.engine.folderPanel;
  if (!panel || "blocked" in panel) throw new Error(`No setup panel: ${JSON.stringify(panel)}`);
  return panel;
};
const text = (parts: { text?: string }[]) => parts.map(part => part.text ?? "").join("");
let commands = 0;
async function start(h: Harness, overrides: Record<string, unknown> = {}) {
  const panel = panelOf(h);
  return h.engine.folderSetupStartCommand({ commandId: `start-${++commands}`, factsId: h.engine.folderMissing!.factsId, previewId: panel.previewId, start: panel.selected, fields: {}, ...overrides });
}

/** Phase 1 landed and pushed (2a is closed in the fixture); Phase 2b then stops at Needs you. */
async function landedThenStopped(): Promise<Harness> {
  harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }, landingSession("src/b.txt"), landingSession("src/c.txt"), landingSession("src/d.txt")] });
  const h = harness;
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  expect(h.engine.stoppedPhaseKey()).toBe("2b");
  return h;
}

describe("Start from the base branch (AC-SETUP-02, AC-SETUP-03, AC-SETUP-04)", () => {
  it("sets up a new suffixed branch and folder from the base commit the page showed, archives the unfinished execution, and runs the rest of the base plan", async () => {
    const h = await landedThenStopped();
    const oldExecution = h.engine.record.executionId!;
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
    expect(panel.preview.lets.map(row => text(row.parts))).toEqual(["Commit and push to feature/customer-returns-2", "Open one pull request into develop once every phase closes", "Never merge, deploy, or touch other branches"]);
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

/** A two-repository run: phase 1 names returns-api beside the PRD's acme-shop, and stops at Needs you. */
async function twoRepositories(): Promise<Harness> {
  const files = prdDirectoryFiles();
  const [title, ...rest] = files["phase-1-return-intake.md"]!.split("\n");
  files["phase-1-return-intake.md"] = [title, "", "**Repositories:** returns-api", ...rest].join("\n");
  harness = await createHarness({ files, sessions: [{ actions: [{ result: "I need a decision." }] }, { actions: [{ result: "Still stuck." }] }] });
  const h = harness;
  const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
  const api = createRepository(h.sandbox, "returns-api", origin.url);
  git(h.sandbox, api, "push", "-q", "origin", "develop");
  Object.assign(h.env, h.sandbox.env);
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.setUpRepositories.map(entry => entry.name)).toEqual(["acme-shop", "returns-api"]);
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  return h;
}

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

/** Real git, except the reads a failing-read test names, which fail as an unreadable object makes them fail. */
function failingGit(h: Harness, pattern: string): void {
  const context = (h.engine as unknown as { git: { git: string } }).git;
  const path = join(h.sandbox.root, `git-failing-${++commands}`);
  writeFileSync(path, `#!/bin/sh\ncase "$*" in ${pattern}) echo "fatal: bad object" >&2; exit 128;; esac\nexec '${h.tools.git}' "$@"\n`);
  chmodSync(path, 0o755);
  context.git = path;
}

describe("what the page says about reads that failed (AC-FACTS-03, AC-SETUP-06)", () => {
  it.skipIf(process.platform === "win32")("names a failed in-base read, withholds the put-it-back command and \"holds all work\", and says only that it can't tell", async () => {
    const h = await landedThenStopped();
    // Phase 1 is closed on develop without its commits, so nothing this run completed would run again.
    const path = join(h.repository, "docs/prds/customer-returns/phase-1-return-intake.md");
    const [title, ...rest] = readFileSync(path, "utf8").split("\n");
    writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Close phase 1 elsewhere");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();

    // Every read works: the existing branch is offered, and the command is shown.
    await h.engine.folderGuard({ gather: true });
    expect(buildSnapshot(h.engine).folderMissing!.restoreCommands).toHaveLength(1);

    // Whether the branch's tip is in develop can't be read: the suggestion can't be made, so no command is shown.
    const develop = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    failingGit(h, `"merge-base --is-ancestor ${tip} ${develop}"`);
    await h.engine.checkFoldersAgain();
    const unknown = buildSnapshot(h.engine).folderMissing!;
    expect(unknown.panel).toEqual({ blocked: expect.stringContaining("can’t suggest where to start yet") });
    expect(unknown.restoreCommands).toEqual([]);
    expect(unknown.restoreUnknown).toBe(true);
    expect(unknown.repositories[0]!.unknown).toEqual(expect.arrayContaining(["whether feature/customer-returns is in develop", "whether this run’s last pushed commit is in develop"]));
    // The pushed commit's on-origin half was read; its in-develop half is the one named (view/src/lib/folder-missing.test.ts words the row).
    expect(unknown.repositories[0]!.lastPushed).toEqual({ sha: tip, phaseId: "1", onOrigin: true });

    // With the branch checked out elsewhere, the base start is offered, but never says it has all of this run's work.
    git(h.sandbox, h.repository, "worktree", "add", "-q", join(h.sandbox.root, "scratch"), "feature/customer-returns");
    await h.engine.checkFoldersAgain();
    const panel = panelOf(h);
    expect(panel.choices.branch).toEqual({ unavailable: expect.stringContaining("checked out in") });
    expect(panel.choices.base).not.toHaveProperty("holdsAllWork");
    expect((panel.choices.base as { line: string }).line).toMatch(/· 4 phases, 2 done\. Couldn’t check whether it has all of this run’s work\.$/);
  });

  it.skipIf(process.platform === "win32")("names a commit date and a count of commits not in the base branch it couldn't read", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    // The pushed commit is the branch's tip on origin: whether it is on origin can't be read either.
    failingGit(h, `"log -1 --format=%cI ${tip}"|"rev-list --count "*|"merge-base --is-ancestor ${tip} ${tip}"`);
    await h.engine.folderGuard({ gather: true });
    const repository = buildSnapshot(h.engine).folderMissing!.repositories[0]!;
    expect(repository.unknown).toEqual(expect.arrayContaining([`the date of commit ${tip.slice(0, 7)}`, "how many commits on feature/customer-returns aren’t in develop"]));
    expect(repository.featureBranch).toMatchObject({ local: { sha: tip }, inBase: false });
    expect(repository.featureBranch.local).not.toHaveProperty("date");
    expect(repository.featureBranch).not.toHaveProperty("notInBaseCount");
    expect(repository.unknown).toContain("whether this run’s last pushed commit is on origin");
    expect(repository.lastPushed).toEqual({ sha: tip, phaseId: "1", inBase: false });
  });
});

describe("work a base-branch start would leave behind (AC-SAFE-02)", () => {
  it("names the phase the run stopped on when its commits are only on the feature branch", async () => {
    const h = await landedThenStopped();
    // Phase 2b's session committed before it stopped; the commit was never pushed.
    writeFileSync(join(h.engine.worktreePath, "src", "credit.txt"), "half done\n");
    git(h.sandbox, h.engine.worktreePath, "add", "src/credit.txt");
    git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "wip: store credit");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.again).toEqual(["1", "2b"]);
    expect(text(panel.preview.caution!)).toBe("Phases 1 and 2b would run again. Their work is on the feature branch, not in develop.");
    expect((panel.choices.base as { line: string; holdsAllWork: boolean }).line).toMatch(/Missing Phases 1 and 2b’s work\.$/);
    expect(panel.choices.base).toMatchObject({ holdsAllWork: false });
  });

  it("names the phases in plan order when they come from different reasons", async () => {
    const h = await landedThenStopped();
    writeFileSync(join(h.engine.worktreePath, "src", "credit.txt"), "half done\n");
    git(h.sandbox, h.engine.worktreePath, "add", "src/credit.txt");
    git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "wip: store credit");
    dropPhaseOne(h);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(text(panel.preview.caution!)).toBe("Phase 2b would run again. Its work is on the feature branch, not in develop. Phase 1 would not run. The plan on develop has no such phase, so its work stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phases 1 and 2b’s work\.$/);
  });

  it("names a phase this run completed that the plan on the base branch doesn't have, and says it won't run", async () => {
    const h = await landedThenStopped();
    // develop's plan no longer has Phase 1.
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-1-return-intake.md");
    for (const file of ["phase-2-refunds.md", "phase-2a-card-refunds.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
      const path = join(h.repository, "docs/prds/customer-returns", file);
      writeFileSync(path, readFileSync(path, "utf8").replace(/## Phase dependencies\n[^\n]*\n/, "## Phase dependencies\nNone.\n"));
    }
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 folded into another PRD");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.run.map(row => row.id)).not.toContain("1");
    expect(text(panel.preview.caution!)).toBe("Phase 1 would not run. The plan on develop has no such phase, so its work stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phase 1’s work\.$/);
  });

  it("doesn't name a phase the base plan lacks when its work is already in the base branch", async () => {
    const h = await landedThenStopped();
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-1-return-intake.md");
    for (const file of ["phase-2-refunds.md", "phase-2a-card-refunds.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
      const path = join(h.repository, "docs/prds/customer-returns", file);
      writeFileSync(path, readFileSync(path, "utf8").replace(/## Phase dependencies\n[^\n]*\n/, "## Phase dependencies\nNone.\n"));
    }
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 folded into another PRD");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.preview.caution).toBeUndefined();
    expect(panel.choices.base).toMatchObject({ holdsAllWork: true });
  });

  it("names the phases whose work is in a repository the start leaves out, never the repository as a phase", async () => {
    const h = await twoRepositories();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    // Phase 1's session committed in returns-api before it stopped.
    writeFileSync(join(api.worktreePath, "api.txt"), "endpoint\n");
    git(h.sandbox, api.worktreePath, "add", "api.txt");
    git(h.sandbox, api.worktreePath, "commit", "-qm", "wip: returns endpoint");
    // develop's Phase 1 no longer names returns-api, so a base start sets up acme-shop only.
    const path = join(h.repository, "docs/prds/customer-returns/phase-1-return-intake.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("\n**Repositories:** returns-api\n", "\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 stays in acme-shop");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(api.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.repositories).toEqual([]);
    const caution = text(panel.preview.caution!);
    expect(caution).toContain("Work this run committed in returns-api (Phase 1) isn’t in its base branch; it stays on that repository’s feature branch.");
    expect(caution).not.toContain("Phase returns-api");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phase 1’s work\.$/);
  });
});

describe("the panel's Agent, Model and Effort, as on Documents found (AC-SETUP-01)", () => {
  const model = (overrides: Partial<ModelEntry>): ModelEntry => ({ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"], supportsAutoMode: true, ...overrides });
  /** The model list as the engine sees it, arriving when the test says. */
  class ModelList implements ClaudeInfoSource {
    account = { email: "fixture@example.test", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), limits: [] };
    models: ModelEntry[] | undefined;
    modelListError: string | undefined;
    private readonly listeners = new Set<() => void>();
    arrive(models: ModelEntry[] | undefined, error?: string) { this.models = models; this.modelListError = error; for (const listener of this.listeners) listener(); }
    refreshAccount() { return Promise.resolve(); }
    onChange(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  }

  it("lists the efforts of the model chosen in the panel, says when it takes none, refuses one it doesn't take, and shows Model's message", async () => {
    const list = new ModelList();
    harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }], engineOptions: { claude: list } });
    const h = harness;
    list.arrive([model({}), model({ value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1", supportedEffortLevels: ["high", "max"], defaultEffort: "high" }), model({ value: "haiku", resolvedModel: "claude-haiku-5-5", displayName: "Haiku 5.5", supportsEffort: false, supportedEffortLevels: [] })]);
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, effort: "low" });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect([panelOf(h).fields.effort, panelOf(h).effortLevels]).toEqual(["low", ["low", "medium", "high", "xhigh", "max"]]);

    // Fable doesn't take Low: its levels are listed and its default replaces the saved effort, as on Documents found.
    expect(await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { model: "fable" } })).toMatchObject({ ok: true });
    expect([panelOf(h).fields.effort, panelOf(h).effortLevels]).toEqual(["high", ["high", "max"]]);
    expect(await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { effort: "low" } })).toMatchObject({ ok: false, status: 400, reason: "Fable 5.1 doesn’t take that effort. Choose a supported effort." });
    // Haiku takes no effort setting.
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { model: "haiku" } });
    expect([panelOf(h).fields.effort, panelOf(h).effortLevels]).toEqual(["", []]);
    expect(panelOf(h).fieldErrors.model).toBeUndefined();

    // A model that can't run in auto mode gets Model's message, which holds Start.
    // The page shows a catalogue change at once, without an edit or Check again.
    list.arrive([model({}), model({ value: "haiku", resolvedModel: "claude-haiku-5-5", displayName: "Haiku 5.5", supportsEffort: false, supportedEffortLevels: [], supportsAutoMode: false })]);
    expect((buildSnapshot(h.engine).folderMissing!.panel as SetupPanel).fieldErrors.model).toEqual(expect.stringContaining("Haiku 5.5"));
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: {} });
    expect(panelOf(h).fieldErrors.model).toEqual(expect.stringContaining("Haiku 5.5"));
    expect(await start(h)).toMatchObject({ ok: false, status: 409, code: "folder_setup_fields" });
    // The model list itself failed: its message is Model's.
    list.arrive(undefined, "Claude Code couldn’t list its models.");
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: {} });
    expect(panelOf(h).fieldErrors.model).toBe("Claude Code couldn’t list its models.");
    expect(buildSnapshot(h.engine).settings.modelListError).toBe("Claude Code couldn’t list its models.");
  });
});

/** develop's plan no longer has Phase 1; the phases that depended on it depend on nothing. */
function dropPhaseOne(h: Harness): void {
  git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-1-return-intake.md");
  for (const file of ["phase-2-refunds.md", "phase-2a-card-refunds.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
    const path = join(h.repository, "docs/prds/customer-returns", file);
    writeFileSync(path, readFileSync(path, "utf8").replace(/## Phase dependencies\n[^\n]*\n/, "## Phase dependencies\nNone.\n"));
  }
  git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 folded into another PRD");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
}

/** Two repositories, Phase 1 recorded as completed with its work pushed in returns-api only, and no stop. */
async function phaseOneDoneInApi(): Promise<{ h: Harness; apiSha: string }> {
  const h = await twoRepositories();
  const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
  writeFileSync(join(api.worktreePath, "api.txt"), "endpoint\n");
  git(h.sandbox, api.worktreePath, "add", "api.txt");
  git(h.sandbox, api.worktreePath, "commit", "-qm", "feat: returns endpoint");
  git(h.sandbox, api.worktreePath, "push", "-q", "origin", "feature/customer-returns");
  const apiSha = git(h.sandbox, api.worktreePath, "rev-parse", "HEAD").trim();
  const phase = h.engine.record.phases["1"]!;
  delete phase.stop;
  phase.doneAt = new Date().toISOString();
  phase.repositories["returns-api"] = { ...phase.repositories["returns-api"]!, pushedSha: apiSha, commitCount: 1 };
  rmSync(api.worktreePath, { recursive: true, force: true });
  return { h, apiSha };
}

describe("work left behind across repositories (AC-SAFE-02)", () => {
  it("names only the repositories whose feature branch holds a phase's work when it would run again", async () => {
    const { h } = await phaseOneDoneInApi();
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(text(panelOf(h).preview.caution!)).toBe("Phase 1 would run again. Its work is on the feature branch in returns-api, not in develop.");
  });

  it("names a completed phase whose work is in a repository the start leaves out, and not once that work is in its base branch", async () => {
    const { h, apiSha } = await phaseOneDoneInApi();
    const path = join(h.repository, "docs/prds/customer-returns/phase-1-return-intake.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("\n**Repositories:** returns-api\n", "\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 stays in acme-shop");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(text(panelOf(h).preview.caution!)).toContain("Work this run committed in returns-api (Phase 1) isn’t in its base branch; it stays on that repository’s feature branch.");
    // Once returns-api's develop has Phase 1's commit, nothing of it is left behind there.
    const api = h.engine.record.repositories.find(entry => entry.name === "returns-api")!;
    git(h.sandbox, api.mainCheckoutPath, "push", "-q", "origin", `${apiSha}:refs/heads/develop`);
    await h.engine.checkFoldersAgain();
    expect(text(panelOf(h).preview.caution ?? [])).not.toContain("returns-api");
  });
});

describe("the put-it-back command while the existing branch can't be checked (AC-SETUP-06)", () => {
  it.skipIf(process.platform === "win32")("shows no command when the panel offers the base branch and can't check the existing one", async () => {
    const h = await landedThenStopped();
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    failingGit(h, `"ls-tree -r -z -l ${tip}"`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    const panel = view.panel as SetupPanel;
    expect(panel.selected).toBe("base");
    expect(panel.choices.branch).toEqual({ unavailable: expect.stringMatching(/^Couldn’t check/) });
    expect(view.restoreCommands).toEqual([]);
    expect(view.restoreUnknown).toBe(true);
  });
});

describe("Start's folder handling (Phase 4 of missing worktree recovery: AC-SETUP-05, AC-SAFE-04, AC-SAFE-01)", () => {
  it("runs the first-Start path checks when re-creating the saved folder: one now inside a checkout is refused", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    // A checkout of this repository now sits around the missing saved folder.
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", "elsewhere", dirname(saved), "develop");
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.fields.worktreePath).toBe(saved.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.fieldErrors).toEqual({ worktreePath: "That folder is inside a checkout of this repository. Choose one outside it." });
    expect(await start(h)).toMatchObject({ ok: false, status: 409 });
    expect(existsSync(saved)).toBe(false);
  });

  it("clears git's stale record first when a base-branch start's Worktree is edited to the missing saved folder", async () => {
    const h = await landedThenStopped();
    const execution = h.engine.record.executionId!;
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain("prunable");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: { worktreePath: saved } });
    const panel = panelOf(h);
    expect(panel.selected).toBe("base");
    expect(panel.fieldErrors).toEqual({});
    expect(panel.preview.lets.map(row => text(row.parts))).toContain(`Clear git’s record of the missing folder ${saved.replace(process.env.HOME ?? "\0", "~")}`);

    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).not.toBe(execution);
    expect(h.engine.record.repositories[0]!.worktreePath).toBe(saved);
    expect(git(h.sandbox, saved, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/customer-returns-2");
    const list = git(h.sandbox, h.repository, "worktree", "list", "--porcelain");
    expect(list).not.toContain("prunable");
    // The earlier branch is untouched.
    git(h.sandbox, h.repository, "rev-parse", "--verify", "refs/heads/feature/customer-returns");
  });

  /** A failed existing-branch start that made its worktree of the run's branch at `folder`, then stopped before saving. */
  function failedBranchStart(h: Harness, folder: string, workspaceFolder: string, done: string[]) {
    git(h.sandbox, h.repository, "worktree", "add", "-q", folder, "feature/customer-returns");
    const settings = { ...structuredClone(h.engine.record.settings), worktreePath: folder, workspaceFolder };
    const repositories = [{ name: "acme-shop", kind: "prd" as const, github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", branch: "feature/customer-returns", worktreePath: folder }];
    writeStartIntent(h.stateDirectory, { formatVersion: 1, id: "intent-branch", commandId: "earlier-branch-start", executionId: h.engine.record.executionId!, kind: "branch", factsId: "a".repeat(64), previewId: "b".repeat(64), createdAt: new Date().toISOString(), settings, repositories,
      steps: plannedSteps("branch", repositories, false).map(row => done.includes(row.name) ? { ...row, state: "done" as const } : row.name === "save" ? { ...row, state: "failed" as const, error: "stopped" } : row), state: "failed" });
  }

  it("resumes a failed base-branch start into the saved folder whose plan had no clear step, clearing git's record first", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    const base = git(h.sandbox, h.repository, "rev-parse", "origin/develop").trim();
    const settings = { ...structuredClone(h.engine.record.settings), featureBranch: "feature/customer-returns-2", worktreePath: saved, workspaceFolder: join(h.sandbox.root, ".worktrees", "customer-returns-2") };
    const repositories = [{ name: "acme-shop", kind: "prd" as const, github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", baseCommit: base, branch: "feature/customer-returns-2", worktreePath: saved }];
    // The earlier attempt planned no clear, and its worktree step failed on git's record of the missing folder.
    writeStartIntent(h.stateDirectory, { formatVersion: 1, id: "intent-base", commandId: "earlier-base-start", executionId: h.engine.record.executionId!, kind: "base", factsId: "a".repeat(64), previewId: "b".repeat(64), createdAt: new Date().toISOString(), settings, repositories,
      steps: plannedSteps("base", repositories, false).map(row => row.name === "worktree:acme-shop" ? { ...row, state: "failed" as const, error: "already registered" } : row), state: "failed", newExecutionId: "new-execution-2" });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect(panel.selected).toBe("base");
    expect(panel.fields.worktreePath).toBe(saved.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.preview.lets.map(row => text(row.parts))).toContain(`Clear git’s record of the missing folder ${saved.replace(process.env.HOME ?? "\0", "~")}`);
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readStartIntent(h.stateDirectory, "earlier-base-start")!.steps.map(row => [row.name, row.state])).toEqual([["clear:acme-shop", "done"], ["worktree:acme-shop", "done"], ["plan", "done"], ["activate", "done"]]);
    expect(git(h.sandbox, saved, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/customer-returns-2");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).not.toContain("prunable");
  });

  it("picks up a failed existing-branch start's own worktree in the suffixed folder when the saved path holds something else", async () => {
    const h = await landedThenStopped();
    const execution = h.engine.record.executionId!;
    const saved = h.engine.worktreePath;
    git(h.sandbox, h.repository, "worktree", "remove", "--force", saved);
    mkdirSync(saved, { recursive: true });
    writeFileSync(join(saved, "notes.txt"), "someone else's\n");
    const workspace = join(h.sandbox.root, ".worktrees", "customer-returns-2");
    const moved = join(workspace, "acme-shop");
    failedBranchStart(h, moved, workspace, ["worktree:acme-shop"]);

    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.featureBranch.elsewhere).toBeUndefined();
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.fields.worktreePath).toBe(moved.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.fields.workspaceFolder).toBe(workspace);
    expect(panel.fieldErrors).toEqual({});

    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).toBe(execution);
    expect(h.engine.record.repositories[0]!.worktreePath).toBe(moved);
    expect(h.engine.record.settings.workspaceFolder).toBe(workspace);
    expect(readStartIntent(h.stateDirectory, "earlier-branch-start")!.state).toBe("resumed");
    expect(readFileSync(join(saved, "notes.txt"), "utf8")).toBe("someone else's\n");
  });

  it("picks up a failed existing-branch start's own worktree in an edited folder while the saved folder is missing", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    // The failed start had already cleared git's record of the missing folder.
    git(h.sandbox, h.repository, "worktree", "prune");
    const chosen = join(h.sandbox.root, "chosen", "acme-shop");
    failedBranchStart(h, chosen, h.engine.record.settings.workspaceFolder, ["worktree:acme-shop"]);

    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.featureBranch.elsewhere).toBeUndefined();
    // Putting the saved folder back by hand would fail while the start's worktree holds the branch.
    expect(view.restoreCommands).toEqual([]);
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.fields.worktreePath).toBe(chosen.replace(process.env.HOME ?? "\0", "~"));
    expect(panel.fieldErrors).toEqual({});
    // Another folder would fail: the earlier Start's worktree still holds the branch.
    await h.engine.changeFolderPanel({ start: "branch", fields: { worktreePath: join(h.sandbox.root, "other", "acme-shop") } });
    expect(panelOf(h).fieldErrors.worktreePath).toContain("which an earlier Start made. Use that folder, or move it away and check again.");
    await h.engine.changeFolderPanel({ start: "branch", fields: { worktreePath: chosen } });
    expect(panelOf(h).fieldErrors).toEqual({});

    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]!.worktreePath).toBe(chosen);
    expect(h.engine.latestSession("2b")!.workingDirectory).toBe(chosen);
    expect(readStartIntent(h.stateDirectory, "earlier-branch-start")!.state).toBe("resumed");
  });
});

describe("Start's folder handling with several repositories (Phase 4 of missing worktree recovery: AC-SETUP-05, AC-SAFE-04)", () => {
  it("runs the first-Start path checks for each re-created worktree: one now inside another repository's checkout is refused", async () => {
    const h = await twoRepositories();
    const workspace = dirname(h.engine.worktreePath);
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    rmSync(workspace, { recursive: true, force: true });
    // A checkout of returns-api now sits where the saved workspace was, around both missing folders.
    git(h.sandbox, api.mainCheckoutPath, "worktree", "add", "-q", "-b", "elsewhere", workspace, "develop");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.fieldErrors.workspaceFolder).toContain("In acme-shop: That folder is inside a checkout of returns-api. Choose one outside it.");
    expect(await start(h, { start: "branch" })).toMatchObject({ ok: false, status: 409 });
    expect(existsSync(join(workspace, "acme-shop"))).toBe(false);
  });

  it("clears git's stale records first when a base-branch start's Workspace folder is edited to the missing saved workspace", async () => {
    const h = await twoRepositories();
    const workspace = dirname(h.engine.worktreePath);
    rmSync(workspace, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: { workspaceFolder: workspace } });
    const panel = panelOf(h);
    expect(panel.fieldErrors).toEqual({});
    const lets = panel.preview.lets.map(row => text(row.parts));
    for (const name of ["acme-shop", "returns-api"]) expect(lets).toContain(`Clear git’s record of the missing folder ${join(workspace, name).replace(process.env.HOME ?? "\0", "~")}`);
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    for (const entry of record.repositories) {
      expect(entry.worktreePath).toBe(join(workspace, entry.name));
      expect(git(h.sandbox, entry.worktreePath, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/customer-returns-2");
      expect(git(h.sandbox, entry.mainCheckoutPath, "worktree", "list", "--porcelain")).not.toContain("prunable");
    }
  });
});

/** Phase 1 merged into develop on origin, with the given phases closed there too: the 2026-11-06 case. */
function mergedWithClosed(h: Harness, files: string[]): void {
  git(h.sandbox, h.repository, "fetch", "-q", "origin");
  git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge", "origin/feature/customer-returns");
  for (const file of files) {
    const path = join(h.repository, "docs/prds/customer-returns", file);
    const [title, ...rest] = readFileSync(path, "utf8").split("\n");
    writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
  }
  git(h.sandbox, h.repository, "commit", "-qam", "Close phases elsewhere");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
}

describe("the page's facts and the panel's fields (Phase 5 of missing worktree recovery: AC-FACTS-01, AC-FACTS-03, AC-SETUP-01, AC-SETUP-03)", () => {
  it.skipIf(process.platform === "win32")("withholds everything the feature tip decides when the checkout's branch can't be read, even though origin has the branch", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    failingGit(h, `"rev-parse --verify --quiet refs/heads/feature/customer-returns^{commit}"`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    const repository = view.repositories[0]!;
    expect(repository.featureBranch.origin).toBeDefined();
    expect(repository.featureBranch.local).toBeUndefined();
    expect(repository.featureBranch).not.toHaveProperty("inBase");
    expect(repository.featureBranch).not.toHaveProperty("notInBaseCount");
    expect(repository.unknown).toEqual(expect.arrayContaining(["your checkout’s feature/customer-returns", "whether feature/customer-returns is in develop"]));
    expect(view.plans.saved.label).toBe("not_compared");
    expect(view.plans).not.toHaveProperty("branchOnly");
    expect(view.panel).toEqual({ blocked: "Kiln couldn’t read everything it needs about the branch, so it can’t suggest where to start yet. Check again once it can." });
  });

  it.skipIf(process.platform === "win32")("names a failed read of the plan on the feature branch when the run's work is already in the base branch", async () => {
    const h = await landedThenStopped();
    mergedWithClosed(h, ["phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    failingGit(h, `"ls-tree -r -z -l ${tip}"*`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    // The base branch has nothing to run and the existing branch's plan couldn't be read: the panel can't suggest a start.
    expect(view.panel).toEqual({ blocked: "Kiln couldn’t read everything it needs about the branch, so it can’t suggest where to start yet. Check again once it can." });
    expect(view.repositories[0]!.unknown.filter(read => read === "the plan on feature/customer-returns")).toHaveLength(1);
    // The work is in the base branch, so the saved plan is still compared with the base branch's, which has closed phases it lacks.
    expect(view.plans.saved).toMatchObject({ comparedWith: "base", label: "out_of_date" });
  });

  it.skipIf(process.platform === "win32")("names a failed read of the plan on the feature branch once, and compares nothing, when the run's work is on the branch", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    const tip = git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim();
    failingGit(h, `"ls-tree -r -z -l ${tip}"*`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.unknown.filter(read => read === "the plan on feature/customer-returns")).toHaveLength(1);
    expect(view.plans.saved.label).toBe("not_compared");
    expect(view.panel).toEqual({ blocked: expect.stringContaining("can’t suggest where to start yet") });
  });

  it("says on the existing branch's line that it is behind the base branch's plan while the base branch is selected", async () => {
    const h = await landedThenStopped();
    mergedWithClosed(h, ["phase-2b-store-credit.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const panel = panelOf(h);
    expect([panel.suggested, panel.selected]).toEqual(["base", "base"]);
    expect((panel.choices.branch as { line: string }).line).toMatch(/· 4 phases, 2 done\. Already merged into develop\. Has all of this run’s work\. Behind develop’s plan\.$/);
    expect((panel.choices.base as { line: string }).line).not.toContain("Behind");
    expect(panel.preview.caution).toBeUndefined();
  });

  it("says when a model change in the panel resets the effort, in Documents found's words, until the next model or effort change", async () => {
    const list = { account: { email: "fixture@example.test", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), limits: [] }, models: undefined as ModelEntry[] | undefined, modelListError: undefined, refreshAccount: () => Promise.resolve(), onChange: () => () => true } satisfies ClaudeInfoSource;
    const entry = (overrides: Partial<ModelEntry>): ModelEntry => ({ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"], supportsAutoMode: true, ...overrides });
    list.models = [entry({}), entry({ value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1", supportedEffortLevels: ["high", "max"], defaultEffort: "high" }), entry({ value: "sol", resolvedModel: "claude-sol", displayName: "Sol", supportedEffortLevels: ["high", "max"] })];
    harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }], engineOptions: { claude: list } });
    const h = harness;
    await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, effort: "low" });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(panelOf(h)).not.toHaveProperty("choiceNotice");
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { model: "fable" } });
    expect((buildSnapshot(h.engine).folderMissing!.panel as SetupPanel).choiceNotice).toBe("Effort changed to high for Fable 5.1.");
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { keepAwake: false } });
    expect(panelOf(h).choiceNotice).toBe("Effort changed to high for Fable 5.1.");
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { effort: "max" } });
    expect(panelOf(h)).not.toHaveProperty("choiceNotice");
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { model: "opus", effort: "low" } });
    await h.engine.changeFolderPanel({ start: panelOf(h).selected, fields: { model: "sol" } });
    expect(panelOf(h).choiceNotice).toBe("Choose an effort for Sol; no supported default was reported.");
  });

  it("tags a repository a session added with the phase that added it, on either start's Repositories list", async () => {
    const h = await twoRepositories();
    const api = h.engine.record.repositories.find(entry => entry.name === "returns-api")!;
    Object.assign(api, { kind: "added", addedInPhase: "1" });
    rmSync(api.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    // The base branch is suggested; the run's own entry for the repository keeps its tag there too.
    expect(panelOf(h).selected).toBe("base");
    expect(panelOf(h).repositories.map(row => [row.name, row.addedInPhase])).toEqual([["acme-shop", undefined], ["returns-api", "1"]]);
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    expect(panelOf(h).repositories.map(row => [row.name, row.addedInPhase])).toEqual([["acme-shop", undefined], ["returns-api", "1"]]);
  });
});

/** A commit on Phase 2b's branch that was never pushed: the work of the phase the run was on. */
function storeCreditWork(h: Harness): void {
  writeFileSync(join(h.engine.worktreePath, "src", "credit.txt"), "half done\n");
  git(h.sandbox, h.engine.worktreePath, "add", "src/credit.txt");
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "wip: store credit");
}

describe("work a base-branch start leaves behind (Phase 6 of missing worktree recovery: AC-SAFE-02)", () => {
  it("names a phase completed with waived, unpushed work that the base plan lacks", async () => {
    const h = await landedThenStopped();
    const phase = h.engine.record.phases["1"]!.repositories["acme-shop"]!;
    // Phase 1's work was waived rather than pushed (AC-WAIVE-09): its Done recorded the feature head instead.
    phase.waivedHead = phase.pushedSha!; delete phase.pushedSha;
    dropPhaseOne(h);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(text(panel.preview.caution!)).toBe("Phase 1 would not run. The plan on develop has no such phase, so its work stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phase 1’s work\.$/);
  });

  it("doesn't call a waived phase's work pushed when the branch was deleted", async () => {
    const h = await landedThenStopped();
    const phase = h.engine.record.phases["1"]!.repositories["acme-shop"]!;
    const sha = phase.pushedSha!;
    phase.waivedHead = sha; delete phase.pushedSha;
    git(h.sandbox, h.repository, "worktree", "remove", "--force", h.engine.worktreePath);
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(text(panelOf(h).preview.caution!)).toBe(`Phase 1 will run again. Its work (${sha.slice(0, 7)}) was on the deleted branch and isn’t in develop.`);
  });

  it("names a completed phase with waived work in a repository the start leaves out", async () => {
    const { h } = await phaseOneDoneInApi();
    const api = h.engine.record.phases["1"]!.repositories["returns-api"]!;
    api.waivedHead = api.pushedSha!; delete api.pushedSha;
    const path = join(h.repository, "docs/prds/customer-returns/phase-1-return-intake.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("\n**Repositories:** returns-api\n", "\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 stays in acme-shop");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(text(panelOf(h).preview.caution!)).toContain("Work this run committed in returns-api (Phase 1) isn’t in its base branch; it stays on that repository’s feature branch.");
  });

  it("names a completed phase the base plan lacks whose work is only in another repository of the start's set", async () => {
    const { h } = await phaseOneDoneInApi();
    // develop's plan drops Phase 1, and Phase 3 now names returns-api, so the start still sets it up.
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-1-return-intake.md");
    for (const file of ["phase-2-refunds.md", "phase-2a-card-refunds.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
      const path = join(h.repository, "docs/prds/customer-returns", file);
      let content = readFileSync(path, "utf8").replace(/## Phase dependencies\n[^\n]*\n/, "## Phase dependencies\nNone.\n");
      if (file.startsWith("phase-3")) { const [title, ...rest] = content.split("\n"); content = [title, "", "**Repositories:** returns-api", ...rest].join("\n"); }
      writeFileSync(path, content);
    }
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 folded into another PRD; the dashboard needs returns-api");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.repositories.map(r => r.name)).toContain("returns-api");
    expect(text(panel.preview.caution!)).toContain("Phase 1 would not run. The plan on develop has no such phase, so its work stays on the earlier feature branch.");
  });

  it("names the phase a session was working on when the folder went missing, while it works and after it ends", async () => {
    const release = "release-2b";
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const releasePath = join(h.sandbox.root, release);
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession(), { actions: [{ write: { path: "src/credit.txt", content: "half done\n" } }, { commit: "wip: store credit" }, { waitForFile: releasePath }, { result: "Stopping here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => git(h.sandbox, h.repository, "log", "-1", "--format=%s", "feature/customer-returns").trim() === "wip: store credit");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    // While Phase 2b's session still works.
    await h.engine.folderGuard({ gather: true, mayLeave: false });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).preview.again).toEqual(["1", "2b"]);
    expect((panelOf(h).choices.base as { line: string }).line).toMatch(/Missing Phases 1 and 2b’s work\.$/);
    // After it ends, judged nothing, with no stop recorded.
    writeFileSync(releasePath, "");
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop).toBeUndefined();
    await h.engine.checkFoldersAgain();
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.again).toEqual(["1", "2b"]);
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phases 1 and 2b’s work\.$/);
  });

  it("names the phase the run stopped on when the base plan lacks it and its commits aren't in the base branch", async () => {
    const h = await landedThenStopped();
    storeCreditWork(h);
    // develop's plan no longer has Phase 2b.
    git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-2b-store-credit.md");
    const parent = join(h.repository, "docs/prds/customer-returns/phase-2-refunds.md");
    writeFileSync(parent, readFileSync(parent, "utf8").replace("| [2b](phase-2b-store-credit.md) | Store credit | AC-RET-03 |\n", ""));
    const dashboard = join(h.repository, "docs/prds/customer-returns/phase-3-returns-dashboard.md");
    writeFileSync(dashboard, readFileSync(dashboard, "utf8").replace("- [Phase 2b](phase-2b-store-credit.md)", "- [Phase 2a](phase-2a-card-refunds.md)"));
    git(h.sandbox, h.repository, "commit", "-qam", "Store credit moved to another PRD");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.run.map(row => row.id)).not.toContain("2b");
    expect(text(panel.preview.caution!)).toContain("Phase 2b would not run. The plan on develop has no such phase, so its work stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phases 1 and 2b’s work\.$/);
  });

  it("tests the work against the base branch chosen in the panel, not the saved one", async () => {
    const h = await landedThenStopped();
    storeCreditWork(h);
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "origin", "feature/customer-returns");
    // release is develop before the feature merged; develop then takes all of the run's work.
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop:refs/heads/release");
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).preview.again).not.toContain("2b");
    await h.engine.changeFolderPanel({ start: "base", fields: { baseBranch: "release" } });
    const panel = panelOf(h);
    expect(panel.preview.again).toEqual(["1", "2b"]);
    expect(text(panel.preview.caution!)).toBe("Phases 1 and 2b would run again. Their work is on the feature branch, not in release.");
  });
});

describe("starting-point lines and the existing-branch start's left-behind work (Phase 7 of missing worktree recovery: AC-SETUP-02, AC-SETUP-03, AC-SAFE-02)", () => {
  it.skipIf(process.platform === "win32")("suggests and offers the base branch when the existing branch can't be checked but the run's work is in the base branch", async () => {
    const h = await landedThenStopped();
    // The checkout's branch is ahead of origin's, and all of it is merged into develop, where Phase 2b is closed.
    storeCreditWork(h);
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge", "feature/customer-returns");
    const path = join(h.repository, "docs/prds/customer-returns/phase-2b-store-credit.md");
    const [title, ...rest] = readFileSync(path, "utf8").split("\n");
    writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Close Phase 2b elsewhere");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    // How the checkout's branch compares with origin's can't be read, so the existing branch's availability is unknown.
    failingGit(h, `"rev-list --left-right --count "*`);
    await h.engine.folderGuard({ gather: true });
    expect(h.engine.folderMissing!.existingBranch.available).toBe("unknown");
    const panel = panelOf(h);
    expect([panel.suggested, panel.selected]).toEqual(["base", "base"]);
    expect(panel.choices.branch).toEqual({ unavailable: "Kiln couldn’t read everything it needs about the branch." });
    expect(panel.preview.startLabel).toBe("Set up & start Phase 3");
    // The withheld start can't be chosen.
    expect(await h.engine.changeFolderPanel({ start: "branch", fields: {} })).toMatchObject({ ok: true });
    expect(panelOf(h).selected).toBe("base");
  });

  it("names a completed phase whose work isn't on origin's copy of the branch when only origin has it, and says it will run again", async () => {
    const h = await landedThenStopped();
    const phase = h.engine.record.phases["1"]!.repositories["acme-shop"]!;
    const sha = phase.pushedSha!;
    // Phase 1's work was waived rather than pushed (AC-WAIVE-09), and origin's branch is still at Phase 1's start.
    phase.waivedHead = sha; delete phase.pushedSha;
    git(h.sandbox, h.repository, "push", "-q", "--force", "origin", `${phase.startCommit}:refs/heads/feature/customer-returns`);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(panel.preview.run[0]).toMatchObject({ id: "1", note: "runs first" });
    expect(panel.preview.again).toEqual(["1"]);
    expect(text(panel.preview.caution!)).toBe(`Phase 1 will run again. Its work (${sha.slice(0, 7)}) isn’t on origin’s copy of the branch, which Kiln starts from. Phase 2b runs from origin’s copy of the branch. Commits it made that weren’t pushed were only on the deleted branch, and Kiln can’t tell whether there were any.`);
    expect(panel.choices.branch).toMatchObject({ holdsAllWork: false, line: `Last commit ${phase.startCommit.slice(0, 7)} · 4 phases, 1 done. Already merged into develop. Missing Phase 1’s work.` });
  });

  it("names a completed phase whose recorded commit the shared checkout no longer has, and says it won't run again when the branch's plan closes it", async () => {
    const h = await landedThenStopped();
    // Phase 1's recorded commit is gone from the shared checkout (as after gc), while its Closed line is on the branch.
    const lost = "1234567".padEnd(40, "0");
    h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha = lost;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.run.map(row => row.id)).not.toContain("1");
    expect(panel.preview.again).toEqual([]);
    expect(text(panel.preview.caution!)).toBe("Phase 1 won’t run again. Its work (1234567) isn’t on the feature branch, and the plan there doesn’t leave it to run.");
    expect(panel.choices.branch).toMatchObject({ holdsAllWork: false, line: expect.stringMatching(/ · 4 phases, 2 done\. Missing Phase 1’s work\.$/) });
  });

  it.skipIf(process.platform === "win32")("says it can't check whether the existing branch has all of this run's work when a completed phase's ancestry read fails", async () => {
    const h = await landedThenStopped();
    const sha = h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha!;
    // Phase 2b committed after Phase 1, so only the read of Phase 1's commit fails, not the branch tip's.
    storeCreditWork(h);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    failingGit(h, `"merge-base --is-ancestor ${sha} "*`);
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.choices.branch).not.toHaveProperty("holdsAllWork");
    expect((panel.choices.branch as { line: string }).line).toMatch(/ · 4 phases, 2 done\. Couldn’t check whether it has all of this run’s work\.$/);
    expect(panel.preview.again).toEqual([]);
    expect(panel.preview.caution).toBeUndefined();
  });

  it("says the existing branch has all of this run's work when the shared checkout's branch holds every completed phase's commit", async () => {
    const h = await landedThenStopped();
    const tip = git(h.sandbox, h.repository, "rev-parse", "--short=7", "feature/customer-returns").trim();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.choices.branch).toMatchObject({ holdsAllWork: true, line: `Last commit ${tip} · 4 phases, 2 done. Has all of this run’s work.` });
    expect(panel.preview.again).toEqual([]);
    expect(panel.preview.caution).toBeUndefined();
  });
});

describe("the folder facts (Phase 8 of missing worktree recovery: AC-FACTS-01, AC-FACTS-02, AC-FACTS-03)", () => {
  /** The checkout's branch merged into develop; origin's copy then gets one more commit that develop lacks. */
  async function originAheadOfMergedCheckout(): Promise<Harness> {
    const h = await landedThenStopped();
    mergedWithClosed(h, ["phase-1-return-intake.md"]);
    const worktree = h.engine.worktreePath;
    // The late work closes Phase 2b, which the saved plan has open.
    const phase = join(worktree, "docs/prds/customer-returns/phase-2b-store-credit.md");
    const [title, ...rest] = readFileSync(phase, "utf8").split("\n");
    writeFileSync(phase, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    writeFileSync(join(worktree, "src/late.txt"), "late\n");
    git(h.sandbox, worktree, "add", "src/late.txt", phase);
    git(h.sandbox, worktree, "commit", "-qm", "Late work, pushed from elsewhere");
    git(h.sandbox, worktree, "push", "-q", "origin", "feature/customer-returns");
    git(h.sandbox, worktree, "reset", "-q", "--hard", "HEAD~1");
    rmSync(worktree, { recursive: true, force: true });
    return h;
  }

  it("counts origin's copy of the branch when it holds work the base branch lacks, though the checkout's tip is in it", async () => {
    const h = await originAheadOfMergedCheckout();
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.featureBranch).toMatchObject({ relation: "behind", inBase: true });
    // The run's latest work lives on origin's copy of the branch, so the saved plan is compared with the plan there,
    // which closes Phase 2b: not with develop's, nor the checkout's older tip, where 2b is open.
    expect(view.plans.saved).toMatchObject({ comparedWith: "branch", label: "out_of_date" });
    expect(view.plans.branchOnly).toEqual(["2b"]);
    expect(view.repositories[0]!.unknown).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("names a failed read of whether origin's copy is in the base branch, and compares nothing", async () => {
    const h = await originAheadOfMergedCheckout();
    const originTip = git(h.sandbox, h.repository, "ls-remote", "origin", "refs/heads/feature/customer-returns").split(/\s+/)[0]!;
    const develop = git(h.sandbox, h.repository, "ls-remote", "origin", "refs/heads/develop").split(/\s+/)[0]!;
    failingGit(h, `"merge-base --is-ancestor ${originTip} ${develop}"`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.unknown).toContain("whether origin’s feature/customer-returns is in develop");
    expect(view.plans.saved.label).toBe("not_compared");
    // The existing branch is unavailable for a known reason (behind origin's), so the unknown read doesn't block the base start.
    expect(panelOf(h).choices.branch).toEqual({ unavailable: expect.stringContaining("behind origin’s") });
  });

  it.skipIf(process.platform === "win32")("names a failed read of the plan at origin's copy of the branch, and compares nothing", async () => {
    const h = await originAheadOfMergedCheckout();
    const originTip = git(h.sandbox, h.repository, "ls-remote", "origin", "refs/heads/feature/customer-returns").split(/\s+/)[0]!;
    failingGit(h, `"ls-tree -r -z -l ${originTip}"*`);
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories[0]!.unknown).toEqual(["the plan on origin’s feature/customer-returns"]);
    expect(view.plans.saved.label).toBe("not_compared");
    expect(view.plans).not.toHaveProperty("branchOnly");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("names a folder git records the branch at that Kiln can't stat, rather than calling it a folder that no longer exists", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    const locked = join(h.sandbox.root, "locked");
    mkdirSync(locked);
    git(h.sandbox, h.repository, "worktree", "add", "-q", join(locked, "scratch"), "feature/customer-returns");
    chmodSync(locked, 0o000);
    try {
      await h.engine.folderGuard({ gather: true });
      const view = buildSnapshot(h.engine).folderMissing!;
      const repository = view.repositories[0]!;
      expect(repository.featureBranch).not.toHaveProperty("recordedAtMissing");
      expect(repository.featureBranch).not.toHaveProperty("elsewhere");
      expect(repository.featureBranch.elsewhereUnknown).toBe(true);
      expect(repository.unknown).toEqual([expect.stringMatching(/^the folder git records feature\/customer-returns at, \S*locked\/scratch \(EACCES/)]);
      // The branch's availability is unknown, so nothing is offered on that wrong reason and no command is shown.
      expect(h.engine.folderMissing!.existingBranch.available).toBe("unknown");
      expect(JSON.stringify(view.panel)).not.toContain("no longer exists");
      expect(view.restoreCommands).toEqual([]);
    } finally { chmodSync(locked, 0o755); }
  });

  it("publishes each repository's own base branch and where it was read", async () => {
    const h = await twoRepositories();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    // returns-api delivers into main, which has a commit develop lacks.
    git(h.sandbox, api.mainCheckoutPath, "push", "-q", "origin", "develop:main");
    (h.engine.record.repositories.find(entry => entry.name === "returns-api")! as { baseBranch: string }).baseBranch = "main";
    rmSync(api.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const view = buildSnapshot(h.engine).folderMissing!;
    expect(view.repositories.map(repository => [repository.name, repository.baseBranch, repository.baseSource])).toEqual([["acme-shop", "develop", "origin"], ["returns-api", "main", "origin"]]);
    expect(view.repositories.flatMap(repository => repository.unknown)).toEqual([]);
  });
});
