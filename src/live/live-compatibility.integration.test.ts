// Live control on newer Claude Code through the real engine (kiln-public-release-readiness
// Phase 2): AC-AGENT-03, Message Claude and Pause & take over are offered on any Claude Code at
// or above the minimum; AC-AGENT-04, when Kiln stops recognising a receipt field, a hook input or
// a live launch argument, that feature turns off with a compatibility notice and the phase still
// completes, a later attempt on that version starts without it, another version clears it, and
// an accepted takeover keeps its hold until the attempt ends. The stand-in runs the packaged
// checkpoint hook for each tool call, as Claude Code does with --settings.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { canonicalLiveTarget, type LiveTarget } from "./target.js";
import { readGate } from "./gate.js";
import type { Receipt } from "../control/commands.js";
import { git } from "../test-support/git-repositories.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { readPrdRecord } from "../state/records.js";
import { statusCompatibility } from "../engine/compatibility-notices.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });
const darwin = it.skipIf(process.platform !== "darwin");

/** The scenario is built once the sandbox exists, since its pauses name files in it. */
async function start(version: string, sessions: () => ScenarioSession[], env: Record<string, string> = {}) {
  h = await createHarness({ sessions: [] });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: sessions() }));
  Object.assign(h.env, { KILN_STANDIN_VERSION: version, ...env });
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  return h;
}
const file = (name: string) => join(h!.sandbox.root, name);
const landing = (path: string, before: Record<string, unknown>[] = []): ScenarioSession => ({ actions: [...before, ...landingSession(path).actions] });
const paused = (name: string) => [{ touch: file(`${name}-ready`) }, { waitForFile: file(`${name}-release`) }];
const run = (phase: string) => h!.engine.latestSession(phase)!.runs.at(-1)!;
/** An instruction is accepted once Kiln's own launch receipt has settled. */
const idle = () => waitFor(() => !h!.engine.commands.busy);
const submit = (action: "message" | "take-over", id: string, target: LiveTarget, text?: string) => h!.engine.commands.submit({ command_id: id, execution_id: target.executionId, status_token: JSON.stringify(canonicalLiveTarget(target)), action, inputs: { target, ...(text === undefined ? {} : { text }) } });
/** A refused instruction's code and reason: the control's own unavailable reason. */
const refusal = (answer: { ok: boolean; errors: { code: string; message: string }[] }) => (answer.ok ? undefined : { code: answer.errors[0]!.code, message: answer.errors[0]!.message });
const hookCalls = () => readFileSync(`${h!.scenarioPath}.hooks.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as { event: string; status: number; stdout: string; input: Record<string, unknown> });

darwin("Message Claude: a receipt field in another form turns messaging off with a notice while the phase completes; that version starts without it, another clears it", async () => {
  const MESSAGE = "Message Claude unavailable with Claude Code 2.1.320: user_message_uuids was not a list of message IDs";
  await start("2.1.320", () => [
    landing("src/one.txt", [{ rawEvent: { type: "assistant", user_message_uuids: "not-a-list", message: { content: [{ type: "text", text: "Reading." }] } }, withNewline: true }, ...paused("one")]),
    landing("src/two.txt", paused("two")),
    landing("src/three.txt", paused("three")),
  ]);
  // The same attempt: messaging turns off at once, read back from the saved session, and Kiln refuses a message.
  await waitFor(() => existsSync(file("one-ready")));
  await waitFor(() => h!.engine.liveView()?.input?.reason === `${MESSAGE}.`);
  expect(h!.engine.liveView()).toMatchObject({ available: true, input: { available: false } });
  expect(run("1").live).toMatchObject({ profile: "claude-code-2.1.320/darwin", messageContract: "unrecognised", hookContract: "unproven" });
  await idle(); expect(refusal(submit("message", "same-attempt", h!.engine.liveTarget()!, "hello"))).toEqual({ code: "control_unavailable", message: `${MESSAGE}.` });
  writeFileSync(file("one-release"), "");
  await waitFor(() => existsSync(file("two-ready")));
  expect(h!.engine.record.phases["1"]!.doneAt).toEqual(expect.any(String));
  expect(h!.engine.record.compatibility).toEqual([expect.objectContaining({ feature: "live_messages", agentId: "claude_code", agentVersion: "2.1.320", detail: "user_message_uuids was not a list of message IDs", attemptId: h!.engine.latestSession("1")!.runs.at(-1)!.live!.attemptId })]);
  // The next attempt on the version the notice names launches without --replay-user-messages.
  expect(h!.claudeCalls()[1]!.args).not.toContain("--replay-user-messages"); expect(h!.claudeCalls()[1]!.args).toContain("--settings");
  expect(run("2b").live).toMatchObject({ literalInput: false, messageContract: "unrecognised", hookContract: "unproven" });
  expect(h!.engine.liveView()).toMatchObject({ available: true, input: { available: false, reason: `${MESSAGE}.` } });
  await idle(); expect(refusal(submit("message", "refused", h!.engine.liveTarget()!, "hello"))).toEqual({ code: "control_unavailable", message: `${MESSAGE}.` });
  expect(buildSnapshot(h!.engine).compatibility).toEqual([MESSAGE]);
  // An attempt on another version drops the notice and offers messaging again.
  h!.env.KILN_STANDIN_VERSION = "2.1.321";
  writeFileSync(file("two-release"), "");
  await waitFor(() => existsSync(file("three-ready")));
  expect(h!.engine.record.compatibility).toBeUndefined();
  expect(h!.claudeCalls()[2]!.args).toContain("--replay-user-messages");
  expect(run("3").live).toMatchObject({ profile: "claude-code-2.1.321/darwin", literalInput: true, messageContract: "unproven" });
  expect(h!.engine.liveView()?.input?.available).toBe(true);
  writeFileSync(file("three-release"), "");
  await h!.engine.settled();
  expect(h!.engine.record.phases["3"]!.doneAt).toEqual(expect.any(String));
});

darwin("Message Claude: a message awaiting its receipt when the contract becomes unrecognised shows Delivery uncertain, and the attempt still ends", async () => {
  await start("2.1.320", () => [{ actions: [...paused("one"), { liveMessages: 1, malformedUuids: true }, { result: "Done." }] }]);
  await waitFor(() => existsSync(file("one-ready")));
  await waitFor(() => h!.engine.liveView()?.input?.available === true); await idle();
  expect(submit("message", "m1", h!.engine.liveTarget()!, "Please also check the totals.").ok).toBe(true);
  await h!.engine.commands.settled();
  writeFileSync(file("one-release"), "");
  await waitFor(() => !!h!.engine.latestSession("1")!.runs.at(-1)!.endedAt);
  const receipt = h!.engine.commands.lookup("m1").operation as Receipt;
  expect(receipt.message).toMatchObject({ delivery: "uncertain" });
  expect(h!.engine.record.liveControl?.takeover.kind).toBe("delivery_recovery");
  expect(h!.engine.record.compatibility).toEqual([expect.objectContaining({ feature: "live_messages", detail: "user_message_uuids was not a list of message IDs" })]);
  expect(run("1")).toMatchObject({ exitCode: 0 }); expect(run("1").signal).toBeUndefined();
});

for (const mutation of ["no-tool-use-id", "no-post-tool-use-id"] as const) {
  const detail = mutation === "no-tool-use-id" ? "PreToolUse hook input had no tool_use_id" : "PostToolUse hook input had no tool_use_id";
  darwin(`Pause & take over (${mutation}): an unrecognised hook input lets the tool run, turns takeover off with a notice while the phase completes, and that version starts without the hook`, async () => {
    const NOTICE = `Pause & take over unavailable with Claude Code 2.1.320: ${detail}`;
    await start("2.1.320", () => [landing("src/one.txt", [{ bash: `echo FIRST > ${JSON.stringify(file("first.txt"))}` }]), landing("src/two.txt", paused("two")), landing("src/three.txt", paused("three"))], { KILN_STANDIN_HOOK_MUTATION: mutation });
    await waitFor(() => existsSync(file("two-ready")));
    expect(h!.engine.record.phases["1"]!.doneAt).toEqual(expect.any(String));
    const first = h!.engine.latestSession("1")!.runs.at(-1)!;
    expect(existsSync(file("first.txt"))).toBe(true);
    expect(hookCalls().filter(call => call.event === "PreToolUse").every(call => call.status === 0), JSON.stringify(hookCalls())).toBe(true);
    expect(first.live).toMatchObject({ messageContract: "unproven", hookContract: "unrecognised" });
    expect(readGate(first.live!.gateDirectory).contract).toMatchObject({ state: "unrecognised", detail });
    // Any operation the hook admitted was settled by its tool result in the stream.
    expect(Object.values(readGate(first.live!.gateDirectory).operations).every(operation => operation.settled)).toBe(true);
    expect(h!.engine.record.compatibility).toEqual([expect.objectContaining({ feature: "takeover", agentVersion: "2.1.320", detail })]);
    expect(h!.claudeCalls()[1]!.args).not.toContain("--settings"); expect(h!.claudeCalls()[1]!.args).toContain("--replay-user-messages");
    expect(run("2b").live).toMatchObject({ hookContract: "unrecognised", messageContract: "unproven" });
    expect(h!.engine.liveView()).toMatchObject({ available: false, reason: `${NOTICE}.`, input: { available: true } });
    await idle(); expect(refusal(submit("take-over", "refused", h!.engine.liveTarget()!))).toEqual({ code: "control_unavailable", message: `${NOTICE}.` });
    // An attempt on another version drops the notice and launches with the hook again.
    h!.env.KILN_STANDIN_VERSION = "2.1.321"; delete h!.env.KILN_STANDIN_HOOK_MUTATION;
    writeFileSync(file("two-release"), "");
    await waitFor(() => existsSync(file("three-ready")));
    expect(h!.engine.record.phases["2b"]!.doneAt).toEqual(expect.any(String));
    expect(h!.engine.record.compatibility).toBeUndefined();
    expect(h!.claudeCalls()[2]!.args).toContain("--settings");
    expect(run("3").live).toMatchObject({ hookContract: "unproven" });
    expect(h!.engine.liveView()?.available).toBe(true);
    writeFileSync(file("three-release"), "");
    await h!.engine.settled();
  });
}

for (const mutation of ["no-tool-use-id", "no-post-tool-use-id"] as const) {
  darwin(`Pause & take over (${mutation}): an accepted takeover keeps its hold, keeps denying new tools, interrupts nothing and releases once the attempt has exited`, async () => {
    // no-tool-use-id: the first hook input after the hold is a new tool's PreToolUse.
    // no-post-tool-use-id: a tool admitted before the hold finishes after it.
    const inFlight = mutation === "no-post-tool-use-id";
    const actions = () => inFlight
      ? [{ bash: `while [ ! -f ${JSON.stringify(file("one-release"))} ]; do sleep 0.05; done; echo FIRST > ${JSON.stringify(file("first.txt"))}` }, { bash: `echo SECOND > ${JSON.stringify(file("second.txt"))}` }, { result: "Unreached." }]
      : [...paused("one"), { bash: `echo SECOND > ${JSON.stringify(file("second.txt"))}` }, { result: "Unreached." }];
    await start("2.1.320", () => [{ actions: actions() }], { KILN_STANDIN_HOOK_MUTATION: mutation });
    const admitted = () => { const live = h!.engine.latestSession("1")?.runs.at(-1)?.live; return !!live && Object.values(readGate(live.gateDirectory).operations).some(o => o.name === "Bash"); };
    await waitFor(() => inFlight ? admitted() : existsSync(file("one-ready")));
    const reasons: string[] = []; const releasedBeforeExit: boolean[] = [];
    h!.engine.onChange(() => {
      const reason = h!.engine.liveView()?.reason; if (reason) reasons.push(reason);
      if (h!.engine.record.liveControl?.takeover.state === "released") releasedBeforeExit.push(!h!.engine.latestSession("1")!.runs.at(-1)!.endedAt);
    });
    await idle();
    const accepted = submit("take-over", "hold", h!.engine.liveTarget()!);
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
    await h!.engine.commands.settled();
    expect(h!.engine.record.liveControl?.takeover.state).toBe("pending");
    writeFileSync(file("one-release"), "");
    await waitFor(async () => { await h!.engine.reconcileTakeover(); return h!.engine.record.liveControl?.takeover.state === "released"; });
    expect(existsSync(file("second.txt"))).toBe(false);
    if (inFlight) expect(existsSync(file("first.txt"))).toBe(true);
    const ended = run("1");
    expect(ended.signal).toBeUndefined(); expect(ended.exitCode).toBe(0); expect(ended.interruptedBy).toBeUndefined();
    expect(readGate(ended.live!.gateDirectory)).toMatchObject({ held: { operationId: expect.any(String) }, contract: { state: "unrecognised" } });
    expect(h!.engine.record.compatibility).toEqual([expect.objectContaining({ feature: "takeover", agentVersion: "2.1.320" })]);
    expect(reasons.some(reason => reason.includes("The safe checkpoint can't be used, so Kiln is waiting for this attempt and its processes to end."))).toBe(true);
    expect(releasedBeforeExit).not.toContain(true);
    const pre = hookCalls().filter(call => call.event === "PreToolUse");
    if (inFlight) {
      // The tool admitted before the hold finished; the batch checkpoint ended the turn, so no new tool was attempted.
      expect(pre).toHaveLength(1);
      expect(hookCalls().filter(call => call.event === "PostToolBatch").map(call => JSON.parse(call.stdout))).toEqual([expect.objectContaining({ continue: false })]);
    } else expect(pre.at(-1)!.status).toBe(2); // Unrecognised input while held fails closed and the tool is blocked.
  });
}

darwin("Live launch arguments: a Claude Code that rejects --replay-user-messages relaunches the same attempt once without live control, recorded, and the phase completes", async () => {
  await start("2.1.320", () => [landing("src/one.txt"), landing("src/two.txt", paused("two")), landing("src/three.txt", paused("three"))], { KILN_STANDIN_REJECT_ARGUMENT: "--replay-user-messages" });
  await waitFor(() => existsSync(file("two-ready")));
  expect(h!.engine.record.phases["1"]!.doneAt).toEqual(expect.any(String));
  const session = h!.engine.latestSession("1")!;
  expect(session.runs).toHaveLength(1);
  const only = session.runs[0]!;
  expect(only.live).toMatchObject({ literalInput: false, messageContract: "unrecognised", hookContract: "unrecognised", rejectedLaunch: { argument: "--replay-user-messages", exitCode: 1, at: expect.any(String) } });
  expect(only.control?.attemptId).toBe(only.live!.attemptId);
  expect(readFileSync(`${h!.scenarioPath}.rejected.jsonl`, "utf8").trim().split("\n")).toHaveLength(1);
  expect(h!.claudeCalls()[0]!.args).not.toContain("--replay-user-messages"); expect(h!.claudeCalls()[0]!.args).not.toContain("--settings");
  expect(h!.engine.record.compatibility?.map(notice => [notice.feature, notice.agentVersion, notice.detail])).toEqual([["live_messages", "2.1.320", "--replay-user-messages was rejected at launch"], ["takeover", "2.1.320", "--replay-user-messages was rejected at launch"]]);
  // The next attempt on that version launches without either live argument, so nothing is rejected again.
  expect(h!.claudeCalls()[1]!.args).not.toContain("--replay-user-messages"); expect(h!.claudeCalls()[1]!.args).not.toContain("--settings");
  expect(run("2b").live).toMatchObject({ literalInput: false, messageContract: "unrecognised", hookContract: "unrecognised" }); expect(run("2b").live!.rejectedLaunch).toBeUndefined();
  expect(h!.engine.liveView()).toMatchObject({
    available: false, reason: "Pause & take over unavailable with Claude Code 2.1.320: --replay-user-messages was rejected at launch.",
    input: { available: false, reason: "Message Claude unavailable with Claude Code 2.1.320: --replay-user-messages was rejected at launch." },
  });
  expect(readFileSync(`${h!.scenarioPath}.rejected.jsonl`, "utf8").trim().split("\n")).toHaveLength(1);
  // A Claude Code that takes both arguments again, on another version, clears both notices.
  h!.env.KILN_STANDIN_VERSION = "2.1.321"; delete h!.env.KILN_STANDIN_REJECT_ARGUMENT;
  writeFileSync(file("two-release"), "");
  await waitFor(() => existsSync(file("three-ready")));
  expect(h!.engine.record.compatibility).toBeUndefined();
  expect(h!.claudeCalls()[2]!.args).toEqual(expect.arrayContaining(["--replay-user-messages", "--settings"]));
  writeFileSync(file("three-release"), ""); await h!.engine.settled();
});

darwin("Live launch arguments: an exit before the first event that names no live argument stays the launch failure it is, with no relaunch and no notice", async () => {
  // The stand-in rejects --model, which every launch passes: the error names an argument, but not a live one.
  await start("2.1.320", () => [landing("src/one.txt")], { KILN_STANDIN_REJECT_ARGUMENT: "--model" });
  await h!.engine.settled();
  expect(readFileSync(`${h!.scenarioPath}.rejected.jsonl`, "utf8").trim().split("\n")).toHaveLength(1);
  const only = h!.engine.latestSession("1")!.runs;
  expect(only).toHaveLength(1);
  expect(only[0]).toMatchObject({ exitCode: 1, live: { messageContract: "unproven", hookContract: "unproven", literalInput: true } });
  expect(only[0]!.live!.rejectedLaunch).toBeUndefined();
  expect(h!.engine.record.compatibility).toBeUndefined();
  expect(h!.engine.record.phases["1"]!.doneAt).toBeUndefined();
  expect(h!.engine.record.phases["1"]!.stop).toBeDefined();
});

darwin("Version comparison: a failing claude --version launches without live control, names both features with the version unrecognised, and a readable version clears them", async () => {
  const detail = "claude --version failed";
  await start("2.1.320", () => [landing("src/one.txt", paused("one")), landing("src/two.txt", paused("two"))], { KILN_STANDIN_VERSION_FAILS: "1" });
  await waitFor(() => existsSync(file("one-ready")));
  expect(run("1").live).toBeUndefined();
  expect(h!.claudeCalls()[0]!.args).not.toContain("--replay-user-messages"); expect(h!.claudeCalls()[0]!.args).not.toContain("--settings");
  expect(h!.engine.record.compatibility?.map(notice => [notice.feature, notice.agentVersion, notice.detail, notice.attemptId])).toEqual([["live_messages", "unrecognised", detail, run("1").control!.attemptId], ["takeover", "unrecognised", detail, run("1").control!.attemptId]]);
  expect(h!.engine.liveView()).toMatchObject({ available: false, reason: `Pause & take over unavailable with Claude Code unrecognised: ${detail}.`, input: { available: false, reason: `Message Claude unavailable with Claude Code unrecognised: ${detail}.` } });
  await idle(); expect(refusal(submit("take-over", "refused", h!.engine.liveTarget()!))).toEqual({ code: "control_unavailable", message: `Pause & take over unavailable with Claude Code unrecognised: ${detail}.` });
  expect(buildSnapshot(h!.engine).compatibility).toEqual([`Message Claude unavailable with Claude Code unrecognised: ${detail}`, `Pause & take over unavailable with Claude Code unrecognised: ${detail}`]);
  // kiln status reads the saved record, so it names both with the controller stopped.
  expect(statusCompatibility(readPrdRecord(h!.stateDirectory)!)).toEqual(["live_messages", "takeover"].map(feature => ({ feature, agent: "claude_code", agent_version: "unrecognised", detail, attempt_id: run("1").control!.attemptId, observed_at: expect.any(String) })));
  // The run keeps working, and an attempt on a version Kiln reads drops both notices and offers live control again.
  delete h!.env.KILN_STANDIN_VERSION_FAILS;
  writeFileSync(file("one-release"), "");
  await waitFor(() => existsSync(file("two-ready")));
  expect(h!.engine.record.phases["1"]!.doneAt).toEqual(expect.any(String));
  expect(h!.engine.record.compatibility).toBeUndefined();
  expect(run("2b").live).toMatchObject({ agentVersion: "2.1.320", messageContract: "unproven", hookContract: "unproven" });
  writeFileSync(file("two-release"), ""); await h!.engine.settled();
});

for (const when of ["still running", "exited"] as const) {
  darwin(`Pause & take over after a restart: a hook input first seen once Kiln has restarted, with the attempt ${when}, writes its notice and marks the attempt's hook contract unrecognised`, async () => {
    const detail = "PreToolUse hook input had no tool_use_id";
    h = await createHarness({ sessions: [] }); h.engine.close();
    // The provider must survive the killed controller, but not its owning test worker.
    Object.assign(h.env, { KILN_STANDIN_VERSION: "2.1.320", KILN_STANDIN_HOOK_MUTATION: "no-tool-use-id", KILN_STANDIN_OWNER_PID: String(process.pid) });
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [...paused("one"), { bash: `echo FIRST > ${JSON.stringify(file("first.txt"))}` }, ...paused("two"), { result: "Done after the restart." }] }] }));
    // A controller in its own process, so it can die without observing the hook's gate write.
    const optionsPath = file("controller-options.json");
    writeFileSync(optionsPath, JSON.stringify({ paths: h.engine.paths, tools: h.tools, record: h.engine.record, stateDirectory: h.stateDirectory, prdTree: git(h.sandbox, h.repository, "rev-parse", "HEAD:docs/prds/customer-returns").trim() }), { mode: 0o600 });
    const enginePath = fileURLToPath(new URL("../../dist/engine/engine.js", import.meta.url));
    const code = `import{readFileSync}from'node:fs';import{Engine}from${JSON.stringify(enginePath)};const options=JSON.parse(readFileSync(process.argv[1],'utf8'));const engine=new Engine({...options,env:process.env,sleepReader:{next:async()=>[]}});await engine.agents.refresh();const result=await engine.start({refinementConfirmed:true});if(!result.ok)throw new Error(JSON.stringify(result));`;
    const controller = spawn(process.execPath, ["--input-type=module", "-e", code, optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] }); const exited = once(controller, "exit");
    let diagnostic = ""; controller.stderr!.on("data", chunk => { diagnostic += String(chunk); });
    try {
      await waitFor(() => { if (controller.exitCode !== null) throw new Error(diagnostic || `Controller exited ${controller.exitCode}`); return existsSync(file("one-ready")); }, 30000);
      const key = readPrdRecord(h.stateDirectory)!.activities!.find(a => a.kind === "implementation")!.key;
      const saved = () => h!.engine.sessionRecord(key, readPrdRecord(h!.stateDirectory)!.phases[key]!.sessionIds.at(-1)!)!.runs.at(-1)!;
      const attempt = saved();
      // Kill between gate writes. A kill inside one leaves the gate's lock without a known owner,
      // which Kiln never breaks, so the hook could record nothing. The paused provider sends no
      // more events, so a quarter second with the lock free means the controller has gone quiet.
      const lock = join(attempt.live!.gateDirectory, "admission.lock");
      await waitFor(async () => { if (existsSync(lock)) return false; await new Promise(resolve => setTimeout(resolve, 250)); return !existsSync(lock); });
      controller.kill("SIGKILL"); await exited;
      expect(attempt.live).toMatchObject({ agentVersion: "2.1.320", hookContract: "unproven" });
      // The checkpoint hook meets the unrecognised input with no controller watching: before the
      // restart for an attempt that then exits, after it for one Kiln recovers still running.
      const hookMeetsInput = async () => {
        writeFileSync(file("one-release"), "");
        await waitFor(() => existsSync(file("two-ready")));
        const hooks = `${h!.scenarioPath}.hooks.jsonl`;
        expect(readGate(attempt.live!.gateDirectory).contract, existsSync(hooks) ? readFileSync(hooks, "utf8").trim().split("\n").at(-1) : "no hook ran").toMatchObject({ state: "unrecognised", detail });
      };
      if (when === "exited") {
        await hookMeetsInput();
        expect(readPrdRecord(h.stateDirectory)!.compatibility).toBeUndefined();
        writeFileSync(file("two-release"), ""); await waitFor(async () => !await isProcessLive(attempt.pid!, attempt.processStartTime));
      }
      h.engine = h.reopenFromDisk(); await h.engine.prepare(); await h.engine.decide();
      if (when === "still running") {
        expect(h.engine.record.compatibility).toBeUndefined();
        await hookMeetsInput();
      }
      await waitFor(() => saved().live?.hookContract === "unrecognised");
      const notice = { feature: "takeover", agentId: "claude_code", agentVersion: "2.1.320", detail, attemptId: attempt.live!.attemptId };
      expect(h.engine.record.compatibility).toEqual([expect.objectContaining(notice)]);
      // Saved, so the panel and kiln status name it with the controller stopped.
      expect(readPrdRecord(h.stateDirectory)!.compatibility).toEqual([expect.objectContaining(notice)]);
      expect(statusCompatibility(readPrdRecord(h.stateDirectory)!)).toEqual([expect.objectContaining({ feature: "takeover", agent: "claude_code", agent_version: "2.1.320", detail })]);
      expect(buildSnapshot(h.engine).compatibility).toEqual([`Pause & take over unavailable with Claude Code 2.1.320: ${detail}`]);
      if (when === "still running") { writeFileSync(file("two-release"), ""); await waitFor(async () => !await isProcessLive(attempt.pid!, attempt.processStartTime)); }
    } finally { if (controller.exitCode === null && controller.signalCode === null) controller.kill("SIGKILL"); await exited; }
  });
}
