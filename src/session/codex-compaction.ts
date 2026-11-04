// A context snapshot never substitutes for original raw execution records.
interface WindowChain { first: string; current: string; number: number }

/**
 * A schema failure in Codex history: a record Kiln reads lacks a field it needs, carries it in
 * another form, or has a type Kiln does not know (AC-AGENT-07). `detail` names only the schema
 * element, never a value, and becomes a `codex_history` compatibility detail (AC-AGENT-04).
 * Integrity failures (changed or unowned records, identity or chain mismatches) stay plain errors.
 */
export class CodexSchemaChange extends Error {
  constructor(readonly detail: string) { super(`Unrecognised Codex history: ${detail}.`); this.name = "CodexSchemaChange"; }
}
/** A schema element's name as Codex wrote it, only when it is a plain identifier. */
export const schemaName = (value: unknown, unreadable = "with an unreadable name") => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : unreadable;
export const fieldChanged = (record: string, field: string) => new CodexSchemaChange(`${record} field ${field} is missing or changed`);

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => !!value && typeof value === "object" && !Array.isArray(value);
// Readers of one record's fields: each requires the field's JSON form and ignores fields it does not read.
const reader = (record: string) => ({
  object(value: unknown, field: string): Fields { if (!isObject(value)) throw fieldChanged(record, field); return value; },
  text(value: unknown, field: string): string { if (typeof value !== "string" || !value) throw fieldChanged(record, field); return value; },
  string(value: unknown, field: string): string { if (typeof value !== "string") throw fieldChanged(record, field); return value; },
  array(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw fieldChanged(record, field); return value; },
  boolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw fieldChanged(record, field); return value; },
  count(value: unknown, field: string): number { if (!Number.isSafeInteger(value)) throw fieldChanged(record, field); return value as number; },
});
const compaction = reader("compaction");

/** The window fields both compaction readers require. */
function windowFields(payload: Fields) {
  return { current: compaction.text(payload.window_id, "window_id"), first: compaction.text(payload.first_window_id, "first_window_id"), previous: compaction.text(payload.previous_window_id, "previous_window_id"), number: compaction.count(payload.window_number, "window_number") };
}

/** Qualified retained-rollout forms observed with the 0.165.0 and 0.166.0 readers; fields Kiln does not read (`guardian_history`, 0.144) are ignored. */
export function retainedCompaction(value: unknown, chain: WindowChain | undefined, threadId: string, recordedTurn: (id: string) => boolean): WindowChain {
  const payload = compaction.object(value, "payload");
  if (compaction.string(payload.message, "message") !== "") throw new Error("Unsupported Codex compaction message.");
  const window = windowFields(payload);
  const responseId = compaction.text(payload.compaction_response_id, "compaction_response_id");
  const usage = compaction.object(payload.latest_token_usage_record, "latest_token_usage_record");
  const usageThread = compaction.text(usage.thread_id, "latest_token_usage_record.thread_id"), usageResponse = compaction.text(usage.response_id, "latest_token_usage_record.response_id"), usageTurn = compaction.text(usage.turn_id, "latest_token_usage_record.turn_id");
  const resume = compaction.object(payload.resume_metadata, "resume_metadata");
  const lastStarted = compaction.text(resume.last_started_turn_id, "resume_metadata.last_started_turn_id");
  const attributed = compaction.text(compaction.object(resume.turn_attribution, "resume_metadata.turn_attribution").turn_id, "resume_metadata.turn_attribution.turn_id");
  const retained = compaction.object(payload.retained_context, "retained_context");
  const incomplete = compaction.boolean(retained.incomplete, "retained_context.incomplete");
  compaction.boolean(retained.user_messages_incomplete, "retained_context.user_messages_incomplete"); compaction.boolean(retained.assistant_messages_incomplete, "retained_context.assistant_messages_incomplete");
  const answers = compaction.array(retained.verified_answers, "retained_context.verified_answers");
  const retainedTurns = [...compaction.array(retained.user_messages, "retained_context.user_messages"), ...compaction.array(retained.assistant_messages, "retained_context.assistant_messages")]
    .map(entry => compaction.text(compaction.object(entry, "retained_context messages").turn_id, "retained_context messages turn_id"));
  const history = compaction.array(payload.replacement_history, "replacement_history"), metadata = compaction.array(payload.replacement_history_metadata, "replacement_history_metadata");

  if (!chain || window.first !== chain.first || window.previous !== chain.current || window.number !== chain.number + 1 || window.current === chain.current || window.current === chain.first) throw new Error("Broken Codex compaction window chain.");
  const turn = (id: string) => { if (!recordedTurn(id)) throw new Error("Compaction references missing original turn evidence."); return id; };
  if (usageThread !== threadId || usageResponse !== responseId) throw new Error("Compaction identity does not match original history.");
  const latestTurn = turn(usageTurn);
  if (lastStarted !== latestTurn || attributed !== latestTurn) throw new Error("Compaction resume turn mismatch.");
  // These flags describe the model's retained text, not raw audit completeness.
  if (incomplete !== false) throw new Error("Unsupported retained Codex context.");
  if (answers.length) throw new Error("Unqualified retained Codex answers.");
  for (const id of retainedTurns) turn(id);
  if (!history.length || history.length !== metadata.length) throw new Error("Incomplete Codex compaction metadata.");
  let summaries = 0;
  for (const [index, entry] of history.entries()) {
    const item = compaction.object(entry, "replacement_history item"), meta = compaction.object(metadata[index], "replacement_history_metadata item");
    if (compaction.boolean(meta.client_authored, "replacement_history_metadata.client_authored") !== false) throw new Error("Unqualified client-authored compaction snapshot.");
    if (meta.retained_source !== undefined) turn(compaction.text(compaction.object(compaction.object(meta.retained_source, "replacement_history_metadata.retained_source").id, "replacement_history_metadata.retained_source.id").turn_id, "replacement_history_metadata.retained_source.id.turn_id"));
    if (item.internal_chat_message_metadata_passthrough !== undefined) turn(compaction.text(compaction.object(item.internal_chat_message_metadata_passthrough, "replacement_history item turn metadata").turn_id, "replacement_history item turn_id"));
    const type = compaction.text(item.type, "replacement_history item type");
    if (type === "message") {
      if (!["developer", "user"].includes(compaction.string(item.role, "message role"))) throw new Error("Unsupported Codex compaction message role.");
      compaction.array(item.content, "message content");
    } else if (type === "additional_tools") {
      if (compaction.string(item.role, "additional_tools role") !== "developer") throw new Error("Unsupported Codex compaction tool role.");
      compaction.array(item.tools, "additional_tools tools");
    } else if (type === "agent_message") agentMessage(item);
    else if (type === "compaction") { compaction.text(item.encrypted_content, "compaction item encrypted_content"); summaries++; }
    else throw new CodexSchemaChange(`compaction item type ${schemaName(type)} is not recognised`);
  }
  if (summaries !== 1) throw new Error("Missing or ambiguous Codex compaction summary.");
  return { first: chain.first, current: window.current, number: chain.number + 1 };
}

