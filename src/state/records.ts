// The PRD record and session records Kiln keeps on disk (technical design, "Kiln's State on
// Disk"). Git and the phase documents stay the record of what is done; these remember
// settings, sessions, stops and the facts shown for finished work. Schema 2 keeps every
// per-repository fact per repository (multi-repo technical design, "Data Models"); schema 3
// adds a run the person asked Kiln to resume, with their note, the wait for a usage limit and the
// "Resume after a usage limit" setting (usage-limit recovery technical design, "Data Models").

import { dirname, join } from "node:path";
import { readJson, writeJsonAtomically } from "./state-files.js";

export const SCHEMA_VERSION = 4;

export type Effort = string;
export type AgentId = "claude_code" | "codex";
export const AGENT_NAMES: Record<AgentId, string> = { claude_code: "Claude Code", codex: "Codex" };
export interface AgentChoice { model: string; effort?: string }
export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface Settings {
  /** The folder every worktree of a multi-repository PRD is made in, `<workspace folder>/<name>`. */
  workspaceFolder: string;
  /** The PRD's repository's worktree for a one-repository PRD (v1's field). */
  worktreePath: string;
  featureBranch: string;
  /** The PRD's repository's base. */
  baseBranch: string;
  /** The other repositories' bases, by name; never keyed by the PRD's repository's name. */
  bases: Record<string, string>;
  model: string;
  effort: Effort;
  agentId?: AgentId;
  selectionGeneration?: number;
  keepAwake: boolean;
  /** Wait out a usage limit and resume by itself (usage-limit recovery AC-AUTO-04). */
  resumeAfterUsageLimit: boolean;
}

/** Only the per-agent map owns next-session settings on disk. */
export interface AgentSettings extends Omit<Settings, "model" | "effort" | "agentId" | "selectionGeneration"> {
  agentId: AgentId;
  selectionGeneration?: number;
  agentChoices: Partial<Record<AgentId, AgentChoice>>;
}
export function selectedChoice(settings: AgentSettings): AgentChoice {
  return settings.agentChoices[settings.agentId] ?? { model: "" };
}
export function agentSettings(settings: Settings | AgentSettings): AgentSettings {
  if ("agentChoices" in settings) return settings;
  const { model, effort, ...rest } = settings;
  delete rest.agentId; delete rest.selectionGeneration;
  return { ...rest, agentId: "claude_code", selectionGeneration: 0, agentChoices: { claude_code: { model, effort } } };
}
export function assertAgent(agent: unknown): asserts agent is AgentId {
  if (agent !== "claude_code" && agent !== "codex") throw new NewerSchemaError(`Unknown Kiln agent: ${String(agent)}. Update Kiln.`);
}

export type StopKind = "done_check" | "pull_request_check" | "not_resumable" | "plan" | "selection";

export interface CheckResult {
  name: string;
  passed: boolean;
  /** One per fact; each names its repository when the PRD has more than one (AC-CHECK-02). */
  facts: string[];
}

export interface PhaseStop {
  kind: StopKind;
  at: string;
  checks: CheckResult[];
  checkedAt: string;
  /**
   * Set when an interrupted session's check found work outside the workspace, so Kiln stopped
   * instead of resuming it (multi-repo AC-OUTSIDE-04): when it was interrupted, and whether that
   * time is its last output because Kiln recorded none.
   */
  interrupted?: { at: string; atIsLastOutput: boolean };
  /** The stopped run was refused by a usage limit (usage-limit recovery AC-LIMIT-01 to 03). */
  limit?: StopLimit;
}

/** A usage limit's facts on a stop: `refusedAgainAt` when Kiln's own resume was refused again (AC-AUTO-05). */
export interface StopLimit {
  rateLimitType?: string;
  label: string;
  resetsAt?: string;
  refusedAgainAt?: string;
}

/**
 * A phase waiting out a usage limit (usage-limit recovery AC-AUTO-01): the refused session and
 * run (its index), and the check that failed when the wait started or restarted.
 */
