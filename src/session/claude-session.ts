import { consumedUuids } from "../live/target.js";
import { LiveOwnedProcesses } from "../live/owned-processes.js";
import { observeGate, withGate, unsettled } from "../live/gate.js";
import type { BillingSummary } from "../billing/inspection.js";
// Starts one headless Claude Code session and supervises it: the launch flags, the prompt on
// stdin, every event saved as received, output lines and progress steps derived from them,
// and the run's end recorded (technical design, "Starting a phase's session", "Output and
// progress").

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { endProcessTree, spawnDetached } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { sessionDirectory, sessionStorageKey, readSessionRecord, writeSessionRecord, type AccountIdentity, type SessionRecord, type SessionRun } from "../state/records.js";
import { appendJsonLine, readJsonLines } from "../state/state-files.js";
import { isPartialDelta, SessionOutputReader, type OutputLine, type PartialText, type StreamEvent } from "./session-output.js";
import { isModelResponse, sleepInterruption, type SavedEvent } from "./run-verdict.js";
import { usageLimitRefusal } from "./usage-limit.js";

/**
 * The flags every session gets (technical design, "Starting a phase's session"), plus an
 * `--add-dir` for each folder of the workspace outside the one it starts in (multi-repo
 * technical design, "Sessions"), so writes there are allowed by mode, and `--disallowedTools
 * PowerShell`, so that every shell command is a Bash call Stayed in the workspace reads.
 */
export function launchArguments(sessionId: string, model: string, effort: string | undefined, addDirs: string[] = []): string[] {
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--session-id",
    sessionId,
    "--model",
    model,
    ...(effort === undefined ? [] : ["--effort", effort]),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--forward-subagent-text",
    "--permission-mode",
    "auto",
    "--permission-prompts",
    "none",
    "--disallowedTools",
    "PowerShell",
    ...addDirs.flatMap((directory) => ["--add-dir", directory]),
  ];
}

/**
 * The flags that continue an interrupted session headlessly (technical design, "Resuming"):
 * the same output and permission flags, the session's own concrete model, and the effort it
 * recorded, left out when it recorded none.
 *
 *   resumeArguments("7c1e9f2a-…", "claude-opus-5-5", "high")
 *   // ["-p", "--input-format", "stream-json", "--resume", "7c1e9f2a-…", "--model", "claude-opus-5-5", "--effort", "high", "--output-format", …]
 */
export function resumeArguments(sessionId: string, model: string, effort: string | undefined, addDirs: string[] = []): string[] {
  const launch = launchArguments(sessionId, model, effort, addDirs);
  launch.splice(launch.indexOf("--session-id"), 1, "--resume");
  return launch;
}

/**
 * Kiln's name for a model, made from its ID: `claude-<family>-<major>[-<minor>]`, with any date
 * suffix dropped, is "<Family> <major>[.<minor>]"; anything else is shown as is.
 *
 *   modelNameFromId("claude-opus-5-5")             // "Opus 5.5"
 *   modelNameFromId("claude-haiku-4-5-20251001")   // "Haiku 4.5"
 *   modelNameFromId("opus")                        // "opus"
 */
export function modelNameFromId(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  if (!match) return id;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
  return match[3] === undefined ? `${family} ${match[2]}` : `${family} ${match[2]}.${match[3]}`;
}

