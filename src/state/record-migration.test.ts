// A schema 1 record, as Kiln v1 writes it, read as schema 2 with no Git call (multi-repo
// technical design, "Data Models"): the PRD's repository becomes the one entry, each phase's
// commits sit under it, the pull request becomes a one-entry list and each fact a list.

import { preflightSettled } from "../engine/preflight.js";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { migrateRecord, SCHEMA_VERSION, type PrdRecord } from "./records.js";

function schemaOne(extra: Record<string, unknown>): PrdRecord {
  return {
    schemaVersion: 1,
    repository: { mainCheckoutPath: join("/home", "a", "acme", "acme-shop"), name: "acme-shop", github: "acme/acme-shop" },
    prdDirectory: "docs/prds/customer-returns",
    featureName: "Customer returns",
    token: "t",
    settings: { worktreePath: join("/home", "a", "acme", ".worktrees", "customer-returns", "acme-shop"), featureBranch: "feature/customer-returns", baseBranch: "develop", model: "opus", effort: "high", keepAwake: true },
    phases: {},
    pause: {},
    ...extra,
  } as unknown as PrdRecord;
}

describe("migrating a schema 1 record", () => {
  it("not started: no repository entry, the default workspace folder and no other bases", () => {
    const record = migrateRecord(schemaOne({}));
    expect(record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(record.repositories).toEqual([]);
    expect(record.settings).toMatchObject({ workspaceFolder: join("/home", "a", "acme", ".worktrees", "customer-returns"), bases: {}, worktreePath: join("/home", "a", "acme", ".worktrees", "customer-returns", "acme-shop"), baseBranch: "develop" });
  });

  it("a worktree the person put elsewhere: the workspace folder is still the default, beside the PRD's repository (AC-SPACE-03)", () => {
    const record = schemaOne({});
    record.settings.worktreePath = join("/home", "a", "elsewhere", "acme-shop");
    expect(migrateRecord(record).settings).toMatchObject({ workspaceFolder: join("/home", "a", "acme", ".worktrees", "customer-returns"), worktreePath: join("/home", "a", "elsewhere", "acme-shop") });
  });

  it("holding only Kiln's branch from a failed Start: one entry keeps it", () => {
    const createdBranch = { name: "feature/customer-returns", commit: "c1", baseBranch: "main" };
    const record = migrateRecord(schemaOne({ createdBranch }));
    expect(record.repositories).toEqual([
      { name: "acme-shop", kind: "prd", mainCheckoutPath: join("/home", "a", "acme", "acme-shop"), github: "acme/acme-shop", baseBranch: "main", worktreePath: join("/home", "a", "acme", ".worktrees", "customer-returns", "acme-shop"), createdBranch },
    ]);
    expect(record).not.toHaveProperty("createdBranch");
  });

  it("underway and stopped at Needs you: the entry set up, each phase's commits under it, each check's fact a list", () => {
    const record = migrateRecord(
      schemaOne({
        startedAt: "2026-10-17T13:00:00Z",
        setupCompletedAt: "2026-10-17T13:00:05Z",
        baseCommit: "b0",
        plan: [{ id: "1", title: "Return intake", file: "phase-1-return-intake.md", closed: true }],
        phases: {
          "1": { sessionIds: ["s1"], startCommit: "b0", doneAt: "2026-10-17T14:00:00Z", pushedSha: "p1", commitCount: 2, finishedByPerson: false },
          "2b": { sessionIds: ["s2"], startCommit: "p1", finishedByPerson: false, stop: { kind: "done_check", at: "x", checkedAt: "x", checks: [{ name: "Pushed", passed: false, fact: "p2 isn't on origin yet" }] } },
        },
      }),
    );
    expect(record.repositories).toEqual([
      expect.objectContaining({ name: "acme-shop", kind: "prd", baseCommit: "b0", setupCompletedAt: "2026-10-17T13:00:05Z", worktreePath: join("/home", "a", "acme", ".worktrees", "customer-returns", "acme-shop") }),
    ]);
    expect(record.setupCompletedAt).toBe("2026-10-17T13:00:05Z");
    expect(record.phases["1"]).toEqual({ sessionIds: ["s1"], doneAt: "2026-10-17T14:00:00Z", finishedByPerson: false, repositories: { "acme-shop": { startCommit: "b0", pushedSha: "p1", commitCount: 2 } } });
    expect(record.phases["2b"]!.stop!.checks).toEqual([{ name: "Pushed", passed: false, facts: ["p2 isn't on origin yet"] }]);
    expect(record.plan![0]!.repositories).toEqual([]);
    expect(record).not.toHaveProperty("baseCommit");
  });

  it("complete: the pull request as a one-entry list, by repository", () => {
    const pullRequest = { number: 218, title: "Customer returns", url: "u", head: "feature/customer-returns", base: "develop", commits: 9, additions: 1, deletions: 2 };
    const record = migrateRecord(schemaOne({ startedAt: "s", setupCompletedAt: "s", completedAt: "c", baseCommit: "b0", pullRequest }));
    expect(record.pullRequests).toEqual([{ repository: "acme-shop", ...pullRequest }]);
    expect(record).not.toHaveProperty("pullRequest");
  });

  it("reads a schema 2 record as schema 17, retaining choices under Claude Code and usage recovery (usage-limit recovery AC-AUTO-04, Data Models)", () => {
    const record = { ...schemaOne({}), schemaVersion: 2, repositories: [] } as PrdRecord;
    const before = JSON.parse(JSON.stringify(record)) as PrdRecord;
    expect(migrateRecord(record)).toBe(record);
    expect(record).toMatchObject({ ...before, schemaVersion: SCHEMA_VERSION, settings: { ...record.settings, agentId: "claude_code", agentChoices: { claude_code: { model: "opus", effort: "high" } }, resumeAfterUsageLimit: true } });
    expect(record.settings).not.toHaveProperty("model");
    expect(record.settings).not.toHaveProperty("effort");
    expect(SCHEMA_VERSION).toBe(25);
  });

  it("reads a v1 record as schema 3 with Resume after a usage limit on, and keeps a schema 3 record's own choice (AC-AUTO-04)", () => {
    expect(migrateRecord(schemaOne({})).settings.resumeAfterUsageLimit).toBe(true);
    const three = migrateRecord(schemaOne({}));
    three.settings.resumeAfterUsageLimit = false;
    expect(migrateRecord(three).settings.resumeAfterUsageLimit).toBe(false);
  });
});

describe("retired workspace confirmations", () => {
  it("discards legacy confirmations without changing independent phase facts", () => {
    const phase = { sessionIds: ["s1"], finishedByPerson: false, stop: { kind: "done_check", at: "t", checkedAt: "t", checks: [] } };
    expect(migrateRecord(schemaOne({ phases: { "1": { ...phase } } })).phases["1"]!.outsideConfirmations).toBeUndefined();
    const two = migrateRecord(schemaOne({ phases: { "1": { ...phase } } }));
    delete (two.phases["1"] as Partial<typeof two.phases["1"]>).outsideConfirmations;
    expect(migrateRecord(two).phases["1"]!.outsideConfirmations).toBeUndefined();
    // Recorded confirmations are also retired.
    two.phases["1"]!.outsideConfirmations = [{ at: "2026-10-17T17:30:00Z" }];
    expect(migrateRecord(two).phases["1"]!.outsideConfirmations).toBeUndefined();
  });
});

it("validates durable control fields without inventing prior effects", () => {
  const old = migrateRecord(schemaOne({})); old.schemaVersion = 9;
  const current = migrateRecord(structuredClone(old));
  expect(current.schemaVersion).toBe(SCHEMA_VERSION); expect(current.controlApplied).toBeUndefined();
  expect(current.controlRevision).toBeUndefined();
  expect(() => migrateRecord({ ...current, controlRevision: -1 })).toThrow(/control metadata/);
  expect(() => migrateRecord({ ...current, controlFingerprint: "truncated" })).toThrow(/control metadata/);
});

describe("schema 20: the saved plan's read time (missing worktree recovery, Data Models)", () => {
  it("leaves planReadAt unset when a schema 19 record is read, and refuses a malformed one", () => {
    const nineteen = migrateRecord(schemaOne({}));
    nineteen.schemaVersion = 19;
    const twenty = migrateRecord(nineteen);
    expect(twenty.schemaVersion).toBe(SCHEMA_VERSION);
    expect(twenty).not.toHaveProperty("planReadAt");
    expect(() => migrateRecord({ ...twenty, planReadAt: "yesterday-ish" })).toThrow(/plan read time/);
  });
});

describe("schema 21: stop rows that report why a phase stopped (run restart AC-CASE-03, Data Models)", () => {
  it("marks a saved stop's and billing hold's reason rows by name, and leaves completion rows unmarked", () => {
    const twenty = migrateRecord(schemaOne({ phases: { "1": { sessionIds: ["s1"], finishedByPerson: false, repositories: {}, stop: { kind: "not_resumable", at: "2026-11-11T21:33:00Z", checkedAt: "2026-11-11T21:33:00Z", checks: [{ name: "Claude recovery", passed: false, facts: ["The saved conversation has no usable history."] }, { name: "Phase doc closed", passed: false, facts: ["phase-1.md has no Closed line"] }] } } } }));
    twenty.schemaVersion = 20;
    const migrated = migrateRecord(twenty);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.phases["1"]!.stop!.checks.map(check => [check.name, check.reason ?? false])).toEqual([["Claude recovery", true], ["Phase doc closed", false]]);
  });
});

