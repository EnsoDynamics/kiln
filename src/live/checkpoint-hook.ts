/** Packaged CLI hook; no controller token or user text crosses argv. */
import { readFileSync } from "node:fs";
import { withGate } from "./gate.js";
const directory = process.argv[2];
try {
  if (!directory) throw new Error("Missing attempt gate.");
  let input = "";
  for await (const chunk of process.stdin) { input += String(chunk); if (input.length > 1024 * 1024) throw new Error("Hook input too large."); }
  const event = JSON.parse(input) as Record<string, unknown>;
  const answer = await withGate(directory, state => {
    if (event.session_id !== state.target.providerSessionId) throw new Error("Hook conversation does not match its attempt.");
    const now = new Date().toISOString(); state.observedAt = now;
    const kind = event.hook_event_name;
    const id = event.tool_use_id;
    if (kind === "PreToolUse") {
      if (state.held) return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: readFileSync(new URL("../../prompts/takeover-checkpoint.txt", import.meta.url), "utf8").trim() } };
      if (typeof id !== "string" || typeof event.tool_name !== "string") throw new Error("Missing operation identity.");
      state.operations[id] ??= { name: event.tool_name, admittedAt: now, ...(typeof event.agent_id === "string" ? { agentId: event.agent_id } : {}), ...(typeof event.parent_tool_use_id === "string" ? { parentId: event.parent_tool_use_id } : {}) };
    }
    if (["PostToolUse", "PostToolUseFailure"].includes(String(kind))) {
      if (typeof id !== "string" || !state.operations[id]) throw new Error("Unknown completed operation.");
      state.operations[id]!.hookSettled = true;
      state.operations[id]!.response = event.tool_response ?? event.error;
      // Subagent contexts may not forward ordinary tool results to the parent.
      // The post hook carries its completed response and is durable evidence in that context.
      if (typeof event.agent_id === "string") state.operations[id]!.settled = true;
    }
    if (kind === "PostToolBatch" && state.held) {
      state.checkpoint = now;
      return { continue: false, stopReason: readFileSync(new URL("../../prompts/takeover-checkpoint.txt", import.meta.url), "utf8").trim() };
    }
    return {};
  });
  process.stdout.write(`${JSON.stringify(answer)}\n`);
} catch (e) {
  process.stderr.write(`Kiln checkpoint unavailable: ${(e as Error).message}\n`);
  process.exitCode = 2;
}
