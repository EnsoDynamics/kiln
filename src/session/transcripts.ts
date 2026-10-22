// Claude Code's own record of a session, its transcript, as Stayed in the workspace reads it
// (multi-repo technical design, "Transcripts"; "Stayed in the workspace"): the main session's
// file and every subagent's, found by session ID, never by rebuilding Claude Code's folder name.

import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  name: string;
  input: Record<string, unknown>;
  /** The record's timestamp. */
  at: string;
  /** The record's working directory: the Bash shell's, as the call began. */
  cwd: string;
  /** Absent when the session was cut off mid-call. */
  result?: { isError: boolean; text: string };
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

/**
 * Reads a transcript file's tool calls in order, each matched with its result. A line cut off
 * by a killed process is skipped wherever it sits; any other line that isn't JSON makes the
 * file unreadable in part, and is named in `problem`.
 *
 *   readTranscript("/home/alex/.claude/projects/-home-alex-devel-acme/4d9a2c7e-….jsonl")
 *   // { calls: [{ name: "Edit", input: { file_path: "…" }, at: "2026-10-17T17:18:02.114Z", cwd: "…", result: { isError: false, text: "…" } }] }
 */
export function readTranscript(path: string): TranscriptRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { calls: [], problem: (error as Error).message };
  }
  const calls: TranscriptToolCall[] = [];
  const byId = new Map<string, TranscriptToolCall>();
  let problem: string | undefined;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch (error) {
      if (!isCutOff(line, error as Error)) problem ??= `line ${index + 1} isn't JSON`;
      return;
    }
    const content = record.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content as ContentBlock[]) {
      if (record.type === "assistant" && block.type === "tool_use" && typeof block.name === "string") {
        const call: TranscriptToolCall = { name: block.name, input: block.input ?? {}, at: record.timestamp ?? "", cwd: record.cwd ?? "" };
        calls.push(call);
        if (typeof block.id === "string") byId.set(block.id, call);
      } else if (record.type === "user" && block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) call.result = { isError: block.is_error === true, text: resultText(block.content) };
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
