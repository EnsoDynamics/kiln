// Real controller, durable journal, HTTP and disposable Git. The scripted stream uses
// verified CLI UUID-set shapes; scripts/proof-run/live-messages.mjs proves the real adapter.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort, reservePort } from "../test-support/os-ports.js";
import { readGate } from "./gate.js";
import { readReceipts, type Receipt } from "../control/commands.js";
import { buildSnapshot } from "../engine/snapshot.js";
let h: Harness; let server: LocalServer | undefined; let origin: string;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); server = undefined; await h?.cleanup(); });
async function setup(actions: object[]) {
  h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, ...actions.map(a => (a as { waitForFile?: string }).waitForFile === "release" ? { waitForFile: join(h.sandbox.root, "release") } : a)] }, { actions: [{ result: "Continued." }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready));
  await waitFor(() => h.engine.liveView()?.input?.available === true);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token }); origin = `http://127.0.0.1:${boundPort(server.address)}`;
  return h.engine.liveTarget()!;
}
async function post(path: string, body: unknown, token = h.engine.record.token) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as { receipt: Receipt; outcome?: string; code?: string } };
}
const receipt = (id: string) => h.engine.commands.lookup(id).operation as Receipt;
const inputs = () => readFileSync(`${h.scenarioPath}.live-inputs.jsonl`, "utf8").trim().split("\n").map(s => JSON.parse(s) as { uuid: string; text_not_typed: boolean; message: { content: string } });
it.skipIf(process.platform !== "darwin")("preserves literal text/order and the same attempt through a first result and a coalesced second result", async () => {
  const target = await setup([{ waitForFile: "release" }, { result: "Opening turn only." }, { liveMessages: 2 }]);
  const texts = ["  /command @file 'quotes'\n$(do-not-execute)  ", "\nsecond message\n"];
  expect((await post("live/message", { instructionId: "first", target, text: texts[0] }, "bad")).status).toBe(403);
  expect((await post("live/message", { instructionId: "first", target, text: texts[0] })).status).toBe(202);
  await h.engine.commands.settled();
  expect(receipt("first").message?.delivery).toBe("submitted");
  expect((await post("live/message", { instructionId: "first", target, text: texts[0] })).status).toBe(202);
  expect((await post("live/message", { instructionId: "first", target, text: "different" })).status).toBe(409);
  expect((await post("live/message", { instructionId: "second", target, text: texts[1] })).status).toBe(202);
  writeFileSync(join(h.sandbox.root, "release"), "done");
  await h.engine.settled();
  expect(inputs().map(i => i.message.content)).toEqual(texts);
  expect(inputs().every(i => i.text_not_typed)).toBe(true);
  expect(inputs().map(i => i.uuid)).toEqual([receipt("first").message!.uuid, receipt("second").message!.uuid]);
  for (const id of ["first", "second"]) { const r = receipt(id); expect(r.message).toMatchObject({ delivery: "received", resultAt: expect.any(String) }); expect(r.effects).toMatchObject({ message: "received", session: "not_started", plan: "not_advanced" }); }
  expect(h.claudeCalls()).toHaveLength(1);
  expect((await post("live/message", { instructionId: "late", target, text: "late" })).status).toBe(409);
  expect(inputs()).toHaveLength(2);
});
it.skipIf(process.platform !== "darwin")("rejects invalid input before delivery and closes admission at 32 inputs even after assistant-only read evidence", async () => {
  const target = await setup([{ liveMessages: 32, readOnly: true }, { waitForFile: "release" }, { result: "Uncorrelated ending." }, { exitNow: 0 }]);
  for (const text of ["  ", "\0", "\ud800", "x".repeat(4001)]) expect((await post("live/message", { instructionId: "invalid", target, text })).status).toBe(text.length > 4000 ? 413 : 400);
  for (let i = 0; i < 32; i++) { const answer = await post("live/message", { instructionId: `m${i}`, target, text: `message ${i}` }); expect(answer.status, JSON.stringify(answer.body)).toBe(202); await h.engine.commands.settled(); }
  await waitFor(() => receipt("m31").message?.delivery === "received");
  expect(h.engine.liveView()?.input).toMatchObject({ available: false, pending: 32 });
  expect((await post("live/message", { instructionId: "overflow", target, text: "keep this draft" })).status).toBe(409);
  expect(receipt("overflow").message?.delivery).toBe("not_sent");
  writeFileSync(join(h.sandbox.root, "release"), "done");
  await h.engine.settled();
  expect(receipt("m0").message).toMatchObject({ delivery: "uncertain", receivedAt: expect.any(String) });
  expect(h.engine.record.liveControl?.takeover.kind).toBe("delivery_recovery");
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
});
it.skipIf(process.platform !== "darwin")("holds uncertain delivery through restart and human acknowledgement, and resumes only by explicit hand-back", async () => {
  const target = await setup([{ liveMessages: 1, uncorrelated: true, exitAfter: true }]);
  await post("live/message", { instructionId: "uncertain", target, text: "  inspect this exact instruction\n" });
  await h.engine.settled();
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
  expect(receipt("uncertain").message?.delivery).toBe("uncertain");
  expect((await post("live/message", { instructionId: "uncertain", target, text: "  inspect this exact instruction\n" })).status).toBe(202);
  expect(inputs()).toHaveLength(1);
  const stop = buildSnapshot(h.engine).needsYou!;
  expect(stop.resumeCommand).toContain(target.providerSessionId);
  expect(await h.engine.resume({ target: stop.phaseRecovery!.target })).toMatchObject({ ok: false });
  expect((await post("live/message-review", { instructionId: "wrong", target: { ...target, attemptId: "other" }, receiptIds: [receipt("uncertain").id] })).status).toBe(409);
  const reviewed = await post("live/message-review", { instructionId: "review", target, receiptIds: [receipt("uncertain").id] }); expect(reviewed.status).toBe(200);
  expect(receipt("uncertain").message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String) });
  expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect((await h.engine.decide()).kind).toBe("needs_you"); expect(inputs()).toHaveLength(1);
  expect(h.engine.record.liveControl).toBeDefined();
  const recovery = h.engine.phaseRecoveryTarget()!;
  expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "resume_requested" });
  await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2); expect(h.engine.record.liveControl).toBeUndefined();
  expect(receipt("uncertain").message?.resolvedBy).toBeDefined();
  h.engine = h.reopenFromDisk(); await h.engine.prepare(); expect(h.engine.record.liveControl).toBeUndefined(); expect(inputs()).toHaveLength(1);
});
it.skipIf(process.platform !== "darwin")("serializes takeover against message delivery and refuses messages after takeover", async () => {
  const target = await setup([{ sleepFor: 1500 }, { result: "Ended under hold." }]);
  const [message, takeover] = await Promise.all([post("live/message", { instructionId: "race-message", target, text: "Never send to another owner" }), post("live/take-over", { instructionId: "race-takeover", target })]);
  expect([202, 409]).toContain(message.status); expect([202, 409]).toContain(takeover.status);
  await h.engine.commands.settled();
  if (!h.engine.record.liveControl) expect((await post("live/take-over", { instructionId: "takeover-after-write", target })).status).toBe(202);
  expect((await post("live/message", { instructionId: "after-hold", target, text: "Not sent" })).status).toBe(409);
  await h.engine.settled(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  const session = h.engine.latestSession("1")!; expect(readGate(session.runs[0]!.live!.gateDirectory).held).toBeDefined();
});

it.skipIf(process.platform !== "darwin").each(["intent", "write_started", "write_completed", "evidence", "review", "partial_review", "saved_reverseOrder", "saved_wrongSession", "saved_crossEvent", "resume_review", "resume_partial_review", "verify_review", "verify_partial_review", "resume_dispatch_review"])("reconciles an actual supervisor death at the %s boundary without resend or advancement", async boundary => {
  h = await createHarness({ sessions: [] }); h.engine.close(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  // These proofs intentionally keep the provider alive after its controller dies.
  // The test worker owns its lifetime, so an interrupted suite still cleans it up.
  h.env.KILN_STANDIN_OWNER_PID = String(process.pid);
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release"); const killedAt = join(h.sandbox.root, "boundary");
  // At write_completed the callback may settle before the provider's replay.
  // Keep the fixture quiet until release so SIGKILL cannot race an echo into a
  // closed stdout pipe. The stdin reader still independently records the input.
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, ...(boundary === "intent" || boundary === "write_started" || boundary === "write_completed" ? [] : [{ liveMessages: boundary.includes("partial_review") || boundary.startsWith("saved_") ? 2 : 1, ...(boundary.startsWith("saved_") ? { ...(boundary === "saved_crossEvent" ? { consumptionEvents: [{ type: "result", indices: [1] }, { type: "result", indices: [0] }] } : { [boundary.slice(6)]: true }) } : boundary === "evidence" ? {} : { uncorrelated: true }), ...(boundary.endsWith("review") ? { exitAfter: true } : {}) }]), { waitForFile: release }, { result: "Old attempt ended naturally." }, { exitNow: 0 }] }] }));
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url");
  const { readPrdRecord } = await import("../state/records.js"); const { git } = await import("../test-support/git-repositories.js"); const { isProcessLive } = await import("../platform/process-start-time.js");
  const port = await reservePort();
  const optionsPath = join(h.sandbox.root, "options.json"); writeFileSync(optionsPath, JSON.stringify({ paths: h.engine.paths, tools: h.tools, record: h.engine.record, stateDirectory: h.stateDirectory, prdTree: git(h.sandbox, h.repository, "rev-parse", "HEAD:docs/prds/customer-returns").trim() }));
  const enginePath = fileURLToPath(new URL("../../dist/engine/engine.js", import.meta.url)); const serverPath = fileURLToPath(new URL("../../dist/server/local-server.js", import.meta.url)); const journalPath = fileURLToPath(new URL("../../dist/control/commands.js", import.meta.url));
  // Freeze only the disposable supervisor immediately around real durable writes.
  // For write_completed, freeze before saving that callback; for others, after save.
  const code = `import{readFileSync,writeFileSync}from'node:fs';import{Engine}from${JSON.stringify(enginePath)};import{CommandJournal}from${JSON.stringify(journalPath)};import{startLocalServer}from${JSON.stringify(serverPath)};const boundary=${JSON.stringify(boundary)};const original=CommandJournal.prototype.save;let stopped=false;CommandJournal.prototype.save=function(r){const hit=!stopped&&(boundary==='resume_dispatch_review'&&r.command_id==='review-crash'&&r.instruction.action==='resume'&&r.stage==='dispatching'||r.instruction.action==='message'&&(boundary==='intent'&&r.stage==='intent'||boundary==='write_started'&&r.message?.writeStartedAt&&!r.message?.writeCompletedAt||boundary==='write_completed'&&r.message?.writeCompletedAt||boundary==='evidence'&&r.message?.resultAt||boundary.endsWith('review')&&boundary!=='resume_dispatch_review'&&r.message?.reviewedAt));if(hit&&boundary==='write_completed'){stopped=true;writeFileSync(${JSON.stringify(killedAt)},'stopped');process.kill(process.pid,'SIGSTOP');}const value=original.call(this,r);if(hit&&boundary!=='write_completed'){stopped=true;writeFileSync(${JSON.stringify(killedAt)},'stopped');process.kill(process.pid,'SIGSTOP');}return value;};const options=JSON.parse(readFileSync(process.argv[1],'utf8'));if(boundary.startsWith('saved_')){const observe=Engine.prototype.observeLiveMessage;Engine.prototype.observeLiveMessage=function(t,e,at){if(!stopped&&e.type==='result'&&e.user_message_uuids?.length===(boundary==='saved_crossEvent'?1:2)){stopped=true;writeFileSync(${JSON.stringify(killedAt)},'saved before callback');process.kill(process.pid,'SIGSTOP');}return observe.call(this,t,e,at);};}const engine=new Engine({...options,env:process.env,sleepReader:{next:async()=>[]}});await engine.agents.refresh();await startLocalServer({engine,port:${port},folderName:'customer-returns',featureName:'Message crash proof',token:engine.record.token});const answer=await engine.start({refinementConfirmed:true});if(!answer.ok)throw Error(JSON.stringify(answer));`;
  const controller = spawn(process.execPath, ["--input-type=module", "-e", code, optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] }); const exited = once(controller, "exit"); let diagnostic = ""; controller.stderr!.on("data", b => { diagnostic += String(b); });
  try {
    await waitFor(() => { if (controller.exitCode !== null) throw new Error(diagnostic); return existsSync(ready); }, 30000);
    const disk = readPrdRecord(h.stateDirectory)!; const key = disk.activities!.find(a => a.kind === "implementation")!.key; const session = h.engine.sessionRecord(key, disk.phases[key]!.sessionIds.at(-1)!)!; const run = session.runs.at(-1)!;
    const t: import("./target.js").LiveTarget = { executionId: disk.executionId!, activityId: disk.activities!.find(a => a.key === key)!.activityId, activityKey: key, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: run.live!.attemptId };
    origin = `http://127.0.0.1:${port}`;
    let request = post("live/message", { instructionId: `crash-${boundary}`, target: t, text: "literal instruction before supervisor death" }).catch(() => undefined);
    if (boundary.startsWith("saved_")) {
      await request;
      await waitFor(() => readReceipts(h.stateDirectory).find(r => r.command_id === `crash-${boundary}`)?.state === "completed");
      request = post("live/message", { instructionId: "crash-saved-second", target: t, text: "second accepted input before saved correlation crash" }).catch(() => undefined);
    }
    if (boundary.endsWith("review")) {
      await request;
      if (boundary.includes("partial_review")) { await waitFor(() => readReceipts(h.stateDirectory).find(r => r.command_id === `crash-${boundary}`)?.state === "completed"); expect((await post("live/message", { instructionId: "crash-second", target: t, text: "second uncertain instruction" })).status).toBe(202); }
      await waitFor(() => readPrdRecord(h.stateDirectory)?.liveControl?.takeover.state === "released", 15000);
      const reviewed = [`crash-${boundary}`, ...(boundary.includes("partial_review") ? ["crash-second"] : [])];
      request = boundary.startsWith("resume_") || boundary.startsWith("verify_")
        ? post("control/v1/commands", { command_id: "review-crash", execution_id: t.executionId, status_token: (await (await fetch(`${origin}/api/control/v1/status`, { headers: { "X-Kiln-Token": disk.token } })).json() as { status_token: string }).status_token, action: boundary.startsWith("resume_") ? "resume" : "verify-and-advance", inputs: { live_target: t, reviewed_receipt_ids: reviewed } }).catch(() => undefined)
        : post("live/message-review", { instructionId: "review-crash", target: t, receiptIds: reviewed }).catch(() => undefined);
    }
    await waitFor(() => existsSync(killedAt), 15000); controller.kill("SIGKILL"); await exited; await request;
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
    const r = receipt(`crash-${boundary}`);
    if (boundary === "intent") expect(r.message?.delivery).toBe("not_sent");
    else if (boundary === "evidence") expect(r.message?.resultAt).toBeDefined();
    else { expect(r.message?.delivery).toBe("uncertain"); expect(h.engine.record.liveControl).toBeDefined(); }
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(!boundary.endsWith("review")); expect(h.claudeCalls()).toHaveLength(1);
    if (boundary === "write_completed") {
      await h.engine.decide();
      expect(h.engine.liveView()).toMatchObject({ available: true, input: { available: false } });
      expect(h.engine.liveView()?.input?.reason).toContain("Input connection lost");
      expect(h.engine.controlView().controls.find(c => c.name === "verify-and-advance")).toMatchObject({ available: false, reason: expect.any(String) });
      const { launchChrome } = await import("../test-support/headless-chrome.js");
      const browser = await launchChrome();
      server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Restarted uncertain input", token: h.engine.record.token });
      const page = await browser.open(`${server.address}/phase/1`, { width: 390, height: 1100 });
      try {
        const take = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause & take over')`;
        await page.waitFor(`${take} && !${take}.disabled`);
        expect(await page.evaluate("document.body.innerText")).toContain("Input connection lost");
        expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message').disabled`)).toBe(true);
        await page.evaluate(`${take}.click()`);
        await page.waitFor(`document.body.innerText.includes('Pausing for takeover — finishing the current operation')`);
        writeFileSync("/tmp/kiln-phase8-restarted-uncertain-390.png", await page.screenshot());
        expect(page.problems).toEqual([]);
      } finally { await page.close(); await browser.close(); await server.close(); server = undefined; }
      expect(readGate(run.live!.gateDirectory).held).toBeDefined();
      expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
    }
    writeFileSync(release, "finish naturally"); await waitFor(async () => !await isProcessLive(run.pid!, run.processStartTime), 25000);
    expect(h.engine.record.phases[key]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
    const actual = existsSync(`${h.scenarioPath}.live-inputs.jsonl`) ? inputs().length : 0;
    expect(actual).toBe(boundary === "intent" || boundary === "write_started" ? 0 : boundary.includes("partial_review") || boundary.startsWith("saved_") ? 2 : 1);
    if (boundary.startsWith("saved_")) {
      for (const id of [`crash-${boundary}`, "crash-saved-second"]) expect(receipt(id)).toMatchObject({ state: "indeterminate", message: { delivery: "uncertain" }, effects: { message: "unknown", plan: "not_advanced", session: "not_started" } });
      expect(h.engine.liveView()?.reviewRequired).toHaveLength(2);
      h.engine = h.reopenFromDisk(); await h.engine.prepare();
      expect(h.engine.liveView()?.reviewRequired).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(1);
    }
    if (boundary === "resume_dispatch_review") {
      expect(receipt("review-crash")).toMatchObject({ state: "indeterminate", stage: "dispatching", effects: { session: "unknown" } });
      expect(receipt(`crash-${boundary}`).message?.reviewedAt).toBeDefined();
      expect(h.engine.commands.blocked).toBe(true); expect(h.engine.record.liveControl).toBeDefined();
      expect(h.claudeCalls()).toHaveLength(1); return;
    }
    if (boundary.endsWith("review")) {
      expect(receipt("review-crash").state).toBe(boundary === "review" ? "completed" : "failed");
      if (boundary.startsWith("resume_") || boundary.startsWith("verify_")) expect(receipt("review-crash").outcome).toBe("hand_back_not_started");
      if (boundary.includes("partial_review")) {
        expect(receipt("crash-second").message?.reviewedAt).toBeUndefined();
        expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: false });
        h.engine.commands.submit({ command_id: "finish-partial-review", execution_id: t.executionId, status_token: JSON.stringify(t), action: "message-review", inputs: { target: t, receipt_ids: ["crash-second"] } });
        await h.engine.commands.settled(); expect(receipt("finish-partial-review").state).toBe("completed");
      } expect(h.engine.commands.blocked).toBe(false);
      expect(r.message?.reviewedAt).toBeDefined(); expect(h.engine.record.liveControl).toBeDefined();
      expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: true, outcome: "resume_requested" });
      await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(2);
    }
  } finally { if (controller.exitCode === null && controller.signalCode === null) controller.kill("SIGKILL"); await exited; }
});

