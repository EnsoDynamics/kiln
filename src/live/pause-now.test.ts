// The Pause now state's pure parts (Kiln Pause Now technical design, "The Pause Now State"): the
// pausing row's precedence, the paused sentence, the gate-derived lists, the last thing the agent
// said, the display label, and the terminal and status wording built on them.
import { describe, expect, it } from "vitest";
import { backgroundedWork, lastCommandOf, lastSaidOf, runningOperations } from "../engine/pause-now-state.js";
import type { SavedEvent } from "../session/run-verdict.js";
import { progressText, type ProgressRow } from "../control/waiver-facts.js";
import { formatPhaseLine, terminalColors } from "../terminal-output.js";
import type { GateState } from "./gate.js";
import { capLabel, operationLabel } from "./operation-label.js";
import { backgroundText, pausedSentence, pausingRow, pausingStatusText, type PauseNowView } from "./pause-now.js";

const plain = terminalColors({ isTTY: false }, {});
const view = (change: Partial<PauseNowView>): PauseNowView => ({ phase: "pausing", activityKey: "2b", label: "phase 2b", requestedAt: "2026-11-20T15:00:00.000Z", stopped: false, running: [], cancel: { available: true }, ...change });
const target = { executionId: "e", activityId: "a", activityKey: "2b", sessionId: "s", providerSessionId: "s", attemptId: "t" };
const gate = (change: Partial<GateState>): GateState => ({ version: 2, target, observedAt: "2026-11-20T15:00:00.000Z", operations: {}, tasks: {}, tracked: [], ...change });
const op = (name: string, admittedAt: string, extra: Partial<GateState["operations"][string]> = {}) => ({ name, admittedAt, label: { tool: name, input: `${name.toLowerCase()} input` }, ...extra });

describe("the pausing row (AC-PAUSE-03)", () => {
  it("chooses obstacle, then command, then background process, then stopped, then before the next command", () => {
    const running = [{ tool: "Bash", input: "npm test -- src/refunds" }];
    expect(pausingRow(view({ running, obstacle: { code: "control_unavailable", reason: "x" } }))).toMatchObject({ kind: "obstacle", lid: false });
    // A running command takes the command row even once the stop is recorded (a parallel batch's deny).
    expect(pausingRow(view({ running, stopped: true, background: [{ command: "npm run dev" }] }))).toEqual({ kind: "command", title: "Pausing — finishing the command it is running.", lines: ["Bash(npm test -- src/refunds)"], lid: true });
    expect(pausingRow(view({ background: [{ command: "npm run dev", pid: 48213 }, { pid: 7 }], stopped: true }))).toMatchObject({ kind: "background", title: "Pausing — waiting for a process Claude started to end:", lines: ["npm run dev (process 48213)", "process 7"], lid: false, note: "Kiln won’t stop it for you; if it’s a server that keeps running, stop it and the pause completes." });
    expect(pausingRow(view({ stopped: true }))).toMatchObject({ kind: "stopped", title: "Pausing — Claude has stopped; Kiln is checking nothing is still running.", lid: true });
    expect(pausingRow(view({}))).toMatchObject({ kind: "before_next", title: "Pausing — Claude isn't running a command; Kiln stops it before its next one.", lid: true });
  });
  it("adds today's waiting line from 30 seconds, without the old deadline sentence", () => {
    expect(pausingRow(view({ waitingSeconds: 29 })).waiting).toBeUndefined();
    expect(pausingRow(view({ waitingSeconds: 40, stopped: true })).waiting).toBe("Waiting 40 seconds since the last observed activity.");
  });
  it("names a background process by command and pid, the command alone, or the pid alone", () => {
    expect([{ command: "npm run dev", pid: 1 }, { command: "npm run dev" }, { pid: 2 }].map(backgroundText)).toEqual(["npm run dev (process 1)", "npm run dev", "process 2"]);
  });
  it("gives kiln status the row's title and lines, or the obstacle's reason, with no lid sentence", () => {
    expect(pausingStatusText(view({ running: [{ tool: "Bash", input: "npm test" }, { tool: "Read", input: "a.ts" }] }))).toBe("Pausing — finishing the command it is running. Bash(npm test); Read(a.ts)");
    expect(pausingStatusText(view({ obstacle: { code: "terminal_in_use", reason: "Exit Claude first." } }))).toBe("Pausing — Exit Claude first.");
    expect(pausingStatusText(view({ stopped: true }))).not.toContain("lid");
  });
});

