// Agent compatibility through the real engine (kiln-public-release-readiness Phase 1):
// AC-AGENT-04, a Codex history schema change becomes one compatibility notice naming the
// session's Codex version, without stopping the rest of the read; AC-AGENT-05, Claude Code
// below its minimum starts and resumes no session, and an unselected agent's version blocks nothing.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { readPrdRecord, writeSessionRecord } from "../state/records.js";

let h: Harness | undefined;
let work: ReturnType<typeof codexWorkFixture> | undefined;
let history: ReturnType<typeof historyFixture> | undefined;
afterEach(async () => {
  await h?.cleanup(); h = undefined;
  await work?.sandbox.cleanup(); work = undefined;
  await history?.sandbox.cleanup(); history = undefined;
});

const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "test-development" };
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 24, 12, 0, seconds)).toISOString();
const CLAUDE_TOO_OLD = "Claude Code 2.1.310 is older than Kiln supports. Install Claude Code 2.1.311 or later: claude update";
const CODEX_TOO_OLD = "Codex 0.162.0 is older than Kiln supports. Install Codex 0.162.1 or later: codex update";
/** A phase session that ends without landing, so the phase stops with its conversation kept. */
const stoppingSession = { actions: [{ result: "Saved work." }] };
const PARAMETER_DETAIL = "exec_command parameter environment_id is not recognised, so that command has no receipt";

/** A Claude-selected engine whose agent metadata has been read with the stand-in at `version`. */
async function claudeReady(h: Harness, version: string) {
  h.env.KILN_STANDIN_VERSION = version;
  await h.engine.agents.refresh(); await h.engine.refreshBilling();
  await waitFor(() => !h.engine.agents.state.pending);
}

