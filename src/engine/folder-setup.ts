// The Folder missing page's setup panel (missing worktree recovery technical design, "The Setup
// Panel"): the two starting points with AC-SETUP-02's availability and defaults, Documents found's
// fields filled in from the run, the preview of what will run (AC-SETUP-03, AC-SAFE-02), the
// Starting lets Kiln list (AC-SAFE-01, 03, 04) and the identity Start compares. Everything here
// only reads: the draft lives in the engine's memory until Start succeeds (AC-SAFE-01).

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PlannedPhase } from "../plan/phase-plan.js";
import type { Effort, PrdRecord, RepositoryEntry, RepositoryKind } from "../state/records.js";
import { ensureObjects, listWorktrees, originBranches, runGit, localBranchCommit, type GitContext, type OriginBranches, type WorktreeEntry } from "./git-reads.js";
import { observeGitPlan } from "./completed-plan-sources.js";
import { ancestry, inBaseBranch, type FolderMissingView, type RepositoryRead } from "./folder-facts.js";
import { worktreeAt } from "./folder-check.js";
import { findRepository, repositoriesParent } from "./repositories.js";
import type { PlanSource } from "./plan-reconciliation.js";
import { baseBranchChoices, checkWorkspaceFolder, checkWorkspaceFolderPlacement, checkWorktreePath, comparable, defaultBaseBranch, displayPath, expandHome, isWithin, joinNames, realPathOfNearestAncestor } from "./worktree-setup.js";
import { stillOwnArtifacts, type FolderSetupStart } from "./folder-setup-start.js";
import { bindPreparation } from "./continuation-readiness.js";

export type StartKind = "base" | "branch";
export interface PanelFields {
  worktreePath: string;
  workspaceFolder: string;
  featureBranch: string;
  baseBranch: string;
  bases: Record<string, string>;
  model: string;
  effort: string;
  keepAwake: boolean;
  resumeAfterUsageLimit: boolean;
}
/** One posted change, as `POST /api/folder-setup/panel` carries it. */
export interface PanelChange { start: StartKind; fields: Partial<PanelFields> }
/** The engine's one draft per PRD: the selected start and each start's own edits. */
export interface PanelDraft { selected?: StartKind; edits: Record<StartKind, Partial<PanelFields>>; /** Documents found's `choiceNotice`: a model change reset the effort (AC-SETUP-01). */ choiceNotice?: string; /** Rises with each applied change. */ revision?: number }
/** A new draft's revision starts from the clock, so a page open across a restart or a reset never waits for a lower one. */
export const emptyDraft = (): PanelDraft => ({ edits: { base: {}, branch: {} }, revision: Date.now() });

/** Words with inline code, a date, or emphasis, as the page lays them out. */
export interface Part { text?: string; tone?: "code" | "strong"; date?: string }
/** `holdsAllWork` is absent when a failed read decides it (AC-FACTS-03). */
export interface StartChoice { sha: string; total: number; done: number; holdsAllWork?: boolean; behindBase: boolean; line: string }
export interface PanelRepository { name: string; kind: RepositoryKind; baseBranch: string; baseChoices: string[]; problem?: string; leftOut?: true; /** A session-added repository's phase, judged, for Documents found's "added in phase" tag. */ addedInPhase?: string }
export interface SetupPanel {
  suggested: StartKind;
  selected: StartKind;
  choices: Record<StartKind, StartChoice | { unavailable: string }>;
  multi: boolean;
  fields: PanelFields;
  fixed: string[];
  fieldErrors: Record<string, string>;
  helpLines: { folder?: string; featureBranch?: string };
  /** For several repositories, the Repositories list with each base (AC-SETUP-07). */
  repositories: PanelRepository[];
  /** The single repository's base choices. */
  baseChoices: string[];
  /** The efforts the panel's model takes: `[]` for none, `null` when Kiln has no entry for it (Documents found's `effortLevels`). */
  effortLevels: Effort[] | null;
  efforts?: { value: string; label: string; description?: string }[];
  /** Said when a model change in the panel reset the effort, as Documents found says it. */
  choiceNotice?: string;
  preview: { done: string; run: { id: string; title: string; note: string }[]; again: string[]; caution?: Part[]; startLabel: string; lets: { parts: Part[]; allowed: boolean }[] };
  /** Start is refused while a session runs (AC-SAFE-01): the line shown under the button. */
  busy?: string;
  previewId: string;
  /** The draft change this panel was built from, so the page holds Start until its latest change is shown (AC-SETUP-03). */
  draftRevision: number;
}
export type PanelView = SetupPanel | { blocked: string };

/** What the engine knows that the panel reads (never writes). */
export interface PanelContext {
  git: GitContext;
  record: PrdRecord;
  view: FolderMissingView;
  prdDirectoryFromRoot: string;
  /** The PRD folder's name, which the suffix goes on. */
  prdFolder: string;
  /** Leaves this run completed, by judged id, with the commit each repository's Done recorded: pushed, or the waived head (AC-WAIVE-09), and the repositories whose commit is a waived head. */
  completedByRun: Map<string, { doneAt: string; commits: Record<string, string>; waived?: string[] }>;
  /** The judged id of the phase the run was on: stopped at Needs you, waiting for usage, or working when the folder went missing. */
  stoppedPhaseId?: string;
  /** That phase's start commit in each repository it began in: commits after it on the branch are its work. */
  stoppedStarts?: Record<string, string>;
  /** The phase a pending pause request belongs to: the stopped phase, else the first unfinished leaf of the saved plan. */
  pausePhaseId?: string;
  /** A failed start intent of this execution, whose names the draft starts from. */
  intent?: FolderSetupStart;
  /** A process left by an earlier Kiln that Start stops before any Git write. */
  stopsLeftOver?: number;
  busy?: string;
  /** The panel's model and effort, checked as Documents found checks the saved ones: Model's field message, and the efforts that model takes (AC-SETUP-01). */
  model?: (choice: { model: string; effort?: string }) => { error?: string; effortLevels: Effort[] | null; efforts?: { value: string; label: string; description?: string }[] };
  /** Repository identity checks for a newly named repository's origin. */
  originIdentity?: (path: string) => Promise<string | undefined>;
  /** The id a launched phase is shown as, after any split. */
  judgedId?: (id: string) => string;
}

interface SetRepository { name: string; kind: RepositoryKind; mainCheckoutPath: string; github: string; baseBranch: string; origin?: OriginBranches; problem?: string; entry?: RepositoryEntry }

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const short = (sha: string) => sha.slice(0, 7);
const leavesOf = (phases: PlannedPhase[]) => phases.filter(phase => phase.splitInto === undefined);

