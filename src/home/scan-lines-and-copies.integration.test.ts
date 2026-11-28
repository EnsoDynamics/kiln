// The home screen's lines and the branch copies it and the start checks read (Kiln Requirements
// Stages AC-HOME-02 to 04, 10, 13; AC-BEGIN-03, 04, 08): a Kiln run's stage between and inside
// sessions, a round part-way through, the others a PRD changes each once, an intake record not on
// the shared branch, and a PRD only origin's copy of a branch holds. Real repositories and records.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { SavedWork } from "../control/private-state.js";
import { defaultSettings } from "../engine/worktree-setup.js";
import { newRequirements, type RequirementsState } from "../requirements/stages.js";
import { newPrdRecord } from "../state/new-record.js";
import { commitFiles, createBareOrigin, createGithubOrigin, createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { scanRepository } from "./scan.js";
import { inspectSource, inspectStartedPrd } from "../requirements/source.js";
import { branchesHolding } from "../requirements/branches.js";
import type { PrdRecord } from "../state/records.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

function record(repo: string, path: string, change: (one: PrdRecord) => void): SavedWork {
  const folder = path.split("/").at(-1)!;
  const one = newPrdRecord({ mainCheckoutPath: repo, repositoryName: "shop", github: "acme/shop", prdDirectoryFromRoot: path, featureName: folder, settings: defaultSettings({ mainCheckoutPath: repo, repositoryName: "shop", folderName: folder, prdDirectoryFromRoot: path }, undefined) });
  change(one);
  return { root: "/state", directory: `/state/${path}`, record: one, canonical: path, observedAt: new Date().toISOString() };
}

const scanOf = (repo: string, works: SavedWork[]) => scanRepository({ git: { git: "git", env: sandbox!.env }, repository: { name: "shop", path: repo }, works, probe: async () => ({ state: "not_running" }) });
const at = "2026-11-27T01:00:00Z";
const requirements = (change: Partial<RequirementsState>): RequirementsState => ({ ...newRequirements(), ...change });

it("says the stage a Kiln run reached between stages, while feedback runs, while the standing is unknown and before its first session (AC-HOME-04)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  for (const name of ["between", "feedback", "finding", "paused"]) commitFiles(sandbox, repo, `docs/prds/${name}`, { [`${name}-prd.md`]: `# PRD: ${name}\n` });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  const run = (name: string, state: RequirementsState) => record(repo, `docs/prds/${name}`, one => { one.startedAt = at; one.requirements = state; });
  const scan = await scanOf(repo, [
    run("between", requirements({ stages: [{ activityId: "a1", key: "prd-writing-standards#1", task: "stage", expected: { skill: "prd-writing-standards", title: "Write the PRD" }, ran: [{ skill: "prd-writing-standards", title: "Write the PRD" }], reaches: [], pushedSha: "b".repeat(40), startedAt: at }], standing: { milestones: [], next: { skill: "autonomous-prd-refinement", title: "Refine the PRD", kind: "requirements", reaches: [] }, at } })),
    run("feedback", requirements({ stages: [{ activityId: "a2", key: "feedback#1", task: "feedback", ran: [], reaches: [], startedAt: at }] })),
    run("finding", requirements({ standsAt: "PRD written, no technical design yet", standing: { unknown: true, at }, stages: [{ activityId: "a3", key: "kiln:next", task: "stage", ran: [], reaches: [], startedAt: at }] })),
    run("paused", requirements({ standsAt: "Technical design written, no phase plan" })),
  ]);
  const line = (name: string) => scan.underWay.find(item => item.path === `docs/prds/${name}`)?.line;
  expect(line("between")).toBe("Requirements. Last finished: Write the PRD. Next: Refine the PRD.");
  expect(line("feedback")).toBe("Requirements. Applying stakeholder feedback.");
  expect(line("finding")).toBe("Requirements. PRD written, no technical design yet; the first session finds the next stage.");
  expect(line("paused")).toBe("Requirements. Technical design written, no phase plan.");
});

