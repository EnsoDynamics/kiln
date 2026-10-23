// Validate before allocating an implementation attempt. No thread or turn is created here.
import { realpathSync } from "node:fs";
import { readCodexMetadata, CODEX_VERSION } from "../agents/codex-metadata.js";
import { CodexMetadataRpc } from "../agents/codex-metadata-rpc.js";
import { comparable } from "../engine/worktree-setup.js";
import { findExecutable, runHelper } from "../platform/helper-process.js";
import type { AgentChoice, CodexAccountProvenance, CodexExecutionProfile } from "../state/records.js";
import { POWERSHELL_VERSION } from "./codex-powershell.js";
import { codexWindowsJob } from "../platform/codex-windows-job.js";

export interface PreparedCodexLaunch { profile: CodexExecutionProfile; account: CodexAccountProvenance; choice: AgentChoice }
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
  const profile: CodexExecutionProfile = { version: CODEX_VERSION, cwd, writableRoots, repositories: options.repositories.map((repository, i) => ({ ...repository, path: paths[i]! })), skills: metadata.skills.find(entry => entry.cwd === cwd)!.entries.filter(skill => skill.enabled).map(({ name, path }) => ({ name, path })) };
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
    const executable = findExecutable("pwsh", options.env);
    if (!executable) throw new Error(`Codex Windows evidence requires pwsh ${POWERSHELL_VERSION}. Install it before starting work.`);
    const version = await runHelper(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], { cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: Math.max(1, deadline - Date.now()) });
    if (version.exitCode !== 0 || version.stdout.trim() !== POWERSHELL_VERSION) throw new Error(`Codex Windows parser requires pwsh ${POWERSHELL_VERSION}; found ${version.stdout.trim() || "unknown"}.`);
    const job = codexWindowsJob(options.executable, ["--version"], cwd, executable, options.env);
    const supervised = await runHelper(job.executable, job.args, { cwd, env: job.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: Math.max(1, deadline - Date.now()) });
    if (supervised.exitCode !== 0 || supervised.stdout.trim() !== `codex-cli ${CODEX_VERSION}`) throw new Error("Codex Windows Job Object startup failed. Resolve PowerShell/application restrictions in a terminal before work; Kiln will not bypass them.");
    profile.powerShell = { executable, version: POWERSHELL_VERSION };
  }
  return { profile, choice: { ...options.choice }, account: { at: metadata.account.updatedAt, ...(metadata.account.accountId ? { accountId: metadata.account.accountId } : {}), ...(metadata.account.email ? { email: metadata.account.email } : {}), ...(metadata.account.plan ? { plan: metadata.account.plan } : {}) } };
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
  if (result.model !== prepared.choice.model || (result.reasoningEffort ?? undefined) !== prepared.choice.effort || result.modelProvider !== "openai" || comparable(result.cwd) !== comparable(prepared.profile.cwd)) throw new Error("Codex refused the recorded model, effort, provider or launch directory; no work was dispatched.");
  const actual = result.sandbox.writableRoots?.map(path => comparable(realpathSync(path))).sort();
  const expected = prepared.profile.writableRoots.map(comparable).sort();
  if (result.approvalPolicy !== "on-request" || result.approvalsReviewer !== "auto_review" || result.sandbox.type !== "workspaceWrite" || result.sandbox.networkAccess !== true || !actual || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Codex's effective protected launch profile differs from the assigned workspace; no work was dispatched.");
  if (!result.thread.id || !result.thread.sessionId || result.thread.ephemeral !== false) throw new Error("Codex did not establish a durable conversation identity.");
}
