// Real engine, Git, private files, authenticated HTTP and built CLI boundaries.
// Provider peers reproduce verified contracts; only the dispatch-checkpoint write
// failure is injected. Actual provider metadata evidence is recorded in Phase 5.
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { Engine } from "../engine/engine.js";
import { prdTreeAtHead } from "../engine/worktree-setup.js";
import { readSessionRecord, writePrdRecord, writeSessionRecord } from "../state/records.js";
import { stateRoot, writeJsonAtomically } from "../state/state-files.js";
import { processStartTime } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { cacheSnapshot, inspectionSnapshot } from "./projection.js";
import * as durable from "./durable-file.js";
import type { Receipt } from "./commands.js";

let h: Harness;
let peer: ReturnType<typeof codexWorkFixture> | undefined;
let server: LocalServer | undefined;
let port: number;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); server = undefined; await h?.cleanup(); await peer?.sandbox.cleanup(); peer = undefined; });

async function serve() {
  for (port = 41920; port < 41970; port++) if (await isPortFree(port)) break;
  if (port === 41970) throw new Error("No free account-provenance test port");
  server = await startLocalServer({ engine: h.engine, port, folderName: FOLDER, featureName: "Customer returns", token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
}
async function cli(args: string[]) {
  const collectedAfter = Date.now();
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", b => stdout += String(b)); child.stderr.on("data", b => stderr += String(b));
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(stderr).toBe("");
  const body = args.includes("--json") ? JSON.parse(stdout) : null;
  if (body) {
    expect(body.observed_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(Date.parse(body.observed_at)).toBeGreaterThanOrEqual(collectedAfter);
    expect(Date.parse(body.observed_at)).toBeLessThanOrEqual(Date.now());
  }
  return { code, stdout, body };
}
const target = () => join(h.repository, `docs/prds/${FOLDER}`);
async function account(expected: Record<string, unknown>, state = "current") {
  const read = await cli(["account", target(), "--json"]);
  expect(read.code, read.stdout).toBe(0);
  expect(read.body.data.last_attempt).toMatchObject(expected);
  const full = await cli(["status", target(), "--detail", "full", "--json"]);
  expect(full.code, full.stdout).toBe(0);
  expect(full.body.account).toEqual(read.body.data);
  expect(full.body.account.last_attempt.state).toBe(state);
  if (full.body.controller === "stopped") {
    expect(full.body.status_token).toBeNull();
    expect(full.body.controls.every((c: { available: boolean }) => !c.available)).toBe(true);
  }
  return read.body.data;
}
async function resume(id: string) {
  const status = await cli(["status", target(), "--json"]);
  const accepted = await cli(["resume", target(), "--only-if-status-matches", status.body.status_token, "--command-id", id, "--json"]);
  expect(accepted.code, accepted.stdout).toBe(0);
  await h.engine.commands.settled(); await h.engine.settled();
}
async function disconnect(capture = true) {
  if (capture) cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
  await server!.close(); server = undefined; h.engine.close();
  rmSync(join(h.stateDirectory, "instance.lock"));
}
function savedBytes() {
  const root = stateRoot(h.env);
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
    const path = join(e.parentPath, e.name); return [path, readFileSync(path).toString("base64")];
  }));
}

