// Validate before allocating an implementation attempt. No thread or turn is created here.
import { realpathSync } from "node:fs";
import { readCodexMetadata } from "../agents/codex-metadata.js";
import { belowMinimumProblem, compareToMinimum, POWERSHELL_MISSING } from "../agents/tooling-minimums.js";
import { CodexMetadataRpc } from "../agents/codex-metadata-rpc.js";
import { comparable } from "../engine/worktree-setup.js";
import { findExecutable, runHelper } from "../platform/helper-process.js";
import type { AgentChoice, CodexAccountProvenance, CodexExecutionProfile } from "../state/records.js";
import { codexWindowsJob } from "../platform/codex-windows-job.js";
import type { AgentAccount } from "../agents/metadata.js";

export interface PreparedCodexLaunch { profile: CodexExecutionProfile; account: CodexAccountProvenance; choice: AgentChoice; usage: AgentAccount }
export interface CodexLaunchOptions {
  executable: string; cwd: string; writableRoots: string[];
  repositories: { path: string; branch: string }[];
  choice: AgentChoice; env: NodeJS.ProcessEnv; signal?: AbortSignal;
}
export const codexServerArguments = (owner?: string): string[] => [...(process.platform === "win32" ? ["-c", "windows.sandbox=mxc"] : []), ...(owner ? ["-c", `shell_environment_policy.set.KILN_CODEX_PROCESS_OWNER='${owner}'`] : []), "app-server", "--listen", "stdio://"];

export async function prepareCodexLaunch(options: CodexLaunchOptions): Promise<PreparedCodexLaunch> {
  const cwd = realpathSync(options.cwd);
  const writableRoots = [...new Set(options.writableRoots.map(path => realpathSync(path)))];
  if (!writableRoots.length || !options.repositories.length) throw new Error("Codex needs assigned workspace roots and repositories.");
  const paths = options.repositories.map(repository => realpathSync(repository.path));
  const contains = (root: string, path: string) => comparable(path) === comparable(root) || comparable(path).startsWith(comparable(root) + (process.platform === "win32" ? "\\" : "/"));
  if (paths.some(path => !writableRoots.some(root => contains(root, path))) || !writableRoots.some(root => contains(root, cwd))) throw new Error("Codex launch directory and every assigned worktree must be inside the granted roots.");
  if (options.repositories.some(repository => !repository.branch.trim())) throw new Error("Every Codex worktree needs its assigned branch.");
  const metadata = await readCodexMetadata({ executable: options.executable, cwd, cwds: [...new Set([cwd, ...paths])], env: options.env, ...(options.signal ? { signal: options.signal } : {}) });
  if (metadata.blockers.length) throw new Error(metadata.blockers.join("\n"));
  const model = metadata.models?.find(model => model.value === options.choice.model);
  if (!model || metadata.modelListError) throw new Error("Codex's requested model is unavailable. Refresh and confirm a valid choice.");
  if (model.supportsEffort ? !options.choice.effort || !model.supportedEffortLevels.includes(options.choice.effort) : options.choice.effort !== undefined) throw new Error("Codex's requested reasoning effort is unavailable for this model.");
  if (metadata.account.error || metadata.account.stale) throw new Error("Fresh Codex ChatGPT authentication is required before work.");
  const profile: CodexExecutionProfile = { version: metadata.version!, cwd, writableRoots, repositories: options.repositories.map((repository, i) => ({ ...repository, path: paths[i]! })), skills: metadata.skills.find(entry => entry.cwd === cwd)!.entries.filter(skill => skill.enabled).map(({ name, path }) => ({ name, path })) };
  if (process.platform === "win32") {
    const deadline = Date.now() + 30_000;
    const rpc = new CodexMetadataRpc(options.executable, cwd, options.env, options.signal, 30_000, codexServerArguments());
    try {
      await rpc.initialize();
      const ready = await rpc.call<{ status: string }>("windowsSandbox/readiness", null);
      if (ready.status !== "ready") throw new Error(`Codex Windows MXC sandbox is ${ready.status}. Complete Codex sandbox setup/update in a terminal; Kiln will not provision or bypass it.`);
    } finally { await rpc.close(); }
    const startup = await runHelper(options.executable, ["-c", "windows.sandbox=mxc", "sandbox", "--include-managed-config", "--permission-profile", ":workspace", "--", "cmd.exe", "/d", "/c", "echo", "MXC_OK"], { cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: Math.max(1, deadline - Date.now()) });
    if (startup.exitCode !== 0 || !startup.stdout.split(/\r?\n/).includes("MXC_OK")) throw new Error("Codex Windows MXC startup check failed. Resolve sandbox readiness in Codex before starting Kiln work.");
    const { executable, version: powerShellVersion } = await readPowerShellForCodex({ cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: Math.max(1, deadline - Date.now()) });
    const job = codexWindowsJob(options.executable, ["--version"], cwd, executable, options.env);
    const supervised = await runHelper(job.executable, job.args, { cwd, env: job.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: Math.max(1, deadline - Date.now()) });
    if (supervised.exitCode !== 0 || supervised.stdout.trim() !== metadata.versionOutput) throw new Error("Codex Windows Job Object startup failed. Resolve PowerShell/application restrictions in a terminal before work; Kiln will not bypass them.");
    profile.powerShell = { executable, version: powerShellVersion };
  }
  return { profile, choice: { ...options.choice }, usage: metadata.account, account: { at: metadata.account.updatedAt, ...(metadata.account.accountId ? { accountId: metadata.account.accountId } : {}), ...(metadata.account.email ? { email: metadata.account.email } : {}), ...(metadata.account.plan ? { plan: metadata.account.plan } : {}) } };
}

