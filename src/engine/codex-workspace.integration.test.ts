// Codex-specific evidence drives the existing phase/PR verdict and persisted confirmation.
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { readPrdRecord, writeSessionRecord } from "../state/records.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
let history: ReturnType<typeof historyFixture> | undefined;
afterEach(async () => { await harness?.cleanup(); await history?.sandbox.cleanup(); });

it("persists full evidence and exact confirmation, but rejects later manual work or missing history across restart", async () => {
  harness = await createHarness({ sessions: [{ actions: [] }] });
  await harness.engine.start({ refinementConfirmed: true }); await harness.engine.settled();
  history = historyFixture(); const f = history; const h = harness;
  f.addThread("parent", { target: join(f.outside, "outside.txt") });
  Object.assign(h.tools, { codex: f.options.executable });
  h.env.KILN_CODEX_HISTORY_FIXTURE = f.options.env.KILN_CODEX_HISTORY_FIXTURE;
  h.engine.record.settings.agentId = "codex";
  h.engine.record.settings.agentChoices.codex = { model: "gpt-6.1-sol", effort: "high" };
  const facts = h.engine.record.phases["1"]!;
  const id = facts.sessionIds[0]!;
  const session = h.engine.sessionRecord("1", id)!;
  session.agentId = "codex";
  session.conversation = { threadId: "parent", codexHome: f.codexHome };
  writeSessionRecord(h.stateDirectory, session);
  const first = await h.engine.readWorkspaceEvidence("1");
  expect(first.passed).toBe(false); expect(first.changes).toHaveLength(1); expect(first.transcripts).toEqual([]);
  expect(readPrdRecord(h.stateDirectory)!.phases["1"]!.codexAudits?.[id]?.coverage).toBe("complete");
  facts.stop!.checks = [first.check];
  expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });
  expect(buildSnapshot(h.engine).needsYou!.outside!.confirmation).toEqual({ offered: true, ticked: true });
  expect((await h.engine.readWorkspaceEvidence("1")).passed).toBe(true);
  h.reopenFromDisk();
  expect((await h.engine.readWorkspaceEvidence("1")).passed).toBe(true);
  const fingerprint = h.engine.record.phases["1"]!.codexAudits![id]!.fingerprint;
  const reads = f.calls().filter(call => call.method === "thread/read").length;
  appendFileSync(f.state.threads.parent!.metadata.path, f.record("event_msg", { type: "agent_message", message: "Manual terminal work, same old timestamp" }));
  // No cache refresh before the user action: doneCheck itself must read the provider again.
  await h.engine.checkAgain(); await h.engine.settled();
  expect(f.calls().filter(call => call.method === "thread/read").length).toBeGreaterThan(reads);
  expect(h.engine.record.phases["1"]!.codexAudits![id]!.fingerprint).not.toBe(fingerprint);
  expect(h.engine.record.phases["1"]!.stop!.checks.find(check => check.name === "Stayed in the workspace")?.passed).toBe(false);
  expect(buildSnapshot(h.engine).needsYou!.outside!.confirmation.ticked).toBe(false);
  rmSync(f.state.threads.parent!.metadata.path);
  await h.engine.checkAgain(); await h.engine.settled();
  expect(h.engine.latestStayed("1").transcripts).toHaveLength(1);
  expect(h.engine.setOutsideConfirmation(true).ok).toBe(false);
  expect(buildSnapshot(h.engine).needsYou!.outside!.confirmation.offered).toBe(false);
  expect(h.engine.record.phases["1"]!.stop!.checks.find(check => check.name === "Stayed in the workspace")?.passed).toBe(false);
  expect(h.claudeCalls()).toHaveLength(1);
});

it("pull-request Check again reads new authoritative evidence before it can finish", async () => {
  harness = await createHarness({ sessions: [landingSession("src/first.txt"), landingSession("src/second.txt"), landingSession("src/third.txt"), pullRequestSession(218, true)] });
  await harness.engine.start({ refinementConfirmed: true }); await harness.engine.settled();
  history = historyFixture(); const f = history; const h = harness;
  expect(h.engine.record.phases.pr!.stop!.kind).toBe("pull_request_check");
  f.addThread("parent", { target: join(f.outside, "outside-pr.txt") });
  Object.assign(h.tools, { codex: f.options.executable }); h.env.KILN_CODEX_HISTORY_FIXTURE = f.options.env.KILN_CODEX_HISTORY_FIXTURE;
  h.engine.record.settings.agentId = "codex";
  h.engine.record.settings.agentChoices.codex = { model: "gpt-6.1-sol", effort: "high" };
  const facts = h.engine.record.phases.pr!; const id = facts.sessionIds[0]!;
  const session = h.engine.sessionRecord("pr", id)!; session.agentId = "codex"; session.conversation = { threadId: "parent", codexHome: f.codexHome }; writeSessionRecord(h.stateDirectory, session);
  const first = await h.engine.readWorkspaceEvidence("pr"); facts.stop!.checks = [first.check];
  expect(h.engine.setOutsideConfirmation(true)).toEqual({ ok: true });
  const fingerprint = facts.codexAudits![id]!.fingerprint;
  const reads = f.calls().filter(call => call.method === "thread/read").length;
  h.setPulls([{ repo: "acme/acme-shop", number: 218, title: "Customer returns", url: "https://github.com/acme/acme-shop/pull/218", isDraft: false, isCrossRepository: false, headRefName: h.engine.record.settings.featureBranch, baseRefName: "develop", additions: 4, deletions: 0, commits: [{ oid: "a" }] }]);
  appendFileSync(f.state.threads.parent!.metadata.path, f.record("event_msg", { type: "agent_message", message: "Later terminal record" }));
  await h.engine.checkAgain(); await h.engine.settled();
  expect(f.calls().filter(call => call.method === "thread/read").length).toBeGreaterThan(reads);
  expect(facts.codexAudits![id]!.fingerprint).not.toBe(fingerprint);
  expect(h.engine.record.completedAt).toBeUndefined();
  expect(facts.stop!.checks.map(check => [check.name, check.passed])).toEqual([["Pull request open", true], ["Stayed in the workspace", false]]);
  expect(h.claudeCalls()).toHaveLength(4);
});
