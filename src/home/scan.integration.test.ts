// AC-HOME-13's rows that depend on Kiln's own records and on Git alone (Kiln Requirements Stages
// AC-HOME-02 to 05, 12, 13): a real repository, real records, and each run's Kiln as the probe
// reports it. The probe's reading of a live Kiln is `runStateOf`, tested below; its HTTP side is
// the one `kiln status` uses.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runStateOf } from "../control/client.js";
import type { SavedWork } from "../control/private-state.js";
import { defaultSettings } from "../engine/worktree-setup.js";
import { newRequirements } from "../requirements/stages.js";
import { newPrdRecord } from "../state/new-record.js";
import { commitFiles, createBareOrigin, createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { scanRepository } from "./scan.js";
import { inspectSource } from "../requirements/source.js";
import type { PrdRecord } from "../state/records.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

function record(repo: string, path: string, change: (one: PrdRecord) => void): SavedWork {
  const one = newPrdRecord({ mainCheckoutPath: repo, repositoryName: "shop", github: "acme/shop", prdDirectoryFromRoot: path, featureName: path.split("/").at(-1)!, settings: defaultSettings({ mainCheckoutPath: repo, repositoryName: "shop", folderName: path.split("/").at(-1)!, prdDirectoryFromRoot: path }, undefined) });
  change(one);
  return { root: "/state", directory: `/state/${path}`, record: one, canonical: path, observedAt: new Date().toISOString() };
}

it("places recorded runs, material Kiln or a PRD was started from, origin-only material, files in progress and the folded order (AC-HOME-13)", async () => {
  sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "shop");
  const repo = createRepository(sandbox, "shop", origin);
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Committed only on origin's develop: the step left is bringing the local develop up to date (AC-HOME-03).
  commitFiles(sandbox, repo, "source-material/origin-only", { "origin-only-brief.md": "# Brief: Origin only\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~1");
  git(sandbox, repo, "fetch", "-q", "origin");
  // Material Kiln started a PRD from, material with an initiative of its name, and material whose PRD is only on another branch: none listed.
  commitFiles(sandbox, repo, "source-material/boxes", { "boxes-brief.md": "# Brief: Boxes\n" });
  commitFiles(sandbox, repo, "source-material/loyalty", { "loyalty-brief.md": "# Brief: Loyalty\n" });
  commitFiles(sandbox, repo, "docs/initiatives/loyalty", { "loyalty-initiative-prds.md": "# Loyalty Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Points](c.md#points) | None | in production 2026-11-01 |\n| 2 | [Redeem](c.md#redeem) | Points | planned |\n", "c.md": "## Points\n\n**PRD directory, when written:** `docs/prds/points`\n\n## Redeem\n\n**PRD directory, when written:** `docs/prds/redeem`\n" });
  commitFiles(sandbox, repo, "source-material/labels", { "labels-brief.md": "# Brief: Labels\n" });
  git(sandbox, repo, "switch", "-q", "-c", "elsewhere");
  commitFiles(sandbox, repo, "docs/changes/labels", { "labels-prd.md": "# PRD: Labels\n" });
  git(sandbox, repo, "push", "-q", "origin", "elsewhere");
  git(sandbox, repo, "switch", "-q", "develop");
  // A design refinement in progress, committed, puts an otherwise quiet PRD Under way.
  commitFiles(sandbox, repo, "docs/prds/drafted", { "drafted-prd.md": "# PRD: Drafted\n", "drafted-design-refinement-state.md": "round 2\n" });
  // Two quiet PRDs, folded newest change first.
  sandbox.env.GIT_COMMITTER_DATE = "2026-09-14T12:00:00Z";
  commitFiles(sandbox, repo, "docs/changes/older", { "older-prd.md": "# PRD: Older\n" });
  sandbox.env.GIT_COMMITTER_DATE = "2026-11-18T12:00:00Z";
  commitFiles(sandbox, repo, "docs/changes/newer", { "newer-prd.md": "# PRD: Newer\n" });
  delete sandbox.env.GIT_COMMITTER_DATE;
  commitFiles(sandbox, repo, "docs/prds/returns", { "returns-prd.md": "# PRD: Returns\n" });

  const fromSource = record(repo, "source-material/boxes", one => {
    delete one.prdDirectory;
    one.origin = { kind: "brief", path: "source-material/boxes", title: "Boxes", files: [], commit: "a".repeat(40), committedAt: "2026-11-27T00:00:00Z" };
    one.startedAt = "2026-11-27T01:00:00Z";
    one.requirements = { ...newRequirements(), stages: [{ activityId: "s1", key: "kiln:next", task: "stage", expected: { skill: "prd-writing-standards", title: "Write the PRD" }, ran: [], reaches: [], startedAt: "2026-11-27T01:00:00Z" }] };
  });
  const building = record(repo, "docs/prds/returns", one => {
    one.startedAt = "2026-11-26T01:00:00Z";
    one.plan = [{ id: "1", title: "One" }, { id: "2", title: "Two" }] as NonNullable<PrdRecord["plan"]>;
    one.phases = { "1": { sessionIds: [], doneAt: "2026-11-26T02:00:00Z" } } as unknown as PrdRecord["phases"];
  });
  const states = new Map([[fromSource, { state: "waiting_for_you" as const, address: "http://127.0.0.1:4701/boxes", feature: "early_review" }], [building, { state: "unreadable" as const, address: "http://127.0.0.1:4702/returns" }]]);
  const scan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "shop", path: repo }, works: [fromSource, building], probe: async work => states.get(work) ?? { state: "not_running" } });

  expect(scan.sharedBranch).toBe("develop");
  expect(scan.ready.map(item => item.title)).toEqual(["Loyalty: Redeem"]);
  // Its dependency is marked in production, so its build waits for nothing (AC-HOME-02).
  expect(scan.ready[0]!.buildWaitsFor).toBeUndefined();
  expect(scan.notReady.map(item => [item.title, item.line])).toEqual([["Origin only", "Committed on origin's develop only. Bring your local develop up to date and it moves up."]]);
  // Waiting for the person comes first; a run's own line comes from its record, and an unreadable Kiln gives its address (AC-HOME-04, AC-HOME-05).
  expect(scan.underWay[0]!.title).toBe("Boxes");
  // Labels' PRD is only on a branch that hasn't merged, which puts it Under way too.
  expect(scan.underWay.map(item => [item.title, item.state]).sort()).toEqual([["Boxes", "waiting_for_you"], ["Drafted", "not_running"], ["Labels", "not_running"], ["returns", "unreadable"]]);
  expect(scan.underWay.find(item => item.title === "Labels")).toMatchObject({ branch: "elsewhere", path: "docs/changes/labels" });
  expect(scan.underWay[0]).toMatchObject({ path: "source-material/boxes", line: "Requirements. Write the PRD.", waitsForYou: true });
  expect(scan.underWay.find(item => item.title === "returns")!.line).toBe("Build. 1 of 2 phases done. Kiln couldn't read its state. Its Kiln is at http://127.0.0.1:4702/returns.");
  expect(scan.underWay.find(item => item.title === "Drafted")).toMatchObject({ startedByHand: true, line: "Started by hand. PRD written, no technical design yet. Kiln continues from there, with the early review once the PRD is refined." });
  expect(scan.folded.map(item => item.title)).toEqual(["Newer", "Older"]);
  expect(scan.folded[0]!.line).toBe("PRD written, no technical design yet. Last changed Nov 18.");
});

