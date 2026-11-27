// The plan read (Kiln Requirements Stages, technical design "Reading it"): one short session, on
// the Requirements stages choice, in an empty directory under the state root. It belongs to no
// PRD record, so no PRD's totals count it; its files are kept under
// `<state root>/requirements-plan/<session id>/`. It has a 10-minute limit, no resume and no
// fallback, and no done check: its only result is the `kiln-plan` block.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { SCHEMA_VERSION, writeSessionRecord, type AgentId, type SessionRecord, type SessionRun } from "../state/records.js";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { launchArguments, runSessionProcess, type SessionControl } from "../session/claude-session.js";
import { runCodexSession } from "../session/codex-session.js";
import { planReadPrompt } from "../session/prompts.js";
import { PLAN_READ_LIMIT_MS, readPlanBlock, type PlanStage } from "./plan.js";
import type { Skill } from "./stages.js";

/** The state root's folder that holds every plan-read session; its name is the sessions' storage key. */
export const PLAN_SESSIONS = "requirements-plan";

export interface PlanReadOptions {
  agentId: AgentId;
  choice: { model: string; modelName: string; effort?: string };
  claude: string;
  codex?: string;
  env: NodeJS.ProcessEnv;
  root: string;
  skillPath: string;
  methodFolder: string;
  signal: AbortSignal;
  limitMs?: number;
}

export type PlanReadResult = { ok: true; stages: PlanStage[]; reviewSkill: Skill; sessionId: string } | { ok: false; reason: string; sessionId?: string; /** Kiln stopped it: no failure is saved. */ stopped?: true };

/**
 *   await runPlanRead({ agentId: "claude_code", choice: { model: "claude-fable-5-2", modelName: "Fable 5.2", effort: "high" }, … })
 *   // { ok: true, stages: [{ skill: "prd-writing-standards", title: "Write the PRD", reaches: [] }, …], reviewSkill: { … }, sessionId }
 */
export async function runPlanRead(options: PlanReadOptions): Promise<PlanReadResult> {
  const sessionId = randomUUID();
  const directory = join(options.root, PLAN_SESSIONS, sessionId, "work");
  ensurePrivateDirectory(directory);
  const record: SessionRecord = {
    schemaVersion: SCHEMA_VERSION, sessionId, phaseId: PLAN_SESSIONS, kind: "requirements", agentId: options.agentId,
    createdAt: new Date().toISOString(), model: options.choice.model, modelDisplayName: options.choice.modelName,
    ...(options.choice.effort ? { effort: options.choice.effort } : {}), workingDirectory: directory, runs: [], sleeps: [], steps: [],
  };
  writeSessionRecord(options.root, record);
  const prompt = planReadPrompt({ skillPath: options.skillPath, methodFolder: options.methodFolder });
  let control: SessionControl | undefined;
  let timedOut = false;
  const end = () => control?.endTree("SIGTERM");
  const timer = setTimeout(() => { timedOut = true; end(); }, options.limitMs ?? PLAN_READ_LIMIT_MS);
  timer.unref();
  options.signal.addEventListener("abort", end, { once: true });
  let run: SessionRun;
  try {
    run = options.agentId === "codex"
      ? await runCodexSession({ executable: options.codex ?? "codex", cwd: directory, writableRoots: [directory], repositories: [], planRead: true, env: options.env, signal: options.signal, record, stateDirectory: options.root, prompt, cause: "launch", onSpawned: one => { control = one; } })
      : await runSessionProcess({ claude: options.claude, args: launchArguments(sessionId, record.model, record.effort), cwd: directory, env: options.env, prompt, cause: "launch", stateDirectory: options.root, record, onSpawned: one => { control = one; } });
  } catch (error) {
    if (options.signal.aborted) return { ok: false, reason: "Kiln stopped while the plan was being read.", sessionId, stopped: true };
    return { ok: false, reason: `The session reading the plan couldn't start: ${(error as Error).message}`, sessionId };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", end);
  }
  if (timedOut) return { ok: false, reason: "The session reading the plan ran past its 10-minute limit.", sessionId };
  if (options.signal.aborted) return { ok: false, reason: "Kiln stopped while the plan was being read.", sessionId, stopped: true };
  if (run.spawnError) return { ok: false, reason: `The session reading the plan couldn't start: ${run.spawnError.message}`, sessionId };
  const read = readPlanBlock(run.result?.text ?? "");
  if ("problem" in read) return { ok: false, reason: read.problem, sessionId };
  return { ok: true, ...read, sessionId };
}
