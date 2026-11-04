// Waivers AC-WAIVE-01/05/06/08 through the built `kiln waive-and-advance` and the browser's
// `POST /api/mark-complete`: real Git, the real engine and journal, the local server, and the
// stand-in provider. Needs `dist/` (npm run build).
import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import type { Receipt } from "./commands.js";

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); server = undefined; await h?.cleanup(); });
const target = () => join(h.repository, `docs/prds/${FOLDER}`);

/** Phase 1 stops at Needs you with its done check failing (no Closed line), Phase 2 asks a question. */
async function stopped() {
  h = await createHarness({ sessions: [{ actions: [{ result: "I think this is done." }] }, { actions: [{ result: "Phase 2 has a question." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  const port = boundPort(server.address);
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
  return { origin: `http://127.0.0.1:${port}` };
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 20000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(watchdog));
  expect(stderr).toBe(""); return { code, stdout, json: () => JSON.parse(stdout) as Record<string, unknown> };
}
async function token(): Promise<string> {
  const status = await cli(["status", target(), "--json"]); expect(status.code, status.stdout).toBe(0);
  return status.json().status_token as string;
}
async function receipt(id: string): Promise<{ operation: Receipt & { action: string }; mark_complete?: Record<string, unknown> }> {
  await h.engine.commands.settled();
  const read = await cli(["command-status", target(), "--command-id", id, "--json"]); expect(read.code, read.stdout).toBe(0);
  return read.json() as never;
}

it("checks again without --confirm, then marks complete with --confirm and --by, recording the command-line source", async () => {
  await stopped();
  const first = await token();
  // Refused before a recheck: the button would not be offered, and nothing is saved.
  const early = await cli(["waive-and-advance", target(), "--confirm", "--only-if-status-matches", first, "--command-id", "too-early", "--json"]);
  expect(early.code, early.stdout).toBe(3);
  expect(early.json()).toMatchObject({ ok: false, errors: [{ code: "mark_complete_not_offered" }], operation: { state: "refused", action: "waive-and-advance" } });
  const earlyText = await cli(["waive-and-advance", target(), "--confirm", "--only-if-status-matches", first, "--command-id", "too-early-text"]);
  expect(earlyText.code).toBe(3); expect(earlyText.stdout).toMatch(/^Refused: /);
  // --by belongs to Mark complete only.
  expect((await cli(["waive-and-advance", target(), "--by", "grokbot", "--only-if-status-matches", first, "--command-id", "by-without-confirm", "--json"])).code).toBe(2);

  // Without --confirm: the stop's recheck, verify-and-advance at this hand-back stop, never a waiver (AC-WAIVE-01).
  const recheck = await cli(["waive-and-advance", target(), "--only-if-status-matches", first, "--command-id", "grok-7c20", "--json"]);
  expect(recheck.code, recheck.stdout).toBe(0);
  expect(recheck.json()).toMatchObject({ ok: true, operation: { action: "verify-and-advance" } });
  const checked = await receipt("grok-7c20");
  expect(checked.operation).toMatchObject({ state: "completed", outcome: "completion_checks_failed", effects: { plan: "not_advanced" } });
  expect(h.engine.record.waivers ?? []).toEqual([]);
  const fresh = await token();
  expect(checked.mark_complete).toMatchObject({ offered: true, next_argv: ["kiln", "waive-and-advance", target(), "--confirm", "--only-if-status-matches", fresh, "--command-id", "<new-command-id>"] });
  const text = await cli(["command-status", target(), "--command-id", "grok-7c20"]);
  expect(text.stdout).toContain("is still at Needs you."); expect(text.stdout).toContain("Marking it complete would waive:");
  expect(text.stdout).toContain(`--confirm --only-if-status-matches ${fresh} --command-id <a new id>`);
  const status = await cli(["status", target(), "--json"]);
  expect(status.json().stop).toMatchObject({ mark_complete: { offered: true, check_run_id: expect.any(String) }, check_run: { origin: "recheck", finished: true } });

  // A token from before the recheck is stale for Mark complete.
  const stale = await cli(["waive-and-advance", target(), "--confirm", "--only-if-status-matches", first, "--command-id", "stale-token", "--json"]);
  expect(stale.code).toBe(3); expect(stale.json().errors).toEqual([expect.objectContaining({ code: "stale_status_token" })]);

  // With --confirm: Mark complete, from the preview's own argv with a new command id.
  const argv = (checked.mark_complete!.next_argv as string[]).slice(1).map(arg => arg === "<new-command-id>" ? "grok-7c21" : arg);
  const confirm = [...argv, "--by", "grokbot", "--json"];
  const marked = await cli(confirm); expect(marked.code, marked.stdout).toBe(0);
  const settled = await receipt("grok-7c21");
  expect(settled.operation).toMatchObject({ action: "waive-and-advance", state: "completed", outcome: "marked_complete", waiver_id: expect.any(String), effects: { plan: "advanced" } });
  expect(h.engine.record.waivers).toHaveLength(1);
  expect(h.engine.record.waivers![0]).toMatchObject({ waiverId: settled.operation.waiver_id, activityKey: "1", source: { via: "command_line", account: userInfo().username, by: "grokbot" }, operationId: settled.operation.id });
  expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), waiverId: settled.operation.waiver_id });
  const text2 = await cli(["command-status", target(), "--command-id", "grok-7c21"]);
  expect(text2.stdout).toMatch(/marked complete \(\d+ checks? waived · source: command line · .+ · grokbot\)\./);

  // Retrying the same command id replays its receipt and saves no second waiver; changed inputs conflict.
  const retry = await cli(confirm); expect(retry.code, retry.stdout).toBe(0);
  expect(retry.json()).toMatchObject({ operation: { id: settled.operation.id, outcome: "marked_complete" } });
  expect(h.engine.record.waivers).toHaveLength(1);
  const conflict = await cli([...argv, "--by", "someone-else", "--json"]);
  expect(conflict.code).toBe(2); expect(conflict.json().errors).toEqual([expect.objectContaining({ code: "command_id_conflict" })]);
  const recheckRetry = await cli(["waive-and-advance", target(), "--only-if-status-matches", first, "--command-id", "grok-7c20", "--json"]);
  expect(recheckRetry.code).toBe(0); expect(recheckRetry.json()).toMatchObject({ operation: { id: checked.operation.id, action: "verify-and-advance" } });

  // The phase now reads complete with its waived check, never as passed.
  const after = (await cli(["status", target(), "--json"])).json();
  const row = (after.progress as { key: string; state: string; status_label: string; waived_checks: number; waivers: unknown[] }[]).find(r => r.key === "1")!;
  expect(row).toMatchObject({ state: "complete", status_label: expect.stringMatching(/^Complete · \d+ checks? waived$/), waivers: [expect.objectContaining({ waiver_id: settled.operation.waiver_id })] });
  expect(row.waived_checks).toBeGreaterThan(0);
  const statusText = await cli(["status", target()]);
  expect(statusText.stdout).toMatch(/Phase 1 .*complete · \d+ checks? waived \d{4}-\d\d-\d\d \d\d:\d\d \S+ · command line · .+ · grokbot/);
});

it("is busy for the browser and the command line while a Mark complete rerun is in flight", async () => {
  const { origin } = await stopped();
  const first = await token();
  await cli(["waive-and-advance", target(), "--only-if-status-matches", first, "--command-id", "recheck", "--json"]);
  const checked = await receipt("recheck"); const offered = checked.mark_complete as { next_argv: string[]; check_run_id: string };
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const engine = h.engine as unknown as { markComplete: (...args: unknown[]) => Promise<unknown> };
  const original = engine.markComplete.bind(h.engine);
  vi.spyOn(engine, "markComplete").mockImplementation(async (...args: unknown[]) => { await held; return original(...args); });
  const argv = offered.next_argv.slice(1).map(arg => arg === "<new-command-id>" ? "waiver-1" : arg);
  expect((await cli([...argv, "--json"])).code).toBe(0);
  await waitFor(() => !!h.engine.commands.active);
  const status = offered.next_argv[offered.next_argv.indexOf("--only-if-status-matches") + 1]!;
  for (const [action, id] of [["waive-and-advance", "second"], ["check-again", "again"], ["resume", "resume"]] as const) {
    const busy = await cli([action, target(), ...(action === "waive-and-advance" ? ["--confirm"] : []), "--only-if-status-matches", status, "--command-id", id, "--json"]);
    expect(busy.code, action).toBe(3); expect(busy.json().errors, action).toEqual([expect.objectContaining({ code: "busy" })]);
  }
  const headers = { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json", "X-Kiln-Status": status };
  const browser = await fetch(`${origin}/api/mark-complete`, { method: "POST", headers: { ...headers, "X-Kiln-Command-Id": "browser-second" }, body: JSON.stringify({ checkRunId: offered.check_run_id }) });
  expect(browser.status).toBe(409); expect(await browser.json()).toMatchObject({ ok: false, code: "busy" });
  release(); await h.engine.commands.settled();
  expect(h.engine.record.waivers).toHaveLength(1);
});

it("marks complete from the browser route with the page's token, command id and check run", async () => {
  const { origin } = await stopped();
  const post = async (path: string, status: string | undefined, id: string, body: unknown) => {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json", ...(status ? { "X-Kiln-Status": status } : {}), "X-Kiln-Command-Id": id }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const view = () => h.engine.controlView();
  // The status token is required and never substituted.
  expect((await post("/api/mark-complete", undefined, "no-token", { checkRunId: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b" })).status).toBe(400);
  expect((await post("/api/mark-complete", view().token, "bad-body", { checkRunId: "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b", reason: "works" })).status).toBe(400);
  const early = await post("/api/mark-complete", view().token, "early", { checkRunId: h.engine.record.phases["1"]!.stop!.run!.id });
  expect(early).toMatchObject({ status: 409, body: { ok: false, code: "mark_complete_not_offered" } });

  const stopTarget = h.engine.phaseRecoveryTarget();
  const recheck = await post("/api/check-again", view().token, "browser-recheck", { target: stopTarget, intent: "advance" });
  expect(recheck.status).toBe(200); expect(h.engine.record.waivers ?? []).toEqual([]);
  const offer = h.engine.markCompleteOffer();
  if (!offer.offered) throw new Error(`Mark complete not offered after a failed recheck: ${offer.reason}`);
  const pageToken = view().token;
  // A page that missed a newer check run is refused as stale rather than waiving what it did not show.
  const otherRun = await post("/api/mark-complete", pageToken, "other-run", { checkRunId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" });
  expect(otherRun).toMatchObject({ status: 409, body: { code: "stale_check_run" } });
  const marked = await post("/api/mark-complete", pageToken, "browser-mark", { checkRunId: offer.checkRunId });
  expect(marked).toMatchObject({ status: 200, body: { ok: true, outcome: "marked_complete", waiverId: expect.any(String), command_id: "browser-mark" } });
  expect(h.engine.record.waivers).toHaveLength(1);
  expect(h.engine.record.waivers![0]).toMatchObject({ waiverId: marked.body.waiverId, source: { via: "browser", account: userInfo().username } });
  expect(h.engine.record.waivers![0]!.source.by).toBeUndefined();
  // The same command id replays; the old token is now stale.
  expect(await post("/api/mark-complete", pageToken, "browser-mark", { checkRunId: offer.checkRunId })).toMatchObject({ status: 200, body: { waiverId: marked.body.waiverId } });
  expect((await post("/api/mark-complete", pageToken, "browser-again", { checkRunId: offer.checkRunId })).status).toBe(409);
  expect(h.engine.record.waivers).toHaveLength(1);
});

it("answers a replayed Mark complete whose rerun could not finish exactly as the first time, outcome included", async () => {
  const { origin } = await stopped();
  const post = async (path: string, status: string, id: string, body: unknown) => {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json", "X-Kiln-Status": status, "X-Kiln-Command-Id": id }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  expect((await post("/api/check-again", h.engine.controlView().token, "recheck", { target: h.engine.phaseRecoveryTarget(), intent: "advance" })).status).toBe(200);
  const offer = h.engine.markCompleteOffer();
  if (!offer.offered) throw new Error(`Mark complete not offered after a failed recheck: ${offer.reason}`);
  const engine = h.engine as unknown as { markComplete: (...args: unknown[]) => Promise<unknown> };
  vi.spyOn(engine, "markComplete").mockResolvedValue({ ok: false, code: "check_unavailable", reason: "The worktree is missing.", status: 503 });
  const pageToken = h.engine.controlView().token;
  const first = await post("/api/mark-complete", pageToken, "unavailable", { checkRunId: offer.checkRunId });
  expect(first).toMatchObject({ status: 503, body: { ok: false, outcome: "check_unavailable", code: "check_unavailable", command_id: "unavailable" } });
  const replay = await post("/api/mark-complete", pageToken, "unavailable", { checkRunId: offer.checkRunId });
  expect(replay).toMatchObject({ status: 503, body: { ok: false, outcome: "check_unavailable", code: "check_unavailable", reason: first.body.reason, command_id: "unavailable" } });
  expect(h.engine.record.waivers ?? []).toEqual([]);
});

it("at a standard Needs you stop, rechecks as check-again without --confirm and returns the Mark complete preview to repeat with --confirm", async () => {
  // Every phase lands; the final-delivery session opens no pull request, so final delivery stops on Pull request open.
  const landing = (file: string) => ({ actions: [{ write: { path: file, content: "work\n" } }, { close: true }, { commit: "feat: the phase" }, { push: true }, { result: "Phase landed." }, { exit: 0 }] });
  h = await createHarness({ sessions: [landing("src/one.txt"), landing("src/two.txt"), landing("src/three.txt"), { actions: [{ result: "Could not open the pull request here." }, { exit: 0 }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("pr");
  expect(h.engine.phaseRecoveryTarget()).toBeUndefined();
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  const port = boundPort(server.address);
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });

  const first = await token();
  // check-again takes no hand-back inputs.
  expect((await cli(["waive-and-advance", target(), "--without-sending-reply", "--only-if-status-matches", first, "--command-id", "with-reply-flag", "--json"])).code).toBe(2);
  const recheck = await cli(["waive-and-advance", target(), "--only-if-status-matches", first, "--command-id", "final-recheck", "--json"]);
  expect(recheck.code, recheck.stdout).toBe(0);
  expect(recheck.json()).toMatchObject({ ok: true, operation: { action: "check-again" } });
  const checked = await receipt("final-recheck");
  expect(checked.operation).toMatchObject({ action: "check-again", state: "completed", outcome: "completion_checks_failed", effects: { plan: "not_advanced" } });
  expect(h.engine.record.waivers ?? []).toEqual([]);
  const fresh = await token();
  expect(checked.mark_complete).toMatchObject({ offered: true, label: "Mark final delivery complete", next_activity: { kind: "complete" }, next_argv: ["kiln", "waive-and-advance", target(), "--confirm", "--only-if-status-matches", fresh, "--command-id", "<new-command-id>"] });
  const text = await cli(["command-status", target(), "--command-id", "final-recheck"]);
  expect(text.stdout).toContain("Marking it complete would waive:");

  // Following the preview's argv with a new command id marks final delivery complete.
  const argv = (checked.mark_complete!.next_argv as string[]).slice(1).map(arg => arg === "<new-command-id>" ? "final-mark" : arg);
  expect((await cli([...argv, "--json"])).code).toBe(0);
  expect((await receipt("final-mark")).operation).toMatchObject({ action: "waive-and-advance", state: "completed", outcome: "marked_complete", effects: { plan: "advanced" } });
  expect(h.engine.record.completedAt).toEqual(expect.any(String));
  expect(h.engine.record.waivers).toEqual([expect.objectContaining({ activityKey: "pr", activityKind: "final_delivery", source: expect.objectContaining({ via: "command_line" }) })]);
});