it("places what only origin or another branch holds, uncommitted material, rows without a directory line, records never started or completed, and every repository a PRD changes (AC-HOME-02 to 05, 10, 12, 13)", async () => {
  sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "shop");
  const repo = createRepository(sandbox, "shop", origin);
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Only on origin's develop: a planned PRD, and material brought in with no intake record (AC-HOME-03).
  commitFiles(sandbox, repo, "docs/initiatives/rewards", { "rewards-initiative-prds.md": "# Rewards Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Tiers](c.md#tiers) | None | planned |\n", "c.md": "## Tiers\n\n**PRD directory, when written:** `docs/prds/tiers`\n" });
  commitFiles(sandbox, repo, "source-material/calls/received", { "call.txt": "transcript\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~2");
  // Only on another branch: material brought in with no intake record, and an initiative of a planned PRD's directory name.
  git(sandbox, repo, "switch", "-q", "-c", "intake-work");
  commitFiles(sandbox, repo, "source-material/visits/received", { "visit.txt": "notes\n" });
  commitFiles(sandbox, repo, "docs/initiatives/perks", { "perks-initiative-prds.md": "# Perks Initiative PRDs\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  // A row with no directory line is matched to a written PRD only through Kiln's record, so a PRD of its derived name doesn't hide it.
  commitFiles(sandbox, repo, "docs/initiatives/loyalty", { "loyalty-initiative-prds.md": "# Loyalty Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Gifts](c.md#gifts) | None | planned |\n| 2 | [Perks](c.md#perks) | None | planned |\n| 3 | [Core](c.md#core) | None | planned |\n", "c.md": "## Gifts\n\nNo directory yet.\n\n## Perks\n\n**PRD directory, when written:** `docs/prds/perks`\n\n## Core\n\n**PRD directory, when written:** `docs/prds/loyalty`\n" });
  commitFiles(sandbox, repo, "docs/prds/gifts", { "gifts-prd.md": "# PRD: Gifts by hand\n" });
  // A planned PRD whose initiative folder has changes not yet committed (AC-HOME-03).
  commitFiles(sandbox, repo, "docs/initiatives/shifts", { "shifts-initiative-prds.md": "# Shifts Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Rotas](c.md#rotas) | None | planned |\n", "c.md": "## Rotas\n\n**PRD directory, when written:** `docs/prds/rotas`\n" });
  // A brief committed on develop with changes not yet committed.
  commitFiles(sandbox, repo, "source-material/dirty", { "dirty-brief.md": "# Brief: Dirty\n" });
  // A folder with nothing Kiln starts from is not listed.
  commitFiles(sandbox, repo, "source-material/feedback", { "notes.md": "Notes\n" });
  const closedPhase = "# Phase 1: One\n\n**Closed:** 2026-11-01\n\n## Acceptance criteria covered\nAC-1\n";
  const openPhase = (repositories: string) => `# Phase 1: One\n\n**Repositories:** ${repositories}\n\n## Acceptance criteria covered\nAC-1\n`;
  commitFiles(sandbox, repo, "docs/prds/built", { "built-prd.md": "# PRD: Built\n", "phase-1-one.md": closedPhase });
  commitFiles(sandbox, repo, "docs/prds/split", {
    "split-prd.md": "# PRD: Split\n",
    "phase-1-one.md": "# Phase 1: One\n\n**Repositories:** billing\n\n## Split into\n\n| Phase | Covers |\n|---|---|\n| [1a](phase-1a-first.md) | AC-1 |\n",
    "phase-1a-first.md": "# Phase 1a: First\n\n**Repositories:** shop, payments\n\n## Acceptance criteria covered\nAC-1\n",
  });
  commitFiles(sandbox, repo, "docs/prds/finished", { "finished-prd.md": "# PRD: Finished\n", "phase-1-one.md": openPhase("shop") });
  commitFiles(sandbox, repo, "docs/prds/multi", { "multi-prd.md": "# PRD: Multi\n", "phase-1-one.md": openPhase("warehouse") });
  commitFiles(sandbox, repo, "docs/prds/designing", { "designing-prd.md": "# PRD: Designing\n" });
  // The PRD is on develop; its technical design only on an unmerged branch.
  git(sandbox, repo, "switch", "-q", "-c", "prd/designing");
  commitFiles(sandbox, repo, "docs/prds/designing", { "designing-technical-design.md": "# Technical Design: Designing\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  git(sandbox, repo, "fetch", "-q", "origin");
  writeFileSync(join(repo, "source-material/dirty/dirty-brief.md"), "# Brief: Dirty, edited\n");
  writeFileSync(join(repo, "docs/initiatives/shifts/c.md"), "## Rotas\n\n**PRD directory, when written:** `docs/prds/rota`\n");

  // Records never started place nothing; a completed run's PRD is placed by its files.
  const neverBuilt = record(repo, "docs/prds/built", () => {});
  const neverSplit = record(repo, "docs/prds/split", () => {});
  const finished = record(repo, "docs/prds/finished", one => { one.startedAt = "2026-11-20T00:00:00Z"; one.completedAt = "2026-11-21T00:00:00Z"; });
  const multi = record(repo, "docs/prds/multi", one => { one.startedAt = "2026-11-26T00:00:00Z"; one.plan = [{ id: "1", title: "One" }] as NonNullable<PrdRecord["plan"]>; });
  const drafting = record(repo, "source-material/boxes", one => {
    delete one.prdDirectory;
    one.origin = { kind: "brief", path: "source-material/boxes", title: "Boxes", files: [], commit: "a".repeat(40), committedAt: "2026-11-27T00:00:00Z" };
    one.startedAt = "2026-11-27T01:00:00Z";
    one.requirements = newRequirements();
  });
  const states = new Map([[drafting, { state: "unreadable" as const, address: "http://127.0.0.1:4703/boxes" }]]);
  const scan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "shop", path: repo }, works: [neverBuilt, neverSplit, finished, multi, drafting], probe: async work => states.get(work) ?? { state: "not_running" } });

  // Its own initiative's folder, of its directory's name, doesn't hide a row.
  expect(scan.ready.map(item => item.title).sort()).toEqual(["Loyalty: Core", "Loyalty: Gifts"]);
  const behind = "Committed on origin's develop only. Bring your local develop up to date and it moves up.";
  const received = "Material brought in under received/, and its intake record isn't written yet. When it is, this moves up.";
  expect(scan.notReady.map(item => [item.title, item.line]).sort()).toEqual([
    ["Calls", received],
    ["Dirty", "Changes under source-material/dirty/ aren't committed on develop. Commit them there and it moves up."],
    ["Rewards: Tiers", behind],
    ["Shifts: Rotas", "Changes under docs/initiatives/shifts/ aren't committed on develop. Commit them there and it moves up."],
    ["Visits", "Material brought in under received/, only on intake-work, and its intake record isn't written yet. When it is, this moves up."],
  ]);
  const line = (title: string) => scan.underWay.find(item => item.title === title);
  expect(scan.underWay.map(item => item.title).sort()).toEqual(["Boxes", "Designing", "Finished", "Split", "multi"]);
  expect(line("Split")).toMatchObject({ startedByHand: true, line: "Started by hand. Phase plan of 1, 0 built.", alsoChanges: ["billing", "payments"] });
  expect(line("Finished")).toMatchObject({ line: "Kiln's run finished. Phase plan of 1, 0 built." });
  expect(line("Finished")!.startedByHand).toBeUndefined();
  // A started run names the repositories its phases name before they start (AC-HOME-10).
  expect(line("multi")!.alsoChanges).toEqual(["warehouse"]);
  expect(line("Designing")).toMatchObject({ branch: "prd/designing", startedByHand: true });
  expect(line("Boxes")!.line).toBe("Requirements. Kiln couldn't read its state. Its Kiln is at http://127.0.0.1:4703/boxes.");
  expect(scan.folded.map(item => item.title)).toEqual(["Gifts by hand"]);
});

it("reads nothing from origin's shared branch when the local one is ahead of it (AC-HOME-03)", async () => {
  sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "shop");
  const repo = createRepository(sandbox, "shop", origin);
  commitFiles(sandbox, repo, "source-material/calls/received", { "call.txt": "transcript\n" });
  commitFiles(sandbox, repo, "docs/initiatives/rewards", { "rewards-initiative-prds.md": "# Rewards Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Tiers](c.md#tiers) | None | planned |\n", "c.md": "## Tiers\n\n**PRD directory, when written:** `docs/prds/tiers`\n" });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Removed locally and not pushed yet: pulling would bring nothing back, so neither is listed.
  git(sandbox, repo, "rm", "-rq", "source-material/calls", "docs/initiatives/rewards");
  git(sandbox, repo, "commit", "-qm", "re-cut");
  const scan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "shop", path: repo }, works: [], probe: async () => ({ state: "not_running" }) });
  expect([...scan.underWay, ...scan.ready, ...scan.notReady, ...scan.folded]).toEqual([]);
});