/**
 * The PowerShell check before each Codex launch on Windows (AC-AGENT-05): `pwsh` missing or below
 * its minimum refuses the launch as a Codex readiness blocker; a version Kiln can't read proceeds,
 * and the supervised Job Object startup check decides (technical design, PowerShell row).
 */
export async function readPowerShellForCodex(options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number }): Promise<{ executable: string; version: string }> {
  const executable = findExecutable("pwsh", options.env);
  if (!executable) throw new Error(POWERSHELL_MISSING);
  const read = await runHelper(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], options);
  const reading = compareToMinimum("powershell", read.exitCode === 0 ? read.stdout : undefined);
  if (reading.state === "below_minimum") throw new Error(belowMinimumProblem("powershell", reading.version!));
  return { executable, version: reading.version ?? "unrecognised" };
}

export interface CodexEffectiveSettings {
  model: string; reasoningEffort?: string | null; modelProvider: string; cwd: string;
  approvalPolicy: string; approvalsReviewer: string;
  sandbox: { type: string; writableRoots?: string[]; networkAccess?: boolean };
  instructionSources?: string[];
  thread: { id: string; sessionId: string; ephemeral: boolean; path?: string | null };
}
export function codexThreadParameters(prepared: PreparedCodexLaunch): Record<string, unknown> {
  return { cwd: prepared.profile.cwd, model: prepared.choice.model, modelProvider: "openai", sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "auto_review", config: { model_reasoning_effort: prepared.choice.effort ?? null, sandbox_workspace_write: { writable_roots: prepared.profile.writableRoots, network_access: true } } };
}
export function assertCodexEffective(result: CodexEffectiveSettings, prepared: PreparedCodexLaunch): void {
  assertCodexEffectiveProfile(result, prepared);
  if (!result.thread.id || !result.thread.sessionId || result.thread.ephemeral !== false) throw new Error("Codex did not establish a durable conversation identity.");
}

/** The launch's settings comparison without the durable identity, which the ephemeral launch-settings probe never has (waivers "Check Runs"). */
export function assertCodexEffectiveProfile(result: CodexEffectiveSettings, prepared: PreparedCodexLaunch): void {
  if (result.model !== prepared.choice.model || (result.reasoningEffort ?? undefined) !== prepared.choice.effort || result.modelProvider !== "openai" || comparable(result.cwd) !== comparable(prepared.profile.cwd)) throw new Error("Codex refused the recorded model, effort, provider or launch directory; no work was dispatched.");
  // Workspace-write always grants cwd. Codex omits it from the additional roots
  // when the requested workspace is the launch directory itself.
  const roots = (paths: string[]) => [...new Set([prepared.profile.cwd, ...paths].map(path => comparable(realpathSync(path))))].sort();
  const actual = result.sandbox.writableRoots && roots(result.sandbox.writableRoots);
  const expected = roots(prepared.profile.writableRoots);
  if (result.approvalPolicy !== "on-request" || result.approvalsReviewer !== "auto_review" || result.sandbox.type !== "workspaceWrite" || result.sandbox.networkAccess !== true || !actual || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Codex's effective protected launch profile differs from the assigned workspace; no work was dispatched.");
}
