/** Packaged CLI hook; no controller token or user text crosses argv. */
import { readFileSync } from "node:fs";
import { settleSeenResults, withGate } from "./gate.js";
import { hookInputProblem } from "./hook-contract.js";
const directory = process.argv[2];
const checkpointText = () => readFileSync(new URL("../../prompts/takeover-checkpoint.txt", import.meta.url), "utf8").trim();
try {
  if (!directory) throw new Error("Missing attempt gate.");
  let input = "";
  for await (const chunk of process.stdin) { input += String(chunk); if (input.length > 1024 * 1024) throw new Error("Hook input too large."); }
  let event: unknown;
  try { event = JSON.parse(input); } catch { event = undefined; }
  const answer = await withGate(directory, state => {
    const fields = (event && typeof event === "object" ? event : {}) as Record<string, unknown>;
    // A conversation Kiln can identify that isn't this attempt's is refused, whatever its form.
    if (typeof fields.session_id === "string" && fields.session_id !== state.target.providerSessionId) throw new Error("Hook conversation does not match its attempt.");
    const now = new Date().toISOString(); state.observedAt = now;
    // Input Kiln doesn't recognise turns takeover off (the engine reads the gate). Without a hold
    // the tool proceeds, so the run keeps working; with one, it still fails closed and denies.
    const problem = hookInputProblem(event, state);
    if (problem) {
      if (!state.contract) { state.contract = { state: "unrecognised", detail: problem, at: now }; settleSeenResults(state); }
      return state.held ? { failure: `Kiln checkpoint unavailable: ${problem}` } : { output: {} };
    }
    const kind = fields.hook_event_name;
    const id = fields.tool_use_id as string;
    if (kind === "PreToolUse") {
      if (state.held) return { output: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: checkpointText() } } };
      state.operations[id] ??= { name: fields.tool_name as string, admittedAt: now, ...(typeof fields.agent_id === "string" ? { agentId: fields.agent_id } : {}), ...(typeof fields.parent_tool_use_id === "string" ? { parentId: fields.parent_tool_use_id } : {}) };
    }
    if (kind === "PostToolUse" || kind === "PostToolUseFailure") {
      state.operations[id]!.hookSettled = true;
      state.operations[id]!.response = fields.tool_response ?? fields.error;
      // Subagent contexts may not forward ordinary tool results to the parent.
      // The post hook carries its completed response and is durable evidence in that context.
      if (typeof fields.agent_id === "string") state.operations[id]!.settled = true;
    }
    if (kind === "PostToolBatch" && state.held) {
      state.checkpoint = now;
      return { output: { continue: false, stopReason: checkpointText() } };
    }
    return { output: {} };
  });
  if ("failure" in answer) {
    process.stderr.write(`${answer.failure}\n`);
    process.exitCode = 2;
  } else process.stdout.write(`${JSON.stringify(answer.output)}\n`);
} catch (e) {
  process.stderr.write(`Kiln checkpoint unavailable: ${(e as Error).message}\n`);
  process.exitCode = 2;
}
