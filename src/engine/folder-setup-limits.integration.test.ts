// Setting a run up again from the Folder missing page, with real Git: the limits Start keeps (AC-SAFE-03),
// from the git commands it never runs to the billing holds, pauses, takeovers and continuation
// authority it leaves in place. Shared helpers are in src/test-support/folder-setup-fixture.ts.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { PR_PHASE_KEY, readPrdRecord, writePrdRecord } from "../state/records.js";
import { writePendingAuthority } from "./continuation-authority.js";
import { BILLING_CONTRACT } from "../billing/contract.js";
import { processStartTime } from "../platform/process-start-time.js";
import { FORBIDDEN_GIT, folderSetupRuns, heldBy, landStoppedPhase, lines, mergedWithClosed, panelOf } from "../test-support/folder-setup-fixture.js";
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());
let commands = 0;
const { start, landedThenStopped, loggedThenStopped } = folderSetupRuns({ keep: h => { harness = h; }, nextCommand: () => ++commands });

describe("the limits Start keeps (AC-SAFE-03)", () => {
  it("never merges, resets, deletes or force-pushes, and moves neither the old branch nor the base branch, on a base start", async () => {
    const h = await loggedThenStopped();
    const tips = () => [git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim(), git(h.sandbox, h.origin, "rev-parse", "feature/customer-returns").trim(), git(h.sandbox, h.repository, "rev-parse", "develop").trim(), git(h.sandbox, h.origin, "rev-parse", "develop").trim()];
    const before = tips();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const calls = h.kilnGitCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const made = h.kilnGitCalls().slice(calls);
    expect(made.some(call => call.startsWith("worktree add"))).toBe(true);
    expect(made.filter(call => FORBIDDEN_GIT.test(call))).toEqual([]);
    expect(tips()).toEqual(before);
  });

  it("never merges, resets, deletes or force-pushes on an existing-branch start", async () => {
    const h = await loggedThenStopped();
    const tips = () => [git(h.sandbox, h.origin, "rev-parse", "develop").trim(), git(h.sandbox, h.origin, "rev-parse", "feature/customer-returns").trim(), git(h.sandbox, h.repository, "rev-parse", "feature/customer-returns").trim()];
    const before = tips();
    const saved = h.engine.worktreePath;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const calls = h.kilnGitCalls().length;
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const made = h.kilnGitCalls().slice(calls);
    expect(made.some(call => call.startsWith("worktree add"))).toBe(true);
    expect(made.filter(call => FORBIDDEN_GIT.test(call))).toEqual([]);
    // The only removal is the one stale record (AC-SAFE-04), and neither branch moved.
    expect(made.filter(call => call.startsWith("worktree remove"))).toEqual([`worktree remove ${saved}`]);
    expect(tips()).toEqual(before);
  });

  it("gives a base start's new execution its own billing: an earlier approval doesn't carry, and no session launches until it clears", async () => {
    const h = await landedThenStopped();
    h.env.ANTHROPIC_API_KEY = "synthetic-folder-start-billing-canary";
    await h.engine.refreshBilling();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending);
    const oldId = h.engine.record.executionId!;
    h.engine.record.billing!.approval = { executionId: oldId, contextFingerprint: h.engine.record.billing!.current!.fingerprint, approvedAt: "2026-10-01T10:00:00Z", contractVersion: BILLING_CONTRACT };
    writePrdRecord(h.stateDirectory, h.engine.record);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    const launches = h.claudeCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).not.toBe(oldId);
    expect(h.engine.record.billing!.executionId).toBe(h.engine.record.executionId);
    expect(h.engine.record.billing!.approval).toBeUndefined();
    expect(h.engine.record.billing!.hold).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(launches);
    expect(h.engine.historicalExecution(oldId)!.record.billing!.approval!.executionId).toBe(oldId);
  });

  it("leaves billing, early-merge permission and the repository entries as they were on an existing-branch start", async () => {
    const h = await landedThenStopped();
    const authorization = { revision: 2, enabled: true, grants: [{ target: { repository: "github.com/acme/acme-shop", baseBranch: "develop" }, confirmedAt: "2026-10-01T10:00:00.000Z", source: "start" as const }] };
    h.engine.record.developmentAuthorization = authorization;
    h.env.ANTHROPIC_API_KEY = "synthetic-folder-start-billing-canary";
    await h.engine.refreshBilling();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending);
    const billing = h.engine.record.billing!;
    billing.approval = { executionId: h.engine.record.executionId!, contextFingerprint: billing.current!.fingerprint, approvedAt: "2026-10-01T10:00:00Z", contractVersion: BILLING_CONTRACT };
    const approval = structuredClone(billing.approval);
    const entries = h.engine.record.repositories.map(({ name, kind, github, mainCheckoutPath, baseBranch, baseCommit }) => ({ name, kind, github, mainCheckoutPath, baseBranch, baseCommit }));
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.developmentAuthorization).toEqual(authorization);
    expect(record.billing!.executionId).toBe(record.executionId);
    expect(record.billing!.approval).toEqual(approval);
    expect(record.repositories).toMatchObject(entries);
  });

  it("keeps the repository entries' identity on a base start, naming only the new folder and base commit", async () => {
    const h = await landedThenStopped();
    const { name, kind, github, mainCheckoutPath, baseBranch } = h.engine.record.repositories[0]!;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.repositories).toMatchObject([{ name, kind, github, mainCheckoutPath, baseBranch }]);
  });

  it("carries a pending pause through a base start: it doesn't fire until its phase is done, then Kiln pauses before the next", async () => {
    const h = await landedThenStopped();
    h.engine.record.pause.requestedAt = new Date().toISOString();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    const calls = h.claudeCalls().length;
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    const launched = h.claudeCalls().slice(calls).map(call => call.prompt);
    // Phase 1 ran again first, and its Done did not fire the pause: Phase 2b, the pause's phase, launched after it.
    expect(launched[0]).toContain("phase-1-return-intake.md");
    expect(launched.some(prompt => prompt.includes("phase-2b-store-credit.md"))).toBe(true);
    expect(record.phases["2b"]!.doneAt).toBeDefined();
    expect(record.pause.activeSince).toBeDefined();
    expect(launched.some(prompt => prompt.includes("phase-3-returns-dashboard.md"))).toBe(false);
  });

  it("ends a pending pause on a base start when its phase is not still to run, and doesn't list it", async () => {
    const h = await landedThenStopped();
    h.engine.record.pause.requestedAt = new Date().toISOString();
    mergedWithClosed(h, ["phase-2b-store-credit.md"]);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h)).filter(line => line.startsWith("Kiln will pause"))).toEqual([]);
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.pause).toEqual({});
  });

  it("leaves a pending pause on an existing-branch start and names its phase in the list", async () => {
    const h = await landedThenStopped();
    const requestedAt = new Date().toISOString();
    h.engine.record.pause.requestedAt = requestedAt;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(panelOf(h).selected).toBe("branch");
    expect(lines(panelOf(h))).toContain("Kiln will pause after Phase 2b is Done");
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    // The stopped phase's done check still fails, so the request is still waiting on it.
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    expect(readPrdRecord(h.stateDirectory)!.pause).toEqual({ requestedAt });
  });

  it("leaves a takeover hold with the execution a base start archives, and says so in the list", async () => {
    const h = await landedThenStopped();
    const oldId = h.engine.record.executionId!;
    h.engine.record.liveControl = heldBy(h);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h))).toContain("End your terminal takeover and take control back");
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.liveControl).toBeUndefined();
    expect(h.engine.historicalExecution(oldId)!.record.liveControl?.takeover.target.executionId).toBe(oldId);
  });

  it.skipIf(process.platform !== "darwin")("ends a released takeover hold on an existing-branch start, as the explicit Resume", async () => {
    const h = await landedThenStopped();
    // The provider's registry of terminal sessions, which the release check reads: no terminal holds this conversation.
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    h.engine.record.liveControl = heldBy(h);
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(lines(panelOf(h))).toContain("End your terminal takeover and take control back");
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.liveControl).toBeUndefined();
    expect(h.engine.folderMissing).toBeUndefined();
  });
});

