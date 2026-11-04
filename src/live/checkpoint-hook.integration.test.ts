// AC-TAKE-01/02/05: exercise the packaged hook protocol, not a copy of its decisions.
// Real-Claude qualification is the separate npm run test:live-proof tier.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createGate, observeGate, readGate, withGate } from "./gate.js";

const helper = fileURLToPath(new URL("../../dist/live/checkpoint-hook.js", import.meta.url));
const target = { executionId: "execution", activityId: "activity", activityKey: "1", sessionId: "conversation", providerSessionId: "conversation", attemptId: "attempt" };

it("admits exact main/subagent operations, retains completion and denies new work before yielding an unfinished batch", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-checkpoint-contract-"));
  createGate(root, target);
  const invoke = (event: Record<string, unknown>) => spawnSync(process.execPath, [helper, root], { input: JSON.stringify({ session_id: target.providerSessionId, ...event }), encoding: "utf8", timeout: 10000 });
  try {
    for (const [index, name] of ["Bash", "Read", "Write", "Edit", "Agent"].entries()) {
      const response = invoke({ hook_event_name: "PreToolUse", tool_name: name, tool_use_id: `tool-${index}`, ...(index ? { agent_id: "worker", parent_tool_use_id: "parent" } : {}) });
      expect(response.status, response.stderr).toBe(0); expect(JSON.parse(response.stdout)).toEqual({});
      expect(readGate(root).operations[`tool-${index}`]).toMatchObject({ name, ...(index ? { agentId: "worker", parentId: "parent" } : {}) });
    }
    await withGate(root, state => { state.held = { instructionId: "takeover", operationId: "hold", requestedAt: new Date().toISOString() }; });
    for (const name of ["Bash", "Read", "Write", "Edit", "Agent"]) {
      const response = invoke({ hook_event_name: "PreToolUse", tool_name: name, tool_use_id: `withheld-${name}`, agent_id: "worker" });
      expect(response.status, response.stderr).toBe(0);
      expect(JSON.parse(response.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: expect.stringContaining("terminal takeover") } });
      expect(readGate(root).operations[`withheld-${name}`]).toBeUndefined();
    }
    for (const [index, kind] of ["PostToolUse", "PostToolUseFailure"].entries()) {
      const response = invoke({ hook_event_name: kind, tool_use_id: `tool-${index}`, agent_id: "worker", ...(index ? { error: "exit 7" } : { tool_response: "finished first operation" }) });
      expect(response.status, response.stderr).toBe(0);
      expect(readGate(root).operations[`tool-${index}`]).toMatchObject({ hookSettled: true, settled: true, response: index ? "exit 7" : "finished first operation" });
    }
    for (const context of [{}, { agent_id: "worker", parent_tool_use_id: "parent" }]) {
      const response = invoke({ hook_event_name: "PostToolBatch", ...context });
      expect(response.status, response.stderr).toBe(0);
      expect(JSON.parse(response.stdout)).toMatchObject({ continue: false, stopReason: expect.stringContaining("unfinished") });
    }
    expect(readGate(root).checkpoint).toEqual(expect.any(String));
    expect(Object.keys(readGate(root).operations)).toHaveLength(5);
    const mismatch = invoke({ hook_event_name: "PreToolUse", session_id: "different-conversation", tool_use_id: "wrong", tool_name: "Bash" });
    expect(mismatch.status).toBe(2); expect(mismatch.stderr).toContain("does not match"); expect(mismatch.stdout).toBe("");
    expect(readGate(root).held?.instructionId).toBe("takeover");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Takeover hook recognition (AC-AGENT-04): input Kiln doesn't recognise is recorded in the gate
// and the tool proceeds; operations the hook can't settle are settled by their stream results;
// while a takeover is held, any failure still denies.
it("records unrecognised hook input and lets the tool proceed without a hold, settles from the stream, and still fails closed while held", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-checkpoint-recognition-"));
  createGate(root, target);
  const invoke = (event: Record<string, unknown>) => spawnSync(process.execPath, [helper, root], { input: JSON.stringify({ session_id: target.providerSessionId, ...event }), encoding: "utf8", timeout: 10000 });
  const result = (id: string) => ({ type: "user", session_id: target.providerSessionId, message: { content: [{ type: "tool_result", tool_use_id: id }] } });
  try {
    // A tool admitted and finished under the recognised contract, its result seen before its post hook.
    expect(invoke({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "earlier", future_field: { ignored: true } }).status).toBe(0);
    await observeGate(root, result("earlier"), undefined);
    expect(readGate(root).operations.earlier).toMatchObject({ resultSeen: true }); expect(readGate(root).operations.earlier!.settled).toBeUndefined();
    const missing = invoke({ hook_event_name: "PostToolUse", tool_response: "done" });
    expect(missing.status, missing.stderr).toBe(0); expect(JSON.parse(missing.stdout)).toEqual({});
    expect(readGate(root).contract).toMatchObject({ state: "unrecognised", detail: "PostToolUse hook input had no tool_use_id" });
    expect(readGate(root).operations.earlier!.settled).toBe(true);
    // Later tools proceed and are settled by the stream once their result arrives.
    expect(invoke({ hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "later" }).status).toBe(0);
    await observeGate(root, result("later"), undefined);
    expect(readGate(root).operations.later!.settled).toBe(true);
    // Held: a recognised new tool is denied; an unrecognised input fails closed (exit 2) and keeps the first detail.
    await withGate(root, state => { state.held = { instructionId: "takeover", operationId: "hold", requestedAt: new Date().toISOString() }; });
    expect(JSON.parse(invoke({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "denied" }).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    const heldMissing = invoke({ hook_event_name: "PreToolUse", tool_name: "Bash" });
    expect(heldMissing.status).toBe(2); expect(heldMissing.stdout).toBe(""); expect(heldMissing.stderr).toContain("PreToolUse hook input had no tool_use_id");
    expect(invoke({ hook_event_name: "PreToolUse", session_id: 42, tool_name: "Bash", tool_use_id: "x" }).status).toBe(2);
    expect(readGate(root)).toMatchObject({ held: { instructionId: "takeover" }, contract: { detail: "PostToolUse hook input had no tool_use_id" } });
    expect(readGate(root).operations.denied).toBeUndefined();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
