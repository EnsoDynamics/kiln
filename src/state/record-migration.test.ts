// A schema 1 record, as Kiln v1 writes it, read as schema 2 with no Git call (multi-repo
// technical design, "Data Models"): the PRD's repository becomes the one entry, each phase's
// commits sit under it, the pull request becomes a one-entry list and each fact a list.

import { describe, expect, it } from "vitest";
import { migrateRecord, SCHEMA_VERSION, type PrdRecord } from "./records.js";

function schemaOne(extra: Record<string, unknown>): PrdRecord {
  return {
    schemaVersion: 1,
    repository: { mainCheckoutPath: "/home/a/acme/acme-shop", name: "acme-shop", github: "acme/acme-shop" },
    prdDirectory: "docs/prds/customer-returns",
    featureName: "Customer returns",
    token: "t",
    settings: { worktreePath: "/home/a/acme/.worktrees/customer-returns/acme-shop", featureBranch: "feature/customer-returns", baseBranch: "develop", model: "opus", effort: "high", keepAwake: true },
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
    expect(record.settings).toMatchObject({ workspaceFolder: "/home/a/acme/.worktrees/customer-returns", bases: {}, worktreePath: "/home/a/acme/.worktrees/customer-returns/acme-shop", baseBranch: "develop" });
  });

  it("a worktree the person put elsewhere: the workspace folder is still the default, beside the PRD's repository (AC-SPACE-03)", () => {
    const record = schemaOne({});
    record.settings.worktreePath = "/home/a/elsewhere/acme-shop";
    expect(migrateRecord(record).settings).toMatchObject({ workspaceFolder: "/home/a/acme/.worktrees/customer-returns", worktreePath: "/home/a/elsewhere/acme-shop" });
  });

  it("holding only Kiln's branch from a failed Start: one entry keeps it", () => {
    const createdBranch = { name: "feature/customer-returns", commit: "c1", baseBranch: "main" };
    const record = migrateRecord(schemaOne({ createdBranch }));
    expect(record.repositories).toEqual([
      { name: "acme-shop", kind: "prd", mainCheckoutPath: "/home/a/acme/acme-shop", github: "acme/acme-shop", baseBranch: "main", worktreePath: "/home/a/acme/.worktrees/customer-returns/acme-shop", createdBranch },
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
      expect.objectContaining({ name: "acme-shop", kind: "prd", baseCommit: "b0", setupCompletedAt: "2026-10-17T13:00:05Z", worktreePath: "/home/a/acme/.worktrees/customer-returns/acme-shop" }),
    ]);
    expect(record.setupCompletedAt).toBe("2026-10-17T13:00:05Z");
    expect(record.phases["1"]).toEqual({ sessionIds: ["s1"], doneAt: "2026-10-17T14:00:00Z", finishedByPerson: false, repositories: { "acme-shop": { startCommit: "b0", pushedSha: "p1", commitCount: 2 } }, outsideConfirmations: [] });
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

  it("reads a schema 2 record as schema 7, retaining choices under Claude Code and usage recovery (usage-limit recovery AC-AUTO-04, Data Models)", () => {
    const record = { ...schemaOne({}), schemaVersion: 2, repositories: [] } as PrdRecord;
    const before = JSON.parse(JSON.stringify(record)) as PrdRecord;
    expect(migrateRecord(record)).toBe(record);
    expect(record).toMatchObject({ ...before, schemaVersion: SCHEMA_VERSION, settings: { ...record.settings, agentId: "claude_code", agentChoices: { claude_code: { model: "opus", effort: "high" } }, resumeAfterUsageLimit: true } });
    expect(record.settings).not.toHaveProperty("model");
    expect(record.settings).not.toHaveProperty("effort");
    expect(SCHEMA_VERSION).toBe(7);
  });

  it("reads a v1 record as schema 3 with Resume after a usage limit on, and keeps a schema 3 record's own choice (AC-AUTO-04)", () => {
    expect(migrateRecord(schemaOne({})).settings.resumeAfterUsageLimit).toBe(true);
    const three = migrateRecord(schemaOne({}));
    three.settings.resumeAfterUsageLimit = false;
    expect(migrateRecord(three).settings.resumeAfterUsageLimit).toBe(false);
  });
});

describe("a record without Stayed in the workspace's confirmations (multi-repo AC-OUTSIDE-03)", () => {
  it("gets none for each phase, from schema 1 and from a schema 2 record written before the check existed", () => {
    const phase = { sessionIds: ["s1"], finishedByPerson: false, stop: { kind: "done_check", at: "t", checkedAt: "t", checks: [] } };
    expect(migrateRecord(schemaOne({ phases: { "1": { ...phase } } })).phases["1"]!.outsideConfirmations).toEqual([]);
    const two = migrateRecord(schemaOne({ phases: { "1": { ...phase } } }));
    delete (two.phases["1"] as Partial<typeof two.phases["1"]>).outsideConfirmations;
    expect(migrateRecord(two).phases["1"]!.outsideConfirmations).toEqual([]);
    // One already recorded stays.
    two.phases["1"]!.outsideConfirmations = [{ at: "2026-10-17T17:30:00Z" }];
    expect(migrateRecord(two).phases["1"]!.outsideConfirmations).toEqual([{ at: "2026-10-17T17:30:00Z" }]);
  });
});
