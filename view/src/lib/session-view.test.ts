import { describe, expect, it } from "vitest";
import type { OutputLine } from "../../../src/session/session-output.js";
import { mergeOutput, outputCall, outputPreview } from "./session-view.js";

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
});
