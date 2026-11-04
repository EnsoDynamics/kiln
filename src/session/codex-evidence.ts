import { belowMinimumProblem, compareToMinimum, requirement } from "../agents/tooling-minimums.js";
import type { CommandEvidence } from "../state/development-delivery.js";
// Production, read-only Codex evidence. A successful model/process is never an audit verdict.
import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { opendir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { comparable, realPathOfNearestAncestor } from "../engine/worktree-setup.js";
import { findExecutable, runHelper } from "../platform/helper-process.js";
import { CodexHistoryRpc, type HistoryRpc } from "./codex-history-rpc.js";
import { CodexSchemaChange, compactionContent, fieldChanged, forkedCompactionCopy, retainedCompaction, schemaName } from "./codex-compaction.js";
import { decodeRawCall, EXEC_COMMAND_PARAMETERS } from "./codex-wrapper-decoder.mjs";
import { digest, EvidenceIndex, existingRawHistory, rawLines } from "./codex-evidence-store.js";
import { readPowerShell } from "./codex-powershell.js";
import { outsideChanges, gitCommandsIn, gitChange, OUTSIDE_NOTE, STAYED_CHECK_NAME, STAYED_PASSED_FACT, type OutsideChange, type StayedOutcome } from "./outside-workspace.js";
import type { TranscriptToolCall } from "./transcripts.js";

interface SourceIdentity { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }
export interface CodexFrontier { ownedTurnIds?: string[]; threadId: string; path: string; source: SourceIdentity; sha256: string; turns: string; parentThreadId?: string }
export interface CodexAudit {
  /** Entire tree was readable and stable, with authoritative terminal activity. */
  uncertaintyReviewable?: boolean;
  mutations?: { conversationId: string; callId: string; at: string; paths: string[] }[];
  commands?: CommandEvidence[];
  profile: "codex-0.162.1-static-v1" | "codex-static-v2"; coverage: "complete" | "inconclusive"; at: string;
  fingerprint: string; frontiers: CodexFrontier[]; findings: OutsideChange[]; problems: string[]; operationsChecked: number;
  /**
   * Schema failures only, at most 20 distinct short details: an unknown record type, a missing or
   * changed field Kiln reads, an unknown compaction item or content block type, an unknown
   * `exec_command` parameter. A detail names the schema element, never user text, a command, a
   * path or a value. Integrity failures add none. Absent when there are none (AC-AGENT-04, 07).
   */
  compatibility?: string[];
}
export interface CodexEvidenceOptions {
  threadId: string; codexHome: string; worktrees: string[]; cwd: string;
  executable: string; env: NodeJS.ProcessEnv; signal?: AbortSignal;
  /** Persisted spawn IDs supplement provider discovery; they never replace it. */
  knownThreadIds?: string[];
  /** Evidence-only transport injection for verified protocol/real-file tests. */
  rpc?: HistoryRpc;
  timeoutMs?: number;
  commandProjection?: boolean;
  powerShellExecutable?: string;
}
interface Metadata { id: string; path: string; status?: { type: string }; source?: { subagent?: { thread_spawn?: { parent_thread_id?: string } } } }
interface Item { exitCode?: number; aggregatedOutput?: string | null; id: string; type: string; status?: string; command?: string; cwd?: string; receiverThreadIds?: string[]; agentThreadId?: string; kind?: string; changes?: { path: string; kind: { type: string; move_path?: string } }[] }
interface Turn { id: string; status: string; itemsView: string; items: Item[] }
interface Context { turn_id: string; cwd: string; model?: string; effort?: string }
interface NativeCommand { startedAtMs?: number; resultAt?: string; id: string; threadId: string; turnId: string; argv: string[]; cwd: string; status: string }
interface RawRecord { type: string; timestamp: string; payload: RawPayload }
interface RawPayload {
  started_at_ms?: number; completed_at_ms?: number;
  reason?: string;
  window_id?: string; first_window_id?: string; previous_window_id?: string; window_number?: number; output?: unknown; latest_token_usage_record?: { thread_id?: string; turn_id?: string } | null;
  type?: string; id?: string; source?: Metadata["source"]; forked_from_id?: string; context_window?: { window_id?: string };
  turn_id?: string; cwd?: string; model?: string; effort?: string; call_id?: string; name?: string;
  arguments?: string; input?: string; namespace?: string;
  internal_chat_message_metadata_passthrough?: { turn_id?: string };
  thread_id?: string; item?: { id: string; type: string; command: string[]; cwd: string; status: string; agent_thread_id?: string; changes?: Record<string, { move_path?: string }> };
  state?: { environments?: { environments?: { local?: { shell?: string } } } }; full?: boolean;
}
const TERMINAL = new Set(["completed", "interrupted", "failed"]);
/** Raw record types Codex command evidence reads; any other type leaves the evidence inconclusive. */
const RECORD_TYPES = ["session_meta", "world_state", "turn_context", "event_msg", "response_item", "compacted", "token_usage_record", "inter_agent_communication_metadata"];
/** Verified non-executing envelope variants: the fields each requires, by JSON form; other fields are ignored. */
const METADATA_RECORDS: Record<string, Record<string, "text" | "object" | "boolean">> = {
  token_usage_record: { thread_id: "text", turn_id: "text", session_id: "text", root_turn_id: "text", response_id: "text", usage: "object", turn_token_usage: "object", thread_token_usage: "object" },
  inter_agent_communication_metadata: { trigger_turn: "boolean" },
};
const hasForm = (value: unknown, form: "text" | "object" | "boolean") => form === "text" ? typeof value === "string" : form === "boolean" ? typeof value === "boolean" : !!value && typeof value === "object" && !Array.isArray(value);
const SETTLED_ITEM = new Set(["completed", "failed", "declined"]);
const KINDS = ["subAgent", "subAgentThreadSpawn", "subAgentReview", "subAgentOther", "subAgentCompact"];
const identity = (path: string): SourceIdentity => { const s = statSync(path); if (!s.isFile()) throw new Error("History is not a file."); return { dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs }; };
const physical = (path: string) => comparable(realPathOfNearestAncestor(resolve(path)));
const requireText = (value: unknown, what: string): string => { if (typeof value !== "string" || !value) throw new Error(`Missing ${what}.`); return value; };
/** A field of a raw record Kiln reads; missing or in another form is a schema failure. */
const recordText = (value: unknown, record: string | undefined, field: string): string => { if (typeof value !== "string" || !value) throw fieldChanged(schemaName(record, "history record"), field); return value; };

/** No turns are dispatched. Memory holds a page, a raw record, compact frontiers and bounded findings. */
export async function auditCodexConversation(options: CodexEvidenceOptions): Promise<CodexAudit> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const abort = () => controller.abort(); options.signal?.addEventListener("abort", abort, { once: true }); if (options.signal?.aborted) abort();
  const signal = controller.signal;
  const scratch = mkdtempSync(join(tmpdir(), "kiln-codex-evidence-"));
  const index = new EvidenceIndex(scratch);
  const report: CodexAudit = { profile: "codex-static-v2", coverage: "inconclusive", at: new Date().toISOString(), fingerprint: "", frontiers: [], findings: [], problems: [], operationsChecked: 0 };
  let owned: CodexHistoryRpc | undefined;
  let checkedRoots: string[] | undefined;
  let unsettledOrChanged = false;
  const problem = (text: string, blocksAcknowledgment = false) => {
    if (blocksAcknowledgment || report.problems.length >= 200) unsettledOrChanged = true;
    if (report.problems.length < 200) report.problems.push(text);
  };
  const compatible = (detail: string) => {
    const list = report.compatibility ??= [];
    if (list.length < 20 && !list.includes(detail)) list.push(detail);
  };
  const checkTime = () => { if (signal.aborted) throw new Error("Codex evidence deadline exceeded or scan stopped."); };
  try {
    const home = realpathSync(options.codexHome);
    const roots = options.worktrees.map(physical);
    checkedRoots = [...roots].sort();
    if (!roots.length) throw new Error("No assigned Codex worktrees.");
    if (!options.rpc) {
      const version = await runHelper(options.executable, ["--version"], { cwd: options.cwd, env: options.env, signal, timeoutMs: 30_000 });
      // Below the minimum refuses; output Kiln can't parse proceeds and the history reads decide.
      const reading = compareToMinimum("codex", version.exitCode === 0 ? version.stdout : undefined);
      if (reading.state === "below_minimum") throw new Error(belowMinimumProblem("codex", reading.version!));
    }
    const rpc = options.rpc ?? (owned = new CodexHistoryRpc(options.executable, options.cwd, { ...options.env, CODEX_HOME: home }, signal));
    if (owned) await owned.initialize();
    const call = async <T>(method: string, params: unknown): Promise<T> => {
      checkTime();
      // The outer deadline also bounds test/provider transports that never settle.
      return new Promise<T>((resolveCall, reject) => {
        const stopped = () => reject(new Error("Codex evidence deadline exceeded or scan stopped."));
        signal.addEventListener("abort", stopped, { once: true });
        rpc.call<T>(method, params).then(resolveCall, reject).finally(() => signal.removeEventListener("abort", stopped));
        if (signal.aborted) stopped();
      });
    };
    async function* pages<T>(method: string, params: Record<string, unknown>): AsyncGenerator<T> {
      let cursor: string | null = null; const seen = new Set<string>();
      do {
        const page: { data: T[]; nextCursor: string | null } = await call<{ data: T[]; nextCursor: string | null }>(method, { ...params, cursor, limit: 100 });
        if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Incomplete Codex pagination contract.");
        for (const value of page.data) { checkTime(); yield value; }
        cursor = page.nextCursor;
        if (cursor !== null) { if (!cursor || seen.has(cursor)) throw new Error("Repeated or invalid Codex history cursor."); seen.add(cursor); if (seen.size > 100_000) throw new Error("Codex history cursor bound exceeded."); }
      } while (cursor !== null);
    }
    const discovered = async (): Promise<string[]> => {
      const ids = new Set([options.threadId, ...(options.knownThreadIds ?? [])]);
      for (const archived of [false, true]) for await (const metadata of pages<Metadata>("thread/list", { ancestorThreadId: options.threadId, archived, sourceKinds: KINDS })) {
        ids.add(requireText(metadata.id, "descendant thread ID")); if (ids.size > 4096) throw new Error("Codex conversation tree exceeds 4096 threads.");
      }
      return [...ids].sort();
    };
    const safePath = (path: string): string => {
      const actual = realpathSync(path);
      if (!["sessions", "archived_sessions"].some(folder => { const part = relative(join(home, folder), actual); return part !== "" && !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`) && !part.startsWith(sep); })) throw new Error("Codex raw history is outside its initialized home.");
      return actual;
    };
    const findRecordedPath = async (id: string): Promise<string> => {
      async function* names(folder: string): AsyncGenerator<string> {
        for await (const entry of await opendir(folder)) { checkTime(); const path = join(folder, entry.name); if (entry.isDirectory()) yield* names(path); else if (entry.isFile() && (entry.name.endsWith(`-${id}.jsonl`) || entry.name.endsWith(`-${id}.jsonl.zst`))) yield path; }
      }
      const found: string[] = [];
      for (const folder of ["sessions", "archived_sessions"]) {
        try { for await (const path of names(join(home, folder))) found.push(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      // A rollout being compressed briefly exists in both forms; the uncompressed one is the source.
      const plain = found.filter(path => !path.endsWith(".zst"));
      const candidates = plain.length ? plain : found;
      if (candidates.length !== 1) throw new Error(`Missing or ambiguous raw history for ${id}.`);
      return safePath(candidates[0]!);
    };
    const metadata = async (id: string): Promise<Metadata> => {
      const thread = (await call<{ thread: Metadata }>("thread/read", { threadId: id, includeTurns: false })).thread;
      if (thread?.id !== id) throw new Error(`Codex thread identity mismatch: ${id}.`);
      if (!options.commandProjection && thread.status?.type === "active") problem(`${id}: active runtime thread.`, true);
      return thread;
    };
    const sourcePath = async (thread: Metadata): Promise<string> => {
      try { return safePath(existingRawHistory(requireText(thread.path, "raw history path"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return findRecordedPath(thread.id); }
    };
    const hashSource = async (path: string): Promise<string> => {
      const hash = createHash("sha256"); for await (const chunk of createReadStream(path, { signal })) { checkTime(); hash.update(chunk); } return hash.digest("hex");
    };
    const before = await discovered(); const queue = [...before];
    const add = (id: unknown) => { const child = requireText(id, "referenced child ID"); if (!queue.includes(child)) queue.push(child); if (queue.length > 4096) throw new Error("Codex conversation tree exceeds 4096 threads."); };
    const turnDigest = async (id: string, save: boolean): Promise<string> => {
      const hash = createHash("sha256"); let count = 0;
      for await (const turn of pages<Turn>("thread/turns/list", { threadId: id, itemsView: "full", sortDirection: "asc" })) {
        requireText(turn.id, "turn ID");
        if (turn.itemsView !== "full" || !Array.isArray(turn.items)) throw new Error(`${id}: incomplete normalized history.`);
        hash.update(JSON.stringify(turn)); count++;
        if (!options.commandProjection && !TERMINAL.has(turn.status)) problem(`${id}: unsettled normalized turn ${turn.id}.`, true);
        if (!save) continue;
        if (index.get(`turn:${id}`, turn.id)) throw new Error(`${id}: duplicate normalized turn.`);
        index.put(`turn:${id}`, turn.id, { id: turn.id, status: turn.status });
        for (const item of turn.items) {
          if (item.type === "commandExecution") {
            if (!SETTLED_ITEM.has(item.status ?? "")) { if (options.commandProjection) continue; problem(`${id}: unfinished command ${item.id}.`, true); }
            index.put(`expectedCommand:${id}`, item.id, { ...item, turnId: turn.id });
          } else if (item.type === "fileChange") {
            if (!SETTLED_ITEM.has(item.status ?? "") || !Array.isArray(item.changes)) { if (options.commandProjection) continue; throw new Error(`${id}: incomplete native write.`); }
            if (options.commandProjection && item.changes.some(change => !change?.kind || !["add", "update", "delete"].includes(change.kind.type) || typeof change.path !== "string" || !change.path || change.kind.move_path !== undefined && typeof change.kind.move_path !== "string")) continue;
            index.put(`expectedFileChange:${id}`, item.id, { ...item, turnId: turn.id });
            for (const change of item.changes) {
              if (!["add", "update", "delete"].includes(change.kind.type)) problem(`${id}: unknown native file change.`);
              for (const path of [change.path, ...(change.kind.move_path ? [change.kind.move_path] : [])]) index.put(`expectedWrite:${id}`, `${turn.id}:${path}`, { turnId: turn.id, path });
            }
          } else if (item.type === "subAgentActivity") { if (item.agentThreadId) { add(item.agentThreadId); index.put(`delegation:${id}:${turn.id}`, item.id, { callId: item.id, threadId: item.agentThreadId, kind: item.kind }); } }
          else if (item.type === "collabAgentToolCall") for (const child of item.receiverThreadIds ?? []) add(child);
        }
      }
      return `${count}:${hash.digest("hex")}`;
    };
    // Index only bounded-size records on disk. No collection of raw calls or full turns is retained in memory.
    for (const id of queue) {
      const thread = await metadata(id); const path = await sourcePath(thread); const initial = identity(path);
      const turns = await turnDigest(id, true);
      let rawTurn: string | undefined;
      let first = true; let rawParent: string | undefined;
      for await (const { value } of rawLines(path, signal)) {
        checkTime(); const record = value as RawRecord; const payload = record.payload;
        if (typeof record.type !== "string" || !record.type) throw new CodexSchemaChange("history record type is missing or changed");
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw fieldChanged(schemaName(record.type, "history record"), "payload");
        if (!RECORD_TYPES.includes(record.type)) {
          problem(`${id}: unsupported or compacted raw envelope ${record.type}.`);
          compatible(`history record type ${schemaName(record.type)} is not recognised`);
        }
        const metadataFields = Object.hasOwn(METADATA_RECORDS, record.type) ? METADATA_RECORDS[record.type]! : {};
        for (const [field, form] of Object.entries(metadataFields)) if (!hasForm((payload as unknown as Record<string, unknown>)[field], form)) {
          problem(`${id}: unsupported raw envelope ${record.type}.`);
          compatible(`${record.type} field ${field} is missing or changed`);
        }
        if (["event_msg", "response_item"].includes(record.type)) recordText(payload.type, record.type, "type");
        if (record.type === "response_item" && ["compaction", "compacted"].includes(payload.type ?? "")) problem(`${id}: compacted raw response history.`);
        if (first) { if (record.type !== "session_meta" || payload.id !== id) throw new Error(`${id}: raw session identity mismatch.`); rawParent = payload.source?.subagent?.thread_spawn?.parent_thread_id ?? payload.forked_from_id; index.put("sessionMetadata", id, digest(payload)); first = false; }
        if (record.type === "compacted" && payload.latest_token_usage_record?.thread_id === id) {
          index.unique(`compaction:${id}`, recordText(payload.window_id, "compaction", "window_id"), digest(payload));
          index.unique(`compactionContent:${id}`, payload.window_id!, digest(compactionContent(payload)));
        }
        if (record.type === "turn_context") rawTurn = payload.turn_id;
        if (record.type === "response_item" && ["function_call", "custom_tool_call"].includes(payload.type ?? "")) index.unique(`invocationValue:${id}`, recordText(payload.call_id, payload.type, "call_id"), { payload, at: record.timestamp, turnId: payload.internal_chat_message_metadata_passthrough?.turn_id ?? rawTurn });
        if (record.type === "turn_context") index.unique(`context:${id}`, recordText(payload.turn_id, "turn_context", "turn_id"), payload);
        if (record.type === "event_msg" && ["task_started", "task_complete"].includes(payload.type ?? "")) index.unique(`${payload.type}:${id}`, recordText(payload.turn_id, payload.type, "turn_id"), digest(payload));
        // Verified in real 0.162.1 interrupted production attempts: this terminal is distinct
        // from task_complete and only settles a matching normalized interrupted turn.
        if (record.type === "event_msg" && payload.type === "turn_aborted") {
          if (payload.reason !== "interrupted") problem(`${id}: unqualified raw abort reason.`);
          else index.unique(`turn_aborted:${id}`, recordText(payload.turn_id, "turn_aborted", "turn_id"), digest(payload));
        }
        // A collaboration call the tool itself refused started and reached no child: nothing was delegated.
        // Outputs without a call ID (Codex app notices) answer no call and refuse nothing.
        if (record.type === "response_item" && payload.type === "function_call_output" && typeof payload.call_id === "string" && payload.call_id && collaborationToolFailed(payload.output)) index.put(`failedCollaboration:${id}`, payload.call_id, true);
        if (record.type === "response_item" && ["function_call", "custom_tool_call"].includes(payload.type ?? "")) index.unique(`invocation:${id}`, recordText(payload.call_id, payload.type, "call_id"), digest(payload));
        if (!options.commandProjection && record.type === "response_item" && payload.type?.endsWith("_call") && !["function_call", "custom_tool_call"].includes(payload.type)) problem(`${id}: unsupported raw invocation ${payload.type}.`);
        if (record.type === "event_msg" && payload.type === "item_completed") {
          const item = payload.item;
          if (item?.type === "CommandExecution") {
            const turnId = recordText(payload.turn_id, "item_completed", "turn_id");
            // Every raw command needs an owned normalized turn, independently of later coverage enumeration.
            // Copied ancestor commands are checked against their owning source below.
            if (payload.thread_id === id && !index.get(`turn:${id}`, turnId)) problem(`${id}: raw command has no owned normalized turn.`);
            if (payload.thread_id === id) {
              const native = { id: item.id, threadId: id, turnId, argv: item.command, cwd: item.cwd, status: item.status, resultAt: record.timestamp, ...(typeof payload.started_at_ms === "number" ? { startedAtMs: payload.started_at_ms } : {}) };
              index.unique(`nativeCommand:${id}:${turnId}`, item.id, native);
              // Receipts match only a native command whose final argument is the call's command text.
              if (Array.isArray(item.command) && typeof item.command.at(-1) === "string") index.put(`nativeByCommand:${id}:${turnId}:${digest(item.command.at(-1))}`, item.id, native);
            } else index.unique(`foreignCommand:${id}`, item.id, { id: item.id, turnId, threadId: payload.thread_id, sha256: digest(payload) });
            index.unique(`commandEvent:${id}`, item.id, digest(payload));
          }
          if (item?.type === "FileChange" && payload.thread_id === id && item.changes && typeof payload.started_at_ms === "number") {
            const changes = Object.entries(item.changes);
            if (!options.commandProjection || !Array.isArray(item.changes) && changes.every(([path, value]) => path && value && typeof value === "object" && !Array.isArray(value) && (value.move_path === undefined || typeof value.move_path === "string"))) index.put(`nativeWrite:${id}`, item.id, { id: item.id, turnId: payload.turn_id, startedAtMs: payload.started_at_ms, endedAt: record.timestamp, status: item.status, paths: changes.flatMap(([path, value]) => [physical(path), ...(value.move_path ? [physical(value.move_path)] : [])]) });
          }
          if (item?.type === "SubAgentActivity" && item.agent_thread_id) add(item.agent_thread_id);
        }
      }
      if (digest(initial) !== digest(identity(path))) throw new Error(`${id}: source changed during scan.`);
      const parent = thread.source?.subagent?.thread_spawn?.parent_thread_id;
      if (parent && rawParent !== parent) throw new Error(`${id}: parent identity differs across history views.`);
      const frontier: CodexFrontier = { threadId: id, path, source: initial, sha256: await hashSource(path), turns, ...(rawParent ? { parentThreadId: rawParent } : {}) };
      report.frontiers.push(frontier);
    }
    const byId = new Map(report.frontiers.map(frontier => [frontier.threadId, frontier]));
    for (const entry of report.frontiers) {
      const seen = new Set<string>(); let current = entry;
      while (current.threadId !== options.threadId) {
        if (seen.has(current.threadId)) throw new Error("Cyclic Codex parent links.");
        seen.add(current.threadId);
        const parent = current.parentThreadId && byId.get(current.parentThreadId);
        if (!parent) throw new Error(`${entry.threadId}: missing parent link to recorded root.`);
        current = parent;
      }
    }
    const owner = (id: string, turnId: string): string => {
      const seen = new Set<string>();
      while (!index.get(`turn:${id}`, turnId)) { if (seen.has(id)) throw new Error("Cyclic Codex parent links."); seen.add(id); id = requireText(byId.get(id)?.parentThreadId, "referenced ancestor"); if (!byId.has(id)) throw new Error("Missing referenced Codex ancestor."); }
      return id;
    };
    const effects = (calls: TranscriptToolCall[]) => {
      for (const call of calls) {
        report.operationsChecked++;
        if (options.commandProjection) continue;
        for (const finding of outsideChanges({ calls: [call] }, roots)) {
          if (report.findings.some(previous => previous.fact === finding.fact && previous.checkout === finding.checkout)) continue;
          if (report.findings.length >= 200) { problem("Outside findings exceed the bounded report; evidence remains inconclusive.", true); break; }
          report.findings.push(finding);
        }
      }
    };
    for (const frontier of report.frontiers) {
      const id = frontier.threadId;
      if (options.commandProjection) frontier.ownedTurnIds = [];
      for await (const turn of index.values<{ id: string; status: string }>(`turn:${id}`)) {
        if (options.commandProjection) frontier.ownedTurnIds!.push(turn.id);
        const aborted = index.get(`turn_aborted:${id}`, turn.id);
        const completed = index.get(`task_complete:${id}`, turn.id);
        if (!options.commandProjection && (!index.get(`task_started:${id}`, turn.id) || !(completed || aborted && turn.status === "interrupted"))) problem(`${id}: missing raw terminal frontier for ${turn.id}.`, true);
        if (aborted && (turn.status !== "interrupted" || completed)) problem(`${id}: conflicting raw interrupted frontier for ${turn.id}.`, true);
      }
      for await (const command of index.values<{ id: string; turnId: string; threadId: string; sha256: string }>(`foreignCommand:${id}`)) {
        const origin = owner(id, command.turnId);
        if (origin !== command.threadId || origin === id) problem(`${id}: unowned copied native command.`);
        // Match source events without trusting an inherited thread ID by itself.
        if (index.get<string>(`commandEvent:${origin}`, command.id) !== command.sha256) problem(`${id}: changed inherited native command.`);
      }
      let currentTurn: string | undefined; let shell: string | undefined;
      // Window lineages this file may continue: each seed in its metadata prefix (a fork's
      // own window and its copied ancestor's) and every window a compaction produced.
      const windows = new Map<string, NonNullable<Parameters<typeof retainedCompaction>[1]>>();
      let metadataPrefix = true;
      // Index each call's exec and patch operations once, so matching a native receipt to its
      // call reads only the calls with that exact command or patch (a full rescan per receipt is
      // quadratic and exceeds the scan deadline on long conversations).
      if (options.commandProjection) for await (const candidate of index.values<{ payload: RawPayload; at: string; turnId?: string }>(`invocationValue:${id}`)) {
        // Only calls in this conversation's own turns can own its receipts.
        const cwd = candidate.turnId && index.get(`turn:${id}`, candidate.turnId) ? index.get<Context>(`context:${id}`, candidate.turnId)?.cwd : undefined;
        const decodedCandidate = cwd ? decodeRawCall(candidate.payload) : undefined;
        if (!cwd || decodedCandidate?.coverage !== "complete") continue;
        const entry = { callId: candidate.payload.call_id!, at: candidate.at };
        for (const one of decodedCandidate.operations as { name: string; input: unknown }[]) {
          const input = one.input as Record<string, unknown> | undefined;
          if (one.name === "exec_command" && typeof input?.cmd === "string") index.put(`execCandidate:${id}:${candidate.turnId}:${digest([input.cmd, physical(resolve(cwd, typeof input.workdir === "string" ? input.workdir : "."))])}`, entry.callId, entry);
          if (one.name === "apply_patch" && typeof one.input === "string") index.put(`patchCandidate:${id}:${candidate.turnId}:${digest(one.input)}`, entry.callId, entry);
        }
      }
      for await (const { value } of rawLines(frontier.path, signal)) {
        checkTime(); const record = value as RawRecord; const payload = record.payload;
        if (record.type === "session_meta") {
          if (!metadataPrefix) throw new Error(`${id}: session metadata appears after original history.`);
          const source = recordText(payload.id, "session_meta", "id");
          let ancestor: string | undefined = id;
          while (ancestor && ancestor !== source) ancestor = byId.get(ancestor)?.parentThreadId;
          if (!ancestor || index.get("sessionMetadata", source) !== digest(payload)) throw new Error(`${id}: changed or unowned inherited session metadata.`);
          // Forks prepend their own file identity, followed by the copied history's original
          // window seed. A child's compaction may continue either lineage.
          const window = payload.context_window?.window_id;
          if (window) windows.set(window, { first: window, current: window, number: 0 });
        } else metadataPrefix = false;
        if (record.type === "compacted" && payload.latest_token_usage_record === null) {
          // Observed with 0.166.0: a fork of a compacted thread opens with a copy of the ancestor's
          // compaction that drops its usage and attribution bookkeeping. The model-visible content
          // and window identity must match an ancestor's own compaction, validated in its source.
          const copy = forkedCompactionCopy(payload);
          if (!copy) throw new Error(`${id}: unsupported forked compaction copy.`);
          let ancestor = byId.get(id)?.parentThreadId;
          while (ancestor && index.get(`compactionContent:${ancestor}`, copy.current) !== digest(compactionContent(payload))) ancestor = byId.get(ancestor)?.parentThreadId;
          if (!ancestor) throw new Error(`${id}: changed or unowned inherited compaction.`);
          windows.set(copy.current, copy);
        } else if (record.type === "compacted") {
          const usage = payload.latest_token_usage_record;
          if (!usage || typeof usage !== "object" || Array.isArray(usage)) throw fieldChanged("compaction", "latest_token_usage_record");
          const origin = owner(id, recordText(usage.turn_id, "compaction", "latest_token_usage_record.turn_id"));
          if (index.get(`compaction:${origin}`, recordText(payload.window_id, "compaction", "window_id")) !== digest(payload)) throw new Error(`${id}: changed or unowned inherited compaction.`);
          const previous = windows.get(payload.previous_window_id ?? "")
            // A copied ancestor compaction can begin mid-chain; its transition was validated in the
            // ancestor's own source, which the digest above matches exactly.
            ?? (origin !== id ? { first: payload.first_window_id ?? "", current: payload.previous_window_id ?? "", number: (payload.window_number ?? 0) - 1 } : undefined);
          const next = retainedCompaction(payload, previous, origin, turnId => {
            const source = owner(id, turnId);
            return !!index.get(`context:${source}`, turnId) && !!index.get(`task_started:${source}`, turnId);
          });
          windows.set(next.current, next);
        }
        if (record.type === "world_state") { const env = payload.state?.environments?.environments?.local; if (env || payload.full) shell = env?.shell; }
        if (record.type === "turn_context") currentTurn = payload.turn_id;
        if (record.type === "turn_context" || record.type === "event_msg" && payload.type === "task_started") {
          const origin = owner(id, recordText(payload.turn_id, record.type === "turn_context" ? "turn_context" : "task_started", "turn_id"));
          const group = record.type === "turn_context" ? "context" : "task_started";
          const original = index.get(`${group}:${origin}`, payload.turn_id!);
          const expected = group === "context" ? digest(original) : original;
          if (expected !== digest(payload)) problem(`${id}: changed inherited ${group}.`);
        }
        if (record.type !== "response_item" || !["function_call", "custom_tool_call"].includes(payload.type ?? "")) continue;
        const turnId = requireText(payload.internal_chat_message_metadata_passthrough?.turn_id ?? currentTurn, "originating call turn");
        const origin = owner(id, turnId);
        if (index.get(`invocation:${origin}`, payload.call_id!) !== digest(payload)) { problem(`${id}: changed inherited invocation.`); continue; }
        if (origin !== id) continue;
        const context = index.get<Context>(`context:${id}`, turnId);
        if (!context?.cwd) throw new Error(`${id}: missing call context.`);
        const decoded = decodeRawCall(payload);
        if (!options.commandProjection && decoded.coverage !== "complete") problem(`${id}/${payload.call_id}: ${decoded.reason}`);
        const at = recordText(record.timestamp, "response_item", "timestamp");
        for (const operation of decoded.operations as { name: string; input: unknown }[]) {
          if (operation.name === "exec_command") {
            const input = operation.input as Record<string, unknown>;
            // A parameter Kiln doesn't recognise can change where or how the command ran: that call
            // gets no receipt, and every other call keeps its own (AC-AGENT-04, 07).
            const unknown = input && typeof input === "object" ? Object.keys(input).filter(key => !EXEC_COMMAND_PARAMETERS.includes(key)) : [];
            for (const key of unknown) compatible(`exec_command parameter ${schemaName(key)} is not recognised, so that command has no receipt`);
            if (!input || unknown.length) { if (options.commandProjection) continue; throw new Error("Unrecognized exec parameters."); }
            // Unsupported calls supply no receipt; they do not invalidate other authenticated calls.
            if (options.commandProjection && (typeof input.cmd !== "string" || !input.cmd || input.workdir !== undefined && (typeof input.workdir !== "string" || !input.workdir))) continue;
            const command = requireText(input.cmd, "recorded command");
            const cwd = physical(resolve(context.cwd, input.workdir === undefined ? "." : requireText(input.workdir, "command directory")));
            let matched = false; let handledPowerShell = false;
            // Command projection reads only the turn's natives for this command text; a full check
            // still visits every native command in the turn.
            for await (const native of index.values<NativeCommand>(options.commandProjection ? `nativeByCommand:${id}:${turnId}:${digest(command)}` : `nativeCommand:${id}:${turnId}`)) {
              const argv = native.argv;
              if (!Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== "string") || typeof native.cwd !== "string" || !native.cwd || !SETTLED_ITEM.has(native.status)) { if (options.commandProjection) continue; throw new Error(`${id}: unsettled or unsupported native command.`); }
              let nativeCwd = native.cwd;
              if (nativeCwd.startsWith("file:")) {
                try { nativeCwd = fileURLToPath(nativeCwd); }
                catch (error) { if (options.commandProjection) continue; throw error; }
              }
              if (physical(nativeCwd) !== cwd || (input.shell !== undefined && argv[0] !== input.shell)) continue;
              const posix = argv.length === 3 && ["/bin/zsh", "/bin/bash", "/bin/sh"].includes(argv[0]!) && ["-c", "-lc"].includes(argv[1]!) && argv[2] === command;
              const powerShell = argv.length === 6 && /(?:^|[/\\])(?:pwsh|powershell)(?:\.exe)?$/i.test(argv[0]!) && argv.slice(1, 5).map(arg => arg.toLowerCase()).join(" ") === "-nologo -noprofile -noninteractive -command" && argv[5] === command;
              if (!posix && !powerShell) continue;
              matched = true; index.put(`coveredCommand:${id}`, native.id, true);
              if (options.commandProjection) {
                const candidates: { callId: string; at: string }[] = [];
                for await (const candidate of index.values<{ callId: string; at: string }>(`execCandidate:${id}:${turnId}:${digest([command, cwd])}`)) {
                  if (!(native.startedAtMs !== undefined && Date.parse(candidate.at) > native.startedAtMs)) candidates.push(candidate);
                }
                const latest = candidates.map(one => one.at).sort().at(-1);
                const owners = native.startedAtMs === undefined ? candidates : candidates.filter(one => one.at === latest);
                if (owners.length !== 1 || owners[0]!.callId !== payload.call_id) continue;
                const result = index.get<Item>(`expectedCommand:${id}`, native.id);
                if (result?.status === native.status && typeof result.exitCode === "number" && (typeof result.aggregatedOutput === "string" || result.aggregatedOutput === null) && native.resultAt) {
                  (report.commands ??= []).push({ source: `${id}/${turnId}`, callId: native.id, command, cwd, calledAt: at, resultAt: native.resultAt, outcome: native.status === "completed" && result.exitCode === 0 ? "success" : "error", exitCode: result.exitCode, // Qualified 0.162.1 full history explicitly uses null for zero output bytes.
                    // An absent output property is still unresolved, never inferred as empty.
                    output: result.aggregatedOutput === null ? "" : result.aggregatedOutput });
                }
              }
              if (powerShell && !options.commandProjection) {
                handledPowerShell = true;
                const parser = options.powerShellExecutable ?? findExecutable("pwsh", options.env);
                if (!parser) throw new Error(`PowerShell is unavailable to read this command; Kiln's parser needs ${requirement("powershell")}.`);
                const result = await readPowerShell(command, { executable: parser, cwd, env: options.env, signal, context: { platform: process.platform, home } });
                effects(result.paths.map(path => ({ name: "Write", cwd, at, input: { file_path: path } })));
                for (const git of result.git) effects([{ name: "Bash", cwd: git.place ?? cwd, at, input: { command: `git ${[git.subcommand ?? "", ...git.args].map(word => "'" + word.replaceAll("'", "'\\''") + "'").join(" ")}` } }]);
              }
            }
            const isPowerShell = typeof input.shell === "string" && /(?:pwsh|powershell)(?:\.exe)?$/i.test(input.shell);
            if (!matched && (input.shell !== undefined || !["zsh", "bash", "sh"].includes(shell ?? ""))) { if (!options.commandProjection) problem(`${id}: no recorded shell identity.`); continue; }
            if (!options.commandProjection && !isPowerShell && !handledPowerShell) {
              for (const git of gitCommandsIn(command, cwd)) if (gitChange(git.subcommand, git.args) && !git.place) problem(`${id}: unplaced mutating Git command.`);
              effects([{ name: "Bash", cwd, at, input: { command } }]);
            }
          } else if (operation.name === "apply_patch") {
            const patch = operation.input;
            if (typeof patch !== "string" || !patch.startsWith("*** Begin Patch\n") || !patch.trimEnd().endsWith("*** End Patch")) { if (options.commandProjection) continue; throw new Error("Malformed raw patch."); }
            const paths = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(match => resolve(context.cwd, match[1]!));
            if (!paths.length) { if (options.commandProjection) continue; throw new Error("Patch has no recorded paths."); }
            if (options.commandProjection) {
              for await (const native of index.values<{ id: string; turnId: string; startedAtMs: number; endedAt: string; status: string; paths: string[] }>(`nativeWrite:${id}`)) {
                if (native.turnId !== turnId || native.status !== "completed" || native.startedAtMs < Date.parse(at) || digest([...native.paths].sort()) !== digest(paths.map(physical).sort())) continue;
                const normalized = index.get<Item>(`expectedFileChange:${id}`, native.id);
                if (normalized?.status !== "completed" || digest(normalized.changes?.flatMap(c => [physical(c.path), ...(c.kind.move_path ? [physical(c.kind.move_path)] : [])]).sort()) !== digest([...native.paths].sort())) continue;
                const candidates: { callId: string; at: string }[] = [];
                for await (const candidate of index.values<{ callId: string; at: string }>(`patchCandidate:${id}:${turnId}:${digest(patch)}`)) {
                  if (!(Date.parse(candidate.at) > native.startedAtMs)) candidates.push(candidate);
                }
                const latest = candidates.map(c => c.at).sort().at(-1); const owners = candidates.filter(c => c.at === latest);
                if (owners.length === 1 && owners[0]!.callId === payload.call_id) (report.mutations ??= []).push({ conversationId: id, callId: native.id, at: native.endedAt, paths: native.paths });
              }
            }
            for (const path of paths) { index.put(`patch:${id}`, `${turnId}:${physical(path)}`, true); effects([{ name: "Write", cwd: context.cwd, at, input: { file_path: path } }]); }
          } else if (!options.commandProjection && operation.name === "write_stdin" && (operation.input as { chars?: string }).chars) problem(`${id}: interactive input requires a separate reader.`);
          else if (["spawn_agent", "send_message", "followup_task"].includes(operation.name)) {
            let found = false;
            for await (const delegation of index.values<{ callId: string; threadId: string; kind: string }>(`delegation:${id}:${turnId}`)) if (delegation.callId === payload.call_id && byId.has(delegation.threadId) && ["started", "interacted"].includes(delegation.kind)) found = true;
            if (!found && !index.get(`failedCollaboration:${id}`, payload.call_id!) || decoded.operations.filter(op => ["spawn_agent", "send_message", "followup_task"].includes(op.name)).length !== 1) problem(`${id}: unresolved delegated work.`, true);
          }
        }
      }
      for await (const command of index.values<Item & { turnId: string }>(`expectedCommand:${id}`)) {
        const native = index.get<NativeCommand>(`nativeCommand:${id}:${command.turnId}`, command.id);
        if (!options.commandProjection && (!native || native.status !== command.status || !index.get(`coveredCommand:${id}`, command.id))) problem(`${id}: native command not covered by a decoded invocation.`);
      }
      // Raw-only commands must also be covered, even if the normalized view omitted them.
      for await (const turn of index.values<{ id: string }>(`turn:${id}`)) for await (const native of index.values<NativeCommand>(`nativeCommand:${id}:${turn.id}`)) if (!options.commandProjection && !index.get(`coveredCommand:${id}`, native.id)) problem(`${id}: uncovered raw native command.`);
      for await (const write of index.values<{ turnId: string; path: string }>(`expectedWrite:${id}`)) if (!options.commandProjection && !index.get(`patch:${id}`, `${write.turnId}:${physical(write.path)}`)) problem(`${id}: native file change not covered by decoded input.`);
    }
    if (digest(before) !== digest(await discovered())) problem("Conversation tree changed during scan.", true);
    for (const frontier of report.frontiers) {
      const fresh = await metadata(frontier.threadId);
      if (await turnDigest(frontier.threadId, false) !== frontier.turns) problem(`${frontier.threadId}: normalized frontier changed.`, true);
      if (await sourcePath(fresh) !== frontier.path || digest(identity(frontier.path)) !== digest(frontier.source) || await hashSource(frontier.path) !== frontier.sha256) problem(`${frontier.threadId}: raw source changed after scan.`, true);
    }
    checkTime();
    report.uncertaintyReviewable = !unsettledOrChanged;
    report.coverage = report.problems.length ? "inconclusive" : "complete";
  } catch (error) {
    problem((error as Error).message);
    if (error instanceof CodexSchemaChange) compatible(error.detail);
  }
  finally {
    await owned?.close();
    clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
    rmSync(scratch, { recursive: true, force: true });
  }
  report.frontiers.sort((a, b) => a.threadId.localeCompare(b.threadId));
  report.fingerprint = digest({ profile: report.profile, roots: checkedRoots, frontiers: report.frontiers, findings: report.findings });
  return report;
}

