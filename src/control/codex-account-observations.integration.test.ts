// Real subprocess metadata, authenticated HTTP, built CLI and retained private files.
// Account switches use the qualified protocol peer; Doug's sign-ins are unchanged.
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { Engine } from "../engine/engine.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { processStartTime } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { writePrdRecord } from "../state/records.js";
import { stateRoot, writeJsonAtomically } from "../state/state-files.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { cacheSnapshot, inspectionSnapshot } from "./projection.js";

let h: Harness;
let server: LocalServer | undefined;
let fixture: ReturnType<typeof installCodexMetadataFixture>;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const target = () => join(h.repository, `docs/prds/${FOLDER}`);
async function setup(initial: Record<string, unknown>) {
  h = await createHarness({ sessions: [] });
  fixture = installCodexMetadataFixture(h.sandbox); fixture.set(initial);
  h.env.KILN_CODEX_METADATA = fixture.env.KILN_CODEX_METADATA;
  h.engine.close(); h.engine.record.settings.agentId = "codex";
  writePrdRecord(h.stateDirectory, h.engine.record);
  h.engine = new Engine({ paths: h.engine.paths, record: h.engine.record, tools: { ...h.tools, ...(initial.missingExecutable ? {} : { codex: fixture.executable }) }, env: h.env, stateDirectory: h.stateDirectory });
  await h.engine.agents.refresh();
  let port = 42170;
  while (port < 42220 && !await isPortFree(port)) port++;
  if (port === 42220) throw new Error("No free Codex observation test port");
  server = await startLocalServer({ engine: h.engine, port, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), args[0]!, target(), ...args.slice(1), "--json"], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", b => stdout += String(b)); child.stderr.on("data", b => stderr += String(b));
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(stderr).toBe(""); return { code, body: JSON.parse(stdout) };
}
async function facts() {
  const account = await cli(["account"]); const status = await cli(["status", "--detail", "full"]);
  expect(account.code).toBe(0); expect(status.code).toBe(0);
  expect(status.body.account).toEqual(account.body.data);
  return account.body.data;
}
async function disconnect() {
  cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
  await server!.close(); server = undefined; h.engine.close(); rmSync(join(h.stateDirectory, "instance.lock"));
}
function savedBytes() {
  const root = stateRoot(h.env);
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
    const path = join(e.parentPath, e.name); return [path, readFileSync(path).toString("base64")];
  }));
}

it.each([{ missingExecutable: true }, { initializeError: true }, { accountError: true }, { afterAccountError: true }, { version: "99.0.0" }])("reports unavailable first-read Codex facts through refresh/full status and retained reads: %j", async initial => {
  await setup(initial);
  const refresh = await cli(["account", "--refresh"]);
  expect(refresh.code).toBe(4); expect(refresh.body.ok).toBe(false);
  expect(refresh.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "provider_unavailable" })]));
  const check = async () => {
    const observed = await facts();
    for (const name of ["next_attempt", "usage", "recovery"]) expect(observed[name]).toMatchObject({ value: null, state: "unavailable", reason: expect.any(String) });
    expect(observed.usage.observed_at).toBeNull(); expect(observed.recovery.observed_at).toBeNull();
  };
  await check(); await disconnect(); const before = savedBytes(); await check(); expect(savedBytes()).toEqual(before);
  expect(fixture.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
});

