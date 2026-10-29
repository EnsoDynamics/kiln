// A context snapshot never substitutes for original raw execution records.
interface WindowChain { first: string; current: string; number: number }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed Codex compaction object.");
  return value as Record<string, unknown>;
};
const text = (value: unknown): string => {
  if (typeof value !== "string" || !value) throw new Error("Missing Codex compaction identity.");
  return value;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error("Missing Codex compaction snapshot.");
  return value;
};

/** Qualified retained-rollout form observed with the 0.165.0 history reader. */
export function retainedCompaction(value: unknown, chain: WindowChain | undefined, threadId: string, recordedTurn: (id: string) => boolean): WindowChain {
  const payload = object(value);
  const keys = ["message", "replacement_history", "replacement_history_metadata", "retained_context", "window_number", "first_window_id", "previous_window_id", "window_id", "compaction_response_id", "latest_token_usage_record", "resume_metadata"];
  if (Object.keys(payload).length !== keys.length || Object.keys(payload).some(key => !keys.includes(key)) || payload.message !== "") throw new Error("Unsupported Codex compaction schema.");
  const current = text(payload.window_id);
  if (!chain || payload.first_window_id !== chain.first || payload.previous_window_id !== chain.current || payload.window_number !== chain.number + 1 || current === chain.current || current === chain.first) throw new Error("Broken Codex compaction window chain.");
  text(payload.compaction_response_id);
  const turn = (value: unknown) => { const id = text(value); if (!recordedTurn(id)) throw new Error("Compaction references missing original turn evidence."); return id; };
  const usage = object(payload.latest_token_usage_record);
  if (usage.thread_id !== threadId || usage.response_id !== payload.compaction_response_id) throw new Error("Compaction identity does not match original history.");
  const latestTurn = turn(usage.turn_id);
  const resume = object(payload.resume_metadata);
  if (resume.last_started_turn_id !== latestTurn || object(resume.turn_attribution).turn_id !== latestTurn) throw new Error("Compaction resume turn mismatch.");
  const retained = object(payload.retained_context);
  // These flags describe the model's retained text, not raw audit completeness.
  if (retained.incomplete !== false || typeof retained.user_messages_incomplete !== "boolean" || typeof retained.assistant_messages_incomplete !== "boolean") throw new Error("Unsupported retained Codex context.");
  if (array(retained.verified_answers).length) throw new Error("Unqualified retained Codex answers.");
  for (const entry of [...array(retained.user_messages), ...array(retained.assistant_messages)]) turn(object(entry).turn_id);
  const history = array(payload.replacement_history), metadata = array(payload.replacement_history_metadata);
  if (!history.length || history.length !== metadata.length) throw new Error("Incomplete Codex compaction metadata.");
  let summaries = 0;
  for (const [index, entry] of history.entries()) {
    const item = object(entry), meta = object(metadata[index]);
    if (meta.client_authored !== false) throw new Error("Unqualified client-authored compaction snapshot.");
    if (meta.retained_source !== undefined) turn(object(object(meta.retained_source).id).turn_id);
    if (item.internal_chat_message_metadata_passthrough !== undefined) turn(object(item.internal_chat_message_metadata_passthrough).turn_id);
    if (item.type === "message" && ["developer", "user"].includes(String(item.role)) && Array.isArray(item.content)) continue;
    if (item.type === "additional_tools" && item.role === "developer" && Array.isArray(item.tools)) continue;
    if (item.type === "compaction" && typeof item.encrypted_content === "string" && item.encrypted_content) { summaries++; continue; }
    throw new Error("Executable or unsupported item in Codex compaction snapshot.");
  }
  if (summaries !== 1) throw new Error("Missing or ambiguous Codex compaction summary.");
  return { first: chain.first, current, number: chain.number + 1 };
}
