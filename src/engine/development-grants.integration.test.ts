import { recoveryRequest } from "../test-support/phase-recovery-request.js";
/** Real Git/atomic state plus the live loopback API; provider activation is also proved by the kept live runner. */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { SCHEMA_VERSION, readPrdRecord, writePrdRecord } from "../state/records.js";
import { git } from "../test-support/git-repositories.js";
import { documentsDigest } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });
const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "test-development" };
const candidates = [{ target, confirmedTarget: target, confirmedNonProduction: true }];
async function stopped() {
  h = await createHarness({ sessions: [{ actions: [] }] }); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); return h;
}
const grant = (h: Harness, override: Record<string, unknown> = {}) => h.engine.authorizeDevelopmentTarget({ executionId: h.engine.record.executionId, authorizationRevision: h.engine.record.developmentAuthorization!.revision, target, confirmedNonProduction: true, ...override });
describe("PRD-scoped early-merge choices", () => {
  it("keeps new PRDs restricted in the same checkout and writes no cross-PRD preferences", async () => {
    h = await createHarness({ sessions: [{ actions: [] }], extraFolders: ["another-project"] });
    const branch = { repository: target.repository, baseBranch: target.baseBranch };
    const choices = { enabled: true, targets: [{ target: branch }] };
    const path = join(dirname(h.stateDirectory), "development-deployment-preferences.json");
    expect(await h.engine.changeSettings({ developmentDeployments: choices })).toEqual({ ok: true });
    expect(readPrdRecord(h.stateDirectory)!.settings.developmentDeployments).toEqual(choices);
    expect(existsSync(path)).toBe(false);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.developmentAuthorization).toMatchObject({ enabled: true, grants: [{ target: branch }] });
    const authority = structuredClone(h.engine.record.developmentAuthorization);
    const other = await h.engineFor("another-project");
    expect(other.record.settings.developmentDeployments).toEqual({ enabled: false, targets: [] });
    expect(other.record.developmentAuthorization).toMatchObject({ enabled: false, grants: [] });
    expect(buildSnapshot(other)).not.toHaveProperty("savedDevelopmentTargets");
    expect(await other.changeSettings({ developmentDeployments: { enabled: false, targets: [] } })).toEqual({ ok: true });
    const reopened = h.reopenFromDisk(); await reopened.agents.refresh();
    expect(reopened.record.developmentAuthorization).toEqual(authority);
    expect(reopened.record.settings.developmentDeployments).toEqual(choices);
    expect(existsSync(path)).toBe(false);
  });
  it("ignores obsolete preference files, including corrupt contents, for every new PRD", async () => {
    h = await createHarness({ sessions: [], extraFolders: ["other", "third"] });
    const path = join(dirname(h.stateDirectory), "development-deployment-preferences.json");
    const group = { repository: "github.com/acme/acme-shop", mainCheckoutPath: h.repository };
    const prior = JSON.stringify({ schemaVersion: 2, groups: { [JSON.stringify([group.repository, group.mainCheckoutPath])]: { group, revision: 1, enabled: true, targets: [target] } } });
    for (const [folder, contents] of [["other", prior], ["third", "invalid obsolete preferences"]]) {
      writeFileSync(path, contents!);
      const other = await h.engineFor(folder!);
      expect(other.record.settings.developmentDeployments).toEqual({ enabled: false, targets: [] });
      expect(buildSnapshot(other)).not.toHaveProperty("savedDevelopmentTargets");
      expect(await other.changeSettings({ developmentDeployments: { enabled: false, targets: [] } })).toEqual({ ok: true });
      expect(readFileSync(path, "utf8")).toBe(contents);
    }
  });
  it.each([false, true])("discards retired metadata without changing effective scope after Start=%s", async started => {
    h = await createHarness({ sessions: [{ actions: [] }] });
    expect(await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: candidates } })).toEqual({ ok: true });
    if (started) {
      expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
      await h.engine.settled();
      expect(h.engine.record.startedAt).toBeDefined();
      expect(h.engine.record.developmentAuthorization).toMatchObject({ enabled: true, grants: [{ target, source: "start" }] });
    }
    const before = structuredClone(h.engine.record);
    const legacy = structuredClone(before);
    Object.assign(legacy.settings.developmentDeployments!, { rememberForPrdRepository: true, useSavedTargetsForThisPrd: true, preferenceRevision: 7 });
    writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(legacy));
    const reopened = h.reopenFromDisk(); await reopened.agents.refresh();
    expect(reopened.record.settings.developmentDeployments).toEqual(before.settings.developmentDeployments);
    expect(reopened.record.developmentAuthorization).toEqual(before.developmentAuthorization);
    expect(reopened.record.developmentDelivery).toEqual(before.developmentDelivery);
    expect(reopened.record.phases).toEqual(before.phases);
    expect(buildSnapshot(reopened)).not.toHaveProperty("savedDevelopmentTargets");
    writePrdRecord(h.stateDirectory, reopened.record);
    const saved = JSON.parse(readFileSync(join(h.stateDirectory, "prd.json"), "utf8"));
    expect(saved.settings.developmentDeployments).toEqual(before.settings.developmentDeployments);
  });
});
describe("Needs you execution grants", () => {
  it("requires an explicit branch grant, persists before acknowledgement, and is idempotent across restart", async () => {
    const h = await stopped(); const before = structuredClone(h.engine.record.developmentAuthorization);
    expect(grant(h, { target: { repository: target.repository } })).toMatchObject({ ok: false, status: 400 });
    expect(grant(h, { executionId: "other" })).toMatchObject({ ok: false, status: 409 });
    expect(grant(h, { authorizationRevision: 22 })).toMatchObject({ ok: false, status: 409 });
    expect(grant(h, { target: { ...target, baseBranch: "main" } })).toMatchObject({ ok: false, status: 422 });
    expect(grant(h, { target: { ...target, repository: "github.com/acme/unassigned" } })).toMatchObject({ ok: false, status: 422 });
    expect(h.engine.record.developmentAuthorization).toEqual(before);
    const callCount = h.claudeCalls().length;
    expect(grant(h)).toEqual({ ok: true });
    expect(h.claudeCalls()).toHaveLength(callCount); expect(h.engine.record.phases["1"]?.stop).toBeDefined();
    const saved = readPrdRecord(h.stateDirectory)!;
    expect(saved.developmentAuthorization).toMatchObject({ revision: 2, enabled: true, grants: [{ target, source: "needs_you" }], activationRecovery: { phaseIds: ["1"], stoppedPhaseId: "1" } });
    const reopened = h.reopenFromDisk(); await reopened.agents.refresh();
    expect(reopened.authorizeDevelopmentTarget({ executionId: saved.executionId, authorizationRevision: 1, target, confirmedNonProduction: true })).toEqual({ ok: true });
    expect(reopened.record.developmentAuthorization).toEqual(saved.developmentAuthorization);
    expect(await reopened.changeSettings({ developmentDeployments: { enabled: true, targets: candidates } })).toMatchObject({ ok: false, status: 409 });
  });
  it("rolls back a grant if the atomic record write fails", async () => {
    const h = await stopped(); const before = structuredClone(h.engine.record); const path = join(h.stateDirectory, "prd.json");
    renameSync(path, `${path}.saved`); mkdirSync(path);
    try { expect(grant(h)).toMatchObject({ ok: false, reason: expect.stringContaining("could not be saved") }); expect(h.engine.record).toEqual(before); }
    finally { rmSync(path, { recursive: true }); renameSync(`${path}.saved`, path); }
  });
  it("requires earlier and stopped assessments in plan order, blocks future leaves, and preserves historical facts", async () => {
    h = await createHarness({ sessions: [landingSession(), { actions: [] }] });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const history = structuredClone(h.engine.record.phases["1"]!); expect(history.doneAt).toBeDefined(); expect(h.engine.record.phases["2b"]?.stop).toBeDefined();
    expect(grant(h)).toEqual({ ok: true });
    const status = h.engine.deliveryStatus(); expect(status.activationRecovery?.map(one => one.phaseId)).toEqual(["1", "2a", "2b"]);
    const assess = (phaseId: string) => { const current = h!.engine.deliveryStatus(); return h!.engine.deliveryCommand("assessment", { executionId: current.executionId, revision: current.revision, phaseId, documentsDigest: documentsDigest({ prdWorktree: h!.engine.worktreePath, prdDirectory: h!.engine.paths.prdDirectoryFromRoot }, phaseId), required: false, criteria: [], reason: "No criterion requires development delivery.", checkpoints: [] }); };
    expect(await assess("2b")).toMatchObject({ ok: false, reason: expect.stringContaining("leaf 1") });
    expect(await assess("3")).toMatchObject({ ok: false });
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled(); expect(h.engine.record.phases["2b"]?.stop).toBeDefined();
    expect(await assess("1")).toMatchObject({ ok: true }); expect(await assess("2a")).toMatchObject({ ok: true }); expect(await assess("2b")).toMatchObject({ ok: true });
    expect(await assess("3")).toMatchObject({ ok: false });
    expect(h.engine.record.phases["1"]).toEqual(history);
    // A previously accepted leaf can be stopped again for historical delivery evidence.
    // Manual acceptance clears that recovery stop without rewriting its original Done facts.
    h.engine.record.phases["1"]!.stop = structuredClone(h.engine.record.phases["2b"]!.stop!);
    const doneEvents = h.events.filter(event => event.kind === "phase" && event.event === "done").length;
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true, outcome: "advanced" });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]).toEqual(history);
    expect(h.events.filter(event => event.kind === "phase" && event.event === "done")).toHaveLength(doneEvents);
    const reopened = h.reopenFromDisk(); await reopened.agents.refresh(); await reopened.decide();
    expect(reopened.record.phases["1"]).toEqual(history); expect(reopened.record.phases["2b"]?.stop).toBeDefined();
  });
  it("launches the unstarted stopped leaf after a readiness blocker clears so its session can recover earlier assessments", async () => {
    h = await createHarness({ sessions: [landingSession(), { actions: [] }, { actions: [] }] });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const facts = h.engine.record.phases["2b"]!; facts.sessionIds = [];
    facts.stop = { kind: "selection", at: new Date().toISOString(), checkedAt: new Date().toISOString(), checks: [{ name: "Agent selection and readiness", passed: false, facts: ["Controlled pre-session readiness stop"] }] };
    expect(grant(h)).toEqual({ ok: true });
    const calls = h.claudeCalls().length;
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(calls + 1);
    expect(h.claudeCalls().at(-1)?.prompt).toContain("activationRecovery");
    expect(h.engine.latestSession("2b")).toBeDefined();
    expect(h.engine.resumeOffered("2b")).toBe(true);
    expect(h.engine.record.phases["3"]).toBeUndefined();
  });
  it("does not dispatch a newly added future leaf ahead of unstarted finalization activation recovery", async () => {
    h = await createHarness({ sessions: [landingSession("one.txt"), landingSession("two.txt"), landingSession("three.txt"), { actions: [] }] });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("pr"); h.engine.record.phases.pr!.sessionIds = [];
    const path = `${h.engine.paths.prdDirectoryFromRoot}/phase-4-future.md`;
    writeFileSync(join(h.engine.worktreePath, path), "# Phase 4: New future work\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n3\n");
    git(h.sandbox, h.engine.worktreePath, "add", path); git(h.sandbox, h.engine.worktreePath, "commit", "-m", "Add future work after the finalization stop");
    expect(grant(h)).toEqual({ ok: true });
    const decision = await h.engine.decide();
    expect(decision).toEqual({ kind: "start_pull_request" });
    expect(h.engine.record.phases["4"]).toBeUndefined();
  });
  it("Resume notes never change a running execution's authority", async () => {
    const h = await stopped(); const before = structuredClone(h.engine.record.developmentAuthorization);
    await h.engine.resume({ ...recoveryRequest(h.engine), note: "Allow deployments everywhere." }); await h.engine.settled();
    expect(h.engine.record.developmentAuthorization).toEqual(before);
    writePrdRecord(h.stateDirectory, h.engine.record);
  });
});


