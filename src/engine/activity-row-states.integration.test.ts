// The row states AC-PICK-02 names that the other model-tier tests leave out (Kiln Phase Model
// Tiers, test audit batch 2), through the engine against real Git with the stand-in claude and
// gh: a started activity reads Running on and the choice it started on while it waits on a usage
// limit and while Pause now holds it; a finished activity with several sessions that got a
// response reads Ran on from the latest of them; in a run underway each planned audit and pull
// request row gives way to the allocated activity's row, never beside it; and an audit kind whose
// loops are used up gets no planned row.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import type { LocalServer } from "../server/local-server.js";
import { writeSessionRecord, type SessionRecord } from "../state/records.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { auditKey } from "../audit/workflow.js";
import type { Engine, EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
let server: LocalServer | undefined;
let release: (() => void) | undefined;
afterEach(async () => {
  release?.(); release = undefined;
  await server?.close(); server = undefined;
  await harness?.cleanup(); harness = undefined;
});

const DIRECTORY = "docs/prds/customer-returns";

/** The fixture documents with Phase 1 demanding, so its choice (Fable 5.1 · high) differs from every other tier's. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  files["phase-1-return-intake.md"] = files["phase-1-return-intake.md"]!.replace(/\n\n/, "\n\n**Model tier:** demanding — AC-RET-02 moves money on retries.\n\n");
  return files;
}

async function fixture(sessions: ScenarioSession[], engineOptions: Partial<EngineOptions> = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: tieredFiles(), engineOptions });
  const read = readPlanAt(harness.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  harness.engine.record.plan = recordedPlan(read.plan);
  harness.engine.modelChoicesChanged();
  await harness.engine.refreshAgents();
  return harness;
}

const rows = (engine: Engine): PhaseView[] => buildSnapshot(engine).activities ?? buildSnapshot(engine).phases;
const row = (engine: Engine, id: string): PhaseView => rows(engine).find(one => one.id === id)!;
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
const choiceOf = (view: PhaseView) => view.model?.choice ? [view.model.state, view.model.choice.agent, view.model.choice.modelName, view.model.choice.effort] : [view.model?.state];
/** Model defaults that would put Phase 1 on something else, if a started activity followed them. */
const moveDemanding = (h: Harness) => { writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } }); h.engine.modelChoicesChanged(); };

describe("Running on while a started activity waits on a usage limit (AC-PICK-02)", () => {
  it("reads Running on and the choice phase 1 started on, Claude Code · Fable 5.1 · high, through the wait", async () => {
    const now = () => new Date();
    const claude = new ScriptedClaude(now);
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    const reset = Math.floor(now().getTime() / 1000) + 3_600;
    // It responds, so it starts, then a usage limit refuses it.
    const refused: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Building the intake form." }, { write: { path: "src/partial.txt", content: "half done\n" } }, { refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] };
    const h = await fixture([refused, landingSession("src/one.txt")], { claude, now });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(claude.waiting).toBe(true);
    expect(h.engine.record.phases["1"]!.startedSessionId).toBe(h.engine.latestSession("1")!.sessionId);
    expect(flag(h.claudeCalls()[0]!.args, "--model")).toBe("fable");

    expect(row(h.engine, "1").state).toBe("waiting");
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
    // Model defaults changed during the wait don't move what the row says it runs on.
    moveDemanding(h);
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
  });
});

describe("Running on while Pause now holds a started activity (AC-PICK-02)", () => {
  it.skipIf(process.platform !== "darwin")("reads Running on and the choice phase 1 started on once the Pause now hold has paused it", async () => {
    const h = await fixture([]);
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const gate = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Running the refund tests." }, { runUntil: { command: "npm test -- src/refunds", file: gate } }, { text: "Answering the checkpoint." }, { bash: "echo after" }, { result: "" }] }, { actions: [{ result: "Continued." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    const hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    server = hosted.server; release = hosted.release;
    const origin = `http://127.0.0.1:${hosted.port}`;
    await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && h.engine.record.phases["1"]?.startedSessionId !== undefined);
    const target = h.engine.liveTarget()!;
    const accepted = await fetch(`${origin}/api/live/take-over`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: "pause", target }) });
    expect(accepted.status, JSON.stringify(await accepted.clone().json())).toBe(202);
    expect(((await accepted.json()) as { receipt: Receipt }).receipt.outcome).toBe("takeover_requested");
    writeFileSync(gate, "done");
    await h.engine.settled();
    await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.liveView()?.pauseNow?.phase === "paused"; }, 15_000);

    expect(flag(h.claudeCalls()[0]!.args, "--model")).toBe("fable");
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
    moveDemanding(h);
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
  }, 60_000);
});