it("names the refinement or feedback round part-way through, and says its uncommitted work must finish first (AC-HOME-04, AC-BEGIN-04)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  commitFiles(sandbox, repo, "docs/prds/designing", { "designing-prd.md": "# PRD: Designing\n", "designing-technical-design.md": "# TD\n", "designing-design-refinement-state.md": "checkpoint 1\n" });
  commitFiles(sandbox, repo, "docs/prds/answers", { "answers-prd.md": "# PRD: Answers\n", "answers-pending-feedback-changes.md": "1. Rename\n" });
  commitFiles(sandbox, repo, "docs/prds/refining", { "refining-prd.md": "# PRD: Refining\n" });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // The PRD refinement's state file is never committed while it runs: `kiln run` refuses the start.
  writeFileSync(join(repo, "docs/prds/refining/refining-prd-refinement-state.md"), "round 2\n");
  const scan = await scanOf(repo, []);
  const line = (title: string) => scan.underWay.find(item => item.title === title)?.line;
  expect(line("Designing")).toBe("Started by hand. Technical design written, no phase plan, with the design refinement part-way through. Kiln continues from there.");
  expect(line("Answers")).toBe("Started by hand. PRD written, no technical design yet, with stakeholder feedback part-way through being applied. Kiln continues from there, with the early review once the PRD is refined.");
  expect(line("Refining")).toBe("Started by hand. PRD written, no technical design yet, with the PRD refinement part-way through. Its work isn't committed: finish that round or stop it, and Kiln continues from there.");
});

it("names only the other repositories a PRD changes, each once, however its phases write them (AC-HOME-10)", async () => {
  sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "shop");
  const repo = createRepository(sandbox, "shop", origin.url);
  const phase = (repositories: string) => `# Phase 1: One\n\n**Repositories:** ${repositories}\n\n## Acceptance criteria covered\nAC-1\n`;
  commitFiles(sandbox, repo, "docs/prds/by-hand", { "by-hand-prd.md": "# PRD: By hand\n", "phase-1-one.md": phase("Acme/Shop, acme/warehouse"), "phase-2-two.md": phase("Acme/Warehouse").replace("Phase 1", "Phase 2") });
  commitFiles(sandbox, repo, "docs/prds/started", { "started-prd.md": "# PRD: Started\n", "phase-1-one.md": phase("acme/shop, acme/warehouse, billing") });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  const started = record(repo, "docs/prds/started", one => {
    one.startedAt = at;
    one.plan = [{ id: "1", title: "One" }] as NonNullable<PrdRecord["plan"]>;
    one.repositories.push({ name: "warehouse", kind: "named", mainCheckoutPath: join(sandbox!.root, "warehouse"), github: "acme/warehouse", baseBranch: "develop", worktreePath: join(sandbox!.root, "wt", "warehouse") } as PrdRecord["repositories"][number]);
  });
  const scan = await scanOf(repo, [started]);
  const changes = (path: string) => scan.underWay.find(item => item.path === path)?.alsoChanges;
  expect(changes("docs/prds/by-hand")).toEqual(["acme/warehouse"]);
  expect(changes("docs/prds/started")).toEqual(["warehouse", "billing"]);

  // With no shared branch known, the Not ready yet line still names the others.
  const lone = createRepository(sandbox, "lone", createGithubOrigin(sandbox, "acme", "lone").url);
  commitFiles(sandbox, lone, "docs/prds/far", { "far-prd.md": "# PRD: Far\n", "phase-1-one.md": phase("acme/lone, billing") });
  const loneScan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "lone", path: lone }, works: [], probe: async () => ({ state: "not_running" }) });
  expect(loneScan.notReady.find(item => item.title === "Far")?.alsoChanges).toEqual(["billing"]);
});

