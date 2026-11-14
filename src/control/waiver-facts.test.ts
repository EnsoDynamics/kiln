// Waivers AC-WAIVE-05/10/12 as status, receipts and the terminal show them: per check state and
// items, per activity waived counts, waivers and warnings, the mockup's terminal wording, and the
// command line's Mark complete preview.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrdRecord, CheckResult } from "../state/records.js";
import type { MarkCompleteOffer, Waiver, AuditWaiverResult } from "../engine/waivers.js";
import { activityWaivers, markCompletePreview, previewLines, progressRows, progressText, projectCheck, receiptLines, terminalWaivers } from "./waiver-facts.js";
import { formatTerminalEvent } from "../kiln-command.js";

const plain = { green: (s: string) => s, amber: (s: string) => s, red: (s: string) => s, grey: (s: string) => s, bold: (s: string) => s } as unknown as Parameters<typeof formatTerminalEvent>[2];
let zone: string | undefined;
beforeAll(() => { zone = process.env.TZ; process.env.TZ = "America/New_York"; });
afterAll(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });

const requirement = { kind: "development_requirement" as const, subject: "phase3-dev-fixes-4/dev-health-reports-merge", text: "/deployed_sha does not match its declared target/artifact.", against: "phase3-dev-fixes-4:eae98b13" };
const rerun: CheckResult[] = [
  { name: "Phase doc closed", passed: true, facts: ["Closed line in phase-3.md"] },
  { name: "Everything committed", passed: true, facts: ["Clean"] },
  { name: "Pushed", passed: true, facts: ["Pushed abc1234"] },
  { name: "Required development delivery verified", passed: false, facts: [requirement.text], items: [{ ...requirement }] },
];
const waiver: Waiver = {
  waiverId: "w-3", at: "2026-11-02T00:16:22.000Z", activityKey: "3", activityKind: "implementation", effect: "completed",
  source: { via: "browser", account: "alex" }, operationId: "op-1", checkRun: { id: "run-1", at: "2026-11-02T00:16:00.000Z" },
  items: [{ check: "Required development delivery verified", ...requirement }], checks: rerun,
};
function record(extra: Partial<PrdRecord> = {}): PrdRecord {
  return {
    featureName: "Example feature", prdDirectory: "docs/prds/example-feature",
    plan: [{ id: "2", title: "Import pipeline", file: "phase-2.md", closed: true, repositories: [] }, { id: "3", title: "Dev delivery fixes", file: "phase-3.md", closed: false, repositories: [] }, { id: "4", title: "Reporting views", file: "phase-4.md", closed: false, repositories: [] }],
    activities: [{ activityId: "a2", sequence: 1, kind: "implementation", key: "2", createdAt: "" }, { activityId: "a3", sequence: 2, kind: "implementation", key: "3", createdAt: "" }, { activityId: "a4", sequence: 3, kind: "implementation", key: "4", createdAt: "" }],
    phases: {
      "2": { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: "2026-11-01T20:00:00.000Z" },
      "3": { sessionIds: [], finishedByPerson: true, repositories: {}, doneAt: "2026-11-02T00:16:22.000Z", waiverId: "w-3" },
      "4": { sessionIds: [], finishedByPerson: false, repositories: {} },
    },
    waivers: [waiver],
    ...extra,
  } as unknown as PrdRecord;
}

