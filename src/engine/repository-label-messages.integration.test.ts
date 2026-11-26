// Messages that name a repository use its label, not Kiln's name for it (find repositories
// anywhere AC-FOLDER-02, Phase 5): `acme-labs+admin` is shown as `acme-labs/admin` in the worktree
// setup, catch-up, phase-work and existing-branch messages. Real Git in a temporary sandbox.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import type { RepositoryEntry } from "../state/records.js";
import { addEntryWorktree, checkWorkspaceFolderPlacement, halfMadeMessage } from "./worktree-setup.js";
import { catchUpRepository, classifyBranch, readCatchUp } from "./start-from.js";
import { readPhaseWork } from "./stopped-phase.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

const NAME = "acme-labs+admin";
const LABEL = "acme-labs/admin";

function setUp() {
  sandbox = createSandbox();
  const main = createRepository(sandbox, "labs/admin");
  const head = git(sandbox, main, "rev-parse", "HEAD").trim();
  const entry: RepositoryEntry = { name: NAME, kind: "named", mainCheckoutPath: main, github: LABEL, baseBranch: "develop", worktreePath: join(sandbox.root, "workspace", NAME) };
  return { sandbox, main, head, entry, gitContext: { git: "git", env: sandbox.env } };
}

it("names the repository by its label in the worktree setup messages", async () => {
  const { sandbox, main, head, entry, gitContext } = setUp();
  const inside = join(main, "nested");
  mkdirSync(inside);
  expect(await checkWorkspaceFolderPlacement(gitContext, [{ name: NAME, label: LABEL, mainCheckoutPath: main }], inside)).toBe(`That folder is inside a checkout of ${LABEL}. Choose one outside it.`);
  expect(halfMadeMessage(entry, "then ask again.", LABEL)).toMatch(new RegExp(`^${LABEL}’s worktree at `));
  // The feature branch exists there and isn't the one Kiln made from the recorded commit.
  git(sandbox, main, "branch", "feature/x");
  git(sandbox, main, "commit", "-q", "--allow-empty", "-m", "later");
  const later = git(sandbox, main, "rev-parse", "HEAD").trim();
  expect(later).not.toBe(head);
  expect(await addEntryWorktree(gitContext, { ...entry, baseCommit: later }, "feature/x", "then ask again.", false, LABEL)).toEqual({ ok: false, error: `feature/x already exists in ${LABEL} and isn't the branch Kiln made.` });
});

it("names the repository by its label in the catch-up and phase-work messages", async () => {
  const { head, entry, gitContext } = setUp();
  await expect(catchUpRepository(gitContext, entry, "feature/none", head, { save: () => undefined, record: () => undefined, label: LABEL })).rejects.toThrow(`${LABEL} has no local feature/none.`);
  // No origin to read.
  await expect(readCatchUp(gitContext, { name: NAME, label: LABEL, mainCheckoutPath: entry.mainCheckoutPath, baseBranch: "develop" }, "feature/x")).rejects.toThrow(`Kiln couldn't read origin for ${LABEL}: `);
  // A worktree that isn't there can't be read.
  expect(await readPhaseWork(gitContext, [{ name: NAME, label: LABEL, worktreePath: join(entry.worktreePath, "gone"), baseBranch: "develop", startCommit: head }], "feature/x")).toEqual({ unknown: `Kiln couldn't read ${LABEL}'s commits.` });
});

it("names the repository by its label when an existing branch can't be chosen there", async () => {
  const { entry, gitContext } = setUp();
  const refs = { local: new Map<string, string>() };
  expect(await classifyBranch(gitContext, { name: NAME, label: LABEL, kind: "named", mainCheckoutPath: entry.mainCheckoutPath, github: LABEL, baseBranch: "develop" }, refs, "develop", [], true))
    .toEqual({ kind: "unavailable", reason: `In ${LABEL}: That's the base branch. Choose A new feature branch to start from it.` });
});
