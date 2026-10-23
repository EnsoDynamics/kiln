import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findExecutable } from "./platform/helper-process.js";
import { resolvePrdPath, type PrdLocation } from "./prd-location.js";
import { documentsFound } from "./engine/snapshot.js";
import { displayPath } from "./engine/worktree-setup.js";
import { runStartChecks, startChecksPassed, type Tools } from "./start-checks.js";
import { FOLDER, PHASES, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createRepository, createSandbox, git, writeStandIn, type Sandbox } from "./test-support/git-repositories.js";

let sandbox: Sandbox;
let repository: string;
let tools: Tools;
const prdDirectory = `docs/prds/${FOLDER}`;
const GH_AUTH_ARGS = "auth status --hostname github.com";

async function locate(): Promise<PrdLocation> {
  const resolution = await resolvePrdPath(prdDirectory, repository, tools.git, sandbox.env);
  if ("problem" in resolution) throw new Error(resolution.problem);
  return resolution.location;
}
const check = async (overrides: Partial<Tools> = {}) => runStartChecks(await locate(), { ...tools, ...overrides }, sandbox.env);

beforeEach(() => {
  sandbox = createSandbox();
  repository = createRepository(sandbox, "acme-shop", "git@github.com:acme/acme-shop.git");
  commitFiles(sandbox, repository, prdDirectory, prdDirectoryFiles());
  const standIns = join(sandbox.root, "bin");
  tools = { git: findExecutable("git", sandbox.env)!, gh: writeStandIn(standIns, "gh", 0, "", GH_AUTH_ARGS), claude: writeStandIn(standIns, "claude", 0) };
});
afterEach(() => sandbox.cleanup());

