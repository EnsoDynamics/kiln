// Execute the copyable shell command against a disposable Claude stand-in.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { resumeCommand } from "../engine/snapshot.js";
it.skipIf(process.platform === "win32")("keeps newline, space and apostrophe cwd bytes in the conditional takeover command", () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-quoted-takeover-"));
  try {
    const folder = join(root, "folder with space and 'apostrophe\nand newline"); mkdirSync(folder);
    const output = join(root, "observed.json");
    writeFileSync(join(root, "claude"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.KILN_TEST_OUTPUT,JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));`, { mode: 0o755 });
    const command = resumeCommand(folder, "saved-conversation", process.platform, true);
    execFileSync("/bin/sh", ["-c", command], { env: { ...process.env, PATH: `${root}:${process.env.PATH}`, KILN_TEST_OUTPUT: output } });
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({ cwd: realpathSync(folder), args: ["--resume", "saved-conversation"] });
    rmSync(output);
    expect(() => execFileSync("/bin/sh", ["-c", resumeCommand(join(root, "missing\nfolder"), "saved-conversation", process.platform, true)], { env: { ...process.env, PATH: `${root}:${process.env.PATH}`, KILN_TEST_OUTPUT: output }, stdio: "pipe" })).toThrow();
    expect(() => readFileSync(output)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
