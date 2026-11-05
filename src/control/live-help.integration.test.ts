// AC-BOT-02: independent semantic expectations for the built, offline help surface.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.each(["message", "take-over"].flatMap(command => [true, false].map(json => ({ command, json }))))("distinguishes live input, stopped reply and deferred pause in $command help (JSON: $json)", ({ command, json }) => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), command, "--help", ...(json ? ["--json"] : [])], { encoding: "utf8", timeout: 10000 });
  if (json) expect(JSON.parse(output)).toBeTypeOf("object");
  if (command === "message") {
    expect(output).toContain("message sends to running Claude; reply resumes a stopped conversation.");
    expect(output).toContain("take-over waits for a safe stopping point; request-pause waits for the whole phase/audit and its completion checks.");
  } else {
    expect(output).toContain("reply resumes stopped work; message sends to a running attempt.");
    expect(output).toContain("request-pause lets the whole phase/audit, commits, pushes and required checks finish.");
    expect(output).toContain("finish the current operation, then stop before starting more work.");
  }
});
