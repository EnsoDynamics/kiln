// Turns a session's stream-json events into Kiln's output lines and progress steps
// (technical design, "Output and progress"). Everything here is derived from the saved events,
// so it can be rebuilt from `events.jsonl`; nothing is interpreted beyond what the table gives.

import { STEP_NAMES, type StepName, type StepStart } from "../state/records.js";
import { runsGitCommit, runsGitPush } from "./bash-command.js";

export type OutputSource = "claude" | "codex" | "tool" | "out" | "skill" | "reviewer" | "subagent" | "stderr" | "exit";

export interface OutputLine {
  line: number;
  at: string;
  source: OutputSource;
  text: string;
  agentId?: "claude_code" | "codex";
  threadId?: string;
  turnId?: string;
  itemId?: string;
  parentThreadId?: string;
  role?: string;
  timestampSource?: "arrival" | "turn" | "recovery";
}

/** A piece of text a session is writing, before its finished line arrives. */
export interface PartialText {
  source: "claude" | "codex" | "reviewer" | "subagent";
  text: string;
  threadId?: string;
  itemId?: string;
}

/** A stream-json event as Claude Code writes it; only the fields Kiln reads are typed. */
export interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  model?: string;
  permissionMode?: string;
  claude_code_version?: string;
  message?: { model?: string; content?: unknown };
  result?: string;
  is_error?: boolean;
  tool_name?: string;
  [key: string]: unknown;
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

const STEP_SKILLS: Record<string, StepName> = {
  "implement-from-requirements": "Build",
  "deliverable-review": "Deliverable review",
  "test-hardening": "Test hardening",
  "refactor-pass": "Refactor pass",
};

/** A Skill name matches on the part after its last colon: `enso-method:refactor-pass` is `refactor-pass`. */
export function bareSkillName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

/** The current step: the highest started step in plan order. */
export function currentStep(steps: StepStart[]): StepName | undefined {
  let current: StepName | undefined;
  for (const name of STEP_NAMES) if (steps.some((step) => step.name === name)) current = name;
  return current;
}

/** Every step with its state, in order: started steps below the current one are finished. */
export function stepStates(steps: StepStart[], agentId?: string): { name: StepName; state: "finished" | "current" | "unreached" | "observed" | "unobserved"; startedAt?: string }[] {
  const current = currentStep(steps);
  const currentIndex = current === undefined ? -1 : STEP_NAMES.indexOf(current);
  return STEP_NAMES.map((name, index) => {
    const start = steps.find((step) => step.name === name);
    if (agentId === "codex") return { name, state: start ? "observed" as const : "unobserved" as const, ...(start ? { startedAt: start.startedAt } : {}) };
    if (!start) return { name, state: "unreached" as const };
    return { name, state: index === currentIndex ? ("current" as const) : ("finished" as const), startedAt: start.startedAt };
  });
}

/**
 * Reads one session's events in arrival order. Feed it every saved event of the session, all
 * runs together, and it gives each event's output lines, numbered per session.
 *
 *   const reader = new SessionOutputReader();
 *   const lines = reader.readEvent(event, at);
 *   reader.steps  // the progress steps seen so far
 */
export class SessionOutputReader {
  steps: StepStart[] = [];
  lastSkill: { name: string; at: string } | undefined;
  lineCount = 0;
  /** Top-level Agent calls made during Deliverable review, so their subagent's lines are the reviewer's. */
  private readonly reviewerCalls = new Set<string>();
  /** Reviewer calls with no tool_result yet. */
  private readonly openReviewerCalls = new Set<string>();
  private readonly skillCalls = new Set<string>();

  constructor(startLine = 0) {
    this.lineCount = startLine;
  }

  /** True while Deliverable review is the current step and a reviewer it started hasn't finished. */
  get reviewerWorking(): boolean {
    return currentStep(this.steps) === "Deliverable review" && this.openReviewerCalls.size > 0;
  }

  readEvent(event: StreamEvent, at: string): OutputLine[] {
    const lines: OutputLine[] = [];
    const add = (source: OutputSource, text: string) => lines.push({ line: ++this.lineCount, at, source, text });
    const parent = event.parent_tool_use_id ?? undefined;

    if (event.type === "permission_denied" || (event.type === "system" && event.subtype === "permission_denied")) {
      add("tool", `denied ${String(event.tool_name ?? event.tool ?? "")}`.trim());
      return lines;
    }
    if (event.type === "assistant") {
      for (const block of contentBlocks(event)) {
        if (parent !== undefined) {
          const source = this.reviewerCalls.has(parent) ? "reviewer" : "subagent";
          if (block.type === "text" && block.text) add(source, block.text);
          else if (block.type === "tool_use" && block.name === "SubagentHandback") add(source, String(block.input?.message ?? ""));
          else if (block.type === "tool_use") add(source, toolLineText(block));
          continue;
        }
        if (block.type === "text" && block.text) add("claude", block.text);
        else if (block.type === "tool_use") this.readTopLevelToolCall(block, at, add);
      }
      return lines;
    }
    if (event.type === "user" && parent === undefined) {
      for (const block of contentBlocks(event)) {
        if (block.type !== "tool_result") continue;
        if (block.tool_use_id !== undefined) {
          this.openReviewerCalls.delete(block.tool_use_id);
          if (this.skillCalls.has(block.tool_use_id)) continue;
        }
        add(block.is_error ? "stderr" : "out", lastResultLine(block.content));
      }
    }
    return lines;
  }

