import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "./engine.js";
import { readPrdRecord } from "../state/records.js";
import { COMET_DIRECTORY, cometPhase, createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
const nativeIt = it.skipIf(process.platform !== "darwin");
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); if (h) writeFileSync(join(h.sandbox.root, "release-preparation"), "release for cleanup"); await h?.engine.stop("sigint"); await h?.cleanup(); });
async function fixture(command = "exit 0", destination = "this phase's branch", timeout = 10, secondRepositoryCheck?: string) {
  const f = await createCometContinuation(); h = f.h;
  let api: { path: string; sha: string } | undefined;
  if (secondRepositoryCheck) {
    const { createGithubOrigin, createRepository } = await import("../test-support/git-repositories.js");
    const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api"); const path = createRepository(h.sandbox, "lending-api", origin.url);
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    git(h.sandbox, path, "push", "-q", "origin", "develop"); git(h.sandbox, path, "checkout", "-qb", "wt/api-preparation");
    writeFileSync(join(path, "validate"), `#!/bin/sh\n${secondRepositoryCheck}\n`); chmodSync(join(path, "validate"), 0o755);
    git(h.sandbox, path, "add", "validate"); git(h.sandbox, path, "commit", "-qm", "test: API preparation"); api = { path, sha: git(h.sandbox, path, "rev-parse", "HEAD").trim() }; git(h.sandbox, path, "checkout", "-q", "develop");
  }
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  if (api) f.write("phase-8-catalog.md", cometPhase(8, true) + "\n**Repositories:** lending-api\n");
  writeFileSync(join(h.repository, "validate"), `#!/bin/sh\n${command}\n`); chmodSync(join(h.repository, "validate"), 0o755);
  git(h.sandbox, h.repository, "add", "validate", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: prepared project check");
  const sha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${sha}\` into ${destination} before building.\n\nVerify before building: run \`./validate\` with timeout \`${timeout}\` seconds.\n`);
  if (api) {
    f.write("phase-8-catalog.md", cometPhase(8, true) + "\n**Repositories:** lending-api\n");
    const path = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered").replace("Merge the local branch", "In repository `comet-library`, merge the local branch") + `\nFirst step: merge Phase 8. In repository \`lending-api\`, merge branch \`wt/api-preparation\` at \`${api.sha}\` into this phase's branch before building.\n\nVerify before building: run \`./validate\`.\n`);
  }
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: assign preparation"); f.publish();
  h.engine.close();
  const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  h.engine = make(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const release = join(h.sandbox.root, "release-preparation");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Preparation only; any claimed checks are not engine receipts." }, { waitForFile: release }, { result: "Prepared source references submitted." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase remains unfinished." }, { exit: 0 }] }] }));
  const accept = async () => {
    const check = await h.engine.checkCompletedPlan();
    const body = { proposalId: check.result!.proposal!.id, executionId: h.engine.record.executionId!, commandId: "accept-preparation", statusToken: h.engine.controlView().token };
    const answer = await h.engine.continuationCommand("accept", body); expect(answer, JSON.stringify(answer)).toMatchObject({ ok: true });
    await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.pid && h.claudeCalls().length === 1);
    return body;
  };
  const submit = async (merge = true) => {
    if (merge) { git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", sha); if (api) git(h.sandbox, h.engine.record.repositories.find(repo => repo.name === "lending-api")!.worktreePath, "merge", "--no-edit", api.sha); }
    const state = h.engine.record.preparation!;
    const body = { executionId: h.engine.record.executionId, phaseId: "9", bindingId: state.bindings[0]!.id, references: [{ kind: "git_revision", repository: "comet-library", commit: sha }] };
    expect(await h.engine.submitPreparation(body)).toMatchObject({ ok: true, disposition: "submitted" });
    expect(await h.engine.submitPreparation(body)).toMatchObject({ ok: true, disposition: "submitted" });
    if (api) {
      const binding = state.bindings.find(row => row.repository === "lending-api")!;
      expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: "lending-api", commit: api.sha }] })).toMatchObject({ ok: true });
    }
    expect(state.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
    writeFileSync(release, "release"); await h.engine.settled();
    return body;
  };
  return { ...f, sha, make, accept, submit, release };
}
nativeIt("settles preparation, verifies its committed checkpoint and implements in the same conversation once", async () => {
  const f = await fixture(); const oldId = h.engine.record.executionId; const body = await f.accept();
  const sessionId = h.engine.latestSession("9")!.sessionId;
  const resultBody = await f.submit();
  expect(await h.engine.submitPreparation(resultBody)).toMatchObject({ ok: true, disposition: "verified" });
  expect(h.engine.record.preparation, JSON.stringify(h.engine.record.preparation)).toMatchObject({ stage: "implementation", attempts: [{ outcome: "succeeded", exitCode: 0 }] });
  expect(h.engine.latestSession("9")!.sessionId).toBe(sessionId);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
  expect(h.claudeCalls()[0]!.prompt).toContain("preparation only"); expect(h.claudeCalls()[1]!.prompt).toContain("independently verified");
  expect(h.engine.historicalExecution(oldId!)?.record.completedAt).toBe("2026-10-01T12:00:00Z");
  expect((await h.engine.continuationCommand("accept", body)).ok).toBe(true);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(readFileSync(h.engine.record.preparation!.attempts[0]!.output, "utf8")).toBe("");
}, 120_000);
nativeIt.each([["exit 3", "failed"], ["sleep 3", "failed"]])("holds dependent implementation when engine check %s", async (command, outcome) => {
  const f = await fixture(command, "this phase's branch", 1); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.attempts[0]?.outcome).toBe(outcome);
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
});
nativeIt("refuses a forged check claim without independently integrated source", async () => {
  const f = await fixture(); await f.accept(); await f.submit(false);
  expect(h.engine.record.preparation!.reason).toContain("Integrate the pinned");
  expect(h.engine.record.preparation!.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
});
nativeIt("records an exact pending target grant without setup, adopts it once and replays without dispatch", async () => {
  await fixture("exit 0", "branch `develop`");
  const oldId = h.engine.record.executionId; const settings = structuredClone(h.engine.record.settings);
  const check = await h.engine.checkCompletedPlan(); expect(check.result!.proposal!.readiness).toBe("blocked");
  const target = { repository: "github.com/fictional/comet-library", baseBranch: "develop" };
  const body = { executionId: oldId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target, commandId: "grant-preparation", statusToken: h.engine.controlView().token };
  const grant = await h.engine.authorizeContinuationTarget(body); expect(grant, JSON.stringify(grant)).toMatchObject({ ok: true });
  expect(h.engine.record.executionId).toBe(oldId); expect(h.engine.record.settings).toEqual(settings); expect(h.engine.record.continuation).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(0);
  const reserved = grant.ok ? grant.proposal?.authorization?.executionId : undefined;
  expect(reserved).toBeTruthy(); expect(grant.ok && grant.proposal?.readiness).toBe("ready");
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true });
  const ready = h.engine.record.completedPlanCheck!.result!.proposal!;
  expect(await h.engine.authorizeContinuationTarget({ ...body, proposalId: ready.id, commandId: "grant-other-id", authorizationRevision: 1, statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  expect(h.engine.record.completedPlanCheck!.result!.proposal!.authorization?.revision).toBe(1);
  expect(await h.engine.continuationCommand("accept", { proposalId: ready.id, executionId: oldId!, commandId: "accept-granted", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.pid && h.claudeCalls().length === 1);
  expect(h.engine.record.executionId).toBe(reserved);
  expect(h.engine.record.developmentAuthorization?.grants).toEqual([{ target, confirmedAt: expect.any(String), source: "continuation" }]);
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true }); expect(h.claudeCalls()).toHaveLength(1);
});

nativeIt("invalidates a zero-exit check that mutates source/configuration", async () => {
  const f = await fixture("printf 'changed\\n' >> catalog.txt"); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.attempts[0]).toMatchObject({ outcome: "failed", exitCode: 0 });
  expect(h.engine.record.preparation!.reason).toMatch(/prepared source|changed/i); expect(h.claudeCalls()).toHaveLength(1);
  expect(readFileSync(join(h.engine.worktreePath, "catalog.txt"), "utf8")).toContain("changed");
});
nativeIt("permanently supersedes a target grant when scope moves, even if the earlier scope returns", async () => {
  const f = await fixture("exit 0", "branch `develop`");
  const check = await h.engine.checkCompletedPlan(); const proposal = check.result!.proposal!;
  const target = { repository: "github.com/fictional/comet-library", baseBranch: "develop" };
  const grantBody = { executionId: h.engine.record.executionId!, proposalId: proposal.id, authorizationRevision: 0, target, commandId: "scope-a-grant", statusToken: h.engine.controlView().token };
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true });
  const old = h.engine.record.completedPlanCheck!.result!.proposal!;
  expect(await h.engine.authorizeContinuationTarget({ ...grantBody, commandId: "same-scope-older-offer", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  const file = join(h.repository, COMET_DIRECTORY, "phase-10-catalog.md"); const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace("capability 10", "capability ten")); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: change proposed scope"); f.publish();
  const changed = await h.engine.checkCompletedPlan(); expect(changed.result!.proposal!.authorization).toMatchObject({ superseded: true, revision: 0, targets: [{ granted: false }] });
  writeFileSync(file, text); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: restore earlier prose"); f.publish();
  const restored = await h.engine.checkCompletedPlan(); expect(restored.result!.proposal!.readiness).toBe("blocked"); expect(restored.result!.proposal!.authorization?.executionId).toBeUndefined();
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true, grant: { valid: false, executionId: old.authorization!.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});
nativeIt("retains the verified checkpoint across pause/restart and admits implementation once", async () => {
  const f = await fixture(); await f.accept(); expect(h.engine.pause()).toMatchObject({ ok: true }); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.engine.record.preparation!.verifiedCheckpoint).toBeDefined();
  expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.decide()).toMatchObject({ kind: "paused" });
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
}, 120_000);
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
    expect((await h.engine.checkCompletedPlan()).status).toBe("unchanged");
    const { launchChrome } = await import("../test-support/headless-chrome.js"); const chrome = await launchChrome(); const calls = h.claudeCalls().length;
    try { for (const width of [1200, 390]) { const page = await chrome.open(hosted.server.address, { width, height: 1100 }); try { await page.waitFor("document.body.innerText.includes('No new phases found') && !document.body.innerText.includes('Checking for new phases')"); expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-no-new-${width}.png`, await page.screenshot()); } finally { await page.close(); } } } finally { await chrome.close(); }
    expect(h.claudeCalls()).toHaveLength(calls);
  } finally { await hosted.server.close(); hosted.release(); }
}, 180_000);

nativeIt("holds unacknowledged verification intent on restart instead of blindly repeating a check", async () => {
  const f = await fixture("printf 'checked\\n' >> .gitignore"); await f.accept();
  const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata;
  let injected = false;
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    original(path, value);
    const record = value as { preparation?: { attempts?: { outcome: string; pid?: number }[] } };
    if (!injected && path.endsWith("prd.json") && record.preparation?.attempts?.at(-1)?.outcome === "running" && !record.preparation.attempts.at(-1)?.pid) { injected = true; throw new Error("Lost verifier launch-intent acknowledgement"); }
  });
  try { await f.submit(); } catch { /* The existing metadata fault retains mutation ownership. */ }
  probe.mockRestore();
  expect(injected).toBe(true); expect(h.engine.commands.fault).toBeTruthy();
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.record.preparation!.stage).not.toBe("implementation"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.engine.record.preparation!.reason).toMatch(/ownership|unresolved/i);
});
nativeIt.each([false, true])("retains pending-grant ownership across pointer publication (written=%s)", async afterWrite => {
  const f = await fixture("exit 0", "branch `develop`");
  const check = await h.engine.checkCompletedPlan(); const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata; let injected = false;
  const body = { executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "lost-grant-pointer", statusToken: h.engine.controlView().token };
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => { if (!injected && path.endsWith("prd.json") && (value as { pendingContinuationAuthority?: string }).pendingContinuationAuthority) { injected = true; if (afterWrite) original(path, value); throw new Error("Lost grant pointer acknowledgement"); } original(path, value); });
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: false, status: 503, code: "state_write_failed" }); probe.mockRestore();
  expect(injected).toBe(true); const pointer = h.engine.record.pendingContinuationAuthority; expect(readPrdRecord(h.stateDirectory)!.pendingContinuationAuthority).toBe(afterWrite ? pointer : undefined);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(h.engine.record.pendingContinuationAuthority, JSON.stringify({ check: h.engine.record.completedPlanCheck, commands: h.engine.commands.all() })).toBe(pointer);
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true, grant: { valid: true } });
  expect(h.engine.record.completedPlanCheck?.result?.proposal?.readiness).toBe("ready"); expect(h.claudeCalls()).toHaveLength(0);
});

it.skipIf(process.platform !== "darwin").each(["verification-intent", "verification-process", "verified-checkpoint", "implementation-intent"])("reconciles actual controller death at %s without duplicate checks or turns", async boundary => {
  const f = await fixture(); const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url"); const { existsSync } = await import("node:fs");
  const marker = join(h.sandbox.root, "preparation-crash-boundary"); const optionsPath = join(h.sandbox.root, "preparation-controller.json");
  writeFileSync(optionsPath, JSON.stringify({ boundary, marker, release: f.release, options: { paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, stateDirectory: h.stateDirectory, record: h.engine.record, originRetryMs: 0 } }));
  h.engine.close(); h.env.KILN_STANDIN_OWNER_PID = String(process.pid);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../test/stand-ins/preparation-controller.mjs", import.meta.url)), optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit"); let diagnostic = ""; child.stderr!.on("data", data => { diagnostic += String(data); });
  try {
    await waitFor(() => { if (child.exitCode !== null || child.signalCode !== null) throw new Error(diagnostic); return existsSync(marker); }, 40_000);
    const saved = readPrdRecord(h.stateDirectory)!; const identity = saved.executionId; const conversation = saved.phases["9"]!.sessionIds[0];
    child.kill("SIGKILL"); await exited;
    h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
    await h.engine.decide(); await h.engine.settled();
    expect(h.engine.record.executionId).toBe(identity); expect(h.engine.record.phases["9"]!.sessionIds).toEqual([conversation]);
    expect(h.engine.record.preparation!.attempts).toHaveLength(1);
    if (boundary === "verification-intent" || boundary === "verification-process") {
      expect(h.engine.record.preparation!.stage).not.toBe("implementation"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
      expect(h.engine.record.preparation!.reason).toMatch(/unresolved|lost|ownership/i);
      if (boundary === "verification-process") { const attempt = h.engine.record.preparation!.attempts[0]!; const { requireExited } = await import("../live/ownership.js"); await waitFor(async () => { try { await requireExited({ pid: attempt.pid!, processStartTime: attempt.processStartTime! }); return true; } catch { return false; } }); }
    } else {
      expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("succeeded");
      expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
      expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
    }
  } finally { child.kill("SIGKILL"); if (child.exitCode === null && child.signalCode === null) await exited; }
}, 120_000);

nativeIt("holds a changed pinned source after successful verification and pause", async () => {
  const f = await fixture(); await f.accept(); h.engine.pause(); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!.id;
  git(h.sandbox, h.repository, "branch", "-f", "wt/catalog-accessibility", "develop");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.engine.record.preparation!.reason).toContain("moved");
  expect(h.engine.record.preparation!.attempts.map(row => row.id)).toEqual([attempt]); expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
});
nativeIt("honors existing Claude tool restrictions before any native project check", async () => {
  const f = await fixture("printf 'should not run\\n' > check-ran.txt");
  const { mkdirSync, existsSync } = await import("node:fs"); const root = h.env.CLAUDE_CONFIG_DIR!; mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "settings.json"), JSON.stringify({ permissions: { deny: ["Bash(./validate)"] } }));
  await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.reason).toContain("Existing Claude tool controls require");
  expect(h.engine.record.preparation!.attempts).toHaveLength(0); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(existsSync(join(h.engine.worktreePath, "check-ran.txt"))).toBe(false);
});
nativeIt("shows the preparation offer, unavailable source, failed check, target grant and continuing states in Chrome", async () => {
  const f = await fixture(); const { startFixtureController } = await import("../test-support/controller-server.js"); const { launchChrome } = await import("../test-support/headless-chrome.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token }); const chrome = await launchChrome();
  const file = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md"); const original = readFileSync(file, "utf8");
  const publish = (text: string) => { writeFileSync(file, text); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: change browser readiness input"); f.publish(); };
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(hosted.server.address, { width, height: 1100 });
      const button = (label: string) => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
      const settled = async () => { await page.waitFor(`${button("Check for new phases")} && !${button("Check for new phases")}.disabled && !document.body.innerText.includes('Showing earlier results.')`); };
      try {
        await settled(); await page.waitFor("document.body.innerText.includes('Readiness: Ready')");
        await page.evaluate(`${button("Not now")}.click()`); await page.waitFor("document.body.innerText.includes('Additional work is available when you are ready.')"); expect(h.claudeCalls()).toHaveLength(0);
        await page.evaluate(`${button("Show continuation offer")}.click()`); expect(await page.evaluate(`${button("Continue with 7 phases")}.disabled`)).toBe(false);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-ready-${width}.png`, await page.screenshot());
        publish(original.replace("`wt/catalog-accessibility`", "`unavailable-source`"));
        await page.evaluate(`${button("Check for new phases")}.click()`); await settled(); await page.waitFor("document.body.innerText.includes('restore source unavailable-source')");
        writeFileSync(`/tmp/kiln-preparation-missing-${width}.png`, await page.screenshot()); expect(await page.evaluate(`${button("Continue with 7 phases")}.disabled`)).toBe(true);
        const origin = git(h.sandbox, h.repository, "config", "--get", "remote.origin.url").trim(); git(h.sandbox, h.repository, "remote", "set-url", "origin", "file:///nonexistent-kiln-preparation-proof.git");
        await page.evaluate(`${button("Check for new phases")}.click()`); await page.waitFor("document.body.innerText.includes('Could not check for new phases') && document.body.innerText.includes('current phase count is unknown')");
        writeFileSync(`/tmp/kiln-preparation-failed-${width}.png`, await page.screenshot()); git(h.sandbox, h.repository, "remote", "set-url", "origin", origin);
        publish(original.replace("into this phase's branch", "into branch `develop`")); await page.evaluate(`${button("Check for new phases")}.click()`); await settled();
        await page.waitFor("document.body.innerText.includes('Authorize early merges to github.com/fictional/comet-library / develop')");
        writeFileSync(`/tmp/kiln-preparation-permission-${width}.png`, await page.screenshot());
        await page.evaluate("document.querySelector('input[type=checkbox]').click()"); await page.waitFor("document.body.innerText.includes('Authorized for this run: github.com/fictional/comet-library / develop')");
        await page.waitFor(`${button("Continue with 7 phases")} && !${button("Continue with 7 phases")}.disabled`); expect(h.claudeCalls()).toHaveLength(0); expect(h.engine.record.continuation).toBeUndefined();
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-authorized-${width}.png`, await page.screenshot());
        if (width === 1200) { publish(original); await page.evaluate(`${button("Check for new phases")}.click()`); await settled(); }
        else {
          await page.evaluate(`${button("Continue with 7 phases")}.click()`); await page.waitFor("document.body.innerText.includes('Preparing prerequisites') && document.body.innerText.includes('Earlier deliveries')");
          await waitFor(() => h.claudeCalls().length === 1); writeFileSync(`/tmp/kiln-preparation-continuing-${width}.png`, await page.screenshot());
          expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
        }
      } finally { await page.close(); }
    }
  } finally { await chrome.close(); await hosted.server.close(); hosted.release(); }
}, 180_000);

nativeIt("requires successful checks for both prepared repositories at one checkpoint", async () => {
  const f = await fixture("exit 0", "this phase's branch", 10, "exit 5"); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.bindings.map(row => row.repository)).toEqual(["comet-library", "lending-api"]);
  expect(h.engine.record.preparation!.attempts.map(row => [row.outcome, row.exitCode])).toEqual([["succeeded", 0], ["failed", 5]]);
  expect(new Set(h.engine.record.preparation!.attempts.map(row => row.checkpointId)).size).toBe(1);
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});

nativeIt("keeps a damaged successful-check output unresolved rather than reusing or blindly repeating it", async () => {
  const f = await fixture(); await f.accept(); h.engine.pause(); await f.submit();
  writeFileSync(h.engine.record.preparation!.attempts[0]!.output, "tampered output");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("unresolved"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});
nativeIt("cleans up a live verifier launcher after an uncertain process-identity publication", async () => {
  const f = await fixture(); await f.accept();
  const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata; let injected = false;
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => { original(path, value); const attempt = (value as { preparation?: { attempts?: { processStartTime?: string }[] } }).preparation?.attempts?.at(-1); if (!injected && path.endsWith("prd.json") && attempt?.processStartTime) { injected = true; throw new Error("Lost process identity acknowledgement"); } });
  try { await f.submit(); } catch { /* Mutation fault is retained until restart. */ } probe.mockRestore();
  expect(injected).toBe(true); expect(h.engine.commands.fault).toBeTruthy(); const attempt = readPrdRecord(h.stateDirectory)!.preparation!.attempts[0]!;
  const { requireExited } = await import("../live/ownership.js"); await requireExited({ pid: attempt.pid!, processStartTime: attempt.processStartTime! });
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});
nativeIt("verifies the exact granted delivery target before admitting implementation", async () => {
  const f = await fixture("exit 0", "branch `develop`"); const check = await h.engine.checkCompletedPlan();
  expect(await h.engine.authorizeContinuationTarget({ executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "grant-real-preparation-target", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  await f.accept(); git(h.sandbox, h.repository, "merge", "--no-edit", f.sha); f.publish();
  git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", "origin/develop"); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("implementation"); expect(h.engine.record.preparation!.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.developmentAuthorization?.grants).toMatchObject([{ target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, source: "continuation" }]);
});

it.skipIf(process.platform === "darwin")("reports an unavailable native verifier before accepting or launching preparation", async () => {
  await fixture(); const execution = h.engine.record.executionId;
  const check = await h.engine.checkCompletedPlan(); expect(check.status).toBe("blocked"); expect(check.result?.proposal?.problems.join(" ")).toContain("required native preparation verifier sandbox is unavailable");
  expect(h.engine.record.executionId).toBe(execution); expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt("prevents native validation from writing outside assigned worktrees and temporary roots", async () => {
  const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
  const outside = mkdtempSync(join(process.cwd(), ".preparation-canary-")); const canary = join(outside, "must-not-exist");
  try {
    const f = await fixture(`printf 'outside write' > '${canary}'`); await f.accept(); await f.submit();
    expect(existsSync(canary)).toBe(false); expect(h.engine.record.preparation!.attempts[0]?.outcome).toBe("failed"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  } finally { rmSync(outside, { recursive: true }); }
});

nativeIt("uses Claude's effective project validation environment without retaining its values", async () => {
  const f = await fixture('test "$KILN_VALIDATION_TARGET" = "synthetic-sandbox"\ntest "$CLAUDE_PROJECT_DIR" = "synthetic-configured-root"');
  const { mkdirSync } = await import("node:fs"); mkdirSync(h.env.CLAUDE_CONFIG_DIR!, { recursive: true });
  writeFileSync(join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ env: { KILN_VALIDATION_TARGET: "synthetic-sandbox", CLAUDE_PROJECT_DIR: "synthetic-configured-root" } })); h.env.KILN_VALIDATION_TARGET = "wrong-controller-target";
  await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("implementation"); expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("succeeded");
  expect(JSON.stringify(h.engine.record.preparation)).not.toContain("wrong-controller-target"); expect(JSON.stringify(h.engine.record.preparation)).not.toContain("synthetic-sandbox");
});
nativeIt.each(["deny", "malformed", "rewrite", "timeout"] as const)("enforces Claude's %s hook on the actual native invocation", async mode => {
  const f = await fixture("printf 'must not run\\n' > check-ran.txt"); const { mkdirSync, existsSync } = await import("node:fs");
  mkdirSync(h.env.CLAUDE_CONFIG_DIR!, { recursive: true }); const counter = join(h.sandbox.root, "hook-invocations"); const hook = join(h.sandbox.root, "controlled-hook.mjs");
  writeFileSync(counter, "1"); h.env.KILN_HOOK_COUNTER = counter;
  const output = mode === "deny" ? "{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'one-use permission consumed'}}" : mode === "malformed" ? "{decision:'deny'}" : mode === "rewrite" ? "{hookSpecificOutput:{hookEventName:'PreToolUse',updatedInput:null}}" : "{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow'}}";
  writeFileSync(hook, `import fs from 'node:fs'; const path=process.env.KILN_HOOK_COUNTER; fs.writeFileSync(path,String(Number(fs.readFileSync(path,'utf8'))+1)); ${mode === "timeout" ? "await new Promise(resolve=>setTimeout(resolve,3000));" : ""} process.stdout.write(JSON.stringify(${output}));\n`);
  writeFileSync(join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: process.execPath, args: [hook], timeout: 1, onFailure: "block" }] }] } }));
  await f.accept(); await f.submit();
  expect(readFileSync(counter, "utf8")).toBe("2"); expect(existsSync(join(h.engine.worktreePath, "check-ran.txt"))).toBe(false);
  expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("failed"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(readFileSync(h.engine.record.preparation!.attempts[0]!.output, "utf8")).toContain(mode === "deny" ? "one-use permission consumed" : mode === "malformed" ? "unsupported control result" : mode === "rewrite" ? "holds or changes" : "configured timeout");
});
nativeIt("reuses an allocated zero-run preparation session after a fresh billing hold clears", async () => {
  const f = await fixture(); h.env.KILN_STANDIN_VERSION = "2.1.307"; h.env.ANTHROPIC_API_KEY = "synthetic-preparation-billing-canary"; await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.busy && !h.engine.billing.pending);
  const check = await h.engine.checkCompletedPlan(); expect(await h.engine.continuationCommand("accept", { executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, commandId: "preparation-billing-hold", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true }); await h.engine.settled();
  const id = h.engine.latestSession("9")!.sessionId; expect(h.engine.latestSession("9")!.runs).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(0);
  delete h.env.ANTHROPIC_API_KEY; await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.checkAgain()).toMatchObject({ ok: true }); await waitFor(() => !!h.engine.latestSession("9")?.runs[0]?.pid && h.claudeCalls().length === 1).catch(error => { throw new Error(JSON.stringify({ error: error.message, billing: h.engine.record.billing, phase: h.engine.record.phases["9"], commands: h.engine.commands.all() })); }); await f.submit();
  expect(h.engine.latestSession("9")!.sessionId).toBe(id); expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.preparation!.stage).toBe("implementation");
}, 120_000);

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

nativeIt("holds preparation return on a changed known source and accepts the reconciled plan after recovery", async () => {
  const f = await fixture(); await f.accept();
  f.write("phase-16-catalog.md", cometPhase(16));
  await f.submit();
  expect(h.engine.record.preparation?.reason).toContain("Plan discrepancy");
  expect(h.engine.record.preparation?.reason).toContain("Reconcile those documents into the active workspace");
  expect(h.engine.record.preparation?.attempts).toEqual([]); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  const active = h.engine.worktreePath;
  writeFileSync(join(active, COMET_DIRECTORY, "phase-16-catalog.md"), cometPhase(16));
  git(h.sandbox, active, "add", COMET_DIRECTORY); git(h.sandbox, active, "commit", "-qm", "test: reconcile known source"); git(h.sandbox, active, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const releaseAgain = join(h.sandbox.root, "release-recovered-preparation");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [] }, { actions: [{ waitForFile: releaseAgain }, { result: "Reconciled preparation returned." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase needs work." }, { exit: 0 }] }] }));
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
  await waitFor(() => h.engine.latestSession("9")!.runs.length === 2 && !!h.engine.latestSession("9")!.runs.at(-1)?.pid);
  const state = h.engine.record.preparation!;
  for (const binding of state.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
  writeFileSync(releaseAgain, "release"); await h.engine.settled();
  expect(h.engine.record.preparation?.stage).toBe("implementation"); expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  expect(h.engine.record.planReconciliation?.handback?.addedPhaseIds).toEqual(["16"]);
}, 120_000);

nativeIt("rechecks known sources after verification at the final preparation admission hook", async () => {
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
    expect(h.engine.record.planReconciliation?.check?.status).toBe("failed");
    expect(h.engine.record.planReconciliation?.check?.problem).toContain("Plan discrepancy");
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    expect(h.claudeCalls()).toHaveLength(1);
  } finally { spy.mockRestore(); }
}, 120_000);
