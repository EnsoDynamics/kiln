// A change to the Audits choice is for one PRD (Kiln Phase Model Tiers AC-OTHER-01: "A person can
// change that choice for one PRD"), through the engine against real Git with the stand-in claude:
// changing one PRD's Audits choice leaves another PRD in the same repository on Model defaults'
// Audits first choice, whether its engine was open at the change or opened after.

import { afterEach, describe, expect, it } from "vitest";
import { readPrdRecord } from "../state/records.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

/** The Audits line as Documents found and the run's settings show it: model, effort, and whether it is this PRD's own. */
const audits = (engine: Parameters<typeof buildSnapshot>[0]) => { const view = buildSnapshot(engine).settings.models.audits; return [view.choice?.agent, view.choice?.modelName, view.choice?.effort, view.changedByYou]; };

describe("an Audits change covers that PRD only (AC-OTHER-01)", () => {
  it("leaves another PRD's Audits choice on Model defaults, whether its engine was open at the change or opened after", async () => {
    const h = harness = await createHarness({ sessions: [], extraFolders: ["gift-cards"] });
    const before = await h.engineFor("gift-cards");
    // Model defaults' Audits first choice (AC-DEFAULT-01): Claude Code · Opus · high.
    expect(audits(before)).toEqual(["Claude Code", "Opus 5.5", "high", false]);

    expect(await h.engine.changeModel("audits", { agentId: "claude_code", model: "sonnet", effort: "low" })).toEqual({ ok: true });
    expect(audits(h.engine)).toEqual(["Claude Code", "Sonnet 5.5", "low", true]);
    expect(readPrdRecord(h.stateDirectory)!.settings.modelChoices.audits).toEqual({ agentId: "claude_code", model: "sonnet", effort: "low" });

    before.modelChoicesChanged();
    expect(audits(before)).toEqual(["Claude Code", "Opus 5.5", "high", false]);
    expect(before.record.settings.modelChoices.audits).toBeUndefined();
    const after = await h.engineFor("gift-cards");
    expect(audits(after)).toEqual(["Claude Code", "Opus 5.5", "high", false]);
    expect(after.record.settings.modelChoices.audits).toBeUndefined();
    before.close(); after.close();
  });
});
