import { appendFileSync, readFileSync, renameSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditCodexConversation, codexStayedOutcome } from "./codex-evidence.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";

const fixtures: ReturnType<typeof historyFixture>[] = [];
const fixture = () => { const f = historyFixture(); fixtures.push(f); return f; };
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });

describe("authoritative Codex conversation audit", () => {
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
  });
  it("bounds hung history requests by the total deadline and starts no turn", async () => {
    const f = fixture(); f.state.hang = "thread/read"; f.save();
    const at = Date.now(); const result = await auditCodexConversation({ ...f.options, timeoutMs: 1500 });
    expect(Date.now() - at).toBeLessThan(4000); expect(result.coverage).toBe("inconclusive");
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
