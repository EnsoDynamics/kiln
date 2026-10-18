import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPartialDelta, lastResultLine, SessionOutputReader, stepStates, type OutputLine, type StreamEvent } from "./session-output.js";

function replay(fixture: string): { reader: SessionOutputReader; lines: OutputLine[] } {
  const reader = new SessionOutputReader();
  const lines: OutputLine[] = [];
  const text = readFileSync(new URL(`../../test/fixtures/${fixture}`, import.meta.url), "utf8");
  for (const row of text.split("\n").filter((line) => line.trim() !== "")) {
    const { at, event } = JSON.parse(row) as { at: string; event: StreamEvent };
    if (isPartialDelta(event)) continue;
    lines.push(...reader.readEvent(event, at));
  }
  return { reader, lines };
}

const at = "2026-10-17T18:00:00.000Z";
const assistant = (content: unknown[], parent: string | null = null): StreamEvent => ({ type: "assistant", parent_tool_use_id: parent, message: { model: "claude-opus-5-5", content } });
const user = (content: unknown[], parent: string | null = null): StreamEvent => ({ type: "user", parent_tool_use_id: parent, message: { content } });

describe("SessionOutputReader on proof gate 2's real phase session", () => {
  const { reader, lines } = replay("proof-gate-2/one-real-phase-session.jsonl");

  it("sees all six progress steps, in the order the session ran them", () => {
    expect(reader.steps.map((step) => step.name)).toEqual(["Build", "Deliverable review", "Test hardening", "Commit", "Refactor pass", "Push"]);
    expect(stepStates(reader.steps).map((step) => step.state)).toEqual(["finished", "finished", "finished", "finished", "finished", "current"]);
    expect(reader.lastSkill?.name).toBe("refactor-pass");
  });

  it("labels the deliverable-review subagent as the reviewer and the test-hardening one as a subagent", () => {
    const reviewer = lines.filter((line) => line.source === "reviewer");
    expect(reviewer.length).toBeGreaterThan(0);
    expect(reviewer.some((line) => line.text.startsWith("I found nothing High."))).toBe(true);
    expect(reviewer.some((line) => line.text.startsWith("Read "))).toBe(true);
    expect(lines.filter((line) => line.source === "subagent").some((line) => line.text.startsWith("**The tests for AC-GREET-01"))).toBe(true);
    expect(reader.reviewerWorking).toBe(false);
  });

  it("gives skills their own line and their results none, and numbers lines in order", () => {
    expect(lines.filter((line) => line.source === "skill").map((line) => line.text)).toContain("Skill enso-method:implement-from-requirements");
    expect(lines.some((line) => line.text.startsWith("Launching skill"))).toBe(false);
    expect(lines.some((line) => line.text.startsWith("Base directory for this skill"))).toBe(false);
    expect(lines.map((line) => line.line)).toEqual(lines.map((_, index) => index + 1));
    expect(lines.find((line) => line.source === "claude")?.text).toBe("Building Phase 1 — Greet by name, of Greeting CLI.");
  });
});

