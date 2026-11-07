import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Engine } from "./engine.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { COMET_DIRECTORY, cometPhase, createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
const nativeIt = it.skipIf(process.platform !== "darwin");
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); if (h) writeFileSync(join(h.sandbox.root, "release-preparation"), "release for cleanup"); await h?.engine.stop("sigint"); await h?.cleanup(); });
async function fixture(command = "exit 0", destination = "this phase's branch", timeout = 10, secondRepositoryCheck?: string, splitPrerequisite = false, carried = false, distinctRepositoryScope = false) {
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
  const prerequisiteFiles = splitPrerequisite ? {
    "phase-8-catalog.md": "# Phase 8: Catalog preparation split\n\n" + (api && !distinctRepositoryScope ? "**Repositories:** lending-api\n\n" : "") + "## Split into\n| Phase | Work |\n|---|---|\n| [8a](phase-8a-catalog.md) | First prepared leaf |\n| [8b](phase-8b-catalog.md) | Second prepared leaf |\n",
    "phase-8a-catalog.md": cometPhase("8a", true), "phase-8b-catalog.md": cometPhase("8b", true).replace("## Acceptance criteria covered", (api && distinctRepositoryScope ? "**Repositories:** lending-api\n\n" : "") + "## Acceptance criteria covered"),
  } : {};
  for (const [name, text] of Object.entries(prerequisiteFiles)) f.write(name, text);
  git(h.sandbox, h.repository, "add", "validate", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: prepared project check");
  const sha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${sha}\` into ${destination} before building.\n\nVerify before building: run \`./validate\` with timeout \`${timeout}\` seconds.\n`);
  if (api) {
    f.write("phase-8-catalog.md", cometPhase(8, true) + "\n**Repositories:** lending-api\n");
    const path = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered").replace("Merge the local branch", "In repository `comet-library`, merge the local branch") + `\nFirst step: merge Phase 8. In repository \`lending-api\`, merge branch \`wt/api-preparation\` at \`${api.sha}\` into this phase's branch before building.\n\nVerify before building: run \`./validate\`.\n`);
  }
  for (const [name, text] of Object.entries(prerequisiteFiles)) f.write(name, text);
  if (carried) {
    const { observeGitPlan } = await import("./completed-plan-sources.js");
    const { readBaseline, retainBaseline, phaseRepositories } = await import("./plan-reconciliation.js");
    const old = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
    const source = await observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, COMET_DIRECTORY, sha);
    const { id: _id, ...body } = old; void _id;
    body.normalizerVersion = 4; body.active = source;
    for (const [id, receipt] of Object.entries(body.completions)) receipt.scopeRepositories = phaseRepositories(old.active, id);
    for (const id of ["8a", "8b"]) body.completions[id] = { kind: "external", revision: sha, doneAt: "2026-10-01T11:00:00Z", scopeRepositories: phaseRepositories(source, id), repositories: { "comet-library": { identity: "fictional/comet-library", revision: sha }, ...(api ? { "lending-api": { identity: "fictional/lending-api", revision: api.sha } } : {}) } };
    h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, body).id;
    writePrdRecord(h.stateDirectory, h.engine.record);
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