it.skipIf(process.platform !== "darwin")("preserves newest-first history and cursor completeness after restart across more than 50 durable receipts", async () => {
  const target = await setup([{ waitForFile: "release" }, { result: "Ended." }]);
  // Stale messages are durably refused but retain exact text. They exercise real
  // journal ordering/paging without allocating 55 unnecessary model turns.
  for (let i = 0; i < 55; i++) expect((await post("live/message", { instructionId: `history-${i}`, target: { ...target, attemptId: "stale" }, text: `  immutable message ${i}\n` })).status).toBe(409);
  writeFileSync(join(h.sandbox.root, "release"), "done"); await h.engine.settled();
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  const first = await startLocalServer({ engine: h.engine, port: Number(new URL(origin).port), folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token }); server = first;
  const get = async (before?: string) => {
    const response = await fetch(`${origin}/api/live/messages?${new URLSearchParams({ sessionId: target.sessionId, ...(before ? { before } : {}) })}`, { headers: { "X-Kiln-Token": h.engine.record.token } });
    expect(response.status).toBe(200); return await response.json() as { receipts: Receipt[]; before?: string };
  };
  const page = await get(); const older = await get(page.before);
  expect(page.receipts.map(r => r.command_id)).toEqual(Array.from({ length: 50 }, (_, i) => `history-${54 - i}`));
  expect(older.receipts.map(r => r.command_id)).toEqual(["history-4", "history-3", "history-2", "history-1", "history-0"]);
  expect(page.receipts[0]!.message!.text).toBe("  immutable message 54\n"); expect(older.before).toBeUndefined();
});

