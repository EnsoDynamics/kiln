// Kiln Linked Documents through whole runs of the engine, against real Git with the stand-in
// claude: a link Kiln can't follow never stops a phase from starting (AC-LINK-01), each phase
// prompt names it (AC-LINK-03), and nothing on the run's stops mentions it (AC-LINK-05).

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";

let harness: Harness | undefined;
afterEach(async () => { vi.restoreAllMocks(); await harness?.cleanup(); harness = undefined; });
const directory = "docs/prds/customer-returns";
const BROKEN = "\n\nBackground: [event history](../../../billing-service/docs/event-history.md) and [old notes](notes/archive.md).\n";

it("starts phase 1 past links it can't follow and names each in the phase prompt (AC-LINK-01, AC-LINK-03)", async () => {
  const files = prdDirectoryFiles(); files["technical-design.md"] += BROKEN;
  harness = await createHarness({ sessions: [landingSession()], files });
  const h = harness;
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => h.claudeCalls().length === 1);
  h.engine.pause(); await h.engine.settled();
  expect(Object.values(h.engine.record.phases).filter(phase => phase.stop?.kind === "plan")).toEqual([]);
  const prompt = h.claudeCalls()[0]!.prompt;
  expect(prompt).toContain("Kiln could not follow these links in the requirements, so it did not read the documents they point at:");
  expect(prompt).toContain(`- \`${directory}/technical-design.md\` links to \`../../../billing-service/docs/event-history.md\`: not in this repository.`);
  expect(prompt).toContain(`- \`${directory}/technical-design.md\` links to \`notes/archive.md\`: not in this repository.`);
  expect(prompt).toContain("If this phase needs one of those documents, find it. If you can't, and the phase needs it, say so in your final message.");
});

it("leaves the prompt as it was when every link can be followed (AC-LINK-03)", async () => {
  harness = await createHarness({ sessions: [landingSession()] });
  const h = harness;
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => h.claudeCalls().length === 1);
  h.engine.pause(); await h.engine.settled();
  expect(h.claudeCalls()[0]!.prompt).not.toContain("Kiln could not follow");
});

it("continues on Check again, after a restart, from a stop an earlier Kiln saved on a broken link, and never shows the link on a new stop (AC-LINK-01, AC-LINK-03, AC-LINK-05)", async () => {
  harness = await createHarness({ sessions: [] });
  const h = harness;
  const release = join(h.sandbox.root, "release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/dashboard.txt"), pullRequestSession()] }));
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => h.claudeCalls().length === 1);
  h.engine.pause();
  writeFileSync(release, "");
  await h.engine.settled();

  // While paused, a split child's document goes and the design gains a broken link: the plan stops on the child only.
  const child = join(h.engine.worktreePath, directory, "phase-2b-store-credit.md"); const bytes = readFileSync(child, "utf8");
  rmSync(child);
  const design = join(h.engine.worktreePath, directory, "technical-design.md");
  writeFileSync(design, readFileSync(design, "utf8") + BROKEN);
  await h.engine.start(); await h.engine.settled();
  const stop = h.engine.record.phases["2b"]!.stop!;
  expect(stop).toMatchObject({ kind: "plan", checks: [{ name: "Phase plan reads", passed: false, facts: ["phase-2-refunds.md lists 2b, which has no file."] }] });
  expect(JSON.stringify(stop)).not.toContain("event-history");

  // A run saved by an earlier Kiln stopped on the link itself: the record says so, and a new engine reads it after a restart.
  const fact = `Linked document is missing: billing-service/docs/event-history.md`;
  const saved = readPrdRecord(h.stateDirectory)!;
  const check = saved.phases["2b"]!.stop!.checks![0]!;
  Object.assign(check, { facts: [fact], items: [{ kind: "known_problem", subject: fact, text: fact, against: fact }] });
  writePrdRecord(h.stateDirectory, saved);
  writeFileSync(child, bytes);
  const reopened = h.reopenFromDisk();
  expect(reopened.record.phases["2b"]!.stop!.checks![0]!.facts).toEqual([fact]);
  expect(await reopened.checkAgain(recoveryRequest(reopened, "verify"))).toMatchObject({ ok: true });
  await waitFor(() => h.claudeCalls().length === 2);
  expect(h.claudeCalls()[1]!.prompt).toContain("event-history.md`: not in this repository.");
  reopened.pause(); await reopened.settled();
  expect(reopened.record.waivers ?? []).toEqual([]);
});