/** "Phase 4", "Phases 1–9" for a consecutive run of whole numbers, else "Phases 4, 6 and 7". */
export function phaseList(ids: string[]): string {
  if (ids.length === 1) return `Phase ${ids[0]}`;
  const numbers = ids.map(Number);
  if (numbers.every(Number.isInteger) && numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1)) return `Phases ${ids[0]}–${ids.at(-1)}`;
  return `Phases ${joinNames(ids)}`;
}

function empty(path: string): boolean {
  try { return !existsSync(path) || lstatSync(path).isDirectory() && readdirSync(path).length === 0; } catch { return false; }
}

/** The worktree list says nothing is at or under the folder, `prunable` entries included. */
function unrecorded(worktrees: WorktreeEntry[] | undefined, folder: string): boolean {
  if (!worktrees) return false;
  const wanted = comparable(realPathOfNearestAncestor(resolve(folder)));
  return !worktrees.some(tree => isWithin(comparable(tree.path), wanted) || isWithin(comparable(realPathOfNearestAncestor(resolve(tree.path))), wanted));
}

/**
 * The worktree a failed existing-branch start made at this folder, still on the run's branch, which
 * the next Start picks up instead of treating as taken (AC-SAFE-01: it does only what is still missing).
 */
export function ownStartFolder(context: Pick<PanelContext, "intent" | "view">, name: string, folder: string): boolean {
  const intent = context.intent;
  if (intent?.kind !== "branch" || intent.state !== "failed") return false;
  const row = intent.repositories.find(repository => repository.name === name);
  const path = expandHome(folder);
  if (!row || comparable(expandHome(row.worktreePath)) !== comparable(path) || !existsSync(path)) return false;
  const worktrees = context.view.reads.repositories.find(read => read.name === name)?.worktrees;
  const tree = worktrees ? worktreeAt(worktrees, path) : undefined;
  return tree !== undefined && tree.prunable === undefined && tree.branch === row.branch;
}

export function suffixedFolder(record: PrdRecord, prdFolder: string, n: number): string {
  return join(dirname(expandHome(record.repository.mainCheckoutPath)), ".worktrees", `${prdFolder}-${n}`);
}

/**
 * The panel for the current draft. `reads` failing for a start withholds it (AC-FACTS-03); a start
 * unavailable for a known reason says why (AC-SETUP-02).
 */
export async function buildPanel(context: PanelContext, draft: PanelDraft): Promise<PanelView> {
  const { record, view } = context;
  // The draft change this build starts from; a later change gets a later build (AC-SETUP-03).
  const revision = draft.revision ?? 0;
  const reads = view.reads;
  const prdRead = reads.repositories.find(read => read.entry.kind === "prd") ?? reads.repositories[0]!;

  // The suggestion's test, three-valued: available and has work not in the base branch (AC-SETUP-02, AC-SETUP-07).
  // It is false, whatever the availability, when every repository's work is known to be in the base branch.
  const anyWork = reads.repositories.some(read => read.workNotInBase === true);
  const work: boolean | "unknown" = anyWork ? true : reads.repositories.some(read => read.workNotInBase === "unknown") ? "unknown" : false;
  const existing = view.existingBranch;
  const test: boolean | "unknown" = existing.available === false || work === false ? false : existing.available === true && work === true ? true : "unknown";
  if (test === "unknown") return { blocked: blockedReason(reads.repositories) };

  // Each start's own computation; an existing branch whose availability a failed read decides is withheld (AC-FACTS-03).
  const branchBuild: StartBuild | Unavailable = existing.available === true ? await branchStart(context, draft, prdRead)
    : existing.available === false ? { unavailable: existing.reason, known: true } : { unavailable: existing.reason, known: false, sentence: true };
  const baseBuild = await baseStart(context, draft, prdRead);
  const offered = (build: StartBuild | Unavailable): build is StartBuild => !("unavailable" in build);
  const testChoice: StartKind = test ? "branch" : "base";
  const other: StartKind = testChoice === "base" ? "branch" : "base";
  const builds: Record<StartKind, StartBuild | Unavailable> = { base: baseBuild, branch: branchBuild };
  let suggested: StartKind;
  if (offered(builds[testChoice])) suggested = testChoice;
  else if (!(builds[testChoice] as Unavailable).known) return { blocked: blockedReason(reads.repositories) };
  else if (offered(builds[other])) suggested = other;
  else if (!(builds[other] as Unavailable).known) return { blocked: blockedReason(reads.repositories) };
  else return { blocked: `Neither starting point can be used. Base branch: ${(baseBuild as Unavailable).unavailable} Existing branch: ${(branchBuild as Unavailable).unavailable}` };
  const selected: StartKind = draft.selected && offered(builds[draft.selected]) ? draft.selected : suggested;
  const chosen = builds[selected] as StartBuild;
  const choices = { base: offered(baseBuild) ? baseBuild.choice : { unavailable: unavailableLine(baseBuild) }, branch: offered(branchBuild) ? branchBuild.choice : { unavailable: unavailableLine(branchBuild) } };

  // The Starting lets Kiln list (AC-SETUP-01, AC-SAFE-01, 03, 04).
  const multi = chosen.repositories.length > 1;
  const lets: SetupPanel["preview"]["lets"] = [];
  const branch = chosen.fields.featureBranch;
  const early = record.settings.developmentDeployments?.enabled === true;
  if (multi) {
    lets.push({ allowed: true, parts: [{ text: "In each repository, commit and push to " }, { text: branch, tone: "code" }] });
    lets.push({ allowed: true, parts: [{ text: early ? "Early merges may happen on approved repository branches; remaining work stays open for review" : "In each repository, open one pull request into its base branch once every phase closes" }] });
  } else {
    lets.push({ allowed: true, parts: [{ text: "Commit and push to " }, { text: branch, tone: "code" }] });
    lets.push({ allowed: true, parts: early ? [{ text: "Early merges may happen on approved repository branches; remaining work stays open for review" }] : [{ text: "Open one pull request into " }, { text: chosen.fields.baseBranch, tone: "code" }, { text: " once every phase closes" }] });
  }
  if (context.stopsLeftOver !== undefined) lets.push({ allowed: true, parts: [{ text: `Stop the session left by an earlier Kiln (process ${context.stopsLeftOver})` }] });
  if (record.liveControl?.takeover) lets.push({ allowed: true, parts: [{ text: "End your terminal takeover and take control back" }] });
  const pauseFor = pauseCarried(context, selected, chosen);
  if (pauseFor) lets.push({ allowed: true, parts: [{ text: `Kiln will pause after Phase ${pauseFor} is Done` }] });
  for (const path of chosen.clearRecords) lets.push({ allowed: true, parts: [{ text: "Clear git’s record of the missing folder " }, { text: displayPath(path), tone: "code" }] });
  lets.push({ allowed: false, parts: [{ text: early ? "Early merges only into approved repository branches; no unrelated or destructive actions" : "Never merge, deploy, or touch other branches" }] });

  const preview = { ...chosen.preview, lets };
  // Model and Effort as on Documents found: Model's field message, and the efforts the chosen model takes (AC-SETUP-01).
  const modelCheck = context.model?.({ model: chosen.fields.model, ...(chosen.fields.effort ? { effort: chosen.fields.effort } : {}) });
  const fieldErrors = { ...chosen.fieldErrors, ...(modelCheck?.error ? { model: modelCheck.error } : {}) };
  const panel: Omit<SetupPanel, "previewId" | "draftRevision"> = {
    suggested, selected, choices, multi,
    fields: chosen.fields, fixed: chosen.fixed, fieldErrors, helpLines: chosen.helpLines,
    effortLevels: modelCheck?.effortLevels ?? null, ...(modelCheck?.efforts ? { efforts: modelCheck.efforts } : {}), ...(draft.choiceNotice ? { choiceNotice: draft.choiceNotice } : {}),
    repositories: multi ? chosen.repositories.map(repository => ({ name: repository.name, kind: repository.kind, baseBranch: repository.baseBranch, baseChoices: repository.origin ? baseBranchChoices(repository.origin) : [repository.baseBranch], ...(repository.problem ? { problem: repository.problem } : {}), ...(repository.entry?.kind === "added" && repository.entry.addedInPhase !== undefined ? { addedInPhase: context.judgedId?.(repository.entry.addedInPhase) ?? repository.entry.addedInPhase } : {}) })).concat(chosen.leftOut.map(name => ({ name, kind: "added" as const, baseBranch: "", baseChoices: [], leftOut: true as const, problem: "Left out: the plan on the base branch doesn’t name it." }))) : [],
    baseChoices: chosen.repositories[0]?.origin ? baseBranchChoices(chosen.repositories[0].origin) : [chosen.fields.baseBranch],
    preview,
    ...(context.busy ? { busy: context.busy } : {}),
  };
  // The identity Start compares: everything the page showed for the selected start (AC-SAFE-01).
  const previewId = digest({ selected, choice: choices[selected], fields: panel.fields, repositories: chosen.repositories.map(r => [r.name, r.baseBranch, r.mainCheckoutPath]), baseCommits: chosen.baseCommits, preview, planDigest: chosen.plan?.digest, folders: chosen.folders });
  return { ...panel, previewId, draftRevision: revision };
}

