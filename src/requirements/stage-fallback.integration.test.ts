// A requirements stage follows a phase's model rules for the fallback (Kiln Requirements Stages
// AC-MODEL-06): the heads-up on the row Kiln launches next, and, while the stage is current, why
// the fallback wasn't used. Real engine and Git; the Claude account reading is set at the
// reader's boundary, since an account can't be brought to the threshold on demand.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { ScriptedClaude, signedIn, usageRow, type ScriptedReading } from "../test-support/scripted-claude.js";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { buildSnapshot } from "../engine/snapshot.js";

let h: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; await codex?.sandbox.cleanup(); codex = undefined; });

/** A Claude account reader that answers every reading at once with the reading the test set. */
class SetClaude implements ClaudeInfoSource {
  account: AccountView | undefined;
  readonly models = new ScriptedClaude(() => new Date()).models;
  readonly modelListError = undefined;
  private readonly listeners = new Set<() => void>();
  constructor(public reading: ScriptedReading) {}
  refreshAccount(): Promise<void> {
    const startedAt = new Date().toISOString();
    return new Promise(resolve => setImmediate(() => {
      const updatedAt = new Date().toISOString();
      this.account = { limits: [], ...this.reading, startedAt, updatedAt, limitsObservedAt: updatedAt };
      for (const listener of this.listeners) listener();
      resolve();
    }));
  }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
const weekly = (percent: number) => signedIn([usageRow("session", 20), usageRow("weekly_all", percent)]);
const rows = () => buildSnapshot(h!.engine).requirements!.rows;

it("says on the running stage's row why the fallback wasn't used", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-stage-fallback-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(97)) },
    sessions: [{ actions: [{ touch: join(signals, "running") }, { waitForFile: join(signals, "go") }, { result: "Not finished." }, { exit: 0 }] }] });
  writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => rows().some(row => row.state === "running" && row.model?.fallback), 20_000);
  // Codex isn't installed, so the stage stays on its first choice, and its row says why while it is current.
  const running = rows().find(row => row.state === "running")!;
  expect(running.model).toMatchObject({ choice: { agent: "Claude Code", model: "fable" }, fallback: { used: false, threshold: 95, reason: expect.stringContaining("Codex is not on PATH") } });
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
});

it("shows the heads-up on the requirements row Kiln launches next", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(97)) }, sessions: [] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  // This Codex offers GPT Sol only, so the Requirements stages row falls back to it.
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  // The plan read's launch check reads auth alone; a full reading afterwards gives the usage the forecast reads.
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "failed", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  expect(h.engine.headsUp()!.key).toBe("req-next");
  const next = rows().find(row => row.key === "kiln:next")!;
  expect(next.model?.forecast).toMatchObject({ choice: { agent: "Codex" }, limit: { agent: "Claude Code", percent: 97 }, threshold: 95 });
});
