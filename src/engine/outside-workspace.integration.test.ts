// AC-CHECK-01/02/03: real temporary Git repositories prove confinement auditing is retired.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { createRepository, git } from "../test-support/git-repositories.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { buildSnapshot } from "./snapshot.js";
let h: Harness;
afterEach(() => h?.cleanup());

it("advances landed work despite this session's outside edits and unrelated parallel changes", async () => {
  h = await createHarness({ sessions: [] });
  const outside = createRepository(h.sandbox, "parallel-work");
  writeFileSync(join(outside, "other-agent.txt"), "parallel work\n");
  const session = landingSession("src/landed.txt");
  session.actions.unshift({ write: { path: join(outside, "session-note.txt"), content: "session work\n" } });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [session, { actions: [] }] }));
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  expect(readFileSync(join(outside, "session-note.txt"), "utf8")).toBe("session work\n");
  expect(readFileSync(join(outside, "other-agent.txt"), "utf8")).toBe("parallel work\n");
  expect(buildSnapshot(h.engine).needsYou?.checks.map(c => c.name)).toEqual(["Phase doc closed", "Everything committed", "Pushed"]);
  expect(buildSnapshot(h.engine).needsYou?.outside).toBeUndefined();
});

it("accepts landed Git work without requiring a transcript for confinement", async () => {
  h = await createHarness({ sessions: [{ ...landingSession("src/landed.txt"), noTranscript: true }, { actions: [] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  expect(h.engine.record.phases["2b"]!.stop!.checks).toHaveLength(3);
});

it("drops saved workspace stops and acceptance history while rechecking remaining Git requirements", async () => {
  h = await createHarness({ sessions: [{ actions: [] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const facts = h.engine.record.phases["1"]!;
  facts.stop!.checks.push({ name: "Stayed in the workspace", passed: false, facts: ["Unknown helper"] });
  facts.outsideConfirmations = [{ at: new Date().toISOString() }];
  facts.codexConfirmations = [{ at: new Date().toISOString(), fingerprints: { old: "old" } }];
  writePrdRecord(h.stateDirectory, h.engine.record);
  const loaded = readPrdRecord(h.stateDirectory)!;
  expect(loaded.phases["1"]!.outsideConfirmations).toBeUndefined();
  expect(loaded.phases["1"]!.codexConfirmations).toBeUndefined();
  expect(loaded.phases["1"]!.stop!.checks.map(c => c.name)).toEqual(["Phase doc closed", "Everything committed", "Pushed"]);
  h.reopenFromDisk(); await h.engine.prepare();
  expect(buildSnapshot(h.engine).needsYou?.outside).toBeUndefined();
  expect(h.engine.controlView().controls.some(c => c.name === "outside-confirmation")).toBe(false);
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ outcome: "still_stopped" });
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
});

it("keeps dirty and unpushed work stopped without a workspace audit row", async () => {
  const session = landingSession("src/unpushed.txt"); session.actions = session.actions.filter(a => !("push" in a));
  session.actions.push({ write: { path: "dirty.txt", content: "unfinished\n" } });
  h = await createHarness({ sessions: [session] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const checks = h.engine.record.phases["1"]!.stop!.checks;
  expect(checks.map(c => [c.name, c.passed])).toEqual([["Phase doc closed", true], ["Everything committed", false], ["Pushed", false]]);
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
});

it("resumes interrupted work despite an outside edit", async () => {
  h = await createHarness({ sessions: [] });
  const outside = createRepository(h.sandbox, "parallel-work"); const ready = join(h.sandbox.root, "ready");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ write: { path: join(outside, "note.txt"), content: "outside\n" } }, { touch: ready }, { work: "npm test" }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready)); await h.engine.stop("sigint");
  h.reopenFromDisk(); await h.engine.prepare();
  expect(await h.engine.decide()).toMatchObject({ kind: "resume", phaseKey: "1" });
  expect(git(h.sandbox, outside, "status", "--porcelain")).toContain("note.txt");
});

it("completes final delivery without an outside-workspace predicate", async () => {
  h = await createHarness({ sessions: [] });
  const outside = createRepository(h.sandbox, "parallel-work"); const final = pullRequestSession(218);
  final.actions.unshift({ write: { path: join(outside, "note.txt"), content: "outside\n" } });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), final] }));
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(buildSnapshot(h.engine).feature.state).toBe("complete");
  expect(h.engine.record.pullRequests?.[0]?.number).toBe(218);
});
