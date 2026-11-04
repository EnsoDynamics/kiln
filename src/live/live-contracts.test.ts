// What live control reads from Claude Code, and nothing else (AC-AGENT-04, AC-AGENT-07): the
// receipt fields of the message contract, the checkpoint hook's input, and the live launch
// arguments a version that no longer takes them names on exit.
import { expect, it } from "vitest";
import { consumedUuids, messageContractProblem } from "./target.js";
import { hookInputProblem } from "./hook-contract.js";
import { rejectedLiveArgument, withoutLiveArguments } from "../session/claude-session.js";

it("recognises receipt fields by type only: missing is normal, extra fields are ignored, another form is unrecognised", () => {
  for (const event of [
    { type: "assistant", message: {} }, { type: "result", user_message_uuid: "u1" }, { type: "result", user_message_uuids: ["u1", "u2"], future_field: { nested: true } },
    { type: "result", user_message_uuid: null, user_message_uuids: null }, { type: "user", user_message_uuids: "ignored on user events" }, { type: "system", user_message_uuid: 7 },
  ]) expect(messageContractProblem(event)).toBeUndefined();
  expect(messageContractProblem({ type: "result", user_message_uuids: "u1,u2" })).toBe("user_message_uuids was not a list of message IDs");
  expect(messageContractProblem({ type: "assistant", user_message_uuids: ["u1", 2] })).toBe("user_message_uuids was not a list of message IDs");
  expect(messageContractProblem({ type: "assistant", user_message_uuid: { id: "u1" } })).toBe("user_message_uuid was not a message ID");
  // Receipts themselves are still read only from string IDs.
  expect(consumedUuids({ type: "result", user_message_uuid: "u1", user_message_uuids: ["u1", "u2"] })).toEqual(["u1", "u2"]);
});

it("recognises the hook input fields Kiln needs and ignores the rest", () => {
  const state = { operations: { admitted: { name: "Bash", admittedAt: "2026-11-03T00:00:00Z" } } };
  const base = { session_id: "s", transcript_path: "/ignored", permission_mode: "auto", future: 1 };
  expect(hookInputProblem({ ...base, hook_event_name: "PreToolUse", tool_use_id: "t", tool_name: "Bash", tool_input: {} }, state)).toBeUndefined();
  expect(hookInputProblem({ ...base, hook_event_name: "PostToolUse", tool_use_id: "admitted" }, state)).toBeUndefined();
  expect(hookInputProblem({ ...base, hook_event_name: "PostToolUseFailure", tool_use_id: "admitted", error: "exit 7" }, state)).toBeUndefined();
  expect(hookInputProblem({ ...base, hook_event_name: "PostToolBatch" }, state)).toBeUndefined();
  expect(hookInputProblem(undefined, state)).toBe("hook input was not an object");
  expect(hookInputProblem([], state)).toBe("hook input was not an object");
  expect(hookInputProblem({ hook_event_name: "PostToolBatch" }, state)).toBe("hook input had no session_id");
  expect(hookInputProblem({ session_id: "s" }, state)).toBe("hook input had no hook_event_name");
  expect(hookInputProblem({ session_id: "s", hook_event_name: "PreToolCall" }, state)).toBe("hook input named an event Kiln does not register");
  expect(hookInputProblem({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash" }, state)).toBe("PreToolUse hook input had no tool_use_id");
  expect(hookInputProblem({ session_id: "s", hook_event_name: "PreToolUse", tool_use_id: "t" }, state)).toBe("PreToolUse hook input had no tool_name");
  expect(hookInputProblem({ session_id: "s", hook_event_name: "PostToolUse" }, state)).toBe("PostToolUse hook input had no tool_use_id");
  expect(hookInputProblem({ session_id: "s", hook_event_name: "PostToolUse", tool_use_id: "never" }, state)).toBe("PostToolUse named a tool_use_id PreToolUse never admitted");
});

it("relaunches only for an exit naming a live argument the launch passed, and strips both live arguments", () => {
  const args = ["-p", "--session-id", "s", "--replay-user-messages", "--settings", "{\"hooks\":{}}", "--model", "opus"];
  expect(rejectedLiveArgument(args, "error: unknown option '--replay-user-messages'\n")).toBe("--replay-user-messages");
  expect(rejectedLiveArgument(args, "error: option '--settings <file-or-json>' argument invalid\n")).toBe("--settings");
  expect(rejectedLiveArgument(args, "Invalid API key · Please run /login\n")).toBeUndefined();
  expect(rejectedLiveArgument(["-p", "--model", "opus"], "error: unknown option '--replay-user-messages'\n")).toBeUndefined();
  expect(withoutLiveArguments(args)).toEqual(["-p", "--session-id", "s", "--model", "opus"]);
});
