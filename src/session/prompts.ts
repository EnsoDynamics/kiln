// The prompts Kiln sends, each a template file in the package's `prompts/` folder (technical
// design, "The prompts"). Everything in them is something a person could type (AC-RUN-06).

import { readFileSync } from "node:fs";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import type { UnfollowedLink } from "../engine/plan-reconciliation.js";

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
  /** What it is shown by (find repositories anywhere AC-FOLDER-02); its name when absent. */
  label?: string;
  /** Its own checkout, as shown: `~/code/acme-labs/storefront`. */
  checkout?: string;
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
  /** Links in the requirements Kiln did not follow, from its latest plan read (Kiln Linked Documents AC-LINK-03). */
  unfollowedLinks?: UnfollowedLink[];
}

export interface PullRequestPromptValues {
  deliveryAuthority?: string | undefined;
  featureName: string;
  prdFile: string;
  branch: string;
  /** The repositories that get a pull request, in list order. */
  repositories: PromptRepository[];
  /** The block each description opens with: **For you**, **Closing audits**, **Settled during the build** (AC-LEFT-01). */
  deliveryBlock: string;
}

/**
 * The phase session's launch prompt (AC-RUN-03, AC-RUN-05): v1's for a one-repository PRD, with
 * the paragraph on adding a repository; for a multi-repository PRD, the workspace and its
 * repositories in place of the one worktree (multi-repo AC-SPACE-02).
 */
export function phaseSessionPrompt(values: PhasePromptValues): string {
  const { workspace } = values;
  const common = { phaseDoc: values.phaseDoc, featureName: values.featureName, prdFile: values.prdFile, branch: values.branch, parentFolder: values.parentFolder };
  if (!workspace) return authorizedPhase(withUnfollowedLinks(fill(template("phase-session.txt"), { ...common, worktreePath: values.worktreePath }), values.unfollowedLinks), values.deliveryAuthority);
  // Each repository by label and address path, with its worktree; the example of an own checkout is a listed repository's real one (find repositories anywhere, "A session's request").
  const list = workspace.repositories
    .map((repository) => `- \`${repository.label ?? repository.name}\` (\`${repository.github}\`): \`${repository.worktreePath}\`, base \`${repository.baseBranch}\`${repository.isPrd ? " (the PRD's repository)" : ""}`)
    .join("\n");
  const example = workspace.repositories.find((repository) => !repository.isPrd) ?? workspace.repositories[0]!;
  return authorizedPhase(withUnfollowedLinks(fill(template("phase-session-workspace.txt"), { ...common, workspaceFolder: workspace.folder, exampleCheckout: example.checkout ?? `${values.parentFolder}/${example.name}`, repositoryList: list }), values.unfollowedLinks), values.deliveryAuthority);
}

/** The pull-request session's prompt (AC-PR-01; multi-repo AC-PRS-02, AC-PRS-05): one pull request per repository listed. */
export function pullRequestSessionPrompt(values: PullRequestPromptValues): string {
  const list = values.repositories
    .map((repository) => `- \`${repository.name}\` (\`${repository.github}\`), worktree \`${repository.worktreePath}\`, into \`${repository.baseBranch}\``)
    .join("\n");
  const crossLinks = values.repositories.length > 1 ? template("pull-request-cross-links.txt") : "";
  // Every pull request prompt carries the block, whether or not it lists anything for a person (AC-LEFT-01).
  const items = `\n\n${fill(template("pull-request-person-items.txt"), { items: values.deliveryBlock })}`;
  if (values.deliveryAuthority) return fill(template("development-finalization.txt"), { featureName: values.featureName, prdFile: values.prdFile, branch: values.branch, repositoryList: list, deliveryAuthority: authorityBlock(values.deliveryAuthority) }) + items;
  return fill(template("pull-request-session.txt"), {
    featureName: values.featureName,
    prdFile: values.prdFile,
    branch: values.branch,
    repositoryList: list,
    crossLinks: crossLinks === "" ? "" : `\n${crossLinks}\n`,
  }) + items;
}

/**
 * The push session's prompt (Kiln After Delivery AC-BACK-05, "Continue and the Push Session"): the
 * main checkout, the base branch, the commits beyond the remote, and the fixed points.
 *
 *   planPushPrompt({ featureName: "Customer returns", prdFile: "docs/prds/customer-returns/customer-returns-prd.md", prdDirectory: "docs/prds/customer-returns", checkout: "/home/me/acme-shop", baseBranch: "develop", commits: [{ sha: "a41c0d2…", subject: "docs(customer returns): add return label phases", onlyDocuments: true }] })
 */
