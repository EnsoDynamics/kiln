import { afterEach, describe, expect, it, vi } from "vitest";
import * as helpers from "../platform/helper-process.js";
import type { SessionRun } from "../state/records.js";
import { CodexOwnedProcesses } from "./codex-owned-processes.js";

afterEach(() => vi.restoreAllMocks());

// Narrow failure injection; the session integration suite also uses real ps,
// the ownership helper, saved PID/start identities and disposable OS processes.
describe.skipIf(process.platform === "win32")("Codex process-inventory diagnostics", () => {
  it.each([
    { result: { exitCode: 1, stdout: "PRIVATE_PROCESS_CANARY", stderr: "ps: access denied\n" + "x".repeat(10_000) + "DIAGNOSTIC_TAIL_CANARY" }, details: ["exit 1", "ps: access denied"] },
    { result: { exitCode: null, stdout: "", stderr: "", failure: "timed out after 5 seconds" }, details: ["timed out after 5 seconds"] },
    { result: { exitCode: null, stdout: "", stderr: "", failure: "ended by SIGTERM" }, details: ["SIGTERM"] },
    { result: { exitCode: null, stdout: "", stderr: "", failure: "spawn /bin/ps EAGAIN" }, details: ["EAGAIN"] },
  ])("retains $details instead of the generic failure", async ({ result, details }) => {
    const spawn = helpers.spawnDetached;
    // Inject only the helper's failing OS-query result; use real Node pipes and exit.
    const program = `process.stdin.resume(); process.stdin.on('end',()=>{ process.stdout.write(${JSON.stringify(result.stdout)}); process.stderr.write(${JSON.stringify(result.stderr || result.failure || "")},()=>process.exit(1)); });`;
    vi.spyOn(helpers, "spawnDetached").mockImplementation((_executable, _args, options) => spawn(process.execPath, ["-e", program], options));
    const monitor = new CodexOwnedProcesses({ pid: 123, codex: { processOwner: "00000000-0000-4000-8000-000000000000" } } as SessionRun, () => undefined, () => undefined);
    const error = await monitor.start().catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    for (const detail of details) expect((error as Error).message).toContain(detail);
    expect((error as Error).message).toContain("Could not establish Codex process ownership");
    expect((error as Error).message).not.toContain("PRIVATE_PROCESS_CANARY");
    expect((error as Error).message).not.toContain("DIAGNOSTIC_TAIL_CANARY");
    expect((error as Error).message.length).toBeLessThan(2300);
  });
});
