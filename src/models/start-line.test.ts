// The start line's test for each agent (Kiln Phase Model Tiers, "When an Activity Starts").

import { describe, expect, it } from "vitest";
import { isCodexModelItem, isFirstResponseEvent } from "./start-line.js";

const started = (type: string, extra: object = {}) => ({ method: "item/started", params: { item: { type, ...extra } } });

describe("Codex's first response", () => {
  it("is the first item the model issued: a tool call or reasoning counts, not only a message", () => {
    for (const type of ["reasoning", "plan", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "webSearch", "imageView", "imageGeneration", "sleep"]) expect(isCodexModelItem(started(type)), type).toBe(true);
    expect(isCodexModelItem(started("commandExecution", { source: "agent" }))).toBe(true);
    expect(isCodexModelItem({ method: "item/completed", params: { item: { type: "agentMessage", text: "Done." } } })).toBe(true);
  });

  it("leaves out items Codex or Kiln writes itself, a command from the person's own shell, and an empty message", () => {
    for (const type of ["userMessage", "hookPrompt", "functionCallOutput", "subAgentActivity", "contextCompaction", "enteredReviewMode", "exitedReviewMode"]) expect(isCodexModelItem(started(type)), type).toBe(false);
    expect(isCodexModelItem(started("commandExecution", { source: "userShell" }))).toBe(false);
    expect(isCodexModelItem({ method: "item/completed", params: { item: { type: "agentMessage", text: "  " } } })).toBe(false);
    expect(isCodexModelItem({ method: "item/started", params: { item: { type: "agentMessage", text: "Hi" } } })).toBe(false);
    expect(isCodexModelItem({ method: "turn/started", params: {} })).toBe(false);
  });
});

describe("Claude Code's first response", () => {
  it("is an assistant event that isn't synthetic, by the session's agent's test", () => {
    const claude = { agentId: "claude_code" as const };
    expect(isFirstResponseEvent(claude, { at: "t", event: { type: "assistant", message: { model: "claude-opus-5-5" } } })).toBe(true);
    expect(isFirstResponseEvent(claude, { at: "t", event: { type: "assistant", message: { model: "<synthetic>" } } })).toBe(false);
    expect(isFirstResponseEvent(claude, { at: "t", event: { type: "system", subtype: "init" } })).toBe(false);
    expect(isFirstResponseEvent({ agentId: "codex" }, { at: "t", agentId: "codex", event: started("reasoning") } as never)).toBe(true);
  });
});
