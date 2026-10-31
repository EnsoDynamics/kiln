import { describe, expect, it } from "vitest";
import type { OutputLine } from "../../../src/session/session-output.js";
import { mergeOutput, outputCall, outputPreview, outputTail } from "./session-view.js";

const entry = (line: number): OutputLine => ({ line, at: "2026-10-23T17:00:00Z", source: "out", text: `entry ${line}` });

describe("live session output", () => {
  it("retains only the newest 100 unique numbered entries, even when an older HTTP response arrives after SSE", () => {
    const streamed = Array.from({ length: 120 }, (_, i) => entry(900 + i));
    const olderPage = Array.from({ length: 100 }, (_, i) => entry(850 + i));
    const result = mergeOutput(streamed, olderPage, true);
    expect(result.map(row => row.line)).toEqual(Array.from({ length: 100 }, (_, i) => 920 + i));
    expect(mergeOutput(result, [entry(1019), entry(1020)], true).map(row => row.line)).toEqual(Array.from({ length: 100 }, (_, i) => 921 + i));
  });

  it("keeps every entry in a stopped session's full-output view", () => {
    const newest = Array.from({ length: 200 }, (_, i) => entry(51 + i));
    const earlier = Array.from({ length: 70 }, (_, i) => entry(1 + i));
    expect(mergeOutput(newest, earlier, false).map(row => row.line)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });

  it("formats known tool calls without mistaking commentary or agent prose for calls", () => {
    expect(outputCall({ source: "tool", text: "Bash python3 - <<'PY'\nprint(1)\nPY" })).toEqual({ name: "Bash", input: "python3 - <<'PY'\nprint(1)\nPY" });
    expect(outputCall({ source: "reviewer", text: "Read src/a.ts" })).toEqual({ name: "Read", input: "src/a.ts" });
    expect(outputCall({ source: "reviewer", text: "The tests passed." })).toBeUndefined();
    expect(outputCall({ source: "codex", text: "Bash is the shell used here." })).toBeUndefined();
    expect(outputCall({ source: "tool", text: "denied Bash" })).toBeUndefined();
  });

  it("bounds both multiline scripts and long unbroken text without changing their original contents", () => {
    expect(outputPreview("one\ntwo\nthree\nfour", 2, 240)).toEqual({ text: "one\ntwo", hidden: true, extraLines: 2 });
    expect(outputPreview("x".repeat(500), 3, 240)).toEqual({ text: "x".repeat(240), hidden: true, extraLines: 0 });
    expect(outputPreview("short", 4, 600)).toEqual({ text: "short", hidden: false, extraLines: 0 });
  });

  it("bounds the stopped excerpt by physical lines and characters, retaining the newest errors and source identities", () => {
    const lines: OutputLine[] = [
      { ...entry(1), source: "subagent", threadId: "child", text: "old source\r\n".repeat(5000) + "x".repeat(40_000) },
      { ...entry(2), source: "stderr", text: "Could not establish Codex process ownership (exit 17)." },
      { ...entry(3), source: "stderr", text: "Cleanup failed: ownership query failed." },
    ];
    const original = structuredClone(lines);
    const preview = outputTail(lines);
    expect(preview.hidden).toBe(true);
    expect(preview.lines.flatMap(line => line.text.split("\n")).length).toBeLessThanOrEqual(10);
    expect(preview.lines.reduce((count, line) => count + line.text.length, 0)).toBeLessThanOrEqual(2400);
    expect(preview.lines[0]).toMatchObject({ line: 1, threadId: "child", source: "subagent" });
    expect(preview.lines[0]!.text.length).toBeLessThanOrEqual(240);
    expect(preview.lines.slice(-2)).toEqual(lines.slice(-2));
    expect(lines).toEqual(original);
  });

  it("takes the newest physical lines across records and leaves short excerpts intact", () => {
    const lines = [entry(1), { ...entry(2), text: Array.from({ length: 20 }, (_, n) => `row ${n}`).join("\n") }];
    expect(outputTail(lines)).toEqual({ lines: [{ ...entry(2), text: Array.from({ length: 10 }, (_, n) => `row ${n + 10}`).join("\n") }], hidden: true });
    expect(outputTail([entry(1)])).toEqual({ lines: [entry(1)], hidden: false });
    expect(outputTail([])).toEqual({ lines: [], hidden: false });
  });
});
