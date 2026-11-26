// Changing a phase to the other agent (Kiln Phase Model Tiers AC-PICK-03: Change offers "the
// agent, model and effort choices Kiln offers today"), through the engine and its loopback API
// against real Git with the stand-in claude and the Codex work stand-in both installed: Phase 2b,
// on Claude Code by its tier, is changed to Codex before Start, its row shows the Codex choice
// marked Changed by you with Use the default, and the run launches 2b on Codex with that model
// and effort while Phase 1 launches on Claude Code.

import { afterEach, describe, expect, it } from "vitest";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { Engine } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";
import { prdTreeAtHead } from "./worktree-setup.js";

let harness: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
let server: LocalServer | undefined;
afterEach(async () => {
  await server?.close(); server = undefined;
  await harness?.cleanup(); harness = undefined;
  await codex?.sandbox.cleanup(); codex = undefined;
});

const DIRECTORY = "docs/prds/customer-returns";

/** The fixture documents with Phase 2b mechanical (Claude Code · Sonnet 5.5 · high by Kiln's defaults); the rest unrated. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  files["phase-2b-store-credit.md"] = files["phase-2b-store-credit.md"]!.replace(/\n\n/, "\n\n**Model tier:** mechanical - repeats the card refund flow.\n\n");
  return files;
}

/** Claude Code and the Codex work stand-in both installed, the plan read, and the loopback server up. */
async function fixture(): Promise<Harness> {
  harness = await createHarness({ sessions: [landingSession("src/one.txt")], files: tieredFiles() });
  const h = harness;
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  const read = readPlanAt(h.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.readers.codex.state.pending);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  return h;
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, server!.address), { method: "POST", headers: { "X-Kiln-Token": harness!.engine.record.token, "Content-Type": "application/json", Origin: new URL(server!.address).origin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const rows = (engine: Engine): PhaseView[] => { const snapshot = buildSnapshot(engine); return snapshot.activities ?? snapshot.phases; };
const row = (engine: Engine, id: string): PhaseView => rows(engine).find(one => one.id === id)!;
const shown = (view: PhaseView) => [view.model?.choice?.agent, view.model?.choice?.modelName, view.model?.choice?.effort, view.model?.from];
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

describe("a phase changed to the other agent (AC-PICK-03)", () => {
  it("changes Phase 2b from Claude Code to Codex before Start, and the run launches 2b on Codex with that model and effort while Phase 1 launches on Claude Code", async () => {
    const h = await fixture();
    // By its mechanical tier, 2b is on Claude Code; both agents are installed and each lists its models.
    expect(shown(row(h.engine, "2b"))).toEqual(["Claude Code", "Sonnet 5.5", "high", "model_defaults"]);
    expect(buildSnapshot(h.engine).agents.filter(agent => agent.installed).map(agent => agent.agentId).sort()).toEqual(["claude_code", "codex"]);
    expect(buildSnapshot(h.engine).agents.find(agent => agent.agentId === "codex")!.models).toEqual([{ value: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", efforts: ["high", "low"], defaultEffort: "low" }]);

    expect(await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" } })).toMatchObject({ status: 200, body: { ok: true } });
    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "low" }, from: "changed", change: { available: true }, useDefault: true });
    expect(h.engine.record.settings.modelChoices.phases["2b"]).toEqual({ agentId: "codex", model: "gpt-6.1-sol", effort: "low" });
    // The change covers 2b only: Phase 1 and Phase 3 stay on Claude Code by Model defaults.
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Opus 5.5", "medium", "model_defaults"]);
    expect(shown(row(h.engine, "3"))).toEqual(["Claude Code", "Opus 5.5", "medium", "model_defaults"]);
    // Codex is now needed by Phase 2b, and by nothing else.
    expect(h.engine.neededBy().codex).toEqual({ activities: ["Phase 2b"], fallbackOnly: false });

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await waitFor(() => h.engine.latestSession("2b")?.runs[0]?.endedAt !== undefined, 20000);
    await h.engine.settled();

    // Phase 1 launched on Claude Code at its default; 2b never launched on Claude Code.
    expect(h.engine.latestSession("1")!.agentId).toBe("claude_code");
    expect(h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")])).toEqual([["opus", "medium"]]);
    // 2b launched on Codex with the changed model and effort, at the thread and at the turn.
    expect(h.engine.latestSession("2b")).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", modelDisplayName: "GPT-6.1-Sol", effort: "low" });
    const threads = codex!.calls().filter(call => call.method === "thread/start" && call.params?.ephemeral === false);
    expect(threads.map(call => [call.params?.model, (call.params?.config as { model_reasoning_effort?: unknown } | undefined)?.model_reasoning_effort])).toEqual([["gpt-6.1-sol", "low"]]);
    expect(codex!.calls().filter(call => call.method === "turn/start").map(call => [call.params?.model, call.params?.effort])).toEqual([["gpt-6.1-sol", "low"]]);
    // 2b has started on Codex: its row shows what it runs on, still marked Changed by you, with no Change.
    expect(row(h.engine, "2b").model).toMatchObject({ choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "low" }, from: "changed" });
    expect(row(h.engine, "2b").model?.change).toBeUndefined();
    // Phase 3, after it, is still planned on Claude Code.
    expect(shown(row(h.engine, "3"))).toEqual(["Claude Code", "Opus 5.5", "medium", "model_defaults"]);
  });
});