nativeIt.each(["candidate", "base", "fetch", "repository", "settings", "source", "provider_settings", "permissions_unavailable", "unavailable"])("retains irreversible grant decisions after incomplete %s discovery and restart", async change => {
  const f = await fixture("exit 0", "branch `develop`");
  const check = await h.engine.checkCompletedPlan(); const proposal = check.result!.proposal!;
  const grantBody = { executionId: h.engine.record.executionId!, proposalId: proposal.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "partial-observation-grant", statusToken: h.engine.controlView().token };
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true });
  const approved = h.engine.record.completedPlanCheck!.result!.proposal!;
  const file = join(h.repository, COMET_DIRECTORY, "phase-10-catalog.md"); const text = readFileSync(file, "utf8");
  const settings = structuredClone(h.engine.record.settings);
  const base = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const permissionFile = join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"); const oldPermissions = existsSync(permissionFile) ? readFileSync(permissionFile, "utf8") : undefined;
  if (change === "candidate") writeFileSync(file, text.replace("capability 10", "capability ten"));
  if (change === "settings") h.engine.record.settings.resumeAfterUsageLimit = !settings.resumeAfterUsageLimit;
  if (change === "base" || change === "fetch") { git(h.sandbox, h.repository, "commit", "--allow-empty", "-qm", "test: move disposable base"); f.publish(); }
  if (change === "source") git(h.sandbox, h.repository, "update-ref", "refs/heads/wt/catalog-accessibility", base, f.sha);
  if (change === "provider_settings") writeFileSync(permissionFile, JSON.stringify({ env: { KILN_FICTIONAL_PERMISSION_INPUT: "changed" } }));
  const permissions = await import("./preparation-permissions.js");
  const originalOrigin = git(h.sandbox, h.repository, "config", "--get", "remote.origin.url").trim();
  const accounting = await import("./completed-plan-accounting.js"); const account = accounting.accountCompletedLeaves;
  const identityFailure = change === "repository" ? vi.spyOn(accounting, "accountCompletedLeaves").mockImplementation(input => { git(h.sandbox, h.repository, "config", "remote.origin.url", "unrecognized-disposable-origin"); return account(input); }) : undefined;
  const gitReads = await import("./git-reads.js"); const readGit = gitReads.runGit;
  const fetchFailure = change === "fetch" ? vi.spyOn(gitReads, "runGit").mockImplementation((context, path, args) => args[0] === "fetch" ? Promise.reject(new Error("Synthetic object fetch failure after positive base read")) : readGit(context, path, args)) : undefined;
  const permissionFailure = change === "permissions_unavailable" ? vi.spyOn(permissions, "preparationPermissions").mockRejectedValue(new Error("Synthetic unavailable permission reader")) : undefined;
  // Fail only after readiness has read real Git/settings facts. The failure
  // supplies no changed input itself and cannot create a replacement proposal.
  const readiness = await import("./continuation-readiness.js"); const original = readiness.evaluateContinuationReadiness;
  const failure = vi.spyOn(readiness, "evaluateContinuationReadiness").mockImplementation(async input => { await original(input); throw new Error("Synthetic incomplete discovery after observations"); });
  const failed = await h.engine.checkCompletedPlan(); failure.mockRestore(); permissionFailure?.mockRestore(); fetchFailure?.mockRestore(); identityFailure?.mockRestore();
  expect(failed.status).toBe("failed"); expect(failed.result).toBeUndefined();
  const { readPendingAuthority } = await import("./continuation-authority.js");
  const unchanged = change === "unavailable" || change === "permissions_unavailable";
  expect(readPendingAuthority(h.stateDirectory, h.engine.record)?.state).toBe(unchanged ? "pending" : "superseded");
  writeFileSync(file, text); h.engine.record.settings = settings;
  if (change === "repository") git(h.sandbox, h.repository, "config", "remote.origin.url", originalOrigin);
  if (change === "base" || change === "fetch") git(h.sandbox, h.origin, "update-ref", "refs/heads/develop", base, git(h.sandbox, h.repository, "rev-parse", "HEAD").trim());
  if (change === "source") git(h.sandbox, h.repository, "update-ref", "refs/heads/wt/catalog-accessibility", f.sha, base);
  if (change === "provider_settings") { if (oldPermissions === undefined) unlinkSync(permissionFile); else writeFileSync(permissionFile, oldPermissions); }
  // Persist restored settings through the normal check, then read only disk on restart.
  await h.engine.checkCompletedPlan(); h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  const restored = h.engine.record.completedPlanCheck!.result!.proposal!;
  expect(restored.readiness).toBe(unchanged ? "ready" : "blocked");
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true, grant: { valid: unchanged, executionId: approved.authorization!.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt.each(["alive", "inventory", "identity", "operation", "takeover"])("holds ordinary Claude preparation on %s process evidence through restart, then retries safely", async obstacle => {
  const f = await fixture(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] });
  const exit = once(child, "exit");
  const identities = await import("../platform/process-start-time.js");
  const inventory = await import("../platform/helper-process.js");
  const { readGate, withGate } = await import("../live/gate.js");
  try {
    const startTime = await identities.processStartTime(child.pid!); expect(startTime).toBeTruthy();
    await f.accept(); const session = h.engine.latestSession("9")!; const gate = session.runs[0]!.live!.gateDirectory;
    await withGate(gate, state => {
      if (obstacle === "identity") state.processObservations = [child.pid!];
      else state.tracked.push({ pid: child.pid!, startTime: startTime! });
      if (obstacle === "inventory") { state.obstacle = "Retry inventory"; state.processObservations = []; }
    });
    const ownership = await import("../live/ownership.js"); const requireExited = ownership.requireExited;
    let insertedOperation = false;
    const operationFault = obstacle === "operation" ? vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      await requireExited(identity);
      if (!insertedOperation && identity.pid === session.runs[0]!.pid) { insertedOperation = true; await withGate(gate, state => { state.operations.pending = { name: "Bash", admittedAt: new Date().toISOString(), hookSettled: false, settled: false }; }); }
    }) : undefined;
    const readIdentity = identities.processStartTime;
    const identityFault = obstacle === "identity" ? vi.spyOn(identities, "processStartTime").mockImplementation((pid, options) => pid === child.pid ? Promise.resolve(undefined) : readIdentity(pid, options)) : undefined;
    const helper = inventory.runHelper;
    const inventoryFault = obstacle === "inventory" ? vi.spyOn(inventory, "runHelper").mockImplementation((command, args, options) => command === "/bin/ps" && args.includes("pid=,ppid=") ? Promise.reject(new Error("Tracked inventory unavailable")) : helper(command, args, options)) : undefined;
    if (obstacle === "takeover") {
      // PID publication precedes launch settlement; wait for actual control admission.
      await waitFor(() => h.engine.controlView().controls.find(control => control.name === "take-over")?.available === true);
      const target = h.engine.liveTarget()!;
      expect(h.engine.commands.submit({ command_id: "takeover-preparation", execution_id: target.executionId, status_token: JSON.stringify(target), action: "take-over", inputs: { target } })).toMatchObject({ ok: true });
      await h.engine.commands.settled();
    }
    await f.submit();
    if (obstacle === "takeover") { await h.engine.reconcileTakeover(); expect(h.engine.record.liveControl?.takeover.state).toBe("pending"); }
    else expect(h.engine.record.preparation?.reason).toMatch(/process|inventory|unsettled/i);
    if (obstacle === "operation") { expect(insertedOperation).toBe(true); expect(h.engine.record.preparation?.reason).toContain("unsettled"); }
    expect(h.engine.record.preparation?.attempts).toHaveLength(0); expect(session.runs).toHaveLength(1);
    h.engine.close(); h.engine = f.make(); await h.engine.prepare();
    // Restart decision retries the returned preparation; it cannot run checks or a turn.
    await h.engine.decide(); expect(h.engine.record.preparation?.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
    identityFault?.mockRestore(); inventoryFault?.mockRestore(); operationFault?.mockRestore();
    child.stdin.end(); await exit;
    if (obstacle === "takeover") await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
    if (obstacle === "operation") await withGate(gate, state => { state.operations.pending!.hookSettled = true; state.operations.pending!.settled = true; });
    expect(readGate(gate).tracked.length + (readGate(gate).processObservations?.length ?? 0)).toBeGreaterThan(0);
    const releaseAgain = join(h.sandbox.root, "release-process-recovery");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [] }, { actions: [{ waitForFile: releaseAgain }, { result: "Preparation recovered." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase needs work." }, { exit: 0 }] }] }));
    // Explicit Resume retains the conversation and earlier attempt evidence.
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
    await waitFor(() => h.engine.latestSession("9")!.runs.length === 2 && !!h.engine.latestSession("9")!.runs.at(-1)?.pid);
    for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
    writeFileSync(releaseAgain, "release"); await h.engine.settled();
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
    expect(h.engine.latestSession("9")!.sessionId).toBe(session.sessionId); expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
}, 120_000);

nativeIt("supersedes a legacy aggregate-only approval after known denied settings, preserving unknown-read retry", async () => {
  const f = await fixture("exit 0", "branch `develop`");
  const readiness = await import("./continuation-readiness.js"); const original = readiness.evaluateContinuationReadiness;
  // Genuine prior-format sidecars: their content hash predates component evidence.
  const oldFormat = vi.spyOn(readiness, "evaluateContinuationReadiness").mockImplementation(async input => {
    const { id: _id, permissionInputs: _inputs, ...body } = await original(input); void _id; void _inputs;
    return { ...body, id: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  });
  const check = await h.engine.checkCompletedPlan(); const proposal = check.result!.proposal!;
  const grantBody = { executionId: h.engine.record.executionId!, proposalId: proposal.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "legacy-permission-grant", statusToken: h.engine.controlView().token };
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true }); oldFormat.mockRestore();
  const { readPendingAuthority, writePendingAuthority } = await import("./continuation-authority.js");
  const pending = readPendingAuthority(h.stateDirectory, h.engine.record)!; delete pending.proposalId; writePendingAuthority(h.stateDirectory, pending);
  const permissions = await import("./preparation-permissions.js");
  const unknown = vi.spyOn(permissions, "preparationPermissions").mockRejectedValue(new Error("Synthetic unavailable permission reader"));
  await h.engine.checkCompletedPlan(); unknown.mockRestore(); expect(readPendingAuthority(h.stateDirectory, h.engine.record)?.state).toBe("pending");
  const settingsFile = join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"); const previous = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : undefined;
  writeFileSync(settingsFile, JSON.stringify({ permissions: { ask: ["Bash"] } }));
  const denied = await h.engine.checkCompletedPlan(); expect(denied.status).toBe("blocked"); expect(denied.result!.proposal!.grantEligible).toBe(false);
  expect(readPendingAuthority(h.stateDirectory, h.engine.record)?.state).toBe("superseded");
  if (previous === undefined) unlinkSync(settingsFile); else writeFileSync(settingsFile, previous);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  expect(h.engine.record.completedPlanCheck!.result!.proposal!.readiness).toBe("blocked");
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true, grant: { valid: false, executionId: pending.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt.each([false, true])("faults supersession publication and reconciles durable authority on restart (written=%s)", async afterWrite => {
  const f = await fixture("exit 0", "branch `develop`"); const check = await h.engine.checkCompletedPlan();
  const body = { executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "supersession-write-grant", statusToken: h.engine.controlView().token };
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true });
  const { readPendingAuthority } = await import("./continuation-authority.js"); const pending = readPendingAuthority(h.stateDirectory, h.engine.record)!;
  const path = join(h.repository, COMET_DIRECTORY, "phase-10-catalog.md"); const text = readFileSync(path, "utf8"); writeFileSync(path, text.replace("capability 10", "capability ten"));
  const durable = await import("../control/durable-file.js"); const write = durable.writeDurableMetadata; let injected = false;
  const fault = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    if (!injected && path.endsWith(`/continuation-authority/${pending.id}.json`) && (value as { state?: string }).state === "superseded") { injected = true; if (afterWrite) write(path, value); throw new Error("Lost supersession projection acknowledgement"); }
    write(path, value);
  });
  await expect(h.engine.checkCompletedPlan()).rejects.toThrow("supersession"); expect(injected).toBe(true); expect(h.engine.commands.fault).toBeTruthy();
  expect(await h.engine.authorizeContinuationTarget({ ...body, commandId: "faulted-supersession-replay" })).toMatchObject({ ok: false }); expect(h.claudeCalls()).toHaveLength(0);
  fault.mockRestore();
  // After publication, even restoring old inputs before restart cannot revive
  // authority. Before publication there is no durable acknowledgement; restart
  // reconciles the actual changed source before any further effect.
  if (afterWrite) writeFileSync(path, text);
  expect(readPendingAuthority(h.stateDirectory, h.engine.record)?.state).toBe(afterWrite ? "superseded" : "pending");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  writeFileSync(path, text); await h.engine.checkCompletedPlan();
  expect(h.engine.record.completedPlanCheck!.result!.proposal!.readiness).toBe("blocked");
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true, grant: { valid: false, executionId: pending.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt("holds Codex preparation before native checks while background inventory is unknown, then resumes the same thread", async () => {
  const f = await fixture(); const { codexWorkFixture } = await import("../test-support/codex-work-fixture.js"); const codex = codexWorkFixture();
  const { posixShellPath } = await import("../test-support/git-repositories.js");
  const configure = (extra: Record<string, unknown>) => codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ...extra });
  try {
    h.engine.close(); Object.assign(h.tools, { codex: codex.options.executable }); codex.configureEnvironment(h.env); h.env.CODEX_HOME = codex.home;
    h.engine.record.settings.agentId = "codex"; h.engine.record.settings.agentChoices.codex = { model: "gpt-6.1-sol", effort: "high" };
    writePrdRecord(h.stateDirectory, h.engine.record); h.engine = f.make();
    configure({ backgroundListError: true, command: `while ! test -f ${posixShellPath(f.release)}; do sleep 0.05; done` });
    await h.engine.agents.refresh(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    const check = await h.engine.checkCompletedPlan(); expect(check.status, JSON.stringify(check)).toBe("available");
    expect(await h.engine.continuationCommand("accept", { proposalId: check.result!.proposal!.id, executionId: h.engine.record.executionId, commandId: "codex-cleanup-preparation", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
    await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.codex?.dispatch);
    git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", f.sha);
    for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
    writeFileSync(f.release, "return"); await h.engine.settled();
    const thread = h.engine.latestSession("9")!.conversation!.threadId;
    expect(h.engine.record.preparation?.reason).toContain("cleanup unresolved"); expect(h.engine.record.preparation?.attempts).toEqual([]);
    expect(codex.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    expect(h.engine.record.preparation?.attempts).toEqual([]); expect(codex.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
    configure({ hang: true });
    await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
    await waitFor(() => codex.calls().filter(call => call.method === "turn/start").length === 2);
    expect(h.engine.latestSession("9")!.conversation!.threadId).toBe(thread); expect(h.engine.record.preparation?.stage).toBe("preparation"); expect(h.engine.record.preparation?.attempts).toEqual([]);
    // The peer deliberately holds this recovery turn. Actual Codex proof owns
    // successful native sandbox/environment and implementation admission.
  } finally { await h.engine.stop("sigint"); await codex.sandbox.cleanup(); }
}, 120_000);
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
// Every step here waits on a full plan check or preparation: dozens of git commands run one after
// another, several seconds each on a loaded machine. The browser helper's 10-second default made
// the test fail at whichever step ran long.
const CHECK_MS = 60_000;
nativeIt("shows the preparation offer, unavailable source, failed check, target grant and continuing states in Chrome", async () => {
  const f = await fixture(); const { startFixtureController } = await import("../test-support/controller-server.js"); const { launchChrome } = await import("../test-support/headless-chrome.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token }); const chrome = await launchChrome();
  const file = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md"); const original = readFileSync(file, "utf8");
  const publish = (text: string) => { writeFileSync(file, text); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: change browser readiness input"); f.publish(); };
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(hosted.server.address, { width, height: 1100 });
      const button = (label: string) => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
      const settled = async () => { await page.waitFor(`${button("Check for new phases")} && !${button("Check for new phases")}.disabled && !document.body.innerText.includes('Showing earlier results.')`, CHECK_MS); };
      try {
        await settled(); await page.waitFor("document.body.innerText.includes('Readiness: Ready')", CHECK_MS);
        await page.evaluate(`${button("Not now")}.click()`); await page.waitFor("document.body.innerText.includes('Additional work is available when you are ready.')", CHECK_MS); expect(h.claudeCalls()).toHaveLength(0);
        await page.evaluate(`${button("Show continuation offer")}.click()`); expect(await page.evaluate(`${button("Continue with 7 phases")}.disabled`)).toBe(false);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-ready-${width}.png`, await page.screenshot());
        publish(original.replace("`wt/catalog-accessibility`", "`unavailable-source`"));
        await page.evaluate(`${button("Check for new phases")}.click()`); await settled(); await page.waitFor("document.body.innerText.includes('restore source unavailable-source')", CHECK_MS);
        writeFileSync(`/tmp/kiln-preparation-missing-${width}.png`, await page.screenshot()); expect(await page.evaluate(`${button("Continue with 7 phases")}.disabled`)).toBe(true);
        const origin = git(h.sandbox, h.repository, "config", "--get", "remote.origin.url").trim(); git(h.sandbox, h.repository, "remote", "set-url", "origin", "file:///nonexistent-kiln-preparation-proof.git");
        await page.evaluate(`${button("Check for new phases")}.click()`); await page.waitFor("document.body.innerText.includes('Could not check for new phases') && document.body.innerText.includes('current phase count is unknown')", CHECK_MS);
        writeFileSync(`/tmp/kiln-preparation-failed-${width}.png`, await page.screenshot()); git(h.sandbox, h.repository, "remote", "set-url", "origin", origin);
        publish(original.replace("into this phase's branch", "into branch `develop`")); await page.evaluate(`${button("Check for new phases")}.click()`); await settled();
        await page.waitFor("document.body.innerText.includes('Authorize early merges to github.com/fictional/comet-library / develop')", CHECK_MS);
        writeFileSync(`/tmp/kiln-preparation-permission-${width}.png`, await page.screenshot());
        await page.evaluate("document.querySelector('input[type=checkbox]').click()"); await page.waitFor("document.body.innerText.includes('Authorized for this run: github.com/fictional/comet-library / develop')", CHECK_MS);
        await page.waitFor(`${button("Continue with 7 phases")} && !${button("Continue with 7 phases")}.disabled`, CHECK_MS); expect(h.claudeCalls()).toHaveLength(0); expect(h.engine.record.continuation).toBeUndefined();
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); writeFileSync(`/tmp/kiln-preparation-authorized-${width}.png`, await page.screenshot());
        if (width === 1200) { publish(original); await page.evaluate(`${button("Check for new phases")}.click()`); await settled(); }
        else {
          await page.evaluate(`${button("Continue with 7 phases")}.click()`); await page.waitFor("document.body.innerText.includes('Preparing prerequisites') && document.body.innerText.includes('Earlier deliveries')", CHECK_MS);
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
  // 2.1.312 offers live control (AC-AGENT-03), whose preparation ownership check reads Claude's session registry, as a real install has.
  const f = await fixture(); mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true }); h.env.KILN_STANDIN_VERSION = "2.1.312"; h.env.ANTHROPIC_API_KEY = "synthetic-preparation-billing-canary"; await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.busy && !h.engine.billing.pending);
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

nativeIt("rechecks retained process owners after native verification before implementation dispatch", async () => {
  const f = await fixture(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] }); const exit = once(child, "exit");
  const { processStartTime } = await import("../platform/process-start-time.js");
  const { withGate } = await import("../live/gate.js"); const native = await import("./preparation-verifier.js"); const verify = native.verifyPreparation;
  try {
    const startTime = await processStartTime(child.pid!); expect(startTime).toBeTruthy(); await f.accept();
    const directory = h.engine.latestSession("9")!.runs[0]!.live!.gateDirectory;
    vi.spyOn(native, "verifyPreparation").mockImplementation(async context => { const checked = await verify(context); await withGate(directory, gate => { gate.tracked.push({ pid: child.pid!, startTime: startTime! }); }); return checked; });
    await f.submit();
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
    expect(h.engine.record.preparation?.reason).toContain("process still owns");
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(1);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
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

async function resumePreparation() {
  const release = join(h.sandbox.root, "release-native-recovery");
  const before = h.engine.latestSession("9")!.runs.length;
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [] }, { actions: [{ waitForFile: release }, { result: "Recovered preparation." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Later work held." }, { exit: 0 }] }] }));
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
  await waitFor(() => h.engine.latestSession("9")!.runs.length === before + 1 && !!h.engine.latestSession("9")!.runs.at(-1)?.pid);
  for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
  writeFileSync(release, "release"); await h.engine.settled();
}

nativeIt.each(["environment", "output", "hooks", "spawn", "spawn_throw"])("recovers a positively known no-launch %s failure through ordinary controls", async mode => {
  const f = await fixture(); await f.accept();
  const permissions = await import("./preparation-permissions.js");
  const helpers = await import("../platform/helper-process.js");
  const environment = permissions.preparationEnvironment; const hooks = permissions.preparationHooks; const launch = helpers.spawnDetached;
  let injected = false;
  const pending = () => h.engine.record.preparation?.attempts.at(-1)?.outcome === "running" && !h.engine.record.preparation.attempts.at(-1)?.pid;
  const envFailure = vi.spyOn(permissions, "preparationEnvironment").mockImplementation(async (context, cwd) => {
    const value = await environment(context, cwd);
    if (!injected && pending() && ["environment", "output"].includes(mode)) {
      injected = true;
      if (mode === "environment") throw new Error("Synthetic no-launch environment projection unavailable");
      mkdirSync(context.record.preparation!.attempts.at(-1)!.output);
    }
    return value;
  });
  const hookFailure = vi.spyOn(permissions, "preparationHooks").mockImplementation(async (context, cwd) => { if (!injected && pending() && mode === "hooks") { injected = true; throw new Error("Synthetic no-launch hook read unavailable"); } return hooks(context, cwd); });
  const spawnFailure = vi.spyOn(helpers, "spawnDetached").mockImplementation((executable, args, options) => {
    if (!injected && pending() && args.some(arg => arg.endsWith("preparation-check-runner.mjs")) && mode.startsWith("spawn")) {
      injected = true;
      if (mode === "spawn_throw") throw new Error("Synthetic synchronous spawn refusal");
      return launch(join(h.sandbox.root, "missing-native-runner"), args, options);
    }
    return launch(executable, args, options);
  });
  await f.submit(); envFailure.mockRestore(); hookFailure.mockRestore(); spawnFailure.mockRestore();
  expect(injected).toBe(true);
  expect(h.engine.record.preparation?.attempts).toMatchObject([{ outcome: "failed", launchFailure: "not_launched" }]);
  expect(h.engine.record.preparation!.attempts[0]!.pid).toBeUndefined(); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
  expect(h.engine.record.preparation?.attempts).toHaveLength(1);
  await resumePreparation();
  expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
  expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["failed", "succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
}, 120_000);

nativeIt.each(["inventory", "identity", "checkpoint_read", "checkpoint_changed"].flatMap(mode => [false, true].map(legacyFailed => ({ mode, legacyFailed }))))("retains and recovers native ownership across $mode failure and restart (legacy failed=$legacyFailed)", async ({ mode, legacyFailed }) => {
  const f = await fixture(); await f.accept();
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] }); const exit = once(child, "exit");
  const identities = await import("../platform/process-start-time.js"); const helpers = await import("../platform/helper-process.js");
  const { readGate, withGate } = await import("../live/gate.js"); const { LiveOwnedProcesses } = await import("../live/owned-processes.js");
  const permissions = await import("./preparation-permissions.js");
  const ownership = await import("../live/ownership.js"); const exited = ownership.requireExited;
  const close = LiveOwnedProcesses.prototype.close; const identity = identities.processStartTime; const helper = helpers.runHelper; const permission = permissions.preparationPermissions;
  let observed = false;
  try {
    const start = await identities.processStartTime(child.pid!); expect(start).toBeTruthy();
    vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      try { await exited(identity); }
      catch (error) { if (mode === "checkpoint_changed" && identity.pid === child.pid) h.env.KILN_FICTIONAL_CHECKPOINT_MOVE = "changed"; throw error; }
    });
    vi.spyOn(LiveOwnedProcesses.prototype, "close").mockImplementation(async function(this: InstanceType<typeof LiveOwnedProcesses>) {
      await close.call(this);
      const attempt = h.engine.record.preparation?.attempts.at(-1);
      if (!observed && attempt?.pid) {
        observed = true;
        await withGate(attempt.gateDirectory, gate => { gate.processObservations = mode === "identity" ? [child.pid!] : []; if (mode !== "identity") gate.tracked.push({ pid: child.pid!, startTime: start! }); if (mode === "inventory") gate.obstacle = "Retry native inventory"; });
      }
    });
    vi.spyOn(identities, "processStartTime").mockImplementation((pid, options) => mode === "identity" && pid === child.pid ? Promise.resolve(undefined) : identity(pid, options));
    vi.spyOn(helpers, "runHelper").mockImplementation((command, args, options) => mode === "inventory" && observed && command === "/bin/ps" && args.includes("pid=,ppid=") ? Promise.reject(new Error("Transient native inventory failure")) : helper(command, args, options));
    vi.spyOn(permissions, "preparationPermissions").mockImplementation(async (...args) => {
      if (observed && h.engine.record.preparation?.attempts.at(-1)?.outcome === "unresolved") {
        if (mode === "checkpoint_read") throw new Error("Transient post-check permission read failed");
      }
      return permission(...args);
    });
    await f.submit();
    expect(observed).toBe(true); expect(h.engine.record.preparation?.attempts).toMatchObject([{ outcome: "unresolved" }]);
    if (legacyFailed) {
      const attempt = h.engine.record.preparation!.attempts[0]!;
      expect(attempt.endedAt).toBeUndefined(); expect(attempt.outputDigest).toBeUndefined();
      attempt.outcome = "failed"; // The retained state written by the original G8 bug.
      writePrdRecord(h.stateDirectory, h.engine.record);
    }
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    vi.restoreAllMocks();
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    expect(h.engine.record.preparation?.attempts).toHaveLength(1); expect(h.engine.record.preparation?.attempts[0]?.outcome).toBe(legacyFailed ? "failed" : "unresolved");
    expect(h.claudeCalls()).toHaveLength(1);
    const { verifyPreparation } = await import("./preparation-verifier.js");
    await expect(verifyPreparation({ record: h.engine.record, stateDirectory: h.stateDirectory, git: { git: h.tools.git, env: h.env }, env: h.env, signal: new AbortController().signal, save: () => writePrdRecord(h.stateDirectory, h.engine.record), now: () => new Date().toISOString() })).rejects.toThrow(/owns|identity|inventory|unresolved/i);
    expect(h.engine.record.preparation?.attempts).toHaveLength(1);
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.preparation?.stage).not.toBe("implementation");
    // Supported observations may refresh, but the real surviving owner is never released.
    expect(readGate(h.engine.record.preparation!.attempts[0]!.gateDirectory).tracked.some(row => row.pid === child.pid)).toBe(true);
    child.stdin.end(); await exit;
    h.engine.close(); h.engine = f.make(); await h.engine.prepare();
    await resumePreparation();
    expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["interrupted", "succeeded"]);
    expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
}, 120_000);

nativeIt.each([false, true])("evaluates external/carried two-repository split preparation with Codex controls (carried=%s)", async carried => {
  const f = await fixture("exit 0", "this phase's branch", 10, "exit 0", true, carried, true);
  const { codexWorkFixture } = await import("../test-support/codex-work-fixture.js"); const codex = codexWorkFixture();
  try {
    h.engine.close(); Object.assign(h.tools, { codex: codex.options.executable }); codex.configureEnvironment(h.env); h.env.CODEX_HOME = codex.home;
    h.engine.record.settings.agentId = "codex"; h.engine.record.settings.agentChoices.codex = { model: "gpt-6.1-sol", effort: "high" };
    writePrdRecord(h.stateDirectory, h.engine.record); h.engine = f.make();
    await h.engine.agents.refresh(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
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

nativeIt.each(["legacy_obstacle", "unknown_start"].flatMap(mode => [false, true].map(legacyFailed => ({ mode, legacyFailed }))))("holds unreconstructible native $mode evidence through Verify and Resume (legacy failed=$legacyFailed)", async ({ mode, legacyFailed }) => {
  const f = await fixture("exit 4"); await f.accept(); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!;
  const { withGate } = await import("../live/gate.js");
  // Retain the supported old-format/unknown-identity state at a real native boundary.
  attempt.outcome = legacyFailed ? "failed" : "unresolved";
  delete attempt.endedAt; delete attempt.outputDigest;
  if (mode === "unknown_start") delete attempt.processStartTime;
  else await withGate(attempt.gateDirectory, gate => { gate.version = 1; delete gate.processObservations; gate.obstacle = "Legacy inventory cannot reconstruct missing observations"; });
  writePrdRecord(h.stateDirectory, h.engine.record);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
  await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
  expect(h.engine.record.preparation?.stage).not.toBe("implementation");
  expect(h.engine.record.preparation?.attempts).toHaveLength(1);
  expect(h.engine.record.preparation?.attempts[0]?.outcome).toBe(legacyFailed ? "failed" : "unresolved");
  expect(h.engine.record.preparation?.reason).toMatch(mode === "unknown_start" ? /ownership is unresolved/ : /Legacy inventory/);
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
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

nativeIt.each(["checkpoint_read", "checkpoint_changed"])("discovers a real detached native descendant before %s failure and recovers safely", async mode => {
  const descendant = "const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(process.env.KILN_FICTIONAL_NATIVE_RELEASE)||!fs.existsSync(require('node:path').dirname(process.env.KILN_FICTIONAL_NATIVE_RELEASE)))process.exit(0)},25)";
  const program = `const fs=require('node:fs');const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});child.unref();fs.writeFileSync(process.env.KILN_FICTIONAL_NATIVE_PID,String(child.pid));setInterval(()=>{if(fs.existsSync(process.env.KILN_FICTIONAL_CHECK_RETURN))process.exit(0)},25)`;
  const f = await fixture(`node -e '${program.replaceAll("'", "'\\''")}'`, "this phase's branch", 30);
  const pidFile = join(h.sandbox.root, "native-descendant.pid"); const release = join(h.sandbox.root, "release-native-descendant"); const checkReturn = join(h.sandbox.root, "return-native-check");
  Object.assign(h.env, { KILN_FICTIONAL_NATIVE_PID: pidFile, KILN_FICTIONAL_NATIVE_RELEASE: release, KILN_FICTIONAL_CHECK_RETURN: checkReturn });
  const { readGate } = await import("../live/gate.js"); const ownership = await import("../live/ownership.js"); const requireExited = ownership.requireExited;
  const permissions = await import("./preparation-permissions.js"); const permission = permissions.preparationPermissions;
  let owner: { pid: number; processStartTime: string } | undefined;
  try {
    await f.accept();
    vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      try { await requireExited(identity); }
      catch (error) { if (mode === "checkpoint_changed" && owner?.pid === identity.pid) h.env.KILN_FICTIONAL_DESCENDANT_CHECKPOINT = "changed"; throw error; }
    });
    vi.spyOn(permissions, "preparationPermissions").mockImplementation(async (...args) => {
      if (h.engine.record.preparation?.attempts.at(-1)?.outcome === "unresolved") {
        if (mode === "checkpoint_read") throw new Error("Synthetic post-check checkpoint read failure beside real descendant");
      }
      return permission(...args);
    });
    const returned = f.submit();
    await waitFor(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    await waitFor(() => {
      const attempt = h.engine.record.preparation?.attempts.at(-1); if (!attempt) return false;
      const tracked = readGate(attempt.gateDirectory).tracked.find(row => row.pid === pid);
      if (tracked) owner = { pid, processStartTime: tracked.startTime };
      return !!owner;
    });
    // The real native scanner, not this test, recorded the detached child.
    expect(owner?.pid).toBe(pid); expect(owner?.processStartTime).toBeTruthy();
    writeFileSync(checkReturn, "return project check while descendant lives"); await returned;
    vi.restoreAllMocks();
    const attempt = h.engine.record.preparation!.attempts[0]!;
    expect(attempt.outcome).toBe("unresolved"); expect(attempt.reason).toContain("Source/configuration changed");
    expect(readGate(attempt.gateDirectory).tracked).toContainEqual({ pid, startTime: owner!.processStartTime });
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    if (mode === "checkpoint_changed") { attempt.outcome = "failed"; writePrdRecord(h.stateDirectory, h.engine.record); }
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
    await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
    expect(h.engine.record.preparation?.attempts).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    await expect(requireExited(owner!)).rejects.toThrow("still owns");
    writeFileSync(release, "release descendant");
    await waitFor(async () => { try { await requireExited(owner!); return true; } catch { return false; } });
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await resumePreparation();
    expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["interrupted", "succeeded"]);
    expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally {
    vi.restoreAllMocks(); writeFileSync(checkReturn, "return for cleanup"); writeFileSync(release, "release for cleanup");
    if (owner) await waitFor(async () => { try { await requireExited(owner!); return true; } catch { return false; } });
  }
}, 120_000);
