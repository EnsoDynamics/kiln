// The prompts Kiln sends, each a template file in the package's `prompts/` folder (technical
// design, "The prompts"). Everything in them is something a person could type (AC-RUN-06).

import { readFileSync } from "node:fs";

// src/session/ and dist/session/ both sit two levels under the package root, beside prompts/.
const PROMPTS = new URL("../../prompts/", import.meta.url);

function template(name: string): string {
  return readFileSync(new URL(name, PROMPTS), "utf8").replace(/\s+$/, "");
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole: string, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Prompt placeholder ${whole} has no value.`);
    return value;
  });
}

/** One of the PRD's repositories, as a prompt lists it. */
export interface PromptRepository {
  name: string;
  /** `<owner>/<name>`. */
  github: string;
  /** Absolute. */
  worktreePath: string;
  baseBranch: string;
  isPrd: boolean;
}

export interface PhasePromptValues {
  /** The phase document's path from the folder the session starts in: `docs/prds/customer-returns/phase-2b-store-credit.md`. */
  phaseDoc: string;
  featureName: string;
  /** The PRD file's path from the folder the session starts in. */
  prdFile: string;
  /** The PRD's repository's worktree, absolute. */
  worktreePath: string;
  branch: string;
  /** The folder the PRD's repositories sit in, as shown: `~/devel/acme`. */
  parentFolder: string;
  /** Present for a multi-repository PRD: its workspace folder, absolute, and its repositories in list order. */
  workspace?: { folder: string; repositories: PromptRepository[] };
}

export interface PullRequestPromptValues {
  featureName: string;
  prdFile: string;
  branch: string;
  /** The repositories that get a pull request, in list order. */
  repositories: PromptRepository[];
}

/**
 * The phase session's launch prompt (AC-RUN-03, AC-RUN-05): v1's for a one-repository PRD, with
 * the paragraph on adding a repository; for a multi-repository PRD, the workspace and its
 * repositories in place of the one worktree (multi-repo AC-SPACE-02).
 */
export function phaseSessionPrompt(values: PhasePromptValues): string {
  const { workspace } = values;
  const common = { phaseDoc: values.phaseDoc, featureName: values.featureName, prdFile: values.prdFile, branch: values.branch, parentFolder: values.parentFolder };
  if (!workspace) return fill(template("phase-session.txt"), { ...common, worktreePath: values.worktreePath });
  const list = workspace.repositories
    .map((repository) => `- \`${repository.name}\`: \`${repository.worktreePath}\`, base \`${repository.baseBranch}\`${repository.isPrd ? " (the PRD's repository)" : ""}`)
    .join("\n");
  const example = workspace.repositories.find((repository) => !repository.isPrd)?.name ?? workspace.repositories[0]!.name;
  return fill(template("phase-session-workspace.txt"), { ...common, workspaceFolder: workspace.folder, exampleRepository: example, repositoryList: list });
}

/** The pull-request session's prompt (AC-PR-01; multi-repo AC-PRS-02, AC-PRS-05): one pull request per repository listed. */
export function pullRequestSessionPrompt(values: PullRequestPromptValues): string {
  const list = values.repositories
    .map((repository) => `- \`${repository.name}\` (\`${repository.github}\`), worktree \`${repository.worktreePath}\`, into \`${repository.baseBranch}\``)
    .join("\n");
  const crossLinks = values.repositories.length > 1 ? template("pull-request-cross-links.txt") : "";
  return fill(template("pull-request-session.txt"), {
    featureName: values.featureName,
    prdFile: values.prdFile,
    branch: values.branch,
    repositoryList: list,
    crossLinks: crossLinks === "" ? "" : `\n${crossLinks}\n`,
  });
}

/**
 * The fresh-session prompt offered on Needs you (AC-STOP-06): the phase prompt with one
 * sentence added after its first, saying a previous session stopped partway. When nothing ran,
 * that sentence would be untrue, so the prompt is the phase prompt unchanged.
 */
export function freshSessionPrompt(values: PhasePromptValues, previousSessionRan: boolean): string {
  const prompt = phaseSessionPrompt(values);
  if (!previousSessionRan) return prompt;
  const firstBreak = prompt.indexOf("\n\n");
  const note = fill(template("fresh-session-note.txt"), { place: values.workspace ? "workspace" : "worktree" });
  return `${prompt.slice(0, firstBreak)} ${note}${prompt.slice(firstBreak)}`;
}

/** The cause in a resumed session's prompt, from the run's `interruptedBy`. */
const INTERRUPT_CAUSES = { sigint: "Ctrl+C", sighup: "the terminal closed", sigterm: "Kiln was stopped", sleep: "the computer slept" } as const;

export interface ResumePromptValues {
  /** The interrupted run's cause; absent when Kiln was killed outright and recorded none. */
  cause?: keyof typeof INTERRUPT_CAUSES;
  /** `interruptedAt`, or the run's last output time when Kiln recorded no interruption. */
  time: string;
  /** The launched leaf's document, from the folder the session started in; absent for the pull-request session. */
  phaseDoc?: string;
  /** The session works across a workspace, not one worktree; for the pull-request session, opens several pull requests. */
  multiRepository?: boolean;
}

/**
 * The first message of a resumed session (AC-KEEP-04; technical design, "The prompts").
 *
 *   resumePrompt({ cause: "sigint", time: "2026-10-17T15:02:11Z", phaseDoc: "docs/prds/customer-returns/phase-2b-store-credit.md" })
 *   // "Kiln was interrupted at `2026-10-17T15:02:11Z` (Ctrl+C) while this session was working, and has resumed it. Carry on with `docs/…/phase-2b-store-credit.md` from where you stopped; …"
 */
export function resumePrompt(values: ResumePromptValues): string {
  const opening =
    values.cause === undefined
      ? fill(template("resume-opening-unrecorded.txt"), { time: values.time })
      : fill(template("resume-opening-interrupted.txt"), { time: values.time, cause: INTERRUPT_CAUSES[values.cause] });
  const carryOn =
    values.phaseDoc === undefined
      ? fill(template("resume-carry-on-pull-request.txt"), { pullRequests: values.multiRepository ? "the pull requests" : "the pull request" })
      : fill(template("resume-carry-on-phase.txt"), { phaseDoc: values.phaseDoc, place: values.multiRepository ? "workspace" : "worktree" });
  return `${opening} ${carryOn}`;
}