/** `sentence`: an unchecked start's reason is already a whole sentence naming what Kiln couldn't read. */
interface Unavailable { unavailable: string; known: boolean; sentence?: true }
/** One start, computed in full; `plan` is the plan that start follows. */
export interface StartBuild {
  kind: StartKind;
  choice: StartChoice;
  fields: PanelFields;
  fixed: string[];
  fieldErrors: Record<string, string>;
  helpLines: SetupPanel["helpLines"];
  repositories: SetRepository[];
  leftOut: string[];
  /** Per repository: the worktree folder Start creates. */
  folders: Record<string, string>;
  baseCommits: Record<string, string>;
  /** Saved folders whose stale record Start clears (AC-SAFE-04). */
  clearRecords: string[];
  /** Per repository, when only origin has the branch: its tip, for the shared checkout's new branch. */
  createLocal: Record<string, string>;
  plan?: PlanSource;
  preview: Omit<SetupPanel["preview"], "lets">;
  /** The leaves that run, in plan order; the first is Start's phase. */
  runIds: string[];
  /** The suffix the base start took. */
  suffix?: number;
}

function unavailableLine(build: Unavailable): string {
  if (build.sentence) return build.unavailable;
  return build.known ? `Unavailable: ${build.unavailable.charAt(0).toLowerCase()}${build.unavailable.slice(1)}` : `Couldn’t check: ${build.unavailable}`;
}

function blockedReason(reads: RepositoryRead[]): string {
  return reads.some(read => !read.originRead)
    ? "Kiln couldn’t reach origin, so it can’t tell whether the branch there has work your checkout doesn’t, and can’t suggest where to start yet. Check the connection to origin, then check again."
    : "Kiln couldn’t read everything it needs about the branch, so it can’t suggest where to start yet. Check again once it can.";
}

/** The fields every start shares: the run's saved choices, with the draft's edits. */
function sharedFields(record: PrdRecord, edits: Partial<PanelFields>): Pick<PanelFields, "model" | "effort" | "keepAwake" | "resumeAfterUsageLimit"> {
  const choice = record.settings.agentChoices[record.settings.agentId] ?? { model: "" };
  return { model: edits.model ?? choice.model, effort: edits.effort ?? choice.effort ?? "", keepAwake: edits.keepAwake ?? record.settings.keepAwake, resumeAfterUsageLimit: edits.resumeAfterUsageLimit ?? record.settings.resumeAfterUsageLimit };
}