describe("runStartChecks", () => {
  it("passes a complete, clean PRD directory and reports what it found", async () => {
    const report = await check();
    expect(report.missingDocuments).toEqual([]);
    expect(report.problems).toEqual([]);
    expect(startChecksPassed(report)).toBe(true);
    expect(report.repositories).toEqual([]);
    expect(report.found).toEqual({ designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 5 });
    expect(report.plan?.phases.map((phase) => phase.id)).toEqual(["1", "2", "2a", "2b", "3"]);
  });

  it("names each missing document; assumptions are optional", async () => {
    commitFiles(sandbox, repository, prdDirectory, { "notes.md": "keeps the directory\n" });
    for (const name of ["technical-design.md", "assumptions.md", `${FOLDER}-prd.md`, ...Object.keys(PHASES)]) git(sandbox, repository, "rm", "-q", `${prdDirectory}/${name}`);
    git(sandbox, repository, "commit", "-q", "-m", "remove documents");
    const report = await check();
    expect(report.missingDocuments).toEqual([
      { name: "customer-returns-prd.md", description: "the PRD" },
      { name: "technical-design.md", description: "the technical design, or customer-returns-technical-design.md" },
      { name: "phase-*.md", description: "phase documents" },
    ]);
    expect(report.problems).toEqual([]);
    expect(report.found.assumptionsFile).toBeUndefined();
  });

  it("takes the technical design and assumptions under the folder name too", async () => {
    git(sandbox, repository, "mv", `${prdDirectory}/technical-design.md`, `${prdDirectory}/${FOLDER}-technical-design.md`);
    git(sandbox, repository, "mv", `${prdDirectory}/assumptions.md`, `${prdDirectory}/${FOLDER}-assumptions.md`);
    git(sandbox, repository, "commit", "-q", "-m", "name the documents after the folder");
    const report = await check();
    expect(startChecksPassed(report)).toBe(true);
    expect(report.repositories).toEqual([]);
    expect(report.found).toEqual({ designFile: `${FOLDER}-technical-design.md`, assumptionsFile: `${FOLDER}-assumptions.md`, phaseDocCount: 5 });
    const documents = documentsFound(join(repository, prdDirectory), FOLDER, report.plan!, { ...report.found, repositories: report.repositories }, "acme-shop");
    expect(documents.design.file).toBe(`${FOLDER}-technical-design.md`);
    expect(documents.design.criteriaCited).toBeGreaterThan(0);
    expect(documents.assumptions?.file).toBe(`${FOLDER}-assumptions.md`);
  });

  it("stops when a document is there under both names, rather than guess which is meant", async () => {
    commitFiles(sandbox, repository, prdDirectory, { [`${FOLDER}-technical-design.md`]: "# An older draft\n" });
    const report = await check();
    expect(report.missingDocuments).toEqual([]);
    expect(report.problems).toEqual([`There are two technical designs, technical-design.md and ${FOLDER}-technical-design.md. Keep one.`]);
    expect(report.found.designFile).toBeUndefined();
  });

  it("reads only <folder name>-prd.md as the PRD, so another *-prd.md doesn't stand in for it", async () => {
    git(sandbox, repository, "mv", `${prdDirectory}/${FOLDER}-prd.md`, `${prdDirectory}/old-name-prd.md`);
    git(sandbox, repository, "commit", "-q", "-m", "rename the PRD");
    expect((await check()).missingDocuments).toEqual([{ name: "customer-returns-prd.md", description: "the PRD" }]);
  });

  it("names the checkout and the changed files, untracked files included", async () => {
    const checkout = displayPath((await locate()).checkoutRoot);
    writeFileSync(join(repository, "README.md"), "changed\n");
    writeFileSync(join(repository, "new-file.txt"), "new\n");
    expect((await check()).problems).toEqual([`The checkout ${checkout} has uncommitted changes in 2 files: README.md and new-file.txt.`]);
    unlinkSync(join(repository, "new-file.txt"));
    expect((await check()).problems).toEqual([`The checkout ${checkout} has uncommitted changes in 1 file: README.md.`]);
    for (const name of ["a.txt", "b.txt", "c.txt"]) writeFileSync(join(repository, name), "new\n");
    expect((await check()).problems).toEqual([`The checkout ${checkout} has uncommitted changes in 4 files: README.md, a.txt, b.txt and 1 more.`]);
  });

  it("fails a leaf with no criteria and a dependency on a later phase", async () => {
    commitFiles(sandbox, repository, prdDirectory, {
      "phase-1-return-intake.md": "# Phase 1: Return intake\n\n## Acceptance criteria covered\nTBD\n\n## Phase dependencies\n3 (the dashboard)\n",
    });
    expect((await check()).problems).toEqual([
      "docs/prds/customer-returns/phase-1-return-intake.md cites no acceptance criteria.",
      "phase-1-return-intake.md depends on phase 3, which comes later in the plan.",
    ]);
  });

  it("fails a plan that doesn't read", async () => {
    git(sandbox, repository, "rm", "-q", `${prdDirectory}/phase-2b-store-credit.md`);
    git(sandbox, repository, "commit", "-q", "-m", "remove 2b");
    expect((await check()).problems).toEqual(["phase-2-refunds.md lists 2b, which has no file."]);
  });

  it("fails when a tool is missing or gh isn't signed in", async () => {
    expect((await check({ gh: undefined, claude: undefined })).problems).toEqual(["gh isn't on the PATH."]);
    const signedOut = writeStandIn(join(sandbox.root, "signed-out"), "gh", 1, "You are not logged into any GitHub hosts.", GH_AUTH_ARGS);
    expect((await check({ gh: signedOut })).problems).toEqual(["gh isn't signed in to github.com. Run gh auth login."]);
  });

  it("names a phase document it can't read instead of failing", async () => {
    mkdirSync(join(repository, prdDirectory, "phase-4-folder.md"));
    writeFileSync(join(repository, prdDirectory, "phase-4-folder.md", "x.txt"), "x");
    const problems = (await check()).problems;
    expect(problems[0]).toMatch(/^Couldn't read docs\/prds\/customer-returns\/phase-4-folder\.md: /);
  });

  it("requires origin on GitHub", async () => {
    git(sandbox, repository, "remote", "set-url", "origin", "git@github-work:acme/acme-shop.git");
    expect((await check()).problems).toEqual(["origin isn't on GitHub: git@github-work:acme/acme-shop.git"]);
    git(sandbox, repository, "remote", "remove", "origin");
    expect((await check()).problems).toEqual(["The checkout has no origin remote."]);
  });

  it("reports every failure together", async () => {
    rmSync(join(repository, prdDirectory, "technical-design.md"));
    git(sandbox, repository, "remote", "remove", "origin");
    const report = await check({ claude: undefined });
    expect(report.missingDocuments.map((document) => document.name)).toEqual(["technical-design.md"]);
    expect(report.problems).toEqual([
      `The checkout ${displayPath((await locate()).checkoutRoot)} has uncommitted changes in 1 file: ${prdDirectory}/technical-design.md.`,
      "The checkout has no origin remote.",
    ]);
  });
});