it.skipIf(process.platform !== "darwin")("requires review before Verify, holds failed checks, and persists explicit successful advance without resending", async () => {
  const target = await setup([{ liveMessages: 1, uncorrelated: true, exitAfter: true }]);
  await post("live/message", { instructionId: "verify-uncertain", target, text: "Review before deciding whether to advance" }); await h.engine.settled();
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
  const recovery = h.engine.phaseRecoveryTarget()!;
  expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: false, code: "message_review_required", status: 409 });
  expect((await post("live/message-review", { instructionId: "verify-review", target, receiptIds: [receipt("verify-uncertain").id] })).status).toBe(200);
  expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
  expect(h.engine.record.liveControl).toBeDefined(); expect(receipt("verify-uncertain").message?.resolvedBy).toBeUndefined();
  const { git } = await import("../test-support/git-repositories.js");
  const file = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish uncertain-message activity"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  h.engine.record.pause.requestedAt = new Date().toISOString();
  expect(await h.engine.checkAgain({ target: recovery, intent: "advance" })).toMatchObject({ ok: true, outcome: "advanced" }); await h.engine.settled();
  expect(receipt("verify-uncertain").message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) });
  expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.activeSince).toBeDefined(); expect(inputs()).toHaveLength(1);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin").each(["wrongSession", "reverseOrder"])("holds conflicting %s consumption evidence rather than confirming or advancing", async fault => {
  const target = await setup([{ liveMessages: 2, [fault]: true, exitAfter: true }]);
  await post("live/message", { instructionId: "identity-first", target, text: "First accepted input" }); await h.engine.commands.settled();
  await post("live/message", { instructionId: "identity-second", target, text: "Second accepted input" }); await h.engine.settled();
  for (const id of ["identity-first", "identity-second"]) expect(receipt(id)).toMatchObject({ effects: { message: "unknown", plan: "not_advanced", session: "not_started" }, message: { delivery: "uncertain" } });
  expect(h.engine.liveView()?.reviewRequired).toHaveLength(2); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1); expect(inputs()).toHaveLength(2);
});

