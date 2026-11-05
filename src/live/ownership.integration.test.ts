// AC-TAKE-02/04: real PID/start identities and the OS argv inventory, no ownership mock.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { processStartTime } from "../platform/process-start-time.js";
import * as identities from "../platform/process-start-time.js";
import { requireNoTerminal } from "./ownership.js";

it.skipIf(process.platform !== "darwin")("refuses registered and pending exact-conversation owners from another cwd, and excludes only the exact dispatch identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-terminal-owner-"));
  const registry = join(root, "sessions"); mkdirSync(registry);
  const elsewhere = join(root, "another-cwd"); mkdirSync(elsewhere);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: root };
  const sessionId = randomUUID();
  const owner = spawn(process.execPath, ["-e", "process.stdout.write('ready');process.stdin.resume()"], { cwd: elsewhere, stdio: ["pipe", "pipe", "pipe"] });
  const closed = once(owner, "exit"); await once(owner.stdout!, "data");
  const startTime = (await processStartTime(owner.pid!))!;
  const entry = join(registry, "owner.json");
  try {
    writeFileSync(entry, JSON.stringify({ sessionId, pid: owner.pid, procStart: startTime }));
    await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "terminal_in_use" });
    // Narrowly create an otherwise nondeterministic OS identity-read failure.
    const identity = vi.spyOn(identities, "processStartTime").mockRejectedValueOnce(new Error("identity read denied"));
    try { await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "ownership_unknown" }); }
    finally { identity.mockRestore(); }
    await expect(requireNoTerminal(env, sessionId, { pid: owner.pid!, startTime })).resolves.toBeUndefined();
    await expect(requireNoTerminal(env, sessionId, { pid: owner.pid!, startTime: "wrong-start" })).rejects.toMatchObject({ code: "terminal_in_use" });
    await expect(requireNoTerminal(env, randomUUID())).resolves.toBeUndefined();
    writeFileSync(entry, JSON.stringify({ sessionId, pid: owner.pid, procStart: "reused-PID-start" }));
    await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "ownership_unknown" });
    writeFileSync(entry, JSON.stringify({ sessionId, pid: owner.pid }));
    await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "ownership_unknown" });
    rmSync(entry); owner.stdin!.end(); await closed;
    await expect(requireNoTerminal(env, sessionId)).resolves.toBeUndefined();
    const pending = spawn(process.execPath, ["-e", "process.stdout.write('ready');process.stdin.resume()", "--", "--resume", sessionId], { argv0: join(elsewhere, "claude"), cwd: elsewhere, env: { ...process.env, CLAUDE_CONFIG_DIR: join(root, "other-config-root") }, stdio: ["pipe", "pipe", "pipe"] });
    const pendingClosed = once(pending, "exit"); await once(pending.stdout!, "data");
    try {
      // An unregistered exact-resume owner remains blocking even if its effective
      // config root differs: the observer cannot conclusively bind that startup.
      await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "terminal_in_use" });
      const pendingStart = (await processStartTime(pending.pid!))!;
      await expect(requireNoTerminal(env, sessionId, { pid: pending.pid!, startTime: pendingStart })).resolves.toBeUndefined();
      await expect(requireNoTerminal(env, randomUUID())).resolves.toBeUndefined();
    } finally { pending.stdin!.end(); await pendingClosed; }
    await expect(requireNoTerminal(env, sessionId)).resolves.toBeUndefined();
    rmSync(registry, { recursive: true });
    await expect(requireNoTerminal(env, sessionId)).rejects.toMatchObject({ code: "ownership_unknown" });
    await expect(requireNoTerminal({ ...env, CLAUDE_CONFIG_DIR: join(root, "missing-config-root") }, sessionId)).rejects.toMatchObject({ code: "ownership_unknown" });
  } finally { owner.stdin!.end(); await closed; rmSync(root, { recursive: true, force: true }); }
});