export interface SessionProcessOptions {
  live?: SessionRun["live"];
  onLiveEvent?: (event: StreamEvent, at: string) => void;
  onLiveExit?: () => void;
  beforePrompt?: (identity: { pid: number; startTime: string }) => Promise<void>;
  control?: NonNullable<SessionRun["control"]>;
  billing?: BillingSummary;
  claude: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  cause: SessionRun["cause"];
  /** The person's note sent with Resume, recorded on the run (usage-limit recovery AC-RESUME-03). */
  note?: string;
  /** The account the reading just before a resume found signed in, recorded on the run (usage-limit recovery AC-AUTO-05). */
  account?: AccountIdentity;
  stateDirectory: string;
  /** The session's record, already written before spawning; this run is added to it. */
  record: SessionRecord;
  now?: () => Date;
  /** Called with each batch of new output lines, as they are saved. */
  onOutput?: (lines: OutputLine[]) => void;
  /** Live text from partial-message deltas, never saved (technical design, "Output and progress"). */
  onPartial?: (partial: PartialText) => void;
  /** Called whenever the session record changes (a run added, steps, init, the end). */
  onRecordChange?: () => void;
  /** Given the run's output reader once, so a caller can ask whether the reviewer is working. */
  onReader?: (reader: SessionOutputReader) => void;
  /** Given the live process's controls once it has started. */
  onSpawned?: (control: SessionControl) => void;
  /**
   * Run at the start of handling the process's end, before anything about the end is
   * written: the sleep reading, so a sleep is recorded before the exit it may have caused.
   */
  beforeEnd?: () => Promise<void>;
  /** True once a stop has begun: the run's end is then recorded and nothing about it judged. */
  stopping?: () => boolean;
  /**
   * How long to wait after the process closes before handling its end. On Windows a Ctrl+C
   * reaches the session as well as Kiln, and the session's exit can arrive first; the wait lets
   * Kiln's own signal handler mark the run interrupted before its end is recorded.
   */
  exitGraceMs?: number;
}

/** What Kiln can do to a session's live process (technical design, "Stopping a session"). */
export interface SessionControl {
  pid: number;
  sendMessage?: (text: string, uuid: string) => Promise<"written" | "uncertain">;
  inputOpen?: () => boolean;
  /**
   * Writes the interrupt control request to the session's stdin, the message the Agent SDK's
   * `interrupt()` sends, then closes stdin: Claude Code ends the turn, stops the tool it was
   * running and exits, leaving the session resumable.
   */
  interrupt(): void;
  /** Ends the process with its whole tree: a signal to its group, or taskkill on Windows. */
  endTree(signal: NodeJS.Signals): void;
  /** Resolves once the process has closed. */
  closed: Promise<void>;
}

export interface SessionFiles {
  directory: string;
  events: string;
  output: string;
  stderr: string;
}

export function sessionFiles(stateDirectory: string, record: Pick<SessionRecord, "kind" | "phaseId" | "sessionId" | "activityId">): SessionFiles {
  const directory = sessionDirectory(stateDirectory, sessionStorageKey(record), record.sessionId);
  return { directory, events: join(directory, "events.jsonl"), output: join(directory, "output.jsonl"), stderr: join(directory, "stderr.log") };
}

export function readOutputLines(stateDirectory: string, record: Pick<SessionRecord, "kind" | "phaseId" | "sessionId" | "activityId">): OutputLine[] {
  readSessionRecord(stateDirectory, sessionStorageKey(record), record.sessionId);
  return readJsonLines<OutputLine>(sessionFiles(stateDirectory, record).output);
}

/**
 * The saved events that arrived during one run: `events.jsonl` holds every run of the
 * session, so a run's events are those from its `startedAt` to the next run's.
 */
export function eventsOfRun(stateDirectory: string, record: SessionRecord, runIndex: number): SavedEvent[] {
  const run = record.runs[runIndex];
  if (!run) return [];
  const until = record.runs[runIndex + 1]?.startedAt;
  return readJsonLines<SavedEvent>(sessionFiles(stateDirectory, record).events).filter((saved) => saved.at >= run.startedAt && (until === undefined || saved.at < until));
}

/** A run's last output time: the arrival of its last saved event, or its start when it saved none. */
export function runLastOutputAt(stateDirectory: string, record: SessionRecord, runIndex: number): string | undefined {
  return eventsOfRun(stateDirectory, record, runIndex).at(-1)?.at ?? record.runs[runIndex]?.startedAt;
}

/** Whether the run's stream reported the session's `init` event. */
export function runReportedInit(stateDirectory: string, record: SessionRecord, runIndex: number): boolean {
  return eventsOfRun(stateDirectory, record, runIndex).some((saved) => saved.event.type === "system" && saved.event.subtype === "init");
}

