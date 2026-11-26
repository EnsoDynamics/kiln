// The start line (Kiln Phase Model Tiers, technical design "When an Activity Starts"): an activity
// starts when one of its sessions gets its first response from the model. One test per agent,
// shared with usage-limit recovery's "before any response", so the two lines can't drift apart.

import { readJsonLines } from "../state/state-files.js";
import type { PhaseFacts, SessionRecord } from "../state/records.js";
import { isModelResponse, type SavedEvent } from "../session/run-verdict.js";
import { sessionFiles } from "../session/claude-session.js";

/** Codex items the model issued; anything Codex or Kiln writes itself doesn't count. */
const CODEX_STARTED_ITEMS = new Set(["reasoning", "plan", "commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "webSearch", "imageView", "imageGeneration", "sleep"]);

export interface CodexNotification { method?: string; params?: { item?: { type?: string; text?: string; source?: string } | undefined } | undefined }

/**
 * Whether a Codex notification shows the model responded: `item/started` for an item the model
 * issued (a command from the person's own shell excluded), or `item/completed` for an agent
 * message with text, on the parent thread or a child.
 *
 *   isCodexModelItem({ method: "item/started", params: { item: { type: "commandExecution", source: "agent" } } })  // true
 *   isCodexModelItem({ method: "item/started", params: { item: { type: "userMessage" } } })                       // false
 */
export function isCodexModelItem(message: CodexNotification): boolean {
  const item = message.params?.item;
  if (!item?.type) return false;
  if (message.method === "item/started") return CODEX_STARTED_ITEMS.has(item.type) && !(item.type === "commandExecution" && item.source === "userShell");
  return message.method === "item/completed" && item.type === "agentMessage" && typeof item.text === "string" && item.text.trim() !== "";
}

/** One saved event line: Claude Code's stream event, or Codex's notification under `agentId: "codex"`. */
type SavedLine = SavedEvent & { agentId?: string };

/** Whether a saved event is the model's response, by the session's agent's test. */
export function isFirstResponseEvent(session: Pick<SessionRecord, "agentId">, saved: SavedLine): boolean {
  if (session.agentId === "codex") return saved.agentId === "codex" && isCodexModelItem(saved.event as CodexNotification);
  return saved.agentId !== "codex" && isModelResponse(saved.event);
}

/**
 * The earliest model response in a session's saved events, by its agent's test; undefined when
 * the session got none, or its events can't be read.
 */
export function firstResponseInSavedEvents(stateDirectory: string, session: SessionRecord): string | undefined {
  try {
    if (session.agentId === "codex") {
      const fromRuns = session.runs.map(run => run.codex?.firstResponseAt).filter((at): at is string => !!at).sort()[0];
      if (fromRuns) return fromRuns;
    }
    return readJsonLines<SavedLine>(sessionFiles(stateDirectory, session).events).find(saved => isFirstResponseEvent(session, saved))?.at;
  } catch { return undefined; }
}

/**
 * The session whose response started an activity: the first of its sessions, in the order they
 * were created, that has a first response. Undefined while none has.
 */
export function startingSession(facts: Pick<PhaseFacts, "sessionIds">, session: (id: string) => SessionRecord | undefined): SessionRecord | undefined {
  for (const id of facts.sessionIds) {
    const one = session(id);
    if (one?.firstResponseAt) return one;
  }
  return undefined;
}
