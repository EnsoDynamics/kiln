// Starts one headless Claude Code session and supervises it: the launch flags, the prompt on
// stdin, every event saved as received, output lines and progress steps derived from them,
// and the run's end recorded (technical design, "Starting a phase's session", "Output and
// progress").

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnDetached } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { sessionDirectory, writeSessionRecord, PR_PHASE_KEY, type SessionRecord, type SessionRun } from "../state/records.js";
import { appendJsonLine, readJsonLines } from "../state/state-files.js";
import { isPartialDelta, SessionOutputReader, type OutputLine, type StreamEvent } from "./session-output.js";

/** The flags every session gets (technical design, "Starting a phase's session"). */
export function launchArguments(sessionId: string, model: string, effort: string | undefined): string[] {
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
  ];
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
  claude: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  cause: SessionRun["cause"];
  stateDirectory: string;
  /** The session's record, already written before spawning; this run is added to it. */
  record: SessionRecord;
  now?: () => Date;
  /** Called with each batch of new output lines, as they are saved. */
  onOutput?: (lines: OutputLine[]) => void;
  /** Called whenever the session record changes (a run added, steps, init, the end). */
  onRecordChange?: () => void;
  /** Given the run's output reader once, so a caller can ask whether the reviewer is working. */
  onReader?: (reader: SessionOutputReader) => void;
}

export interface SessionFiles {
  directory: string;
  events: string;
  output: string;
  stderr: string;
}

export function sessionFiles(stateDirectory: string, record: Pick<SessionRecord, "kind" | "phaseId" | "sessionId">): SessionFiles {
  const directory = sessionDirectory(stateDirectory, record.kind === "pull_request" ? PR_PHASE_KEY : record.phaseId, record.sessionId);
  return { directory, events: join(directory, "events.jsonl"), output: join(directory, "output.jsonl"), stderr: join(directory, "stderr.log") };
}

export function readOutputLines(stateDirectory: string, record: Pick<SessionRecord, "kind" | "phaseId" | "sessionId">): OutputLine[] {
  return readJsonLines<OutputLine>(sessionFiles(stateDirectory, record).output);
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
  const child = spawnDetached(options.claude, options.args, { cwd: options.cwd, env: options.env, stdin: "pipe" });

  if (child.pid === undefined) {
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => child.once("error", resolve));
    const run: SessionRun = {
      startedAt,
      endedAt: startedAt,
      cause: options.cause,
      spawnError: { code: error.code ?? "ERROR", message: error.message },
    };
    record.runs.push(run);
    saveRecord();
    saveLines([reader.kilnLine("stderr", `Couldn't start claude in ${options.cwd}: ${error.message}`, startedAt)]);
    return run;
  }

  const closed = new Promise<[number | null, NodeJS.Signals | null]>((resolve) => child.once("close", (exitCode, exitSignal) => resolve([exitCode, exitSignal])));
  const run: SessionRun = { pid: child.pid, startedAt, cause: options.cause };
  // The run is recorded at once, so a Kiln stopped from here on leaves it, never a session with no run.
  record.runs.push(run);
  saveRecord();
  // Output waits in the pipe until a listener reads it, so nothing is lost while this is read.
  const startTime = await processStartTime(child.pid);
  if (startTime !== undefined) {
    run.processStartTime = startTime;
    saveRecord();
  }

  child.stdin!.on("error", () => {
    // The process exited before reading its input; its exit is recorded below.
  });
  child.stdin!.write(`${JSON.stringify({ type: "user", message: { role: "user", content: options.prompt } })}\n`);

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
    if (isPartialDelta(event)) return;
    appendJsonLine(files.events, { at, event });

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
      run.result = { subtype: String(event.subtype ?? ""), isError: event.is_error === true };
      if (typeof event.result === "string") run.result.text = event.result;
      changed = true;
      // Closing stdin ends the session once its turn is over.
      child.stdin!.end();
    }
    if (changed) saveRecord();
  };
  // Decoded as a stream, so a character split between two reads isn't garbled.
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let newline;
    while ((newline = stdoutBuffer.indexOf("\n")) !== -1) {
      readStdoutLine(stdoutBuffer.slice(0, newline));
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
    }
  });
  child.stderr!.on("data", (text: string) => {
    appendFileSync(files.stderr, text, { mode: 0o600 });
    stderrBuffer += text;
    const lastNewline = stderrBuffer.lastIndexOf("\n");
    if (lastNewline === -1) return;
    saveLines(reader.stderrLines(stderrBuffer.slice(0, lastNewline), now().toISOString()));
    stderrBuffer = stderrBuffer.slice(lastNewline + 1);
  });

  const [code, signal] = await closed;
  readStdoutLine(stdoutBuffer);
  if (stderrBuffer.trim() !== "") saveLines(reader.stderrLines(stderrBuffer, now().toISOString()));

  const endedAt = now().toISOString();
  run.endedAt = endedAt;
  if (code !== null) run.exitCode = code;
  if (signal !== null) run.signal = signal;
  saveRecord();
  saveLines([reader.exitLine(code, signal, endedAt)]);
  return run;
}