/**
 * A collaboration call Codex itself refused reached no child. Acknowledgements are empty or a JSON
 * object; refusals are plain text, e.g. "collab spawn failed: agent thread limit reached",
 * "collab tool failed: …" or "agent with id … not found" (observed 0.166.0 shapes). A call
 * whose child really ran still has its recorded child activity.
 */

export function collaborationToolFailed(output: unknown): boolean {
  if (typeof output !== "string" || !output) return false;
  try { const value: unknown = JSON.parse(output); return !value || typeof value !== "object" || Array.isArray(value); }
  catch { return true; }
}

/** An explicit uncertainty acknowledgment requires a readable, stable, terminal tree. */
export function uncertaintyFingerprint(audit: CodexAudit): string | undefined {
  // No source identity means there is no stable history to acknowledge.
  if (!audit.uncertaintyReviewable || !audit.fingerprint || !audit.frontiers.length) return undefined;
  return digest({ fingerprint: audit.fingerprint, coverage: audit.coverage, problems: audit.problems });
}

export function codexStayedOutcome(sessionId: string, audit: CodexAudit, confirmedFingerprints: string[], uncertaintyFingerprints: string[] = []): StayedOutcome {
  const uncertainty = uncertaintyFingerprint(audit);
  const accepted = audit.coverage === "inconclusive" && uncertainty !== undefined && uncertaintyFingerprints.includes(uncertainty);
  const covered = confirmedFingerprints.includes(audit.fingerprint);
  const changes = covered ? [] : audit.findings;
  const transcripts = audit.coverage === "complete" || accepted ? [] : [{ sessionId, missing: false, fact: `Codex evidence is incomplete: ${audit.problems.join(" ")}` }];
  const passed = !changes.length && !transcripts.length;
  const facts = passed ? [accepted ? "Workspace uncertainty accepted for this checked history; confinement was not verified." : STAYED_PASSED_FACT] : [...changes.map(change => change.fact), ...(changes.length ? [OUTSIDE_NOTE] : []), ...transcripts.map(problem => problem.fact)];
  return { passed, changes, transcripts, check: { name: STAYED_CHECK_NAME, passed, facts } };
}
