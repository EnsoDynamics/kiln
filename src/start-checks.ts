// The start checks `kiln run` runs for a feature not started (PRD AC-START-02): the documents
// are where the Enso Method skills put them, the plan reads, every leaf cites criteria,
// dependencies point backward, the checkout is clean, and the tools Kiln needs are there; and
// each repository the phase documents name is beside the PRD's repository (multi-repo AC-REPO-02).

import { readLinkedDocuments, type UnfollowedLink } from "./engine/plan-reconciliation.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGithubOrigin } from "./github-origin.js";
import { findRepository, repositoriesParent, type FoundRepository } from "./engine/repositories.js";
import { namedRepositories, readPhasePlan, planStartProblems, type PhasePlan } from "./plan/phase-plan.js";
import { displayPath } from "./engine/worktree-setup.js";
import { isPhaseFileName } from "./plan/phase-ids.js";
import { runHelper } from "./platform/helper-process.js";
import { belowMinimumProblem, compareToMinimum } from "./agents/tooling-minimums.js";
import type { PrdLocation } from "./prd-location.js";

export interface Tools {
  git: string;
  gh: string | undefined;
  claude: string | undefined;
}

export interface MissingDocument {
  /** What Kiln looked for, as the terminal mockup lists it: `technical-design.md`, `phase-*.md`. */
  name: string;
  description: string;
}

export interface StartCheckReport {
  missingDocuments: MissingDocument[];
  /** Every other failed check, one line each, in the wording of assumptions UI-010 item 10. */
  problems: string[];
  /** The file names found. Either is absent when neither of its names is there, or when both are (a problem). */
  found: { designFile?: string; assumptionsFile?: string; phaseDocCount: number; unfollowedLinks?: UnfollowedLink[] };
  plan: PhasePlan | undefined;
  /** `<owner>/<name>` on GitHub, parsed from origin's URL, when it is there. */
  github?: string;
  /** The named repositories found beside the PRD's repository, in plan order. */
  repositories: FoundRepository[];
}

/**
 * The names a document may have in the PRD directory: the bare name the Enso Method skills
 * write (`technical-design.md`), or the same name after the folder name, as the PRD's is
 * (`<folder>-technical-design.md`).
 */
function documentNames(folderName: string, bareName: string): string[] {
  return [bareName, `${folderName}-${bareName}`];
}

/** How many changed files the uncommitted-changes line names before "and N more". */
const CHANGED_FILES_NAMED = 3;

/**
 * Names the checkout and the first few files, so the person can find what Kiln saw:
 * "The checkout ~/devel/acme-shop has uncommitted changes in 5 files: a, b, c and 2 more."
 */
function uncommittedChangesProblem(checkoutRoot: string, changed: string[]): string {
  const named = changed.slice(0, CHANGED_FILES_NAMED);
  const rest = changed.length - named.length;
  const list = rest > 0 ? `${named.join(", ")} and ${rest} more` : named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0];
  return `The checkout ${displayPath(checkoutRoot)} has uncommitted changes in ${changed.length} ${changed.length === 1 ? "file" : "files"}: ${list}.`;
}

export function startChecksPassed(report: StartCheckReport): boolean {
  return report.missingDocuments.length === 0 && report.problems.length === 0;
}

/**
 * Runs every start check, in the checkout the path is in, and reports all failures together
 * so the person can fix them in one pass.
 */
