/** Reuse provider configuration/native policy tools; never implement a command-rule language. */
import { existsSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { boundedRead } from "../billing/bounded-process.js";
import { CodexMetadataRpc } from "../agents/codex-metadata-rpc.js";
import { runHelper } from "../platform/helper-process.js";
import { preparationDigest } from "./preparation-state.js";
import type { PreparationContext } from "./preparation-verifier.js";

export async function preparationPermissions(context: PreparationContext, establish = false): Promise<string> {
  const facts: unknown[] = [];
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) throw new Error("The required native preparation verifier sandbox is unavailable. This verifier is currently supported on macOS; no project command was launched.");
  for (const binding of context.record.preparation!.bindings) {
    const repo = context.record.repositories.find(repo => repo.name === binding.repository)!;
    if (context.record.settings.agentId === "claude_code") {
      const reading = await boundedRead(process.execPath, [fileURLToPath(new URL("../../dist/engine/preparation-permissions-worker.js", import.meta.url))], { cwd: repo.worktreePath, env: context.env, signal: context.signal, timeoutMs: 30_000 });
      if (!reading.stdout) throw new Error("Claude verification permission inspection is unavailable.");
      const value = JSON.parse(reading.stdout) as { allowed: boolean; requiresNativeEvidence?: boolean; digest?: string; reason?: string };
      if (!value.allowed || !value.digest) throw new Error(value.reason ?? "Claude verification permission could not be established.");
      if (value.requiresNativeEvidence && !establish) {
        if (!context.record.preparation!.providerPolicyDigest) throw new Error("The current preparation turn has no retained provider configuration. Resume preparation before verification.");
        await context.authorizeCommands?.();
        if (!context.authorizeCommands) throw new Error("Existing Claude tool restrictions need current preparation command evidence.");
      }
      facts.push(value.digest);
    } else {
      if (!context.codex) throw new Error("The selected Codex permission reader is unavailable.");
      const rpc = new CodexMetadataRpc(context.codex, repo.worktreePath, context.env, context.signal);
      try {
        await rpc.initialize();
        const requirements = await rpc.call<{ requirements: Record<string, unknown> | null }>("configRequirements/read");
        const configuration = await rpc.call<{ config: Record<string, unknown> }>("config/read", { includeLayers: true });
        const supported: Record<string, string> = { allowedApprovalPolicies: "on-request", allowedApprovalsReviewers: "auto_review", allowedSandboxModes: "workspace-write" };
        for (const [name, value] of Object.entries(requirements.requirements ?? {})) if (value !== null && value !== undefined && (!Array.isArray(value) || !value.includes(supported[name]))) throw new Error(`Codex managed requirement ${name} needs supported verification policy evaluation.`);
        const sandbox = configuration.config.sandbox_workspace_write as { network_access?: boolean } | null | undefined;
        if (sandbox?.network_access === false || configuration.config.sandbox_mode === "read-only") throw new Error("Existing Codex network/read-only restrictions do not permit this native verification profile. Resolve the required sandbox configuration before continuing.");
        if (configuration.config.hooks && Object.keys(configuration.config.hooks as object).length) throw new Error("Codex hooks require supported native verification policy evaluation.");
        facts.push(preparationDigest({ requirements, configuration: Object.fromEntries(["hooks", "permissions", "exec_policy", "sandbox_mode", "sandbox_workspace_write", "approval_policy", "approvals_reviewer", "shell_environment_policy"].map(key => [key, configuration.config[key]])) }));
      } finally { await rpc.close(); }
      const roots = [context.env.CODEX_HOME ?? join(homedir(), ".codex")];
      for (let path = realpathSync(repo.worktreePath);;) { roots.push(join(path, ".codex")); const parent = dirname(path); if (parent === path) break; path = parent; }
      const rules = [...new Set(roots.flatMap(root => existsSync(join(root, "rules")) ? readdirSync(join(root, "rules")).filter(name => name.endsWith(".rules")).map(name => join(root, "rules", name)) : []))].sort();
      if (rules.length) for (const check of binding.checks) {
        const response = await runHelper(context.codex, ["execpolicy", "check", ...rules.flatMap(rule => ["--rules", rule]), "--", ...check.argv], { cwd: join(repo.worktreePath, check.directory), env: context.env, signal: context.signal, timeoutMs: 30_000 });
        if (response.exitCode !== 0 || response.failure) throw new Error("Codex native command-policy evaluation failed; no verification command was launched.");
        const decision = JSON.parse(response.stdout) as { decision?: string; matchedRules?: unknown[] };
        if (decision.decision && decision.decision !== "allow") throw new Error(`Codex's native command policy requires ${decision.decision} for ${check.command}; resolve that restriction before verification.`);
        facts.push({ command: check.argv, decision: decision.decision === "allow" ? "permitted" : decision.decision ?? "permitted" });
      }
    }
  }
  const digest = preparationDigest(facts);
  if (!establish && context.record.preparation!.providerPolicyDigest && context.record.preparation!.providerPolicyDigest !== digest) throw new Error("Provider permission configuration changed during preparation. Resume the same preparation conversation under its current controls.");
  return digest;
}
export function verificationSandbox(context: PreparationContext, directory: string): { executable: string; args: string[] } {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) throw new Error("The required native verifier sandbox is unavailable.");
  const roots = [...new Set([...context.record.repositories.map(repo => realpathSync(repo.worktreePath)), realpathSync(tmpdir()), "/private/tmp"] )];
  const profile = `(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (literal "/dev/null") ${roots.map(root => `(subpath ${JSON.stringify(root)})`).join(" ")})\n`;
  const path = join(directory, "verification.sb"); writeFileSync(path, profile, { mode: 0o600 });
  return { executable: "/usr/bin/sandbox-exec", args: ["-f", path] };
}