const message = reader("agent message");
/** Retained delegation text is context only, never a command or assessment receipt. */
function agentMessage(item: Fields) {
  const author = message.string(item.author, "author"), recipient = message.string(item.recipient, "recipient");
  const content = message.array(item.content, "content");
  if (!author.startsWith("/root") || !recipient.startsWith("/root") || !content.length) throw new Error("Unsupported retained Codex agent message.");
  for (const value of content) {
    const block = message.object(value, "content block");
    const type = message.text(block.type, "content block type");
    if (type === "input_text") message.string(block.text, "input_text text");
    else if (type === "encrypted_content") message.text(block.encrypted_content, "encrypted_content encrypted_content");
    else throw new CodexSchemaChange(`agent message content block type ${schemaName(type)} is not recognised`);
  }
}

/**
 * Observed with 0.164.0 through 0.166.0: a fork of a compacted thread opens with a copy of the
 * ancestor's compaction that drops its usage and attribution bookkeeping. Requires the fields the
 * copy is read by and ignores the rest; its content must still match an ancestor's own compaction.
 * Returns the copy's window, or undefined for a copy whose values Kiln does not qualify.
 */
export function forkedCompactionCopy(value: unknown): WindowChain | undefined {
  const payload = compaction.object(value, "payload");
  compaction.string(payload.message, "message"); compaction.text(payload.compaction_response_id, "compaction_response_id");
  const window = windowFields(payload);
  const history = compaction.array(payload.replacement_history, "replacement_history"), metadata = compaction.array(payload.replacement_history_metadata, "replacement_history_metadata");
  const clientAuthored = metadata.map(meta => compaction.boolean(compaction.object(meta, "replacement_history_metadata item").client_authored, "replacement_history_metadata.client_authored"));
  const answers = compaction.array(compaction.object(payload.retained_context, "retained_context").verified_answers, "retained_context.verified_answers");
  if (metadata.length !== history.length || clientAuthored.some(Boolean) || answers.length) return undefined;
  return { first: window.first, current: window.current, number: window.number };
}

/** What a forked copy of a compaction keeps from the original: its window identity and the model-visible context. */
export function compactionContent(payload: unknown) {
  const { message, replacement_history, compaction_response_id, first_window_id, previous_window_id, window_id, window_number } = payload as Fields;
  return { message, replacement_history, compaction_response_id, first_window_id, previous_window_id, window_id, window_number };
}
