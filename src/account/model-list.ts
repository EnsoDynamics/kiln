// The models Claude Code offers the signed-in account, and how the Model and Effort settings
// follow them (PRD AC-START-06, UI-004, UI-011; technical design, "Account and Usage"). No
// `claude` command lists them; the Agent SDK's `supportedModels()` does, pointed at the
// person's own `claude`. Skill readiness shares its bounded, prompt-free helper through
// `supportedCommands()`, loading the actual launch directory's user and project settings.

import type { ChildProcess } from "node:child_process";
import { query, type ModelInfo, type Query, type SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { endProcessTree, HELPER_TIMEOUT_MS, spawnDetached } from "../platform/helper-process.js";
import { modelNameFromId } from "../session/claude-session.js";
import { EFFORT_LEVELS, type Effort } from "../state/records.js";

/** One model as Kiln keeps it from the list. */
export interface ModelEntry {
  value: string;
  resolvedModel: string;
  /** Kiln's name, made from the model ID: "Opus 5.5". */
  displayName: string;
  description: string;
  supportsEffort: boolean;
  supportedEffortLevels: Effort[];
  supportsAutoMode: boolean;
  defaultEffort?: string;
  efforts?: { value: string; label: string; description?: string }[];
}

/** The model a new PRD starts on: the latest Opus (UI-004). */
export const DEFAULT_MODEL = "opus";

/**
 * The Model list's entries from `supportedModels()`: the family-alias entries (`opus`, `fable`,
 * `sonnet`, …), one per resolved model, leaving out `default`, concrete and legacy IDs, and
 * entries Claude Code marks `disabled: true`.
 *
 *   modelEntries(recorded).map((entry) => entry.displayName)  // ["Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 5.5"]
 */
export function modelEntries(models: (ModelInfo & { disabled?: boolean })[]): ModelEntry[] {
  const entries: ModelEntry[] = [];
  const seen = new Set<string>();
  for (const model of models) {
    if (model.disabled === true || model.value === "default" || !/^[a-z]+$/.test(model.value)) continue;
    const resolved = model.resolvedModel ?? model.value;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    entries.push({
      value: model.value,
      resolvedModel: resolved,
      displayName: modelNameFromId(resolved),
      description: model.description,
      supportsEffort: model.supportsEffort === true,
      supportedEffortLevels: (model.supportedEffortLevels ?? []).filter((level) => EFFORT_LEVELS.includes(level)),
      supportsAutoMode: model.supportsAutoMode === true,

    });
  }
  return entries;
}

/**
 * The effort levels the chosen model takes: its supported levels, `[]` for a model that takes no
 * effort, and `null` when Kiln has no entry for it, so all five stay enabled (UI-011).
 */
export function effortLevelsFor(entry: ModelEntry | undefined): Effort[] | null {
  if (entry === undefined) return null;
  return entry.supportsEffort ? entry.efforts ? entry.supportedEffortLevels : EFFORT_LEVELS.filter((level) => entry.supportedEffortLevels.includes(level)) : [];
}

/**
 * The effort to keep for a model: the saved one when the model takes it, else the highest
 * supported level below it, else the lowest supported level (UI-011 item 1). A model that takes
 * no effort keeps the saved effort for the next model that does.
 *
 *   effortFor("max", entryUpToHigh)  // "high"
 */
export function effortFor(saved: Effort, entry: ModelEntry | undefined): Effort {
  const levels = effortLevelsFor(entry);
  if (levels === null || levels.length === 0 || levels.includes(saved)) return saved;
  const below = levels.filter((level) => EFFORT_LEVELS.indexOf(level) < EFFORT_LEVELS.indexOf(saved));
  return below.at(-1) ?? levels[0]!;
}

/** The message beside Model when a session on it couldn't run in auto mode, as proof gate 1 found. */
export function autoModeError(entry: ModelEntry | undefined): string | undefined {
  if (entry === undefined || entry.supportsAutoMode) return undefined;
  return `${entry.displayName} can’t run unattended on this account; it needs auto mode.`;
}

/** An unavailable catalogue blocks new sessions (Codex support PRD AC-MODEL-02). */
export const modelListErrorMessage = (error: string) => /^(timed out after \d+ seconds|Kiln is stopping)$/.test(error)
  ? `Couldn’t load Claude Code’s models: ${error}`
  : "Couldn’t load Claude Code’s models. Check Claude Code in a terminal, then refresh agent information.";

export interface ModelListOptions {
  claude: string;
  env: NodeJS.ProcessEnv;
  /** State directory for models; actual launch directory for enabled-skill discovery. */
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ModelListResult = { ok: true; models: ModelEntry[] } | { ok: false; error: string };

/**
 * Asks the person's own `claude` for its model list without sending a prompt, then closes the
 * query. The child is spawned detached, like every helper call, and its stderr is read for the
 * error a failure shows.
 */
export async function readModelList(options: ModelListOptions): Promise<ModelListResult> {
  const result = await readCatalogue(options, q => q.supportedModels(), false);
  return result.ok ? { ok: true, models: modelEntries(result.value) } : result;
}

export type SkillListResult = { ok: true; skills: string[] } | { ok: false; error: string };

/** Read the skills Claude actually enables here, including plugin-qualified skills, without a prompt. */
export async function readSkillList(options: ModelListOptions): Promise<SkillListResult> {
  const result = await readCatalogue(options, q => q.supportedCommands(), true);
  return result.ok ? { ok: true, skills: result.value.map(command => command.name) } : result;
}

async function readCatalogue<T>(options: ModelListOptions, read: (q: Query) => Promise<T>, loadSettings: boolean): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  if (options.signal?.aborted) return { ok: false, error: "Kiln is stopping" };
  let stderr = "";
  let child: ChildProcess | undefined;
  const abort = new AbortController();
  // Ends the empty prompt stream once the query is done with.
  const finished = new AbortController();
  const q = query({
    prompt: noPrompt(finished.signal),
    options: {
      pathToClaudeCodeExecutable: options.claude,
      cwd: options.cwd,
      persistSession: false,
      // Skill discovery must use the same settings as an ordinary CLI session. Model
      // discovery stays isolated from project settings, as before.
      settingSources: loadSettings ? ["user", "project", "local"] : [],
      env: options.env,
      abortController: abort,
      spawnClaudeCodeProcess: (spawnOptions: SpawnOptions) => {
        // The SDK may defer spawning until after close/abort. Never start that late helper.
        if (abort.signal.aborted || options.signal?.aborted || spawnOptions.signal.aborted) throw new Error("Kiln is stopping");
        child = spawnDetached(spawnOptions.command, spawnOptions.args, { cwd: spawnOptions.cwd ?? options.cwd, env: spawnOptions.env as NodeJS.ProcessEnv, stdin: "pipe" });
        child.stderr!.setEncoding("utf8").on("data", (text: string) => (stderr += text));
        // When the SDK ends the child it ends the whole tree, so a .cmd shim's claude goes with it on Windows.
        const spawned = child;
        spawned.kill = (signal?: NodeJS.Signals | number) => {
          void endProcessTree(spawned.pid, typeof signal === "string" ? signal : "SIGTERM");
          return true;
        };
        spawnOptions.signal.addEventListener("abort", () => endProcessTree(spawned.pid, "SIGTERM"), { once: true });
        return child as ChildProcess & { stdin: NonNullable<ChildProcess["stdin"]>; stdout: NonNullable<ChildProcess["stdout"]> };
      },
    },
  });
  let timer: NodeJS.Timeout | undefined;
  const stop = () => abort.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    const timeoutMs = options.timeoutMs ?? HELPER_TIMEOUT_MS;
    const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)));
    const aborted = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("Kiln is stopping")), { once: true }));
    const value = await Promise.race([read(q), timeout, aborted]);
    return { ok: true, value };
  } catch (error) {
    const detail = stderr.trim().split(/\r?\n/).filter((line) => line.trim() !== "").at(-1);
    return { ok: false, error: detail ?? (error as Error).message };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
    q.close();
    finished.abort();
    // The SDK ends only the process it spawned; on Windows that is the .cmd shim's cmd.exe, and
    // the claude it started lives on. Its whole tree goes, so no helper outlives the call.
    await endProcessTree(child?.pid, "SIGTERM");
  }
}

/** The query's input: nothing is ever sent, and it ends when the query does. */
// eslint-disable-next-line require-yield -- never yields: the query sends no prompt
async function* noPrompt(signal: AbortSignal): AsyncGenerator<never> {
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}
