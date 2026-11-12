// Claude Code's own record of a session, its transcript, as Stayed in the workspace reads it
// (multi-repo technical design, "Transcripts"; "Stayed in the workspace"): the main session's
// file and every subagent's, found by session ID, never by rebuilding Claude Code's folder name.

import { constants, existsSync, readdirSync, readFileSync, opendirSync, openSync, closeSync, readSync, fstatSync, lstatSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** `CLAUDE_CONFIG_DIR` when it is set, else `~/.claude`. */
export function claudeConfigFolder(env: NodeJS.ProcessEnv): string {
  const configured = env.CLAUDE_CONFIG_DIR;
  return configured !== undefined && configured !== "" ? configured : join(homedir(), ".claude");
}

export interface TranscriptFiles {
  /** `projects/*\/<session ID>.jsonl`, when there is one. */
  main: string | undefined;
  /** `projects/*\/<session ID>/subagents/*.jsonl`. */
  subagents: string[];
}

/**
 * Finds a session's transcript files under the Claude config folder's `projects` folder.
 *
 *   findTranscripts("/home/alex/.claude", "4d9a2c7e-…")
 *   // { main: "/home/alex/.claude/projects/-home-alex-devel-acme/4d9a2c7e-….jsonl", subagents: [".../4d9a2c7e-…/subagents/agent-a1.jsonl"] }
 */
export function findTranscripts(configFolder: string, sessionId: string): TranscriptFiles {
  const projects = join(configFolder, "projects");
  let main: string | undefined;
  const subagents: string[] = [];
  for (const project of listFolder(projects)) {
    const file = join(projects, project, `${sessionId}.jsonl`);
    if (main === undefined && existsSync(file)) main = file;
    const subagentFolder = join(projects, project, sessionId, "subagents");
    for (const name of listFolder(subagentFolder)) {
      if (name.endsWith(".jsonl")) subagents.push(join(subagentFolder, name));
    }
  }
  return { main, subagents: subagents.sort() };
}

function listFolder(folder: string): string[] {
  try {
    return readdirSync(folder).sort();
  } catch {
    return [];
  }
}

/** One tool call a transcript records, with its outcome when the transcript has one. */
export interface TranscriptToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  /** The record's timestamp. */
  at: string;
  /** The record's working directory: the Bash shell's, as the call began. */
  cwd: string;
  /** Absent when the session was cut off mid-call. */
  result?: { isError: boolean; text: string; at?: string };
}

export interface TranscriptRead {
  calls: TranscriptToolCall[];
  /** Why part or all of the file couldn't be read; its other lines are read as usual. */
  problem?: string;
}

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

interface TranscriptRecord {
  type?: string;
  timestamp?: string;
  cwd?: string;
  message?: { content?: unknown };
}

/** Read provider rows with the same partial-record and corruption rules as tool history. */
export function readTranscriptRecords<T = TranscriptRecord>(path: string): { records: T[]; problem?: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { records: [], problem: (error as Error).message };
  }
  const records: T[] = [];
  let problem: string | undefined;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      if (!isCutOff(line, error as Error)) problem ??= `line ${index + 1} isn't JSON`;
      return;
    }
  });
  return problem === undefined ? { records } : { records, problem };
}

/**
 * Reads a transcript file's tool calls in order, each matched with its result. A line cut off
 * by a killed process is skipped wherever it sits; any other line that isn't JSON makes the
 * file unreadable in part, and is named in `problem`.
 *
 *   readTranscript("/home/alex/.claude/projects/-home-alex-devel-acme/4d9a2c7e-….jsonl")
 *   // { calls: [{ name: "Edit", input: { file_path: "…" }, at: "2026-10-17T17:18:02.114Z", cwd: "…", result: { isError: false, text: "…" } }] }
 */
