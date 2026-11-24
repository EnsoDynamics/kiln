// Waivers AC-WAIVE-05/10/12 as status, receipts and the terminal show them: per check state and
// items, per activity waived counts, waivers and warnings, the mockup's terminal wording, and the
// command line's Mark complete preview.
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrdRecord, CheckResult } from "../state/records.js";
import type { MarkCompleteOffer, Waiver, AuditWaiverResult } from "../engine/waivers.js";
import { activityWaivers, locateText, markCompletePreview, previewLines, progressRows, progressText, projectCheck, receiptLines, terminalWaivers } from "./waiver-facts.js";
import { formatTerminalEvent } from "../kiln-command.js";
import { terminalColors } from "../terminal-output.js";

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

  it("names the Merge and Push the plan rows as the screens do, in text and JSON (Kiln After Delivery AC-BOT-02)", () => {
    const after = record({ activities: [{ activityId: "a2", sequence: 1, kind: "implementation", key: "2", createdAt: "" }, { activityId: "m", sequence: 2, kind: "merge", key: "merge", createdAt: "" }, { activityId: "p", sequence: 3, kind: "plan_push", key: "plan-push-op-9", createdAt: "" }] as unknown as NonNullable<PrdRecord["activities"]> });
    after.phases.merge = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: "2026-11-02T02:00:00.000Z" };
    const rows = progressRows(after, "plan-push-op-9");
    expect(rows.filter(r => r.key === "merge" || r.key.startsWith("plan-push-")).map(r => [r.key, r.label, r.title, r.state])).toEqual([["merge", "Merge", "", "complete"], ["plan-push-op-9", "Push the plan", "", "running"]]);
    const text = progressText("Example feature", rows);
    expect(text).toContain("Merge");
    expect(text).toContain("Push the plan");
    expect(text).not.toContain("Phase merge");
    expect(text).not.toContain("Phase plan-push");
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
    const line = formatTerminalEvent({ kind: "audit", at: new Date("2026-11-02T00:34:10.000Z"), activityId: "d1", title: "Delivery audit", event: "done" } as Parameters<typeof formatTerminalEvent>[0], audit, plain, read);
    const [first, warning] = line.split("\n");
    expect(first).toMatch(/Delivery audit +complete · 1 check waived 2026-11-01 19:34 EST · browser · alex$/);
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

  it.each([
    ["pull_request_session", "Kiln would then start the pull request session, with each item under For you as still open and marked Waived."],
    ["complete", "Kiln would then complete the run, with each item under For you as still open and marked Waived."],
  ] as const)("ends Continue anyway's preview at the hold stop with what it leads to, %s (Kiln Deliver When Audit Loops Run Out AC-ITEM-01)", (hold, last) => {
    const lines = previewLines(markCompletePreview({ ...offer, label: "Continue anyway", continueInOrder: true, hold, nextActivity: null, sentence: ["Continue anyway. Kiln records each item above as waived, never as settled."] }, "/p", "7f3c9a1e"), "2026-11-02T00:14:05.000Z");
    expect(lines).toContain(last);
    expect(lines.join("\n")).not.toContain("a warning on each step");
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

  it("prints a locate-repository answer not yet settled as accepted, as mockup state 7 draws it (find repositories anywhere AC-SEE-05)", () => {
    for (const state of ["accepted", "in_progress"]) {
      expect(receiptLines({ operation: { id: "op_61a2", action: "locate-repository", state, outcome: null, reason: null, updated_at: "" } })).toEqual(["Operation op_61a2 accepted."]);
    }
  });

  it("words refusals as the mockup does", () => {
    const refused = (reason: string) => receiptLines({ operation: { id: "op", action: "waive-and-advance", state: "refused", outcome: "mark_complete_not_offered", reason, updated_at: "" } })![0];
    expect(refused("No check has run since Phase 3 stopped.")).toBe("Refused: no check has run since Phase 3 stopped. Run without --confirm to check again first.");
    expect(refused("Phase 3 is running, not at Needs you. There is nothing to mark complete.")).toBe("Refused: Phase 3 is running, not at Needs you. There is nothing to mark complete.");
  });
});

describe("kiln status's question lines on a terminal (find repositories anywhere AC-SEE-05)", () => {
  it("draws every question line light grey, checkouts and Which included, and the Controls line grey", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const stop = { locate: [{ kind: "which", address_path: "acme-labs/ledger", label: "ledger", phase_file: null, searched_from: "/home/a/code/acme", searched_to: null, checkouts: [{ folder: "/home/a/code/acme-labs/ledger", remote: "github.com/acme-labs/ledger", pickable: true }, { folder: "/home/a/archive/ledger", remote: "git.example.com/acme-labs/ledger", pickable: false }], available: true, reason: null }] };
    const lines = locateText(stop, colors);
    const plain = locateText(stop);
    expect(plain.at(-1)).toBe("Controls: locate-repository (available)");
    expect(lines).toEqual([...plain.slice(0, -1).map((line) => colors.lightGrey(line)), colors.grey(plain.at(-1)!)]);
    expect(plain).toContain("Which should it use?");
    expect(plain.filter((line) => line.startsWith("  "))).toHaveLength(2);
  });

  it("lists each checkout found with its remote, one not on GitHub marked, and the refusal's reason when the command isn't available (find repositories anywhere AC-ASK-06)", () => {
    const home = homedir();
    const checkouts = [{ folder: join(home, "code", "acme-labs", "ledger"), remote: "github.com/acme-labs/ledger", pickable: true }, { folder: join(home, "archive", "ledger"), remote: "git.example.com/acme-labs/ledger", pickable: false }];
    const which = { locate: [{ kind: "which", address_path: "acme-labs/ledger", label: "ledger", phase_file: null, searched_from: join(home, "code", "acme"), searched_to: null, checkouts, available: false, reason: "Kiln is already checking. Answer again once it finishes." }] };
    expect(locateText(which)).toEqual([
      "A session asked for ledger: Kiln found 2 checkouts of acme-labs/ledger.",
      "Which should it use?",
      "  ~/code/acme-labs/ledger  github.com/acme-labs/ledger",
      "  ~/archive/ledger  git.example.com/acme-labs/ledger  (not on GitHub)",
      "Controls: locate-repository (Kiln is already checking. Answer again once it finishes.)",
    ]);
    // Only checkouts Kiln can't deliver to: the "where" sentence names them, and the plan stop's waive line follows.
    const where = { mark_complete: { offered: false, reason: "No check has run since Phase 4 stopped." }, locate: [{ kind: "where", address_path: "acme-labs/inventory", label: "inventory", phase_file: "phase-4-restock.md", searched_from: join(home, "code", "acme"), searched_to: join(home, "code"), checkouts: [checkouts[1]!], available: true, reason: null }] };
    expect(locateText(where)).toEqual([
      "Phase plan reads: Kiln couldn’t find a checkout of acme-labs/inventory that it can deliver to.",
      "It searched outward from ~/code/acme/, as far as ~/code/.",
      "  ~/archive/ledger  git.example.com/acme-labs/ledger  (not on GitHub)",
      "Controls: locate-repository (available) · waive-and-advance (once a recheck still fails)",
    ]);
  });
});