describe("Codex command evidence compatibility notice (AC-AGENT-04)", () => {
  it("records one codex_history notice naming the session's Codex version, keeps the clean receipt, and clears it only on another version", async () => {
    h = await createHarness({ sessions: [], claude: join("missing", "claude") });
    // A real Codex session through the engine, launched by a Codex reporting 0.167.0.
    work = codexWorkFixture(); Object.assign(h.tools, { codex: work.options.executable }); work.configureEnvironment(h.env);
    work.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, version: "0.167.0" }); h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
    expect(await h.engine.changeSettings({ agentId: "codex" })).toMatchObject({ ok: true }); await h.engine.agents.refresh();
    expect(await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target, confirmedTarget: target, confirmedNonProduction: true }] } })).toMatchObject({ ok: true });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.record.developmentAuthorization?.enabled).toBe(true);
    const session = h.engine.latestSession("1")!;
    expect(session.agentId).toBe("codex");
    expect(session.runs.at(-1)!.codex!.profile.version).toBe("0.167.0");
    const threadId = session.conversation!.threadId!; const codexHome = session.conversation!.codexHome!;
    const cwd = h.engine.workingDirectoryOf(session);
    expect(h.engine.record.compatibility).toBeUndefined();

    // The thread's history as a newer Codex writes it: one exec_command carrying a parameter Kiln
    // doesn't recognise, one clean call. Read through the history peer, as `codex app-server` serves it.
    history = historyFixture();
    const thread = history.addThread(threadId);
    const rawPath = join(codexHome, "sessions", `rollout-${threadId}-history.jsonl`); mkdirSync(join(codexHome, "sessions"), { recursive: true });
    Object.assign(h.tools, { codex: history.options.executable }); h.env.KILN_CODEX_HISTORY_FIXTURE = history.options.env!.KILN_CODEX_HISTORY_FIXTURE;
    const commands = { flagged: "node verify.mjs remote", clean: "node verify.mjs local" };
    const writeHistory = (flagged: Record<string, unknown>) => {
      const turnId = `${threadId}-turn-0`; const turn = { internal_chat_message_metadata_passthrough: { turn_id: turnId } };
      const raw: unknown[] = [
        { type: "session_meta", timestamp: at(0), payload: { id: threadId } },
        { type: "world_state", timestamp: at(0), payload: { full: true, state: { environments: { environments: { local: { shell: "zsh" } } } } } },
        { type: "event_msg", timestamp: at(0), payload: { type: "task_started", turn_id: turnId } },
        { type: "turn_context", timestamp: at(0), payload: { turn_id: turnId, cwd, model: "gpt-6.1-sol", effort: "high" } },
      ];
      const items: Record<string, unknown>[] = [];
      ([["flagged", { cmd: commands.flagged, ...flagged }], ["clean", { cmd: commands.clean }]] as const).forEach(([id, input], i) => {
        raw.push({ type: "response_item", timestamp: at(1 + i * 3), payload: { type: "function_call", name: "exec_command", call_id: id, arguments: JSON.stringify(input), ...turn } });
        raw.push({ type: "event_msg", timestamp: at(2 + i * 3), payload: { type: "item_completed", thread_id: threadId, turn_id: turnId, started_at_ms: Date.parse(at(1 + i * 3)) + 10, item: { type: "CommandExecution", id: `${id}-native`, command: ["/bin/zsh", "-lc", input.cmd], cwd, status: "completed" } } });
        items.push({ type: "commandExecution", id: `${id}-native`, status: "completed", exitCode: 0, aggregatedOutput: `${id} output` });
      });
      raw.push({ type: "event_msg", timestamp: at(9), payload: { type: "task_complete", turn_id: turnId } });
      writeFileSync(rawPath, raw.map(one => JSON.stringify(one)).join("\n") + "\n");
      thread.metadata.path = rawPath; thread.turns = [{ id: turnId, status: "completed", itemsView: "full", items }]; history!.save();
    };
    const cleanReceipt = expect.objectContaining({ sessionId: session.sessionId, id: "clean-native", command: commands.clean, cwd: expect.any(String), calledAt: at(4), resultAt: at(5) });
    const notice = { feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: PARAMETER_DETAIL, observedAt: expect.any(String) };
    const line = `Codex command evidence unavailable with Codex 0.167.0: ${PARAMETER_DETAIL}`;

    writeHistory({ environment_id: "remote-sandbox" });
    const flaggedRead = await h.engine.deliveryReadStatus();
    expect(flaggedRead).not.toHaveProperty("commandEvidenceError");
    // The rest of the run keeps working: the clean call keeps its receipt, the flagged one has none.
    expect(flaggedRead.availableCommandEvidence).toEqual([cleanReceipt]);
    expect(h.engine.record.compatibility).toEqual([notice]);
    expect(readPrdRecord(h.stateDirectory)!.compatibility).toEqual([notice]);
    expect(buildSnapshot(h.engine).compatibility).toEqual([line]);
    // The detail names the parameter, never its value.
    expect(JSON.stringify(h.engine.record.compatibility)).not.toContain("remote-sandbox");

    // A clean read of a session still on 0.167.0 keeps the notice.
    writeHistory({});
    const sameVersion = await h.engine.deliveryReadStatus();
    expect(sameVersion.availableCommandEvidence).toEqual([expect.objectContaining({ id: "flagged-native", command: commands.flagged }), cleanReceipt]);
    expect(h.engine.record.compatibility).toEqual([notice]);
    expect(readPrdRecord(h.stateDirectory)!.compatibility).toEqual([notice]);
    expect(buildSnapshot(h.engine).compatibility).toEqual([line]);

    // The same session's latest launch profile now on 0.168.0: a clean read removes the notice.
    const relaunched = h.engine.latestSession("1")!; relaunched.runs.at(-1)!.codex!.profile.version = "0.168.0";
    writeSessionRecord(h.stateDirectory, relaunched);
    const otherVersion = await h.engine.deliveryReadStatus();
    expect(otherVersion.availableCommandEvidence).toHaveLength(2);
    expect(h.engine.record.compatibility).toBeUndefined();
    expect(readPrdRecord(h.stateDirectory)!.compatibility).toBeUndefined();
    expect(buildSnapshot(h.engine)).not.toHaveProperty("compatibility");
  });
});

