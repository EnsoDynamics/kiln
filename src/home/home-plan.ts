// The plan read the home screen starts when it opens (Kiln Requirements Stages AC-PLAN-03;
// technical design "Reading it"). The home process has no engine, so it resolves the Requirements
// stages row's first choice, checks billing and takes the plan lock itself, then runs the same
// read every PRD's Kiln runs. It never starts the read on a metered route: that waits for a PRD's
// billing approval. It belongs to no run.

import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { AgentInfo } from "../agents/metadata.js";
import { resolveSkill } from "../audit/workflow.js";
import { classify, readInventory } from "../billing/inspection.js";
import { modelDefaultsPath, readModelDefaults } from "../models/model-defaults.js";
import { resolveFamily } from "../models/resolver.js";
import { executableAvailable } from "../platform/helper-process.js";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import { launchArguments } from "../session/claude-session.js";
import { findFailure, findPlan, methodOf, readPlanFile, takePlanLock, updatePlanFile } from "../requirements/plan.js";
import { runPlanRead } from "../requirements/plan-read.js";

export interface HomePlanOptions {
  repository: string;
  tools: { claude: string; codex?: string };
  env: NodeJS.ProcessEnv;
  /** The home's own state directory, where the agent readers keep what they read. */
  homeState: string;
  signal: AbortSignal;
}

/** What came of it, for the home list's plan line and for tests. */
export type HomePlanOutcome = "read" | "known" | "failed" | "metered" | "busy" | "unavailable";

/**
 *   await readPlanForHome({ repository: "/work/acme-shop", tools, env, homeState, signal })  // "read"
 */
export async function readPlanForHome(options: HomePlanOptions): Promise<HomePlanOutcome> {
  const { env, signal, repository } = options;
  const defaultsFile = modelDefaultsPath(env);
  const root = dirname(defaultsFile);
  const defaults = readModelDefaults(defaultsFile);
  if (!defaults.ok) return "unavailable";
  const row = defaults.defaults.rows.requirements;
  const choice = row.first.agentId === "claude_code" && !executableAvailable(options.tools.claude, env) ? row.fallback : row.first;
  const agentId = choice.agentId;
  const found = await resolveSkill({ name: "using-the-enso-method", agent: agentId, cwd: repository, claude: options.tools.claude, ...(options.tools.codex ? { codex: options.tools.codex } : {}), env, signal });
  if (found.kind !== "found") return "unavailable";
  let method: ReturnType<typeof methodOf>;
  try { method = methodOf(found.skill.path, env); } catch { return "unavailable"; }
  const file = readPlanFile(root);
  if (findPlan(file, agentId, method.fingerprint)) return "known";
  if (findFailure(file, agentId, method.fingerprint)) return "failed";
  if (file.reading && await isProcessLive(file.reading.pid, file.reading.processStartTime)) return "busy";
  const failed = (reason: string): HomePlanOutcome => {
    updatePlanFile(root, one => { (one.failures[agentId] ??= {})[method.fingerprint] = { reason, at: new Date().toISOString() }; });
    return "failed";
  };
  const info = new AgentInfo({ agentId, executable: options.tools, cwd: repository, claudeCwd: options.homeState, env });
  let launchEnv = env;
  let resolved: ReturnType<typeof resolveFamily>;
  try {
    await info.refreshModels();
    if (signal.aborted) return "unavailable";
    resolved = resolveFamily(choice, { ...(info.state.models ? { models: info.state.models } : {}), ...(info.state.modelListError ? { error: info.state.modelListError } : {}) });
    if (resolved.problem || !resolved.model) return failed(resolved.problem ?? "The Requirements stages choice has no model to read the plan on.");
    if (agentId === "claude_code") {
      const read = await readInventory({ executable: options.tools.claude, cwd: repository, env, args: launchArguments(randomUUID(), resolved.model, resolved.effort), signal });
      const auth = await info.refreshClaudeForLaunch(repository, read.projected, signal);
      const inspection = classify({ cwd: repository, env, read, auth, at: new Date().toISOString() });
      // On a metered route the read waits for a PRD's billing approval (AC-PLAN-03).
      if (inspection.summary.route === "metered") return "metered";
      if (inspection.readinessError) return failed(inspection.readinessError);
      launchEnv = inspection.launchEnv;
    }
  } catch (error) {
    if (signal.aborted) return "unavailable";
    return failed(error instanceof Error ? error.message : "Kiln couldn't prepare the plan read.");
  } finally { info.close(); }
  const startedAt = new Date().toISOString();
  const release = await takePlanLock(root, { agentId, fingerprint: method.fingerprint, startedAt, pid: process.pid, processStartTime: await processStartTime(process.pid) ?? "" });
  if (!release) return "busy";
  try {
    const result = await runPlanRead({ agentId, choice: { model: resolved.model, modelName: resolved.modelName, ...(resolved.effort ? { effort: resolved.effort } : {}) }, claude: options.tools.claude, ...(options.tools.codex ? { codex: options.tools.codex } : {}), env: launchEnv, root, skillPath: found.skill.path, methodFolder: method.folder, signal });
    const at = new Date().toISOString();
    if (result.ok) {
      updatePlanFile(root, one => {
        (one.plans[agentId] ??= {})[method.fingerprint] = { methodUpdatedAt: method.updatedAt, readAt: at, usedAt: at, stages: result.stages, reviewSkill: result.reviewSkill };
        delete one.failures[agentId]?.[method.fingerprint];
      });
      return "read";
    }
    if (result.stopped) return "unavailable";
    updatePlanFile(root, one => { (one.failures[agentId] ??= {})[method.fingerprint] = { reason: result.reason, at }; });
    return "failed";
  } finally { release(); }
}