/** The base-branch start (AC-SETUP-02, 04, 07). */
async function baseStart(context: PanelContext, draft: PanelDraft, prdRead: RepositoryRead): Promise<StartBuild | Unavailable> {
  const { record, view, git } = context;
  const reads = view.reads;
  const edits = { ...draft.edits.base };
  if (!reads.basePlan || !prdRead.base) return { unavailable: `the plan on ${prdRead.entry.baseBranch}`, known: false };
  // Origin decides the suffix and the new branch's start; an unreachable origin withholds this start (AC-FACTS-03).
  if (reads.repositories.some(read => !read.originRead || !read.localRead || !read.worktrees)) return { unavailable: reads.repositories.some(read => !read.originRead) ? "origin" : "what Kiln needs about the branch", known: false };

  // The repositories a continuation would set up: the PRD's, and every repository the base plan names (The Setup Panel).
  const prdBase = edits.baseBranch ?? (context.intent?.kind === "base" ? context.intent.repositories.find(r => r.name === prdRead.name)?.baseBranch : undefined) ?? prdRead.entry.baseBranch;
  let plan = reads.basePlan;
  const baseCommits: Record<string, string> = {};
  const prdOrigin = await originBranches(git, prdRead.entry.mainCheckoutPath);
  if (!prdOrigin.ok) return { unavailable: "origin", known: false };
  const prdTip = prdOrigin.value.branches.get(prdBase);
  if (!prdTip) return { unavailable: `${prdBase} isn’t on origin.`, known: true };
  if (prdTip !== prdRead.base.sha || prdBase !== prdRead.entry.baseBranch) {
    await ensureObjects(git, prdRead.entry.mainCheckoutPath, prdTip);
    try { plan = await observeGitPlan(git, prdRead.entry.mainCheckoutPath, context.prdDirectoryFromRoot, prdTip); }
    catch { return { unavailable: `the plan on ${prdBase}`, known: false }; }
  }
  baseCommits[prdRead.name] = prdTip;
  const names = [...new Set([prdRead.name, ...plan.plan.phases.flatMap(phase => phase.repositories)])];
  const set: SetRepository[] = [];
  for (const name of names) {
    const entry = record.repositories.find(candidate => candidate.name === name && candidate.setupCompletedAt !== undefined);
    if (name === prdRead.name) { set.push({ name, kind: "prd", mainCheckoutPath: expandHome(prdRead.entry.mainCheckoutPath), github: prdRead.entry.github, baseBranch: prdBase, origin: prdOrigin.value, entry: prdRead.entry }); continue; }
    let found: { mainCheckoutPath: string; github: string } | undefined = entry ? { mainCheckoutPath: expandHome(entry.mainCheckoutPath), github: entry.github } : undefined;
    let problem: string | undefined;
    if (!found) {
      const lookup = await findRepository(git, repositoriesParent(expandHome(record.repository.mainCheckoutPath)), name, "The plan on the base branch");
      if (!lookup.ok) { if (lookup.unavailable) return { unavailable: lookup.problem, known: false }; problem = lookup.problem; }
      else found = { mainCheckoutPath: lookup.repository.mainCheckoutPath, github: lookup.repository.github };
    }
    if (!found) { set.push({ name, kind: "named", mainCheckoutPath: "", github: "", baseBranch: "", problem: problem! }); continue; }
    const origin = await originBranches(git, found.mainCheckoutPath);
    if (!origin.ok) return { unavailable: `origin for ${name}`, known: false };
    if (context.originIdentity) {
      const identity = await context.originIdentity(found.mainCheckoutPath);
      if (!identity || identity.toLowerCase() !== found.github.toLowerCase()) problem = `Restore the recorded ${found.github} origin for ${name}, then check again.`;
    }
    const base = edits.bases?.[name] ?? (entry?.baseBranch ?? record.settings.bases[name] ?? defaultBaseBranch(origin.value));
    if (!base) problem ??= `Establish a configured delivery base for ${name}, then check again.`;
    const tip = base ? origin.value.branches.get(base) : undefined;
    if (base && !tip) problem ??= `${base} isn’t on origin.`;
    if (tip) { await ensureObjects(git, found.mainCheckoutPath, tip); baseCommits[name] = tip; }
    set.push({ name, kind: "named", mainCheckoutPath: found.mainCheckoutPath, github: found.github, baseBranch: base, origin: origin.value, ...(problem ? { problem } : {}), ...(entry ? { entry } : {}) });
  }
  const leftOut = record.repositories.filter(entry => entry.setupCompletedAt !== undefined && !names.includes(entry.name)).map(entry => entry.name);
  const multi = set.length > 1;

  // The suffix shared by branch and folder (Design Decisions, "Suffix for the base-branch start").
  const stem = record.branchStem ?? record.settings.featureBranch;
  const taken = new Set([record.settings.featureBranch, ...(record.continuation?.executions ?? []).map(row => row.branch)]);
  // A failed start's branch and folder count as free only while they are still its own and untouched (The Setup Panel, The draft).
  const own = context.intent?.kind === "base" && context.intent.state === "failed" && !await stillOwnArtifacts(git, context.intent) ? context.intent : undefined;
  let suffix: number | undefined;
  for (let n = 2; n < 1000 && suffix === undefined; n++) {
    const name = `${stem}-${n}`;
    const folder = suffixedFolder(record, context.prdFolder, n);
    if (own && own.settings.featureBranch === name && comparable(expandHome(own.settings.workspaceFolder)) === comparable(folder)) { suffix = n; break; }
    if (taken.has(name)) continue;
    let free = empty(folder);
    for (const repository of set) {
      if (!free || !repository.origin) break;
      if (repository.origin.branches.has(name) || await localBranchCommit(git, repository.mainCheckoutPath, name) !== undefined) free = false;
      const trees = reads.repositories.find(read => read.name === repository.name)?.worktrees ?? (await listTrees(git, repository.mainCheckoutPath));
      if (!unrecorded(trees, folder)) free = false;
    }
    if (free) suffix = n;
  }
  if (suffix === undefined) return { unavailable: "No free numbered branch and folder were found.", known: true };
  const suffixed = suffixedFolder(record, context.prdFolder, suffix);
  const defaultBranch = `${stem}-${suffix}`;
  const fields: PanelFields = {
    // A single-repository base start always uses a new suffixed folder (The Setup Panel, The draft).
    workspaceFolder: multi ? (edits.workspaceFolder ?? suffixed) : suffixed,
    worktreePath: multi ? join(edits.workspaceFolder ?? suffixed, prdRead.name) : edits.worktreePath ?? join(suffixed, prdRead.name),
    featureBranch: edits.featureBranch ?? defaultBranch,
    baseBranch: prdBase,
    bases: Object.fromEntries(set.filter(r => r.kind !== "prd").map(r => [r.name, r.baseBranch])),
    ...sharedFields(record, { ...draft.edits.branch, ...draft.edits.base }),
  };
  const folders = Object.fromEntries(set.map(r => [r.name, multi ? join(expandHome(fields.workspaceFolder), r.name) : expandHome(fields.worktreePath)]));
  // A folder edited to a missing saved folder that git still records: Start clears that one record first (AC-SAFE-04).
  const clearRecords: string[] = [];
  for (const repository of set) {
    const read = reads.repositories.find(one => one.name === repository.name);
    if (read?.check.state !== "missing" || comparable(folders[repository.name]!) !== comparable(read.check.savedFolder)) continue;
    if (read.worktrees && worktreeAt(read.worktrees, read.check.savedFolder)?.prunable !== undefined) clearRecords.push(read.check.savedFolder);
  }

  // Field checks, as Documents found runs them.
  const fieldErrors: Record<string, string> = {};
  const ownFolder = (path: string) => !!own && Object.values(own.repositories).some(r => comparable(expandHome(r.worktreePath)) === comparable(expandHome(path)));
  if (multi) {
    if (!ownFolder(join(fields.workspaceFolder, prdRead.name))) {
      const error = await checkWorkspaceFolder(git, set.filter(r => r.mainCheckoutPath), fields.workspaceFolder, clearRecords);
      if (error) fieldErrors.workspaceFolder = error;
    }
  } else if (!ownFolder(fields.worktreePath)) {
    const error = await checkWorktreePath(git, set[0]!.mainCheckoutPath, fields.worktreePath, clearRecords);
    if (error) fieldErrors.worktreePath = error;
  }
  const branchError = await newBranchError(git, set, fields.featureBranch, own?.settings.featureBranch, taken);
  if (branchError) fieldErrors.featureBranch = branchError;

  // What will run (AC-SETUP-03, AC-SAFE-02): a Closed line in the base branch is enough (AC-SETUP-04).
  const leaves = leavesOf(plan.plan.phases);
  const done = leaves.filter(leaf => leaf.closed).map(leaf => leaf.id);
  const run = leaves.filter(leaf => !leaf.closed);
  if (!run.length) return { unavailable: `Every phase is already closed on ${prdBase}; there is nothing to start.`, known: true };
  const problem = set.find(r => r.problem);
  if (problem) return { unavailable: `${problem.problem}`, known: true };
  // The first leaf's preparation, bound as continuation readiness binds it: a problem it reports is a preview problem (Start, step 3).
  const preparationProblems: string[] = [];
  await bindPreparation({ git, record, candidate: plan, first: run[0], repositories: set.map(r => ({ name: r.name, identity: r.github, path: r.mainCheckoutPath, baseBranch: r.baseBranch, baseRevision: baseCommits[r.name]! })), problems: preparationProblems });
  if (preparationProblems.length) return { unavailable: `${[...new Set(preparationProblems)].join(" ")} Then check again.`, known: true };
  // Work this run committed, pushed or not, that the new start leaves out (AC-SAFE-02).
  const runIds = new Set(run.map(leaf => leaf.id));
  // A commit's work in a repository: in the base branch this start uses, not, or unknown (AC-FACTS-01's test). A repository
  // of the start's set is tested against the base the panel chose; a repository being left out, against its saved base.
  const inSet = (name: string) => set.find(repository => repository.name === name);
  let workUnknown = reads.repositories.some(read => read.workNotInBase === "unknown" && !(inSet(read.name) && read.tip));
  const workLeftIn = async (read: RepositoryRead, sha: string | undefined): Promise<boolean> => {
    const chosen = inSet(read.name);
    const baseSha = chosen ? baseCommits[read.name] : read.base?.sha;
    if (!baseSha || !sha) return false;
    const entry = chosen ? { ...read.entry, baseBranch: chosen.baseBranch } : read.entry;
    const inBase = await inBaseBranch(git, expandHome(read.entry.mainCheckoutPath), record, entry, sha, baseSha);
    if (inBase === "unknown") workUnknown = true;
    return inBase === false;
  };
  // Each repository's feature branch with work not in that base.
  const branchWork = new Map<string, boolean>();
  for (const read of reads.repositories) branchWork.set(read.name, await workLeftIn(read, read.tip));
  // The phase the run was on, when its commits are on the feature branch and not in the base: it runs again too.
  const stopped = context.stoppedPhaseId;
  const stoppedWorkIn = (read: RepositoryRead) => { const startCommit = context.stoppedStarts?.[read.name]; return !!startCommit && !!read.tip && read.tip !== startCommit && branchWork.get(read.name) === true; };
  const stoppedWork = stopped !== undefined && !context.completedByRun.has(stopped) && reads.repositories.some(stoppedWorkIn);
  const again = leaves.filter(leaf => runIds.has(leaf.id) && (context.completedByRun.has(leaf.id) || stoppedWork && leaf.id === stopped)).map(leaf => leaf.id);
  // Phases are named in plan order: the run's saved plan places the phases it worked on, including one the base plan lacks; a phase only the base plan has follows.
  const order = [...(record.plan ?? []).map(phase => phase.id), ...leaves.map(leaf => leaf.id)];
  const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  // Phases this run worked on that the base plan doesn't have, whose work in any repository isn't in its base: the new start never runs them.
  const anyPlanIds = new Set(plan.plan.phases.map(phase => phase.id));
  const notInPlan: string[] = [];
  for (const [id, completed] of context.completedByRun) {
    if (anyPlanIds.has(id)) continue;
    for (const read of reads.repositories) if (await workLeftIn(read, completed.commits[read.name])) { notInPlan.push(id); break; }
  }
  if (stoppedWork && !anyPlanIds.has(stopped!)) notInPlan.push(stopped!);
  notInPlan.sort((a, b) => rank(a) - rank(b));
  // Phases this run completed, or was on, that the base plan already closes but whose work isn't in its base: closed there, they never run again.
  const doneIds = new Set(done);
  // Only the start's repositories: work in a repository being left out is named with that repository below.
  const closedWithout: string[] = [];
  const closedWithoutIn = new Set<string>();
  for (const [id, completed] of context.completedByRun) {
    if (!doneIds.has(id)) continue;
    let left = false;
    for (const read of reads.repositories) if (inSet(read.name) && await workLeftIn(read, completed.commits[read.name])) { left = true; closedWithoutIn.add(read.name); }
    if (left) closedWithout.push(id);
  }
  if (stoppedWork && doneIds.has(stopped!)) {
    const inRepositories = reads.repositories.filter(read => inSet(read.name) && stoppedWorkIn(read));
    if (inRepositories.length) { closedWithout.push(stopped!); for (const read of inRepositories) closedWithoutIn.add(read.name); }
  }
  closedWithout.sort((a, b) => rank(a) - rank(b));
  const leftWork = leftOut.filter(name => branchWork.get(name) === true);
  // A left-out repository's phases whose work there isn't in its base branch, and the phase the run was on when it committed there.
  const leftPhaseIds = new Map<string, string[]>();
  for (const name of leftWork) {
    const read = reads.repositories.find(one => one.name === name)!;
    const ids: string[] = [];
    for (const [id, completed] of context.completedByRun) if (await workLeftIn(read, completed.commits[name])) ids.push(id);
    if (stopped !== undefined && stoppedWorkIn(read)) ids.push(stopped);
    leftPhaseIds.set(name, [...new Set(ids)].sort((a, b) => rank(a) - rank(b)));
  }
  const gone = reads.repositories.every(read => !read.tip);
  const verb = view.existingBranch.available === true ? "would" : "will";
  const caution: Part[] = [];
  const add = (parts: Part[]) => caution.push(...(caution.length ? [{ text: " " }] : []), ...parts);
  if (again.length) {
    const lead = `${phaseList(again)} ${verb} run again.`;
    const completed = again.length === 1 ? context.completedByRun.get(again[0]!) : undefined;
    const sha = completed?.commits[prdRead.name];
    const pushed = !completed?.waived?.includes(prdRead.name);
    const their = again.length === 1 ? "Its" : "Their";
    const withWork = reads.repositories.filter(read => branchWork.get(read.name) === true).map(read => read.name);
    const tail = multi ? ` ${their} work is on the feature branch in ${withWork.length === reads.repositories.length ? (withWork.length === 2 ? "both repositories" : "every repository") : joinNames(withWork)}, not in ${prdBase}.`
      : gone ? ` ${their} ${pushed ? "pushed " : ""}work${sha ? ` (${short(sha)})` : ""} was on the deleted branch and isn’t in ${prdBase}.`
      : ` ${their} work${sha ? ` (${short(sha)})` : ""} is on the feature branch, not in ${prdBase}.`;
    add([{ text: lead, tone: "strong" }, { text: tail }]);
  }
  if (notInPlan.length) add([{ text: `${phaseList(notInPlan)} ${verb} not run.`, tone: "strong" }, { text: ` The plan on ${prdBase} has no such phase${notInPlan.length === 1 ? "" : "s"}, so ${notInPlan.length === 1 ? "its" : "their"} work stays on the earlier feature branch.` }]);
  if (closedWithout.length) {
    const one = closedWithout.length === 1;
    const sha = one && !multi ? context.completedByRun.get(closedWithout[0]!)?.commits[prdRead.name] : undefined;
    const where = multi ? ` in ${joinNames([...closedWithoutIn])} isn’t in ${closedWithoutIn.size === 1 ? "its" : "their"} base branch` : `${sha ? ` (${short(sha)})` : ""} isn’t in ${prdBase}`;
    add([{ text: `${phaseList(closedWithout)} ${verb} not run again.`, tone: "strong" }, { text: ` The plan on ${prdBase} already closes ${one ? "it" : "them"}, but ${one ? "its" : "their"} work${where}; it ${gone ? "was only on the deleted branch" : "stays on the earlier feature branch"}.` }]);
  }
  for (const name of leftWork) {
    const phases = leftPhaseIds.get(name)!;
    add([{ text: `Work this run committed in ${name}${phases.length ? ` (${phaseList(phases)})` : ""} isn’t in its base branch; it stays on that repository’s feature branch.` }]);
  }
  // "Holds all work" is withheld while a read of work not in the base branch failed (AC-FACTS-03).
  const missing = [...new Set([...again, ...notInPlan, ...closedWithout, ...[...leftPhaseIds.values()].flat()])].sort((a, b) => rank(a) - rank(b));
  const holdsAllWork = missing.length || leftWork.length ? false : workUnknown ? undefined : true;
  const workLine = holdsAllWork === true ? "Has all of this run’s work." : holdsAllWork === undefined ? "Couldn’t check whether it has all of this run’s work." : `Missing ${missing.length ? phaseList(missing) : "some of this run"}’s work.`;
  const source = prdRead.base.source === "origin" ? `origin/${prdBase}` : prdBase;
  const counts = `${leaves.length} phases, ${done.length} done`;
  const line = multi
    ? `A new workspace and branch in ${set.length === 2 ? "both repositories" : `all ${set.length} repositories`}, from ${source} at ${short(prdTip)} · ${counts}. ${workLine}`
    : `${source} at ${short(prdTip)} · ${counts}. ${workLine}`;
  return {
    kind: "base",
    choice: { sha: prdTip, total: leaves.length, done: done.length, ...(holdsAllWork === undefined ? {} : { holdsAllWork }), behindBase: false, line },
    fields, fixed: ["agentId"], fieldErrors,
    helpLines: { folder: multi ? "New: a folder named for the new branch, with a new worktree of each repository." : "New: a folder named for the new branch.", featureBranch: "New, so this run’s earlier branch and pull request stay separate." },
    repositories: set, leftOut, folders, baseCommits, clearRecords, createLocal: {}, plan,
    preview: { done: done.length ? `${phaseList(done)} done on ${prdBase}` : "No phase is done yet", run: run.map((leaf, index) => ({ id: leaf.id, title: leaf.title, note: index === 0 ? "runs first" : "then" })), again, ...(caution.length ? { caution } : {}), startLabel: `Set up & start Phase ${run[0]!.id}` },
    runIds: run.map(leaf => leaf.id), suffix,
  };
}