describe("SessionOutputReader", () => {
  it("gives one line per content block, so no tool call in a multi-block event is dropped", () => {
    const reader = new SessionOutputReader();
    const lines = reader.readEvent(
      assistant([
        { type: "thinking", thinking: "…" },
        { type: "text", text: "Two calls:" },
        { type: "tool_use", id: "a", name: "Bash", input: { command: "git status\nls" } },
        { type: "tool_use", id: "b", name: "Read", input: { file_path: "src/returns/models.py" } },
      ]),
      at,
    );
    expect(lines.map((line) => [line.source, line.text])).toEqual([
      ["claude", "Two calls:"],
      ["tool", "Bash git status\nls"],
      ["tool", "Read src/returns/models.py"],
    ]);
    const results = reader.readEvent(
      user([
        { type: "tool_result", tool_use_id: "a", content: "Exit code 1\nOn branch x\n\nfatal: bad\n\n" , is_error: true },
        { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "1\tclass Return:\n2\t  pass" }] },
      ]),
      at,
    );
    expect(results.map((line) => [line.source, line.text])).toEqual([
      ["stderr", "fatal: bad"],
      ["out", "2\t  pass"],
    ]);
  });

  it("starts Commit at the first git commit, and Push only after Commit, both from one call", () => {
    const reader = new SessionOutputReader();
    reader.readEvent(assistant([{ type: "tool_use", id: "p", name: "Bash", input: { command: "git push" } }]), "2026-10-17T18:00:01.000Z");
    expect(reader.steps).toEqual([]);
    reader.readEvent(assistant([{ type: "tool_use", id: "c", name: "Bash", input: { command: "git commit -m x && git push -u origin f" } }]), "2026-10-17T18:00:02.000Z");
    expect(reader.steps.map((step) => step.name)).toEqual(["Commit", "Push"]);
    reader.readEvent(assistant([{ type: "tool_use", id: "r", name: "Skill", input: { skill: "refactor-pass" } }]), "2026-10-17T18:00:03.000Z");
    // Refactor pass starts later but sits lower, so Push stays current.
    expect(stepStates(reader.steps).find((step) => step.state === "current")?.name).toBe("Push");
  });

  it("says the reviewer is working while a Deliverable review Agent call has no result", () => {
    const reader = new SessionOutputReader();
    reader.readEvent(assistant([{ type: "tool_use", id: "s", name: "Skill", input: { skill: "enso-method:deliverable-review" } }]), at);
    reader.readEvent(assistant([{ type: "tool_use", id: "agent", name: "Agent", input: { description: "Deliverable review" } }]), at);
    expect(reader.reviewerWorking).toBe(true);
    const sub = reader.readEvent(assistant([{ type: "tool_use", id: "h", name: "SubagentHandback", input: { message: "All good." } }], "agent"), at);
    expect(sub.map((line) => [line.source, line.text])).toEqual([["reviewer", "All good."]]);
    expect(reader.readEvent(user([{ type: "tool_result", tool_use_id: "h", content: "ok" }], "agent"), at)).toEqual([]);
    reader.readEvent(user([{ type: "tool_result", tool_use_id: "agent", content: "delivered" }]), at);
    expect(reader.reviewerWorking).toBe(false);
  });

  it("reads permission denials, stderr and the exit", () => {
    const reader = new SessionOutputReader();
    expect(reader.readEvent({ type: "permission_denied", tool_name: "Bash" }, at)[0]?.text).toBe("denied Bash");
    expect(reader.stderrLines("warning one\n\nwarning two\n", at).map((line) => line.text)).toEqual(["warning one", "warning two"]);
    expect(reader.exitLine(1, null, at).text).toBe("Process exited with code 1");
    expect(reader.exitLine(null, "SIGKILL", at)).toMatchObject({ source: "exit", text: "Process ended by SIGKILL", line: 5 });
  });

  it("labels a subagent outside Deliverable review as a subagent, from proof gate 1's recording", () => {
    const { lines } = replay("proof-gate-1/subagent-tool-calls-forwarded.jsonl");
    expect(lines.some((line) => line.source === "subagent")).toBe(true);
    expect(lines.some((line) => line.source === "reviewer")).toBe(false);
  });
});

describe("lastResultLine", () => {
  it.each([
    ["one\ntwo\n", "two"],
    ["Exit code 2\n", ""],
    [[{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b\n" }], "b"],
    [undefined, ""],
  ])("reads %j", (content, expected) => {
    expect(lastResultLine(content)).toBe(expected);
  });
});

describe("live text from partial-message deltas (AC-WATCH-05)", () => {
  const delta = (delta: Record<string, unknown>, parent: string | null = null): StreamEvent => ({ type: "stream_event", parent_tool_use_id: parent, event: { type: "content_block_delta", index: 0, delta } });

  it("labels a text delta as its finished line will be: Claude's, the reviewer's, or a subagent's", () => {
    const reader = new SessionOutputReader();
    expect(reader.partialText(delta({ type: "text_delta", text: "Building " }))).toEqual({ source: "claude", text: "Building " });
    // An Agent call made during Deliverable review is the reviewer's; one made before it is a plain subagent.
    reader.readEvent(assistant([{ type: "tool_use", id: "early", name: "Agent", input: { description: "explore" } }]), at);
    reader.readEvent(assistant([{ type: "tool_use", id: "s1", name: "Skill", input: { skill: "deliverable-review" } }]), at);
    reader.readEvent(assistant([{ type: "tool_use", id: "rev", name: "Agent", input: { description: "fresh-eyes reviewer" } }]), at);
    expect(reader.partialText(delta({ type: "text_delta", text: "Reading" }, "rev"))).toEqual({ source: "reviewer", text: "Reading" });
    expect(reader.partialText(delta({ type: "text_delta", text: "Looking" }, "early"))).toEqual({ source: "subagent", text: "Looking" });
  });

  it("gives no live text for tool input, thinking, signatures, empty text or other stream events", () => {
    const reader = new SessionOutputReader();
    expect(reader.partialText(delta({ type: "input_json_delta", partial_json: "{\"command\":" }))).toBeUndefined();
    expect(reader.partialText(delta({ type: "thinking_delta", thinking: "hmm" }))).toBeUndefined();
    expect(reader.partialText(delta({ type: "signature_delta", signature: "abc" }))).toBeUndefined();
    expect(reader.partialText(delta({ type: "text_delta", text: "" }))).toBeUndefined();
    expect(reader.partialText({ type: "stream_event", event: { type: "message_stop" } })).toBeUndefined();
  });
});
