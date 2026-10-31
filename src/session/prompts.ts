// The prompts Kiln sends, each a template file in the package's `prompts/` folder (technical
// design, "The prompts"). Everything in them is something a person could type (AC-RUN-06).

import { readFileSync } from "node:fs";
import { AGENT_NAMES, type AgentId } from "../state/records.js";

// src/session/ and dist/session/ both sit two levels under the package root, beside prompts/.
const PROMPTS = new URL("../../prompts/", import.meta.url);

/** Required subprocesses and reviewers finish inside the current provider session. */
export function requiredBackgroundWorkPrompt(prompt: string): string {
  return `${prompt}\n\n${template("required-background-work.txt")}`;
}

/** Invoke the discovered installed Codex skill without changing its published content. */
export function codexSessionPrompt(prompt: string, skills: { name: string; path: string }[], name = "implement-from-requirements"): string {
  const skill = skills.find(skill => [name, `enso-method:${name}`].includes(skill.name));
  if (!skill) throw new Error(`Codex ${name} skill is unavailable.`);
  return `${fill(template("codex-session.txt"), { skillPath: skill.path, skillName: name, taskName: name === "implement-from-requirements" ? "the phase" : "the assigned audit" })}\n\n${prompt}`;
}

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
  deliveryAuthority?: string | undefined;
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
  deliveryAuthority?: string | undefined;
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
  if (!workspace) return authorizedPhase(fill(template("phase-session.txt"), { ...common, worktreePath: values.worktreePath }), values.deliveryAuthority);
  const list = workspace.repositories
    .map((repository) => `- \`${repository.name}\`: \`${repository.worktreePath}\`, base \`${repository.baseBranch}\`${repository.isPrd ? " (the PRD's repository)" : ""}`)
    .join("\n");
  const example = workspace.repositories.find((repository) => !repository.isPrd)?.name ?? workspace.repositories[0]!.name;
  return authorizedPhase(fill(template("phase-session-workspace.txt"), { ...common, workspaceFolder: workspace.folder, exampleRepository: example, repositoryList: list }), values.deliveryAuthority);
}

