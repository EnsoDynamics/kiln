// AC-RECOVER-02: run the copyable command against a capturing executable, never Codex.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { codexResumeCommand } from "../engine/snapshot.js";
import type { SessionRecord } from "../state/records.js";

it("executes the saved directory, home, thread and original pair literally in the native terminal command", () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-resume-command-"));
  try {
    const folder = join(root, "work ' $(unsafe)"); mkdirSync(folder);
    const home = join(root, "home ' $(unsafe)"); mkdirSync(home);
    const capture = join(root, "capture.cjs");
    writeFileSync(capture, "console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),home:process.env.CODEX_HOME}));\n");
    const windows = process.platform === "win32";
    const command = join(root, windows ? "codex.cmd" : "codex");
    writeFileSync(command, windows ? `@"${process.execPath}" "${capture}" %*\r\n` : `#!${process.execPath}\nrequire(${JSON.stringify(capture)});\n`);
    chmodSync(command, 0o755);
    const record = { model: "saved-model'$(unsafe)", effort: "high", conversation: { threadId: "saved-thread", codexHome: home } } as SessionRecord;
    for (const effort of ["high", undefined]) {
      if (effort) record.effort = effort; else delete record.effort;
      const text = codexResumeCommand(folder, record);
      const stdout = execFileSync(windows ? "pwsh" : "/bin/sh", windows ? ["-NoProfile", "-NonInteractive", "-Command", text] : ["-c", text], { encoding: "utf8", timeout: 10_000, env: { ...process.env, PATH: root + delimiter + process.env.PATH } });
      expect(JSON.parse(stdout)).toEqual({ cwd: realpathSync(folder), home, args: ["resume", "saved-thread", "--model", "saved-model'$(unsafe)", ...(effort ? ["-c", 'model_reasoning_effort="high"'] : [])] });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("serializes the saved original pair and home for PowerShell without interpolating quoted values", () => {
  const record = { model: "saved-model'$(unsafe)", effort: "high", conversation: { threadId: "saved-thread", codexHome: "C:\\home ' quoted" } } as SessionRecord;
  expect(codexResumeCommand("C:\\work ' quoted", record, "win32")).toBe(`cd 'C:\\work '' quoted'; $env:CODEX_HOME='C:\\home '' quoted'; codex 'resume' 'saved-thread' '--model' 'saved-model''$(unsafe)' '-c' 'model_reasoning_effort="high"'`);
  delete record.effort;
  expect(codexResumeCommand("C:\\work ' quoted", record, "win32")).toBe(`cd 'C:\\work '' quoted'; $env:CODEX_HOME='C:\\home '' quoted'; codex 'resume' 'saved-thread' '--model' 'saved-model''$(unsafe)'`);
});