describe("schema 19: completion waivers (waivers technical design, Upgrade)", () => {
  it("gives a saved stop a finished stop-origin run, so Mark complete waits for a fresh recheck", () => {
    const eighteen = migrateRecord(schemaOne({ phases: { "3": { sessionIds: ["s1"], finishedByPerson: false, repositories: {}, stop: { kind: "done_check", at: "2026-11-01T23:12:40Z", checkedAt: "2026-11-01T23:12:40Z", checks: [{ name: "Pushed", passed: false, facts: ["4c1a9e0 isn't on origin yet"] }] } } } }));
    eighteen.schemaVersion = 18; delete eighteen.phases["3"]!.stop!.run;
    const nineteen = migrateRecord(eighteen);
    expect(nineteen.schemaVersion).toBe(SCHEMA_VERSION);
    expect(nineteen.phases["3"]!.stop!.run).toMatchObject({ at: "2026-11-01T23:12:40Z", origin: "stop", finished: true });
    // Saved rows without items keep displaying as before.
    expect(nineteen.phases["3"]!.stop!.checks[0]).toEqual({ name: "Pushed", passed: false, facts: ["4c1a9e0 isn't on origin yet"] });
  });

  it("refuses a malformed waiver record rather than reading waivers it cannot trust", () => {
    const record = migrateRecord(schemaOne({}));
    expect(() => migrateRecord({ ...record, waivers: [{ waiverId: "w" }] as never })).toThrow(/waiver/);
  });
});

