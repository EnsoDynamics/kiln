import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findExecutable } from "../platform/helper-process.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { auditCodexConversation } from "./codex-evidence.js";
import { readPowerShell } from "./codex-powershell.js";
import { compareToMinimum } from "../agents/tooling-minimums.js";

const executable = findExecutable("pwsh", process.env);
const parserVersion = executable ? spawnSync(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"], { encoding: "utf8", timeout: 30_000 }).stdout?.trim() : undefined;
const qualified = compareToMinimum("powershell", parserVersion).state === "supported";
const fixtures: ReturnType<typeof historyFixture>[] = [];
const fixture = () => { const f = historyFixture(); fixtures.push(f); return f; };
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });
const read = (f: ReturnType<typeof fixture>, body: string, platform: NodeJS.Platform = process.platform, cwd = f.root) => readPowerShell(body, { executable: executable!, cwd, env: f.sandbox.env, signal: AbortSignal.timeout(10_000), context: { platform, home: f.codexHome } });

it.skipIf(!executable)("requires PowerShell at or above its minimum on this host", async () => {
  const f = fixture();
  if (qualified) expect((await read(f, "Write-Output proof")).paths).toEqual([]);
  else await expect(read(f, "Write-Output proof")).rejects.toThrow(`PowerShell ${parserVersion} can't read this command`);
});

// An absent/unqualified host is a visible native-profile proof gap, never simulated support.
describe.skipIf(!qualified)("actual non-executing PowerShell parser at or above its minimum", () => {
  it("reads literals, assignments, pipelines, redirects and moves as data without performing them", async () => {
    const f = fixture(); const destination = join(f.root, "must-not-exist.txt");
    const result = await read(f, `$p = '${destination}'; Set-Content -LiteralPath $p -Value 'proof'; 'more' | Out-File -FilePath '${destination}'; Move-Item -LiteralPath 'old.txt' -Destination 'folder'; 'redirect' > 'redirect.txt'`);
    expect(result.paths).toContain(destination); expect(result.paths).toContain(join(f.root, "old.txt")); expect(result.paths).toContain(join(f.root, "folder", "old.txt")); expect(result.paths).toContain(join(f.root, "redirect.txt"));
    expect(existsSync(destination)).toBe(false);
  });
  it("places supported append, remove and file/directory creation without changing the fixture", async () => {
    const f = fixture(); const existing = join(f.root, "existing.txt"); writeFileSync(existing, "original");
    const result = await read(f, `Add-Content -LiteralPath '${existing}' -Value 'appended'; Remove-Item -LiteralPath '${existing}'; New-Item -ItemType File -Path '${f.root}' -Name 'created.txt'; New-Item -ItemType Directory -Path '${f.root}' -Name 'created-folder'`);
    expect(result.paths).toEqual([existing, existing, join(f.root, "created.txt"), join(f.root, "created-folder")]);
    expect(result.git).toEqual([]); expect(readFileSync(existing, "utf8")).toBe("original");
    expect(existsSync(join(f.root, "created.txt"))).toBe(false); expect(existsSync(join(f.root, "created-folder"))).toBe(false);
  });
  it("tracks location stacks and Git options without running Git", async () => {
    const f = fixture(); const result = await read(f, `Push-Location '${f.outside}'; git -C . commit -m proof; Pop-Location; git status`);
    expect(result.git.map(git => [git.subcommand, git.place])).toEqual([["commit", f.outside], ["status", f.root]]);
    expect(existsSync(join(f.outside, "proof"))).toBe(false);
  });
  it("resolves native drive and UNC literals using Windows path semantics", async () => {
    const f = fixture();
    const result = await readPowerShell("Set-Content -LiteralPath 'C:\\assigned\\proof.txt' -Value x; Copy-Item -LiteralPath 'C:\\assigned\\old.txt' -Destination '\\\\server\\share\\folder'", { executable: executable!, cwd: f.root, env: f.sandbox.env, signal: AbortSignal.timeout(10_000), context: { platform: "win32", home: "C:\\Users\\test" } });
    expect(result.paths).toContain("C:\\assigned\\proof.txt"); expect(result.paths).toContain("\\\\server\\share\\folder\\old.txt");
  });
  it.each([
    "cpi -LiteralPath /inside/file -Destination /outside/file", "sl /outside; git commit -m proof", "sal git Set-Content", "si -LiteralPath /outside/file -Value x", "nv p /outside", "set p /outside", "Import-Module unknown", "$p='inside'; Get-Content x -OutVariable p; Set-Content -LiteralPath $p -Value x", "zsh -c 'git -C /outside commit -m proof'", "bash.exe -c 'git -C /outside commit -m proof'", "sh.exe -c 'git -C /outside commit -m proof'", "zsh.exe -c 'git -C /outside commit -m proof'", "/usr/local/bin/zsh.exe -c 'git -C /outside commit -m proof'", "Microsoft.PowerShell.Management\\Set-Content -LiteralPath '/tmp/not-written' -Value x", `${executable} -Command 'Set-Content -LiteralPath /tmp/not-written -Value x'`, "C:\\Windows\\System32\\cmd.exe /c git push", "Invoke-Expression 'Remove-Item /tmp/sentinel'", "& $command 'x'", ". './other.ps1'", "Set-Content -Path '*.txt' -Value x", "Remove-Item -LiteralPath $unknown", "Set-Alias git echo", "function git { echo x }; git push", "pwsh -EncodedCommand Zg==", "Set-Content -LiteralPath 'C:foo' -Value x", "Set-Content -LiteralPath 'Registry::path' -Value x", "git @args", "$p='safe'; $p='other'; Set-Content -LiteralPath $p -Value x", "if (Test-Path .) { cd other }; git commit -m x",
  ])("rejects unsupported syntax or unresolved placement: %s", async body => {
    const f = fixture(); await expect(read(f, body)).rejects.toThrow();
  });
  it.each(["OutV", "OutVariable", "ov", "ErrorV", "ErrorVariable", "ev", "WarningV", "WarningVariable", "wv", "InformationV", "InformationVariable", "iv", "PipelineV", "PipelineVariable", "pv"])("rejects the whole common variable-parameter prefix class: %s", async parameter => {
    const f = fixture();
    await expect(read(f, `$p='inside'; Write-Output '/outside/file' -${parameter} p; Set-Content -LiteralPath $p -Value x`)).rejects.toThrow("variable mutation");
  });
  it("uses recorded PowerShell argv in the full conversation audit", async () => {
    const f = fixture(); const body = `Set-Content -LiteralPath '${join(f.outside, "native.txt")}' -Value x`;
    f.addThread("parent", { command: body, native: [executable!, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", body] });
    const result = await auditCodexConversation({ ...f.options, powerShellExecutable: executable! });
    expect(result.problems).toEqual([]); expect(result.findings.map(x => x.fact).join(" ")).toContain("native.txt"); expect(existsSync(join(f.outside, "native.txt"))).toBe(false);
  });
});
