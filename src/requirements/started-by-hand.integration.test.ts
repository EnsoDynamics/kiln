// A PRD started by hand (Kiln Requirements Stages AC-BEGIN-04, AC-BEGIN-08): `kiln run` on a PRD
// directory with no phase documents shows where it stands, preselects the unmerged branch that
// holds it, continues there from where it stands, and refuses while a method run is part-way through.

import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runKilnCommand } from "../kiln-command.js";
import type { Snapshot } from "../engine/snapshot.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { PRD } from "../test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { branchesHolding, documentsStand, partWayProblems } from "./branches.js";
import { prdStateDirectory, stateRoot } from "../state/state-files.js";

let h: Harness | undefined;
let sandbox: Sandbox | undefined;
let ports = "";
beforeEach(async () => { ports = await reservePortRange(); });
afterEach(async () => { await h?.cleanup(); h = undefined; await sandbox?.cleanup(); sandbox = undefined; });

const dir = "docs/prds/customer-returns";
const prdFile = `${dir}/customer-returns-prd.md`;
const report = (ran: string, next: string, milestones: string[]) => ({ result: "```kiln-report\n" + JSON.stringify({
  kilnReport: 1, ran: ran ? [{ skill: ran, title: ran }] : [], finished: true,
  next: { kind: "requirements", skill: next, title: next, reaches: [] }, milestones: milestones.map(name => ({ name, by: "earlier" })), prdDirectory: dir,
}) + "\n```" });