describe("the limits Start keeps, on the cases still open (AC-SAFE-03)", () => {
  it.skipIf(process.platform !== "darwin")("refuses an existing-branch start while a terminal still holds the session, keeping the hold and making no folder", async () => {
    const h = await landedThenStopped();
    const saved = h.engine.worktreePath;
    const hold = heldBy(h);
    h.engine.record.liveControl = hold;
    const sessions = join(h.env.CLAUDE_CONFIG_DIR!, "sessions");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, "owner.json"), JSON.stringify({ pid: process.pid, sessionId: hold.takeover.target.providerSessionId, procStart: await processStartTime(process.pid) }));
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(await start(h)).toMatchObject({ ok: false, status: 409, reason: "Exit Claude in your terminal before handing this conversation back to Kiln." });
    expect(existsSync(saved)).toBe(false);
    expect(h.engine.record.liveControl?.takeover.target).toEqual(hold.takeover.target);
    expect(h.engine.folderMissing).toBeDefined();
  });

  it("launches nothing on an existing-branch start without a billing approval, nor on the next while its hold stands", async () => {
    const h = await landedThenStopped();
    h.env.ANTHROPIC_API_KEY = "synthetic-folder-start-billing-canary";
    await h.engine.refreshBilling();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending);
    expect(h.engine.record.billing!.approval).toBeUndefined();
    landStoppedPhase(h);
    const saved = h.engine.worktreePath;
    const launches = h.claudeCalls().length;
    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    // 2b's done check passed, so the next launch is the one the billing check holds.
    expect(h.engine.record.phases["2b"]!.doneAt).toBeDefined();
    const hold = structuredClone(h.engine.record.billing!.hold);
    expect(hold).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(launches);

    rmSync(saved, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.billing!.hold).toEqual(hold);
    expect(h.claudeCalls()).toHaveLength(launches);
  });

  it("takes a base start's pause phase from the first unfinished leaf when nothing is stopped", async () => {
    const h = await landedThenStopped();
    const phase = h.engine.record.phases["2b"]!;
    delete phase.stop;
    phase.doneAt = new Date().toISOString();
    h.engine.record.pause.requestedAt = new Date().toISOString();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h))).toContain("Kiln will pause after Phase 3 is Done");
    const calls = h.claudeCalls().length;
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.pause).toMatchObject({ requestedFor: "3" });
    // It didn't fire at Phase 2b, which ran first.
    expect(h.claudeCalls().slice(calls).some(call => call.prompt.includes("phase-3-returns-dashboard.md"))).toBe(true);
  });

  it.each([PR_PHASE_KEY, "audit-delivery-1"])("ends a pending pause on a base start when the run stopped on an activity that isn't a phase of the new plan (%s)", async (activity) => {
    const h = await landedThenStopped();
    const phase = h.engine.record.phases["2b"]!;
    h.engine.record.phases[activity] = { sessionIds: [], repositories: {}, stop: phase.stop } as unknown as typeof phase;
    delete phase.stop;
    expect(h.engine.stoppedPhaseKey()).toBe(activity);
    h.engine.record.pause.requestedAt = new Date().toISOString();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(lines(panelOf(h)).filter(line => line.startsWith("Kiln will pause"))).toEqual([]);
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.pause).toEqual({});
  });

  it("pauses before the next phase when an existing-branch start's done check passes", async () => {
    const h = await landedThenStopped();
    landStoppedPhase(h);
    h.engine.record.pause.requestedAt = new Date().toISOString();
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    expect(lines(panelOf(h))).toContain("Kiln will pause after Phase 2b is Done");
    const calls = h.claudeCalls().length;
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.phases["2b"]!.doneAt).toBeDefined();
    expect(record.pause.activeSince).toBeDefined();
    expect(h.claudeCalls().slice(calls)).toEqual([]);
  });

  it("leaves the pause waiting when the stopped phase is closed on the branch but its done check still fails", async () => {
    const h = await landedThenStopped();
    // Closed and committed, never pushed: the phase's done check can't pass.
    landStoppedPhase(h, false);
    const requestedAt = new Date().toISOString();
    h.engine.record.pause.requestedAt = requestedAt;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    const calls = h.claudeCalls().length;
    expect(await start(h, { start: "branch" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.phases["2b"]!.doneAt).toBeUndefined();
    expect(record.pause).toEqual({ requestedAt });
    expect(h.claudeCalls().slice(calls).some(call => call.prompt.includes("phase-3-returns-dashboard.md"))).toBe(false);
  });

  it("clears a carried request's phase when the pause is cancelled", async () => {
    harness = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }, { actions: [{ result: "Phase 1 needs a decision too." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const requestedAt = new Date().toISOString();
    h.engine.record.pause.requestedAt = requestedAt;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    git(h.sandbox, h.repository, "worktree", "prune");
    git(h.sandbox, h.repository, "branch", "-D", "feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "--delete", "feature/customer-returns");
    await h.engine.folderGuard({ gather: true });
    expect(await start(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.record.pause).toEqual({ requestedAt, requestedFor: "2b" });
    expect(h.engine.cancelPause()).toEqual({ ok: true });
    expect(readPrdRecord(h.stateDirectory)!.pause).toEqual({});
  });

  it("carries a pending continuation authority into a base start's new execution", async () => {
    const h = await landedThenStopped();
    writePendingAuthority(h.stateDirectory, { formatVersion: 1, id: "authority-1", proposalId: "proposal-1", completedExecutionId: "completed-1", scopeDigest: "a".repeat(64), executionId: "reserved-1", authorization: { enabled: true, revision: 0, grants: [] }, approvals: [], state: "pending" });
    h.engine.record.pendingContinuationAuthority = "authority-1";
    const oldId = h.engine.record.executionId;
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    await h.engine.changeFolderPanel({ start: "base", fields: {} });
    expect(await start(h, { start: "base" })).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.executionId).not.toBe(oldId);
    expect(record.pendingContinuationAuthority).toBe("authority-1");
  });
});
