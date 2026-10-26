// Protected durable Codex attempts. The engine's Git/document checks still decide delivery.
import { codexBillingSummary } from "../billing/codex.js";
import type { BillingSummary } from "../billing/inspection.js";
import { appendFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { processStartTime } from "../platform/process-start-time.js";
import { readSessionRecord, writeSessionRecord, sessionStorageKey, type SessionRecord, type SessionRun, type CodexRunFacts } from "../state/records.js";
import { appendJsonLine, ensurePrivateDirectory } from "../state/state-files.js";
import { sessionFiles, type SessionControl } from "./claude-session.js";
import { CodexWorkRpc, codexRequestDecision, type CodexMessage } from "./codex-work-rpc.js";
import { assertCodexEffective, codexServerArguments, codexThreadParameters, prepareCodexLaunch, type CodexEffectiveSettings, type CodexLaunchOptions } from "./codex-launch-profile.js";
import { CodexHistoryRpc, type HistoryRpc } from "./codex-history-rpc.js";
import { CodexOwnedProcesses, stopCodexOwnedProcesses } from "./codex-owned-processes.js";
import { readCodexTurnExecutions } from "./codex-turn-provenance.js";
import { CODEX_NATIVE_CLEANUP_WARNING, stopCodexBackgroundTerminals } from "./codex-background-terminals.js";
import { codexSessionPrompt } from "./prompts.js";
import { CodexUsageRecoveryUnavailable, codexUsageRefusal, codexUsageRelease, consumeCodexUsage, recordCodexUsageProgress } from "./codex-usage.js";

interface Turn { id: string; status: string; error?: unknown; items?: { type: string; phase?: string; text?: string }[] }
const TERMINAL = new Set(["completed", "failed", "interrupted"]);
const activeSessions = new Set<string>();
export interface CodexSessionOptions extends Omit<CodexLaunchOptions, "choice"> {
  record: SessionRecord; stateDirectory: string; prompt: string; cause: SessionRun["cause"];
  note?: string;
  onSpawned?(control: SessionControl): void;
  /** Provider-native messages; the output adapter must not fabricate Claude events. */
  onEvent?(event: CodexMessage, at: string): void;
  onStderr?(text: string, at: string): void;
  onHistory?(threadId: string, turns: { id: string; items?: unknown[]; startedAt?: number | null }[]): void;
  beforeEnd?(): Promise<void>;
  /** Engine checks current authorization immediately before durable attempt allocation. */
  beforeStart?(): void;
  onRecordChange?(): void;
  onBilling?(summary: BillingSummary): void;
  /** Kiln guidance, separate from provider-native events. Wire to terminal/browser in 3b2. */
  onWarning?(text: string): void;
  stopWaitMs?: number;
}

async function turns(rpc: HistoryRpc, threadId: string): Promise<Turn[]> {
  const result: Turn[] = []; const cursors = new Set<string>(); let cursor: string | null = null;
  do {
    const page: { data: Turn[]; nextCursor: string | null } = await rpc.call<{ data: Turn[]; nextCursor: string | null }>("thread/turns/list", { threadId, cursor, limit: 100, itemsView: "full" });
    if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Incomplete Codex turn pagination.");
    result.push(...page.data); cursor = page.nextCursor;
    if (result.length > 100_000 || cursor !== null && (!cursor || cursors.has(cursor))) throw new Error("Codex turn history exceeds its bound or repeats a cursor.");
    if (cursor) cursors.add(cursor);
  } while (cursor !== null);
  return result;
}

/** Preflight failures allocate no run. Persistence always precedes a possibly effective call. */
export async function runCodexSession(options: CodexSessionOptions): Promise<SessionRun> {
  const { record } = options;
  if (record.agentId !== "codex") throw new Error("Codex cannot run or transfer another agent's session.");
  const key = `${options.stateDirectory}\0${record.sessionId}`;
  if (activeSessions.has(key)) throw new Error("This Codex session already has an active attempt.");
  activeSessions.add(key);
  try { return await execute(options); } finally { activeSessions.delete(key); }
}

async function execute(options: CodexSessionOptions): Promise<SessionRun> {
  const { record } = options;
  const saved = readSessionRecord(options.stateDirectory, sessionStorageKey(record), record.sessionId);
  if (saved?.runs.at(-1)?.endedAt === undefined && saved?.runs.length || record.runs.length && !record.runs.at(-1)!.endedAt) throw new Error("Reconcile the previous Codex attempt before dispatching work.");
  if (record.codex && realpathSync(options.cwd) !== record.codex.launchIntent.cwd) throw new Error("A Codex resume must keep its recorded working directory.");
  if (options.cause !== "launch" && !record.conversation?.threadId) throw new Error("Codex conversation identity is missing; use the fresh-session path.");
  if (options.cause === "launch" && record.runs.length) throw new Error("A Codex conversation cannot be silently replaced by a launch.");
  const previous = record.runs.at(-1);
  if (previous?.codex?.reconciliation === "ambiguous") throw new Error("Codex's prior dispatch is ambiguous. Check its authoritative history before resuming.");
  if (previous) await stopCodexOwnedProcesses(previous);
  const env = { ...options.env, ...(record.conversation?.codexHome ? { CODEX_HOME: record.conversation.codexHome } : {}) };
  const prepared = await prepareCodexLaunch({ ...options, env, choice: { model: record.model, ...(record.effort ? { effort: record.effort } : {}) } });
  if (options.signal?.aborted) throw new Error("Kiln is stopping.");
  const automaticRelease = options.cause === "limit_resume" ? codexUsageRelease(record, previous!.limitRefusal!, prepared.usage) : undefined;
  if (automaticRelease && automaticRelease.state !== "allowed") {
    writeSessionRecord(options.stateDirectory, record);
    throw new CodexUsageRecoveryUnavailable(automaticRelease);
  }
  options.beforeStart?.();
  const files = sessionFiles(options.stateDirectory, record);
  ensurePrivateDirectory(files.directory);
  const save = () => { writeSessionRecord(options.stateDirectory, record); options.onRecordChange?.(); };
  record.workingDirectory ??= prepared.profile.cwd;
  record.codex ??= { launchIntent: prepared.profile, originalAccount: prepared.account };
  const now = () => new Date().toISOString();
  const facts: CodexRunFacts = { intentAt: now(), requested: prepared.choice, account: prepared.account, profile: prepared.profile, humanRequests: [], modelActivityAt: [], processOwner: randomUUID(), cleanupWarning: CODEX_NATIVE_CLEANUP_WARNING };
  if (automaticRelease) facts.automaticUsageEvidence = consumeCodexUsage(record, automaticRelease);
  const billing = codexBillingSummary(prepared.usage);
  options.onBilling?.(billing); // PRD history must be durable before any work process exists.
  const run: SessionRun = { billing, startedAt: facts.intentAt, cause: options.cause, codex: facts, ...(options.note ? { note: options.note } : {}) };
  record.runs.push(run); save(); // No child exists until this durable intent succeeds.
  const terminals = new Map<string, Turn>();
  const terminalTimes = new Map<string, string>();
  const active = new Map<string, string>();
  let parentId = record.conversation?.threadId;
  let initializedWork = false;
  let changed!: () => void;
  let revision = 0;
  const wake = () => { revision++; changed?.(); };
  let stopping = false;
  let stopTimer: NodeJS.Timeout | undefined;
  const interrupt = () => {
    if (stopping) { rpc.fail(new Error("Codex stop grace shortened.")); return; }
    stopping = true;
    run.interruptedAt ??= now(); run.interruptedBy ??= "sigint"; save();
    for (const [threadId, turnId] of active) void rpc.call("turn/interrupt", { threadId, turnId }).catch(error => rpc.fail(error as Error));
    stopTimer = setTimeout(() => rpc.fail(new Error("Codex did not settle during the stop grace.")), options.stopWaitMs ?? 30_000);
    wake();
  };
  const rememberChild = (id: unknown) => {
    if (typeof id !== "string" || !id || id === parentId) return;
    const known = record.conversation!.knownThreadIds ??= [];
    if (!known.includes(id)) { if (known.length >= 4096) throw new Error("Codex conversation tree exceeds its bound."); known.push(id); save(); }
  };
  const receive = (message: CodexMessage) => {
    const at = now();
    // Account replies are never sent through the work connection or logged here.
    if (message.method) {
      if (!message.method.endsWith("/delta")) appendJsonLine(files.events, { at, agentId: "codex", event: message });
      options.onEvent?.(message, at);
    }
    const params = message.params ?? {};
    if (message.method === "error" && typeof params.threadId === "string" && typeof params.turnId === "string" && typeof params.willRetry === "boolean") {
      (facts.errors ??= []).push({ at, threadId: params.threadId, turnId: params.turnId, error: params.error, willRetry: params.willRetry }); save();
    }
    if (message.method && message.id !== undefined) {
      const decision = codexRequestDecision(message.method);
      facts.humanRequests.push({ at, method: message.method, request: params, decision, stopped: decision.stop }); save();
      rpc.send({ id: message.id, ...(decision.result !== undefined ? { result: decision.result } : { error: decision.error }) });
      if (decision.stop) interrupt();
      return;
    }
    if (message.method === "turn/started") {
      const turn = params.turn as Turn;
      if (typeof params.threadId === "string" && turn?.id) {
        active.set(params.threadId, turn.id);
        if (stopping) void rpc.call("turn/interrupt", { threadId: params.threadId, turnId: turn.id }).catch(error => rpc.fail(error as Error));
      }
    }
    if (message.method === "turn/completed") {
      const turn = params.turn as Turn;
      if (typeof params.threadId !== "string" || !turn?.id || !TERMINAL.has(turn.status)) throw new Error("Invalid Codex terminal turn.");
      terminals.set(`${params.threadId}:${turn.id}`, turn); active.delete(params.threadId); wake();
      terminalTimes.set(`${params.threadId}:${turn.id}`, at);
      if (params.threadId === parentId && facts.dispatch && !facts.dispatch.previousTurnIds.includes(turn.id) && (!facts.turnId || facts.turnId === turn.id)) {
        facts.terminal = { status: turn.status as "completed" | "failed" | "interrupted", ...(turn.error !== undefined ? { error: turn.error } : {}), at, modelActivityCount: facts.modelActivityAt.length }; save();
      }
    }
    if (message.method === "thread/started" && record.conversation) {
      const thread = params.thread as { id?: string; parentThreadId?: string };
      if (thread?.parentThreadId === parentId || record.conversation.knownThreadIds?.includes(thread?.parentThreadId ?? "")) rememberChild(thread.id);
    }
    if (["item/started", "item/completed"].includes(message.method ?? "")) {
      const item = params.item as { type?: string; phase?: string; text?: string; questions?: unknown[]; receiverThreadIds?: string[]; agentThreadId?: string };
      if (!item) throw new Error("Codex item is missing.");
      for (const id of item.receiverThreadIds ?? []) rememberChild(id);
      if (item.agentThreadId) rememberChild(item.agentThreadId);
      const questions = [...(Array.isArray(item.questions) ? item.questions : [])];
      if (item.type === "agentMessage" && typeof item.text === "string") {
        if (message.method === "item/completed" && item.text.trim()) { facts.modelActivityAt.push(at); save(); }
        if (message.method === "item/completed" && params.threadId === parentId && item.phase === "final_answer") run.result = { subtype: "codex_final", isError: false, text: item.text };
        if (item.text.trimStart().startsWith("{")) { try { const parsed = JSON.parse(item.text) as { questions?: unknown[] }; if (Array.isArray(parsed.questions)) questions.push(...parsed.questions); } catch { /* Prose is not a structured question. */ } }
      }
      if (questions.length) { facts.humanRequests.push({ at, method: message.method!, request: params, decision: { interrupted: true }, stopped: true }); save(); interrupt(); }
    }
  };
  const rpc = new CodexWorkRpc({ executable: options.executable, args: codexServerArguments(facts.processOwner), cwd: prepared.profile.cwd, env: { ...env, KILN_CODEX_PROCESS_OWNER: facts.processOwner, ...(prepared.profile.powerShell ? { KILN_CODEX_JOB_POWERSHELL: prepared.profile.powerShell.executable } : {}) }, onMessage: receive, onStderr: text => { appendFileSync(files.stderr, text, { mode: 0o600 }); options.onStderr?.(text, now()); } });
  const owned = new CodexOwnedProcesses(run, save, error => rpc.fail(error));
  const abort = () => interrupt();
  try {
    if (!rpc.child.pid) throw new Error("Could not start Codex work server.");
    run.pid = rpc.child.pid; save();
    const startTime = await processStartTime(run.pid);
    if (!startTime) throw new Error("Could not establish Codex process ownership before work.");
    run.processStartTime = startTime; save(); await owned.start();
    options.onWarning?.(CODEX_NATIVE_CLEANUP_WARNING);
    options.onSpawned?.({ pid: run.pid, interrupt, endTree: () => rpc.fail(new Error("Codex process tree termination requested.")), closed: rpc.closed });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) interrupt();
    const initialized = await rpc.initialize();
    initializedWork = true;
    if (stopping) throw new Error("Codex stopped before conversation creation.");
    const home = realpathSync(initialized.codexHome);
    if (record.conversation?.codexHome && realpathSync(record.conversation.codexHome) !== home) throw new Error("Codex resumed under a different history home.");
    const result = await rpc.call<CodexEffectiveSettings>(parentId ? "thread/resume" : "thread/start", { ...codexThreadParameters(prepared), ...(parentId ? { threadId: parentId, excludeTurns: true } : { ephemeral: false, allowProviderModelFallback: false }) });
    // Save even a refused effective profile's returned identity. Never lose a created thread.
    if (parentId && result.thread.id !== parentId) throw new Error("Codex resumed a different conversation.");
    parentId = result.thread.id;
    record.conversation = { ...record.conversation, threadId: parentId, sessionTreeId: result.thread.sessionId, codexHome: home };
    facts.effective = { model: result.model, ...(result.reasoningEffort ? { effort: result.reasoningEffort } : {}) };
    facts.instructionSources = result.instructionSources ?? [];
    save();
    try { assertCodexEffective(result, prepared); }
    catch (error) { facts.verificationFailure = (error as Error).message; throw error; }
    // A freshly created persistent thread is not materialized until its first user input.
    const prior = options.cause === "launch" ? [] : await turns(rpc, parentId);
    if (prior.length) options.onHistory?.(parentId, prior);
    if (prior.some(turn => !TERMINAL.has(turn.status))) throw new Error("Codex conversation still has unsettled work. Check it before resuming.");
    if (stopping) throw new Error("Codex stopped before dispatch.");
    facts.dispatch = { at: now(), previousTurnIds: prior.map(turn => turn.id) }; save();
    const prompt = options.cause === "launch" && ["phase", "delivery_audit", "test_audit"].includes(record.kind) ? codexSessionPrompt(options.prompt, prepared.profile.skills, record.kind === "delivery_audit" ? "delivery-audit" : record.kind === "test_audit" ? "test-audit" : "implement-from-requirements") : options.prompt;
    const started = await rpc.call<{ turn: Turn }>("turn/start", { threadId: parentId, model: record.model, ...(record.effort ? { effort: record.effort } : {}), input: [{ type: "text", text: prompt }], clientUserMessageId: createHash("sha256").update(`${record.sessionId}:${record.runs.length}:${facts.dispatch.at}`).digest("hex") });
    if (!started.turn.id) throw new Error("Codex did not return a dispatched turn identity.");
    facts.turnId = started.turn.id; save();
    if (TERMINAL.has(started.turn.status)) { terminals.set(`${parentId}:${started.turn.id}`, started.turn); if (!terminalTimes.has(`${parentId}:${started.turn.id}`)) terminalTimes.set(`${parentId}:${started.turn.id}`, now()); }
    else if (!terminals.has(`${parentId}:${started.turn.id}`)) active.set(parentId, started.turn.id);
    if (stopping && active.has(parentId)) void rpc.call("turn/interrupt", { threadId: parentId, turnId: started.turn.id }).catch(error => rpc.fail(error as Error));
    const terminalKey = `${parentId}:${started.turn.id}`;
    while (!terminals.has(terminalKey)) {
      const before = revision;
      const notification = new Promise<void>(resolve => { changed = resolve; if (revision !== before) resolve(); });
      await Promise.race([notification, rpc.failed.then(error => { throw error; })]);
    }
    // A parent report is not proof that every child has stopped. Inventory saved descendants
    // as well as live references, and wait for their authoritative terminal turns.
    for (;;) {
      if (rpc.failure) throw rpc.failure;
      const discovered = new Set(record.conversation.knownThreadIds ?? []);
      for (const archived of [false, true]) {
        let cursor: string | null = null; const seen = new Set<string>();
        do {
          const page: { data: { id: string }[]; nextCursor: string | null } = await rpc.call("thread/list", { ancestorThreadId: parentId, archived, sourceKinds: ["subAgent", "subAgentThreadSpawn", "subAgentReview", "subAgentOther", "subAgentCompact"], cursor, limit: 100 });
          if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Incomplete Codex child discovery.");
          for (const child of page.data) { if (!child.id) throw new Error("Missing Codex child identity."); discovered.add(child.id); }
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw new Error("Repeated Codex child-discovery cursor.");
          if (cursor) seen.add(cursor);
          if (seen.size > 100_000 || discovered.size > 4096) throw new Error("Codex child discovery exceeded its bound.");
        } while (cursor !== null);
      }
      const pending: { threadId: string; turnId: string }[] = [];
      for (const id of discovered) {
        rememberChild(id);
        const childTurns = await turns(rpc, id);
        options.onHistory?.(id, childTurns);
        for (const turn of childTurns) {
          if (!TERMINAL.has(turn.status)) pending.push({ threadId: id, turnId: turn.id });
          for (const item of turn.items ?? []) {
            const child = item as { receiverThreadIds?: string[]; agentThreadId?: string };
            for (const reference of [...(child.receiverThreadIds ?? []), ...(child.agentThreadId ? [child.agentThreadId] : [])]) { discovered.add(reference); if (discovered.size > 4096) throw new Error("Codex child tree exceeded its bound."); }
          }
        }
      }
      if (!pending.length) break;
      if (stopping) for (const turn of pending) await rpc.call("turn/interrupt", turn);
      await Promise.race([new Promise(resolve => setTimeout(resolve, 250)), rpc.failed.then(error => { throw error; })]);
    }
    const terminal = terminals.get(terminalKey)!;
    facts.terminal = { status: terminal.status as "completed" | "failed" | "interrupted", ...(terminal.error !== undefined ? { error: terminal.error } : {}), ...(terminalTimes.get(terminalKey) ? { at: terminalTimes.get(terminalKey)! } : {}), ...(facts.terminal?.modelActivityCount === undefined ? {} : { modelActivityCount: facts.terminal.modelActivityCount }) }; save();
    const history = await rpc.call<{ thread: { path?: string | null } }>("thread/read", { threadId: parentId, includeTurns: false });
    if (!history.thread.path) throw new Error("Codex execution history is unavailable.");
    const provenance = await readCodexTurnExecutions({ path: history.thread.path, codexHome: home, threadId: parentId, signal: AbortSignal.timeout(30_000) });
    facts.observed = provenance; save();
    const current = provenance.find(context => context.turnId === facts.turnId);
    if (!current || current.model !== record.model || current.effort !== record.effort || current.cwd !== prepared.profile.cwd) {
      facts.verificationFailure = "Codex's observed turn model, effort or directory differs from the recorded request or is missing.";
      throw new Error(facts.verificationFailure);
    }
  } catch (error) {
    facts.failure = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(stopTimer); options.signal?.removeEventListener("abort", abort);
    await owned.close();
    let cleanupError: unknown = owned.failure ?? (initializedWork && parentId ? rpc.failure : undefined);
    if (initializedWork && parentId && !rpc.failure) {
      const cleanupController = new AbortController();
      const cleanupTimer = setTimeout(() => { const error = new Error("Codex background cleanup exceeded its deadline."); cleanupController.abort(error); rpc.fail(error); }, 10_000);
      try { await stopCodexBackgroundTerminals(rpc, [parentId, ...(record.conversation?.knownThreadIds ?? [])], run, save, cleanupController.signal); }
      catch (error) { cleanupError ??= error; }
      finally { clearTimeout(cleanupTimer); }
    }
    try { await rpc.close(() => stopCodexOwnedProcesses(run)); } catch (error) { cleanupError ??= error; }
    facts.cleanup = cleanupError ? "unknown" : "tracked_processes_stopped";
    if (cleanupError) { facts.cleanupFailure = (cleanupError as Error).message; facts.failure ??= facts.cleanupFailure; }
    clearTimeout(stopTimer);
    await options.beforeEnd?.();
    run.endedAt = now();
    recordCodexUsageProgress(record, run);
    const refusal = codexUsageRefusal(run, record.model);
    if (refusal) run.limitRefusal = refusal;
    if (rpc.child.exitCode !== null) run.exitCode = rpc.child.exitCode;
    if (rpc.child.signalCode !== null) run.signal = rpc.child.signalCode;
    save();
  }
  return run;
}