describe("status waiver facts", () => {
  it("projects each check's state and each item's waiver in snake case", () => {
    const covered: CheckResult = { name: "Pushed", passed: true, waived: true, facts: ["x"], items: [{ kind: "repository_work", subject: "example-app", text: "4c1a9e0 isn't on origin yet", against: "h:c", waiver: { waiverId: "w-1", activityKey: "2", at: "2026-11-01T20:00:00.000Z", via: "command_line", account: "alex", by: "grokbot" } }] };
    expect(projectCheck(covered)).toMatchObject({ name: "Pushed", state: "waived", items: [{ text: "4c1a9e0 isn't on origin yet", waived: { waiver_id: "w-1", activity: "2", at: "2026-11-01T20:00:00.000Z", via: "command_line", account: "alex", by: "grokbot" } }] });
    expect(projectCheck({ name: "Pushed", passed: true, facts: ["ok"] })).toMatchObject({ state: "passed", items: [] });
    expect(projectCheck({ name: "Pushed", passed: false, facts: ["legacy row"] })).toMatchObject({ state: "failed", items: [{ text: "legacy row" }] });
  });

  it("counts a completed activity's waived checks from its own waiver's run, never as passed", () => {
    const facts = activityWaivers(record(), "3");
    expect(facts).toMatchObject({ waived_checks: 1, waiver_id: "w-3", counts: { passed: 3, waived: 1, failed: 0 }, warnings: [], waivers: [{ waiver_id: "w-3", source: { via: "browser", account: "alex", by: null }, items: [{ check: "Required development delivery verified", subject: requirement.subject }] }] });
    expect(facts.checks!.find(c => c.name === "Required development delivery verified")).toMatchObject({ state: "waived", items: [{ waived: { waiver_id: "w-3", activity: "3" } }] });
    expect(activityWaivers(record(), "2")).toMatchObject({ waived_checks: 0, counts: null, waivers: [] });
  });

  it("counts a carried waiver from completionChecks, and a continued waiver on an already-complete activity", () => {
    const carried = record();
    carried.phases["4"] = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: "2026-11-02T01:00:00.000Z", completionChecks: [{ name: "Pushed", passed: true, waived: true, facts: ["x"], items: [{ kind: "repository_work", subject: "example-app", text: "unpushed", against: "h", waiver: { waiverId: "w-3", activityKey: "3", at: waiver.at, via: "browser", account: "alex" } }] }] };
    expect(activityWaivers(carried, "4")).toMatchObject({ waived_checks: 1, waiver_id: null, counts: { passed: 0, waived: 1, failed: 0 } });
    const continued = record({ waivers: [waiver, { ...waiver, waiverId: "w-c", activityKey: "2", effect: "continued", items: [{ check: "Required development delivery verified", ...requirement }] }] });
    expect(activityWaivers(continued, "2").waived_checks).toBe(1);
  });

  it("marks plan, audit-readiness and no-report warnings, reading an audit's waiver result", () => {
    const audit = record({
      waivers: [waiver, { ...waiver, waiverId: "w-a", activityKey: "audit-d1", activityKind: "delivery_audit", items: [{ check: "Audit result recorded", kind: "other", subject: "No audit report", text: "No audit report", against: "h" }], checks: [{ name: "Audit result recorded", passed: false, facts: ["No audit report"], items: [{ kind: "other", subject: "No audit report", text: "No audit report", against: "h" }] }] }],
      completionAudits: { activities: [{ activityId: "d1", kind: "delivery_audit", round: 1, continuationIndex: 1, waivedResult: "r1" }] } as unknown as NonNullable<PrdRecord["completionAudits"]>,
    });
    audit.phases["audit-d1"] = { sessionIds: [], finishedByPerson: true, repositories: {}, doneAt: waiver.at, waiverId: "w-a" };
    audit.phases["4"]!.waiverWarning = { kind: "plan", waiverId: "w-p" };
    const read = (): AuditWaiverResult => ({ kind: "audit_waiver", activityId: "d1", waiverId: "w-a", report: "none", countedOutcome: "passed", snapshotRef: "s" });
    expect(activityWaivers(audit, "audit-d1", read)).toMatchObject({ waived_checks: 1, counts: { passed: 0, waived: 1, failed: 0 }, warnings: [{ kind: "no_audit_report", text: "no audit report: Kiln couldn’t tell what this audit found" }] });
    expect(activityWaivers(audit, "4").warnings).toEqual([{ kind: "plan_problem_waived", text: "plan problem waived: Kiln followed its normal order", waiver_id: "w-p" }]);
  });

  it("prints the mockup's kiln status block: complete · 1 check waived with time and source, counts and the waived item", () => {
    const rows = progressRows(record(), "4");
    expect(rows.map(r => [r.key, r.state, r.status_label])).toEqual([["2", "complete", "Complete"], ["3", "complete", "Complete · 1 check waived"], ["4", "running", null]]);
    expect(progressText("Example feature · example-app · docs/prds/example-feature", rows)).toBe([
      "Example feature · example-app · docs/prds/example-feature",
      "Phase 2   Import pipeline      complete",
      "Phase 3   Dev delivery fixes   complete · 1 check waived 2026-11-01 19:16 EST · browser · alex",
      "                               3 passed · 1 waived",
      "                               waived  phase3-dev-fixes-4 / dev-health-reports-merge",
      "                                       /deployed_sha does not match its declared target/artifact.",
      "Phase 4   Reporting views      running",
      "",
    ].join("\n"));
  });

  it("adds the waiver to Kiln's own terminal lines when an activity completes", () => {
    expect(terminalWaivers(record(), "3").suffix).toBe("· 1 check waived 2026-11-01 19:16 EST · browser · alex");
    const at = new Date("2026-11-02T00:16:22.000Z");
    const line = formatTerminalEvent({ kind: "phase", at, phaseId: "3", title: "Dev delivery fixes", event: "done" }, record(), plain);
    expect(line).toContain("complete · 1 check waived 2026-11-01 19:16 EST · browser · alex");
    expect(line).not.toContain("pushed");
    // The mockup's waived phase reads complete even when the session had pushed before it stopped.
    const pushed = formatTerminalEvent({ kind: "phase", at, phaseId: "3", title: "Dev delivery fixes", event: "done", pushedSha: "abc1234def" }, record(), plain);
    expect(pushed).toMatch(/Dev delivery fixes +complete · 1 check waived 2026-11-01 19:16 EST · browser · alex$/);
    expect(pushed).not.toContain("pushed");
    expect(formatTerminalEvent({ kind: "phase", at, phaseId: "2", title: "Import pipeline", event: "done", pushedSha: "abc1234" }, record(), plain)).not.toContain("waived");
  });

  it("prints a waived audit as complete · 1 check waived with its no-report warning, never Audit result recorded", () => {
    const audit = record({
      waivers: [waiver, { ...waiver, waiverId: "w-a", at: "2026-11-02T00:34:10.000Z", activityKey: "audit-d1", activityKind: "delivery_audit", items: [{ check: "Audit result recorded", kind: "other", subject: "No audit report", text: "No audit report", against: "h" }], checks: [{ name: "Audit result recorded", passed: false, facts: ["No audit report"], items: [{ kind: "other", subject: "No audit report", text: "No audit report", against: "h" }] }] }],
      completionAudits: { activities: [{ activityId: "d1", kind: "delivery_audit", round: 1, continuationIndex: 1, waivedResult: "r1" }] } as unknown as NonNullable<PrdRecord["completionAudits"]>,
    });
    audit.phases["audit-d1"] = { sessionIds: [], finishedByPerson: true, repositories: {}, doneAt: "2026-11-02T00:34:10.000Z", waiverId: "w-a" };
    const read = (): AuditWaiverResult => ({ kind: "audit_waiver", activityId: "d1", waiverId: "w-a", report: "none", countedOutcome: "passed", snapshotRef: "s" });
    const line = formatTerminalEvent({ kind: "audit", at: new Date("2026-11-02T00:34:10.000Z"), activityId: "d1", label: "Delivery audit", round: 1, event: "done" } as Parameters<typeof formatTerminalEvent>[0], audit, plain, read);
    const [first, warning] = line.split("\n");
    expect(first).toMatch(/Delivery audit · Round 1 +complete · 1 check waived 2026-11-01 19:34 EST · browser · alex$/);
    expect(first).not.toContain("Audit result recorded");
    expect(warning!.trim()).toBe("! no audit report: Kiln couldn’t tell what this audit found");
  });

  it("prints a final delivery completed on a waiver as Final delivery complete, never a pull request opened #0", () => {
    const final = record({ waivers: [waiver, { ...waiver, waiverId: "w-pr", at: "2026-11-02T00:42:00.000Z", activityKey: "pr", activityKind: "final_delivery" }] } as Partial<PrdRecord>);
    final.phases.pr = { sessionIds: [], finishedByPerson: true, repositories: {}, doneAt: "2026-11-02T00:42:00.000Z", waiverId: "w-pr" };
    const at = new Date("2026-11-02T00:42:00.000Z");
    const line = formatTerminalEvent({ kind: "pull_request", at, event: "opened" }, final, plain);
    expect(line).toMatch(/PR +Final delivery +complete · 1 check waived 2026-11-01 19:42 EST · browser · alex$/);
    expect(line).not.toMatch(/opened|#0/);
    // A pull request that was opened still reads as opened, with the waiver after it.
    expect(formatTerminalEvent({ kind: "pull_request", at, event: "opened", number: 12 }, final, plain)).toMatch(/opened #12 · 1 check waived 2026-11-01 19:42 EST/);
  });
});

const offer: MarkCompleteOffer = {
  offered: true, label: "Mark Phase 3 complete", heading: "Phase 3 is done, and Kiln’s check is wrong?", continueInOrder: false, checkRunId: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b",
  items: [{ check: "Required development delivery verified", ...requirement }], failingChecks: 1,
  nextActivity: { kind: "phase", key: "4", title: "Reporting views" }, resultingLabel: "Complete · 1 check waived",
  sentence: ["Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to the next step. Phase 3 will show as “Complete · 1 check waived”."], noReport: false,
};

describe("the command line's Mark complete preview", () => {
  it("carries the offer in snake case with next_argv repeating the command with --confirm and a new command id placeholder", () => {
    const preview = markCompletePreview(offer, "/work/shop/docs/prds/orders", "exec:token-2", true);
    expect(preview).toMatchObject({ offered: true, check_run_id: offer.checkRunId, resulting_label: "Complete · 1 check waived", items: [{ check: "Required development delivery verified", kind: "development_requirement", subject: requirement.subject, text: requirement.text }],
      next_argv: ["kiln", "waive-and-advance", "/work/shop/docs/prds/orders", "--confirm", "--without-sending-reply", "--only-if-status-matches", "exec:token-2", "--command-id", "<new-command-id>"] });
    expect((preview.items as Record<string, unknown>[])[0]).not.toHaveProperty("against");
    // The page's unusable button wording stays out of kiln status (waivers AC-WAIVE-02, AC-WAIVE-05).
    expect(markCompletePreview({ offered: false, reason: "No check has run since Phase 3 stopped.", awaitingRecheck: { label: "Mark Phase 3 complete", heading: "Phase 3 is done, and Kiln’s check is wrong?" } }, "/p", "t")).toEqual({ offered: false, reason: "No check has run since Phase 3 stopped." });
    expect(markCompletePreview(offer, "/p", null).next_argv).toBeNull();
  });

  it("prints what Mark complete would waive and do next, as the mockup's bot state shows", () => {
    const preview = markCompletePreview(offer, "/p", "7f3c9a1e");
    expect(previewLines(preview, "2026-11-02T00:14:05.000Z")).toEqual([
      "Checked again 2026-11-01 19:14 EST: 1 check failing.",
      "Marking it complete would waive:",
      "  Required development delivery verified",
      "    phase3-dev-fixes-4 / dev-health-reports-merge",
      "    /deployed_sha does not match its declared target/artifact.",
      "Phase 3 would then show as Complete · 1 check waived, and Kiln would start Phase 4 · Reporting views.",
      "To mark it complete, run again with --confirm --only-if-status-matches 7f3c9a1e --command-id <a new id>.",
    ]);
  });

  it("leads a recheck receipt with the preview, and a waiver receipt with its outcome and source", () => {
    const recheck = { operation: { id: "op_51d1", action: "check-again", state: "completed", outcome: "completion_checks_failed", reason: null, updated_at: "2026-11-02T00:14:05.000Z" }, mark_complete: markCompletePreview(offer, "/p", "7f3c9a1e") };
    expect(receiptLines(recheck)![0]).toBe("Operation op_51d1 completed. Phase 3 is still at Needs you.");
    expect(receiptLines({ operation: { ...recheck.operation, outcome: "advanced" } })).toBeUndefined();
    const marked = { operation: { id: "op_51d2", action: "waive-and-advance", state: "completed", outcome: "marked_complete", reason: null, updated_at: "", waiver_id: "w-3" } };
    const withBot = record({ waivers: [{ ...waiver, source: { via: "command_line", account: "alex", by: "grokbot" } }] });
    expect(receiptLines(marked, withBot)).toEqual(["Operation op_51d2 completed. Phase 3 marked complete (1 check waived · source: command line · alex · grokbot)."]);
    expect(receiptLines({ operation: { ...marked.operation, state: "accepted", outcome: null } })).toEqual(["Operation op_51d2 accepted."]);
    const changed = receiptLines({ operation: { ...marked.operation, outcome: "check_results_changed", waiver_id: undefined, changes: [{ check: "Pushed", subject: "example-app", change: "newly_failing", after: "4c1a9e0 isn't on origin yet" }] } })!;
    expect(changed[0]).toContain("nothing was waived"); expect(changed[1]).toBe("  Pushed · example-app: now fails — 4c1a9e0 isn't on origin yet");
  });

  it("words refusals as the mockup does", () => {
    const refused = (reason: string) => receiptLines({ operation: { id: "op", action: "waive-and-advance", state: "refused", outcome: "mark_complete_not_offered", reason, updated_at: "" } })![0];
    expect(refused("No check has run since Phase 3 stopped.")).toBe("Refused: no check has run since Phase 3 stopped. Run without --confirm to check again first.");
    expect(refused("Phase 3 is running, not at Needs you. There is nothing to mark complete.")).toBe("Refused: Phase 3 is running, not at Needs you. There is nothing to mark complete.");
  });
});