describe("kiln status names each closing audit for what it does (Kiln After Delivery AC-AUDIT-01, AC-BOT-02)", () => {
  it("titles audit rows Delivery audit, Test audit and Fixing tests with their loop line, and carries a session of test fixes' loop and session", () => {
    const audit = (activityId: string, kind: "delivery_audit" | "test_audit", round: number, continuationIndex: number) => ({ activityId, sequence: 0, kind, round, continuationIndex, createdAt: "", sessionIds: [], reportPath: "", snapshots: [], attempts: [] });
    const done = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: "2026-11-01T20:00:00.000Z" };
    const rows = progressRows(record({
      activities: [{ activityId: "d1", sequence: 1, kind: "delivery_audit", key: "audit-d1", createdAt: "" }, { activityId: "t1", sequence: 2, kind: "test_audit", key: "audit-t1", createdAt: "" }, { activityId: "t1-2", sequence: 3, kind: "test_audit", key: "audit-t1-2", createdAt: "" }],
      completionAudits: { revision: 1, policy: "required", evidence: [], activities: [audit("d1", "delivery_audit", 1, 1), audit("t1", "test_audit", 1, 1), audit("t1-2", "test_audit", 1, 2)] },
      auditLoops: { epochs: [{ kind: "delivery", at: "", cause: "start", loopsBefore: 0 }, { kind: "test", at: "", cause: "start", loopsBefore: 0 }], loops: [{ kind: "delivery", number: 1, startedAt: "", activityKey: "audit-d1" }, { kind: "test", number: 1, startedAt: "", activityKey: "audit-t1" }] },
      settings: { auditLoops: { deliveryLimit: 3, testLimit: 4 } },
      phases: { "audit-d1": done, "audit-t1": done, "audit-t1-2": { sessionIds: [], finishedByPerson: false, repositories: {} } },
      waivers: [],
    } as unknown as Partial<PrdRecord>), "audit-t1-2");
    expect(rows.map(row => ({ label: row.label, title: row.title, fixing: row.fixing }))).toEqual([
      { label: "Delivery audit", title: "Loop 1 of 3", fixing: undefined },
      { label: "Test audit", title: "Loop 1 of 4", fixing: undefined },
      { label: "Fixing tests", title: "From test audit loop 1 · session 1", fixing: { loop: 1, session: 1 } },
    ]);
    const text = progressText("Example feature", rows);
    expect(text).toContain("Fixing tests");
    expect(text).not.toMatch(/Round|Continuation/);
  });
});
