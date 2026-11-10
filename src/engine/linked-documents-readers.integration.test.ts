// The worktree reader and the Git reader apply one link rule (Kiln Linked Documents AC-LINK-01,
// AC-LINK-02): the same documents, digest and unfollowed links for the same tree, against real Git.
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { findExecutable } from "../platform/helper-process.js";
import { commitFiles, createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { readGitPlan } from "./completed-plan-sources.js";
import { observeActivePlan, readLinkedDocuments } from "./plan-reconciliation.js";

const directory = "docs/prds/customer-returns";
let sandbox: Sandbox; let repository: string;
beforeEach(() => { sandbox = createSandbox(); repository = createRepository(sandbox, "shop"); });
afterEach(() => sandbox.cleanup());
const head = () => git(sandbox, repository, "rev-parse", "HEAD").trim();
const context = () => ({ git: findExecutable("git", sandbox.env)!, env: sandbox.env });

it("reads the same documents, digest and unfollowed links from the worktree and from Git", async () => {
  const files = prdDirectoryFiles();
  files["technical-design.md"] += [
    "", "[Missing](../../../billing-service/docs/event-history.md)", "[Section](../../../billing-service/docs/event-history.md#retention)",
    "[Outside](../../../../elsewhere.md)", "[Folder](notes.md)", "[Through a link](linked-folder/rules.md)", "[Earlier](earlier.md)", "",
  ].join("\n");
  files["earlier.md"] = "# Earlier\n\n[Missing again](../../../billing-service/docs/event-history.md)\n";
  commitFiles(sandbox, repository, directory, files);
  mkdirSync(join(repository, directory, "notes.md")); writeFileSync(join(repository, directory, "notes.md", "keep.txt"), "x\n");
  mkdirSync(join(repository, "rules")); writeFileSync(join(repository, "rules", "rules.md"), "# Rules\n");
  symlinkSync("../../../rules", join(repository, directory, "linked-folder"));
  git(sandbox, repository, "add", "-A"); git(sandbox, repository, "commit", "-qm", "add notes and links");

  const worktree = observeActivePlan(repository, directory);
  const fromGit = await readGitPlan(context(), repository, directory, head());
  const design = `${directory}/technical-design.md`;
  const expected = [
    { from: design, href: "../../../../elsewhere.md", target: "../../../../elsewhere.md", reason: "outside the repository" },
    { from: design, href: "../../../billing-service/docs/event-history.md", target: "billing-service/docs/event-history.md", reason: "not in this repository" },
    { from: design, href: "../../../billing-service/docs/event-history.md#retention", target: "billing-service/docs/event-history.md", reason: "not in this repository" },
    { from: design, href: "notes.md", target: `${directory}/notes.md`, reason: "not a file" },
    { from: design, href: "linked-folder/rules.md", target: `${directory}/linked-folder/rules.md`, reason: "a symbolic link" },
    // A later document's link to a target already judged is recorded too.
    { from: `${directory}/earlier.md`, href: "../../../billing-service/docs/event-history.md", target: "billing-service/docs/event-history.md", reason: "not in this repository" },
  ];
  expect(worktree.unfollowed).toEqual(expected);
  expect(fromGit.unfollowed).toEqual(expected);
  expect(Object.keys(fromGit.source.documents).sort()).toEqual(Object.keys(worktree.source.documents).sort());
  expect(fromGit.source.digest).toBe(worktree.source.digest);
});

// File modes don't stop root, and Windows ignores them.
it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("still stops on a linked file it finds but can't read (AC-LINK-02)", () => {
  const files = prdDirectoryFiles(); files["technical-design.md"] += "\n[Rules](rules.md)\n"; files["rules.md"] = "# Rules\n";
  commitFiles(sandbox, repository, directory, files);
  const rules = join(repository, directory, "rules.md"); chmodSync(rules, 0o000);
  try { expect(() => readLinkedDocuments(repository, directory)).toThrow(/EACCES|permission denied/i); }
  finally { chmodSync(rules, 0o644); }
});

it("keeps another seed's pointer required in the Git reader too, whatever order the seeds link in (AC-LINK-02)", async () => {
  const files = prdDirectoryFiles();
  files["assumptions.md"] += "\n[Old rules](old-rules.md)\n";
  files["technical-design.md"] += "\nReplaces: AC-OLD-01 in `docs/prds/customer-returns/old-rules.md`\n";
  commitFiles(sandbox, repository, directory, files);
  await expect(readGitPlan(context(), repository, directory, head())).rejects.toThrow("Missing or unsafe document");
  expect(() => readLinkedDocuments(repository, directory)).toThrow("Linked document is missing: docs/prds/customer-returns/old-rules.md");
});
