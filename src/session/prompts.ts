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

export interface PhasePromptValues {
  /** The phase document's path from the worktree root: `docs/prds/customer-returns/phase-2b-store-credit.md`. */
  phaseDoc: string;
  featureName: string;
  /** The PRD file's path from the worktree root. */
  prdFile: string;
  /** Absolute. */
  worktreePath: string;
  branch: string;
}

export interface PullRequestPromptValues {
  featureName: string;
  prdFile: string;
  branch: string;
  baseBranch: string;
  /** `<owner>/<name>`. */
  github: string;
}

/** The phase session's launch prompt (AC-RUN-03, AC-RUN-05). */
export function phaseSessionPrompt(values: PhasePromptValues): string {
  return fill(template("phase-session.txt"), { ...values });
}

/** The pull-request session's prompt (AC-PR-01). */
export function pullRequestSessionPrompt(values: PullRequestPromptValues): string {
  return fill(template("pull-request-session.txt"), { ...values });
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
  const note = template("fresh-session-note.txt");
  return `${prompt.slice(0, firstBreak)} ${note}${prompt.slice(firstBreak)}`;
}