it("judges an intake record on the shared branch's copy, naming the commit or bring-up-to-date step on the home screen and in kiln run (AC-HOME-02, 03, 13; AC-BEGIN-03)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  for (const name of ["calls", "visits", "talks"]) {
    commitFiles(sandbox, repo, `source-material/${name}`, { [`${name}-brief.md`]: `# Brief: ${name}\n` });
    commitFiles(sandbox, repo, `source-material/${name}/received`, { "notes.txt": "notes\n" });
  }
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Talks' record is committed only on origin's develop.
  commitFiles(sandbox, repo, "source-material/talks", { "talks-requirements-intake.md": "# Requirements intake: Talks\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~1");
  git(sandbox, repo, "fetch", "-q", "origin");
  // Visits' record only on another branch; Calls' record written in the checkout, not committed.
  git(sandbox, repo, "switch", "-q", "-c", "intake-work");
  commitFiles(sandbox, repo, "source-material/visits", { "visits-requirements-intake.md": "# Requirements intake: Visits\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  writeFileSync(join(repo, "source-material/calls/calls-requirements-intake.md"), "# Requirements intake: Calls\n");

  const scan = await scanOf(repo, []);
  expect(scan.ready).toEqual([]);
  expect(Object.fromEntries(scan.notReady.map(item => [item.path, item.line]))).toEqual({
    "source-material/calls": "Its intake record isn't committed on develop. Commit source-material/calls/calls-requirements-intake.md there and it moves up.",
    "source-material/visits": "Its intake record isn't committed on develop, only on intake-work. Commit source-material/visits/visits-requirements-intake.md there and it moves up.",
    "source-material/talks": "Its intake record is committed on origin's develop only. Bring your local develop up to date and it moves up.",
  });
  const problem = async (path: string) => { const read = await inspectSource({ git: "git", env: sandbox!.env }, repo, path); return "problem" in read ? read.problem : undefined; };
  expect(await problem("source-material/calls")).toBe("source-material/calls/calls-requirements-intake.md isn't committed on develop. Commit it on develop.");
  expect(await problem("source-material/visits")).toBe("source-material/visits/visits-requirements-intake.md isn't committed on develop, only on intake-work. Commit it on develop.");
  expect(await problem("source-material/talks")).toBe("source-material/talks/talks-requirements-intake.md is committed only on origin's develop. Bring the local shared branch develop up to date.");
});

it("lists and opens a PRD from origin's copy of a branch when the local copy is stale (AC-HOME-13, AC-HOME-04, AC-BEGIN-08)", async () => {
  sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "shop");
  const repo = createRepository(sandbox, "shop", origin.url);
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Pushed from another computer: origin's prd/returns holds the PRD, the local prd/returns is still at develop.
  git(sandbox, repo, "switch", "-q", "-c", "prd/returns");
  commitFiles(sandbox, repo, "docs/prds/returns", { "returns-prd.md": "# PRD: Returns\n" });
  git(sandbox, repo, "push", "-q", "-u", "origin", "prd/returns");
  git(sandbox, repo, "switch", "-q", "develop");
  git(sandbox, repo, "branch", "-q", "-f", "prd/returns", "develop");
  const remoteTip = git(sandbox, repo, "rev-parse", "refs/remotes/origin/prd/returns").trim();

  const scan = await scanOf(repo, []);
  expect(scan.underWay.find(item => item.path === "docs/prds/returns")).toMatchObject({ title: "Returns", branch: "prd/returns", startedByHand: true });
  const context = { git: "git", env: sandbox.env };
  expect(await branchesHolding(context, repo, "docs/prds/returns", "develop")).toMatchObject([{ name: "prd/returns", ref: "refs/remotes/origin/prd/returns", tip: remoteTip }]);
  const opened = await inspectStartedPrd(context, repo, repo, "docs/prds/returns");
  expect(opened).toMatchObject({ origin: { kind: "prd", title: "Returns", commit: remoteTip }, branch: { name: "prd/returns" } });
});

it("names the commit step for an intake record written only in another worktree, on the home screen and in kiln run alike (AC-HOME-03, AC-BEGIN-03)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  commitFiles(sandbox, repo, "source-material/calls", { "calls-brief.md": "# Brief: Calls\n" });
  commitFiles(sandbox, repo, "source-material/calls/received", { "notes.txt": "notes\n" });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  const other = join(sandbox.root, "shop-intake");
  git(sandbox, repo, "worktree", "add", "-q", "-b", "intake", other);
  const record = "source-material/calls/calls-requirements-intake.md";
  writeFileSync(join(other, record), "# Requirements intake: Calls\n");
  const scan = await scanOf(repo, []);
  expect(scan.notReady.find(item => item.path === "source-material/calls")?.line).toBe(`Its intake record isn't committed on develop. Commit ${record} there and it moves up.`);
  const read = await inspectSource({ git: "git", env: sandbox.env }, repo, "source-material/calls");
  expect(read).toEqual({ problem: `${record} isn't committed on develop. Commit it on develop.` });
});

it("names the round whose work isn't committed when another round's file is committed beside it (AC-HOME-04)", async () => {
  sandbox = createSandbox();
  const repo = createRepository(sandbox, "shop", createBareOrigin(sandbox, "shop"));
  commitFiles(sandbox, repo, "docs/prds/both", { "both-prd.md": "# PRD: Both\n", "both-design-refinement-state.md": "checkpoint 1\n" });
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  writeFileSync(join(repo, "docs/prds/both/both-pending-feedback-changes.md"), "1. Rename\n");
  const scan = await scanOf(repo, []);
  expect(scan.underWay.find(item => item.title === "Both")?.line).toBe("Started by hand. PRD written, no technical design yet, with stakeholder feedback part-way through being applied. Its work isn't committed: finish that round or stop it, and Kiln continues from there.");
});
