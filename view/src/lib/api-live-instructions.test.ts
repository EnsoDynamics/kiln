// Pause now and Cancel keep one instruction ID only while the answer is uncertain, so a Pause now
// pressed again after a Cancel is a new instruction (Kiln Pause Now, "Design Decisions").
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveTarget } from "../../../src/live/target.js";
import { cancelTakeOver, checkForNewPhases, takeOver, type PageConfig } from "./api.js";

const target: LiveTarget = { executionId: "e", activityId: "a", activityKey: "2b", sessionId: "s", providerSessionId: "s", attemptId: "t" };
const config: PageConfig = { token: "token", base: "/customer-returns" };

/** Answers each request with the next status, and records each request's instruction ID and path. */
function answering(...statuses: (number | "network")[]) {
  const sent: { path: string; instructionId: string; takeoverInstructionId?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { instructionId: string; takeoverInstructionId?: string };
    sent.push({ path, instructionId: body.instructionId, ...(body.takeoverInstructionId ? { takeoverInstructionId: body.takeoverInstructionId } : {}) });
    const status = statuses.shift() ?? 202;
    if (status === "network") throw new Error("Network down.");
    return new Response(JSON.stringify(status < 300 ? { ok: true, receipt: {} } : { ok: false, code: "x", reason: "Refused." }), { status });
  }));
  return sent;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("live instruction identity", () => {
  it("replays the same Pause now instruction after an uncertain answer, then starts a new one after a definite answer", async () => {
    const sent = answering("network", 503, 202, 202);
    expect((await takeOver(config, target)).ok).toBe(false);
    expect((await takeOver(config, target)).ok).toBe(false);
    expect((await takeOver(config, target)).ok).toBe(true);
    await takeOver(config, target);
    expect(sent[1]!.instructionId).toBe(sent[0]!.instructionId);
    expect(sent[2]!.instructionId).toBe(sent[0]!.instructionId);
    expect(sent[3]!.instructionId).not.toBe(sent[2]!.instructionId);
  });

  it("forgets a refused instruction, and sends Cancel to its own route with the hold's instruction ID", async () => {
    const sent = answering(409, 503, 202);
    const refused = await cancelTakeOver(config, target, "pause-now-2b");
    expect(refused).toEqual({ ok: false, reason: "Refused." });
    await cancelTakeOver(config, target, "pause-now-2b");
    await cancelTakeOver(config, target, "pause-now-2b");
    expect(sent.map(one => one.path)).toEqual(["/api/live/cancel-take-over", "/api/live/cancel-take-over", "/api/live/cancel-take-over"]);
    expect(sent.every(one => one.takeoverInstructionId === "pause-now-2b")).toBe(true);
    expect(sent[1]!.instructionId).not.toBe(sent[0]!.instructionId);
    expect(sent[2]!.instructionId).toBe(sent[1]!.instructionId);
  });
});

describe("the check for new phases", () => {
  it("takes the status token its answer carries, so a press straight after it is not refused as stale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ check: { status: "unchanged" }, controlToken: "e:after-check" }), { status: 200 })));
    const page: PageConfig = { token: "token", base: "/customer-returns", controlToken: "e:before-check" };
    expect((await checkForNewPhases(page, false)).check).toMatchObject({ status: "unchanged" });
    expect(page.controlToken).toBe("e:after-check");
  });
});