/** The pull-request session's prompt (AC-PR-01; multi-repo AC-PRS-02, AC-PRS-05): one pull request per repository listed. */
export function pullRequestSessionPrompt(values: PullRequestPromptValues): string {
  const list = values.repositories
    .map((repository) => `- \`${repository.name}\` (\`${repository.github}\`), worktree \`${repository.worktreePath}\`, into \`${repository.baseBranch}\``)
    .join("\n");
  const crossLinks = values.repositories.length > 1 ? template("pull-request-cross-links.txt") : "";
  if (values.deliveryAuthority) return fill(template("development-finalization.txt"), { featureName: values.featureName, prdFile: values.prdFile, branch: values.branch, repositoryList: list, deliveryAuthority: authorityBlock(values.deliveryAuthority) });
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

export interface AuditRecoveryTask { instructions?: string; label: string; prdFile: string; activityId: string; round: number; reportPath: string; skillPath: string }
export function auditRecoveryPrompt(task: AuditRecoveryTask, deliveryAuthority?: string): string {
  return [fill(template("resume-carry-on-audit.txt"), { ...task, round: String(task.round) }), ...(task.instructions ? [task.instructions] : []), ...(deliveryAuthority ? [authorityBlock(deliveryAuthority)] : [])].join("\n\n");
}

export interface ResumePromptValues {
  auditTask?: AuditRecoveryTask;
  deliveryAuthority?: string | undefined;
  /** The saved session's agent; absent for legacy Claude callers. */
  agentId?: AgentId;
  /** The interrupted run's cause; absent when Kiln was killed outright and recorded none. */
  cause?: keyof typeof INTERRUPT_CAUSES;
  /**
   * The session ended on its own and the person pressed Resume (usage-limit recovery
   * AC-RESUME-02): the opening says so, with the run's `endedAt` as `time`, in place of an interruption's.
   */
  endedOnItsOwn?: boolean;
  /**
   * The stopped run was refused by a usage limit (usage-limit recovery "Prompts"): the opening
   * says so, with the limit's sentence form, or `""` for a type with no label.
   */
  usageLimit?: string;
  /** `interruptedAt`, or the run's last output time when Kiln recorded no interruption. */
  time: string;
  /** The launched leaf's document, from the folder the session started in; absent for the pull-request session. */
  phaseDoc?: string;
  /** The session works across a workspace, not one worktree; for the pull-request session, opens several pull requests. */
  multiRepository?: boolean;
  /** The person's note with Resume, trimmed: its own paragraph, first (AC-RESUME-03). */
  note?: string;
  /** AC-OUTSIDE-02's prompt, after the note, while Stayed in the workspace fails (multi-repo AC-OUTSIDE-04). */
  outside?: string;
}

/**
 * The first message of a resumed session (AC-KEEP-04; technical design, "The prompts"). For a
 * Resume the person pressed, any note comes first as its own paragraph, then the prompt about
 * work outside the workspace, then the opening and the instruction to carry on (usage-limit
 * recovery technical design, "Resume").
 *
 *   resumePrompt({ cause: "sigint", time: "2026-10-17T15:02:11Z", phaseDoc: "docs/prds/customer-returns/phase-2b-store-credit.md" })
 *   // "Kiln was interrupted at `2026-10-17T15:02:11Z` (Ctrl+C) while this session was working, and has resumed it. Carry on with `docs/…/phase-2b-store-credit.md` from where you stopped; …"
 *
 *   resumePrompt({ usageLimit: "the 5-hour usage limit", time: "2026-10-17T15:52:40Z", phaseDoc: "…/phase-2b-store-credit.md" })
 *   // "This session stopped at `2026-10-17T15:52:40Z` because Claude Code's usage limit (the 5-hour usage limit) refused its request. Kiln has resumed it on the Claude account signed in now. Carry on with …"
 *
 *   resumePrompt({ endedOnItsOwn: true, time: "2026-10-17T15:52:40Z", phaseDoc: "…/phase-2b-store-credit.md", note: "Renumber the migration to 0043." })
 *   // "The person running Kiln says:\n\nRenumber the migration to 0043.\n\nThis session ended at `2026-10-17T15:52:40Z` before its work was done, and the person running Kiln has asked Kiln to resume it. Carry on with …"
 */
export function resumePrompt(values: ResumePromptValues): string {
  const opening = values.usageLimit !== undefined
    ? fill(template("resume-opening-usage-limit.txt"), { time: values.time, agent: AGENT_NAMES[values.agentId ?? "claude_code"], account: values.agentId === "codex" ? "Codex" : "Claude", limit: values.usageLimit === "" ? "" : ` (${values.usageLimit})` })
    : values.endedOnItsOwn
    ? fill(template("resume-opening-stopped.txt"), { time: values.time })
    : values.cause === undefined
      ? fill(template("resume-opening-unrecorded.txt"), { time: values.time })
      : fill(template("resume-opening-interrupted.txt"), { time: values.time, cause: INTERRUPT_CAUSES[values.cause] });
  const carryOn =
    values.auditTask ? auditRecoveryPrompt(values.auditTask) : values.phaseDoc === undefined
      ? values.deliveryAuthority
        ? template("resume-carry-on-development-finalization.txt")
        : fill(template("resume-carry-on-pull-request.txt"), { pullRequests: values.multiRepository ? "the pull requests" : "the pull request" })
      : fill(template("resume-carry-on-phase.txt"), { phaseDoc: values.phaseDoc, place: values.multiRepository ? "workspace" : "worktree" });
  const before = [...(values.note === undefined ? [] : [fill(template("resume-note.txt"), { note: values.note })]), ...(values.outside === undefined ? [] : [values.outside])];
  return [...before, ...(values.deliveryAuthority ? [authorityBlock(values.deliveryAuthority)] : []), `${opening} ${carryOn}`, ...(values.note === undefined ? [] : [template("resume-reply-policy.txt")])].join("\n\n");
}

/** A checkout outside the workspace that a session changed, as the prompt names it. */
export interface OutsideCheckout {
  /** As shown: `~/devel/acme/design-system`. */
  shownPath: string;
  /** Its folder name. */
  name: string;
  /** Whether a repository of that name is among the PRD's, so the workspace already has its worktree. */
  inWorkspace: boolean;
}

export interface OutsidePromptValues {
  /** The phase as the prompt names it, `phase 3`; absent for the pull-request session. */
  phaseName?: string;
  /** For the pull-request session: whether it opens several pull requests. */
  pullRequests?: "one" | "several";
  /** Each uncovered change's fact. */
  facts: string[];
  checkouts: OutsideCheckout[];
  branch: string;
  multiRepository: boolean;
}

const listed = (facts: string[]) => facts.map((fact) => `- ${fact}`).join("\n");

/**
 * The prompt Needs you offers for the reopened session after work outside the workspace
 * (multi-repo AC-OUTSIDE-02): the changes, the request to bring only its own edits into the
 * workspace on the feature branch (adding a repository first where the workspace lacks it), and
 * to leave each checkout as it is and say what still needs putting back. The pull-request
 * session changes no code, so it is asked only the last.
 *
 *   outsideWorkspacePrompt({ phaseName: "phase 3", facts: ["Edited src/tokens/colors.ts in ~/devel/acme/design-system"], … })
 *   // "While working on phase 3, you changed a checkout outside the Kiln workspace, the worktrees listed in your instructions:\n- Edited …"
 */
export function outsideWorkspacePrompt(values: OutsidePromptValues): string {
  const several = values.checkouts.length > 1;
  const shown = values.checkouts.map((checkout) => checkout.shownPath);
  const bringIn =
    values.phaseName === undefined
      ? ""
      : [
          fill(template("outside-workspace-bring-in.txt"), { branch: values.branch, thatCheckout: several ? "those checkouts" : "that checkout" }),
          ...[...new Set(values.checkouts.filter((checkout) => !checkout.inWorkspace).map((checkout) => checkout.name))].map((name) => fill(template("outside-workspace-add-first.txt"), { name })),
        ].join(" ") + " ";
  return fill(template("outside-workspace.txt"), {
    doing: values.phaseName === undefined ? (values.pullRequests === "several" ? "opening the pull requests" : "opening the pull request") : `working on ${values.phaseName}`,
    aCheckout: several ? "checkouts" : "a checkout",
    workspace: values.multiRepository ? "the worktrees listed in your instructions" : "the worktree named in your instructions",
    facts: listed(values.facts),
    bringIn,
    checkouts: shown.length === 0 ? "every checkout outside the workspace" : joinWithAnd(shown),
    asItIs: several ? "they are" : "it is",
    it: several ? "them" : "it",
  });
}

/** The fresh-session prompt's addition after work outside the workspace: the same change facts (AC-OUTSIDE-02). */
export function freshSessionOutsideNote(facts: string[], checkoutCount: number, multiRepository: boolean): string {
  return fill(template("fresh-session-outside.txt"), { aCheckout: checkoutCount > 1 ? "checkouts" : "a checkout", place: multiRepository ? "workspace" : "worktree", facts: listed(facts) });
}

function joinWithAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function authorityBlock(authority: string): string { return fill(template("development-authority.txt"), { authority, sourceRevision: "{{sourceRevision}}", mergeRevision: "{{mergeRevision}}", environment: "{{environment}}" }); }
function authorizedPhase(prompt: string, authority?: string): string {
  if (!authority) return prompt;
  return prompt.replace("You are not authorized to open a pull request, merge, deploy, or touch any other branch.", "Development delivery is governed by the saved authority below.")
    .replace("or land work on any other branch", "or change another checkout")
    .replace(/(You're finished when[^\n]+)(\n|$)/, "$1 Required development-delivery assessment, merge, deployment, verification and source synchronization must also pass Kiln’s current evidence checks.$2") + "\n\n" + authorityBlock(authority);
}

export function auditSessionPrompt(values: { label: string; skillName: string; skillPath: string; executionId: string; activityId: string; round: number; continuationIndex: number; reportPath: string; prdFile: string; repositories: PromptRepository[]; branch: string; cli: string; deliveryAuthority?: string | undefined; previous?: string }): string {
  return fill(template("audit-session.txt"), { ...values, round: String(values.round), continuationIndex: String(values.continuationIndex), repositories: values.repositories.map(r => `- ${r.name}: ${r.worktreePath}, base ${r.baseBranch}`).join("\n"), deliveryAuthority: values.deliveryAuthority ?? "No development merge or deployment is authorized.", previous: values.previous ?? "No prior audit result." });
}

export function preparationPrompt(values: { phaseId: string; featureName: string; branch: string; bindings: string; cli: string; executionId: string; recovery: string }): string { return fill(template("preparation-session.txt"), values); }
export function preparationImplementationPrompt(values: { phaseId: string; checkpoint: string; phasePrompt: string }): string { return fill(template("preparation-implementation.txt"), values); }
