// The Attended and Early merge phase-document lines through the engine (Kiln Build Preflight PRD,
// Phase 2), against real Git with the stand-in claude and gh: Documents found and the run's plan
// carry them, a stop in a marked phase carries its text, and a marked phase runs exactly as an
// unmarked one does. The screens drawing them are proved in view/src/screens/attended-marks-screens.test.ts.

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { createHarness, landingSession, pullRequestSession, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, documentsFound } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

const DIRECTORY = "docs/prds/customer-returns";
const ATTENDED = "Create the return-label template in the carrier's desktop console, which has no API.";
const CLOSED_ATTENDED = "Approve the card processor's sandbox webhook in its dashboard.";
const EARLY = "develop, for AC-DASH-01";
// The fixture plan's open leaves are 1, 2b and 3 (2a is closed), then final delivery.
const allPhases = (): ScenarioSession[] => [landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];
const stopsPartway: ScenarioSession = { actions: [{ result: "The settings are built; the template needs the carrier's console." }, { exit: 0 }] };

/** The fixture documents with Phase 1 and the closed Phase 2a marked as needing a person and Phase 3 merging early. */
function markedFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  const mark = (name: string, line: string) => { files[name] = files[name]!.replace(/\n\n/, `\n\n${line}\n\n`); };
  mark("phase-1-return-intake.md", `**Attended:** ${ATTENDED}`);
  mark("phase-2a-card-refunds.md", `**Attended:** ${CLOSED_ATTENDED}`);
  mark("phase-3-returns-dashboard.md", `**Early merge:** ${EARLY}`);
  return files;
}

async function fixture(sessions: ScenarioSession[], marked = true) {
  harness = await createHarness({ sessions, ...(marked ? { files: markedFiles() } : {}) });
  // `kiln run` passes Start the plan Documents found showed, which Start saves; the harness's engine has none.
  const read = readPlanAt(harness.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  harness.engine.record.plan = recordedPlan(read.plan);
  return harness;
}

describe("the lines reach Documents found and the run's plan (AC-ATTEND-01, AC-ATTEND-05)", () => {
  it("Documents found and the recorded plan carry each line's text, closed phases included", async () => {
    const h = await fixture(allPhases());
    const read = readPlanAt(h.repository, DIRECTORY);
    if (!read.ok) throw new Error(read.problem);
    const found = documentsFound(join(h.repository, DIRECTORY), "customer-returns", read.plan, { designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 5, repositories: [] }, "acme-shop");
    const phase = (id: string) => found.plan!.phases.find(one => one.id === id)!;
    expect(phase("1")).toMatchObject({ attended: ATTENDED, closed: false });
    expect(phase("2a")).toMatchObject({ attended: CLOSED_ATTENDED, closed: true });
    expect(phase("3")).toMatchObject({ earlyMerge: EARLY });
    expect(phase("2b").attended).toBeUndefined();
    expect(phase("2b").earlyMerge).toBeUndefined();
    expect(h.engine.record.plan!.find(one => one.id === "1")!.attended).toBe(ATTENDED);
  });

  it("the run's phase plan shows the marker's text on the marked rows before and after the run", async () => {
    const h = await fixture(allPhases());
    const marked = () => Object.fromEntries((buildSnapshot(h.engine).activities ?? buildSnapshot(h.engine).phases).filter(row => row.attended !== undefined).map(row => [row.id, row.attended]));
    expect(marked()).toEqual({ "1": ATTENDED, "2a": CLOSED_ATTENDED });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(marked()).toEqual({ "1": ATTENDED, "2a": CLOSED_ATTENDED });
    expect(buildSnapshot(h.engine).phases.find(row => row.id === "1")!.state).toBe("done");
  });
});

describe("a stop in a marked phase says so (AC-ATTEND-03)", () => {
  it("carries the Attended text on a marked phase's stop and none on an unmarked one's", async () => {
    const h = await fixture([stopsPartway]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.phaseId).toBe("1");
    expect(stop.attended).toBe(ATTENDED);
    // During the run, stopped in the marked phase, its row still carries the marker's text (AC-ATTEND-01).
    expect(buildSnapshot(h.engine).phases.find(row => row.id === "1")).toMatchObject({ state: "needs_you", attended: ATTENDED });
    await harness!.cleanup();
    harness = undefined;

    const unmarked = await fixture([landingSession("src/one.txt"), stopsPartway]);
    await unmarked.engine.start({ refinementConfirmed: true });
    await unmarked.engine.settled();
    const second = buildSnapshot(unmarked.engine).needsYou!;
    expect(second.phaseId).toBe("2b");
    expect(second.attended).toBeUndefined();
  });
});

describe("a marked phase runs like any other (AC-ATTEND-04)", () => {
  it("launches with the same prompts and options as the same plan unmarked, and nothing holds it back", async () => {
    const launches = async (marked: boolean) => {
      const h = await fixture(allPhases(), marked);
      await h.engine.start({ refinementConfirmed: true });
      await h.engine.settled();
      expect(h.engine.record.completedAt).toBeDefined();
      expect(buildSnapshot(h.engine).needsYou).toBeUndefined();
      const root = h.repository.slice(0, h.repository.lastIndexOf("/acme-shop"));
      const normal = (value: string) => value.split(root).join("<sandbox>").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
      const calls = h.claudeCalls().map(call => ({ args: call.args.map(normal), cwd: normal(call.cwd), prompt: normal(call.prompt) }));
      await h.cleanup();
      harness = undefined;
      return calls;
    };
    const marked = await launches(true);
    const unmarked = await launches(false);
    expect(marked.length).toBe(4);
    expect(marked[0]!.prompt).toContain("phase-1-return-intake.md");
    expect(marked).toEqual(unmarked);
  });
});
