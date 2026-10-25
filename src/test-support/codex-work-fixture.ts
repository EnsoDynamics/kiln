import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepository, createSandbox } from "./git-repositories.js";
import { sessionDirectory, SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import type { CodexSessionOptions } from "../session/codex-session.js";
import { findExecutable } from "../platform/helper-process.js";

export function codexWorkFixture() {
  const sandbox = createSandbox();
  const root = createRepository(sandbox, "assigned");
  const home = join(sandbox.root, "codex-home"); mkdirSync(home);
  const stateDirectory = join(sandbox.root, "state");
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "codex", sessionId: "local-session", phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "gpt-6.1-sol", modelDisplayName: "GPT-6.1-Sol", effort: "high", runs: [], sleeps: [], steps: [] };
  const peer = fileURLToPath(new URL("../../test/stand-ins/codex-work-stand-in.mjs", import.meta.url));
  const executable = join(sandbox.root, process.platform === "win32" ? "codex.cmd" : "codex");
  writeFileSync(executable, process.platform === "win32" ? `@"${process.execPath}" "${peer}" %*\r\n` : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${peer.replaceAll("'", "'\\''")}' "$@"\n`); chmodSync(executable, 0o755);
  const skill = join(sandbox.root, "SKILL.md"); writeFileSync(skill, "# Fixture method skill\n");
  const file = join(sandbox.root, "fixture.json");
  let powershellBin: string | undefined;
  const env: NodeJS.ProcessEnv = { ...sandbox.env, KILN_CODEX_WORK_FIXTURE: file };
  if (process.platform === "win32") {
    const realPowerShell = findExecutable("pwsh", sandbox.env);
    if (!realPowerShell) throw new Error("Windows runner process fixtures require PowerShell Core; native CLI/MXC proof remains separate.");
    const bin = join(sandbox.root, "fixture-bin"); mkdirSync(bin); powershellBin = bin;
    // This is a metadata version fixture only. Actual execution of the fixed Job Object
    // supervisor still uses the host's PowerShell and kernel; no native parser proof is claimed.
    writeFileSync(join(bin, "pwsh.cmd"), `@echo off\r\nif "%~4"=="-Command" (\r\necho 7.5.2\r\nexit /b 0\r\n)\r\n"${realPowerShell}" %*\r\n`);
  }
  /** Apply this peer's metadata shim without replacing the harness's Git/state isolation. */
  const configureEnvironment = (target: NodeJS.ProcessEnv) => {
    target.KILN_CODEX_WORK_FIXTURE = file;
    if (powershellBin) {
      const path = target.PATH ?? target.Path ?? "";
      for (const key of Object.keys(target)) if (key.toUpperCase() === "PATH") delete target[key];
      target.PATH = powershellBin + delimiter + path;
    }
  };
  configureEnvironment(env);
  const set = (value: Record<string, unknown>) => writeFileSync(file, JSON.stringify({ home, skill, recordPath: join(sessionDirectory(stateDirectory, "1", record.sessionId), "session.json"), ...value }));
  set({});
  const options: CodexSessionOptions = { executable, cwd: root, writableRoots: [root], repositories: [{ path: root, branch: "develop" }], env, record, stateDirectory, prompt: "Fixture input", cause: "launch" };
  const calls = () => { try { return readFileSync(file + ".calls", "utf8").trim().split("\n").map(line => JSON.parse(line) as { method?: string; id?: string | number; params?: Record<string, unknown>; result?: unknown; error?: unknown }); } catch { return []; } };
  return { sandbox, options, file, set, calls, record, home, root, configureEnvironment };
}
