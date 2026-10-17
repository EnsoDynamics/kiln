// The PRD record and session records Kiln keeps on disk (technical design, "Kiln's State on
// Disk"). Git and the phase documents stay the record of what is done; these remember
// settings, sessions, stops and the facts shown for finished work.

import { join } from "node:path";
import { readJson, writeJsonAtomically } from "./state-files.js";

export const SCHEMA_VERSION = 1;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface Settings {
  worktreePath: string;
  featureBranch: string;
  baseBranch: string;
  model: string;
  effort: Effort;
  keepAwake: boolean;
}

export type StopKind = "done_check" | "pull_request_check" | "not_resumable" | "plan";

export interface CheckResult {
  name: string;
  passed: boolean;
  fact: string;
}

export interface PhaseStop {
  kind: StopKind;
  at: string;
  checks: CheckResult[];
  checkedAt: string;
}

export interface PhaseFacts {
  sessionIds: string[];
  startCommit?: string;
  doneAt?: string;
  pushedSha?: string;
  commitCount?: number;
  finishedByPerson: boolean;
  stop?: PhaseStop;
}

export interface PullRequestFacts {
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
}

export interface PrdRecord {
  schemaVersion: number;
  repository: { mainCheckoutPath: string; name: string; github: string };
  prdDirectory: string;
  featureName: string;
  token: string;
  settings: Settings;
  refinementConfirmedAt?: string;
  startedAt?: string;
  setupCompletedAt?: string;
  completedAt?: string;
  baseCommit?: string;
  createdBranch?: { name: string; commit: string; baseBranch: string };
  /** Keyed by the leaf Kiln launched, or `pr` for the pull-request session. */
  phases: Record<string, PhaseFacts>;
  pause: { requestedAt?: string; activeSince?: string };
  pullRequest?: PullRequestFacts;
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
  cause: "launch" | "resume";
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
  return record;
}

export function writePrdRecord(stateDirectory: string, record: PrdRecord): void {
  writeJsonAtomically(prdRecordPath(stateDirectory), record);
}

export function readSessionRecord(stateDirectory: string, phaseKey: string, sessionId: string): SessionRecord | undefined {
  return readJson<SessionRecord>(join(sessionDirectory(stateDirectory, phaseKey, sessionId), "session.json"));
}

export function writeSessionRecord(stateDirectory: string, record: SessionRecord): void {
  const phaseKey = record.kind === "pull_request" ? PR_PHASE_KEY : record.phaseId;
  writeJsonAtomically(join(sessionDirectory(stateDirectory, phaseKey, record.sessionId), "session.json"), record);
}
