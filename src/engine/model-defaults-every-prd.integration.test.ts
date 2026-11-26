// Model defaults are kept for every PRD (Kiln Phase Model Tiers AC-DEFAULT-02: "What the person
// sets is kept for every PRD in every repository on the computer"), through the local server's
// Model defaults page endpoint against real Git with the stand-in claude: a row set from one PRD's
// page is what a second PRD, opened afterwards in its own engine, runs its standard phases on.

import { afterEach, describe, expect, it } from "vitest";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import type { Engine } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await harness?.cleanup(); harness = undefined; });

/** Reads the PRD's plan into the engine, as Documents found does before Start. */
async function withPlan(h: Harness, engine: Engine, folder: string): Promise<Engine> {
  const read = readPlanAt(h.repository, `docs/prds/${folder}`);
  if (!read.ok) throw new Error(read.problem);
  engine.record.plan = recordedPlan(read.plan);
  engine.modelChoicesChanged();
  await engine.refreshAgents();
  return engine;
}

const row = (engine: Engine, id: string): PhaseView => { const snapshot = buildSnapshot(engine); return (snapshot.activities ?? snapshot.phases).find(one => one.id === id)!; };
/** What a phase's row shows: model, effort, and where the choice comes from. */
const shown = (view: PhaseView) => [view.model?.choice?.agent, view.model?.choice?.modelName, view.model?.choice?.effort, view.model?.from];

describe("Model defaults are kept for every PRD (AC-DEFAULT-02)", () => {
  it("runs a second PRD's standard phase on the Standard row set from the first PRD's Model defaults page", async () => {
    const h = harness = await createHarness({ sessions: [], extraFolders: ["gift-cards"] });
    await withPlan(h, h.engine, "customer-returns");
    server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });

    // The fixture's phases carry no tier line, so each runs as standard (AC-TIER-01): Kiln's Standard row, Claude Code · Opus · medium (AC-DEFAULT-01).
    const before = await withPlan(h, await h.engineFor("gift-cards"), "gift-cards");
    expect(shown(row(before, "3"))).toEqual(["Claude Code", "Opus 5.5", "medium", "model_defaults"]);
    before.close();

    const response = await fetch(new URL("/api/model-defaults", server.address), {
      method: "POST",
      headers: { "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json", Origin: new URL(server.address).origin },
      body: JSON.stringify({ set: { row: "standard", first: { agentId: "claude_code", family: "sonnet", effort: "low" } } }),
    });
    expect(response.status).toBe(200);

    // A PRD whose engine opens after the change, with no choice of its own, shows and runs on the row.
    const second = await withPlan(h, await h.engineFor("gift-cards"), "gift-cards");
    expect(second.record.settings.modelChoices.kept).toBeUndefined();
    expect(shown(row(second, "3"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "model_defaults"]);
    expect(shown(row(second, "1"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "model_defaults"]);
    second.close();
  });
});