/**
 * Spawns `claude`, sends the prompt as the first user message, and resolves with the run once
 * the process has closed and its end is recorded. When `claude` can't be started, the run is
 * recorded with `spawnError` and an end equal to its start, and no exit line follows.
 */
export async function runSessionProcess(options: SessionProcessOptions): Promise<SessionRun> {
  const now = options.now ?? (() => new Date());
  const { record } = options;
  const files = sessionFiles(options.stateDirectory, record);
  mkdirSync(files.directory, { recursive: true, mode: 0o700 });

  const reader = new SessionOutputReader(readJsonLines<OutputLine>(files.output).length);
  reader.steps = [...record.steps];
  reader.lastSkill = record.lastSkill;
  options.onReader?.(reader);
  const saveLines = (lines: OutputLine[]) => {
    if (lines.length === 0) return;
    for (const line of lines) appendJsonLine(files.output, line);
    options.onOutput?.(lines);
  };
  const saveRecord = () => {
    writeSessionRecord(options.stateDirectory, record);
    options.onRecordChange?.();
  };

  const startedAt = now().toISOString();
  const run: SessionRun = { ...(options.live ? { live: options.live } : {}), startedAt, cause: options.cause, ...(options.control ? { control: { ...options.control } } : {}),
    ...(options.billing ? { billing: options.billing } : {}), ...(options.note === undefined ? {} : { note: options.note }), ...(options.account === undefined ? {} : { account: options.account }) };
  // Persist the correlated attempt before spawn or stdin can have an effect.
  record.runs.push(run); saveRecord();
  const child = spawnDetached(options.claude, options.args, { cwd: options.cwd, env: options.env, stdin: "pipe" });
  if (child.pid === undefined) {
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => child.once("error", resolve));
    run.endedAt = startedAt; run.spawnError = { code: error.code ?? "ERROR", message: error.message }; saveRecord();
    saveLines([reader.kilnLine("stderr", `Couldn't start claude in ${options.cwd}: ${error.message}`, startedAt)]);
    return run;
  }
  const closed = new Promise<[number | null, NodeJS.Signals | null]>((resolve) => child.once("close", (exitCode, exitSignal) => resolve([exitCode, exitSignal])));
  const pid = child.pid; run.pid = pid;
  try { saveRecord(); } catch (error) { endProcessTree(pid, "SIGKILL"); await closed; throw error; }

  child.stdin!.on("error", () => {
    // The process exited before reading its input; its exit is recorded below.
  });
  let openingSubmitted = false;
  let writing = false;
  // The controls are handed over at once, so a stop from here on can always reach the process.
  options.onSpawned?.({
    pid,
    ...(options.live?.literalInput ? {
      inputOpen: () => openingSubmitted && !child.stdin!.writableEnded && !child.stdin!.destroyed && !writing,
      sendMessage: (text: string, uuid: string) => new Promise<"written" | "uncertain">(resolve => {
        writing = true;
        const timer = setTimeout(() => { resolve("uncertain"); }, 5000);
        const settle = (error?: Error | null) => { clearTimeout(timer); writing = false; resolve(error ? "uncertain" : "written"); };
        try { child.stdin!.write(`${JSON.stringify({ type: "user", uuid, session_id: record.sessionId, text_not_typed: true, message: { role: "user", content: text } })}\n`, settle); }
        catch { settle(new Error("Input pipe failed.")); }
      }),
    } : {}),
    interrupt: () => {
      if (child.stdin!.writableEnded || child.stdin!.destroyed) return;
      child.stdin!.write(`${JSON.stringify({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } })}\n`);
      child.stdin!.end();
    },
    endTree: (signal) => endProcessTree(pid, signal),
    closed: closed.then(() => undefined),
  });

  /** When each model response of this run arrived, for the sleep verdict. */
  const modelResponses: string[] = [];
  /** This run's usage-limit reports and model responses, in order, for the refusal verdict. */
  const limitEvents: SavedEvent[] = [];

  let observations = Promise.resolve();
  let observationFailure: unknown;
  const retainObservationFailure = (error: unknown) => { observationFailure ??= error; };
  let resultSeen = false;
  const maybeDrain = async () => {
    if (!options.live || !resultSeen || child.stdin!.writableEnded) return;
    await withGate(options.live.gateDirectory, gate => {
      const accounted = Object.values(gate.inputs ?? {}).every(input => input.terminal);
      if ((gate.held || accounted) && unsettled(gate).length === 0 && !writing) {
        gate.sealed = true;
        child.stdin!.end();
      }
    });
  };
  const drainTimer = options.live ? setInterval(() => { observations = observations.then(maybeDrain).catch(retainObservationFailure); }, 250) : undefined;
  drainTimer?.unref();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const readStdoutLine = (text: string) => {
    if (text.trim() === "") return;
    const at = now().toISOString();
    let event: StreamEvent;
    try {
      event = JSON.parse(text) as StreamEvent;
    } catch {
      appendJsonLine(files.events, { at, event: { unparsed: text } });
      return;
    }
    if (isPartialDelta(event)) {
      const partial = reader.partialText(event);
      if (partial) options.onPartial?.(partial);
      return;
    }
    let resultAccounting: { index: number; inputUuids: string[]; cumulativeCostUsd?: number; costDeltaUsd?: number } | undefined;
    if (event.type === "result" && options.live) {
      const previous = run.claudeResults;
      const cumulative = typeof event.total_cost_usd === "number" && Number.isFinite(event.total_cost_usd) ? event.total_cost_usd : undefined;
      resultAccounting = { index: (previous?.count ?? 0) + 1, inputUuids: consumedUuids(event), ...(cumulative === undefined ? {} : { cumulativeCostUsd: cumulative, costDeltaUsd: cumulative - (previous?.cumulativeCostUsd ?? 0) }) };
      run.claudeResults = { count: resultAccounting.index, ...(cumulative === undefined ? previous?.cumulativeCostUsd === undefined ? {} : { cumulativeCostUsd: previous.cumulativeCostUsd } : { cumulativeCostUsd: cumulative }) };
    }
    appendJsonLine(files.events, { at, event, ...(resultAccounting ? { resultAccounting } : {}) });
    if (options.live) observations = observations.then(async () => { options.onLiveEvent?.(event, at); await observeGate(options.live!.gateDirectory, event, at); if (event.type === "result") resultSeen = true; }).then(maybeDrain).catch(retainObservationFailure);
    if (isModelResponse(event)) modelResponses.push(at);
    if (event.type === "rate_limit_event" || event.type === "assistant") limitEvents.push({ at, event });

    const stepsBefore = reader.steps.length;
    const skillBefore = reader.lastSkill;
    saveLines(reader.readEvent(event, at));
    let changed = reader.steps.length !== stepsBefore || reader.lastSkill !== skillBefore;
    if (changed) {
      record.steps = [...reader.steps];
      if (reader.lastSkill) record.lastSkill = reader.lastSkill;
    }
    if (event.type === "system" && event.subtype === "init") {
      if (typeof event.model === "string") {
        record.initModel = event.model;
        record.modelDisplayName = modelNameFromId(event.model);
      }
      if (typeof event.permissionMode === "string") record.permissionMode = event.permissionMode;
      if (typeof event.claude_code_version === "string") record.claudeVersion = event.claude_code_version;
      changed = true;
    }
    if (event.type === "result") {
      run.result = { subtype: String(event.subtype ?? ""), isError: run.result?.isError === true || event.is_error === true };
      if (typeof event.result === "string") run.result.text = event.result;
      changed = true;
      // Closing stdin ends the session once its turn is over.
      if (!options.live) child.stdin!.end();
    }
    if (changed) saveRecord();
  };
  // Decoded as a stream, so a character split between two reads isn't garbled.
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  let outputFailure: unknown;
  const guardOutput = (read: () => void) => {
    if (outputFailure) return;
    try { read(); } catch (error) { outputFailure = error; if (options.live) child.stdin!.end(); else endProcessTree(pid, "SIGKILL"); }
  };
  child.stdout!.on("data", (chunk: string) => guardOutput(() => {
    stdoutBuffer += chunk;
    let newline;
    while ((newline = stdoutBuffer.indexOf("\n")) !== -1) {
      readStdoutLine(stdoutBuffer.slice(0, newline));
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
    }
  }));
  child.stderr!.on("data", (text: string) => guardOutput(() => {
    appendFileSync(files.stderr, text, { mode: 0o600 });
    stderrBuffer += text;
    const lastNewline = stderrBuffer.lastIndexOf("\n");
    if (lastNewline === -1) return;
    saveLines(reader.stderrLines(stderrBuffer.slice(0, lastNewline), now().toISOString()));
    stderrBuffer = stderrBuffer.slice(lastNewline + 1);
  }));

  // Read only once the output is being read: on Windows it is a PowerShell call taking a second
  // or more, and a session that exits meanwhile (an early stop, a resume with no transcript)
  // must still have every line it wrote saved before its end is handled.
  let startTime: string | undefined;
  try { startTime = await processStartTime(pid, options.live || options.beforePrompt ? { timeoutMs: 5000 } : {}); }
  catch (error) { child.stdin!.end(); await closed; clearInterval(drainTimer); throw error; }
  if (startTime !== undefined) {
    run.processStartTime = startTime;
    guardOutput(saveRecord);
  }

  const owned = options.live && startTime ? new LiveOwnedProcesses(options.live.gateDirectory, pid, startTime) : undefined;
  owned?.start();
  try {
    if (options.beforePrompt) {
      if (!startTime) throw new Error("New dispatch PID/start identity cannot be established.");
      await options.beforePrompt({ pid, startTime });
    }
  child.stdin!.write(`${JSON.stringify({ type: "user", message: { role: "user", content: options.prompt } })}\n`);
  openingSubmitted = true;
  if (run.control) {
    run.control.submitted = true;
    try { saveRecord(); } catch (error) { if (options.live) child.stdin!.end(); else endProcessTree(pid, "SIGKILL"); await closed; throw error; }
  }
  } catch (error) {
    // No prompt/effect was supplied to this new process; drain its empty input.
    child.stdin!.end(); const [code] = await closed; await owned?.close(); clearInterval(drainTimer);
    run.endedAt = now().toISOString(); if (code !== null) run.exitCode = code; saveRecord(); throw error;
  }
  const [code, signal] = await closed;
  clearInterval(drainTimer);
  try {
    await owned?.close();
    await observations;
    if (outputFailure) throw outputFailure;
    if (observationFailure) throw observationFailure;
    readStdoutLine(stdoutBuffer);
    await observations;
    if (observationFailure) throw observationFailure;
  } finally {
    // Every exited live attempt accounts for accepted input, even when its final
    // saved-event/gate observation fails (including a last line without LF).
    options.onLiveExit?.();
  }
  if (stderrBuffer.trim() !== "") saveLines(reader.stderrLines(stderrBuffer, now().toISOString()));

  if (options.exitGraceMs) await new Promise((resolve) => setTimeout(resolve, options.exitGraceMs));
  await options.beforeEnd?.();
  // The end, its sleep reading, any sleep verdict and any usage-limit refusal are one write, so a
  // record never holds a run's end without the verdict that was due. A stop's own interruptedBy
  // stands, and a run cut off by an interruption is never a usage limit.
  const runIndex = record.runs.indexOf(run);
  if (run.interruptedBy === undefined && !options.stopping?.()) {
    const interruption = sleepInterruption(record.sleeps, runIndex, modelResponses);
    if (interruption) {
      run.interruptedBy = "sleep";
      run.interruptedAt = interruption.at;
    }
  }
  if (run.interruptedBy === undefined && !options.stopping?.()) {
    const refusal = usageLimitRefusal(limitEvents);
    if (refusal) run.limitRefusal = refusal;
  }
  const endedAt = now().toISOString();
  run.endedAt = endedAt;
  if (code !== null) run.exitCode = code;
  if (signal !== null) run.signal = signal;
  saveRecord();
  saveLines([reader.exitLine(code, signal, endedAt)]);
  return run;
}
