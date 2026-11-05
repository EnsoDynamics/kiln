// Interrupted-or-ended classification for a run that exited after a sleep (technical design,
// "Testing Approach": sleep detection), over proof gate 1's recorded stream: a session that
// survived a sleep then ended on its own (a usage limit), and sessions a sleep killed mid-Bash
// and mid-response. Gate 1's own sleep recordings weren't made (Doug waived them on 2026-10-17),
// so the sleeps are placed into a real recorded stream at the moments each case needs.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../state/records.js";
import { isModelResponse, sleepInterruption, type SavedEvent } from "./run-verdict.js";

const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-1/sigint-process-group-mid-bash.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as SavedEvent);
const responseTimes = (events: SavedEvent[]) => events.filter((saved) => isModelResponse(saved.event)).map((saved) => saved.at);
const sleep = (detectedAt: string, run = 0): SessionRecord["sleeps"][number] => ({ at: "2026-10-17T18:45:52.000Z", seconds: 600, detectedAt, run });

describe("a model response", () => {
  it("is an assistant event whose model isn't <synthetic>", () => {
    expect(isModelResponse({ type: "assistant", message: { model: "claude-sonnet-5-5" } })).toBe(true);
    expect(isModelResponse({ type: "assistant", parent_tool_use_id: "toolu_1", message: { model: "claude-sonnet-5-5" } })).toBe(true);
    expect(isModelResponse({ type: "assistant", message: { model: "<synthetic>" } })).toBe(false);
    expect(isModelResponse({ type: "user" })).toBe(false);
    expect(isModelResponse({ type: "system", subtype: "api_retry" })).toBe(false);
  });

  it("appears in the recorded stream only as its assistant events", () => {
    expect(responseTimes(recorded)).toEqual(["2026-10-17T18:45:51.231Z"]);
  });
});

describe("whether a sleep cut the run off", () => {
  it("is no when no sleep was recorded on the run", () => {
    expect(sleepInterruption([], 0, responseTimes(recorded))).toBeUndefined();
    // A sleep during an earlier run doesn't make this run's exit an interruption.
    expect(sleepInterruption([sleep("2026-10-17T18:45:55.000Z", 0)], 1, [])).toBeUndefined();
  });

  it("is yes for a run a sleep killed mid-Bash: the Bash call's result arrives after wake, but no model response", () => {
    // The sleep began during the foreground Bash call and was found at 18:46:00; after it the
    // stream holds only the tool's result, a system event and the error result.
    const verdict = sleepInterruption([sleep("2026-10-17T18:46:00.000Z")], 0, responseTimes(recorded));
    expect(verdict).toEqual({ at: "2026-10-17T18:45:52.000Z" });
  });

  it("is yes for a run a sleep killed mid-response, where the only assistant event after wake is synthetic", () => {
    const afterWake: SavedEvent[] = [
      ...recorded.slice(0, 14),
      { at: "2026-10-17T18:56:10.000Z", event: { type: "system", subtype: "api_retry" } },
      { at: "2026-10-17T18:56:40.000Z", event: { type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: "API Error: Connection error." }] } } },
    ];
    expect(sleepInterruption([sleep("2026-10-17T18:56:05.000Z")], 0, responseTimes(afterWake))).toEqual({ at: "2026-10-17T18:45:52.000Z" });
  });

  it("is no for a run that got a model response after waking, then ended on its own on a usage limit", () => {
    const survived: SavedEvent[] = [...recorded, { at: "2026-10-17T18:56:20.000Z", event: { type: "assistant", message: { model: "claude-sonnet-5-5" } } }];
    expect(sleepInterruption([sleep("2026-10-17T18:56:05.000Z")], 0, responseTimes(survived))).toBeUndefined();
  });

  it("judges by the latest sleep on the run, when there were several", () => {
    const times = ["2026-10-17T18:50:00.000Z"];
    const sleeps = [sleep("2026-10-17T18:49:00.000Z"), { ...sleep("2026-10-17T18:55:00.000Z"), at: "2026-10-17T18:51:00.000Z" }];
    expect(sleepInterruption(sleeps, 0, times)).toEqual({ at: "2026-10-17T18:51:00.000Z" });
  });
});