it.skipIf(process.platform !== "darwin")("accepts versioned bot messages through the existing live journal while keeping standalone review internal", async () => {
  const target = await setup([{ liveMessages: 1 }]);
  const text = "  Literal instruction through the versioned interface\n";
  const body = { command_id: "bot-live-enabled", execution_id: target.executionId, status_token: h.engine.controlView().token, action: "message", inputs: { target, text } };
  expect((await post("control/v1/commands", body)).status).toBe(202);
  await h.engine.commands.settled(); await h.engine.settled();
  expect(receipt("bot-live-enabled")).toMatchObject({ message: { text, delivery: "received" }, effects: { message: "received", session: "not_started", plan: "not_advanced" } });
  expect((await post("control/v1/commands", body)).status).toBe(202);
  expect(inputs().map(i => i.message.content)).toEqual([text]); expect(h.claudeCalls()).toHaveLength(1);
  expect((await post("control/v1/commands", { ...body, command_id: "internal-review", action: "message-review", inputs: { target, receipt_ids: ["bot-live-enabled"] } })).status).toBe(400);
  expect(h.engine.commands.has("internal-review")).toBe(false);
});

it.skipIf(process.platform !== "darwin").each(["reverseOrder", "wrongSession", "unaccounted"])("validates saved %s evidence after the append/callback crash boundary, including accounted receipts", async fault => {
  const target = await setup([{ liveMessages: 2, ...(fault === "unaccounted" ? { readOnly: true } : {}) }, { waitForFile: "release" }, { result: "Done." }, { exitNow: 0 }]);
  for (const id of ["saved-first", "saved-second"]) { await post("live/message", { instructionId: id, target, text: `exact ${id}\n` }); await h.engine.commands.settled(); }
  await waitFor(() => receipt("saved-second").message?.delivery === "received");
  // Save an event without delivering its callback, the actual torn boundary.
  const { sessionFiles } = await import("../session/claude-session.js");
  const { appendJsonLine } = await import("../state/state-files.js");
  const session = h.engine.latestSession("1")!;
  const uuids = [receipt("saved-first").message!.uuid, receipt("saved-second").message!.uuid];
  appendJsonLine(sessionFiles(h.stateDirectory, session).events, { at: new Date().toISOString(), event: { type: "result", session_id: fault === "wrongSession" ? "another-conversation" : target.providerSessionId, user_message_uuids: fault !== "wrongSession" ? [...uuids].reverse() : uuids } });
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  for (let restart = 0; restart < 2; restart++) {
    for (const id of ["saved-first", "saved-second"]) expect(receipt(id)).toMatchObject({ state: "indeterminate", message: { delivery: "uncertain" }, effects: { message: "unknown", session: "not_started", plan: "not_advanced" } });
    expect(h.engine.liveView()?.reviewRequired).toHaveLength(2);
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
  }
  writeFileSync(join(h.sandbox.root, "release"), "exit naturally");
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
  expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: false, code: "message_review_required" });
  expect(inputs()).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin")("retains late correlated uncertainty through review, failed Verify, successful Resume and prior-execution restart", async () => {
  const text = "  review this exact late instruction\n";
  const target = await setup([{ liveMessages: 1, uncorrelated: true, exitAfter: true }]);
  await post("live/message", { instructionId: "late-evidence", target, text }); await h.engine.settled();
  const { sessionFiles } = await import("../session/claude-session.js");
  const { appendJsonLine } = await import("../state/state-files.js");
  const { writePrdRecord } = await import("../state/records.js");
  const { newPrdRecord } = await import("../state/new-record.js");
  const r = h.engine.commands.all().find(r => r.command_id === "late-evidence")!;
  const session = h.engine.latestSession("1")!;
  appendJsonLine(sessionFiles(h.stateDirectory, session).events, { at: new Date().toISOString(), event: { type: "result", session_id: target.providerSessionId, user_message_uuids: [r.message!.uuid] } });
  // Reproduce the saved late-evidence state from the live callback.
  r.message!.resultAt = new Date().toISOString(); h.engine.commands.checkpoint(r);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(receipt("late-evidence").message).toMatchObject({ text, delivery: "uncertain", resultAt: expect.any(String) });
  expect(h.engine.liveView()?.reviewRequired).toEqual([r.id]);
  await h.engine.reconcileTakeover();
  const recovery = h.engine.phaseRecoveryTarget()!;
  expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: false, code: "message_review_required" });
  expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: false, code: "message_review_required" });
  expect(h.engine.reviewMessages(target, [r.id])).toMatchObject({ ok: true });
  expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
  h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(receipt("late-evidence").message).toMatchObject({ text, delivery: "uncertain", reviewedAt: expect.any(String), resultAt: expect.any(String) });
  expect(receipt("late-evidence").message?.resolvedBy).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined();
  expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: true }); await h.engine.settled();
  const resolved = { ...receipt("late-evidence").message! };
  expect(resolved.resolvedBy).toBeDefined();
  h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(receipt("late-evidence").message).toEqual(resolved); expect(h.engine.record.liveControl).toBeUndefined();
  h.engine.close(); const old = h.engine.record;
  writePrdRecord(h.stateDirectory, newPrdRecord({ mainCheckoutPath: h.repository, repositoryName: old.repository.name, github: old.repository.github, prdDirectoryFromRoot: old.prdDirectory, featureName: old.featureName, settings: old.settings }));
  h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(receipt("late-evidence").message).toEqual(resolved); expect(h.engine.record.liveControl).toBeUndefined();
  expect(inputs()).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(2);
});