/** Secret-bearing settings cross a bounded private pipe and remain only in process memory. */
export async function preparationEnvironment(context: PreparationContext, cwd: string): Promise<NodeJS.ProcessEnv> {
  if (context.record.settings.agentId !== "claude_code") {
    if (!context.codex) throw new Error("The Codex native environment projector is unavailable.");
    const reading = await boundedRead(context.codex, [...codexVerificationArguments(context), process.execPath, fileURLToPath(new URL("../../prompts/preparation-environment.mjs", import.meta.url))], { cwd, env: context.env, signal: context.signal, timeoutMs: 30_000 });
    if (!reading.stdout) throw new Error("Codex's native validation environment could not be projected safely.");
    const value: unknown = JSON.parse(reading.stdout);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some(entry => typeof entry !== "string")) throw new Error("Codex's native validation environment is incomplete.");
    return value as NodeJS.ProcessEnv;
  }
  const reading = await boundedRead(process.execPath, [fileURLToPath(new URL("../../dist/engine/preparation-permissions-worker.js", import.meta.url))], { cwd, env: context.env, signal: context.signal, timeoutMs: 30_000 });
  if (!reading.stdout) throw new Error("The provider validation environment could not be read.");
  const value = JSON.parse(reading.stdout) as { allowed: boolean; env?: Record<string, unknown>; reason?: string };
  if (!value.allowed || !value.env || Object.values(value.env).some(entry => typeof entry !== "string")) throw new Error(value.reason ?? "The provider validation environment is incomplete.");
  return { ...context.env, ...value.env as Record<string, string> };
}

export function codexVerificationArguments(context: PreparationContext): string[] {
  const roots = [...new Set(context.record.repositories.map(repo => realpathSync(repo.worktreePath)))];
  return ["-c", `sandbox_workspace_write.writable_roots=${JSON.stringify(roots)}`, "-c", "sandbox_workspace_write.network_access=true", "sandbox", "--include-managed-config", "--permission-profile", ":workspace", "--"];
}
export async function preparationHooks(context: PreparationContext, cwd: string): Promise<Record<string, unknown>> {
  if (context.record.settings.agentId !== "claude_code") return {};
  const reading = await boundedRead(process.execPath, [fileURLToPath(new URL("../../dist/engine/preparation-permissions-worker.js", import.meta.url))], { cwd, env: context.env, signal: context.signal, timeoutMs: 30_000 });
  if (!reading.stdout) throw new Error("Existing verification hooks could not be read.");
  const value = JSON.parse(reading.stdout) as { allowed: boolean; hooks?: Record<string, unknown>; reason?: string };
  if (!value.allowed) throw new Error(value.reason ?? "Existing verification hooks are unsupported.");
  return value.hooks ?? {};
}