describe("outdated Claude Code starts no session (AC-AGENT-05)", () => {
  it("refuses Start at 2.1.310 with the version reason and starts at 2.1.312", async () => {
    h = await createHarness({ sessions: [stoppingSession] });
    await claudeReady(h, "2.1.310 (Claude Code)");
    expect(h.engine.agents.state.blockers).toContain(CLAUDE_TOO_OLD);
    expect(h.engine.selectionError).toContain(CLAUDE_TOO_OLD);
    const refused = await h.engine.start({ refinementConfirmed: true });
    expect(refused).toMatchObject({ ok: false }); expect((refused as { reason: string }).reason).toContain(CLAUDE_TOO_OLD);
    expect(h.engine.record.startedAt).toBeUndefined();
    expect(h.claudeCalls()).toEqual([]);

    await claudeReady(h, "2.1.312 (Claude Code)");
    expect(h.engine.agents.state.blockers).not.toContain(CLAUDE_TOO_OLD);
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("reads the version again at launch: a downgrade after the readiness read starts no session", async () => {
    h = await createHarness({ sessions: [stoppingSession] });
    await claudeReady(h, "2.1.312 (Claude Code)");
    expect(h.engine.selectionError).toBeUndefined();
    h.env.KILN_STANDIN_VERSION = "2.1.310 (Claude Code)";
    const result = await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.claudeCalls()).toEqual([]);
    expect(h.engine.record.startedAt).toBeUndefined();
    // The browser's readiness line and Model field name the version read at launch …
    const settings = buildSnapshot(h.engine).settings;
    expect(settings.readinessErrors).toContain(CLAUDE_TOO_OLD);
    expect(settings.fieldErrors.model).toContain(CLAUDE_TOO_OLD);
    // … and so does Start's own refusal, rather than a billing reason.
    expect(result).toMatchObject({ ok: false }); expect((result as { reason: string }).reason).toContain(CLAUDE_TOO_OLD);
  });

  it("holds Resume of a stopped conversation once Claude Code is below its minimum, starting no new run", async () => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Saved work." }] }, landingSession()] });
    await claudeReady(h, "2.1.312 (Claude Code)");
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    const stopped = h.engine.latestSession("1")!;
    expect(h.engine.record.phases["1"]!.stop).toBeDefined();

    h.env.KILN_STANDIN_VERSION = "2.1.310 (Claude Code)";
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.latestSession("1")!.sessionId).toBe(stopped.sessionId);
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    expect(h.engine.record.billing!.hold).toMatchObject({ phaseKey: "1", action: "resume", sessionId: stopped.sessionId });
    expect(h.engine.record.billing!.hold!.reason).toContain(CLAUDE_TOO_OLD);
    // Shown as the selected agent's readiness and in the terminal's billing-hold message.
    expect(buildSnapshot(h.engine).settings.readinessErrors).toContain(CLAUDE_TOO_OLD);
    expect(h.events).toContainEqual(expect.objectContaining({ kind: "message", text: expect.stringContaining(CLAUDE_TOO_OLD) }));

    // Back on a supported version, the same conversation resumes.
    h.env.KILN_STANDIN_VERSION = "2.1.312 (Claude Code)";
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    // The landing resume closes phase 1; the final pull request session may follow it.
    expect(h.claudeCalls()[1]!.args).toEqual(expect.arrayContaining(["--resume", stopped.sessionId]));
    expect(h.engine.latestSession("1")!.sessionId).toBe(stopped.sessionId);
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "person_resume" });
  });
});

describe("an unselected agent's version blocks nothing (AC-AGENT-05)", () => {
  it("Codex selected: Claude Code 2.1.310 adds no blocker", async () => {
    h = await createHarness({ sessions: [] }); const codex = installCodexMetadataFixture(h.sandbox);
    Object.assign(h.tools, { codex: codex.executable }); h.env.KILN_CODEX_METADATA = codex.env.KILN_CODEX_METADATA;
    h.env.KILN_STANDIN_VERSION = "2.1.310 (Claude Code)";
    // Claude selected, the same stand-in blocks: the version reading is live, not ignored.
    await h.engine.agents.refresh();
    expect(h.engine.agents.state.blockers).toContain(CLAUDE_TOO_OLD);
    expect(await h.engine.changeSettings({ agentId: "codex" })).toMatchObject({ ok: true });
    await h.engine.agents.refresh(); await waitFor(() => !h!.engine.agents.state.pending);
    expect(h.engine.agents.state.agentId).toBe("codex");
    expect(h.engine.agents.state.blockers.join(" ")).not.toContain("Claude Code");
    expect(h.engine.agents.state.blockers).toEqual([]);
    expect(h.engine.selectionError).toBeUndefined();
  });

  it("Claude selected: Codex 0.162.0 adds no blocker, and the Claude session starts", async () => {
    h = await createHarness({ sessions: [stoppingSession] }); const codex = installCodexMetadataFixture(h.sandbox);
    Object.assign(h.tools, { codex: codex.executable }); h.env.KILN_CODEX_METADATA = codex.env.KILN_CODEX_METADATA;
    codex.set({ version: "0.162.0" });
    // Codex selected, the same fixture blocks: the version reading is live, not ignored.
    expect(await h.engine.changeSettings({ agentId: "codex" })).toMatchObject({ ok: true });
    await h.engine.agents.refresh(); await waitFor(() => !h!.engine.agents.state.pending);
    expect(h.engine.agents.state.blockers).toContain(CODEX_TOO_OLD);
    expect(await h.engine.changeSettings({ agentId: "claude_code" })).toMatchObject({ ok: true });
    await claudeReady(h, "2.1.312 (Claude Code)");
    expect(h.engine.agents.state.agentId).toBe("claude_code");
    expect(h.engine.agents.state.blockers.join(" ")).not.toContain("Codex");
    expect(h.engine.agents.state.blockers).toEqual([]);
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.agents.state.blockers.join(" ")).not.toContain("Codex");
  });
});