/** Read-only crash reconciliation. A possibly delivered prompt is never sent again here. */
export async function reconcileCodexAttempt(options: { executable: string; env: NodeJS.ProcessEnv; record: SessionRecord; stateDirectory: string }): Promise<"not_dispatched" | "settled" | "ambiguous"> {
  const { record } = options;
  const run = record.runs.at(-1);
  if (record.agentId !== "codex" || !run?.codex) throw new Error("No Codex attempt to reconcile.");
  const facts = run.codex;
  try { await stopCodexOwnedProcesses(run); }
  catch (error) { facts.cleanup = "unknown"; facts.cleanupFailure = `Codex cleanup could not be reconciled: ${(error as Error).message}`; facts.failure ??= facts.cleanupFailure; writeSessionRecord(options.stateDirectory, record); throw error; }
  let result: "not_dispatched" | "settled" | "ambiguous" = "not_dispatched";
  if (facts.dispatch) {
    result = "ambiguous";
    const threadId = record.conversation?.threadId;
    const home = record.conversation?.codexHome;
    if (threadId && home) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000);
      const rpc = new CodexHistoryRpc(options.executable, facts.profile.cwd, { ...options.env, CODEX_HOME: home }, controller.signal);
      try {
        await rpc.initialize();
        const history = await turns(rpc, threadId);
        const turn = history.find(turn => turn.id === facts.turnId);
        if (turn && TERMINAL.has(turn.status) && history.every(turn => TERMINAL.has(turn.status))) {
          facts.terminal = { status: turn.status as "completed" | "failed" | "interrupted", ...(turn.error !== undefined ? { error: turn.error } : {}), ...(facts.terminal?.at ? { at: facts.terminal.at } : {}), ...(facts.terminal?.modelActivityCount === undefined ? {} : { modelActivityCount: facts.terminal.modelActivityCount }) };
          result = "settled";
        }
      } catch (error) { facts.failure = `Codex dispatch could not be reconciled: ${(error as Error).message}`; }
      finally { clearTimeout(timer); await rpc.close(); }
    }
  }
  facts.reconciliation = result; facts.cleanup = "tracked_processes_stopped"; facts.cleanupWarning = CODEX_NATIVE_CLEANUP_WARNING; run.endedAt ??= new Date().toISOString();
  if (result === "settled") {
    recordCodexUsageProgress(record, run);
    const refusal = codexUsageRefusal(run, record.model);
    if (refusal) run.limitRefusal = refusal;
  }
  delete facts.cleanupFailure;
  writeSessionRecord(options.stateDirectory, record);
  return result;
}
