import { fileURLToPath } from "node:url";

export function codexWindowsJob(executable: string, args: string[], cwd: string, powerShell: string, env: NodeJS.ProcessEnv): { executable: string; args: string[]; env: NodeJS.ProcessEnv } {
  return { executable: powerShell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("../../prompts/codex-windows-job.ps1", import.meta.url))], env: { ...env, KILN_CODEX_JOB_LAUNCH: JSON.stringify({ executable, args, cwd }) } };
}
