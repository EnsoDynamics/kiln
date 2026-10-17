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

/** The cause in a resumed session's prompt, from the run's `interruptedBy`. */
const INTERRUPT_CAUSES = { sigint: "Ctrl+C", sighup: "the terminal closed", sigterm: "Kiln was stopped", sleep: "the computer slept" } as const;

export interface ResumePromptValues {
  /** The interrupted run's cause; absent when Kiln was killed outright and recorded none. */
  cause?: keyof typeof INTERRUPT_CAUSES;
  /** `interruptedAt`, or the run's last output time when Kiln recorded no interruption. */
  time: string;
  /** The launched leaf's document, from the worktree root; absent for the pull-request session. */
  phaseDoc?: string;
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
  const carryOn = values.phaseDoc === undefined ? template("resume-carry-on-pull-request.txt") : fill(template("resume-carry-on-phase.txt"), { phaseDoc: values.phaseDoc });
  return `${opening} ${carryOn}`;
}