describe("the paused card's sentence (AC-PAUSE-05)", () => {
  it("names a Bash command by its input, any other tool as Tool(input), none, or a gate-less attempt", () => {
    expect(pausedSentence({ lastCommand: { tool: "Bash", input: "npm test -- src/refunds" } })).toBe("Kiln stopped after npm test -- src/refunds finished. Nothing is running.");
    expect(pausedSentence({ lastCommand: { tool: "Read", input: "src/a.ts" } })).toBe("Kiln stopped after Read(src/a.ts) finished. Nothing is running.");
    expect(pausedSentence({})).toBe("Kiln stopped before Claude's next command. Nothing is running.");
    expect(pausedSentence({ gateless: true, lastCommand: { tool: "Bash", input: "x" } })).toBe("The session ended on its own. Nothing is running.");
  });
});

describe("the gate-derived lists", () => {
  const operations = {
    old: op("Bash", "2026-11-20T15:00:01.000Z"),
    sub: op("Read", "2026-11-20T15:00:02.000Z", { agentId: "worker" }),
    bg: op("Bash", "2026-11-20T15:00:03.000Z", { backgrounded: true, label: { tool: "Bash", input: "npm run dev" } }),
    new: op("Agent", "2026-11-20T15:00:04.000Z"),
    done: op("Edit", "2026-11-20T15:00:00.000Z", { settled: true }),
  };
  it("lists top-level unsettled operations not backgrounded, oldest first", () => {
    expect(runningOperations(gate({ operations }))).toEqual([{ tool: "Bash", input: "bash input" }, { tool: "Agent", input: "agent input" }]);
  });
  it("takes the last command from the hold's in-flight list, newest admitted, leaving out backgrounded and subagent calls", () => {
    expect(lastCommandOf(gate({ operations, held: { operationId: "h", instructionId: "i", requestedAt: "x", inFlight: ["old", "sub", "bg"] } }))).toEqual({ tool: "Bash", input: "bash input" });
    expect(lastCommandOf(gate({ operations, held: { operationId: "h", instructionId: "i", requestedAt: "x", inFlight: ["bg", "sub"] } }))).toBeUndefined();
  });
  it("names a backgrounded task once the stop has happened or Claude's turn has ended, never before", () => {
    const tasks = { "t:1": { toolId: "bg", settled: false } };
    const background = { bg: operations.bg };
    expect(backgroundedWork(gate({ operations: background, tasks }), false)).toEqual([]);
    expect(backgroundedWork(gate({ operations: background, tasks }), true)).toEqual([{ command: "npm run dev" }]);
    expect(backgroundedWork(gate({ operations: background, tasks, turnEndedAt: "x", inputs: { u: { terminal: true } } }), false)).toEqual([{ command: "npm run dev" }]);
    // A tracked input still unanswered, or another top-level call still running, means the turn hasn't ended.
    expect(backgroundedWork(gate({ operations: background, tasks, turnEndedAt: "x", inputs: { u: { terminal: false } } }), false)).toEqual([]);
    expect(backgroundedWork(gate({ operations: { ...background, old: operations.old }, tasks, turnEndedAt: "x" }), false)).toEqual([]);
    // The task has ended: nothing left to wait on.
    expect(backgroundedWork(gate({ operations: background, tasks: { "t:1": { toolId: "bg", settled: true } } }), true)).toEqual([]);
  });
});

