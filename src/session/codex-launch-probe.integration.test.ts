import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { PreparedCodexLaunch } from "./codex-launch-profile.js";
import { probeCodexLaunchSettings } from "./codex-launch-probe.js";

// A stand-in app-server over real pipes and real processes. On `thread/start` it starts two
// "MCP servers": one in its own group that keeps running when its parent exits (as a real
// server that ignores stdin EOF would) and one in the app-server's group. It exits on stdin EOF
// without stopping either, so only the probe's own cleanup can end them.
const PEER = String.raw`
import { appendFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const mode = process.env.PROBE_FAKE_MODE, log = process.env.PROBE_FAKE_LOG;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const env = { ...process.env }; delete env.KILN_CODEX_PROCESS_OWNER;
const mcp = detached => spawn(process.execPath, ['-e', 'process.on("SIGHUP",()=>{}); setInterval(()=>{},1000)'], { detached, stdio: 'ignore', env });
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line); appendFileSync(log, line + '\n');
  if (message.method === 'initialize') send({ id: message.id, result: { codexHome: process.cwd(), platformOs: 'macos' } });
  if (message.method !== 'thread/start') return;
  const children = [mcp(true), mcp(false)];
  writeFileSync(log + '.pids', JSON.stringify([process.pid, ...children.map(child => child.pid)]));
  if (mode === 'hang') return;
  if (mode === 'request') { send({ id: 'ask', method: 'item/tool/requestUserInput', params: {} }); return; }
  if (mode === 'refuse') { send({ id: message.id, error: { code: -32600, message: 'model is not available' } }); return; }
  const p = message.params;
  send({ id: message.id, result: {
    model: mode === 'mismatch' ? 'different-model' : p.model, reasoningEffort: p.config.model_reasoning_effort, modelProvider: p.modelProvider, cwd: p.cwd,
    approvalPolicy: p.approvalPolicy, approvalsReviewer: p.approvalsReviewer,
    sandbox: { type: 'workspaceWrite', writableRoots: mode === 'roots' ? [] : p.config.sandbox_workspace_write.writable_roots.filter(root => root !== p.cwd), networkAccess: true },
    instructionSources: [], thread: { id: 'probe-thread', sessionId: 'probe-thread', ephemeral: mode === 'durable' ? false : p.ephemeral, path: null } } });
});
process.stdin.on('end', () => process.exit(0));
`;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup(mode: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-launch-probe-"))); roots.push(root);
  const workspace = join(root, "workspace"); const added = join(root, "added");
  mkdirSync(workspace); mkdirSync(added);
  const peer = join(root, "peer.mjs"); writeFileSync(peer, PEER);
  const executable = join(root, "codex");
  writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${peer}' "$@"\n`); chmodSync(executable, 0o755);
  const log = join(root, "calls.jsonl"); writeFileSync(log, "");
  const at = new Date().toISOString();
  const prepared: PreparedCodexLaunch = {
    profile: { version: "0.166.0", cwd: workspace, writableRoots: [workspace, added], repositories: [{ path: workspace, branch: "develop" }], skills: [] },
    choice: { model: "gpt-6.1-sol", effort: "high" }, account: { at }, usage: { limits: [] } as unknown as PreparedCodexLaunch["usage"],
  };
  const options = { executable, env: { ...process.env, PROBE_FAKE_MODE: mode, PROBE_FAKE_LOG: log }, prepared };
  const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { method?: string; params?: Record<string, unknown> });
  /** The app-server, then its own-group MCP stand-in, then its same-group one. */
  const children = () => JSON.parse(readFileSync(log + ".pids", "utf8")) as number[];
  return { options, calls, children, workspace, added, executable, log };
}
// Each of these was the probe's child or was reparented to init and reaped, so a vanished PID
// means the process ended; a reused PID within the test is not a realistic concern.
const live = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
const allGone = (pids: number[]) => pids.every(pid => !live(pid));