it.skipIf(process.platform !== "darwin")("retains unresolved late-evidence receipts from a prior execution without holding its replacement", async () => {
  await setup([{ liveMessages: 1, uncorrelated: true, exitAfter: true }]);
  const target = h.engine.liveTarget()!;
  await post("live/message", { instructionId: "prior-uncertain", target, text: "  prior execution instruction\n" }); await h.engine.settled();
  const r = h.engine.commands.all().find(r => r.command_id === "prior-uncertain")!;
  expect(r.message?.delivery).toBe("uncertain");
  r.message!.resultAt = new Date().toISOString(); h.engine.commands.checkpoint(r);
  const prior = { ...r.message! }; expect(prior.reviewedAt).toBeUndefined(); expect(prior.resolvedBy).toBeUndefined();
  await server!.close(); server = undefined; h.engine.close();
  const { newPrdRecord } = await import("../state/new-record.js"); const { writePrdRecord } = await import("../state/records.js");
  const old = h.engine.record;
  writePrdRecord(h.stateDirectory, newPrdRecord({ mainCheckoutPath: h.repository, repositoryName: old.repository.name, github: old.repository.github, prdDirectoryFromRoot: old.prdDirectory, featureName: old.featureName, settings: old.settings }));
  for (let i = 0; i < 2; i++) {
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
    expect(receipt("prior-uncertain").message).toEqual(prior); expect(h.engine.record.liveControl).toBeUndefined();
    expect(h.engine.commands.blocked).toBe(false);
  }
  expect(inputs()).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin")("disables live actions during actual gate acquisition after a submitting HTTP receipt", async () => {
  const target = await setup([{ waitForFile: "release" }, { liveMessages: 1 }]);
  const { processStartTime } = await import("../platform/process-start-time.js");
  const gate = h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory;
  const lock = join(gate, "admission.lock");
  // The fixture owns a real lock with a live PID/start identity. No unknown lock is broken.
  await waitFor(() => !existsSync(lock));
  mkdirSync(lock); writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, start: await processStartTime(process.pid), generation: "pending-test" }));
  try {
    const response = await post("live/message", { instructionId: "gate-pending", target, text: "  pending exact text\n" });
    expect(response.status).toBe(202); expect(receipt("gate-pending").message).toMatchObject({ delivery: "submitting" });
    expect(receipt("gate-pending").message?.writeStartedAt).toBeUndefined();
    expect(h.engine.liveView()?.input?.available).toBe(false); expect(h.engine.liveView()?.available).toBe(false);
    expect((await post("live/take-over", { instructionId: "pending-take", target })).status).toBe(409);
  } finally { rmSync(lock, { recursive: true }); }
  await h.engine.commands.settled(); expect(receipt("gate-pending").message?.delivery).toBe("submitted");
  writeFileSync(join(h.sandbox.root, "release"), "finish"); await h.engine.settled();
  expect(inputs()).toHaveLength(1); expect(inputs()[0]!.message.content).toBe("  pending exact text\n");
});

