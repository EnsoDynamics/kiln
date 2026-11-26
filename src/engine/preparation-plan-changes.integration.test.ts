// Preparation execution: plan changes around a preparation (appended and split phases, split
// prerequisites across repositories, revised-scope audits). The shared fixture is
// src/test-support/preparation-execution-fixture.ts.
import { afterEach, expect, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writePrdRecord } from "../state/records.js";
import { COMET_DIRECTORY, cometPhase } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor } from "../test-support/engine-harness.js";
import { CODEX_CHOICE } from "../test-support/model-choices.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { cleanUpPreparation, codexDefaults, fixture, h, nativeIt } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

nativeIt("runs preparation through revised-scope audits, audit-added implementation and new delivery", async () => {
  const f = await fixture();
  const audit = (behavior = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
  const { pullRequestSession } = await import("../test-support/engine-harness.js");
  const { startFixtureController } = await import("../test-support/controller-server.js");
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.mjs"), "export const value = () => 42;\n");
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.test.mjs"), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", COMET_DIRECTORY, ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test: supply audit proof"); f.publish();
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Preparation only" }, { waitForFile: f.release }, { result: "Prepared" }, { exit: 0 }] }, ...Array.from({ length: 7 }, (_, i) => landingSession(`capability-${i+9}.txt`)), landingSession("audit-repair.txt"), { actions: [{ openPullRequest: { number: 43, repository: "comet-library" } }, ...pullRequestSession(43).actions.slice(1)] }], auditSessions: [audit({ gap: true }), audit(), audit()] }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  try {
    const old = h.engine.record.executionId!; await f.accept(); await f.submit();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeDefined();
    expect(h.engine.record.phases["16"]?.doneAt).toBeDefined();
    expect(h.engine.record.completionAudits!.activities.map(row => row.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit"]);
    expect(h.engine.record.completionAudits!.activities.every(row => row.acceptedResult)).toBe(true);
    expect(h.engine.record.pullRequests?.map(row => row.number)).toEqual([43]);
    expect(h.engine.historicalExecution(old)?.record.pullRequests?.map(row => row.number)).toEqual([12]);
    expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
    git(h.sandbox, h.repository, "merge", "--no-edit", h.engine.record.settings.featureBranch); f.publish();
    // GitHub shows the new delivery's pull request merged into develop (Kiln After Delivery AC-WAIT-01).
    h.setPullRequestViews({ "fictional/comet-library#43": recordedPullRequest("merged", { number: 43, base: "develop", mergeCommit: git(h.sandbox, h.repository, "rev-parse", "HEAD").trim() }) });
    expect((await h.engine.checkCompletedPlan()).status).toBe("unchanged");
    const { launchChrome } = await import("../test-support/headless-chrome.js"); const chrome = await launchChrome(); const calls = h.claudeCalls().length;
    try { for (const width of [1200, 390]) { const page = await chrome.open(hosted.server.address, { width, height: 1100 }); try { await page.waitFor("document.body.innerText.includes('No new phases found') && !document.body.innerText.includes('Checking for new phases')"); expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-no-new-${width}.png`, await page.screenshot()); } finally { await page.close(); } } } finally { await chrome.close(); }
    expect(h.claudeCalls()).toHaveLength(calls);
  } finally { await hosted.server.close(); hosted.release(); }
}, 180_000);

nativeIt.each([false, true])("reconciles append/split during preparation return before dependent implementation, split=%s", async split => {
  const f = await fixture(); await f.accept();
  const active = h.engine.worktreePath;
  if (split) {
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9-catalog.md"), "# Phase 9: Split catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [9a](phase-9a-catalog.md) | First implementation |\n| [9b](phase-9b-catalog.md) | Next implementation |\n");
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9a-catalog.md"), cometPhase("9a") + "\n## Phase dependencies\n8.\n");
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9b-catalog.md"), cometPhase("9b") + "\n## Phase dependencies\n9a.\n");
  } else writeFileSync(join(active, COMET_DIRECTORY, "phase-16-catalog.md"), cometPhase(16));
  git(h.sandbox, active, "add", COMET_DIRECTORY); git(h.sandbox, active, "commit", "-qm", "test: revise plan in preparation"); git(h.sandbox, active, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  await f.submit();
  expect(h.engine.record.planReconciliation?.handback).toMatchObject({ addedPhaseIds: split ? ["9a", "9b"] : ["16"], remainingCount: 7 });
  expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(h.claudeCalls()[1]!.prompt).toContain(split ? "phase-9a-catalog.md" : "phase-9-catalog.md");
  expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
  expect(h.engine.judgedId("9")).toBe(split ? "9a" : "9");
}, 120_000);

nativeIt("continues preparation using its assigned plan when the original checkout adds work", async () => {
  const f = await fixture(); await f.accept();
  f.write("phase-16-catalog.md", cometPhase(16));
  await f.submit();
  expect(h.engine.record.preparation?.stage).toBe("implementation"); expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(h.engine.record.planReconciliation?.check?.status).toBe("accepted");
  expect(h.engine.record.plan?.some(phase => phase.id === "16")).toBe(false);
  expect(existsSync(join(h.engine.worktreePath, COMET_DIRECTORY, "phase-16-catalog.md"))).toBe(false);
  expect(readFileSync(join(h.repository, COMET_DIRECTORY, "phase-16-catalog.md"), "utf8")).toBe(cometPhase(16));
}, 120_000);

nativeIt("ignores original-checkout edits made during native preparation verification", async () => {
  const f = await fixture(); await f.accept();
  const native = await import("./preparation-verifier.js");
  const verify = native.verifyPreparation;
  const spy = vi.spyOn(native, "verifyPreparation").mockImplementation(async context => {
    const checkpoint = await verify(context);
    // Deterministic external editor scheduling; native verification itself is real.
    f.write("phase-16-catalog.md", cometPhase(16));
    return checkpoint;
  });
  try {
    await f.submit();
    expect(h.engine.record.preparation?.verifiedCheckpoint).toBeDefined();
    expect(h.engine.record.planReconciliation?.check?.status).toBe("accepted");
    expect(h.engine.record.plan?.some(phase => phase.id === "16")).toBe(false);
    expect(h.engine.record.preparation?.stage).toBe("implementation");
    expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
    expect(h.claudeCalls()).toHaveLength(3);
    expect(h.claudeCalls().at(-1)?.prompt).toContain("phase-10-catalog.md");
  } finally { spy.mockRestore(); }
}, 120_000);

nativeIt.each([false, true])("prepares every leaf of an external/carried split prerequisite (carried=%s) across repositories", async carried => {
  const f = await fixture("exit 0", "this phase's branch", 10, "exit 0", true, carried, true);
  const { startFixtureController } = await import("../test-support/controller-server.js");
  const { readBaseline } = await import("./plan-reconciliation.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  try {
    const response = await fetch(`${new URL(hosted.server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(hosted.server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
    expect(response.status).toBe(200);
    const check = await h.engine.checkCompletedPlan();
    expect(check.status, JSON.stringify(check)).toBe("available");
    expect(check.result!.proposal!.prerequisites.filter(row => row.phaseId.startsWith("8"))).toMatchObject([{ phaseId: "8a", status: "preparation_available" }, { phaseId: "8b", status: "preparation_available" }]);
    expect(check.result!.proposal!.preparation.map(row => [row.prerequisites, row.repository])).toEqual([[["8"], "comet-library"], [["8"], "lending-api"]]);
    expect(check.result!.added.map(row => row.id)).toEqual(["9", "10", "11", "12", "13", "14", "15"]);
    await f.accept();
    // The owning preparation session may split; its first descendant receives implementation.
    const active = h.engine.worktreePath;
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9-catalog.md"), "# Phase 9: Catalog split\n\n## Split into\n| Phase | Work |\n|---|---|\n| [9a](phase-9a-catalog.md) | First implementation |\n| [9b](phase-9b-catalog.md) | Later implementation |\n");
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9a-catalog.md"), cometPhase("9a") + "\n## Phase dependencies\n8.\n");
    writeFileSync(join(active, COMET_DIRECTORY, "phase-9b-catalog.md"), cometPhase("9b") + "\n## Phase dependencies\n9a.\n");
    git(h.sandbox, active, "add", COMET_DIRECTORY); git(h.sandbox, active, "commit", "-qm", "test: split preparation owner"); git(h.sandbox, active, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
    const scenario = JSON.parse(readFileSync(h.scenarioPath, "utf8"));
    scenario.sessions[1].actions = scenario.sessions[1].actions.map((action: Record<string, unknown>) => ({ ...action, repository: "comet-library" }));
    scenario.sessions[1].actions.splice(-2, 0, { push: true, repository: "lending-api" });
    writeFileSync(h.scenarioPath, JSON.stringify(scenario));
    const sessionId = h.engine.latestSession("9")!.sessionId;
    await f.submit();
    expect(h.engine.record.preparation?.reason).toBeUndefined();
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded", "succeeded"]);
    expect(h.engine.record.preparation?.stage).toBe("implementation");
    expect(h.engine.latestSession("9")!.sessionId).toBe(sessionId); expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-9a-catalog.md");
    const baseline = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
    expect(baseline.completions["8"]).toBeUndefined();
    for (const id of ["8a", "8b"]) {
      expect(baseline.completions[id]?.scopeRepositories).toEqual(id === "8b" ? ["lending-api"] : []);
      expect(Object.keys(baseline.completions[id]!.repositories!).sort()).toEqual(["comet-library", "lending-api"]);
    }
    expect(h.engine.record.phases["8a"]).toBeUndefined(); expect(h.engine.record.phases["8b"]).toBeUndefined();
    expect(h.engine.judgedId("9")).toBe("9a"); expect(h.engine.record.phases["9"]?.doneAt, JSON.stringify(h.engine.record.phases["9"])).toBeDefined();
  } finally { await hosted.server.close(); hosted.release(); }
}, 120_000);

nativeIt.each([false, true])("evaluates external/carried two-repository split preparation with Codex controls (carried=%s)", async carried => {
  const f = await fixture("exit 0", "this phase's branch", 10, "exit 0", true, carried, true);
  const { codexWorkFixture } = await import("../test-support/codex-work-fixture.js"); const codex = codexWorkFixture();
  try {
    h.engine.close(); Object.assign(h.tools, { codex: codex.options.executable }); codex.configureEnvironment(h.env); h.env.CODEX_HOME = codex.home;
    // The PRD ran on Codex; its accepted continuation drops a kept choice equal to a current default (Kiln Phase Model Tiers KEEP-003), so this computer's Model defaults put every row on Codex.
    h.engine.record.settings.modelChoices.kept = { ...CODEX_CHOICE }; codexDefaults(h.env);
    writePrdRecord(h.stateDirectory, h.engine.record); h.engine = f.make();
    await h.engine.refreshAgents(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    const ready = await h.engine.checkCompletedPlan();
    expect(ready.status, JSON.stringify(ready)).toBe("available");
    expect(ready.result!.proposal!.prerequisites.filter(row => row.phaseId.startsWith("8")).map(row => row.status)).toEqual(["preparation_available", "preparation_available"]);
    expect(ready.result!.proposal!.preparation.map(row => row.repository)).toEqual(["comet-library", "lending-api"]);
    const before = ready.result!.proposal!.id;
    const ownerFile = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md");
    const ownerText = readFileSync(ownerFile, "utf8");
    writeFileSync(ownerFile, ownerText.replace(/\nFirst step: merge Phase 8\. In repository `lending-api`,[\s\S]*$/, "\n"));
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: remove required split repository tuple"); f.publish();
    const incomplete = await h.engine.checkCompletedPlan(); expect(incomplete.status).toBe("blocked");
    expect(incomplete.result!.proposal!.prerequisites.filter(row => row.phaseId.startsWith("8")).map(row => row.status)).toEqual(["preparation_available", "blocked"]);
    writeFileSync(ownerFile, ownerText);
    // A Closed parent cannot hide an unfinished descendant, in either source mode.
    const path = join(h.repository, COMET_DIRECTORY, "phase-8b-catalog.md");
    writeFileSync(path, cometPhase("8b"));
    const parentFile = join(h.repository, COMET_DIRECTORY, "phase-8-catalog.md");
    writeFileSync(parentFile, readFileSync(parentFile, "utf8").replace("## Split into", "**Closed:** 2026-10-01\n\n## Split into"));
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: reopen prerequisite descendant"); f.publish();
    const blocked = await h.engine.checkCompletedPlan(); expect(blocked.status).toBe("blocked");
    expect(blocked.result!.proposal!.id).not.toBe(before); expect(blocked.result!.proposal!.readiness).toBe("blocked");
    expect(h.claudeCalls()).toEqual([]); expect(codex.calls().filter(call => call.method === "turn/start")).toEqual([]);
  } finally { await codex.sandbox.cleanup(); }
}, 120_000);

nativeIt("rechecks every split prerequisite's source scope after preparation handback", async () => {
  const f = await fixture("exit 0", "this phase's branch", 10, undefined, true);
  await f.accept();
  git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", f.sha);
  const file = join(h.engine.worktreePath, COMET_DIRECTORY, "phase-8b-catalog.md");
  writeFileSync(file, cometPhase("8b", true).replace("capability 8b", "changed prepared scope"));
  git(h.sandbox, h.engine.worktreePath, "add", COMET_DIRECTORY); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: change pending prerequisite scope");
  await f.submit(false);
  expect(h.engine.record.preparation?.reason).toContain("unchanged Closed scope");
  expect(h.engine.record.preparation?.attempts).toEqual([]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.engine.record.phases["8b"]?.doneAt).toBeUndefined();
}, 120_000);
