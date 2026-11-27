// Setting a run up again from the Folder missing page, with real Git: the page's facts, the panel's
// fields, Start's folder handling and git's record of a missing folder. Shared helpers are in
// src/test-support/folder-setup-fixture.ts.
//
// The panel's Model and Effort fields, their effort lists and Model's message are gone: models are chosen per
// activity (Kiln Phase Model Tiers AC-KEEP-01, replacing AC-SETUP-01's model and effort part).
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import type { SetupPanel } from "./folder-setup.js";
import { readPrdRecord } from "../state/records.js";
import { plannedSteps, readStartIntent, writeStartIntent } from "./folder-setup-start.js";
import { buildSnapshot } from "./snapshot.js";
import { CLEAR_LINE, folderSetupRuns, lines, mergedWithClosed, panelOf, removedRecords, shown, text } from "../test-support/folder-setup-fixture.js";
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());
let commands = 0;
const { start, landedThenStopped, twoRepositories, failingGit, loggedThenStopped } = folderSetupRuns({ keep: h => { harness = h; }, nextCommand: () => ++commands });

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

  // The panel's effort-reset notice went with its Model and Effort fields (Kiln Phase Model Tiers AC-KEEP-01).

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

describe("the panel's fields start from the run's saved choices, and edits reach Start (AC-SETUP-01)", () => {
  const non_default = async () => {
    const h = await landedThenStopped();
    Object.assign(h.engine.record.settings, { keepAwake: false, resumeAfterUsageLimit: false });
    return h;
  };

  it("fills keep-awake and resume from the saved settings on either start", async () => {
    const h = await non_default();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    for (const start of ["base", "branch"] as const) {
      await h.engine.changeFolderPanel({ start, fields: {} });
      expect(panelOf(h).fields, start).toMatchObject({ keepAwake: false, resumeAfterUsageLimit: false });
      expect(panelOf(h).fields, start).not.toHaveProperty("model");
    }
  });

  it("gives a base start's folder the new-folder help line, one repository and several", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).helpLines.folder).toBe("New: a folder named for the new branch.");
  });

  it("gives a several-repository base start's workspace folder its new-folder help line", async () => {
    const h = await twoRepositories();
    rmSync(h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(panelOf(h).helpLines.folder).toBe("New: a folder named for the new branch, with a new worktree of each repository.");
  });

  it("saves an edited Resume after a usage limit only when Start succeeds, on either start", async () => {
    for (const kind of ["base", "branch"] as const) {
      const h = await landedThenStopped();
      expect(h.engine.record.settings.resumeAfterUsageLimit).toBe(true);
      rmSync(h.engine.worktreePath, { recursive: true, force: true });
      await h.engine.folderGuard({ gather: true });
      await h.engine.changeFolderPanel({ start: kind, fields: { resumeAfterUsageLimit: false } });
      expect(panelOf(h).fields.resumeAfterUsageLimit).toBe(false);
      expect(readPrdRecord(h.stateDirectory)!.settings.resumeAfterUsageLimit, kind).toBe(true);
      expect(await start(h, { start: kind })).toEqual({ ok: true, status: 200 });
      await h.engine.settled();
      expect(readPrdRecord(h.stateDirectory)!.settings.resumeAfterUsageLimit, kind).toBe(false);
      await harness!.cleanup(); harness = undefined;
    }
  });

  it("starts each repository from the base the panel's Repositories list chose", async () => {
    const h = await twoRepositories();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    const apiCheckout = api.mainCheckoutPath;
    git(h.sandbox, apiCheckout, "checkout", "-q", "-b", "main");
    writeFileSync(join(apiCheckout, "main-only.txt"), "main\n");
    git(h.sandbox, apiCheckout, "add", "main-only.txt");
    git(h.sandbox, apiCheckout, "commit", "-qm", "On main only");
    git(h.sandbox, apiCheckout, "push", "-q", "origin", "main");
    const mainTip = git(h.sandbox, apiCheckout, "rev-parse", "main").trim();
    git(h.sandbox, apiCheckout, "checkout", "-q", "develop");
    rmSync(api.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: { bases: { "returns-api": "main" } } });
    const panel = panelOf(h);
    expect(panel.repositories.find(row => row.name === "returns-api")).toMatchObject({ baseBranch: "main" });
    expect(panel.fields.bases).toEqual({ "returns-api": "main" });
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.repositories.find(entry => entry.name === "returns-api")).toMatchObject({ baseBranch: "main", baseCommit: mainTip });
    expect(record.settings.bases).toEqual({ "returns-api": "main" });
    expect(git(h.sandbox, apiCheckout, "rev-parse", "feature/customer-returns-2").trim()).toBe(mainTip);
  });
});

