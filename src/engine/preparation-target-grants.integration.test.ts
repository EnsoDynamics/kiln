// Preparation execution: early-merge target grants, how a scope change supersedes them, and how
// they survive faults and restarts. The shared fixture is src/test-support/preparation-execution-fixture.ts.
import { afterEach, expect, vi } from "vitest";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readPrdRecord } from "../state/records.js";
import { COMET_DIRECTORY } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { waitFor } from "../test-support/engine-harness.js";
import { cleanUpPreparation, fixture, h, nativeIt } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

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
  if (change === "candidate") { writeFileSync(file, text.replace("capability 10", "capability ten")); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: change candidate scope"); f.publish(); }
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
  if (change === "base" || change === "fetch" || change === "candidate") git(h.sandbox, h.origin, "update-ref", "refs/heads/develop", base, git(h.sandbox, h.repository, "rev-parse", "HEAD").trim());
  if (change === "candidate") git(h.sandbox, h.repository, "reset", "-q", "--hard", base);
  if (change === "source") git(h.sandbox, h.repository, "update-ref", "refs/heads/wt/catalog-accessibility", f.sha, base);
  if (change === "provider_settings") { if (oldPermissions === undefined) unlinkSync(permissionFile); else writeFileSync(permissionFile, oldPermissions); }
  // Persist restored settings through the normal check, then read only disk on restart.
  await h.engine.checkCompletedPlan(); h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  const restored = h.engine.record.completedPlanCheck!.result!.proposal!;
  expect(restored.readiness).toBe(unchanged ? "ready" : "blocked");
  expect(await h.engine.authorizeContinuationTarget(grantBody)).toMatchObject({ ok: true, grant: { valid: unchanged, executionId: approved.authorization!.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});

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
  const path = join(h.repository, COMET_DIRECTORY, "phase-10-catalog.md"); const text = readFileSync(path, "utf8");
  const publishText = (next: string) => { writeFileSync(path, next); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: change phase 10 scope"); f.publish(); };
  publishText(text.replace("capability 10", "capability ten"));
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
  if (afterWrite) publishText(text);
  expect(readPendingAuthority(h.stateDirectory, h.engine.record)?.state).toBe(afterWrite ? "superseded" : "pending");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  if (!afterWrite) publishText(text); await h.engine.checkCompletedPlan();
  expect(h.engine.record.completedPlanCheck!.result!.proposal!.readiness).toBe("blocked");
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true, grant: { valid: false, executionId: pending.executionId } });
  expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt.each([false, true])("retains pending-grant ownership across pointer publication (written=%s)", async afterWrite => {
  const f = await fixture("exit 0", "branch `develop`");
  const check = await h.engine.checkCompletedPlan(); const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata; let injected = false;
  const body = { executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "lost-grant-pointer", statusToken: h.engine.controlView().token };
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => { if (!injected && path.endsWith("prd.json") && (value as { pendingContinuationAuthority?: string }).pendingContinuationAuthority) { injected = true; if (afterWrite) original(path, value); throw new Error("Lost grant pointer acknowledgement"); } original(path, value); });
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: false, status: 503, code: "state_write_failed" }); probe.mockRestore();
  expect(injected).toBe(true); const pointer = h.engine.record.pendingContinuationAuthority; expect(readPrdRecord(h.stateDirectory)!.pendingContinuationAuthority).toBe(afterWrite ? pointer : undefined);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(h.engine.record.pendingContinuationAuthority, JSON.stringify({ check: h.engine.record.completedPlanCheck, commands: h.engine.commands.all() })).toBe(pointer);
  expect(await h.engine.authorizeContinuationTarget(body)).toMatchObject({ ok: true, grant: { valid: true } });
  expect(h.engine.record.completedPlanCheck?.result?.proposal?.readiness).toBe("ready"); expect(h.claudeCalls()).toHaveLength(0);
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

nativeIt("verifies the exact granted delivery target before admitting implementation", async () => {
  const f = await fixture("exit 0", "branch `develop`"); const check = await h.engine.checkCompletedPlan();
  expect(await h.engine.authorizeContinuationTarget({ executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, commandId: "grant-real-preparation-target", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  await f.accept(); git(h.sandbox, h.repository, "merge", "--no-edit", f.sha); f.publish();
  git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", "origin/develop"); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("implementation"); expect(h.engine.record.preparation!.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.developmentAuthorization?.grants).toMatchObject([{ target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, source: "continuation" }]);
});