/** The existing-branch start (AC-SETUP-02, 05, 07): only the failing repositories' worktrees are made. */
async function branchStart(context: PanelContext, draft: PanelDraft, prdRead: RepositoryRead): Promise<StartBuild | Unavailable> {
  const { record, view, git } = context;
  const reads = view.reads;
  const branch = record.settings.featureBranch;
  if (!reads.featurePlan) return { unavailable: `the plan on ${branch}`, known: false };
  const edits = { ...draft.edits.branch };
  const failing = reads.repositories.filter(read => read.check.state !== "in_place");
  const multi = reads.repositories.length > 1;
  const folders: Record<string, string> = {};
  const clearRecords: string[] = [];
  const createLocal: Record<string, string> = {};
  let movedFolder: string | undefined;
  for (const read of failing) {
    if (read.check.state === "missing") folders[read.name] = read.check.savedFolder;
    else {
      // The saved path holds something else: AC-START-07's layout with the next free suffix (one repository only).
      let n = 2;
      for (; n < 1000; n++) {
        const folder = suffixedFolder(record, context.prdFolder, n);
        if (empty(folder) && reads.repositories.every(other => unrecorded(other.worktrees, folder)) || ownStartFolder(context, read.name, join(folder, read.name))) break;
      }
      movedFolder = suffixedFolder(record, context.prdFolder, n);
      folders[read.name] = join(movedFolder, read.name);
    }
    if (!read.localSha && read.originSha) createLocal[read.name] = read.originSha;
  }
  if (!multi && edits.worktreePath !== undefined) folders[prdRead.name] = expandHome(edits.worktreePath);
  for (const read of failing) {
    // Git's record of the missing saved folder stops the add when the chosen folder is that path, or the branch is recorded there (AC-SAFE-04).
    const saved = read.worktrees ? worktreeAt(read.worktrees, read.check.savedFolder) : undefined;
    if (read.check.state === "missing" && saved?.prunable !== undefined && (comparable(folders[read.name]!) === comparable(read.check.savedFolder) || saved.branch === branch)) clearRecords.push(read.check.savedFolder);
  }
  const fields: PanelFields = {
    workspaceFolder: movedFolder ?? record.settings.workspaceFolder,
    worktreePath: multi ? record.settings.worktreePath : displayPath(folders[prdRead.name] ?? expandHome(record.settings.worktreePath)),
    featureBranch: branch,
    baseBranch: prdRead.entry.baseBranch,
    bases: Object.fromEntries(reads.repositories.filter(read => read.entry.kind !== "prd").map(read => [read.name, read.entry.baseBranch])),
    ...sharedFields(record, { ...draft.edits.base, ...draft.edits.branch }),
  };
  // The checks a worktree path gets at a first Start, for every folder Start creates; git's record of
  // a missing saved folder that Start clears first counts as absent (Path checks with a stale record).
  const fieldErrors: Record<string, string> = {};
  const runCheckouts = reads.repositories.map(read => ({ name: read.name, mainCheckoutPath: expandHome(read.entry.mainCheckoutPath) }));
  for (const read of failing) {
    const path = folders[read.name]!;
    if (ownStartFolder(context, read.name, path)) continue;
    // A failed start's own worktree elsewhere still holds the branch, and git allows a branch in one folder at a time.
    const earlier = context.intent?.repositories.find(row => row.name === read.name);
    if (earlier && ownStartFolder(context, read.name, earlier.worktreePath)) {
      const error = `${branch} is checked out in ${displayPath(expandHome(earlier.worktreePath))}, which an earlier Start made. Use that folder, or move it away and check again.`;
      if (multi) fieldErrors.workspaceFolder = fieldErrors.workspaceFolder ? `${fieldErrors.workspaceFolder} In ${read.name}: ${error}` : `In ${read.name}: ${error}`;
      else fieldErrors.worktreePath = error;
      continue;
    }
    const error = await checkWorktreePath(git, expandHome(read.entry.mainCheckoutPath), path, clearRecords)
      ?? (multi ? await checkWorkspaceFolderPlacement(git, runCheckouts, path, clearRecords) : undefined);
    if (error) {
      if (multi) fieldErrors.workspaceFolder = fieldErrors.workspaceFolder ? `${fieldErrors.workspaceFolder} In ${read.name}: ${error}` : `In ${read.name}: ${error}`;
      else fieldErrors.worktreePath = error;
    }
  }

  // What will run: the feature plan's closed leaves are done; the rest run (AC-SETUP-03).
  const leaves = leavesOf(reads.featurePlan.plan.phases);
  const done = leaves.filter(leaf => leaf.closed).map(leaf => leaf.id);
  let run = leaves.filter(leaf => !leaf.closed).map(leaf => ({ id: leaf.id, title: leaf.title }));
  let again = false;
  const stopped = context.stoppedPhaseId;
  if (!run.length && stopped && done.includes(stopped)) { again = true; run = [{ id: stopped, title: leaves.find(leaf => leaf.id === stopped)!.title }]; }
  // Behind the base branch's plan: it lacks leaves, or closed leaves, the base plan has.
  const baseLeaves = reads.basePlan ? leavesOf(reads.basePlan.plan.phases) : [];
  const featureIds = new Map(leaves.map(leaf => [leaf.id, leaf.closed]));
  const behindBase = baseLeaves.some(leaf => !featureIds.has(leaf.id) || leaf.closed && !featureIds.get(leaf.id));
  const tip = prdRead.tip!;
  const baseName = prdRead.entry.baseBranch;
  const inBase = reads.repositories.every(read => read.workNotInBase === false) && reads.repositories.some(read => read.tip);
  let caution: Part[] | undefined;
  if (behindBase) {
    caution = [{ text: `This branch is behind ${baseName}: it knows ${leaves.filter(leaf => baseLeaves.some(other => other.id === leaf.id)).length} of ${baseName}’s ${baseLeaves.length} phases.` }];
    if (again) {
      const tipDate = view.repositories.find(repository => repository.name === prdRead.name)?.featureBranch;
      const date = (tipDate?.local?.sha === tip ? tipDate.local.date : tipDate?.origin?.date);
      caution.push({ text: ` Phase ${stopped} is already closed on it (${short(tip)}` }, ...(date ? [{ text: ", " }, { date }] : []), { text: `), so Kiln would only check Phase ${stopped} again and end on the old plan.` });
    }
  }
  // Work this run committed, pushed or not, that the branch this start uses lacks (AC-SAFE-02).
  const left = await branchLeftBehind(context, leaves.map(leaf => leaf.id), run.map(leaf => leaf.id), createLocal);
  if (left.caution.length) caution = [...left.caution, ...(caution ? [{ text: " " }, ...caution] : [])];
  const counts = `${leaves.length} phases, ${done.length === leaves.length ? "all closed" : `${done.length} done`}`;
  const failingNames = failing.map(read => read.name);
  const kept = reads.repositories.filter(read => read.check.state === "in_place").map(read => read.name);
  // Whether this start is behind the base branch's plan, on its own line whichever start is selected (AC-SETUP-03).
  const behind = behindBase ? ` Behind ${baseName}’s plan.` : "";
  const workLine = left.holdsAllWork === true ? "Has all of this run’s work." : left.holdsAllWork === undefined ? "Couldn’t check whether it has all of this run’s work." : `Missing ${phaseList(left.missing)}’s work.`;
  const line = multi
    ? `Re-creates ${joinNames(failingNames)}’s worktree in the saved workspace${kept.length ? ` and keeps ${joinNames(kept)}’s` : ""} · last commit ${short(tip)} · ${leaves.length} phases, ${done.length} done. ${workLine}${behind}`
    : `Last commit ${short(tip)} · ${counts}. ${inBase ? `Already merged into ${baseName}. ` : ""}${workLine}${behind}`;
  const onlyOrigin = Object.keys(createLocal).length > 0;
  const savedHelp = movedFolder ? "New: the saved path holds something else, so Kiln uses a new folder." : !multi && comparable(folders[prdRead.name]!) !== comparable(prdRead.check.savedFolder) ? "New: the folder you chose, on the run’s existing branch." : "The run’s saved path.";
  return {
    kind: "branch",
    choice: { sha: tip, total: leaves.length, done: done.length, ...(left.holdsAllWork === undefined ? {} : { holdsAllWork: left.holdsAllWork }), behindBase, line },
    fields,
    fixed: ["agentId", "featureBranch", "baseBranch", "bases", ...(multi ? ["workspaceFolder"] : [])],
    fieldErrors,
    helpLines: {
      folder: multi ? `The run’s saved workspace. Kiln re-creates ${joinNames(failingNames)}’s worktree in it${kept.length ? ` and keeps ${joinNames(kept)}’s` : ""}.` : savedHelp,
      featureBranch: onlyOrigin ? "The run’s existing branch, now only on origin. Kiln creates no new branch; your checkout gets a branch of the same name that tracks it." : "The run’s existing branch. Kiln creates no new branch.",
    },
    repositories: reads.repositories.map(read => ({ name: read.name, kind: read.entry.kind, mainCheckoutPath: expandHome(read.entry.mainCheckoutPath), github: read.entry.github, baseBranch: read.entry.baseBranch, entry: read.entry })),
    leftOut: [], folders, baseCommits: {}, clearRecords, createLocal, plan: reads.featurePlan,
    preview: { done: done.length ? `${phaseList(done)} ${again ? "closed" : "done"} on the branch` : "No phase is done yet", run: run.map((leaf, index) => ({ ...leaf, note: again ? "checked again" : index === 0 ? "runs first" : "then" })), again: left.again, ...(caution ? { caution } : {}), startLabel: again ? `Set up & check Phase ${run[0]!.id} again` : run.length ? `Set up & start Phase ${run[0]!.id}` : "Set up & continue" },
    runIds: run.map(leaf => leaf.id),
  };
}

