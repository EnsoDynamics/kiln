// The lock moving on between a contender reading its holder and taking that holder over.
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

const swap = vi.hoisted(() => ({ onLookup: undefined as ((pid: number) => void) | undefined }));
vi.mock("../platform/process-start-time.js", async original => {
  const actual = await original<typeof import("../platform/process-start-time.js")>();
  return {
    processStartTime: async (pid: number, options?: { timeoutMs?: number }) => {
      if (pid !== process.pid) { swap.onLookup?.(pid); return undefined; }
      return actual.processStartTime(pid, options);
    },
  };
});
const { createGate, withGate } = await import("./gate.js");
const { processStartTime } = await vi.importActual<typeof import("../platform/process-start-time.js")>("../platform/process-start-time.js");

it("never frees a live holder's lock after taking over a dead holder's leftover claim", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-orphan-claim-"));
  createGate(root, { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" });
  const lock = join(root, "admission.lock");
  const claim = (generation: string, pid: number, start: string) => {
    mkdirSync(join(root, `admission.owner.${generation}`), { mode: 0o700 });
    writeFileSync(join(root, `admission.owner.${generation}`, "holder.json"), JSON.stringify({ pid, start, generation }));
    return `admission.owner.${generation}`;
  };
  try {
    // A dead holder whose claim stays behind once it has freed the lock.
    const dead = claim(randomUUID(), 2_147_483_000, "gone");
    symlinkSync(dead, lock);
    // While the contender checks that holder, the lock is freed and a live holder takes it.
    const live = claim(randomUUID(), process.pid, (await processStartTime(process.pid))!);
    swap.onLookup = () => { if (readlinkSync(lock) === dead) { unlinkSync(lock); symlinkSync(live, lock); } };
    let admitted = false;
    await expect(withGate(root, () => { admitted = true; })).rejects.toThrow("Admission lock is unresolved");
    expect(admitted).toBe(false);
    expect(readlinkSync(lock)).toBe(live);
  } finally { swap.onLookup = undefined; rmSync(root, { recursive: true, force: true }); }
}, 15_000);

it("never takes a live holder's record through an earlier Kiln's lock path once the lock has become this release's", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-legacy-path-"));
  createGate(root, { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" });
  const lock = join(root, "admission.lock");
  try {
    // An earlier Kiln's lock directory, its owner dead.
    mkdirSync(lock, { mode: 0o700 });
    writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: 2_147_483_000, start: "gone", generation: randomUUID() }));
    // While the contender checks that owner, another takes over, frees it and holds the lock anew.
    const generation = randomUUID(); const live = `admission.owner.${generation}`;
    mkdirSync(join(root, live), { mode: 0o700 });
    const record = JSON.stringify({ pid: process.pid, start: (await processStartTime(process.pid))!, generation });
    writeFileSync(join(root, live, "holder.json"), record);
    swap.onLookup = () => { if (!lstatSync(lock).isSymbolicLink()) { rmSync(lock, { recursive: true }); symlinkSync(live, lock); } };
    await expect(withGate(root, () => undefined)).rejects.toThrow("Admission lock is unresolved");
    expect(readlinkSync(lock)).toBe(live);
    expect(readFileSync(join(root, live, "holder.json"), "utf8")).toBe(record);
  } finally { swap.onLookup = undefined; rmSync(root, { recursive: true, force: true }); }
}, 15_000);