export interface PhaseWait {
  since: string;
  sessionId: string;
  run: number;
  checks: CheckResult[];
  checkedAt: string;
}

/** The account a reading or run belongs to: two are the same when both match. */
export interface AccountIdentity {
  email?: string;
  orgId?: string;
}

/**
 * A run Claude Code's usage limit refused (usage-limit recovery "Recognizing a Usage Limit"):
 * the refusal's type, its label, its reset (ISO), when it arrived, and the account of the first
 * reading after it that was signed in.
 */
export interface LimitRefusal {
  rateLimitType?: string;
  label: string;
  resetsAt?: string;
  at: string;
  account?: AccountIdentity;
}

/** A phase's facts in one repository: where its commits start, and what its Done recorded. */
export interface RepositoryPhaseFacts {
  startCommit: string;
  pushedSha?: string;
  commitCount?: number;
}

export interface PhaseFacts {
  sessionIds: string[];
  doneAt?: string;
  finishedByPerson: boolean;
  stop?: PhaseStop;
  /** Waiting for usage (usage-limit recovery AC-AUTO-01); never beside `stop`. */
  wait?: PhaseWait;
  /** By repository name. */
  repositories: Record<string, RepositoryPhaseFacts>;
  /**
   * Each tick of Needs you's confirmation that the changes outside the workspace were dealt
   * with; the latest covers every change recorded at or before it (multi-repo AC-OUTSIDE-03).
   */
  outsideConfirmations: { at: string }[];
}

export interface PullRequestFacts {
  /** The repository's name, as the PRD's repositories list it. */
  repository: string;
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  commits: number;
  additions: number;
  deletions: number;
}

export interface RecordedPlanPhase {
  id: string;
  title: string;
  file: string;
  splitInto?: string[];
  closed: boolean;
  /** The names on the document's `**Repositories:**` line; empty when it has none. */
  repositories: string[];
}

export type RepositoryKind = "prd" | "named" | "added";

export interface CreatedBranch {
  name: string;
  commit: string;
  baseBranch: string;
}

/**
 * One of the PRD's repositories. An entry counts among them only once it has
 * `setupCompletedAt`; before that it holds what a setup under way, or a failed one, left.
 */
export interface RepositoryEntry {
  name: string;
  kind: RepositoryKind;
  mainCheckoutPath: string;
  /** `<owner>/<name>`. */
  github: string;
  baseBranch: string;
  worktreePath: string;
  addedInPhase?: string;
  addedAt?: string;
  baseCommit?: string;
  createdBranch?: CreatedBranch;
  setupCompletedAt?: string;
}

export interface PrdRecord {
  schemaVersion: number;
  repository: { mainCheckoutPath: string; name: string; github: string };
  prdDirectory: string;
  featureName: string;
  token: string;
  settings: AgentSettings;
  refinementConfirmedAt?: string;
  startedAt?: string;
  setupCompletedAt?: string;
  completedAt?: string;
  /** The PRD's repository first, then named repositories in plan order, then added ones in the order added. */
  repositories: RepositoryEntry[];
  /** Keyed by the leaf Kiln launched, or `pr` for the pull-request session. */
  phases: Record<string, PhaseFacts>;
  pause: { requestedAt?: string; activeSince?: string };
  pullRequests?: PullRequestFacts[];
  plan?: RecordedPlanPhase[];
}

export type InterruptCause = "sigint" | "sighup" | "sigterm" | "sleep";

export interface SessionRun {
  pid?: number;
  processStartTime?: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  signal?: string;
  spawnError?: { code: string; message: string };
  /**
   * `person_resume`: the person pressed Resume at Needs you or Resume now (usage-limit recovery
   * AC-RESUME-02); `limit_resume`: Kiln resumed by itself at the end of a wait (AC-AUTO-02).
   */
  cause: "launch" | "resume" | "person_resume" | "limit_resume";
  /** Set at the run's end when a usage limit refused it (AC-AUTO-01). */
  limitRefusal?: LimitRefusal;
  /** The account the reading just before a resume found signed in. */
  account?: AccountIdentity;
  /** The note the person sent with Resume, trimmed, as the session got it (AC-RESUME-03). */
  note?: string;
  interruptedBy?: InterruptCause;
  interruptedAt?: string;
  result?: { subtype: string; isError: boolean; text?: string };
}