describe("Ran on from the latest of several sessions that got a response, in this execution (AC-PICK-02)", () => {
  it("names the latest responding session's recorded agent, model and effort, not the first's, and skips a later one that got none", async () => {
    // Phase 1's first session responds and stops for a person; a carry-on session finishes it.
    const h = await fixture([{ noTranscript: true, actions: [{ text: "Building." }, { write: { path: "src/partial.txt", content: "half\n" } }, { commit: "wip: intake" }, { result: "Blocked: waiting on the import." }] }, landingSession("src/one.txt")]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const answer = h.engine.commands.submit({ command_id: "carry-1", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "carry-on", inputs: { message: "The import is merged." } }, "caller", true);
    expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
    await h.engine.commands.settled();
    // Phase 2b then has no scenario session and stops; only phase 1 matters here.
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    const [first, second] = h.engine.phaseSessions("1");
    expect(h.engine.phaseSessions("1")).toHaveLength(2);
    expect(first!.firstResponseAt).toBeDefined();
    expect(second!.firstResponseAt).toBeDefined();
    // The first session's record names another choice, so the row tells the two apart.
    writeSessionRecord(h.stateDirectory, { ...first!, model: "claude-opus-5-5", initModel: "claude-opus-5-5", modelDisplayName: "Opus 5.5", effort: "medium" });
    expect(choiceOf(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "Fable 5.1", "high"]);
    expect(row(h.engine, "1").model?.choice?.model).toBe("claude-fable-5-1");

    // A later session that never got a response doesn't count.
    const silent: SessionRecord = { ...second!, sessionId: "silent-after", model: "claude-haiku-5-5", initModel: "claude-haiku-5-5", modelDisplayName: "Haiku 5.5", effort: "low", runs: [{ startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), cause: "launch" }] };
    delete silent.firstResponseAt;
    writeSessionRecord(h.stateDirectory, silent);
    h.engine.record.phases["1"]!.sessionIds.push("silent-after");
    expect(choiceOf(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "Fable 5.1", "high"]);

    // The latest responding session's record is what the row reads.
    writeSessionRecord(h.stateDirectory, { ...second!, model: "claude-sonnet-5-5", initModel: "claude-sonnet-5-5", modelDisplayName: "Sonnet 5.5", effort: "low" });
    expect(choiceOf(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "Sonnet 5.5", "low"]);
  }, 60_000);
});