it("keeps Claude launch and resume account/plan/time after a later changed-account dispatch checkpoint fails", async () => {
  h = await createHarness({ sessions: [{ actions: [{ result: "First stop" }] }, { actions: [{ result: "Second stop" }] }] });
  const auth = join(h.sandbox.root, "auth.json"); h.env.KILN_STANDIN_ACCOUNT = auth;
  const signIn = (email: string, subscriptionType: string) => writeFileSync(auth, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email, subscriptionType }));
  signIn("first@example.invalid", "max");
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); await serve();
  const inventory = await cli(["status", "--json"]);
  expect(inventory.code).toBe(0); expect(inventory.body.counts.live_controllers).toBe(1);
  const launched = h.engine.latestSession("1")!;
  expect(launched.runs[0]!.account).toBeUndefined();
  const firstAt = launched.runs[0]!.billing!.observedAt;
  await account({ value: { email: "first@example.invalid", plan: "Max plan" }, observed_at: firstAt, state: "current" });
  signIn("resumed@example.invalid", "pro");
  await resume("resume-second-account");
  const resumed = h.engine.latestSession("1")!;
  expect(resumed.runs).toHaveLength(2);
  expect(resumed.runs[1]!.account).toMatchObject({ email: "resumed@example.invalid" });
  const secondAt = resumed.runs[1]!.billing!.observedAt;
  const expected = { value: { email: "resumed@example.invalid", plan: "Pro plan" }, observed_at: secondAt, state: "current" };
  await account(expected);

  signIn("next@example.invalid", "team");
  const refreshed = await cli(["account", target(), "--refresh", "--json"]);
  expect(refreshed.code, refreshed.stdout).toBe(0);
  expect(refreshed.body.data.last_attempt).toMatchObject(expected);
  expect(refreshed.body.data.next_attempt).toMatchObject({ value: { email: "next@example.invalid", plan: "Team plan" } });
  const invalid = await fetch(`http://127.0.0.1:${port}/api/control/v1/account/refresh`, { method: "POST", headers: { Origin: `http://127.0.0.1:${port}`, "X-Kiln-Token": h.engine.record.token }, body: "{}" });
  expect(invalid.status).toBe(400); expect(h.claudeCalls()).toHaveLength(2);
  const write = durable.writeDurableMetadata;
  const failure = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    const receipt = (value as { receipt?: Receipt }).receipt;
    if (receipt?.command_id === "predispatch-failure" && receipt.stage === "dispatching") throw new Error("Injected dispatch-checkpoint failure");
    write(path, value);
  });
  await resume("predispatch-failure"); failure.mockRestore();
  expect(h.engine.commands.blocked).toBe(true);
  expect(h.engine.commands.lookup("predispatch-failure").operation).toMatchObject({ state: "failed", outcome: "dispatch_not_started" });
  expect(h.engine.record.billing!.lastLaunch).toMatchObject({ email: "next@example.invalid", plan: "Team plan" });
  expect(h.engine.record.billing!.lastLaunch!.observedAt).not.toBe(secondAt);
  const saved = readSessionRecord(h.stateDirectory, "1", resumed.sessionId)!;
  expect(saved.runs).toHaveLength(2); expect(saved.runs[1]).toEqual(resumed.runs[1]);
  expect(h.claudeCalls()).toHaveLength(2);
  const facts = await account(expected);
  expect(facts.next_attempt).toMatchObject({ value: { email: "next@example.invalid", plan: "Team plan" }, observed_at: h.engine.agents.state.account!.updatedAt });
  expect(facts.usage).toMatchObject({ observed_at: h.engine.agents.state.account!.updatedAt, state: "current" });
  expect(facts.usage.value).toEqual(h.engine.agents.state.account!.limits);
  expect(facts.usage.value).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "session", percent: 5, resetsAt: "2026-10-17T18:59:59.628228+00:00" }),
    expect.objectContaining({ kind: "weekly_all", percent: 42 }),
    expect.objectContaining({ kind: "weekly_scoped", percent: 0, scope: { by: "model", name: "Fable" } }),
  ]));
  expect((await cli(["account", target()])).stdout).toContain("resumed@example.invalid");
  // Independently exercise both authenticated public routes, not only CLI formatting.
  for (const route of ["account", "status?detail=full"]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/control/v1/${route}`, { headers: { "X-Kiln-Token": h.engine.record.token } });
    expect(response.status).toBe(200); const body = await response.json() as { data: { last_attempt: unknown }; account: { last_attempt: unknown } };
    expect((route === "account" ? body.data : body.account).last_attempt).toMatchObject(expected);
  }
  await disconnect(); const before = savedBytes();
  const stale = await account({ ...expected, state: "stale" }, "stale");
  expect(stale.next_attempt).toMatchObject({ value: { email: "next@example.invalid" }, state: "stale" });
  expect(stale.usage).toMatchObject({ observed_at: facts.usage.observed_at, state: "stale" });
  expect(savedBytes()).toEqual(before); expect(h.claudeCalls()).toHaveLength(2);
});

it("leaves undated legacy Claude identity unavailable and ignores a newer conversation with no attempt", async () => {
  h = await createHarness({ sessions: [{ actions: [{ result: "Stopped" }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  const nextSession = { ...structuredClone(session), sessionId: "never-dispatched", createdAt: "2099-01-01T00:00:00Z", runs: [] };
  h.engine.record.phases["1"]!.sessionIds.push(nextSession.sessionId);
  writeSessionRecord(h.stateDirectory, nextSession);
  writePrdRecord(h.stateDirectory, h.engine.record);
  await serve();
  await account({ value: { email: "alex@acme-shop.dev", plan: "Max plan" }, observed_at: session.runs[0]!.billing!.observedAt });
  // Legacy AccountIdentity has no observation time or plan. Neither global billing
  // nor the next account can supply missing provenance for this saved attempt.
  delete session.runs[0]!.billing; session.runs[0]!.account = { email: "legacy@example.invalid" };
  writeSessionRecord(h.stateDirectory, session);
  const unavailable = { value: null, observed_at: null, state: "unavailable", reason: expect.any(String) };
  await account(unavailable, "unavailable");
  await disconnect(); const before = savedBytes();
  await account(unavailable, "unavailable"); expect(savedBytes()).toEqual(before);
});

it.each(["missing", "corrupt"])("does not promote an older account when the newer saved session is %s", async damage => {
  h = await createHarness({ sessions: [{ actions: [{ result: "Stopped" }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const older = h.engine.latestSession("1")!;
  const newer = structuredClone(older); newer.sessionId = "unreadable-newer";
  const at = new Date(Date.parse(older.runs[0]!.startedAt) + 1000).toISOString();
  newer.createdAt = at; newer.runs[0]!.startedAt = at;
  newer.runs[0]!.billing = { ...newer.runs[0]!.billing!, email: "newer@example.invalid", observedAt: at };
  // Keep the browser's selected stop readable; inspection enumerates all owned
  // conversations and must not mistake that selected stop for the latest attempt.
  h.engine.record.phases["1"]!.sessionIds.unshift(newer.sessionId);
  writeSessionRecord(h.stateDirectory, newer); writePrdRecord(h.stateDirectory, h.engine.record);
  const path = join(h.stateDirectory, "1", newer.sessionId, "session.json");
  writeFileSync(join(h.stateDirectory, "1", newer.sessionId, "output.jsonl"), "");
  await serve();
  await account({ value: { email: "newer@example.invalid" }, observed_at: at });
  if (damage === "missing") rmSync(path); else writeFileSync(path, "{truncated");
  const unavailable = { value: null, observed_at: null, state: "unavailable", reason: expect.stringContaining("incomplete") };
  for (const args of [["account"], ["account", "--refresh"], ["status", "--detail", "full"]]) {
    const response = await cli([args[0]!, target(), ...args.slice(1), "--json"]);
    expect(response.code, response.stdout).toBe(4); expect(response.body.ok).toBe(false);
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "state_unavailable" })]));
    const facts = args[0] === "account" ? response.body.data : response.body.account;
    expect(facts.last_attempt).toMatchObject(unavailable);
    expect(facts.next_attempt).toMatchObject({ value: { email: "alex@acme-shop.dev" }, state: damage === "corrupt" ? "stale" : "current" });
  }
  // Corruption prevents a new browser snapshot. Retain the last-good cache that
  // the controller already saved, matching its ordinary failed-cache behavior.
  await disconnect(damage !== "corrupt"); const before = savedBytes();
  for (const args of [["account"], ["status", "--detail", "full"]]) {
    const response = await cli([args[0]!, target(), ...args.slice(1), "--json"]);
    expect(response.code, response.stdout).toBe(4); expect(response.body.ok).toBe(false);
    expect((args[0] === "account" ? response.body.data : response.body.account).last_attempt).toMatchObject(unavailable);
  }
  expect(savedBytes()).toEqual(before); expect(h.claudeCalls()).toHaveLength(1);
});

it("retains Codex original and resumed provenance separately from current account, usage and recovery observations", async () => {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") }); peer = codexWorkFixture();
  Object.assign(h.tools, { codex: peer.options.executable }); peer.configureEnvironment(h.env);
  const set = (value: Record<string, unknown>) => peer!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ...value });
  const usage = { accountId: "first-workspace", ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: { primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: 71, windowDurationMins: 10080, resetsAt: 1800100000 } } } };
  set({ email: "first-codex@example.invalid", accountId: "first-workspace", usage });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  await h.engine.changeSettings({ agentId: "codex" }); await h.engine.agents.refresh();
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); await serve();
  const first = h.engine.latestSession("1")!;
  const original = structuredClone(first.codex!.originalAccount);
  expect(original).toMatchObject({ email: "first-codex@example.invalid", accountId: "first-workspace", plan: "pro" });
  await account({ value: first.runs[0]!.codex!.account, observed_at: first.runs[0]!.codex!.account.at });
  set({ email: "resumed-codex@example.invalid", accountId: "resumed-workspace" });
  await resume("codex-second-account");
  const resumed = h.engine.latestSession("1")!; expect(resumed.runs).toHaveLength(2);
  const provenance = structuredClone(resumed.runs[1]!.codex!.account);
  expect(provenance).toMatchObject({ email: "resumed-codex@example.invalid", accountId: "resumed-workspace", plan: "pro" });
  set({ email: "next-codex@example.invalid", accountId: "next-workspace", usage: { ...usage, accountId: "next-workspace" } });
  const refreshed = await cli(["account", target(), "--refresh", "--json"]); expect(refreshed.code, refreshed.stdout).toBe(0);
  const facts = await account({ value: provenance, observed_at: provenance.at });
  expect(facts.original_attempt).toMatchObject({ value: original, observed_at: original.at });
  expect(facts.next_attempt).toMatchObject({ value: { email: "next-codex@example.invalid", account_id: "next-workspace" }, observed_at: h.engine.agents.state.account!.updatedAt });
  expect(facts.usage.value).toEqual(h.engine.agents.state.account!.limits);
  expect(facts.usage.value).toEqual(expect.arrayContaining([expect.objectContaining({ id: "codex:primary", percent: 23, durationMinutes: 300, resetsAt: new Date(1800000000000).toISOString() }), expect.objectContaining({ id: "codex:secondary", percent: 71, durationMinutes: 10080 })]));
  expect(facts.recovery).toMatchObject({ value: { state: "allowed" }, observed_at: h.engine.agents.state.account!.updatedAt });
  set({ email: "next-codex@example.invalid", accountId: "next-workspace", usageError: true });
  const failedReadAfter = Date.now();
  const failedRefresh = await cli(["account", target(), "--refresh", "--json"]);
  expect(failedRefresh.code, failedRefresh.stdout).toBe(4);
  expect(failedRefresh.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "provider_unavailable" })]));
  expect(failedRefresh.body.data.last_attempt).toMatchObject({ value: provenance, observed_at: provenance.at });
  expect(failedRefresh.body.data.original_attempt).toMatchObject({ value: original, observed_at: original.at });
  expect(failedRefresh.body.data.usage).toMatchObject({ value: facts.usage.value, observed_at: facts.usage.observed_at, state: "stale", reason: expect.any(String) });
  expect(failedRefresh.body.data.recovery).toMatchObject({ value: { state: "unknown" }, state: "current" });
  expect(Date.parse(failedRefresh.body.data.recovery.observed_at)).toBeGreaterThanOrEqual(failedReadAfter);
  expect(Date.parse(failedRefresh.body.data.recovery.observed_at)).toBeLessThanOrEqual(Date.parse(failedRefresh.body.observed_at));
  // Restore a real successful metadata observation before checking disconnected facts.
  set({ email: "next-codex@example.invalid", accountId: "next-workspace", usage: { ...usage, accountId: "next-workspace" } });
  const restored = await cli(["account", target(), "--refresh", "--json"]);
  expect(restored.code, restored.stdout).toBe(0);
  set({ signedOut: true });
  const identityFailure = await cli(["account", target(), "--refresh", "--json"]);
  expect(identityFailure.code, identityFailure.stdout).toBe(4);
  expect(identityFailure.body.data.next_attempt).toMatchObject({ value: { email: "next-codex@example.invalid", error: expect.any(String) }, observed_at: restored.body.data.next_attempt.observed_at, state: "stale" });
  expect(identityFailure.body.data.recovery).toMatchObject({ value: { state: "allowed" }, observed_at: restored.body.data.recovery.observed_at, state: "stale", reason: expect.any(String) });
  expect(identityFailure.body.data.last_attempt).toMatchObject({ value: provenance, observed_at: provenance.at });
  expect(peer.calls().filter(c => c.method === "turn/start")).toHaveLength(2);
  await disconnect(); const before = savedBytes();
  const stale = await account({ value: provenance, observed_at: provenance.at, state: "stale" }, "stale");
  expect(stale.original_attempt).toMatchObject({ value: original, observed_at: original.at, state: "stale" });
  expect(stale.usage).toMatchObject({ observed_at: restored.body.data.usage.observed_at, state: "stale" });
  expect(stale.recovery).toMatchObject({ value: { state: "allowed" }, observed_at: restored.body.data.recovery.observed_at, state: "stale" });
  expect(savedBytes()).toEqual(before);
});