export function planPushPrompt(values: { featureName: string; prdFile: string; prdDirectory: string; checkout: string; baseBranch: string; commits: { sha: string; subject: string; onlyDocuments: boolean }[] }): string {
  const commitList = values.commits.map(commit => `- ${commit.sha.slice(0, 7)} ${commit.subject}${commit.onlyDocuments ? "" : " (touches more than this PRD's documents)"}`).join("\n");
  return fill(template("plan-push-session.txt"), { featureName: values.featureName, prdFile: values.prdFile, prdDirectory: values.prdDirectory, checkout: values.checkout, baseBranch: values.baseBranch, commitList });
}

/** How long the merge session waits for a pull request's required checks after its last push (Kiln After Delivery, "The Merge Session"). */
export const MERGE_CHECK_WAIT_MINUTES = 30;

/** One pull request the merge session merges, in the order it merges them. */
export interface MergePullRequest {
  repository: string;
  /** `<owner>/<name>`. */
  github: string;
  number: number;
  featureBranch: string;
  baseBranch: string;
  /** Absolute. */
  worktreePath: string;
  /** What GitHub showed at the latest reading, for the resume prompt: `open`, `merged` or `closed`. */
  state?: "open" | "merged" | "closed";
}

const mergeList = (pulls: MergePullRequest[], withState: boolean) => pulls
  .map((pull, index) => `${index + 1}. \`${pull.repository}\` #${pull.number} (\`${pull.github}\`): \`${pull.featureBranch}\` into \`${pull.baseBranch}\`, worktree \`${pull.worktreePath}\`${withState && pull.state ? `, ${pull.state === "open" ? "open" : pull.state === "merged" ? "merged" : "closed without merging"}` : ""}`)
  .join("\n");

/**
 * The merge session's prompt (Kiln After Delivery AC-MERGE-02, AC-MERGE-03): the pull requests to
 * merge in order, what the session may and may not do, and the fixed points of "The Merge Session".
 *
 *   mergeSessionPrompt({ featureName: "Customer returns", prdFile: "docs/prds/customer-returns/customer-returns-prd.md", agent: "Claude Code", pullRequests: [{ repository: "acme-shop", github: "acme/acme-shop", number: 218, featureBranch: "feature/customer-returns", baseBranch: "develop", worktreePath: "/w/customer-returns" }] })
 *   // "You are merging the finished work of Customer returns, … 1. `acme-shop` #218 (`acme/acme-shop`): `feature/customer-returns` into `develop`, worktree `/w/customer-returns` …"
 */
