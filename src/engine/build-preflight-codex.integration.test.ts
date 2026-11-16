// The build preflight when the run's agent is Codex (Kiln Build Preflight PRD, AC-PREFLIGHT-05):
// Codex lists its skills through its own app server, not Claude Code's, so whether the installed
// method has `build-preflight` is read and resolved on a separate path. Real engine and Git, with
// the deterministic Codex peer; the Claude Code cases are in build-preflight.integration.test.ts.
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";

let h: Harness | undefined;
let f: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await h?.cleanup(); await f?.sandbox.cleanup(); h = undefined; f = undefined; });

async function codexRun(additionalSkills: string[]) {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") });
  f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable });
  f.configureEnvironment(h.env);
  f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, additionalSkills });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (read.ok) h.engine.record.plan = recordedPlan(read.plan);
  await h.engine.changeSettings({ agentId: "codex" });
  await h.engine.agents.refresh();
  expect(h.engine.selectionError).toBeUndefined();
  return { h, f };
}
const turns = (fixture: ReturnType<typeof codexWorkFixture>) => fixture.calls().filter(call => call.method === "turn/start").map(call => JSON.stringify(call.params?.input));

describe("an older method under Codex is not an error (AC-PREFLIGHT-05)", () => {
  it("with no build-preflight skill in Codex's list, the plan shows no Preflight row and the first session is Phase 1", async () => {
    const { h, f } = await codexRun([]);
    expect(h.engine.agents.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("phase-1-return-intake.md");
    expect(turns(f)[0]).not.toContain("build preflight");
    expect(h.engine.record.preflight?.activities ?? []).toEqual([]);
    expect((buildSnapshot(h.engine).activities ?? []).some(row => row.kind === "preflight")).toBe(false);
    await h.engine.settled();
  });

  it("with the skill in Codex's list, the plan shows the Preflight row and the preflight is the first session", async () => {
    const { h, f } = await codexRun(["build-preflight"]);
    expect(h.engine.agents.state.optionalSkills).toEqual({ buildPreflight: true });
    // With no Documents found passed, the planned row has no activity to sit above.
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "end" } });
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("Run the Enso Method's build preflight");
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    await h.engine.settled();
  });
});