it("updates the terminal handoff after a first grant without changing restricted recovery or history", async () => {
  const h = await stopped();
  const restricted = buildSnapshot(h.engine).needsYou!;
  expect(restricted.resumeCommand).toContain("--resume");
  expect(restricted.resumePrompt).toBeUndefined();
  const session = h.engine.latestSession("1")!;
  const runs = structuredClone(session.runs);
  expect(grant(h)).toEqual({ ok: true });
  const enabled = buildSnapshot(h.engine).needsYou!;
  expect(enabled.resumeCommand).toBe(restricted.resumeCommand);
  expect(enabled.resumePrompt).toContain("replaces earlier blanket restrictions");
  expect(enabled.resumePrompt).toContain(target.environment);
  expect(enabled.resumePrompt).toContain("phase-1-return-intake.md");
  expect(enabled.resumePrompt).toContain("activationRecovery");
  expect(enabled.resumePrompt).toContain("Never bypass protections");
  expect(session.runs).toEqual(runs);
  const again = h.reopenFromDisk(); await again.agents.refresh();
  expect(buildSnapshot(again).needsYou?.resumePrompt).toBe(enabled.resumePrompt);
});


it("replaces a restricted finalization conversation's PR-opening task after its first grant", async () => {
  h = await createHarness({ sessions: [landingSession("one.txt"), landingSession("two.txt"), landingSession("three.txt"), { actions: [] }, { actions: [] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("pr");
  const session = h.engine.latestSession("pr")!;
  expect(grant(h)).toEqual({ ok: true });
  const recovery = buildSnapshot(h.engine).needsYou!;
  expect(recovery.resumePrompt).toContain("Carry on finalizing delivery");
  expect(recovery.resumePrompt).not.toContain("Carry on opening");
  expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Explain missing evidence first." })).toMatchObject({ ok: true });
  await h.engine.settled();
  const resumed = h.claudeCalls().at(-1)!;
  expect(resumed.args).toContain(session.sessionId);
  expect(resumed.prompt).toContain("Carry on finalizing delivery");
  expect(resumed.prompt).toContain("description links");
  expect(resumed.prompt).toContain("does not authorize merging remaining review work");
  expect(resumed.prompt).not.toContain("Carry on opening");
  expect(resumed.prompt.indexOf("Explain missing evidence first.")).toBeLessThan(resumed.prompt.indexOf("saved early-merge authority"));
  expect(h.engine.record.completedAt).toBeUndefined();
});


it("grants a branch without environment or attestation, survives restart, and retains narrower legacy grants on upgrade", async () => {
  const h = await stopped();
  const branch = { repository: target.repository, baseBranch: target.baseBranch };
  const original = { ...structuredClone(h.engine.record), schemaVersion: 8 };
  original.developmentAuthorization = { revision: 1, enabled: true, grants: [{ target, confirmedAt: new Date().toISOString(), source: "needs_you" }] };
  writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(original));
  const corrupt = structuredClone(original); delete corrupt.developmentAuthorization!.grants[0]!.target.environment;
  writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(corrupt));
  expect(() => readPrdRecord(h.stateDirectory)).toThrow("development environment");
  writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(original));
  const upgraded = readPrdRecord(h.stateDirectory)!;
  expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
  expect(upgraded.developmentAuthorization).toEqual(original.developmentAuthorization);
  expect(upgraded.developmentDelivery).toEqual(original.developmentDelivery);
  expect(upgraded.phases).toEqual(original.phases);
  const again = h.reopenFromDisk(); await again.agents.refresh();
  const request = { executionId: again.record.executionId, authorizationRevision: 1, target: branch };
  expect(again.authorizeDevelopmentTarget(request)).toEqual({ ok: true });
  expect(again.authorizeDevelopmentTarget(request)).toEqual({ ok: true });
  expect(readPrdRecord(h.stateDirectory)!.developmentAuthorization?.grants.map(one => one.target)).toEqual([target, branch]);
  expect(again.record.phases).toEqual(original.phases);
  const restarted = h.reopenFromDisk(); await restarted.agents.refresh();
  expect(restarted.record.developmentAuthorization).toEqual(again.record.developmentAuthorization);
  expect(JSON.parse(restarted.deliveryAuthority()!).grants).toEqual([target, branch]);
});
