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
import { runPrdOn } from "../test-support/model-choices.js";
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
  // v1 kept one model and effort for the whole PRD, at the top of its settings; under this Kiln
  // that is the choice the migration keeps (Kiln Phase Model Tiers AC-KEEP-02).
  const kept = record.settings.modelChoices.kept;
  if (!kept) throw new Error("A v1 record needs the PRD's one choice: run the harness on V1_CHOICE first.");
  Object.assign(copy.settings, { model: kept.model, effort: kept.effort });
  delete copy.settings.modelChoices;
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

/** The one Claude Code choice a v1 PRD ran on, kept by the migration. */
const V1_CHOICE = { agentId: "claude_code", model: "opus", effort: "medium" } as const;

/** Writes the record back as schema 1 and opens it as the next `kiln run` would. */
function reopenAsSchemaOne(h: Harness) {
  writeFileSync(prdRecordPath(h.stateDirectory), JSON.stringify(asSchemaOne(h.engine.record)));
  return h.reopenFromDisk();
}

describe("a schema 1 record read by this Kiln", () => {
  it("renders a PRD stopped at Needs you as it does under schema 2", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Partway." }, { exit: 0 }] }] });
    await runPrdOn(harness.engine, V1_CHOICE);
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    // Launch readiness is auth-only, while the phase's independent usage read can
    // finish afterward. Establish the stale-usage precondition through real reads,
    // rather than relying on which startup/dispatch read happens to finish last.
    await harness.engine.refreshBilling();
    await harness.engine.refreshAgents();
    const usageAt = harness.engine.readers.claude_code.state.account!.limitsObservedAt;
    expect(usageAt).toEqual(expect.any(String));
    await harness.engine.readers.claude_code.refreshClaudeForLaunch(harness.engine.worktreePath, harness.env, AbortSignal.timeout(10_000));
    const before = buildSnapshot(harness.engine);
    expect(before.agents.find(entry => entry.inUse)!.account?.limitsObservedAt).toBe(usageAt);
    expect(before.needsYou).toBeDefined();
    const engine = reopenAsSchemaOne(harness);
    // Settle auth-only startup before the independent fresh usage read. Phase 6
    // deliberately gives those observations separate dates and freshness states.
    // Startup's own account read is joined first, since a refresh during it joins it
    // rather than reading again; its launch read may finish after it and mark the
    // retained usage stale. Only the read started after both is fresh.
    await engine.refreshAgents();
    await engine.refreshBilling();
    await engine.refreshAgents();
    // The next kiln run checks the stop again, reading its commits from Git, as v1 does.
    expect(await engine.decide()).toEqual({ kind: "needs_you", phaseKey: "1", again: true });
    await engine.settled();
    const after = buildSnapshot(engine);
    expect(before.agents.find(entry => entry.inUse)!.account?.limitsStale).toBe(true);
    expect(after.agents.find(entry => entry.inUse)!.account?.limitsStale).toBeUndefined();
    // AC-SEE-03: usage completes before its final corroborating authentication read.
    expect(Date.parse(after.agents.find(entry => entry.inUse)!.account!.limitsObservedAt!)).toBeLessThan(Date.parse(after.agents.find(entry => entry.inUse)!.account!.updatedAt));
    expect(Date.parse(after.agents.find(entry => entry.inUse)!.account!.limitsObservedAt!)).toBeGreaterThan(Date.parse(before.agents.find(entry => entry.inUse)!.account!.limitsObservedAt!));
    const priorAccount = { ...before.agents.find(entry => entry.inUse)!.account }; delete priorAccount.limitsStale;
    expect(after.agents.find(entry => entry.inUse)!.account).toEqual({ ...priorAccount, ...(before.agents.find(entry => entry.inUse)!.account?.extraUsage ? { extraUsage: { ...before.agents.find(entry => entry.inUse)!.account!.extraUsage, observedAt: expect.any(String) } } : {}), startedAt: expect.any(String), updatedAt: expect.any(String), limitsObservedAt: expect.any(String) });
    // A stopped run keeps accruing waiting time during the restart; all other timing facts survive migration.
    const advanceWaiting = (earlier: Timing, later: Timing): Timing => ({ ...earlier, asOf: later.asOf, waitingMs: earlier.waitingMs + Date.parse(later.asOf) - Date.parse(earlier.asOf) });
    expect(after).toEqual({
      ...before,
      // Each agent's account and billing are read afresh after the restart.
      agents: after.agents,
      // Schema 1–4 deliberately receive revision-0 restricted authority. The new grant
      // control must use that revision without changing the historical execution view.
      developmentDelivery: after.developmentDelivery,
      feature: { ...before.feature, timing: advanceWaiting(before.feature.timing!, after.feature.timing!) },
      activities: before.activities!.map((activity, index) => activity.timing ? { ...activity, timing: advanceWaiting(activity.timing, after.activities![index]!.timing!) } : activity),
      phases: before.phases.map((phase, index) => phase.timing ? { ...phase, timing: advanceWaiting(phase.timing, after.phases[index]!.timing!) } : phase),
      // The next kiln run's check of the stop is a recheck, so Mark complete is now offered on it (waivers "Check Runs"),
      // and its rows are the completion checks (checks at a stop AC-STOPCHECK-03).
      needsYou: { ...before.needsYou, checkedAt: after.needsYou!.checkedAt, checkRun: after.needsYou!.checkRun, markComplete: after.needsYou!.markComplete, rowsAreCompletionChecks: true },
    });
    expect(before.needsYou!.rowsAreCompletionChecks).toBeUndefined();
    expect(after.needsYou!.markComplete).toMatchObject({ offered: true });
    expect(before.needsYou!.markComplete).toMatchObject({ offered: false });
    expect(after.developmentDelivery?.authorization).toEqual({ revision: 0, enabled: false, grants: [] });
    expect(after.developmentDelivery?.executionId).toBe(before.developmentDelivery?.executionId);
    expect(after.feature.multiRepository).toBe(false);
  });

  it("renders a complete PRD as it does under schema 2, its pull request and each phase's pushed commit included", async () => {
    harness = await createHarness({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), pullRequestSession(218)] });
    await runPrdOn(harness.engine, V1_CHOICE);
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    const before = buildSnapshot(harness.engine);
    expect(before.feature.state).toBe("complete");
    const engine = reopenAsSchemaOne(harness);
    await engine.refreshAgents();
    expect(buildSnapshot(engine)).toEqual({ ...before, agents: buildSnapshot(engine).agents, auditHistoryUnavailable: true });
    expect(buildSnapshot(engine).pullRequests).toEqual([expect.objectContaining({ repository: "acme-shop", number: 218 })]);
    // Written as schema 3, through schema 2, at its next write (usage-limit recovery, Data Models).
    expect(await engine.changeSettings({ keepAwake: !engine.record.settings.keepAwake })).toMatchObject({ ok: true });
    expect(readPrdRecord(harness.stateDirectory)!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("finishes a v1 setup cut short from its recorded commit", async () => {
    harness = await createHarness({ sessions: [] });
    await runPrdOn(harness.engine, V1_CHOICE);
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