describe.skipIf(process.platform === "win32")("Codex launch settings probe", () => {
  it("uses a stand-in whose own-group MCP server outlives the app-server unless someone ends it", async () => {
    const f = setup("match");
    const server = spawn(f.executable, ["app-server"], { cwd: f.workspace, env: f.options.env, stdio: ["pipe", "pipe", "ignore"] });
    server.stdin.write(JSON.stringify({ id: 1, method: "thread/start", params: { cwd: f.workspace, model: "m", modelProvider: "openai", approvalPolicy: "on-request", approvalsReviewer: "auto_review", ephemeral: true, config: { model_reasoning_effort: null, sandbox_workspace_write: { writable_roots: [] } } } }) + "\n");
    await once(server.stdout, "data");
    server.stdin.end(); await once(server, "close");
    const [, ownGroup] = f.children();
    try { expect(live(ownGroup!)).toBe(true); } finally { process.kill(ownGroup!, "SIGKILL"); }
  });

  it("passes matching settings from an ephemeral thread without dispatching a turn, and leaves no process behind", async () => {
    const f = setup("match");
    const result = await probeCodexLaunchSettings(f.options);
    expect(result).toEqual({ ok: true });
    const calls = f.calls();
    expect(calls.map(call => call.method)).toEqual(["initialize", "initialized", "thread/start"]);
    expect(calls.some(call => call.method === "turn/start")).toBe(false);
    expect(calls[2]!.params).toMatchObject({ cwd: f.workspace, model: "gpt-6.1-sol", modelProvider: "openai", sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "auto_review", ephemeral: true, allowProviderModelFallback: false, config: { model_reasoning_effort: "high", sandbox_workspace_write: { writable_roots: [f.workspace, f.added], network_access: true } } });
    const children = f.children();
    expect(children).toHaveLength(3); // The app-server and both MCP stand-ins.
    expect(allGone(children)).toBe(true);
  });

  it.each([
    ["mismatch", "Codex refused the recorded model, effort, provider or launch directory; no work was dispatched."],
    ["roots", "Codex's effective protected launch profile differs from the assigned workspace; no work was dispatched."],
    ["durable", "Codex did not keep the launch settings check's conversation ephemeral; no work was dispatched."],
    ["refuse", "Codex refused the recorded launch settings: {\"code\":-32600,\"message\":\"model is not available\"}; no work was dispatched."],
  ])("keeps a failing row for %s with the launch's message", async (mode, message) => {
    const f = setup(mode);
    expect(await probeCodexLaunchSettings(f.options)).toEqual({ ok: false, message });
    expect(f.calls().some(call => call.method === "turn/start")).toBe(false);
    expect(allGone(f.children())).toBe(true);
  });

  it("cannot finish, and still ends every process, when Codex never answers", async () => {
    const f = setup("hang");
    // The probe's deadline and the thread/start RPC deadline both take timeoutMs. The probe's
    // fires first but inventories the process tree before failing the transport, and on macOS
    // that scan can outlast the gap between the two timers, so either deadline may name the hang.
    await expect(probeCodexLaunchSettings({ ...f.options, timeoutMs: 1500 })).rejects.toThrow(/^Codex (launch settings check|thread\/start) exceeded its (RPC )?deadline\.$/);
    expect(allGone(f.children())).toBe(true);
  });

  it("cannot finish, and still ends every process, when Kiln stops mid-check", async () => {
    const f = setup("hang"); const controller = new AbortController();
    const probe = probeCodexLaunchSettings({ ...f.options, signal: controller.signal });
    for (let i = 0; i < 400 && !f.calls().some(call => call.method === "thread/start"); i++) await new Promise(resolve => setTimeout(resolve, 25));
    await new Promise(resolve => setTimeout(resolve, 200));
    controller.abort();
    await expect(probe).rejects.toThrow("Kiln is stopping.");
    expect(allGone(f.children())).toBe(true);
  });

  it("cannot finish when Codex asks for a human answer", async () => {
    const f = setup("request");
    await expect(probeCodexLaunchSettings(f.options)).rejects.toThrow("Codex asked for item/tool/requestUserInput while Kiln checked its launch settings.");
    expect(allGone(f.children())).toBe(true);
  });
});