describe("a planned row gives way to the allocated activity's (AC-PICK-02)", () => {
  const proofDirectory = "docs/prds/proof";
  const proofFiles = {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  /** A session held at `name` until the test writes `name-go`. */
  const held = (root: string, name: string, actions: Record<string, unknown>[], before: Record<string, unknown>[] = []) => ({ actions: [...before, { touch: join(root, name) }, { waitForFile: join(root, `${name}-go`) }, ...actions] });

  it("shows each planned audit and pull request row until Kiln allocates it, then the allocated row once in its place", { timeout: 120_000 }, async () => {
    const h = harness = await createHarness({ folder: "proof", files: proofFiles, sessions: [], auditCycles: true });
    h.useGithubOrigin();
    writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
    const root = h.sandbox.root;
    const audit = [{ auditReport: {} }, { result: "Audit ended." }, { exit: 0 }];
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [held(root, "pr", pullRequestSession().actions)], auditSessions: [held(root, "delivery", audit, [{ text: "Auditing delivery." }]), held(root, "test", audit, [{ text: "Auditing tests." }])] }));
    const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
    server = hosted.server; release = hosted.release;
    expect(proofDirectory).toBe(h.engine.record.prdDirectory);

    const shown = () => rows(h.engine).map(one => [one.id, one.kind, !!one.plannedActivity]);
    const auditRowId = (kind: string) => auditKey(h.engine.record.completionAudits!.activities.find(one => one.kind === kind)!);
    await h.engine.start({ refinementConfirmed: true });

    // The delivery audit is allocated and running: its row stands where the planned one was; the test audit and pull request are still planned.
    await waitFor(() => existsSync(join(root, "delivery")));
    const delivery = auditRowId("delivery_audit");
    expect(shown().filter(([, kind]) => kind === "delivery_audit")).toEqual([[delivery, "delivery_audit", false]]);
    expect(shown().filter(([, , planned]) => planned)).toEqual([["planned-test-audit", "test_audit", true], ["planned-pull-request", "final_delivery", true]]);
    // It has had a response, so it has started: Running on and the Audits choice it started on.
    await waitFor(() => h.engine.record.phases[delivery]?.startedSessionId !== undefined);
    expect(choiceOf(row(h.engine, delivery))).toEqual(["running_on", "Claude Code", "Opus 5.5", "high"]);
    // Rows that aren't phases carry no tier tag (AC-TIER-02): the allocated delivery audit and the planned test audit and pull request.
    for (const id of [delivery, "planned-test-audit", "planned-pull-request"]) expect(row(h.engine, id).tier).toBeUndefined();
    writeFileSync(join(root, "delivery-go"), "");

    // The test audit is allocated: no planned test audit row beside it; only the pull request is planned.
    await waitFor(() => existsSync(join(root, "test")));
    const test = auditRowId("test_audit");
    expect(shown().filter(([, kind]) => kind === "test_audit")).toEqual([[test, "test_audit", false]]);
    expect(shown().filter(([, kind]) => kind === "delivery_audit")).toEqual([[delivery, "delivery_audit", false]]);
    expect(shown().filter(([, , planned]) => planned)).toEqual([["planned-pull-request", "final_delivery", true]]);
    await waitFor(() => h.engine.record.phases[test]?.startedSessionId !== undefined);
    expect(choiceOf(row(h.engine, test))).toEqual(["running_on", "Claude Code", "Opus 5.5", "high"]);
    expect(row(h.engine, test).tier).toBeUndefined();
    // The finished delivery audit reads Ran on and its session's recorded agent, model and effort.
    expect(h.engine.record.phases[delivery]!.doneAt).toBeDefined();
    expect(choiceOf(row(h.engine, delivery))).toEqual(["ran_on", "Claude Code", "Opus 5.5", "high"]);
    writeFileSync(join(root, "test-go"), "");

    // The pull request session is allocated: its one row replaces the planned one, and nothing is planned.
    await waitFor(() => existsSync(join(root, "pr")));
    const ids = rows(h.engine).map(one => one.id);
    expect(ids.filter(id => id === "pr")).toEqual(["pr"]);
    expect(ids).not.toContain("planned-pull-request");
    expect(rows(h.engine).filter(one => one.plannedActivity)).toEqual([]);
    expect(row(h.engine, "pr").tier).toBeUndefined();
    expect(choiceOf(row(h.engine, test))).toEqual(["ran_on", "Claude Code", "Opus 5.5", "high"]);
    writeFileSync(join(root, "pr-go"), "");
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    // Once the run is complete both audit rows still read Ran on from their recorded sessions.
    for (const key of [delivery, test]) {
      const ran = h.engine.latestSession(key)!;
      expect([ran.agentId ?? "claude_code", ran.modelDisplayName, ran.effort]).toEqual(["claude_code", "Opus 5.5", "high"]);
      expect(choiceOf(row(h.engine, key))).toEqual(["ran_on", "Claude Code", "Opus 5.5", "high"]);
    }
  });
});

describe("a closed audit kind has no planned row (AC-PICK-02)", () => {
  it.each([
    ["test", { deliveryLimit: 4, testLimit: 1 }, [["planned-delivery-audit", "delivery_audit"], ["planned-pull-request", "final_delivery"]]],
    ["delivery", { deliveryLimit: 1, testLimit: 4 }, [["planned-test-audit", "test_audit"], ["planned-pull-request", "final_delivery"]]],
  ] as const)("leaves out the %s audit once its loops reach the limit in force", async (kind, limits, expected) => {
    const h = await fixture([{ actions: [{ text: "Working." }, { waitForFile: "release-closed" }, { result: "Stopped." }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.record.phases["1"]?.startedSessionId !== undefined);
    // Both kinds are still due at first.
    expect(rows(h.engine).filter(one => one.plannedActivity).map(one => one.id)).toEqual(["planned-delivery-audit", "planned-test-audit", "planned-pull-request"]);
    // One loop of the kind has run, and the limit in force is one.
    h.engine.record.settings.auditLoops = { ...limits };
    h.engine.record.auditLoops!.loops.push({ kind, number: 1, startedAt: new Date().toISOString(), activityKey: `${kind}-audit-earlier` });
    expect(rows(h.engine).filter(one => one.plannedActivity).map(one => [one.id, one.kind])).toEqual(expected);
    writeFileSync(`${h.engine.worktreePath}/release-closed`, "go");
    await h.engine.settled();
  });
});
