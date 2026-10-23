import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, createRepository, type Sandbox } from "./git-repositories.js";
import type { CodexEvidenceOptions } from "../session/codex-evidence.js";

export interface HistoryThread { metadata: { id: string; path: string; source?: unknown; status?: { type: string } }; turns: { id: string; status: string; itemsView: string; items: Record<string, unknown>[] }[] }
export interface HistoryState { threads: Record<string, HistoryThread>; listed?: string[]; archived?: string[]; repeatCursor?: boolean; hang?: string; changedTree?: boolean; changeRawOnRead?: string; log?: string }
export function historyFixture() {
  const sandbox: Sandbox = createSandbox();
  const root = createRepository(sandbox, "assigned"); const outside = createRepository(sandbox, "outside");
  const codexHome = join(sandbox.root, "codex-home"); mkdirSync(join(codexHome, "sessions"), { recursive: true }); mkdirSync(join(codexHome, "archived_sessions"));
  const file = join(sandbox.root, "history-state.json"); const log = join(sandbox.root, "rpc-calls.jsonl");
  const state: HistoryState = { threads: {}, log };
  const peer = fileURLToPath(new URL("../../test/stand-ins/codex-history-stand-in.mjs", import.meta.url));
  // Use a real executable shim, as the installed CLI entry point is used in production.
  const executable = join(sandbox.root, process.platform === "win32" ? "codex-history.cmd" : "codex-history");
  writeFileSync(executable, process.platform === "win32" ? `@echo off\r\n"${process.execPath}" "${peer}" %*\r\n` : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${peer.replaceAll("'", "'\\''")}' "$@"\n`); chmodSync(executable, 0o755);
  const at = "2026-10-23T15:00:00Z";
  const record = (type: string, payload: unknown) => JSON.stringify({ type, timestamp: at, payload }) + "\n";
  const save = () => writeFileSync(file, JSON.stringify(state));
  const addThread = (id: string, options: { parent?: string; archived?: boolean; count?: number; target?: string; command?: string; shell?: string; native?: string[] } = {}) => {
    const path = join(codexHome, options.archived ? "archived_sessions" : "sessions", `rollout-${id}.jsonl`);
    const source = options.parent ? { subagent: { thread_spawn: { parent_thread_id: options.parent } } } : undefined;
    const thread: HistoryThread = { metadata: { id, path, ...(source ? { source } : {}), status: { type: "idle" } }, turns: [] };
    let raw = record("session_meta", { id, ...(source ? { source } : {}) });
    raw += record("world_state", { full: true, state: { environments: { environments: { local: { shell: options.shell ?? "zsh" } } } } });
    for (let i = 0; i < (options.count ?? 1); i++) {
      const turn = `${id}-turn-${i}`;
      const payload = { turn_id: turn, cwd: root, model: "gpt-6.1-sol", effort: "high" };
      raw += record("event_msg", { type: "task_started", turn_id: turn }); raw += record("turn_context", payload);
      const items: Record<string, unknown>[] = [];
      if (options.command) {
        raw += record("response_item", { type: "function_call", name: "exec_command", call_id: `${turn}-call`, arguments: JSON.stringify({ cmd: options.command, ...(options.native ? { shell: options.native[0] } : {}) }) });
        if (options.native) {
          raw += record("event_msg", { type: "item_completed", thread_id: id, turn_id: turn, item: { type: "CommandExecution", id: `${turn}-native`, command: options.native, cwd: root, status: "completed" } });
          items.push({ type: "commandExecution", id: `${turn}-native`, status: "completed" });
        }
      } else {
        const target = options.target ?? join(root, `file-${i}.txt`);
        raw += record("response_item", { type: "custom_tool_call", name: "exec", call_id: `${turn}-call`, input: `text(await tools.apply_patch(${JSON.stringify(`*** Begin Patch\n*** Add File: ${target}\n+fixture\n*** End Patch`)}));` });
        items.push({ type: "fileChange", id: `${turn}-native`, status: "completed", changes: [{ path: target, kind: { type: "add" } }] });
      }
      raw += record("event_msg", { type: "task_complete", turn_id: turn });
      thread.turns.push({ id: turn, status: "completed", itemsView: "full", items });
    }
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, raw); state.threads[id] = thread; save(); return thread;
  };
  const options: CodexEvidenceOptions = { threadId: "parent", codexHome, worktrees: [root], cwd: root, executable, env: { ...sandbox.env, KILN_CODEX_HISTORY_FIXTURE: file } };
  addThread("parent");
  return { sandbox, root, outside, codexHome, options, state, save, addThread, record,
    append(id: string, raw: string) { appendFileSync(state.threads[id]!.metadata.path, raw); },
    calls() { return readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as { method: string; params: Record<string, unknown> }); },
  };
}
