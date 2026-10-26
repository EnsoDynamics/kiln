// A schema 1 record, as Kiln v1 left it on disk, read by this Kiln (multi-repo technical design,
// "Data Models"): every v1 state renders exactly as the same PRD does under schema 2, and a v1
// setup cut short is finished by the next `kiln run` from its recorded commit, with no Git call
// in the migration itself.

import { mkdirSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { Timing } from "../session/timing.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { prdRecordPath, readPrdRecord, SCHEMA_VERSION, type PrdRecord } from "./records.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

/** The same record as Kiln v1 wrote it: schema 1, one repository's facts at the top and on each phase. */
// A schema 1 record is loosely shaped by definition: this builds one from a schema 2 record.
/* eslint-disable @typescript-eslint/no-explicit-any */
function asSchemaOne(record: PrdRecord): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(record)) as Record<string, any>;
  const entry = copy.repositories[0];
  copy.schemaVersion = 1;
  Object.assign(copy.settings, copy.settings.agentChoices.claude_code);
  delete copy.settings.agentChoices; delete copy.settings.agentId;
  if (entry?.baseCommit) copy.baseCommit = entry.baseCommit;
  if (entry?.createdBranch) copy.createdBranch = entry.createdBranch;
  delete copy.repositories;
  delete copy.settings.workspaceFolder;
  delete copy.settings.bases;
  for (const facts of Object.values(copy.phases) as Record<string, any>[]) {
    Object.assign(facts, facts.repositories["acme-shop"] ?? {});
    delete facts.repositories;
    for (const check of facts.stop?.checks ?? []) {
      check.fact = check.facts[0];
      delete check.facts;
    }
  }
  if (copy.pullRequests) {
    const pullRequest = { ...copy.pullRequests[0] };
    delete pullRequest.repository;
    copy.pullRequest = pullRequest;
    delete copy.pullRequests;
  }
  for (const phase of copy.plan ?? []) delete phase.repositories;
  return copy;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Writes the record back as schema 1 and opens it as the next `kiln run` would. */
function reopenAsSchemaOne(h: Harness) {
  writeFileSync(prdRecordPath(h.stateDirectory), JSON.stringify(asSchemaOne(h.engine.record)));
  return h.reopenFromDisk();
}

describe("a schema 1 record read by this Kiln", () => {
  it("renders a PRD stopped at Needs you as it does under schema 2", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Partway." }, { exit: 0 }] }] });
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    const before = buildSnapshot(harness.engine);
    expect(before.needsYou).toBeDefined();
    const engine = reopenAsSchemaOne(harness);
    await engine.agents.refresh();
    // The next kiln run checks the stop again, reading its commits from Git, as v1 does.
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    await engine.settled();
    const after = buildSnapshot(engine);
    expect(after.account).toEqual({ ...before.account, ...(before.account?.extraUsage ? { extraUsage: { ...before.account.extraUsage, observedAt: expect.any(String) } } : {}), startedAt: expect.any(String), updatedAt: expect.any(String) });
    // A stopped run keeps accruing waiting time during the restart; all other timing facts survive migration.
    const advanceWaiting = (earlier: Timing, later: Timing): Timing => ({ ...earlier, asOf: later.asOf, waitingMs: earlier.waitingMs + Date.parse(later.asOf) - Date.parse(earlier.asOf) });
    expect(after).toEqual({
      ...before,
      billing: after.billing,
      // Schema 1–4 deliberately receive revision-0 restricted authority. The new grant
      // control must use that revision without changing the historical execution view.
      developmentDelivery: after.developmentDelivery,
      feature: { ...before.feature, timing: advanceWaiting(before.feature.timing!, after.feature.timing!) },
      activities: before.activities!.map((activity, index) => activity.timing ? { ...activity, timing: advanceWaiting(activity.timing, after.activities![index]!.timing!) } : activity),
      phases: before.phases.map((phase, index) => phase.timing ? { ...phase, timing: advanceWaiting(phase.timing, after.phases[index]!.timing!) } : phase),
      account: after.account,
      needsYou: { ...before.needsYou, checkedAt: after.needsYou!.checkedAt },
    });
    expect(after.developmentDelivery?.authorization).toEqual({ revision: 0, enabled: false, grants: [] });
    expect(after.developmentDelivery?.executionId).toBe(before.developmentDelivery?.executionId);
    expect(after.feature.multiRepository).toBe(false);
  });

  it("renders a complete PRD as it does under schema 2, its pull request and each phase's pushed commit included", async () => {
    harness = await createHarness({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), pullRequestSession(218)] });
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    const before = buildSnapshot(harness.engine);
    expect(before.feature.state).toBe("complete");
    const engine = reopenAsSchemaOne(harness);
    await engine.agents.refresh();
    expect(buildSnapshot(engine)).toEqual({ ...before, billing: buildSnapshot(engine).billing, auditHistoryUnavailable: true, account: buildSnapshot(engine).account });
    expect(buildSnapshot(engine).pullRequests).toEqual([expect.objectContaining({ repository: "acme-shop", number: 218 })]);
    // Written as schema 3, through schema 2, at its next write (usage-limit recovery, Data Models).
    await engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, effort: "max" });
    expect(readPrdRecord(harness.stateDirectory)!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("finishes a v1 setup cut short from its recorded commit", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const base = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    const record = asSchemaOne(h.engine.record);
    Object.assign(record, { startedAt: "2026-10-17T13:00:00Z", refinementConfirmedAt: "2026-10-17T13:00:00Z", baseCommit: base });
    mkdirSync(h.stateDirectory, { recursive: true });
    writeFileSync(prdRecordPath(h.stateDirectory), JSON.stringify(record));
    const engine = h.reopenFromDisk();
    expect(engine.record.repositories).toEqual([expect.objectContaining({ name: "acme-shop", kind: "prd", baseCommit: base })]);
    expect(await engine.prepare()).toEqual({ ok: true });
    expect(engine.record.setupCompletedAt).toBeDefined();
    expect(git(h.sandbox, engine.worktreePath, "rev-parse", "HEAD").trim()).toBe(base);
  });
});