/** A progress step's start. Commit and Push start at a Bash call, the rest at a Skill call. */
export interface StepStart {
  name: StepName;
  startedAt: string;
}

export const STEP_NAMES = ["Build", "Deliverable review", "Test hardening", "Commit", "Refactor pass", "Push"] as const;
export type StepName = (typeof STEP_NAMES)[number];

export interface SessionRecord {
  agentId?: AgentId;
  schemaVersion: number;
  sessionId: string;
  phaseId: string;
  kind: "phase" | "pull_request";
  createdAt: string;
  /** The chosen alias, as passed to --model. */
  model: string;
  /** The concrete model ID the session's init event reported. */
  initModel?: string;
  modelDisplayName: string;
  /** The --effort Kiln passed; absent when it passed none. */
  effort?: Effort;
  permissionMode?: string;
  claudeVersion?: string;
  /** The folder the session was launched in; absent in a schema 1 record, where it is the PRD's worktree. */
  workingDirectory?: string;
  runs: SessionRun[];
  sleeps: { at: string; seconds: number; detectedAt: string; run: number }[];
  lastSkill?: { name: string; at: string };
  steps: StepStart[];
}

export const PR_PHASE_KEY = "pr";

export class NewerSchemaError extends Error {}

export function prdRecordPath(stateDirectory: string): string {
  return join(stateDirectory, "prd.json");
}

export function sessionDirectory(stateDirectory: string, phaseKey: string, sessionId: string): string {
  return join(stateDirectory, phaseKey, sessionId);
}

export function readPrdRecord(stateDirectory: string): PrdRecord | undefined {
  const record = readJson<PrdRecord>(prdRecordPath(stateDirectory));
  if (record && record.schemaVersion > SCHEMA_VERSION) {
    throw new NewerSchemaError(`Kiln's record for this PRD was written by a newer Kiln (schema ${record.schemaVersion}). Update Kiln and run kiln run again.`);
  }
  return record === undefined ? undefined : migrateRecord(record);
}

/** The default workspace folder: `.worktrees/<PRD folder name>` beside the PRD's repository (AC-SPACE-01). */
export function defaultWorkspaceFolder(mainCheckoutPath: string, prdDirectoryFromRoot: string): string {
  return join(dirname(mainCheckoutPath), ".worktrees", prdDirectoryFromRoot.split("/").at(-1)!);
}

interface SchemaOnePhase {
  startCommit?: string;
  pushedSha?: string;
  commitCount?: number;
}

/**
 * Reads an older record as schema 4, with no Git call. Schema 1 to 2: one `prd` repository entry
 * when it was started or holds Kiln's branch, each phase's commits under that repository, the
 * pull request as a one-entry list and each check's fact as a one-item list. Schema 2 to 3 adds
 * nothing to the record, since no record before it holds a run the person resumed; the version
 * alone moves, so an older Kiln refuses it. A PRD already underway gets "Resume after a usage
 * limit" on, as a new one does (UI-003). Schema 4 adds the Claude agent and moves saved choices
 * into its map without changing conversation keys. Written as schema 4 at its next write.
 */
