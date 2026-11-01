import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, renameSync, rmSync, writeFileSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { auditCodexConversation, codexStayedOutcome, uncertaintyFingerprint } from "./codex-evidence.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";

const fixtures: ReturnType<typeof historyFixture>[] = [];
const fixture = () => { const f = historyFixture(); fixtures.push(f); return f; };
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });

describe("authoritative Codex conversation audit", () => {
  it.each(["0.162.1", "0.165.0", "0.165.1", "1.0.0", "9.0.0"])("reads historical evidence with eligible stable reader %s", async version => {
    const f = fixture();
    f.options.env.KILN_CODEX_HISTORY_VERSION = `codex-cli ${version}`;
    const path = f.state.threads.parent!.metadata.path;
    writeFileSync(path, readFileSync(path, "utf8").replace('"id":"parent"', '"id":"parent","cli_version":"0.162.1"'));
    const result = await auditCodexConversation(f.options);
    expect(result.problems).toEqual([]);
    expect(result.coverage).toBe("complete");
    expect(result.operationsChecked).toBe(1);
    expect(f.calls().every(call => ["initialize", "thread/list", "thread/read", "thread/turns/list"].includes(call.method))).toBe(true);
  });
  it.each(["codex-cli 0.162.0", "codex-cli 0.165.0-dev", "unrecognized"])("rejects old or unrecognized reader %s before history access", async version => {
    const f = fixture(); f.options.env.KILN_CODEX_HISTORY_VERSION = version;
    const result = await auditCodexConversation(f.options);
    expect(result.coverage).toBe("inconclusive");
    expect(result.frontiers).toEqual([]);
    expect(result.problems.join(" ")).toContain(version);
    expect(result.problems.join(" ")).toContain("0.162.1");
    expect(result.problems.join(" ")).toContain("or later");
    expect(codexStayedOutcome("local", result, [result.fingerprint]).passed).toBe(false);
  });
  it("covers recorded image inspection outside the workspace without concealing mutations", async () => {
    const f = fixture();
    const recorded = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/codex-audit-proof/image-inspection-wrappers.json", import.meta.url)), "utf8")) as { calls: { raw: Record<string, unknown> }[] };
    f.options.env.KILN_CODEX_HISTORY_VERSION = "codex-cli 0.165.0";
    for (const call of recorded.calls) f.append("parent", f.record("response_item", { ...call.raw, internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
    const clean = await auditCodexConversation(f.options);
    expect(clean.problems).toEqual([]); expect(clean.coverage).toBe("complete");
    expect(clean.findings).toEqual([]); expect(clean.operationsChecked).toBe(1);
    expect(codexStayedOutcome("local", clean, []).passed).toBe(true);
    f.append("parent", f.record("response_item", { type: "custom_tool_call", name: "exec", call_id: "outside-command", input: `image(await tools.view_image({path:"/PROOF/image.png"})); text(await tools.exec_command({cmd:"git commit -m proof", workdir:${JSON.stringify(f.outside)}}));`, internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
    const outside = await auditCodexConversation(f.options);
    expect(outside.problems).toEqual([]); expect(outside.coverage).toBe("complete");
    expect(outside.findings.map(finding => finding.fact).join(" ")).toContain("git commit");
    expect(codexStayedOutcome("local", outside, []).passed).toBe(false);
    f.append("parent", f.record("response_item", { type: "custom_tool_call", name: "exec", call_id: "unknown-after-image", input: 'image(await tools.view_image({path:"/PROOF/image.png"})); await tools.unknown_writer({path:"/outside"});', internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
    const unknown = await auditCodexConversation(f.options);
    expect(unknown.coverage).toBe("inconclusive");
    expect(codexStayedOutcome("local", unknown, [unknown.fingerprint]).passed).toBe(false);
  });

  it.each(["retained", "deferred-context", "missing-prefix", "missing-call", "wrong-window", "missing-window", "unknown-field", "executable-snapshot", "missing-context", "wrong-thread", "incomplete"])("checks retained compaction against original execution evidence: %s", async mode => {
    const f = fixture();
    const captured = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/codex-audit-proof/retained-compaction-0.165.0.json", import.meta.url)), "utf8")) as { initialWindow: string; payload: Record<string, unknown> };
    const path = f.state.threads.parent!.metadata.path;
    let raw = readFileSync(path, "utf8").replace('"id":"parent"', `"id":"parent","context_window":{"window_id":${JSON.stringify(captured.initialWindow)}}`);
    if (mode === "missing-prefix") raw = raw.split("\n").filter(line => !line.includes('"type":"task_started"')).join("\n");
    if (mode === "missing-call") raw = raw.split("\n").filter(line => !line.includes('"type":"custom_tool_call"')).join("\n");
    if (mode === "missing-window") raw = raw.replace(captured.initialWindow, "unqualified-window");
    const payload = captured.payload;
    if (mode === "wrong-window") payload.previous_window_id = "other-window";
    if (mode === "unknown-field") payload.unknown_execution = "hidden";
    if (mode === "executable-snapshot") (payload.replacement_history as Record<string, unknown>[])[0] = { type: "function_call", name: "exec_command", arguments: '{"cmd":"git push"}' };
    if (mode === "missing-context") (payload.latest_token_usage_record as Record<string, unknown>).turn_id = "missing-turn";
    if (mode === "wrong-thread") (payload.latest_token_usage_record as Record<string, unknown>).thread_id = "other-thread";
    if (mode === "incomplete") (payload.retained_context as Record<string, unknown>).incomplete = true;
    const snapshot = f.record("compacted", payload);
    if (mode === "deferred-context") {
      const context = raw.split("\n").find(line => line.includes('"type":"turn_context"'))!;
      raw = raw.replace(context, snapshot + context);
    } else raw += snapshot;
    writeFileSync(path, raw);
    const result = await auditCodexConversation(f.options);
    expect(result.coverage).toBe(["retained", "deferred-context"].includes(mode) ? "complete" : "inconclusive");
    if (["retained", "deferred-context"].includes(mode)) { expect(result.problems).toEqual([]); expect(result.operationsChecked).toBe(1); }
    else expect(codexStayedOutcome("local", result, [result.fingerprint]).passed).toBe(false);
  });
  it.each(["qualified", "wrong-turn", "wrong-status", "wrong-reason", "conflicting"])("checks the recorded interrupted terminal contract: %s", async mode => {
    const f = fixture();
    const recorded = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/codex-audit-proof/interrupted-frontier-0.162.1.json", import.meta.url)), "utf8")) as { raw: { type: string; payload: Record<string, unknown> } };
    const thread = f.state.threads.parent!;
    const id = thread.turns[0]!.id;
    thread.turns[0]!.status = mode === "wrong-status" ? "completed" : "interrupted";
    const abort = f.record(recorded.raw.type, { ...recorded.raw.payload, turn_id: mode === "wrong-turn" ? "other-turn" : id, root_turn_id: id, reason: mode === "wrong-reason" ? "unknown" : "interrupted" });
    const raw = readFileSync(thread.metadata.path, "utf8");
    writeFileSync(thread.metadata.path, mode === "conflicting" ? raw + abort : raw.split("\n").filter(line => !line.includes('"type":"task_complete"')).join("\n") + abort);
    f.save();
    const result = await auditCodexConversation(f.options);
    expect(result.coverage).toBe(mode === "qualified" ? "complete" : "inconclusive");
    if (mode === "qualified") { expect(result.problems).toEqual([]); expect(result.operationsChecked).toBe(1); }
  });
  it("qualifies the observed wait without waiving another invocation's input checks", async () => {
    const f=fixture();
    const recorded=JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/codex-audit-proof/yielded-exec-wait-0.162.1.json",import.meta.url)),"utf8")) as {raw:{payload:Record<string,unknown>}};
    f.append("parent",f.record("response_item",{...recorded.raw.payload,internal_chat_message_metadata_passthrough:{turn_id:"parent-turn-0"}}));
    expect((await auditCodexConversation(f.options)).coverage).toBe("complete");
    f.append("parent",f.record("response_item",{type:"function_call",name:"exec_command",call_id:"hidden",arguments:JSON.stringify({cmd:"git status",unqualifiedCommand:"hidden"}),internal_chat_message_metadata_passthrough:{turn_id:"parent-turn-0"}}));
    expect((await auditCodexConversation(f.options)).coverage).toBe("inconclusive");
  });
  // Observed with 0.166.0: a refused collaboration call records this output and no subagent activity.
  it.each([true, false])("treats a collaboration call Codex refused as delegating nothing, but not an unanswered one (commandProjection %s)", async commandProjection => {
    const f = fixture();
    const follow = (id: string) => f.record("response_item", { type: "function_call", namespace: "collaboration", name: "followup_task", call_id: id, arguments: JSON.stringify({ target: "assessment", message: "opaque" }), internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } });
    f.append("parent", follow("refused"));
    f.append("parent", f.record("response_item", { type: "function_call_output", call_id: "refused", output: "collab tool failed: agent thread limit reached", internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
    f.append("parent", follow("closed"));
    f.append("parent", f.record("response_item", { type: "function_call_output", call_id: "closed", output: "agent with id 01a1 is closed", internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
    const refused = await auditCodexConversation({ ...f.options, commandProjection });
    expect(refused.problems).toEqual([]); expect(refused.coverage).toBe("complete");
    f.append("parent", follow("unanswered"));
    const unanswered = await auditCodexConversation({ ...f.options, commandProjection });
    expect(unanswered.coverage).toBe("inconclusive"); expect(unanswered.problems).toContain("parent: unresolved delegated work.");
  });
  it("exhausts full 100-turn pages through real pipes and binds confirmation to stable source content", async () => {
    const f = fixture(); f.addThread("parent", { count: 205 });
    const result = await auditCodexConversation(f.options);
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.operationsChecked).toBe(205);
    expect(result.findings).toHaveLength(0);
    expect(f.calls().filter(call => call.method === "thread/turns/list").map(call => call.params.cursor)).toEqual([null, "100", "200", null, "100", "200"]);
  });
  it("accepts the verified non-executing metadata envelopes, but rejects changed envelope schemas", async () => {
    const f = fixture();
    f.append("parent", f.record("token_usage_record", { thread_id: "parent", turn_id: "parent-turn-0", session_id: "tree", root_turn_id: "root-turn", response_id: "response", usage: { input_tokens: 1 }, turn_token_usage: { total_tokens: 2 }, thread_token_usage: { total_tokens: 3 } }));
    f.append("parent", f.record("inter_agent_communication_metadata", { trigger_turn: true }));
    const result = await auditCodexConversation(f.options); expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.operationsChecked).toBe(1);
    f.append("parent", f.record("inter_agent_communication_metadata", { trigger_turn: true, unknown_executable_field: "opaque" }));
    expect((await auditCodexConversation(f.options)).coverage).toBe("inconclusive");
  });
  it("confirms only identified changes, preserving the exact frontier across a fresh read", async () => {
    const f = fixture(); f.addThread("parent", { target: join(f.outside, "marker.txt") });
    const first = await auditCodexConversation(f.options); expect(first.problems).toEqual([]);
    expect(first.profile).toBe("codex-static-v2");
    const physicalRoot = realpathSync(f.root);
    const roots = [process.platform === "win32" ? physicalRoot.toLowerCase() : physicalRoot];
    const fingerprintFor = (profile: string) => createHash("sha256").update(JSON.stringify({ profile, roots, frontiers: first.frontiers, findings: first.findings })).digest("hex");
    const legacyFingerprint = fingerprintFor("codex-0.162.1-static-v1");
    expect(first.fingerprint).toBe(fingerprintFor("codex-static-v2"));
    expect(first.fingerprint).not.toBe(legacyFingerprint);
    expect(codexStayedOutcome("local", first, [legacyFingerprint]).passed).toBe(false);
    expect(codexStayedOutcome("local", first, []).passed).toBe(false);
    const same = await auditCodexConversation(f.options); expect(same.fingerprint).toBe(first.fingerprint);
    expect(codexStayedOutcome("local", same, [first.fingerprint]).passed).toBe(true);
    f.append("parent", f.record("event_msg", { type: "agent_message", message: "Later terminal record with an old timestamp" }));
    const changed = await auditCodexConversation(f.options);
    expect(changed.coverage).toBe("complete"); expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(codexStayedOutcome("local", changed, [first.fingerprint]).passed).toBe(false);
  });
  it("unions archived and referenced descendants, verifies inherited prefixes and invalidates old confirmations", async () => {
    const f = fixture(); const parent = f.state.threads.parent!;
    const child = f.addThread("child", { parent: "parent", archived: true, target: join(f.outside, "child.txt") });
    f.state.archived = ["child"]; f.save();
    const prefix = readFileSync(parent.metadata.path, "utf8").split("\n").slice(1, -1).join("\n") + "\n";
    const childText = readFileSync(child.metadata.path, "utf8").split("\n"); childText.splice(1, 0, prefix.trimEnd()); writeFileSync(child.metadata.path, childText.join("\n"));
    const result = await auditCodexConversation(f.options);
    expect(result.problems).toEqual([]); expect(result.frontiers.map(x => x.threadId)).toEqual(["child", "parent"]);
    expect(result.findings.map(x => x.fact).join(" ")).toContain("child.txt"); expect(result.operationsChecked).toBe(2);
    writeFileSync(child.metadata.path, readFileSync(child.metadata.path, "utf8").replace('"gpt-6.1-sol"', '"different-model"'));
    const changed = await auditCodexConversation(f.options); expect(changed.coverage).toBe("inconclusive"); expect(changed.problems.join(" ")).toContain("changed inherited context");
  });
  it("discovers child references even when omitted from listings, and missing children fail", async () => {
    const f = fixture(); f.addThread("child", { parent: "parent" });
    f.state.threads.parent!.turns[0]!.items.push({ id: "activity", type: "subAgentActivity", agentThreadId: "child", kind: "started" }); f.save();
    expect((await auditCodexConversation(f.options)).frontiers).toHaveLength(2);
    delete f.state.threads.child; f.save();
    expect((await auditCodexConversation(f.options)).coverage).toBe("inconclusive");
  });
  it.each(["missing", "corrupt", "truncated", "compacted", "unsettled", "empty", "unowned", "wrong-owner", "unknown-tool", "invalid-envelope"])("does not confirm %s evidence into a pass", async kind => {
    const f = fixture(); const thread = f.state.threads.parent!; const path = thread.metadata.path;
    if (kind === "missing") rmSync(path);
    if (kind === "corrupt") appendFileSync(path, "not-json\n");
    if (kind === "truncated") appendFileSync(path, '{"payload":');
    if (kind === "compacted") appendFileSync(path, f.record("compacted", { message: "earlier history replaced" }));
    if (kind === "unsettled") { thread.turns[0]!.status = "inProgress"; f.save(); }
    if (kind === "empty") writeFileSync(path, "");
    if (kind === "unowned") f.append("parent", f.record("event_msg", { type: "task_started", turn_id: "unknown" }));
    if (kind === "wrong-owner") writeFileSync(path, readFileSync(path, "utf8").replace('"id":"parent"', '"id":"other"'));
    if (kind === "invalid-envelope") f.append("parent", f.record("response_item", "not-an-item"));
    if (kind === "unknown-tool") writeFileSync(path, readFileSync(path, "utf8").replace("tools.apply_patch", "tools.unknown_writer"));
    const audit = await auditCodexConversation(f.options);
    expect(audit.coverage).toBe("inconclusive"); expect(audit.problems.length).toBeGreaterThan(0);
    if (["missing", "corrupt", "truncated", "unsettled", "empty", "unowned", "wrong-owner", "invalid-envelope"].includes(kind)) expect(uncertaintyFingerprint(audit)).toBeUndefined();
    expect(codexStayedOutcome("local", audit, [audit.fingerprint]).passed).toBe(false);
  });
  it("rediscovers a moved archived file by ID without reading unrelated histories", async () => {
    const f = fixture(); const path = f.state.threads.parent!.metadata.path;
    const archived = join(f.codexHome, "archived_sessions", "rollout-parent.jsonl"); renameSync(path, archived);
    const result = await auditCodexConversation(f.options);
    expect(result.problems).toEqual([]); expect(result.frontiers[0]!.path).toBe(archived);
  });
  it.each(["repeatCursor", "changedTree", "changeRawOnRead"])("rejects a changing or incomplete provider frontier: %s", async kind => {
    const f = fixture();
    if (kind === "repeatCursor") f.state.repeatCursor = true;
    if (kind === "changedTree") f.state.changedTree = true;
    if (kind === "changeRawOnRead") f.state.changeRawOnRead = f.record("event_msg", { type: "agent_message" });
    f.save(); const result = await auditCodexConversation(f.options); expect(result.coverage).toBe("inconclusive");
    expect(uncertaintyFingerprint(result)).toBeUndefined();
  });
  it("bounds hung history requests by the total deadline and starts no turn", async () => {
    const f = fixture(); f.state.hang = "thread/read"; f.save();
    const at = Date.now(); const result = await auditCodexConversation({ ...f.options, timeoutMs: 1500 });
    expect(Date.now() - at).toBeLessThan(4000); expect(result.coverage).toBe("inconclusive");
    expect(uncertaintyFingerprint(result)).toBeUndefined();
    expect(f.calls().some(call => /start|resume|interrupt/.test(call.method))).toBe(false);
  });
  it("covers failed or missing-result Git work and both patch rename endpoints conservatively", async () => {
    const f = fixture(); const thread = f.state.threads.parent!;
    const records = readFileSync(thread.metadata.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const call = records.find(record => record.type === "response_item");
    call.payload.input = `text(await tools.apply_patch(${JSON.stringify(`*** Begin Patch\n*** Update File: ${join(f.root, "old.txt")}\n*** Move to: ${join(f.outside, "moved.txt")}\n@@\n-old\n+new\n*** End Patch`)}));`;
    writeFileSync(thread.metadata.path, records.map(record => JSON.stringify(record)).join("\n") + "\n");
    thread.turns[0]!.items = []; f.save();
    expect((await auditCodexConversation(f.options)).findings.map(x => x.fact).join(" ")).toContain("moved.txt");
    f.addThread("parent", { command: `git -C '${f.outside}' commit -m denied` });
    const git = await auditCodexConversation(f.options); expect(git.problems).toEqual([]); expect(git.findings[0]!.fact).toContain("git commit");
  });
  it("rejects orphan raw native commands independently of normalized turn enumeration", async () => {
    const f = fixture(); const parent = f.state.threads.parent!;
    parent.turns = []; f.save();
    writeFileSync(parent.metadata.path, f.record("session_meta", { id: "parent" }) + f.record("event_msg", { type: "item_completed", thread_id: "parent", turn_id: "omitted-turn", item: { type: "CommandExecution", id: "orphan", command: ["/bin/zsh", "-lc", `git -C '${f.outside}' commit -m proof`], cwd: f.root, status: "completed" } }));
    const result = await auditCodexConversation(f.options);
    expect(result.coverage).toBe("inconclusive"); expect(result.problems.join(" ")).toContain("raw command has no owned normalized turn");
    expect(codexStayedOutcome("local", result, [result.fingerprint]).passed).toBe(false);
  });
  it("does not turn incomplete shell or native-command coverage into a clean audit", async () => {
    const f = fixture(); f.addThread("parent", { command: "git status", shell: "unknown" });
    expect((await auditCodexConversation(f.options)).problems.join(" ")).toContain("shell identity");
    f.addThread("parent", { command: "git status", native: ["/bin/zsh", "-lc", "other command"] });
    expect((await auditCodexConversation(f.options)).coverage).toBe("inconclusive");
  });
  it("keeps scratch history private and outside the durable report", async () => {
    const f = fixture(); const result = await auditCodexConversation(f.options);
    expect(result.problems).toEqual([]); expect(JSON.stringify(result)).not.toContain("*** Begin Patch");
    expect(statSync(f.root).isDirectory()).toBe(true);
    expect(f.calls().filter(call => call.method === "thread/turns/list").every(call => call.params.limit === 100 && call.params.itemsView === "full")).toBe(true);
  });
});

it.each(["active", "unsettled", "missing-child"])("cannot acknowledge %s history even with a readable root frontier", async mode => {
  const f = fixture();
  if (mode === "active") f.state.threads.parent!.metadata.status = { type: "active" };
  if (mode === "unsettled") f.state.threads.parent!.turns[0]!.status = "inProgress";
  if (mode === "missing-child") {
    f.addThread("child", { parent: "parent" });
    f.state.listed = ["child"];
    rmSync(f.state.threads.child!.metadata.path);
  }
  f.save();
  const audit = await auditCodexConversation(f.options);
  expect(audit.coverage).toBe("inconclusive");
  expect(audit.uncertaintyReviewable).not.toBe(true);
  expect(codexStayedOutcome("local", audit, [], [audit.fingerprint]).passed).toBe(false);
});

it("keeps identified outside writes visible when the same wrapper later becomes unknown", async () => {
  const f = fixture();
  const patch = `*** Begin Patch\n*** Add File: ${join(f.outside, "mixed.txt")}\n+change\n*** End Patch`;
  f.append("parent", f.record("response_item", { type: "custom_tool_call", name: "exec", call_id: "mixed", input: `await tools.apply_patch(${JSON.stringify(patch)}); unknownHelper();`, internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
  const audit = await auditCodexConversation(f.options);
  expect(audit.coverage).toBe("inconclusive");
  expect(audit.uncertaintyReviewable).toBe(true);
  expect(audit.findings).toHaveLength(1);
  const acceptance = uncertaintyFingerprint(audit)!;
  expect(codexStayedOutcome("local", audit, [], [acceptance])).toMatchObject({ passed: false, transcripts: [], changes: [expect.objectContaining({ checkout: f.outside })] });
  expect(codexStayedOutcome("local", audit, [audit.fingerprint], [acceptance]).passed).toBe(true);
});

it("refuses acknowledgment when the bounded problem report is exhausted", async () => {
  const f = fixture();
  for (let i = 0; i < 201; i++) f.append("parent", f.record("response_item", { type: "custom_tool_call", name: "exec", call_id: `unknown-${i}`, input: "unknownHelper();", internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } }));
  const audit = await auditCodexConversation(f.options);
  expect(audit.problems).toHaveLength(200);
  expect(audit.coverage).toBe("inconclusive");
  expect(uncertaintyFingerprint(audit)).toBeUndefined();
});