/**
 * What an existing-branch start leaves out (AC-SAFE-02): each phase this run completed whose recorded
 * commit (pushed, or the waived head) the branch the start uses lacks in some repository, and, where
 * only origin has the branch, the phase the run was on, whose unpushed commits Kiln can't see.
 */
async function branchLeftBehind(context: PanelContext, leafIds: string[], runIds: string[], createLocal: Record<string, string>): Promise<{ missing: string[]; again: string[]; holdsAllWork?: boolean; caution: Part[] }> {
  const { git, view } = context;
  const reads = view.reads.repositories;
  const multi = reads.length > 1;
  let unknown = false;
  const missingIn = new Map<string, { names: string[]; shas: string[] }>();
  for (const read of reads) {
    const tip = read.localSha ?? read.originSha;
    if (!tip) continue;
    const cwd = expandHome(read.entry.mainCheckoutPath);
    if (createLocal[read.name]) await ensureObjects(git, cwd, tip);
    for (const [id, completed] of context.completedByRun) {
      const sha = completed.commits[read.name];
      if (!sha) continue;
      let held = await ancestry(git, cwd, sha, tip);
      // A commit the shared checkout no longer has can't be in a tip it has.
      if (held === "unknown" && !await hasCommit(git, cwd, sha) && await hasCommit(git, cwd, tip)) held = false;
      if (held === "unknown") unknown = true;
      if (held !== false) continue;
      const row = missingIn.get(id) ?? { names: [], shas: [] };
      row.names.push(read.name); row.shas.push(sha);
      missingIn.set(id, row);
    }
  }
  // Plan order: the run's saved plan, then the branch's plan for a phase the saved plan lacks.
  const order = [...(context.record.plan ?? []).map(phase => phase.id), ...leafIds];
  const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  const missing = [...missingIn.keys()].sort((a, b) => rank(a) - rank(b));
  const again = missing.filter(id => runIds.includes(id));
  const notRun = missing.filter(id => !runIds.includes(id));
  const where = (names: string[]) => {
    const origin = names.every(name => createLocal[name]);
    const copy = origin ? "origin’s copy of the branch, which Kiln starts from" : "the feature branch";
    return multi ? `${copy.replace(", which Kiln starts from", "")} in ${joinNames(names)}` : copy;
  };
  const caution: Part[] = [];
  const add = (parts: Part[]) => caution.push(...(caution.length ? [{ text: " " }] : []), ...parts);
  const describe = (ids: string[], lead: string, tail: string) => {
    const names = [...new Set(ids.flatMap(id => missingIn.get(id)!.names))];
    const only = ids.length === 1 ? missingIn.get(ids[0]!)! : undefined;
    const sha = only?.shas.length === 1 ? only.shas[0] : undefined;
    add([{ text: lead, tone: "strong" }, { text: ` ${ids.length === 1 ? "Its" : "Their"} work${sha ? ` (${short(sha)})` : ""} isn’t on ${where(names)}${tail}` }]);
  };
  if (again.length) describe(again, `${phaseList(again)} will run again.`, ".");
  if (notRun.length) describe(notRun, `${phaseList(notRun)} won’t run again.`, `, and the plan there doesn’t leave ${notRun.length === 1 ? "it" : "them"} to run.`);
  // The phase the run was on: where only origin has the branch, commits it didn't push were on the deleted branch.
  const stopped = context.stoppedPhaseId;
  const unseen = stopped !== undefined && !context.completedByRun.has(stopped) && !missingIn.has(stopped)
    ? reads.filter(read => createLocal[read.name] && context.stoppedStarts?.[read.name] !== undefined).map(read => read.name) : [];
  if (unseen.length) {
    unknown = true;
    add([{ text: `Phase ${stopped} runs from origin’s copy of the branch${multi ? ` in ${joinNames(unseen)}` : ""}.`, tone: "strong" }, { text: " Commits it made that weren’t pushed were only on the deleted branch, and Kiln can’t tell whether there were any." }]);
  }
  return { missing, again, ...(missing.length ? { holdsAllWork: false } : unknown ? {} : { holdsAllWork: true }), caution };
}

