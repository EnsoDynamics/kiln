// Kiln Planned Test Fix Batches through the engine against real Git, the stand-in claude and gh,
// the local controller and the built command line: a test audit's planned batches are rows as soon
// as it ends (AC-BATCH-01), its row says what it found and planned (AC-BATCH-02), each batch reads
// as AC-BATCH-03's table says, the rows not started follow the plan and go when it ends
// (AC-BATCH-04), a plan of none reads as sessions (AC-BATCH-05), every loop is named with its
// maximum (AC-MAX-01), and `kiln status` reports the plan in text and JSON (AC-BOT-01). Needs
// `dist/` (npm run build).
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import type { LocalServer } from "../server/local-server.js";
import { auditKey } from "../audit/workflow.js";
import { positionText } from "../audit/audit-names.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let h: Harness | undefined; let server: LocalServer | undefined; let release: (() => void) | undefined;
afterEach(async () => { await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined; });

const directory = "docs/prds/proof";
const files = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
  "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
};

/** `auditSessions` is called once the harness exists, so a held session can name its files. */
async function fixture(auditSessions: () => unknown[], sessions: () => unknown[] = () => [pullRequestSession()]): Promise<Harness> {
  h = await createHarness({ folder: "proof", files, sessions: [], auditCycles: true });
  h.useGithubOrigin();
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: sessions(), auditSessions: auditSessions() }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  return h;
}
const audit = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
/** An audit session held at `name` until the test writes `name-go`, then reporting `behavior`. */
const held = (name: string, behavior: Record<string, unknown> = {}) => ({ actions: [{ text: "Fixing tests." }, { touch: join(h!.sandbox.root, name) }, { waitForFile: join(h!.sandbox.root, `${name}-go`) }, { auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
const go = (name: string) => writeFileSync(join(h!.sandbox.root, `${name}-go`), "");
const reached = (name: string) => waitFor(() => existsSync(join(h!.sandbox.root, name)), 60_000);
const batches = (...lists: string[][]) => lists.map(criteria => ({ criteria }));

const rows = (): PhaseView[] => buildSnapshot(h!.engine).activities!;
const shown = () => rows().map(row => [row.title, row.file, row.state]);
const testAudits = () => h!.engine.record.completionAudits!.activities.filter(one => one.kind === "test_audit");

async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h!.sandbox.root, env: h!.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 20_000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(watchdog));
  expect(stderr).toBe(""); expect(code, stdout).toBe(0);
  return stdout;
}
const target = () => join(h!.repository, directory);

describe("a test audit's planned batches (AC-BATCH-01 to AC-BATCH-04, AC-MAX-01, AC-BOT-01)", () => {
  it("shows every batch as a row once the audit ends, names each, and reports them in kiln status", { timeout: 180_000 }, async () => {
    // The test audit plans two batches; the first session re-cuts what it leaves into two; the second leaves the last; the third passes.
    await fixture(() => [
      audit(),
      held("audit", { continueTest: true, fixBatches: batches(["AC-A", "AC-B"], ["AC-C"]) }),
      held("fix1", { continueTest: true, fixBatches: batches(["AC-C1"], ["AC-C2"]) }),
      held("fix2", { continueTest: true, fixBatches: batches(["AC-C2"]) }),
      held("fix3"),
    ]);
    await h!.engine.start({ refinementConfirmed: true });

    // While the audit runs, its row and the terminal's started line name the loop alone, and the planned Test audit row is gone.
    await reached("audit");
    const testAudit = auditKey(testAudits()[0]!);
    expect(rows().find(row => row.id === testAudit)).toMatchObject({ title: "Test audit", file: "Loop 1 · max 4" });
    expect(positionText(buildSnapshot(h!.engine).auditLoops!.position!)).toBe("Test audit loop 1 · max 4");
    // The PRD's Audits choice changes before the audit ends; the batch rows will read it.
    expect(await h!.engine.changeModel("audits", { agentId: "claude_code", model: "sonnet", effort: "low" })).toEqual({ ok: true });
    go("audit");

    // The audit has ended: both batches are rows at once, in order, the first running and the second Planned.
    await reached("fix1");
    const auditId = testAudits()[0]!.activityId;
    const first = auditKey(testAudits()[1]!);
    expect(shown().slice(-4)).toEqual([
      ["Test audit", "Loop 1 · max 4 · found 3 test gaps and planned them as 2 batches", "done"],
      ["Fixing tests", "Batch 1 of 2 from test audit loop 1 · 2 gaps", "implementing"],
      ["Fixing tests", "Batch 2 of 2 from test audit loop 1 · 1 gap", "planned"],
      ["Pull request", "", "planned"],
    ]);
    const waiting = rows().find(row => row.id === `audit-batch-${auditId}-2`)!;
    expect(waiting).toMatchObject({ kind: "test_audit", plannedActivity: true, fixing: { loop: 1, session: 2, batch: { number: 2, of: 2, gaps: 1 } } });
    // It reads Will run on with the Audits choice and offers Change, as the planned Test audit row did, with no details or timing.
    expect(waiting.model).toMatchObject({ state: "will_run_on", change: { available: true } });
    expect([waiting.model?.choice?.modelName, waiting.model?.choice?.effort, waiting.model?.from]).toEqual(["Sonnet 5.5", "low", "changed"]);
    expect(waiting.details).toBeUndefined(); expect(waiting.timing).toBeUndefined();
    expect(rows().map(row => row.id)).not.toContain("planned-test-audit");
    expect(rows().find(row => row.id === first)!.fixing).toEqual({ loop: 1, session: 1, batch: { number: 1, of: 2, gaps: 2 } });
    // The phase count counts phases only.
    expect(buildSnapshot(h!.engine).feature).toMatchObject({ phasesDone: 1, phasesTotal: 1 });
    // The status line names the batch.
    const position = buildSnapshot(h!.engine).auditLoops!.position!;
    expect(position).toMatchObject({ audit: "test", loop: 1, fixing: true, batch: { number: 1, of: 2 } });
    expect(positionText(position)).toBe("Fixing tests · batch 1 of 2 from test audit loop 1");

    // kiln status reports each batch with its number, the plan's count, its gaps and whether it has started or finished.
    const json = JSON.parse(await cli(["status", target(), "--json"])) as { progress: { key: string; label: string; title: string; state: string; fixing?: unknown; model: unknown }[]; audit_loops: { position: unknown } };
    expect(json.progress.slice(-3).map(row => [row.label, row.title, row.state, row.fixing ?? null])).toEqual([
      ["Test audit", "Loop 1 · max 4 · found 3 test gaps and planned them as 2 batches", "complete", null],
      ["Fixing tests", "Batch 1 of 2 from test audit loop 1 · 2 gaps", "running", { loop: 1, session: 1, batch: { number: 1, of: 2, gaps: 2 } }],
      ["Fixing tests", "Batch 2 of 2 from test audit loop 1 · 1 gap", "planned", { loop: 1, session: 2, batch: { number: 2, of: 2, gaps: 1 } }],
    ]);
    expect(json.progress.at(-1)!.key).toBe(`audit-batch-${auditId}-2`);
    expect(json.progress.at(-1)!.model).toMatchObject({ state: "will_run_on" });
    expect(json.audit_loops.position).toMatchObject({ batch: { number: 1, of: 2 } });
    const text = await cli(["status", target()]);
    expect(text).toMatch(/Fixing tests +Batch 1 of 2 from test audit loop 1 · 2 gaps +running\n/);
    expect(text).toMatch(/Fixing tests +Batch 2 of 2 from test audit loop 1 · 1 gap +planned\n/);
    expect(text).toContain("Fixing tests · batch 1 of 2 from test audit loop 1\nAudit loops: delivery 1 (max 4) · test 1 (max 4)\n");
    expect(text).not.toMatch(/loop \d+ of \d+/i);
    go("fix1");

    // The first session left two batches where one was left: N is 3 on every row, the finished one included.
    await reached("fix2");
    expect(shown().slice(-5, -1)).toEqual([
      ["Test audit", "Loop 1 · max 4 · found 3 test gaps and planned them as 2 batches", "done"],
      ["Fixing tests", "Batch 1 of 3 from test audit loop 1 · 2 gaps", "done"],
      ["Fixing tests", "Batch 2 of 3 from test audit loop 1 · 1 gap", "implementing"],
      ["Fixing tests", "Batch 3 of 3 from test audit loop 1 · 1 gap", "planned"],
    ]);
    expect(positionText(buildSnapshot(h!.engine).auditLoops!.position!)).toBe("Fixing tests · batch 2 of 3 from test audit loop 1");
    // kiln status: a finished, a running and a waiting batch, each with its number, the plan's count, its gaps and its state.
    const three = JSON.parse(await cli(["status", target(), "--json"])) as typeof json;
    expect(three.progress.slice(-3).map(row => [row.state, row.fixing])).toEqual([
      ["complete", { loop: 1, session: 1, batch: { number: 1, of: 3, gaps: 2 } }],
      ["running", { loop: 1, session: 2, batch: { number: 2, of: 3, gaps: 1 } }],
      ["planned", { loop: 1, session: 3, batch: { number: 3, of: 3, gaps: 1 } }],
    ]);
    expect(await cli(["status", target()])).toMatch(/Fixing tests +Batch 1 of 3 from test audit loop 1 · 2 gaps +complete\n[^]*Batch 3 of 3 from test audit loop 1 · 1 gap +planned\n/);
    go("fix2");

    // The last batch runs; nothing is left waiting.
    await reached("fix3");
    expect(rows().filter(row => row.plannedActivity && row.fixing)).toEqual([]);
    expect(shown().slice(-2, -1)).toEqual([["Fixing tests", "Batch 3 of 3 from test audit loop 1 · 1 gap", "implementing"]]);
    go("fix3");
    await h!.engine.settled();
    expect(h!.engine.record.completedAt).toBeDefined();
    // The finished batches keep the plan's last count.
    expect(rows().filter(row => row.fixing).map(row => row.file)).toEqual(["Batch 1 of 3 from test audit loop 1 · 2 gaps", "Batch 2 of 3 from test audit loop 1 · 1 gap", "Batch 3 of 3 from test audit loop 1 · 1 gap"]);
    // The pull request description's Closing audits sentence names each limit as a maximum.
    const pullRequestPrompt = h!.claudeCalls().findLast(call => call.prompt.includes("## Closing audits"))!.prompt;
    expect(pullRequestPrompt).toContain("Delivery audit: 1 loop (max 4). Test audit: 1 loop (max 4).");
  });

  it("removes the rows not started when a session ends the test work, and reads a plan of none as sessions (AC-BATCH-04, AC-BATCH-05)", { timeout: 180_000 }, async () => {
    await fixture(() => [
      audit(),
      audit({ continueTest: true }),
      held("session1", { continueTest: true, fixBatches: batches(["AC-A"], ["AC-B"]) }),
      held("batch1"),
    ], () => [{ actions: [{ touch: join(h!.sandbox.root, "pr") }, { waitForFile: join(h!.sandbox.root, "pr-go") }, ...pullRequestSession().actions] }]);
    await h!.engine.start({ refinementConfirmed: true });
    // An audit with no plan: its session reads as today, and nothing waits.
    await reached("session1");
    expect(shown().slice(-3, -1)).toEqual([["Test audit", "Loop 1 · max 4", "done"], ["Fixing tests", "From test audit loop 1 · session 1", "implementing"]]);
    expect(positionText(buildSnapshot(h!.engine).auditLoops!.position!)).toBe("Fixing tests from test audit loop 1");
    go("session1");
    // The session left two batches: numbered on from its place in the chain, the first runs and the second waits.
    await reached("batch1");
    expect(shown().slice(-3, -1)).toEqual([["Fixing tests", "Batch 2 of 3 from test audit loop 1 · 1 gap", "implementing"], ["Fixing tests", "Batch 3 of 3 from test audit loop 1 · 1 gap", "planned"]]);
    // The batch passes and ends the test work with a batch not started: its row is removed while the run goes on.
    go("batch1");
    await reached("pr");
    expect(h!.engine.record.completedAt).toBeUndefined();
    expect(rows().filter(row => row.plannedActivity && row.fixing)).toEqual([]);
    const status = JSON.parse(await cli(["status", target(), "--json"])) as { progress: { state: string }[] };
    expect(status.progress.filter(row => row.state === "planned")).toEqual([]);
    go("pr");
    await h!.engine.settled();
    expect(h!.engine.record.completedAt).toBeDefined();
    expect(rows().filter(row => row.plannedActivity)).toEqual([]);
    expect(rows().filter(row => row.fixing).map(row => row.file)).toEqual(["From test audit loop 1 · session 1", "Batch 2 of 3 from test audit loop 1 · 1 gap"]);
  });

  it("sits the batches after the phases a delivery audit adds and before the pull request, and keeps them through it when the test kind is closed (AC-BATCH-01, AC-BATCH-04)", { timeout: 180_000 }, async () => {
    await fixture(() => [
      audit(),
      // The only test loop: it changed implementation and planned two batches, so a delivery audit runs first.
      audit({ directFix: true, continueTest: true, fixBatches: batches(["AC-A"], ["AC-B"]) }),
      held("delivery2", { gap: true }),
      audit(),
      audit(),
    ], () => [{ actions: [{ touch: join(h!.sandbox.root, "phase2") }, { waitForFile: join(h!.sandbox.root, "phase2-go") }, ...landingSession(`${directory}/value.mjs`, files["value.mjs"]).actions] }, pullRequestSession()]);
    h!.engine.record.settings.auditLoops = { deliveryLimit: 4, testLimit: 1 };
    await h!.engine.start({ refinementConfirmed: true });
    await reached("delivery2");
    expect(shown().slice(-4)).toEqual([
      ["Delivery audit", "Loop 2 · max 4", "implementing"],
      ["Fixing tests", "Batch 1 of 2 from test audit loop 1 · 1 gap", "planned"],
      ["Fixing tests", "Batch 2 of 2 from test audit loop 1 · 1 gap", "planned"],
      ["Pull request", "", "planned"],
    ]);
    go("delivery2");
    // The delivery audit added phase 2: its row, then the batches, then the pull request.
    await reached("phase2");
    expect(rows().slice(-4).map(row => [row.id.startsWith("audit-batch-") ? "batch" : row.id, row.state])).toEqual([["2", "implementing"], ["batch", "planned"], ["batch", "planned"], ["planned-pull-request", "planned"]]);
    expect(rows().map(row => row.id)).not.toContain("planned-test-audit");
    go("phase2");
    await h!.engine.settled();
    expect(h!.engine.record.completedAt).toBeDefined();
    // The batch that ran is named by its batch; the one it never started is gone.
    expect(rows().filter(row => row.fixing).map(row => row.file)).toEqual(["Batch 1 of 2 from test audit loop 1 · 1 gap"]);
  });

  it("reads the first waiting batch as Next on a paused run with nothing else due (AC-BATCH-01)", { timeout: 180_000 }, async () => {
    await fixture(() => [audit(), audit({ continueTest: true, fixBatches: batches(["AC-A"], ["AC-B"]) }), audit(), audit()]);
    let requested = false;
    const off = h!.engine.onChange(() => { if (!requested && h!.engine.current?.session?.kind === "test_audit") { requested = true; h!.engine.pause(); } });
    await h!.engine.start({ refinementConfirmed: true }); await h!.engine.settled(); off();
    const snapshot = buildSnapshot(h!.engine);
    expect(snapshot.feature.state).toBe("paused");
    // The run paused after the test audit, with batch 1's session allocated but not started: its row reads Next, batch 2 Planned.
    expect(shown().slice(-3, -1)).toEqual([["Fixing tests", "Batch 1 of 2 from test audit loop 1 · 1 gap", "next"], ["Fixing tests", "Batch 2 of 2 from test audit loop 1 · 1 gap", "planned"]]);
    await h!.engine.start(); await h!.engine.settled();
    expect(h!.engine.record.completedAt).toBeDefined();
  });

  it("reads a batch no session holds yet as Next on a paused run with nothing else due, and Planned while a phase is left (AC-BATCH-01)", { timeout: 180_000 }, async () => {
    await fixture(() => [audit(), audit({ continueTest: true, fixBatches: batches(["AC-A"], ["AC-B"]) }), audit(), audit()]);
    let requested = false;
    const off = h!.engine.onChange(() => { if (!requested && h!.engine.current?.session?.kind === "test_audit") { requested = true; h!.engine.pause(); } });
    await h!.engine.start({ refinementConfirmed: true }); await h!.engine.settled(); off();
    // As a record read before the continuation was allocated: the test audit settled, nothing allocated after it.
    const record = h!.engine.record;
    const pending = record.completionAudits!.activities.pop()!;
    record.activities = record.activities!.filter(one => one.key !== auditKey(pending)); delete record.phases[auditKey(pending)]; delete record.nextActivityKey;
    expect(shown().slice(-3, -1)).toEqual([["Fixing tests", "Batch 1 of 2 from test audit loop 1 · 1 gap", "next"], ["Fixing tests", "Batch 2 of 2 from test audit loop 1 · 1 gap", "planned"]]);
    // With a phase left to build first, it stays Planned.
    if (record.phases["1"]) delete record.phases["1"].doneAt;
    record.plan = record.plan!.map(phase => ({ ...phase, closed: false }));
    expect(shown().slice(-3, -1).map(row => row[2])).toEqual(["planned", "planned"]);
  });
});