export function mergeSessionPrompt(values: { featureName: string; prdFile: string; agent: string; pullRequests: MergePullRequest[] }): string {
  return fill(template("merge-session.txt"), { featureName: values.featureName, prdFile: values.prdFile, agent: values.agent, pullRequestList: mergeList(values.pullRequests, false), checkWaitMinutes: String(MERGE_CHECK_WAIT_MINUTES) });
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

/** The longest earlier final message a carry-on prompt carries, in characters (run restart "Carry on"). */
export const CARRY_ON_MESSAGE_LIMIT = 16_000;

export interface CarryOnPromptValues {
  /** The phase's fresh-session prompt. */
  freshSession: string;
  /** The person's reply, trimmed; absent or empty for none. */
  note?: string;
  /** The latest conversation's last final message, verbatim; absent when none was recorded. */
  lastMessage?: string;
  /** Each set-up repository's commits (short SHA and subject) and its uncommitted file count. */
  work: { name: string; commits: { sha: string; subject: string }[]; uncommittedFiles: number }[];
  multiRepository: boolean;
}

/**
 * The first message of a carry-on session (run restart AC-CARRY-05): the phase's fresh-session
 * prompt, then the person's reply with the reply policy a resume note gets, the earlier session's
 * last message verbatim (cut at 16,000 characters, saying so) and the phase's work.
 *
 *   carryOnPrompt({ freshSession, note: "The import work is merged now.", lastMessage: "Blocked before any code…", work: [{ name: "harbor-ledger", commits: [], uncommittedFiles: 0 }], multiRepository: false })
 */
export function carryOnPrompt(values: CarryOnPromptValues): string {
  const message = values.lastMessage === undefined || values.lastMessage.trim() === ""
    ? "No final message was recorded."
    : values.lastMessage.length > CARRY_ON_MESSAGE_LIMIT ? `${values.lastMessage.slice(0, CARRY_ON_MESSAGE_LIMIT)}\n\n[Kiln cut this message at ${CARRY_ON_MESSAGE_LIMIT.toLocaleString("en-US")} characters.]` : values.lastMessage;
  const work = values.work.map(entry => {
    const commits = entry.commits.length ? entry.commits.map(commit => `  - \`${commit.sha.slice(0, 7)}\` ${commit.subject}`).join("\n") : "  - No commits";
    const files = `  - ${entry.uncommittedFiles === 0 ? "No" : entry.uncommittedFiles} uncommitted ${entry.uncommittedFiles === 1 ? "file" : "files"}`;
    return values.multiRepository ? `- \`${entry.name}\`:\n${commits}\n${files}` : `${commits}\n${files}`.replace(/^ {2}/gm, "");
  }).join("\n");
  const note = values.note?.trim();
  return [values.freshSession, ...(note ? [fill(template("resume-note.txt"), { note }), template("resume-reply-policy.txt")] : []), fill(template("carry-on.txt"), { lastMessage: message, work })].join("\n\n");
}

/** The cause in a resumed session's prompt, from the run's `interruptedBy`. */
const INTERRUPT_CAUSES = { sigint: "Ctrl+C", sighup: "the terminal closed", sigterm: "Kiln was stopped", sleep: "the computer slept" } as const;

export interface AuditRecoveryTask { instructions?: string; label: string; prdFile: string; activityId: string; round: number; reportPath: string; skillPath: string; lastRefusal?: { at: string; text: string } }
/** The audit's own prompt, in `instructions`, already carries the development authority block; it is added here only without one. */
export function auditRecoveryPrompt(task: AuditRecoveryTask, deliveryAuthority?: string): string {
  const values = { label: task.label, prdFile: task.prdFile, activityId: task.activityId, round: String(task.round), reportPath: task.reportPath, skillPath: task.skillPath };
  return [fill(template("resume-carry-on-audit.txt"), values), ...(task.lastRefusal ? [fill(template("resume-audit-refusal.txt"), { at: task.lastRefusal.at, refusal: task.lastRefusal.text })] : []), ...(task.instructions ? [task.instructions] : []), ...(deliveryAuthority && !task.instructions ? [authorityBlock(deliveryAuthority)] : [])].join("\n\n");
}

/** A preflight session resumed by Kiln: the preflight's own tail (build preflight "The Preflight Session"). */
export interface PreflightRecoveryTask { prdFile: string; skillPath: string }
export function preflightRecoveryPrompt(task: PreflightRecoveryTask): string {
  return fill(template("resume-carry-on-preflight.txt"), { prdFile: task.prdFile, skillPath: task.skillPath });
}

export interface ResumePromptValues {
  requirementsStage?: boolean;
  auditTask?: AuditRecoveryTask;
  preflightTask?: PreflightRecoveryTask;
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
  /** For the pull-request session: the block Kiln would give now, carried after the carry-on line (AC-LEFT-01). */
  deliveryBlock?: string;
  /** For the merge session: the delivery's pull requests with the current reading (Kiln After Delivery, "The Merge Session"). */
  mergeTask?: { pullRequests: MergePullRequest[] };
  /** For the push session: the main checkout and its base branch (Kiln After Delivery, "Continue and the Push Session"). */
  planPushTask?: { checkout: string; baseBranch: string };
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
    values.requirementsStage ? "Continue your assigned requirements stage from where you stopped. End with the kiln-report requested in your original instructions."
    : values.mergeTask ? fill(template("resume-carry-on-merge.txt"), { pullRequestList: mergeList(values.mergeTask.pullRequests, true), checkWaitMinutes: String(MERGE_CHECK_WAIT_MINUTES) })
    : values.planPushTask ? fill(template("resume-carry-on-plan-push.txt"), values.planPushTask)
    : values.preflightTask ? preflightRecoveryPrompt(values.preflightTask) : values.auditTask ? auditRecoveryPrompt(values.auditTask) : values.phaseDoc === undefined
      ? values.deliveryAuthority
        ? template("resume-carry-on-development-finalization.txt")
        : fill(template("resume-carry-on-pull-request.txt"), { pullRequests: values.multiRepository ? "the pull requests" : "the pull request" })
      : fill(template("resume-carry-on-phase.txt"), { phaseDoc: values.phaseDoc, place: values.multiRepository ? "workspace" : "worktree" });
  const before = [...(values.note === undefined ? [] : [fill(template("resume-note.txt"), { note: values.note })]), ...(values.outside === undefined ? [] : [values.outside])];
  // An audit task's instructions already carry the authority block.
  // A pull-request session's resume carries the block Kiln would give now, in place of the first message's (AC-LEFT-01).
  const block = values.deliveryBlock !== undefined && values.phaseDoc === undefined && !values.auditTask && !values.preflightTask && !values.mergeTask && !values.planPushTask ? [fill(template("resume-delivery-block.txt"), { block: values.deliveryBlock }).trimEnd()] : [];
  return [...before, ...(values.deliveryAuthority && !values.auditTask?.instructions && !values.mergeTask && !values.planPushTask ? [authorityBlock(values.deliveryAuthority)] : []), `${opening} ${carryOn}`, ...block, ...(values.note === undefined ? [] : [template("resume-reply-policy.txt")])].join("\n\n");
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
/**
 * The phase prompt with the links Kiln did not follow, one per line, or unchanged when there are none (AC-LINK-03).
 *
 *   - `docs/prds/customer-returns/technical-design.md` links to `../../../billing/a.md`: not in this repository.
 */
function withUnfollowedLinks(prompt: string, links: UnfollowedLink[] | undefined): string {
  if (!links?.length) return prompt;
  const one = links.length === 1;
  return `${prompt}\n\n${fill(template("unfollowed-links.txt"), {
    linkPhrase: one ? "this link" : "these links",
    documentPhrase: one ? "the document" : "the documents they point at",
    needPhrase: one ? "that document" : "one of those documents",
    linkList: links.map(link => `- \`${link.from}\` links to \`${link.href}\`: ${link.reason}.`).join("\n"),
  })}`;
}

function authorizedPhase(prompt: string, authority?: string): string {
  if (!authority) return prompt;
  return prompt.replace("You are not authorized to open a pull request, merge, deploy, or touch any other branch.", "Development delivery is governed by the saved authority below.")
    .replace("or land work on any other branch", "or change another checkout")
    .replace(/(You're finished when[^\n]+)(\n|$)/, "$1 Required development-delivery assessment, merge, deployment, verification and source synchronization must also pass Kiln’s current evidence checks.$2") + "\n\n" + authorityBlock(authority);
}

/** With development delivery on, an audit owns an assessment of its own that the report cannot carry; without one its submission is refused. */
const AUDIT_DELIVERY_STEP = " Before submitting, record this audit's development-delivery assessment with `kiln delivery assess`, as the development authority below describes; Kiln refuses the report until a current one exists.";

export function auditSessionPrompt(values: { label: string; skillName: string; skillPath: string; executionId: string; activityId: string; round: number; continuationIndex: number; reportPath: string; prdFile: string; repositories: PromptRepository[]; branch: string; cli: string; deliveryAuthority?: string | undefined; previous?: string; outstanding?: string; nextSteps?: string }): string {
  return fill(template("audit-session.txt"), { ...values, nextSteps: values.nextSteps ?? "", outstanding: values.outstanding || "None.", round: String(values.round), continuationIndex: String(values.continuationIndex), repositories: values.repositories.map(r => `- ${r.name}: ${r.worktreePath}, base ${r.baseBranch}`).join("\n"), deliveryAuthority: values.deliveryAuthority ? authorityBlock(values.deliveryAuthority) : "No development merge or deployment is authorized.", deliveryStep: values.deliveryAuthority ? AUDIT_DELIVERY_STEP : "", previous: values.previous ?? "No prior audit result." });
}

/** The build preflight session's prompt (build preflight "The Preflight Session"): no pinned CLI, no report path. */
export function preflightSessionPrompt(values: { skillName: string; skillPath: string; prdFile: string; repositories: PromptRepository[]; branch: string }): string {
  return fill(template("preflight-session.txt"), { ...values, repositories: values.repositories.map(r => `- ${r.name}: ${r.worktreePath}, base ${r.baseBranch}`).join("\n") });
}

export function preparationPrompt(values: { phaseId: string; featureName: string; branch: string; bindings: string; cli: string; executionId: string; recovery: string }): string { return fill(template("preparation-session.txt"), values); }
export function preparationImplementationPrompt(values: { phaseId: string; checkpoint: string; phasePrompt: string }): string { return fill(template("preparation-implementation.txt"), values); }


export function requirementsPrompt(task: "stage" | "review" | "feedback", values: { skillPath: string; work: string; worktree: string; branch: string; holds: string; messages?: string }): string {
  return fill(template(`requirements-${task}.txt`), { ...values, messages: values.messages ?? "" });
}

/** The plan read's prompt (Kiln Requirements Stages, "Reading it"): the entry skill's path pinned, the method's folder only. */
export function planReadPrompt(values: { skillPath: string; methodFolder: string }): string {
  return fill(template("requirements-plan.txt"), values);
}
