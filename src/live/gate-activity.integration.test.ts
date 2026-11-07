// Real durable gate/lock; timestamps exercise replay ordering, not provider qualification.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createGate, observeGate, readGate, withGate, unsettled } from "./gate.js";

it("retains original activity time through repeated, older and undated evidence while repairing settlement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kiln-gate-activity-"));
  try {
    createGate(directory, { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" });
    await withGate(directory, state => {
      state.observedAt = "2026-10-27T10:00:00.000Z";
      state.operations.saved = { name: "Read", admittedAt: state.observedAt, hookSettled: true };
    });
    const event = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "saved" }] } };
    await observeGate(directory, event, "2026-10-27T10:00:05.000Z");
    expect(unsettled(readGate(directory))).toEqual([]);
    expect(readGate(directory).observedAt).toBe("2026-10-27T10:00:05.000Z");
    await observeGate(directory, event, "2026-10-27T10:00:05.000Z");
    await observeGate(directory, event, "2026-10-27T09:59:00.000Z");
    await observeGate(directory, event, undefined);
    expect(readGate(directory).observedAt).toBe("2026-10-27T10:00:05.000Z");
    await observeGate(directory, { type: "assistant" }, "2026-10-27T10:01:00.000Z");
    expect(readGate(directory).observedAt).toBe("2026-10-27T10:01:00.000Z");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// A tool Claude Code rejected before it ran never gets PostToolUse; its rejection is conclusive
// non-execution whichever check rejected it. The metadata shapes are those recorded from Claude
// Code (test/fixtures/proof-gate-1 holds the classifier's reject and an accept).
it("settles a tool rejected by the auto-mode classifier or a hook, so the session can close after its turn", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kiln-gate-rejected-"));
  try {
    createGate(directory, { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" });
    await withGate(directory, state => {
      for (const id of ["classifier", "hook", "allowed"]) state.operations[id] = { name: "Bash", admittedAt: state.observedAt };
    });
    const rejected = (id: string, meta: Record<string, unknown>) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: "Error: Permission for this action was denied" }] }, tool_result_meta: [{ id, ...meta }] });
    await observeGate(directory, rejected("classifier", { non_execution_kind: "automode-blocked", permission_decision: { decision: "reject", source: "config", reason_type: "classifier" } }), undefined);
    await observeGate(directory, rejected("hook", { non_execution_kind: "permission-rule", permission_decision: { source: "hook" } }), undefined);
    // Metadata that is not a rejection leaves the call to its PostToolUse hook.
    await observeGate(directory, rejected("allowed", { permission_decision: { decision: "accept", source: "config" } }), undefined);
    expect(unsettled(readGate(directory))).toEqual(["Bash allowed"]);
    // A rejection settles only the call it names, even beside another call's result.
    await withGate(directory, state => { state.operations.later = { name: "Bash", admittedAt: state.observedAt }; });
    await observeGate(directory, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "allowed" }, { type: "tool_result", tool_use_id: "later", is_error: true }] }, tool_result_meta: [{ id: "later", non_execution_kind: "automode-blocked", permission_decision: { decision: "reject", source: "config" } }] }, undefined);
    expect(unsettled(readGate(directory))).toEqual(["Bash allowed"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