describe("git's record of a missing folder (AC-SAFE-04)", () => {
  it("clears the saved folder's record when the branch is recorded there and a different folder is chosen", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    const elsewhere = join(h.sandbox.root, "elsewhere", "acme-shop");
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: { worktreePath: elsewhere } });
    expect(lines(panelOf(h))).toContain(`${CLEAR_LINE} ${shown(saved)}`);
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { start: "branch" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(removedRecords(h, calls)).toEqual([`worktree remove ${saved}`]);
    expect(existsSync(join(elsewhere, ".git"))).toBe(true);
    const list = git(h.sandbox, h.repository, "worktree", "list", "--porcelain");
    expect(list).not.toContain("prunable");
    expect(list.split("\n").filter(line => line === "branch refs/heads/feature/customer-returns")).toHaveLength(1);
  });

  it("never clears the record of a folder that exists, though git marks it prunable", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    mkdirSync(saved, { recursive: true });
    writeFileSync(join(saved, "notes.txt"), "someone else's\n");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain("prunable");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h)).filter(line => line.startsWith(CLEAR_LINE))).toEqual([]);
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(removedRecords(h, calls)).toEqual([]);
    expect(readFileSync(join(saved, "notes.txt"), "utf8")).toBe("someone else's\n");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain(`worktree ${saved}`);
  });

  it("refuses to clear the record when the folder appears after the page was checked, removing nothing", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    // The folder comes back between Start's recheck and its first Git write.
    const internal = h.engine as unknown as { leftOverSession: () => Promise<undefined> };
    internal.leftOverSession = async () => {
      if (readStartIntent(h.stateDirectory, "stale-no-more") && !existsSync(saved)) { mkdirSync(saved, { recursive: true }); writeFileSync(join(saved, "back.txt"), "back\n"); }
      return undefined;
    };
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { commandId: "stale-no-more" })).toMatchObject({ ok: false, status: 500, code: "folder_setup_failed", reason: expect.stringContaining("is no longer stale. Nothing was removed; press Check again.") });
    expect(removedRecords(h, calls)).toEqual([]);
    expect(readFileSync(join(saved, "back.txt"), "utf8")).toBe("back\n");
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain(`worktree ${saved}`);
  });

  it("leaves a record git doesn't report as stale, as a locked worktree's, though its folder is gone", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    git(h.sandbox, h.repository, "worktree", "lock", saved);
    rmSync(saved, { recursive: true, force: true });
    const listed = git(h.sandbox, h.repository, "worktree", "list", "--porcelain");
    expect(listed).toContain("locked");
    expect(listed).not.toContain("prunable");
    await h.engine.folderGuard({ gather: true });
    for (const kind of ["branch", "base"] as const) {
      await h.engine.changeFolderPanel({ start: kind, fields: {} });
      expect(lines(panelOf(h)).filter(line => line.startsWith(CLEAR_LINE)), kind).toEqual([]);
    }
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(removedRecords(h, calls)).toEqual([]);
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain(`worktree ${saved}`);
  });

  it("clears only the saved folder's record, leaving another stale record alone", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    const other = join(h.sandbox.root, "other-stale");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "-b", "other-work", other, "develop");
    rmSync(other, { recursive: true, force: true });
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const calls = h.kilnGitCalls().length;
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(removedRecords(h, calls)).toEqual([`worktree remove ${saved}`]);
    const list = git(h.sandbox, h.repository, "worktree", "list", "--porcelain");
    expect(list).toContain(`worktree ${other}`);
    expect(list).toContain("prunable");
    expect(list.split("\n").filter(line => line === "branch refs/heads/feature/customer-returns")).toHaveLength(1);
  });

  it("neither clears nor lists a record that wouldn't stop Start", async () => {
    const h = await loggedThenStopped();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h)).filter(line => line.startsWith(CLEAR_LINE))).toEqual([]);
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(removedRecords(h, calls)).toEqual([]);
    expect(git(h.sandbox, h.repository, "worktree", "list", "--porcelain")).toContain(`worktree ${saved}`);
  });
});
