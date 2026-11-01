import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { auditCodexConversation } from "./codex-evidence.js";

const fixtures: ReturnType<typeof historyFixture>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });
const captured = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-audit-proof/retained-compaction-0.165.0.json", import.meta.url), "utf8")) as { initialWindow: string; payload: Record<string, unknown> };

// Real history files and CLI pipes; the retained compaction shape is provider-recorded.
describe("Codex full-history fork compaction", () => {
  it.each(["fork", "copied compaction", "nested fork", "child's own window", "copied mid-chain compaction", "broken ancestor mid-chain", "forked compaction copy", "changed forked compaction copy", "forked copy with unknown field", "changed metadata", "unrelated metadata", "changed copied compaction", "broken child window", "missing parent", "missing original turn", "wrong compaction owner", "executable delegated content", "missing delegated turn", "client-authored delegated context"])("authenticates inherited window lineage: %s", async mode => {
    const f = historyFixture(); fixtures.push(f);
    const raw = (id: string) => readFileSync(f.state.threads[id]!.metadata.path, "utf8");
    const seed = (id: string, window: string) => {
      const lines = raw(id).trimEnd().split("\n");
      const first = JSON.parse(lines[0]!); first.payload.context_window = { window_id: window };
      lines[0] = JSON.stringify(first); writeFileSync(f.state.threads[id]!.metadata.path, lines.join("\n") + "\n");
    };
    const compact = (id: string, previous: string, number: number, first = captured.initialWindow) => {
      const payload = structuredClone(captured.payload);
      Object.assign(payload, { first_window_id: first, previous_window_id: previous, window_id: `${id}-window-${number}`, window_number: number });
      Object.assign(payload.latest_token_usage_record as object, { thread_id: id, turn_id: `${id}-turn-0` });
      const resume = payload.resume_metadata as Record<string, unknown>;
      resume.last_started_turn_id = `${id}-turn-0`; (resume.turn_attribution as Record<string, unknown>).turn_id = `${id}-turn-0`;
      const message = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-audit-proof/retained-agent-message-0.166.0.json", import.meta.url), "utf8")) as { item: Record<string, unknown>; metadata: Record<string, unknown> };
      (payload.replacement_history as unknown[]).splice(-1, 0, message.item);
      (payload.replacement_history_metadata as unknown[]).splice(-1, 0, message.metadata);
      return payload;
    };
    const fork = (id: string, parent: string) => {
      f.addThread(id, { parent }); seed(id, `${id}-new-file-window`);
      const lines = raw(id).split("\n"); lines.splice(1, 0, raw(parent).trimEnd());
      writeFileSync(f.state.threads[id]!.metadata.path, lines.join("\n"));
    };
    const command = "node verify.mjs source test-development";
    const parent = f.addThread("parent", { command, native: ["/bin/zsh", "-lc", command] });
    const parentRows = raw("parent").trimEnd().split("\n").map(line => JSON.parse(line));
    const native = parentRows.find(row => row.payload.item?.type === "CommandExecution")!;
    native.payload.started_at_ms = Date.parse(native.timestamp) + 1;
    native.timestamp = new Date(Date.parse(native.timestamp) + 1000).toISOString();
    Object.assign(parent.turns[0]!.items[0]!, { exitCode: 0, aggregatedOutput: "original command succeeded" });
    writeFileSync(parent.metadata.path, parentRows.map(row => JSON.stringify(row)).join("\n") + "\n"); f.save();
    seed("parent", captured.initialWindow);
    const forkedCopy = ["forked compaction copy", "changed forked compaction copy", "forked copy with unknown field"].includes(mode);
    const copied = forkedCopy || ["copied compaction", "nested fork", "changed copied compaction", "copied mid-chain compaction", "broken ancestor mid-chain"].includes(mode);
    if (copied) f.append("parent", f.record("compacted", compact("parent", captured.initialWindow, 1)));
    // Observed with 0.166.0: a fork's copy can start at the ancestor's latest compaction.
    const midChain = ["copied mid-chain compaction", "broken ancestor mid-chain"].includes(mode);
    // The copy is trusted only because the ancestor's own source must chain; break it there.
    if (midChain) f.append("parent", f.record("compacted", compact("parent", mode === "broken ancestor mid-chain" ? "unrelated-window" : "parent-window-1", 2)));
    fork("child", "parent");
    // Observed with 0.164.0 through 0.166.0: a fork's copy of the ancestor's compaction drops its
    // usage and attribution bookkeeping and marks the retained messages inherited.
    if (forkedCopy) writeFileSync(f.state.threads.child!.metadata.path, raw("child").split("\n").map(line => {
      if (!line.includes('"window_id":"parent-window-1"')) return line;
      const row = JSON.parse(line); const copy = row.payload;
      copy.latest_token_usage_record = null; delete copy.resume_metadata.turn_attribution;
      copy.retained_context = { verified_answers: [], incomplete: false, user_messages: [], user_messages_incomplete: false, assistant_messages: [], assistant_messages_incomplete: false, next_order: 0 };
      for (const meta of copy.replacement_history_metadata) if (meta.retained_source === undefined) meta.inherited_user_message = true;
      if (mode === "changed forked compaction copy") copy.replacement_history[0] = { type: "message", role: "user", content: [{ type: "input_text", text: "forged context" }] };
      if (mode === "forked copy with unknown field") copy.unexpected_copy_field = true;
      return JSON.stringify(row);
    }).join("\n"));
    if (midChain) writeFileSync(f.state.threads.child!.metadata.path, raw("child").split("\n").filter(line => !line.includes('"window_id":"parent-window-1"')).join("\n"));
    // Observed with 0.166.0: a fork's own compaction can start its own lineage from its new file window.
    const child = mode === "child's own window" ? compact("child", "child-new-file-window", 1, "child-new-file-window")
      : compact("child", midChain ? "parent-window-2" : copied ? "parent-window-1" : captured.initialWindow, midChain ? 3 : copied ? 2 : 1);
    const delegated = (child.replacement_history as Record<string, unknown>[]).find(item => item.type === "agent_message")!;
    if (mode === "executable delegated content") delegated.content = [{ type: "function_call", name: "exec_command", arguments: '{"cmd":"git push"}' }];
    if (mode === "missing delegated turn") (delegated.internal_chat_message_metadata_passthrough as Record<string, unknown>).turn_id = "missing-turn";
    if (mode === "client-authored delegated context") {
      const messageIndex = (child.replacement_history as Record<string, unknown>[]).indexOf(delegated);
      (child.replacement_history_metadata as Record<string, unknown>[])[messageIndex]!.client_authored = true;
    }
    if (mode === "broken child window") child.previous_window_id = "unrelated-window";
    if (mode === "wrong compaction owner") (child.latest_token_usage_record as Record<string, unknown>).thread_id = "parent";
    f.append("child", f.record("compacted", child));
    if (mode === "nested fork") {
      fork("grandchild", "child");
      f.append("grandchild", f.record("compacted", compact("grandchild", "child-window-2", 3)));
    }
    if (mode === "changed metadata") writeFileSync(f.state.threads.child!.metadata.path, raw("child").replace(captured.initialWindow, "changed-seed"));
    if (mode === "unrelated metadata") {
      f.addThread("unrelated");
      f.append("child", f.record("session_meta", JSON.parse(raw("unrelated").split("\n")[0]!).payload));
    }
    if (mode === "changed copied compaction") writeFileSync(f.state.threads.child!.metadata.path, raw("child").replace('"compaction_response_id":', '"unexpected_copy_field":true,"compaction_response_id":'));
    if (mode === "missing parent") { delete f.state.threads.parent; f.save(); }
    if (mode === "missing original turn") writeFileSync(f.state.threads.parent!.metadata.path, raw("parent").split("\n").filter(line => !line.includes('"type":"task_started"')).join("\n"));
    f.options.knownThreadIds = mode === "nested fork" ? ["child", "grandchild"] : ["child"];
    for (const commandProjection of [false, true]) {
      const result = await auditCodexConversation({ ...f.options, commandProjection });
      const valid = ["fork", "copied compaction", "nested fork", "child's own window", "copied mid-chain compaction", "forked compaction copy"].includes(mode);
      expect(result.coverage, result.problems.join(" ")).toBe(valid ? "complete" : "inconclusive");
      if (valid) {
        expect(result.problems).toEqual([]); expect(result.frontiers).toHaveLength(mode === "nested fork" ? 3 : 2);
        if (commandProjection) expect(result.commands).toEqual([expect.objectContaining({ source: "parent/parent-turn-0", callId: "parent-turn-0-native", command, outcome: "success", exitCode: 0, output: "original command succeeded", cwd: f.root })]);
      }
      else expect(result.problems.length).toBeGreaterThan(0);
      if (["broken ancestor mid-chain", "broken child window"].includes(mode)) expect(result.problems).toContain("Broken Codex compaction window chain.");
      if (mode === "changed forked compaction copy") expect(result.problems).toContain("child: changed or unowned inherited compaction.");
      if (mode === "forked copy with unknown field") expect(result.problems).toContain("child: unsupported forked compaction copy.");
    }
  });
});