/**
 * The phase a pending pause request carries through Start to, or undefined when it doesn't carry
 * (Start, Pause state at Start): an existing-branch start leaves it to the done check; a base start
 * carries it only when its phase is still to run.
 */
function pauseCarried(context: PanelContext, kind: StartKind, build: StartBuild): string | undefined {
  const pause = context.record.pause;
  if (!pause.requestedAt || pause.activeSince) return undefined;
  if (kind === "branch") return pause.requestedFor ?? context.pausePhaseId;
  const phase = context.pausePhaseId;
  return phase && build.runIds.includes(phase) ? phase : undefined;
}

async function hasCommit(git: GitContext, cwd: string, sha: string): Promise<boolean> {
  return (await runGit(git, cwd, ["cat-file", "-e", `${sha}^{commit}`])).exitCode === 0;
}

async function newBranchError(git: GitContext, set: SetRepository[], name: string, own: string | undefined, taken: Set<string>): Promise<string | undefined> {
  if (name.trim() === "") return "Enter a branch name.";
  const valid = await runGit(git, set[0]!.mainCheckoutPath, ["check-ref-format", "--branch", name]);
  if (valid.exitCode !== 0) return "That isn’t a valid branch name.";
  if (name === own) return undefined;
  const existing: string[] = [];
  for (const repository of set) {
    if (!repository.mainCheckoutPath) continue;
    if (taken.has(name) || repository.origin?.branches.has(name) || await localBranchCommit(git, repository.mainCheckoutPath, name) !== undefined) existing.push(repository.name);
  }
  if (!existing.length) return undefined;
  return set.length > 1 ? `That branch already exists in ${joinNames(existing)}. Choose a name no branch has in any repository.` : "That branch already exists. Choose a name no branch has.";
}

async function listTrees(git: GitContext, cwd: string): Promise<WorktreeEntry[] | undefined> {
  const list = await listWorktrees(git, cwd);
  return list.ok ? list.worktrees : undefined;
}

/** Every start's build, for Start's recheck: the selected start's full computation with its draft. */
export async function buildStart(context: PanelContext, draft: PanelDraft, kind: StartKind): Promise<StartBuild | Unavailable> {
  const prdRead = context.view.reads.repositories.find(read => read.entry.kind === "prd") ?? context.view.reads.repositories[0]!;
  if (kind === "base") return baseStart(context, draft, prdRead);
  if (context.view.existingBranch.available !== true) return { unavailable: "existing branch", known: false };
  return branchStart(context, draft, prdRead);
}