export function migrateRecord(record: PrdRecord): PrdRecord {
  if (record.schemaVersion > SCHEMA_VERSION) throw new NewerSchemaError("Update Kiln to read this newer record.");
  if (record.schemaVersion < 4) record.settings = agentSettings(record.settings);
  assertAgent(record.settings.agentId);
  record.settings.selectionGeneration ??= 0;
  for (const id of Object.keys(record.settings.agentChoices)) assertAgent(id);
  // A schema 2 record written before Stayed in the workspace was built holds no confirmations.
  for (const facts of Object.values(record.phases)) facts.outsideConfirmations ??= [];
  record.settings.resumeAfterUsageLimit ??= true;
  if (record.schemaVersion >= 2) {
    record.schemaVersion = SCHEMA_VERSION;
    return record;
  }
  const old = record as PrdRecord & { baseCommit?: string; createdBranch?: CreatedBranch; pullRequest?: Omit<PullRequestFacts, "repository"> };
  const name = record.repository.name;
  record.settings.workspaceFolder ??= defaultWorkspaceFolder(record.repository.mainCheckoutPath, record.prdDirectory);
  record.settings.bases ??= {};
  record.repositories = [];
  if (record.startedAt !== undefined || old.createdBranch !== undefined) {
    record.repositories.push({
      name,
      kind: "prd",
      mainCheckoutPath: record.repository.mainCheckoutPath,
      github: record.repository.github,
      baseBranch: old.createdBranch?.baseBranch ?? record.settings.baseBranch,
      worktreePath: record.settings.worktreePath,
      ...(old.baseCommit === undefined ? {} : { baseCommit: old.baseCommit }),
      ...(old.createdBranch === undefined ? {} : { createdBranch: old.createdBranch }),
      ...(record.setupCompletedAt === undefined ? {} : { setupCompletedAt: record.setupCompletedAt }),
    });
  }
  delete old.baseCommit;
  delete old.createdBranch;
  for (const facts of Object.values(record.phases)) {
    const phase = facts as PhaseFacts & SchemaOnePhase;
    facts.repositories ??= {};
    if (phase.startCommit !== undefined) {
      facts.repositories[name] = {
        startCommit: phase.startCommit,
        ...(phase.pushedSha === undefined ? {} : { pushedSha: phase.pushedSha }),
        ...(phase.commitCount === undefined ? {} : { commitCount: phase.commitCount }),
      };
    }
    delete phase.startCommit;
    delete phase.pushedSha;
    delete phase.commitCount;
    for (const check of facts.stop?.checks ?? []) {
      const one = check as CheckResult & { fact?: string };
      if (one.facts === undefined) one.facts = one.fact === undefined ? [] : [one.fact];
      delete one.fact;
    }
  }
  if (old.pullRequest !== undefined) record.pullRequests = [{ repository: name, ...old.pullRequest }];
  delete old.pullRequest;
  for (const phase of record.plan ?? []) phase.repositories ??= [];
  record.schemaVersion = SCHEMA_VERSION;
  return record;
}

export function writePrdRecord(stateDirectory: string, record: PrdRecord): void {
  if (record.schemaVersion > SCHEMA_VERSION) throw new NewerSchemaError("Update Kiln before writing this record.");
  assertAgent(record.settings.agentId);
  writeJsonAtomically(prdRecordPath(stateDirectory), record);
}

export function readSessionRecord(stateDirectory: string, phaseKey: string, sessionId: string): SessionRecord | undefined {
  const record = readJson<SessionRecord>(join(sessionDirectory(stateDirectory, phaseKey, sessionId), "session.json"));
  if (!record) return undefined;
  if (record.schemaVersion > SCHEMA_VERSION) throw new NewerSchemaError("This session needs a newer Kiln. Update Kiln.");
  if (record.schemaVersion < 4) record.agentId = "claude_code";
  assertAgent(record.agentId);
  record.schemaVersion = SCHEMA_VERSION;
  return record;
}

export function writeSessionRecord(stateDirectory: string, record: SessionRecord): void {
  if (record.schemaVersion > SCHEMA_VERSION) throw new NewerSchemaError("Update Kiln before writing this session.");
  const phaseKey = record.kind === "pull_request" ? PR_PHASE_KEY : record.phaseId;
  writeJsonAtomically(join(sessionDirectory(stateDirectory, phaseKey, record.sessionId), "session.json"), record);
}
