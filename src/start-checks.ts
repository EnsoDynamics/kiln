// The start checks `kiln run` runs for a feature not started (PRD AC-START-02): the documents
// are where the Enso Method skills put them, the plan reads, every leaf cites criteria,
// dependencies point backward, the checkout is clean, and the tools Kiln needs are there.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGithubOrigin } from "./github-origin.js";
import { readPhasePlan, planStartProblems, type PhasePlan } from "./plan/phase-plan.js";
import { isPhaseFileName } from "./plan/phase-ids.js";
import { runHelper } from "./platform/helper-process.js";
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
  found: { assumptions: boolean; phaseDocCount: number };
  plan: PhasePlan | undefined;
}

export function startChecksPassed(report: StartCheckReport): boolean {
  return report.missingDocuments.length === 0 && report.problems.length === 0;
}

/**
 * Runs every start check, in the checkout the path is in, and reports all failures together
 * so the person can fix them in one pass.
 */
export async function runStartChecks(location: PrdLocation, tools: Tools, env: NodeJS.ProcessEnv): Promise<StartCheckReport> {
  const fileNames = readdirSync(location.prdDirectory);
  const phaseFileNames = fileNames.filter(isPhaseFileName);

  const missingDocuments: MissingDocument[] = [];
  if (!fileNames.includes(location.prdFileName)) missingDocuments.push({ name: location.prdFileName, description: "the PRD" });
  if (!fileNames.includes("technical-design.md")) missingDocuments.push({ name: "technical-design.md", description: "the technical design" });
  if (phaseFileNames.length === 0) missingDocuments.push({ name: "phase-*.md", description: "phase documents" });

  const problems: string[] = [];
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

  const [status, originUrl, ghAuth] = await Promise.all([
    runHelper(tools.git, ["status", "--porcelain", "--untracked-files=all"], { cwd: location.checkoutRoot, env }),
    runHelper(tools.git, ["remote", "get-url", "origin"], { cwd: location.checkoutRoot, env }),
    tools.gh ? runHelper(tools.gh, ["auth", "status", "--hostname", "github.com"], { cwd: location.checkoutRoot, env }) : undefined,
  ]);

  if (status.exitCode !== 0) {
    problems.push(`Couldn't read the checkout's status: ${(status.stderr || status.failure || "").trim()}`);
  } else {
    const changed = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").length;
    if (changed > 0) problems.push(`The checkout has uncommitted changes: ${changed} ${changed === 1 ? "file" : "files"}.`);
  }

  if (!tools.claude) problems.push("claude isn't on the PATH.");
  if (!tools.gh) problems.push("gh isn't on the PATH.");
  if (ghAuth && ghAuth.exitCode === null) problems.push(`Couldn't check gh's sign-in: ${ghAuth.failure}`);
  else if (ghAuth && ghAuth.exitCode !== 0) problems.push("gh isn't signed in to github.com. Run gh auth login.");

  if (originUrl.exitCode !== 0) problems.push("The checkout has no origin remote.");
  else if (!parseGithubOrigin(originUrl.stdout)) problems.push(`origin isn't on GitHub: ${originUrl.stdout.trim()}`);

  return {
    missingDocuments,
    problems,
    found: { assumptions: fileNames.includes("assumptions.md"), phaseDocCount: phaseFileNames.length },
    plan,
  };
}