function kilnEnv(harness: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(harness.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(harness.sandbox.root, "bin"), harness.env.PATH ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
}

/** An origin on GitHub, as the start checks require, holding everything the harness pushed. */
function hostOnGithub(harness: Harness): string {
  const hosted = createGithubOrigin(harness.sandbox, "acme", "acme-shop");
  git(harness.sandbox, harness.origin, "push", "-q", "--mirror", hosted.bare);
  git(harness.sandbox, harness.repository, "remote", "set-url", "origin", hosted.url);
  harness.env.GIT_SSH_COMMAND = harness.sandbox.env.GIT_SSH_COMMAND;
  return hosted.bare;
}

function installMethod(harness: Harness): void {
  const skill = join(harness.sandbox.root, "claude-config", "skills", "using-the-enso-method");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: using-the-enso-method\n---\n# Test method\n");
}

/** `kiln run <args>` until `until` holds for its output, then `whileRunning` against its page, then Ctrl+C. */
async function kilnRun(harness: Harness, args: string[], whileRunning?: (page: { snapshot(): Promise<Snapshot>; post(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> }) => Promise<void>) {
  let out = "";
  let address = "";
  const signals = new EventEmitter();
  const done = runKilnCommand(["run", ...args], {
    cwd: harness.repository, env: kilnEnv(harness), signals,
    stdout: { write: (text: string) => (out += text) }, stderr: { write: (text: string) => (out += text) },
    openBrowser: async (url) => { address = url; return { kind: "opened" as const }; },
  });
  let code: number | undefined;
  void done.then(c => (code = c));
  try {
    await waitFor(() => !!address || code !== undefined, 40_000);
    if (address && whileRunning) {
      const origin = new URL(address).origin;
      const token = JSON.parse(await (await import("node:fs/promises")).readFile(join(prdStateDirectory(stateRoot(harness.env), harness.repository, "acme-shop", args[0]!), "prd.json"), "utf8")).token as string;
      // An open page: its event stream runs the field checks and reads Start from, as the browser's does.
      const stream = new AbortController();
      void fetch(`${origin}/api/events?token=${token}`, { signal: stream.signal }).then(response => response.body?.cancel()).catch(() => undefined);
      try { await whileRunning({
        snapshot: async () => (await (await fetch(`${origin}/api/snapshot`, { headers: { "X-Kiln-Token": token } })).json()) as Snapshot,
        post: async (path, body = {}) => {
          const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
          return { status: response.status, body: (await response.json()) as Record<string, unknown> };
        },
      }); } finally { stream.abort(); }
    }
  } finally {
    if (code === undefined) signals.emit("SIGINT");
    code = await done;
  }
  return { code, out, address };
}

it("shows where a PRD started by hand stands, selects the unmerged branch holding it, and continues there from where it stands (AC-BEGIN-04, AC-BEGIN-08)", async () => {
  h = await createHarness({ files: { "customer-returns-prd.md": PRD }, sessions: [
    // The first session finds the PRD written and runs its refinement; Kiln then holds at the early review.
    { actions: [{ write: { path: prdFile, content: PRD + "\nRefined.\n" } }, { commit: "refine the PRD" }, report("autonomous-prd-refinement", "technical-design-writing-standards", ["prd_refined"]), { exit: 0 }] },
    { actions: [{ write: { path: `${dir}/customer-returns-stakeholder-review.html`, content: "<h1>Review</h1>" } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Review" }], finished: true }) + "\n```" }, { exit: 0 }] },
  ] });
  installMethod(h);
  const bare = hostOnGithub(h);
  // The method made prd/customer-returns for the PRD and amended it there, unmerged.
  git(h.sandbox, h.repository, "switch", "-q", "-c", "prd/customer-returns");
  writeFileSync(join(h.repository, prdFile), PRD + "\nAmended by hand.\n");
  git(h.sandbox, h.repository, "commit", "-qam", "amend the PRD");
  git(h.sandbox, h.repository, "push", "-q", "-u", "origin", "prd/customer-returns");
  git(h.sandbox, h.repository, "switch", "-q", "develop");

  const { out } = await kilnRun(h, [dir], async (page) => {
    await waitFor(async () => (await page.snapshot()).requirements?.start !== undefined);
    const before = await page.snapshot();
    expect(before.feature.state).toBe("not_started");
    expect(before.requirements?.standsAt).toBe("PRD written, no technical design yet");
    expect(before.requirements?.origin).toMatchObject({ kind: "prd", path: dir });
    expect(before.requirements?.start).toMatchObject({ from: "existing", holds: "prd/customer-returns" });
    expect(before.settings.featureBranch).toBe("prd/customer-returns");
    // No plan yet: the first session runs as the Next stage row.
    expect(before.requirements?.rows[0]).toMatchObject({ key: "kiln:next", state: "next" });
    await waitFor(async () => (await page.snapshot()).settings.baseCheck === "ok", 20_000);
    const started = await page.post("/api/start", { previewId: (await page.snapshot()).requirements!.start!.previewId });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    await waitFor(async () => (await page.snapshot()).feature.state === "early_review", 30_000);
  });
  expect(out).toContain("started by hand: PRD written, no technical design yet, on prd/customer-returns");
  const calls = h.claudeCalls();
  expect(calls).toHaveLength(2);
  // The first session was pointed at the PRD directory and finds where it stands; it ran in the branch's worktree.
  expect(calls[0]!.prompt).toContain(dir);
  expect(git(h.sandbox, calls[0]!.cwd, "branch", "--show-current").trim()).toBe("prd/customer-returns");
  // Kiln added its commits to the person's branch and pushed them, never rewriting it.
  const tip = git(h.sandbox, calls[0]!.cwd, "rev-parse", "HEAD").trim();
  expect(git(h.sandbox, bare, "rev-parse", "prd/customer-returns").trim()).toBe(tip);
  expect(git(h.sandbox, calls[0]!.cwd, "log", "--format=%s", "-3").trim().split("\n")).toEqual(["review", "refine the PRD", "amend the PRD"]);
});

it("names the method run part-way through instead of the uncommitted files, and opens nothing (AC-BEGIN-04)", async () => {
  h = await createHarness({ files: { "customer-returns-prd.md": PRD }, sessions: [] });
  writeFileSync(join(h.repository, dir, "customer-returns-prd-refinement-state.md"), "round 2\n");
  const { code, out, address } = await kilnRun(h, [dir]);
  expect(code).toBe(1);
  expect(address).toBe("");
  expect(out).toContain(`The PRD refinement is part-way through in ${h.repository} with its work not committed`);
  expect(out).not.toContain("uncommitted changes");
});

it("starts a PRD that is only on a branch from that branch, and asks for --branch when several hold it (AC-BEGIN-08)", async () => {
  h = await createHarness({ files: { "customer-returns-prd.md": PRD }, sessions: [] });
  hostOnGithub(h);
  for (const branch of ["prd/gift-cards", "feature/gift-cards-spike"]) {
    git(h.sandbox, h.repository, "switch", "-q", "-c", branch, "develop");
    commitFiles(h.sandbox, h.repository, "docs/changes/gift-cards", { "gift-cards-prd.md": `# PRD: Gift cards\n\n${branch}\n` });
    git(h.sandbox, h.repository, "push", "-q", "-u", "origin", branch);
  }
  git(h.sandbox, h.repository, "switch", "-q", "develop");
  const several = await kilnRun(h, ["docs/changes/gift-cards"]);
  expect(several.code).toBe(1);
  expect(several.out).toContain("docs/changes/gift-cards is on several branches: ");
  expect(several.out).toContain("--branch");
  const picked = await kilnRun(h, ["docs/changes/gift-cards", "--branch", "feature/gift-cards-spike"], async (page) => {
    await waitFor(async () => (await page.snapshot()).requirements?.start !== undefined);
    const snapshot = await page.snapshot();
    expect(snapshot.requirements).toMatchObject({ standsAt: "PRD written, no technical design yet", origin: { kind: "prd", title: "Gift cards" }, start: { from: "existing", holds: "feature/gift-cards-spike" } });
    expect(snapshot.settings.featureBranch).toBe("feature/gift-cards-spike");
  });
  expect(picked.address).toMatch(/\/gift-cards$/);
  // A branch that holds the PRD with its phase plan is a build: Kiln adds no requirements stage, and says how to build it (AC-BEGIN-05).
  git(h.sandbox, h.repository, "switch", "-q", "feature/gift-cards-spike");
  commitFiles(h.sandbox, h.repository, "docs/changes/gift-cards", { "phase-1-balance.md": "# Phase 1: Balance\n" });
  git(h.sandbox, h.repository, "push", "-q", "origin", "feature/gift-cards-spike");
  git(h.sandbox, h.repository, "switch", "-q", "develop");
  const planned = await kilnRun(h, ["docs/changes/gift-cards", "--branch", "feature/gift-cards-spike"]);
  expect(planned.code).toBe(1);
  expect(planned.out).toContain("docs/changes/gift-cards has its phase plan on feature/gift-cards-spike, which this checkout doesn't hold.");
});

it("tests which branches hold a PRD directory: unmerged, not squash-merged, never another PRD's prd/ branch (technical design, a branch holds a PRD directory)", async () => {
  sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "shop");
  const repo = createRepository(sandbox, "shop", origin.url);
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  const read = () => branchesHolding({ git: "git", env: sandbox!.env }, repo, "docs/prds/returns", "develop").then(list => list.map(one => one.name));
  const branch = (name: string, content: string) => {
    git(sandbox!, repo, "switch", "-q", "-c", name, "develop");
    commitFiles(sandbox!, repo, "docs/prds/returns", { "returns-prd.md": content });
    git(sandbox!, repo, "switch", "-q", "develop");
  };
  branch("prd/returns", "# PRD: Returns\n");
  branch("prd/other", "# PRD: Returns elsewhere\n");
  branch("squashed", "# PRD: Returns, squashed\n");
  expect((await read()).sort()).toEqual(["prd/returns", "squashed"]);
  // A squash merge brings the same content onto develop: that branch no longer holds it, the others still do.
  commitFiles(sandbox, repo, "docs/prds/returns", { "returns-prd.md": "# PRD: Returns, squashed\n" });
  expect(await read()).toEqual(["prd/returns"]);
  // A branch known only as origin's copy is tested as last fetched; the local copy wins when both exist.
  git(sandbox, repo, "push", "-q", "origin", "prd/returns");
  git(sandbox, repo, "branch", "-q", "-D", "prd/returns");
  git(sandbox, repo, "fetch", "-q", "origin");
  expect(await read()).toEqual(["prd/returns"]);
  expect(documentsStand(["returns-prd.md", "technical-design.md"], "returns")).toBe("Technical design written, no phase plan");
});

it("names a design refinement or feedback round part-way through only while its file is untracked or modified, in any worktree (AC-BEGIN-04)", async () => {
  sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "shop");
  const repo = createRepository(sandbox, "shop", origin.url);
  const directory = "docs/prds/returns";
  commitFiles(sandbox, repo, directory, { "returns-prd.md": "# PRD: Returns\n", "returns-design-refinement-state.md": "checkpoint 1\n" });
  const context = { git: "git", env: sandbox.env };
  // Committed with no change since: the first session resumes it as the method directs, so nothing stops the start.
  expect(await partWayProblems(context, repo, directory)).toEqual([]);
  writeFileSync(join(repo, directory, "returns-design-refinement-state.md"), "checkpoint 2\n");
  expect(await partWayProblems(context, repo, directory)).toEqual([`The design refinement has work since its last checkpoint in ${repo}. Resume it there to its next checkpoint or its end. Then start again.`]);
  git(sandbox, repo, "checkout", "-q", "--", directory);
  // A feedback round in another worktree of the repository.
  const other = join(sandbox.root, "shop-feedback");
  git(sandbox, repo, "worktree", "add", "-q", "-b", "prd/returns", other);
  writeFileSync(join(other, directory, "returns-pending-feedback-changes.md"), "1. Rename the screen\n");
  expect(await partWayProblems(context, repo, directory)).toEqual([`Stakeholder feedback is part-way through being applied in ${other}. Finish that round there and commit it. Then start again.`]);
});