it("puts material a checkout's copy differs from, and everything with no local shared branch, one step from ready (AC-HOME-02, AC-HOME-03)", async () => {
  sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "shop");
  const repo = createRepository(sandbox, "shop", origin);
  commitFiles(sandbox, repo, "source-material/tags", { "tags-brief.md": "# Brief: Tags\n" });
  commitFiles(sandbox, repo, "docs/initiatives/rewards", { "rewards-initiative-prds.md": "# Rewards Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Tiers](c.md#tiers) | None | planned |\n", "c.md": "## Tiers\n\n**PRD directory, when written:** `docs/prds/tiers`\n" });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // The checkout is on a branch whose copy of the brief and of the initiative differs from develop's, with nothing uncommitted.
  git(sandbox, repo, "switch", "-q", "-c", "work");
  commitFiles(sandbox, repo, "source-material/tags", { "tags-brief.md": "# Brief: Tags, edited\n" });
  commitFiles(sandbox, repo, "docs/initiatives/rewards", { "c.md": "## Tiers\n\n**PRD directory, when written:** `docs/prds/tiers`\n\nEdited.\n" });
  const scanOf = () => scanRepository({ git: { git: "git", env: sandbox!.env }, repository: { name: "shop", path: repo }, works: [], probe: async () => ({ state: "not_running" }) });
  const differs = await scanOf();
  expect(differs.ready).toEqual([]);
  expect(differs.notReady.map(item => [item.title, item.line]).sort()).toEqual([
    ["Rewards: Tiers", "The checkout's copy of docs/initiatives/rewards/ differs from develop's. Commit the source material on develop and it moves up."],
    ["Tags", "The checkout's copy of source-material/tags/ differs from develop's. Commit the source material on develop and it moves up."],
  ]);
  // kiln run refuses the same (AC-HOME-02).
  expect(await inspectSource({ git: "git", env: sandbox.env }, repo, "source-material/tags")).toMatchObject({ problem: expect.stringContaining("Commit the source material on develop") });
  // With no local develop at all, only origin's copy holds them.
  git(sandbox, repo, "branch", "-qD", "develop");
  const behind = "Committed on origin's develop only. Bring your local develop up to date and it moves up.";
  const noLocal = await scanOf();
  expect(noLocal.ready).toEqual([]);
  expect(noLocal.notReady.map(item => [item.title, item.line]).sort()).toEqual([["Rewards: Tiers", behind], ["Tags", behind]]);
});