export function readTranscript(path: string): TranscriptRead {
  const { records, problem } = readTranscriptRecords(path);
  const calls: TranscriptToolCall[] = [];
  const byId = new Map<string, TranscriptToolCall>();
  records.forEach(record => {
    const content = record.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content as ContentBlock[]) {
      if (record.type === "assistant" && block.type === "tool_use" && typeof block.name === "string") {
        const call: TranscriptToolCall = { ...(block.id ? { id: block.id } : {}), name: block.name, input: block.input ?? {}, at: record.timestamp ?? "", cwd: record.cwd ?? "" };
        calls.push(call);
        if (typeof block.id === "string") byId.set(block.id, call);
      } else if (record.type === "user" && block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) call.result = { isError: block.is_error === true, text: resultText(block.content), ...(record.timestamp ? { at: record.timestamp } : {}) };
      }
    }
  });
  return problem === undefined ? { calls } : { calls, problem };
}

/**
 * A line a killed process cut off fails to parse only at its end: "Unexpected end of JSON
 * input", or an error positioned at the line's length (technical design, tried on 2.1.307).
 */
function isCutOff(line: string, error: Error): boolean {
  if (/Unexpected end of JSON input/.test(error.message)) return true;
  const position = /at position (\d+)/.exec(error.message);
  return position !== null && Number(position[1]) >= line.length;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: { type?: string; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? part.text : "")).join("\n");
}

/** Establish usable conversation contents without loading a transcript or starting a turn.
 * Partial trailing/legacy records are supported; only a readable user/assistant message
 * for this conversation establishes availability. Each record and the total scan are bounded.
 *
 * Only the projects root, the one folder holding this conversation and its file must be owner
 * controlled: owned by this user and not a symbolic link, with the file writable by its owner
 * alone and the folders by no one outside the owner's group. Claude Code writes transcripts 0600
 * but, under a umask of 0002, leaves project folders group-writable, so a folder's group write
 * passes. Other project folders are skipped, never judged, so one folder elsewhere can't make
 * every conversation unresumable.
 */
export type HistoryDefect = "writable_by_others" | "link" | "other_owner";
/** Why a saved Claude conversation can't be reopened (run restart "Whether the conversation can be reopened"). */
export type HistoryProblem = "missing" | "unsafe" | "not_a_file" | "no_messages" | "unreadable";
export interface HistoryAvailability {
  available: boolean;
  /** A sentence for logs and older readers; the page words `code` itself. */
  reason: string;
  code?: HistoryProblem;
  /** `unsafe` and `not_a_file`: the path that failed. */
  path?: string;
  /** `unsafe`: what is wrong with `path`. */
  defects?: HistoryDefect[];
  /** `unsafe` with only `writable_by_others`: the folder (true) or the file (false). */
  folder?: boolean;
}

export function claudeHistoryAvailability(env: NodeJS.ProcessEnv, sessionId: string, deadline = Date.now() + 5000): HistoryAvailability {
  const unavailable = (code: HistoryProblem, reason: string, extra: Partial<HistoryAvailability> = {}): HistoryAvailability => ({ available: false, reason, code, ...extra });
  if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(sessionId) || sessionId === "." || sessionId === "..") return unavailable("missing", "Provider conversation identity is invalid.");
  const check = () => { if (Date.now() > deadline) throw new HistoryUnreadable("Provider history read deadline expired."); };
  const defectsOf = (stat: Stats, writers: number): HistoryDefect[] => [
    ...(stat.isSymbolicLink() ? ["link" as const] : []),
    ...(process.getuid && stat.uid !== process.getuid() ? ["other_owner" as const] : []),
    ...(process.platform !== "win32" && !stat.isSymbolicLink() && (stat.mode & writers) !== 0 ? ["writable_by_others" as const] : []),
  ];
  const owned = (path: string, writers: number, folder: boolean) => { const stat = lstatSync(path); const defects = defectsOf(stat, writers); if (defects.length) throw new HistoryUnsafe(path, defects, folder); return stat; };
  try {
    check();
    const projects = join(claudeConfigFolder(env), "projects");
    try { lstatSync(projects); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return unavailable("missing", "Provider history is missing."); throw error; }
    owned(projects, 0o002, true);
    const directory = opendirSync(projects);
    try {
      for (;;) {
        check(); const project = directory.readSync(); if (!project) break;
        if (!project.isDirectory() && !project.isSymbolicLink()) continue;
        const folder = join(projects, project.name); const file = join(folder, `${sessionId}.jsonl`);
        // A folder this user can't search can't hold this user's conversation; skip it.
        try { lstatSync(file); } catch (error) { if (["ENOENT", "EACCES", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue; throw error; }
        owned(folder, 0o002, true);
        const stat = owned(file, 0o022, false);
        if (!stat.isFile()) return unavailable("not_a_file", "Provider history is not a regular file.", { path: file });
        // The folder may be group-writable, so the file is opened without following a link and judged again as opened.
        const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          const opened = fstatSync(fd);
          if (!opened.isFile()) return unavailable("not_a_file", "Provider history is not a regular file.", { path: file });
          const openedDefects = defectsOf(opened, 0o022); if (openedDefects.length) throw new HistoryUnsafe(file, openedDefects, false);
          return readHistoryFile(fd, opened.size, sessionId, check);
        } finally { closeSync(fd); }
      }
    } finally { directory.closeSync(); }
    return unavailable("missing", "Provider history is missing.");
  } catch (error) {
    if (error instanceof HistoryUnsafe) return unavailable("unsafe", `Provider history can be changed by other users: ${error.path}.`, { path: error.path, defects: error.defects, folder: error.folder });
    if (error instanceof HistoryUnreadable) return unavailable("unreadable", error.message);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return unavailable("missing", "Provider history is missing.");
    return unavailable("unreadable", "Provider history is unreadable or its read deadline expired.");
  }
}

