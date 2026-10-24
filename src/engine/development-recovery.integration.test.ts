// Real synchronized Git work plus the captured GitHub contract; live provider/browser
// handoff proofs cover the external conversation and artifact boundaries separately.
import { afterEach, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { landingSession } from "../test-support/engine-harness.js";
import { evaluateRepositories } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
let fixture: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await fixture?.h.cleanup(); fixture = undefined; });

it("resumes only description repair after every source change is delivered, then completes without a duplicate PR", async () => {
  fixture = await deliveryFixture();
  const f = fixture;
  f.synchronize();
  expect(await evaluateRepositories(f.context)).toMatchObject({ passed: true, pullRequests: [] });
  f.pull.body = ""; f.save();
  const missing = await evaluateRepositories(f.context);
  expect(missing).toMatchObject({ passed: false, pullRequests: [] });
  expect(missing.checks.filter(check => !check.passed).flatMap(check => check.facts)).toEqual(["acme-shop: unresolved — acme-shop #1: add the PRD reference to the description."]);
  // Reopen the same real engine with the captured GitHub reader. Provider calls are
  // deterministic here; the actual provider continuation is proved by the kept runner.
  f.h.tools.gh = f.context.gh;
  Object.assign(f.h.env, f.context.env);
  writeFileSync(f.h.scenarioPath, JSON.stringify({ sessions: [landingSession(), { actions: [] }, { actions: [] }] }));
  const engine = f.h.reopen(); await engine.agents.refresh();
  await engine.checkAgain(); await engine.settled();
  expect(engine.stoppedPhaseKey()).toBe("pr");
  const session = engine.latestSession("pr")!;
  const stop = buildSnapshot(engine).needsYou!;
  expect(stop.checks.filter(check => !check.passed).flatMap(check => check.facts)).toEqual(["acme-shop: unresolved — acme-shop #1: add the PRD reference to the description."]);
  expect(stop.resumePrompt).toContain("description links");
  const historicalMerge = structuredClone(engine.record.developmentDelivery!.checkpoints[0]!.merge);
  expect(await engine.resume({ note: "Repair the missing description reference." })).toEqual({ ok: true });
  await engine.settled();
  const calls = f.h.claudeCalls();
  expect(calls.at(-1)!.args).toContain(session.sessionId);
  expect(calls.at(-1)!.prompt).toContain("saved development-delivery authority");
  expect(calls.at(-1)!.prompt).toContain("Carry on finalizing delivery");
  expect(calls.at(-1)!.prompt).not.toContain("Carry on opening");
  expect(engine.record.completedAt).toBeUndefined();
  expect(engine.record.developmentDelivery!.checkpoints[0]!.merge).toEqual(historicalMerge);
  f.pull.body = `PRD: ${f.context.prdDirectory}/customer-returns-prd.md`; f.save();
  await engine.checkAgain(); await engine.settled();
  expect(engine.record.completedAt).toBeDefined();
  expect(f.h.claudeCalls()).toHaveLength(calls.length);
  expect(engine.record.pullRequests ?? []).toEqual([]);
  expect(engine.record.developmentDelivery!.repositoryResults).toMatchObject([{ state: "delivered", deliveredCheckpointIds: [f.checkpoint.id] }]);
});