describe("the last thing the agent said", () => {
  const said = (at: string, text: string): SavedEvent => ({ at, event: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text }] } } as SavedEvent["event"] });
  const refused = (at: string): SavedEvent => ({ at, event: { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "x", content: "Denied" }] }, tool_result_meta: [{ id: "x", non_execution_kind: "permission-rule", permission_decision: { source: "hook" } }] } as unknown as SavedEvent["event"] });
  const events = [said("2026-11-20T15:00:01.000Z", "Running the refund tests."), said("2026-11-20T15:00:05.000Z", "Wiring store credit."), refused("2026-11-20T15:00:06.000Z"), said("2026-11-20T15:00:07.000Z", "Answering the checkpoint.")];
  it("cuts at the stop for a deny or yield", () => {
    expect(lastSaidOf(events, { at: "2026-11-20T15:00:02.000Z", by: "yield", operationId: "h" })).toBe("Running the refund tests.");
    expect(lastSaidOf(events, { at: "2026-11-20T15:00:05.000Z", by: "deny", operationId: "h" })).toBe("Wiring store credit.");
  });
  it("cuts a mid-turn seal at the first call the hook refused after it, or takes the run's newest line", () => {
    expect(lastSaidOf(events, { at: "2026-11-20T15:00:02.000Z", by: "seal", operationId: "h" })).toBe("Wiring store credit.");
    expect(lastSaidOf(events.filter(e => e.event.type !== "user"), { at: "2026-11-20T15:00:02.000Z", by: "seal", operationId: "h" })).toBe("Answering the checkpoint.");
  });
  it("takes the run's newest line when the attempt ended without a gate stop, and nothing when Claude said nothing", () => {
    expect(lastSaidOf(events, undefined)).toBe("Answering the checkpoint.");
    expect(lastSaidOf([], undefined)).toBeUndefined();
  });
});

describe("the operation label the hook records", () => {
  it("takes the session output's main input, caps it at 200 characters, and falls back to the bare tool name", () => {
    expect(operationLabel("Bash", { command: "npm test", description: "tests" })).toEqual({ tool: "Bash", input: "npm test" });
    expect(operationLabel("Read", { file_path: "src/a.ts" })).toEqual({ tool: "Read", input: "src/a.ts" });
    expect(operationLabel("Bash", "not an object")).toEqual({ tool: "Bash" });
    expect(operationLabel("Bash", undefined)).toEqual({ tool: "Bash" });
    const long = operationLabel("Bash", { command: "x".repeat(300) }).input!;
    expect(long).toHaveLength(200); expect(long.endsWith("…")).toBe(true);
    expect(capLabel("short")).toBe("short");
  });
});

describe("kiln run's line and kiln status's progress words (AC-PAUSE-05)", () => {
  it("prints paused · at the address, never amber or waiting for you", () => {
    const line = formatPhaseLine(new Date(2026, 10, 20, 15, 12), "2b", "Store credit", { kind: "paused", viewAddress: "http://127.0.0.1:4700/customer-returns" }, { idWidth: 4, titleWidth: 14 }, plain);
    expect(line).toBe(" 3:12  2b  Store credit  paused · at http://127.0.0.1:4700/customer-returns");
    // With colour, the word keeps the normal colour: no amber, and no "waiting for you".
    const colored = terminalColors({ isTTY: true }, {});
    const tty = formatPhaseLine(new Date(2026, 10, 20, 15, 12), "2b", "Store credit", { kind: "paused", viewAddress: "http://x" }, { idWidth: 4, titleWidth: 14 }, colored);
    expect(tty).not.toContain(colored.amber("paused"));
    expect(tty).toContain("  paused");
    expect(tty).not.toContain("waiting for you");
  });
  it("says pausing or paused for the held activity where it says needs you", () => {
    const rows = [{ key: "2b", kind: "implementation", label: "Phase 2b", title: "Store credit", state: "needs_you", status_label: null, waived_checks: 0, waivers: [], warnings: [] }] as unknown as ProgressRow[];
    expect(progressText("F", rows)).toContain("needs you");
    expect(progressText("F", rows, { activityKey: "2b", phase: "pausing" })).toMatch(/Store credit\s+pausing/);
    expect(progressText("F", rows, { activityKey: "2b", phase: "paused" })).toMatch(/Store credit\s+paused/);
    expect(progressText("F", rows, { activityKey: "3", phase: "paused" })).toContain("needs you");
  });
});