it.skipIf(process.platform !== "darwin").each([true, false])("holds unaccounted input after a final observation error (trailing LF: %s) despite passing phase evidence", async withNewline => {
  const gateModule = await import("./gate.js");
  const target = await setup([{ liveMessages: 1, uncorrelated: true }, { waitForFile: "release" }, { rawEvent: { type: "result", subtype: "success", is_error: false, result: "Completed." }, withNewline }, { exitNow: 0 }]);
  await post("live/message", { instructionId: "final-observation", target, text: "  unaccounted final instruction\n" }); await h.engine.commands.settled();
  const phase = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(phase, readFileSync(phase, "utf8").replace("\n", "\n\n**Closed:** 2026-10-28\n"));
  const { git } = await import("../test-support/git-repositories.js");
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: complete first phase"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const observe = gateModule.observeGate;
  vi.spyOn(gateModule, "observeGate").mockImplementation(async (...args) => { if (args[1].type === "result") throw new Error("Final gate observation unavailable"); return observe(...args); });
  writeFileSync(join(h.sandbox.root, "release"), "finish"); await h.engine.settled();
  expect(receipt("final-observation").message).toMatchObject({ delivery: "uncertain", text: "  unaccounted final instruction\n" });
  expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  vi.restoreAllMocks();
  await h.engine.reconcileTakeover();
  const recovery = h.engine.phaseRecoveryTarget()!;
  h.engine.reviewMessages(target, ["final-observation"]);
  expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "already_complete" });
  expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(receipt("final-observation").message?.delivery).toBe("uncertain"); expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin").each([
  { name: "B-only result before A", events: [{ type: "result", indices: [1] }, { type: "result", indices: [0] }], uncertain: true },
  { name: "B-only assistant before A", events: [{ type: "assistant", indices: [1] }, { type: "result", indices: [0] }, { type: "result", indices: [1] }], uncertain: true },
  { name: "A consumed before overlapping B/A results", events: [{ type: "assistant", indices: [0] }, { type: "result", indices: [1] }, { type: "result", indices: [0] }], uncertain: false },
  { name: "ordered separate results", events: [{ type: "result", indices: [0] }, { type: "result", indices: [1] }], uncertain: false },
  { name: "coalesced read before overlapping results", events: [{ type: "assistant", indices: [0, 1] }, { type: "result", indices: [1] }, { type: "result", indices: [0] }], uncertain: false },
])("validates first consumption across events: $name", async ({ events, uncertain }) => {
  const target = await setup([{ waitForFile: "release" }, { liveMessages: 2, consumptionEvents: events, exitAfter: true }]);
  const texts = ["  first exact input\n", "\nsecond exact input  "];
  for (const [i, text] of texts.entries()) { expect((await post("live/message", { instructionId: `chronology-${i}`, target, text })).status).toBe(202); await h.engine.commands.settled(); }
  writeFileSync(join(h.sandbox.root, "release"), "emit observations"); await h.engine.settled();
  for (const [i, text] of texts.entries()) expect(receipt(`chronology-${i}`)).toMatchObject({ live_target: target, message: { text, delivery: uncertain ? "uncertain" : "received", resultAt: expect.any(String) }, effects: { message: uncertain ? "unknown" : "received", session: "not_started", plan: "not_advanced" } });
  expect(!!h.engine.record.liveControl).toBe(uncertain); expect(inputs().map(i => i.message.content)).toEqual(texts); expect(h.claudeCalls()).toHaveLength(1);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect(!!h.engine.record.liveControl).toBe(uncertain);
  if (uncertain) { expect(h.engine.liveView()?.reviewRequired).toHaveLength(2); expect((await h.engine.decide()).kind).toBe("needs_you"); }
  expect(inputs()).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin").each([false, true])("replays B-before-A saved chronology independently of durable result fields (%s)", async savedResults => {
  const target = await setup([{ waitForFile: "release" }, { liveMessages: 2, consumptionEvents: [{ type: "result", indices: [1] }, { type: "result", indices: [0] }], exitAfter: true }]);
  // Reproduce a saved-event/callback gap, or a pre-upgrade controller that saved
  // each result without cross-event validation. Actual supervisor death is also
  // exercised by the saved_crossEvent boundary test above.
  const internal = h.engine as unknown as { observeLiveMessage: (t: typeof target, e: Record<string, unknown>, at: string) => void; projectMessage: (r: Receipt, e: Record<string, unknown>, at: string) => void; endLiveMessages: (t: typeof target) => void };
  const observer = vi.spyOn(internal, "observeLiveMessage").mockImplementation((t, event, at) => {
    if (savedResults) for (const r of h.engine.messageReceipts(t)) { internal.projectMessage(r, event, at); h.engine.commands.checkpoint(r); }
  });
  const ending = vi.spyOn(internal, "endLiveMessages").mockImplementation(() => {});
  for (const id of ["replay-A", "replay-B"]) { await post("live/message", { instructionId: id, target, text: `  exact ${id}\n` }); await h.engine.commands.settled(); }
  writeFileSync(join(h.sandbox.root, "release"), "finish naturally"); await h.engine.settled(); observer.mockRestore(); ending.mockRestore();
  for (const id of ["replay-A", "replay-B"]) expect(!!receipt(id).message?.resultAt).toBe(savedResults);
  expect(h.engine.record.liveControl).toBeUndefined();
  await server!.close(); server = undefined;
  for (let restart = 0; restart < 2; restart++) {
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
    for (const id of ["replay-A", "replay-B"]) expect(receipt(id)).toMatchObject({ live_target: target, state: "indeterminate", message: { delivery: "uncertain", text: `  exact ${id}\n`, resultAt: expect.any(String) }, effects: { message: "unknown", plan: "not_advanced" } });
    expect(h.engine.liveView()?.reviewRequired).toHaveLength(2); expect((await h.engine.decide()).kind).toBe("needs_you");
  }
  expect(inputs()).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
});