describe("schema 22: audit loop limits (Kiln Audit Loop Limits AC-LOOP-07)", () => {
  it("gives a record from before the limits the defaults, started or not", () => {
    const notStarted = migrateRecord(schemaOne({}));
    notStarted.schemaVersion = 21; delete notStarted.settings.auditLoops;
    expect(migrateRecord(notStarted).settings.auditLoops).toEqual({ deliveryLimit: 4, testLimit: 4 });
    const started = migrateRecord(schemaOne({ startedAt: "2026-11-01T10:00:00Z", setupCompletedAt: "2026-11-01T10:00:00Z" }));
    started.schemaVersion = 21; delete started.settings.auditLoops; delete started.auditLoops;
    const migrated = migrateRecord(started);
    expect(migrated.settings.auditLoops).toEqual({ deliveryLimit: 4, testLimit: 4 });
    expect(migrated.auditLoops).toEqual({ epochs: [{ kind: "delivery", at: "2026-11-01T10:00:00Z", cause: "start", loopsBefore: 0 }, { kind: "test", at: "2026-11-01T10:00:00Z", cause: "start", loopsBefore: 0 }], loops: [] });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("refuses malformed loop settings rather than clamping them", () => {
    const record = migrateRecord(schemaOne({}));
    record.settings.auditLoops = { deliveryLimit: 0, testLimit: 3 };
    expect(() => migrateRecord(record)).toThrow("Malformed audit loop settings.");
  });
});

describe("schema 24: a loop is one run of an audit (Kiln Deliver When Audit Loops Run Out, \"Upgrade\")", () => {
  const at = "2026-11-10T10:00:00.000Z";
  const activity = (id: string, sequence: number, kind: "delivery_audit" | "test_audit", continuationIndex: number, sessionIds: string[]) => ({ activityId: id, sequence, kind, round: 1, continuationIndex, createdAt: `2026-11-10T1${sequence}:00:00.000Z`, sessionIds, reportPath: `r-${id}.json`, snapshots: [], attempts: [] });
  /** A record Kiln 1.3.0 saved: its third setting, acceptances, an `allowed` epoch and loops counted as the work on findings. */
  function released(extra: Record<string, unknown> = {}): PrdRecord {
    const record = migrateRecord(schemaOne({ startedAt: at, setupCompletedAt: at }));
    record.schemaVersion = 23;
    (record.settings as unknown as Record<string, unknown>).auditLoops = { deliveryLimit: 2, testLimit: 5, afterLastTest: "deliver_unless_serious", afterLastTestSource: { kind: "person", at, where: "documents_found" } };
    (record as unknown as Record<string, unknown>).auditLoops = {
      epochs: [{ kind: "delivery", at, cause: "start", loopsBefore: 0 }, { kind: "test", at, cause: "start", loopsBefore: 0 }, { kind: "delivery", at: "2026-11-10T15:00:00.000Z", cause: "allowed", limit: 2, heldAuditKey: "audit-d2", loopsBefore: 1 }],
      loops: [{ kind: "delivery", number: 1, limitAtStart: 1, last: true, startedAt: at, sourceAuditId: "d1", activityKeys: ["2"] }],
      acceptances: [{ at, via: "browser", heldAuditKey: "audit-t1", sentence: "I accept the remaining Weak rows.", items: [] }],
      itemsListedStops: ["audit-t1"],
    };
    record.completionAudits = { revision: 4, policy: "required", evidence: [], activities: [
      activity("d1", 1, "delivery_audit", 1, ["s1"]),
      // Settled with no session: completed at once under a waived readiness problem, never a loop.
      activity("d2", 2, "delivery_audit", 1, []),
      activity("t1", 3, "test_audit", 1, ["s2"]),
      // A session of test fixes is never a loop.
      activity("t2", 4, "test_audit", 2, ["s3"]),
      // Allocated, not settled and not yet launched: counted, as Kiln counts it at allocation.
      activity("d3", 5, "delivery_audit", 1, []),
    ] } as unknown as NonNullable<PrdRecord["completionAudits"]>;
    record.phases = { "audit-d1": { sessionIds: ["s1"], finishedByPerson: false, repositories: {}, doneAt: at }, "audit-d2": { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: at }, "audit-t1": { sessionIds: ["s2"], finishedByPerson: false, repositories: {}, doneAt: at }, "audit-t2": { sessionIds: ["s3"], finishedByPerson: false, repositories: {}, doneAt: at }, "audit-d3": { sessionIds: [], finishedByPerson: false, repositories: {} } } as PrdRecord["phases"];
    return Object.assign(record, extra);
  }

  it("keeps the limits as recorded, drops the third setting, and rebuilds the loops as audit runs with only start epochs", () => {
    const migrated = migrateRecord(released());
    expect(migrated.schemaVersion).toBe(25);
    expect(migrated.settings.auditLoops).toEqual({ deliveryLimit: 2, testLimit: 5 });
    expect(migrated.auditLoops).toEqual({
      epochs: [{ kind: "delivery", at, cause: "start", loopsBefore: 0 }, { kind: "test", at, cause: "start", loopsBefore: 0 }],
      loops: [
        { kind: "delivery", number: 1, startedAt: "2026-11-10T11:00:00.000Z", activityKey: "audit-d1" },
        { kind: "test", number: 1, startedAt: "2026-11-10T13:00:00.000Z", activityKey: "audit-t1" },
        { kind: "delivery", number: 2, startedAt: "2026-11-10T15:00:00.000Z", activityKey: "audit-d3" },
      ],
    });
  });

  it("holds the limits from the pull request session's activity, or from completion, and not before either", () => {
    expect(migrateRecord(released()).auditLoops!.atPullRequest).toBeUndefined();
    const atPr = released({ activities: [{ activityId: "pr-1", sequence: 6, kind: "final_delivery", key: "pr", createdAt: "2026-11-10T18:00:00.000Z" }] });
    atPr.phases.pr = { sessionIds: ["s9"], finishedByPerson: false, repositories: {} };
    expect(migrateRecord(atPr).auditLoops!.atPullRequest).toEqual({ at: "2026-11-10T18:00:00.000Z", deliveryLimit: 2, testLimit: 5 });
    const complete = released({ completedAt: "2026-11-10T20:00:00.000Z" });
    expect(migrateRecord(complete).auditLoops!.atPullRequest).toEqual({ at: "2026-11-10T20:00:00.000Z", deliveryLimit: 2, testLimit: 5 });
  });

  it("gives a started record with no ledger one by the same count, and a record not started none", () => {
    const none = released(); delete none.auditLoops;
    expect(migrateRecord(none).auditLoops!.loops.map(loop => loop.activityKey)).toEqual(["audit-d1", "audit-t1", "audit-d3"]);
    const fresh = migrateRecord(schemaOne({})); fresh.schemaVersion = 23;
    (fresh.settings as unknown as Record<string, unknown>).auditLoops = { deliveryLimit: 3, testLimit: 3, afterLastTest: "stop_and_ask" };
    const migrated = migrateRecord(fresh);
    expect(migrated.settings.auditLoops).toEqual({ deliveryLimit: 3, testLimit: 3 });
    expect(migrated.auditLoops).toBeUndefined();
  });

  it("marks every audit Kiln 1.3.0 marked complete itemsUnread, accepted first or not, and no other", () => {
    const record = released();
    const [d1, d2, t1] = record.completionAudits!.activities;
    d1!.acceptedResult = "accepted-d1"; d1!.waivedResult = "waived-d1";
    d2!.waivedResult = "waived-d2";
    t1!.acceptedResult = "accepted-t1";
    const audits = migrateRecord(record).completionAudits!.activities;
    expect(audits.map(audit => audit.itemsUnread ?? false)).toEqual([true, true, false, false, false]);
  });

  it("still loads a stored loop_limit stop", () => {
    const stopped = released();
    stopped.phases["audit-d3"]!.stop = { kind: "loop_limit", at, checks: [], checkedAt: at, loop: { kind: "delivery", reason: "phases_added", heldAuditKey: "audit-d3" } };
    expect(migrateRecord(stopped).phases["audit-d3"]!.stop).toMatchObject({ kind: "loop_limit" });
  });
});

describe("schema 23: the build preflight's state (build preflight \"Upgrade\")", () => {
  it("migrates a schema 22 record with no preflight state, so its preflight is not settled, and refuses malformed preflight state", () => {
    const old = migrateRecord(schemaOne({}));
    old.schemaVersion = 22;
    const migrated = migrateRecord(old);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.preflight).toBeUndefined();
    expect(preflightSettled(migrated)).toBe(false);
    expect(() => migrateRecord({ ...migrated, preflight: { activities: [{ activityId: "a", sequence: 1, createdAt: "2026-11-15T10:00:00Z", trigger: "sometime" }] } } as unknown as PrdRecord)).toThrow(/preflight/);
    expect(() => migrateRecord({ ...migrated, preflight: { due: { trigger: "start", at: "now" }, activities: [] } } as unknown as PrdRecord)).toThrow(/preflight/);
  });

  it("refuses a record from a newer schema under the existing rule", () => {
    const newer = migrateRecord(schemaOne({}));
    newer.schemaVersion = 26;
    expect(() => migrateRecord(newer)).toThrow(/newer|Update Kiln/);
  });
});

describe("schema 25: names that work everywhere (find repositories anywhere \"Data Models\")", () => {
  it("reads a schema 24 record as schema 25 with every entry as it was: each was named by folder, so its name is its short name", () => {
    const record = migrateRecord(schemaOne({ startedAt: "2026-11-20T10:00:00.000Z", setupCompletedAt: "2026-11-20T10:00:00.000Z" }));
    record.schemaVersion = 24;
    record.repositories.push({ name: "storefront", kind: "named", mainCheckoutPath: "/home/a/acme/storefront", github: "acme/storefront", baseBranch: "develop", worktreePath: "~/acme/.worktrees/x/storefront", setupCompletedAt: "2026-11-20T10:00:00.000Z" });
    const before = structuredClone(record.repositories);
    const migrated = migrateRecord(record);
    expect(migrated.schemaVersion).toBe(25);
    expect(migrated.repositories).toEqual(before);
    expect(migrated.repositories.some((entry) => entry.shortName !== undefined)).toBe(false);
  });
});
