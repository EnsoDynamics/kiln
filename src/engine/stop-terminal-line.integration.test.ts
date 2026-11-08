// Which events a stop raises: one `stopped` per move into Needs you, for every kind of activity
// (AC-START-09). kiln-run-underway.integration proves the printed line; this proves the count.
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import type { AuditActivity } from "../audit/contracts.js";
import { PR_PHASE_KEY } from "../state/records.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import type { TerminalEvent } from "./engine.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const stopped = (events: TerminalEvent[]) => events.filter(event => "event" in event && event.event === "stopped");
const check = { name: "Agent selection and readiness", passed: false, facts: ["Kiln's own fact."] };
const recordStop = (key: string, kind = "selection") => (h!.engine as unknown as { recordStop(key: string, kind: string, checks: unknown[]): void }).recordStop(key, kind, [check]);
const afterPhaseOneStops = async (sessions: ScenarioSession[] = [{ actions: [{ result: "I need a decision." }] }]) => {
  h = await createHarness({ sessions });
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
};

describe("the stopped event", () => {
  it("is raised once when a phase session fails its check", async () => {
    await afterPhaseOneStops();
    expect(stopped(h!.events)).toMatchObject([{ kind: "phase", phaseId: "1", event: "stopped" }]);
  });

  it("names a pull request stop and an audit stop as those activities", async () => {
    h = await createHarness({ sessions: [landingSession()] });
    recordStop(PR_PHASE_KEY, "pull_request_check");
    (h.engine.record as { completionAudits?: unknown }).completionAudits = { revision: 0, policy: "required", evidence: [], activities: [{ activityId: "a1", sequence: 1, kind: "test_audit", round: 2, continuationIndex: 1, createdAt: "2026-11-08T00:00:00Z", sessionIds: [], reportPath: "report.md", snapshots: [], attempts: [] } satisfies AuditActivity] };
    recordStop("audit-a1", "done_check");
    expect(stopped(h.events)).toMatchObject([{ kind: "pull_request", event: "stopped" }, { kind: "audit", activityId: "a1", label: "Test audit", round: 2, event: "stopped" }]);
  });

  it("is not raised again by a check that still fails", async () => {
    await afterPhaseOneStops();
    const before = stopped(h!.events).length;
    expect(await h!.engine.checkAgain(recoveryRequest(h!.engine, "verify"))).toMatchObject({ ok: true, outcome: "still_stopped" });
    await h!.engine.settled();
    expect(h!.engine.record.phases["1"]!.stop).toBeDefined();
    expect(stopped(h!.events)).toHaveLength(before);
  });

  it("is not raised again when a retained stop is replaced", async () => {
    await afterPhaseOneStops();
    recordStop("1", "not_resumable");
    expect(h!.engine.record.phases["1"]!.stop!.kind).toBe("not_resumable");
    expect(stopped(h!.events)).toHaveLength(1);
  });

  it("is raised again when a resumed session fails its check, since Kiln said it resumed", async () => {
    await afterPhaseOneStops([{ actions: [{ result: "I need a decision." }] }, { actions: [{ result: "Still not done." }] }]);
    expect(await h!.engine.resume(recoveryRequest(h!.engine))).toMatchObject({ ok: true });
    await h!.engine.settled();
    expect(stopped(h!.events)).toHaveLength(2);
  });

  it("is raised once when a held message leaves the phase at Needs you, however often the hold is reconciled", async () => {
    await afterPhaseOneStops();
    const session = h!.engine.latestSession("1")!;
    delete h!.engine.record.phases["1"]!.stop;
    const before = stopped(h!.events).length;
    h!.engine.record.liveControl = { version: 1, revision: 1, takeover: { kind: "delivery_recovery", target: { activityKey: "1", sessionId: session.sessionId, attemptId: "missing", providerSessionId: session.sessionId }, operationId: "op", instructionId: "instruction", requestedAt: "2026-11-08T00:00:00Z", state: "pending", observedAt: "2026-11-08T00:00:00Z", reason: "Message delivery is uncertain." } } as never;
    await h!.engine.reconcileTakeover();
    await h!.engine.reconcileTakeover();
    expect(h!.engine.record.phases["1"]!.stop).toBeDefined();
    expect(stopped(h!.events)).toHaveLength(before + 1);
    delete h!.engine.record.liveControl;
  });

  describe("around a billing hold", () => {
    const holdAgain = () => {
      const engine = h!.engine as unknown as { holdBilling(key: string, session: unknown, cause: string, observed: unknown, reason: string): void };
      engine.holdBilling("1", h!.engine.latestSession("1"), "resume", h!.engine.record.billing!.hold?.observed ?? h!.engine.billing.view.next, "Held again.");
    };
    const heldAtLaunch = async () => {
      h = await createHarness({ sessions: [landingSession()] });
      await h.engine.refreshBilling();
      const off = h.engine.onChange(() => { if (h!.engine.record.setupCompletedAt) h!.env.ANTHROPIC_API_KEY = "post-setup-canary"; });
      await h.engine.start({ refinementConfirmed: true });
      await h.engine.settled();
      off();
      expect(stopped(h.events)).toHaveLength(1);
    };
    it("is not raised again by a second hold, or by a stop recorded during the hold", async () => {
      await heldAtLaunch();
      holdAgain();
      recordStop("1", "not_resumable");
      expect(stopped(h!.events)).toHaveLength(1);
    });
    it("is not raised by a hold on a phase already stopped, which still says why", async () => {
      await afterPhaseOneStops();
      await h!.engine.refreshBilling();
      holdAgain();
      expect(stopped(h!.events)).toHaveLength(1);
      expect(h!.events.filter(event => event.kind === "message").at(-1)).toMatchObject({ text: expect.stringContaining("Held again.") });
    });
  });

  it("is raised once for a billing hold, before the hold's own message", async () => {
    h = await createHarness({ sessions: [landingSession()] });
    await h.engine.refreshBilling();
    const off = h.engine.onChange(() => { if (h!.engine.record.setupCompletedAt) h!.env.ANTHROPIC_API_KEY = "post-setup-canary"; });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    off();
    expect(h.engine.record.billing!.hold).toMatchObject({ phaseKey: "1" });
    expect(h.engine.record.phases["1"]?.stop).toBeUndefined();
    expect(stopped(h.events)).toMatchObject([{ kind: "phase", phaseId: "1", event: "stopped" }]);
    const kinds = h.events.filter(event => event.kind === "message" || ("event" in event && event.event === "stopped")).map(event => event.kind);
    expect(kinds).toEqual(["phase", "message"]);
    expect(JSON.stringify(h.events)).not.toContain("post-setup-canary");
  });
});