  /**
   * The text a partial-message delta adds, labeled as its finished line will be: a text delta
   * only; tool input, thinking and every other delta give none.
   */
  partialText(event: StreamEvent): PartialText | undefined {
    const inner = event.event as { type?: string; delta?: { type?: string; text?: unknown } } | undefined;
    if (inner?.type !== "content_block_delta" || inner.delta?.type !== "text_delta" || typeof inner.delta.text !== "string" || inner.delta.text === "") return undefined;
    const parent = event.parent_tool_use_id ?? undefined;
    const source = parent === undefined ? "claude" : this.reviewerCalls.has(parent) ? "reviewer" : "subagent";
    return { source, text: inner.delta.text };
  }

  stderrLines(text: string, at: string): OutputLine[] {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => ({ line: ++this.lineCount, at, source: "stderr" as const, text: line }));
  }

  /** A line Kiln writes itself, such as `Couldn't start claude in …`. */
  kilnLine(source: OutputSource, text: string, at: string): OutputLine {
    return { line: ++this.lineCount, at, source, text };
  }

  exitLine(exitCode: number | null, signal: string | null, at: string): OutputLine {
    const text = exitCode !== null ? `Process exited with code ${exitCode}` : `Process ended by ${signal ?? "an unknown signal"}`;
    return { line: ++this.lineCount, at, source: "exit", text };
  }

  private readTopLevelToolCall(block: ContentBlock, at: string, add: (source: OutputSource, text: string) => void): void {
    const name = block.name ?? "";
    if (name === "Skill") {
      const skill = String(block.input?.skill ?? "");
      if (block.id) this.skillCalls.add(block.id);
      add("skill", `Skill ${skill}`);
      this.lastSkill = { name: bareSkillName(skill), at };
      const step = STEP_SKILLS[bareSkillName(skill)];
      if (step) this.startStep(step, at);
      return;
    }
    if (name === "Agent" || name === "Task") {
      if (block.id && currentStep(this.steps) === "Deliverable review") {
        this.reviewerCalls.add(block.id);
        this.openReviewerCalls.add(block.id);
      }
    }
    if (name === "Bash") {
      const command = String(block.input?.command ?? "");
      if (runsGitCommit(command)) this.startStep("Commit", at);
      if (runsGitPush(command) && this.steps.some((step) => step.name === "Commit")) this.startStep("Push", at);
    }
    add("tool", toolLineText(block));
  }

  private startStep(name: StepName, at: string): void {
    if (!this.steps.some((step) => step.name === name)) this.steps.push({ name, startedAt: at });
  }
}

function contentBlocks(event: StreamEvent): ContentBlock[] {
  const content = event.message?.content;
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

const MAIN_INPUT_KEYS = ["command", "file_path", "notebook_path", "description", "pattern", "url", "query", "path", "skill"];

/** A tool call's line: the tool name and its main input, `Bash git status`, `Read src/returns/models.py`. */
export function toolLineText(block: { name?: string; input?: Record<string, unknown> }): string {
  const input = block.input ?? {};
  const key = MAIN_INPUT_KEYS.find((candidate) => typeof input[candidate] === "string");
  const main = key ? (input[key] as string) : Object.values(input).find((value) => typeof value === "string");
  return main ? `${block.name ?? "tool"} ${main}` : (block.name ?? "tool");
}

/** A tool result's last non-empty line, after dropping Claude Code's leading `Exit code <n>` line. */
export function lastResultLine(content: unknown): string {
  let text: string;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content
      .map((part: { type?: string; text?: string }) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .join("\n");
  } else text = "";
  const lines = text.split(/\r?\n/);
  if (/^Exit code -?\d+\s*$/.test(lines[0] ?? "")) lines.shift();
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  return nonEmpty[nonEmpty.length - 1] ?? "";
}

/** True for an event that only feeds the live view and isn't saved: a partial-message delta. */
export function isPartialDelta(event: StreamEvent): boolean {
  return event.type === "stream_event";
}
