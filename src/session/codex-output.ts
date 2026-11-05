// Codex-native presentation only. Provider history, never these lines, decides workspace checks.
import { basename, resolve } from "node:path";
import { simpleCommands, runsGitCommit, runsGitPush } from "./bash-command.js";
import type { CodexMessage } from "./codex-work-rpc.js";
import type { OutputLine, OutputSource, PartialText } from "./session-output.js";
import type { SessionRecord, StepName } from "../state/records.js";

const SKILLS: Record<string, StepName> = { "implement-from-requirements": "Build", "deliverable-review": "Deliverable review", "test-hardening": "Test hardening", "refactor-pass": "Refactor pass" };
export const CODEX_CHILD_OUTPUT_NOTICE = "Subagent live output may be unavailable. Available saved child messages are loaded after the turn; this display is not complete conversation evidence.";

export class CodexOutputReader {
  private readonly seen = new Set<string>();
  constructor(readonly record: SessionRecord, private lineCount: number, previous: OutputLine[] = []) {
    for (const line of previous) if (line.itemId) this.seen.add(`${line.threadId}:${line.turnId}:${line.itemId}:${line.source}`);
  }
  line(source: OutputSource, text: string, at: string, fields: Partial<OutputLine> = {}): OutputLine {
    return { line: ++this.lineCount, at, source, text, agentId: "codex", timestampSource: "arrival", ...fields };
  }
  start(name: StepName, at: string): void {
    if (!this.record.steps.some(step => step.name === name)) this.record.steps.push({ name, startedAt: at });
  }
  read(message: CodexMessage, at: string, timestampSource: "arrival" | "turn" | "recovery" = "arrival"): { lines: OutputLine[]; partial?: PartialText } {
    const p = message.params ?? {};
    const threadId = typeof p.threadId === "string" ? p.threadId : undefined;
    const turnId = typeof p.turnId === "string" ? p.turnId : undefined;
    const child = threadId !== undefined && threadId !== this.record.conversation?.threadId;
    const source: OutputSource = child ? "subagent" : "codex";
    if (message.method === "item/agentMessage/delta" && typeof p.delta === "string") return { lines: [], partial: { source, text: p.delta, ...(threadId ? { threadId } : {}), ...(typeof p.itemId === "string" ? { itemId: p.itemId } : {}) } };
    const item = p.item as Record<string, unknown> | undefined;
    const lines: OutputLine[] = [];
    const add = (label: OutputSource, text: string, id?: string) => {
      const key = `${threadId}:${turnId}:${id}:${label}`;
      if (id && this.seen.has(key)) return;
      if (id) this.seen.add(key);
      lines.push(this.line(label, text, at, { ...(threadId ? { threadId } : {}), ...(turnId ? { turnId } : {}), ...(id ? { itemId: id } : {}), ...(child && this.record.conversation?.threadId ? { parentThreadId: this.record.conversation.threadId } : {}), timestampSource }));
    };
    if (message.id !== undefined && message.method) add("stderr", `Codex request ${message.method}: ${JSON.stringify(p)}`, `request-${message.id}`);
    if (message.method === "error") add("stderr", JSON.stringify(p));
    if (message.method === "guardianWarning") add("stderr", String(p.message ?? "Codex automatic review warning"));
    if (message.method === "item/autoApprovalReview/completed") add("tool", `Automatic review: ${JSON.stringify(p.review)}`, `review-${String(p.reviewId)}`);
    if (!item || !["item/started", "item/completed"].includes(message.method ?? "")) return { lines };
    const id = typeof item.id === "string" ? item.id : undefined;
    const complete = message.method === "item/completed";
    if (item.type === "agentMessage" && complete && typeof item.text === "string" && item.text) add(source, item.text, id);
    else if (item.type === "commandExecution") {
      const command = typeof item.command === "string" ? item.command : "Command input unavailable";
      const newCommand = !id || !this.seen.has(`${threadId}:${turnId}:${id}-start:${child ? "subagent" : "tool"}`);
      add(child ? "subagent" : "tool", command, id && `${id}-start`);
      if (!child && newCommand) this.command(command, typeof item.cwd === "string" ? item.cwd : undefined, at);
      if (complete) add(child ? "subagent" : item.exitCode === 0 ? "out" : "stderr", `${String(item.aggregatedOutput ?? "")}\nCommand ${String(item.status)}; exit ${String(item.exitCode ?? "unknown")}`, id);
    } else if (["fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "subAgentActivity"].includes(String(item.type))) {
      add(child ? "subagent" : "tool", `${String(item.type)}: ${JSON.stringify(item)}`, id && `${id}-${complete ? "complete" : "start"}`);
    }
    return { lines };
  }
  private command(command: string, cwd: string | undefined, at: string): void {
    // Only direct literal reads of a resolved installed skill count; a mention in prose,
    // a grep, or an echoed command cannot advance a step. Nested shells remain unobserved.
    let decoded = command;
    let commands = simpleCommands(command);
    if (commands.length === 1) {
      const shell = commands[0]!;
      if (["sh", "bash", "zsh"].includes(basename(shell[0] ?? "")) && ["-c", "-lc"].includes(shell[1] ?? "") && shell.length === 3) { decoded = shell[2]!; commands = simpleCommands(decoded); }
    }
    for (const words of commands) {
      if (!["cat", "head", "sed"].includes(words[0] ?? "")) continue;
      const path = words.at(-1);
      if (!path || !cwd) continue;
      const skill = this.record.codex?.launchIntent.skills.find(skill => resolve(cwd, path) === skill.path);
      const step = skill && SKILLS[skill.name.slice(skill.name.lastIndexOf(":") + 1)];
      if (step) { this.start(step, at); this.record.lastSkill = { name: basename(resolve(skill.path, "..")), at }; }
    }
    if (runsGitCommit(decoded)) this.start("Commit", at);
    if (runsGitPush(decoded)) this.start("Push", at);
  }
}