/**
 * Reads an opened transcript to its end: available when a usable user or assistant message for
 * this conversation is found and every line is JSON or cut off; a record over 16 MiB, a line that
 * isn't JSON and wasn't cut off, or a file that changed during the read is unreadable.
 */
function readHistoryFile(fd: number, size: number, sessionId: string, check: () => void): HistoryAvailability {
  const chunk = Buffer.allocUnsafe(65536); const parts: Buffer[] = []; let lineSize = 0; let found = false;
  // A line a killed process cut off is skipped wherever it sits, as `readTranscriptRecords` skips it: a resumed conversation appends after it.
  const line = () => {
    if (!lineSize) return;
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, lineSize)); } catch { throw new HistoryUnreadable("Provider history holds a line that isn't text."); }
    if (text.trim() === "") return;
    let record: TranscriptRecord & { sessionId?: unknown };
    try { record = JSON.parse(text) as typeof record; } catch (error) {
      if (isCutOff(text, error as Error)) return;
      throw new HistoryUnreadable("Provider history holds a line that isn't JSON.");
    }
    check();
    if (found || !record || (record.sessionId != null && record.sessionId !== sessionId) || !["user", "assistant"].includes(record.type ?? "")) return;
    const content = record.message?.content;
    found = typeof content === "string" && content.length > 0 || Array.isArray(content) && content.some(block => block && typeof block === "object" && ["text", "tool_use", "tool_result", "thinking", "image"].includes(block.type));
  };
  for (let at = 0; at < size;) {
    check(); const count = readSync(fd, chunk, 0, Math.min(chunk.length, size - at), at); if (!count) throw new HistoryUnreadable("Provider history changed during the read."); at += count;
    let from = 0;
    while (from < count) {
      const newline = chunk.indexOf(10, from); const end = newline >= 0 && newline < count ? newline : count;
      lineSize += end - from;
      if (lineSize > 16 * 1024 * 1024) throw new HistoryUnreadable("Provider history record exceeds the 16 MiB read budget.");
      parts.push(Buffer.from(chunk.subarray(from, end)));
      if (end < count) { line(); parts.length = 0; lineSize = 0; }
      from = end + 1;
    }
  }
  line();
  check();
  return found ? { available: true, reason: "Saved provider conversation contains usable history." } : { available: false, code: "no_messages", reason: "Provider history has no usable conversation messages." };
}

class HistoryUnreadable extends Error {}
class HistoryUnsafe extends Error {
  constructor(readonly path: string, readonly defects: HistoryDefect[], readonly folder: boolean) { super(`Provider history can be changed by other users: ${path}.`); }
}