it("with no shared branch known, says why each item with something to start from isn't placed (AC-HOME-04, AC-HOME-13)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  commitFiles(sandbox, repo, "docs/prds/lonely", { "lonely-prd.md": "# PRD: Lonely\n" });
  commitFiles(sandbox, repo, "source-material/boxes", { "boxes-brief.md": "# Brief: Boxes\n" });
  commitFiles(sandbox, repo, "source-material/feedback", { "notes.md": "Notes\n" });
  const scan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "shop", path: repo }, works: [], probe: async () => ({ state: "not_running" }) });
  expect(scan.sharedBranch).toBeUndefined();
  const why = "Kiln can't tell the shared branch. Run git remote set-head origin --auto, and this is placed.";
  expect(scan.notReady.map(item => [item.title, item.line]).sort()).toEqual([["Boxes", why], ["Lonely", why]]);
  expect([...scan.underWay, ...scan.ready, ...scan.folded]).toEqual([]);
});

it("reads a live Kiln's feature state as its home line's state (AC-HOME-05)", () => {
  expect(["implementing", "waiting"].map(runStateOf)).toEqual(["working", "working"]);
  expect(runStateOf("paused")).toBe("paused");
  expect(["needs_you", "early_review", "final_review", "not_started"].map(runStateOf)).toEqual(Array(4).fill("waiting_for_you"));
});
