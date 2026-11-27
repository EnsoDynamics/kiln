// Setting a run up again from the Folder missing page, with real Git: the work a base-branch or
// existing-branch Start would leave behind, and a stopped Start's progress. Shared helpers are in
// src/test-support/folder-setup-fixture.ts.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import type { SetupPanel } from "./folder-setup.js";
import { readPrdRecord } from "../state/records.js";
import { plannedSteps, writeStartIntent } from "./folder-setup-start.js";
import { buildSnapshot } from "./snapshot.js";
import { dropPhaseOne, folderSetupRuns, mergedWithClosed, panelOf, storeCreditWork, text } from "../test-support/folder-setup-fixture.js";
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());
let commands = 0;
const { start, landedThenStopped, twoRepositories, failingGit, phaseOneDoneInApi } = folderSetupRuns({ keep: h => { harness = h; }, nextCommand: () => ++commands });

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
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession(), { actions: [{ write: { path: "src/credit.txt", content: "half done\n" } }, { commit: "wip: store credit" }, { touch: `${releasePath}-reached` }, { waitForFile: releasePath }, { result: "Stopping here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    // The session must be waiting first: removing its folder sooner makes the stand-in's next step fail.
    await waitFor(() => existsSync(`${releasePath}-reached`));
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

describe("panel edits at Start, base-closed work and a stopped Start's progress (Phase 9 of missing worktree recovery: AC-SETUP-03, AC-SAFE-02, AC-SAFE-01)", () => {
  /** Closes the given phases on develop without merging their work. */
  function closeOnBaseOnly(h: Harness, files: string[]): void {
    for (const file of files) {
      const path = join(h.repository, "docs/prds/customer-returns", file);
      const [title, ...rest] = readFileSync(path, "utf8").split("\n");
      writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    }
    git(h.sandbox, h.repository, "commit", "-qam", "Close phases elsewhere");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  }

  it("refuses a Start naming a starting point the panel has since moved away from, and changes nothing", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const base = panelOf(h);
    expect(base.selected).toBe("base");
    // The change's answer carries the revision the page waits for.
    const answer = await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const branch = panelOf(h);
    expect((answer as { panel: SetupPanel }).panel.draftRevision).toBe(branch.draftRevision);
    expect(branch.selected).toBe("branch");
    expect(branch.draftRevision).toBeGreaterThan(base.draftRevision);
    const before = readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    const branches = git(h.sandbox, h.repository, "branch", "--list");
    // The page still showed the base start when Start was pressed.
    expect(await start(h, { start: "base", previewId: base.previewId })).toMatchObject({ ok: false, status: 409, code: "folder_setup_changed" });
    expect(panelOf(h).selected).toBe("branch");
    expect(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).toBe(before);
    expect(git(h.sandbox, h.repository, "branch", "--list")).toBe(branches);
  });

  it("names a completed phase the base plan already closes when its work isn't in the base branch, and never says the base has all the work", async () => {
    const h = await landedThenStopped();
    const sha = h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha!;
    closeOnBaseOnly(h, ["phase-1-return-intake.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.run.map(row => row.id)).not.toContain("1");
    expect(text(panel.preview.caution!)).toBe(`Phase 1 would not run again. The plan on develop already closes it, but its work (${sha.slice(0, 7)}) isn’t in develop; it stays on the earlier feature branch.`);
    expect((panel.choices.base as { line: string; holdsAllWork?: boolean }).line).toMatch(/Missing Phase 1’s work\.$/);
    expect((panel.choices.base as { holdsAllWork?: boolean }).holdsAllWork).toBe(false);
  });

  it("names the phase the run stopped on when the base plan closes it but its commits are only on the feature branch", async () => {
    const h = await landedThenStopped();
    storeCreditWork(h);
    mergedWithClosed(h, ["phase-1-return-intake.md", "phase-2b-store-credit.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(text(panel.preview.caution!)).toBe("Phase 2b would not run again. The plan on develop already closes it, but its work isn’t in develop; it stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phase 2b’s work\.$/);
  });

  it("names no base-closed phase whose work is in the base branch", async () => {
    const h = await landedThenStopped();
    mergedWithClosed(h, ["phase-1-return-intake.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(panel.preview.caution).toBeUndefined();
    expect((panel.choices.base as { line: string }).line).toMatch(/Has all of this run’s work\.$/);
  });

  it("names the repository whose work a base-closed phase leaves behind in a run with several repositories, with no commit of another", async () => {
    const { h } = await phaseOneDoneInApi();
    closeOnBaseOnly(h, ["phase-1-return-intake.md"]);
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const panel = panelOf(h);
    expect(text(panel.preview.caution!)).toBe("Phase 1 would not run again. The plan on develop already closes it, but its work in returns-api isn’t in its base branch; it stays on the earlier feature branch.");
    expect((panel.choices.base as { line: string }).line).toMatch(/Missing Phase 1’s work\.$/);
  });

  it("says a base-closed phase's work was only on the deleted branch when the branch is gone", async () => {
    const h = await landedThenStopped();
    const sha = h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha!;
    closeOnBaseOnly(h, ["phase-1-return-intake.md"]);
    git(h.sandbox, h.repository, "worktree", "remove", "--force", h.engine.worktreePath);
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(text(panelOf(h).preview.caution!)).toBe(`Phase 1 will not run again. The plan on develop already closes it, but its work (${sha.slice(0, 7)}) isn’t in develop; it was only on the deleted branch.`);
  });

  it("names a base-closed phase whose only left-behind work is in a repository the start leaves out once, with that repository", async () => {
    const { h } = await phaseOneDoneInApi();
    const path = join(h.repository, "docs/prds/customer-returns/phase-1-return-intake.md");
    const [title, ...rest] = readFileSync(path, "utf8").replace("\n**Repositories:** returns-api\n", "\n").split("\n");
    writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
    git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 closed in acme-shop alone");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const caution = text(panelOf(h).preview.caution!);
    expect(caution).toBe("Work this run committed in returns-api (Phase 1) isn’t in its base branch; it stays on that repository’s feature branch.");
  });

  it("shows the newest edit's panel when two edits are previewed at once, and a reopened Kiln's panel is newer than any shown before", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await Promise.all([h.engine.changeFolderPanel({ start: "base", fields: {} }), h.engine.changeFolderPanel({ start: "branch", fields: {} })]);
    const shown = panelOf(h);
    expect(shown.selected).toBe("branch");
    h.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    expect((reopened.folderPanel as SetupPanel).draftRevision).toBeGreaterThan(shown.draftRevision);
  });

  /** A base start that made its branch and folder, then failed or was stopped with Kiln at the plan step. */
  async function startThatStopped(h: Harness, state: "failed" | "in_progress") {
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const base = git(h.sandbox, h.repository, "rev-parse", "origin/develop").trim();
    const folder = join(h.sandbox.root, ".worktrees", "customer-returns-2", "acme-shop");
    git(h.sandbox, h.repository, "worktree", "add", "-q", "--no-track", "-b", "feature/customer-returns-2", folder, base);
    const settings = { ...structuredClone(h.engine.record.settings), featureBranch: "feature/customer-returns-2", worktreePath: folder, workspaceFolder: join(h.sandbox.root, ".worktrees", "customer-returns-2") };
    const repositories = [{ name: "acme-shop", kind: "prd" as const, github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", baseCommit: base, branch: "feature/customer-returns-2", worktreePath: folder }];
    const steps = plannedSteps("base", repositories, false);
    steps[0]!.state = "done";
    if (state === "failed") Object.assign(steps[1]!, { state: "failed", error: "The plan couldn’t be read." });
    writeStartIntent(h.stateDirectory, { formatVersion: 1, id: `intent-${state}`, commandId: `start-${state}`, executionId: h.engine.record.executionId!, kind: "base", factsId: "a".repeat(64), previewId: "b".repeat(64), createdAt: new Date().toISOString(), settings, repositories, steps, state, newExecutionId: "new-execution-1" });
  }

  it("says what a failed Start did and what remains after Kiln restarts", async () => {
    const h = await landedThenStopped();
    await startThatStopped(h, "failed");
    h.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    expect(buildSnapshot(reopened).folderMissing!.startProgress).toEqual({ done: ["Create feature/customer-returns-2 and its folder"], remaining: ["Read the plan in the new folder", "Start the fresh execution"], error: "The plan couldn’t be read." });
  });

  it("says why a Start failed outside any step after Kiln restarts", async () => {
    const h = await landedThenStopped();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    // The start fails after its intent is written, outside any step: a simulated failure.
    (h.engine as unknown as { runBaseStart: () => Promise<never> }).runBaseStart = async () => { throw new Error("The earlier Kiln's session couldn’t be stopped."); };
    expect(await start(h)).toMatchObject({ ok: false, status: 500, code: "folder_setup_failed" });
    h.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    expect(buildSnapshot(reopened).folderMissing!.startProgress!.error).toBe("The earlier Kiln's session couldn’t be stopped.");
  });

  it("says what a Start interrupted by stopping Kiln did and what remains, at the next startup", async () => {
    const h = await landedThenStopped();
    await startThatStopped(h, "in_progress");
    h.engine.close();
    const reopened = h.reopen();
    await reopened.folderGuard({ gather: true });
    expect(buildSnapshot(reopened).folderMissing!.startProgress).toEqual({ done: ["Create feature/customer-returns-2 and its folder"], remaining: ["Read the plan in the new folder", "Start the fresh execution"], error: "Start stopped before it finished." });
    // The next Start does only what remains, and the progress goes once it succeeds.
    expect(await start({ ...h, engine: reopened } as Harness)).toEqual({ ok: true, status: 200 });
    await reopened.settled();
    expect(readPrdRecord(h.stateDirectory)!.settings.featureBranch).toBe("feature/customer-returns-2");
    expect(buildSnapshot(reopened).folderMissing).toBeUndefined();
  });
});

describe("an existing-branch start's left-out work across repositories (AC-SAFE-02)", () => {
  it("names the repository whose branch no longer holds a completed phase's work, and says it will run again", async () => {
    const { h } = await phaseOneDoneInApi();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    // Both copies of the branch went back to where Phase 1 started; the recorded commit is only in the object store.
    const start_ = git(h.sandbox, api.mainCheckoutPath, "rev-parse", "develop").trim();
    git(h.sandbox, api.mainCheckoutPath, "update-ref", "refs/heads/feature/customer-returns", start_);
    git(h.sandbox, api.mainCheckoutPath, "push", "-qf", "origin", `${start_}:refs/heads/feature/customer-returns`);
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "branch", fields: {} });
    const panel = panelOf(h);
    expect(panel.selected).toBe("branch");
    expect(text(panel.preview.caution!)).toContain("in returns-api");
    expect((panel.choices.branch as { line: string }).line).toMatch(/Missing Phase 1’s work\.$/);
  });
});