it("keeps independently dated same-account usage stale, rejects cross-account gauges and retains honest disconnected observations", async () => {
  const first = { account: { type: "chatgpt", email: "first@example.invalid", planType: "pro" } };
  await setup({ accounts: [first] });
  const original = await facts();
  expect(original.next_attempt).toMatchObject({ value: { email: "first@example.invalid", account_id: "fixture-account" }, state: "current" });
  expect(original.usage).toMatchObject({ value: expect.arrayContaining([expect.objectContaining({ percent: 82, durationMinutes: 10080 })]), state: "current", observed_at: h.engine.agents.state.account!.limitsObservedAt });
  expect(original.recovery).toMatchObject({ value: { state: "allowed" }, state: "current" });
  fixture.set({ accounts: [first], usageError: true });
  const failed = await cli(["account", "--refresh"]); expect(failed.code).toBe(4);
  expect(failed.body.data.next_attempt).toMatchObject({ value: { email: first.account.email }, state: "current" });
  expect(Date.parse(failed.body.data.next_attempt.observed_at)).toBeGreaterThan(Date.parse(original.next_attempt.observed_at));
  expect(failed.body.data.usage).toMatchObject({ value: original.usage.value, observed_at: original.usage.observed_at, state: "stale" });
  expect(failed.body.data.recovery).toMatchObject({ value: { state: "unknown" }, state: "current" });
  expect(Date.parse(failed.body.data.recovery.observed_at)).toBeGreaterThan(Date.parse(original.recovery.observed_at));
  // An optional failure lost current routing, but must not lose the retained
  // gauges' source workspace. A later route must still be compared against it.
  fixture.set({ accounts: [{ ...first, workspaceRouting: { chatgptAccountId: "changed-workspace" } }], usageError: true });
  const changedRoute = await cli(["account", "--refresh"]); expect(changedRoute.code).toBe(4);
  expect(changedRoute.body.data.next_attempt).toMatchObject({ value: { email: first.account.email, account_id: "changed-workspace" }, state: "current" });
  expect(changedRoute.body.data.usage).toMatchObject({ value: null, observed_at: null, state: "unavailable" });
  expect(changedRoute.body.data.recovery.value.state).toBe("unknown");
  const second = { account: { type: "chatgpt", email: "second@example.invalid", planType: "business" } };
  fixture.set({ accounts: [first, second] });
  const changed = await cli(["account", "--refresh"]); expect(changed.code).toBe(4);
  expect(changed.body.data.next_attempt).toMatchObject({ value: { email: second.account.email, plan: "business", account_id: null }, state: "current" });
  expect(changed.body.data.usage).toMatchObject({ value: null, observed_at: null, state: "unavailable" });
  expect(changed.body.data.recovery.value.state).toBe("unknown");
  fixture.set({ accounts: [{ account: { type: "chatgpt", planType: "business" } }] });
  const unidentified = await cli(["account", "--refresh"]); expect(unidentified.code).toBe(4);
  expect(unidentified.body.data.next_attempt).toMatchObject({ value: null, state: "unavailable" });
  expect(unidentified.body.data.usage).toMatchObject({ value: null, observed_at: null, state: "unavailable" });
  expect(unidentified.body.data.recovery.value.state).toBe("unknown");
  fixture.set({ accounts: [second] });
  const restored = await cli(["account", "--refresh"]); expect(restored.code).toBe(0);
  fixture.set({ initializeError: true });
  const failedIdentity = await cli(["account", "--refresh"]); expect(failedIdentity.code).toBe(4);
  expect(failedIdentity.body.data.next_attempt).toMatchObject({ value: { email: second.account.email, error: expect.any(String) }, observed_at: restored.body.data.next_attempt.observed_at, state: "stale" });
  expect(failedIdentity.body.data.usage).toMatchObject({ value: restored.body.data.usage.value, observed_at: restored.body.data.usage.observed_at, state: "stale" });
  expect(failedIdentity.body.data.recovery).toMatchObject({ observed_at: restored.body.data.recovery.observed_at, state: "stale" });
  await facts(); await disconnect(); const before = savedBytes(); const retained = await facts();
  expect(retained.next_attempt.state).toBe("stale"); expect(retained.usage.observed_at).toBe(restored.body.data.usage.observed_at);
  expect(retained.recovery.observed_at).toBe(restored.body.data.recovery.observed_at); expect(savedBytes()).toEqual(before);
  // Old caches did not record independent usage/recovery dates. Nearby auth dates
  // cannot establish when those facts were observed, even for a known account.
  const cachePath = join(h.stateDirectory, "inspection-view.json");
  const legacy = JSON.parse(readFileSync(cachePath, "utf8"));
  delete legacy.snapshot.account.limitsObservedAt; delete legacy.snapshot.account.codexUsageObservedAt;
  writeJsonAtomically(cachePath, legacy); const legacyBefore = savedBytes();
  const undated = await facts();
  expect(undated.usage).toMatchObject({ value: null, observed_at: null, state: "unavailable" });
  expect(undated.recovery).toMatchObject({ value: null, observed_at: null, state: "unavailable" });
  expect(savedBytes()).toEqual(legacyBefore);

  expect(fixture.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
});
