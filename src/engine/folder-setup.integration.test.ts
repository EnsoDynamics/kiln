// Setting a run up again from the Folder missing page (missing worktree recovery, Phase 2), with
// real Git: the panel's starting points and defaults, and Start from the base branch (a fresh
// execution on a new suffixed branch and folder) or from the run's existing feature branch (the
// missing worktree re-created, git's stale record cleared, the same execution resumed).

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import type { SetupPanel } from "./folder-setup.js";
import { readPrdRecord } from "../state/records.js";
import { readExecution } from "./continuation-state.js";
import { readStartIntent, writeStartIntent } from "./folder-setup-start.js";
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
    expect((panel.choices.branch as { line: string }).line).toMatch(/^Re-creates returns-api’s worktree in the saved workspace and keeps acme-shop’s · 4 phases, 1 done\.$/);
    expect((panel.choices.base as { line: string }).line).toMatch(/^A new workspace and branch in both repositories, from origin\/develop · 4 phases, 1 done\./);
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
