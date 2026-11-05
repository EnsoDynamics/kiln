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
