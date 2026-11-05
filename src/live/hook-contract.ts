/**
 * What the checkpoint hook needs from Claude Code's hook input (technical design, Takeover hook
 * recognition): `session_id`, `hook_event_name`, and on each tool event the `tool_use_id`, with
 * `tool_name` on `PreToolUse`. Any other field is ignored (AC-AGENT-07). Returns the detail a
 * compatibility notice gives, naming the field, never a value, or nothing when recognised.
 */
import type { GateState } from "./gate.js";

const EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch"];

export function hookInputProblem(event: unknown, state: Pick<GateState, "operations">): string | undefined {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "hook input was not an object";
  const input = event as Record<string, unknown>;
  if (typeof input.session_id !== "string") return "hook input had no session_id";
  if (typeof input.hook_event_name !== "string") return "hook input had no hook_event_name";
  if (!EVENTS.includes(input.hook_event_name)) return "hook input named an event Kiln does not register";
  if (input.hook_event_name === "PostToolBatch") return undefined;
  if (typeof input.tool_use_id !== "string") return `${input.hook_event_name} hook input had no tool_use_id`;
  if (input.hook_event_name === "PreToolUse") return typeof input.tool_name === "string" ? undefined : "PreToolUse hook input had no tool_name";
  return state.operations[input.tool_use_id] ? undefined : `${input.hook_event_name} named a tool_use_id PreToolUse never admitted`;
}