export async function runStartChecks(location: PrdLocation, tools: Tools, env: NodeJS.ProcessEnv, nodeVersion = process.versions.node): Promise<StartCheckReport> {
  const fileNames = readdirSync(location.prdDirectory);
  const phaseFileNames = fileNames.filter(isPhaseFileName);

  const problems: string[] = [];
  // Either name is the document; both at once leaves Kiln no way to tell which one is meant.
  const presentNames = (bareName: string, description: string): string[] => {
    const present = documentNames(location.folderName, bareName).filter((name) => fileNames.includes(name));
    if (present.length > 1) problems.push(`There are two ${description}s, ${present.join(" and ")}. Keep one.`);
    return present;
  };
  const designNames = presentNames("technical-design.md", "technical design");
  const assumptionsNames = presentNames("assumptions.md", "assumptions document");
  const designFile = designNames.length === 1 ? designNames[0] : undefined;
  const assumptionsFile = assumptionsNames.length === 1 ? assumptionsNames[0] : undefined;

  const missingDocuments: MissingDocument[] = [];
  if (!fileNames.includes(location.prdFileName)) missingDocuments.push({ name: location.prdFileName, description: "the PRD" });
  if (designNames.length === 0) {
    missingDocuments.push({ name: "technical-design.md", description: `the technical design, or ${location.folderName}-technical-design.md` });
  }
  if (phaseFileNames.length === 0) missingDocuments.push({ name: "phase-*.md", description: "phase documents" });

  let plan: PhasePlan | undefined;
  if (phaseFileNames.length > 0) {
    const phaseFiles = [];
    for (const fileName of phaseFileNames) {
      try {
        phaseFiles.push({ fileName, markdown: readFileSync(join(location.prdDirectory, fileName), "utf8") });
      } catch (error) {
        problems.push(`Couldn't read ${location.prdDirectoryFromRoot}/${fileName}: ${(error as Error).message}`);
      }
    }
    plan = readPhasePlan(phaseFiles);
    problems.push(...plan.problems);
    if (plan.problems.length === 0) problems.push(...planStartProblems(plan, location.prdDirectoryFromRoot));
  }

  const named = plan && plan.problems.length === 0 ? namedRepositories(plan.phases, location.repositoryName) : [];
  const parent = repositoriesParent(location.mainCheckoutPath);
  const gitContext = { git: tools.git, env };
  const lookups = await Promise.all(
    named.map((name) => findRepository(gitContext, parent, name, plan!.phases.find((phase) => phase.repositories.includes(name))!.fileName)),
  );
  const repositories: FoundRepository[] = [];
  for (const lookup of lookups) {
    if (lookup.ok) repositories.push(lookup.repository);
    else problems.push(lookup.problem);
  }

  const [gitVersion, status, originUrl, ghAuth] = await Promise.all([
    runHelper(tools.git, ["--version"], { cwd: location.checkoutRoot, env }),
    runHelper(tools.git, ["status", "--porcelain", "--untracked-files=all"], { cwd: location.checkoutRoot, env }),
    runHelper(tools.git, ["remote", "get-url", "origin"], { cwd: location.checkoutRoot, env }),
    tools.gh ? runHelper(tools.gh, ["auth", "status", "--hostname", "github.com"], { cwd: location.checkoutRoot, env }) : undefined,
  ]);

  if (status.exitCode !== 0) {
    problems.push(`Couldn't read the checkout's status: ${(status.stderr || status.failure || "").trim()}`);
  } else {
    const changed = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => line.slice(3));
    if (changed.length > 0) problems.push(uncommittedChangesProblem(location.checkoutRoot, changed));
  }

  // Node.js and Git below their minimums are start problems (AC-AGENT-05). A version Kiln can't
  // read is not: each feature then decides for itself (technical design, Version comparison).
  const node = compareToMinimum("node", nodeVersion);
  if (node.state === "below_minimum") problems.push(belowMinimumProblem("node", node.version!));
  const git = compareToMinimum("git", gitVersion.exitCode === 0 ? gitVersion.stdout : undefined);
  if (git.state === "below_minimum") problems.push(belowMinimumProblem("git", git.version!));

  if (!tools.gh) problems.push("gh isn't on the PATH.");
  if (ghAuth && ghAuth.exitCode === null) problems.push(`Couldn't check gh's sign-in: ${ghAuth.failure}`);
  else if (ghAuth && ghAuth.exitCode !== 0) problems.push("gh isn't signed in to github.com. Run gh auth login.");

  const github = originUrl.exitCode === 0 ? parseGithubOrigin(originUrl.stdout) : undefined;
  if (originUrl.exitCode !== 0) problems.push("The checkout has no origin remote.");
  else if (!github) problems.push(`origin isn't on GitHub: ${originUrl.stdout.trim()}`);

  // Only once every other check passed: Documents found lists the links Kiln won't follow, and a
  // required one it can't follow is a problem here as it would be at the first plan read (AC-LINK-02, 04).
  let unfollowedLinks: UnfollowedLink[] = [];
  if (missingDocuments.length === 0 && problems.length === 0) {
    try { unfollowedLinks = readLinkedDocuments(location.checkoutRoot, location.prdDirectoryFromRoot).unfollowed; }
    catch (error) { problems.push((error as Error).message); }
  }

  return {
    missingDocuments,
    problems,
    found: { ...(designFile ? { designFile } : {}), ...(assumptionsFile ? { assumptionsFile } : {}), phaseDocCount: phaseFileNames.length, ...(unfollowedLinks.length ? { unfollowedLinks } : {}) },
    plan,
    ...(github ? { github: `${github.owner}/${github.name}` } : {}),
    repositories,
  };
}
