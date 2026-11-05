import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sandbox } from "./git-repositories.js";
export function installCodexMetadataFixture(sandbox: Sandbox) {
  const directory = join(sandbox.root, "codex-bin"); mkdirSync(directory, { recursive: true });
  const script = fileURLToPath(new URL("../../test/stand-ins/codex-metadata-stand-in.mjs", import.meta.url));
  const executable = join(directory, process.platform === "win32" ? "codex.cmd" : "codex");
  writeFileSync(executable, process.platform === "win32" ? `@"${process.execPath}" "${script}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`); chmodSync(executable, 0o755);
  const fixture = join(directory, "metadata.json"); const skillPath = join(directory, "SKILL.md"); writeFileSync(skillPath, "# Fixture method skill\n");
  const set = (value: Record<string, unknown>) => writeFileSync(fixture, JSON.stringify({ skillPath, ...value })); set({});
  const calls = () => { try { return readFileSync(`${fixture}.calls`, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { method: string; params: Record<string, unknown> }); } catch { return []; } };
  return { executable, env: { ...sandbox.env, KILN_CODEX_METADATA: fixture }, set, calls };
}
