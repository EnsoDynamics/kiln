/** Convert retained provider history into catalog entries, never report-supplied outcomes. */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { comparable, expandHome, realPathOfNearestAncestor } from "../engine/worktree-setup.js";
import { auditCodexConversation } from "../session/codex-evidence.js";
import { claudeConfigFolder, findTranscripts, readTranscript } from "../session/transcripts.js";
import { simpleCommands } from "../session/bash-command.js";
import { outsideChanges } from "../session/outside-workspace.js";
import type { PrdRecord, SessionRecord } from "../state/records.js";
import { AuditRefusal, requireAudit, type AuditActivity, type EvidenceEntry, type FileReference } from "./contracts.js";
import { AuditStore, hashBytes, hashValue, strictJson } from "./storage.js";

type Json = Record<string, unknown>;
function object(value: unknown): Json | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined; }
function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value.map(one => object(one)?.text).filter(v => typeof v === "string").join("\n") : "";
}

export interface ProviderEvidenceContext {
  record: PrdRecord; activity: AuditActivity; session: SessionRecord;
  stateDirectory: string; env: NodeJS.ProcessEnv; codex: string; signal: AbortSignal;
}

/** Assessment payloads are read only from a completed delegated conversation, with its task retained. */
function assessment(task: string, response: string, linkedOpaqueTask = false): EvidenceEntry["assessment"] | undefined {
  const tagged = /<kiln-assessment>([\s\S]*?)<\/kiln-assessment>/.exec(response);
  if (!tagged) return undefined;
  const raw = object(strictJson(tagged[1]!));
  requireAudit(raw && typeof raw.snapshotId === "string" && Array.isArray(raw.criterionKeys) && raw.criterionKeys.every(v => typeof v === "string") && Array.isArray(raw.partIds) && raw.partIds.every(v => typeof v === "string") && ["assessment", "review", "regrade", "test_classification"].includes(String(raw.purpose)) && Array.isArray(raw.testPaths), "Malformed delegated audit assessment.", "missing_evidence");
  requireAudit(linkedOpaqueTask || task.includes(raw.snapshotId) && raw.criterionKeys.every(v => task.includes(String(v))), "Delegated task does not bind its claimed snapshot and criteria.", "missing_evidence");
  return { task, response, snapshotId: raw.snapshotId, criterionKeys: raw.criterionKeys as string[], partIds: raw.partIds as string[], purpose: raw.purpose as NonNullable<EvidenceEntry["assessment"]>["purpose"], testPaths: raw.testPaths as NonNullable<EvidenceEntry["assessment"]>["testPaths"], ...(Array.isArray(raw.configurationFiles) ? { configurationFiles: raw.configurationFiles as FileReference[] } : {}), ...(Array.isArray(raw.verificationEvidenceIds) && raw.verificationEvidenceIds.every(id => typeof id === "string") ? { verificationEvidenceIds: raw.verificationEvidenceIds as string[] } : {}) };
}

/** Resolve only authoritative acknowledgements. Empty follow-up acknowledgements must
 * retain the receiver established by this parent's earlier successful spawn. */
export function codexDelegationReceiver(rows: { type: string; payload: Json }[], call: { payload: Json }, ownedTurns: Set<string>): string | undefined {
  const index = rows.findIndex(r => r.payload === call.payload);
  const output = rows.find(o => o.type === "response_item" && o.payload.type === "function_call_output" && o.payload.call_id === call.payload.call_id);
  if (!output) return undefined;
  const raw = output.payload.output;
  if (raw !== "") {
    if (typeof raw !== "string") return undefined;
    const receiver = object(strictJson(raw))?.task_name;
    return typeof receiver === "string" ? receiver : undefined;
  }
  if (!["followup_task", "send_message"].includes(String(call.payload.name))) return undefined;
  const target = object(strictJson(String(call.payload.arguments)))?.target;
  if (typeof target !== "string") return undefined;
  const receivers = new Set<string>();
  for (const prior of rows.slice(0, index)) {
    if (prior.type !== "response_item" || prior.payload.type !== "function_call" || prior.payload.namespace !== "collaboration" || prior.payload.name !== "spawn_agent" || !ownedTurns.has(String(object(prior.payload.internal_chat_message_metadata_passthrough)?.turn_id))) continue;
    const args = object(strictJson(String(prior.payload.arguments)));
    const result = rows.slice(0, index).find(o => o.type === "response_item" && o.payload.type === "function_call_output" && o.payload.call_id === prior.payload.call_id);
    if (!result || typeof result.payload.output !== "string" || !result.payload.output) continue;
    const receiver = object(strictJson(result.payload.output))?.task_name;
    if (typeof receiver === "string" && (args?.task_name === target || receiver === target)) receivers.add(receiver);
  }
  requireAudit(receivers.size <= 1, "Ambiguous Codex follow-up receiver.", "missing_evidence");
  return [...receivers][0];
}

export async function collectProviderEvidence(context: ProviderEvidenceContext): Promise<EvidenceEntry[]> {
  const { session, activity, signal } = context; const store = new AuditStore(context.stateDirectory);
  const result: EvidenceEntry[] = []; const capturedAt = new Date().toISOString();
  const roots = context.record.repositories.map(r => comparable(realPathOfNearestAncestor(resolve(expandHome(r.worktreePath)))));
  const skillBytes = readFileSync(activity.skill.path, "utf8");
  requireAudit(hashBytes(skillBytes) === activity.skill.digest, `Assigned skill source changed: ${activity.skill.path}`, "missing_evidence");
  type Retained = { sourceDigest: string; retainedSource: string };
  // The store's content address is the source digest; hashing again would double the cost.
  const retain = (source: string): Retained => { const id = store.putBytes(source); return { sourceDigest: id, retainedSource: id }; };
  const put = (conversationId: string, locator: string, retained: Retained, at: string, value: Partial<EvidenceEntry>) => {
    const run = session.runs.findLastIndex(r => r.startedAt <= at);
    requireAudit(run >= 0, "Provider evidence predates every assigned run.", "missing_evidence");
    const raw = { provider: session.agentId!, sessionId: session.sessionId, run, conversationId, locator, capturedAt, ...retained, ...value } as Omit<EvidenceEntry, "evidenceId">;
    const evidenceId = hashValue({ provider: raw.provider, sessionId: raw.sessionId, run: raw.run, conversationId, locator, ...value }); result.push({ ...raw, evidenceId });
  };
  if (session.agentId === "codex") {
    requireAudit(session.conversation?.threadId && session.conversation.codexHome, "Codex conversation provenance is unavailable.", "missing_evidence");
    const audit = await auditCodexConversation({ threadId: session.conversation.threadId, codexHome: session.conversation.codexHome, worktrees: roots, cwd: session.workingDirectory!, executable: context.codex, env: context.env, signal, commandProjection: true, ...(session.conversation.knownThreadIds ? { knownThreadIds: session.conversation.knownThreadIds } : {}) });
    if (audit.coverage !== "complete") throw new AuditRefusal("evidence_unavailable", audit.problems.join(" "), 503);
    requireAudit(!audit.findings.length, audit.findings.map(f => f.fact).join(" "), "outside_execution");
    const sources = new Map<string, string>();
    for (const frontier of audit.frontiers) {
      signal.throwIfAborted(); const bytes = readFileSync(frontier.path, "utf8");
      requireAudit(hashBytes(bytes) === frontier.sha256, "Codex history changed after reconciliation.", "missing_evidence"); sources.set(frontier.threadId, bytes);
    }
    for (const frontier of audit.frontiers) {
      if (frontier.threadId === session.conversation.threadId) continue;
      const bytes = sources.get(frontier.threadId)!;
      const parentBytes = sources.get(frontier.parentThreadId ?? "");
      requireAudit(parentBytes, "Delegated conversation has no verified parent source.", "missing_evidence");
      const ownTurns = new Set(frontier.ownedTurnIds);
      const parentTurns = new Set(audit.frontiers.find(f => f.threadId === frontier.parentThreadId)?.ownedTurnIds);
      const childRows = bytes.trimEnd().split("\n").map(line => JSON.parse(line) as { type: string; payload: Json });
      const childPath = childRows.find(r => r.type === "session_meta" && r.payload.id === frontier.threadId)?.payload.agent_path;
      const parentRows = parentBytes.trimEnd().split("\n").map(line => JSON.parse(line) as { type: string; payload: Json });
      let task = ""; let taskTurn = ""; let turn = ""; let linkedOpaqueTask = false;
      for (const line of bytes.trimEnd().split("\n")) {
        const row = JSON.parse(line) as { type: string; timestamp: string; payload: Json };
        const payload = row.payload;
        if (row.type === "turn_context") turn = String(payload.turn_id ?? "");
        if (ownTurns.has(turn) && row.type === "response_item" && payload.type === "agent_message") {
          const blocks = Array.isArray(payload.content) ? payload.content.map(object) : [];
          const encrypted = blocks.find(b => typeof b?.encrypted_content === "string")?.encrypted_content;
          // Codex 0.162.1 encrypts delegated text in BOTH authoritative histories.
          // Link the identical ciphertext to its actual parent invocation; never infer
          // a task from inherited user messages or an assessor's self-description.
          const call = parentRows.find(r => {
            if (r.type !== "response_item" || r.payload.type !== "function_call" || r.payload.namespace !== "collaboration" || !["spawn_agent", "followup_task", "send_message"].includes(String(r.payload.name))) return false;
            const args = object(JSON.parse(String(r.payload.arguments)));
            const callTurn = object(r.payload.internal_chat_message_metadata_passthrough)?.turn_id;
            const receiver = codexDelegationReceiver(parentRows, r, parentTurns);
            return parentTurns.has(String(callTurn)) && typeof childPath === "string" && receiver === childPath && typeof encrypted === "string" && args?.message === encrypted;
          });
          if (call) { task = JSON.stringify({ parentThreadId: frontier.parentThreadId, callId: call.payload.call_id, arguments: call.payload.arguments }); taskTurn = turn; linkedOpaqueTask = true; }
        }
        if (row.type === "event_msg" && payload.type === "task_complete" && ownTurns.has(String(payload.turn_id)) && task && taskTurn === payload.turn_id && typeof payload.last_agent_message === "string") {
          const assessed = assessment(task, payload.last_agent_message, linkedOpaqueTask);
          if (assessed) put(frontier.threadId, `delegated-final:${taskTurn}`, retain(JSON.stringify({ child: bytes, parent: parentBytes })), row.timestamp, { kind: "assessment", assessment: assessed });
          task = "";
        }
      }
    }
    for (const mutation of audit.mutations ?? []) put(mutation.conversationId, `${mutation.callId}:mutation`, retain(sources.get(mutation.conversationId)!), mutation.at, { kind: "mutation", mutation: { at: mutation.at, paths: mutation.paths } });
    for (const command of audit.commands ?? []) {
      const conversation = command.source.split("/")[0]!; const source = sources.get(conversation);
      requireAudit(source && command.resultAt && command.outcome && command.output !== undefined, "Incomplete command provenance.", "missing_evidence");
      const observed: EvidenceEntry["command"] = { invocation: command.command, cwd: command.cwd, startedAt: command.calledAt, endedAt: command.resultAt, outcome: command.outcome, output: command.output, ...(command.exitCode === undefined ? {} : { exitCode: command.exitCode }) };
      put(conversation, command.callId, retain(JSON.stringify({ raw: source, observed: command })), command.calledAt, { kind: "command", command: observed });
      const words = simpleCommands(command.command);
      if (command.outcome === "success" && words.length === 1 && words[0]?.length === 2 && words[0][0] === "cat" && words[0][1] === activity.skill.path && command.output.trim() === skillBytes.trim()) put(conversation, `${command.callId}:skill`, retain(source), command.calledAt, { kind: "skill", skill: activity.skill });
    }
  } else {
    const files = findTranscripts(claudeConfigFolder(context.env), session.sessionId);
    if (!files.main) throw new AuditRefusal("evidence_unavailable", `Claude transcript missing for ${session.sessionId}.`, 503);
    const parent = readTranscript(files.main);
    requireAudit(!parent.problem, parent.problem ?? "", "missing_evidence");
    for (const path of [files.main, ...files.subagents]) {
      signal.throwIfAborted(); const source = readFileSync(path, "utf8"); const transcript = readTranscript(path);
      // One transcript backs every call in it. Retaining it per call blocked the event loop for
      // 20s on a 14 MB, 1,400-call audit transcript, past the dashboard's heartbeat timeout.
      let retained: Retained | undefined; const once = () => retained ??= retain(source);
      requireAudit(!transcript.problem, `${path}: ${transcript.problem}`, "missing_evidence");
      const findings = outsideChanges(transcript, roots);
      requireAudit(!findings.length, findings.map(f => f.fact).join(" "), "outside_execution");
      // Unlike the legacy reader, an incomplete final JSON record is unresolved for audits.
      const rows = source.trimEnd().split("\n").filter(Boolean).map(line => JSON.parse(line) as Json);
      const conversation = path === files.main ? session.sessionId : basename(path, ".jsonl");
      for (const call of transcript.calls) {
        signal.throwIfAborted(); if (!call.id || !call.at || !call.result?.at) continue;
        if (call.name === "Bash" && typeof call.input.command === "string") put(conversation, call.id, once(), call.at, { kind: "command", command: { invocation: call.input.command, cwd: call.cwd, startedAt: call.at, endedAt: call.result.at, outcome: call.result.isError ? "error" : "success", output: call.result.text } });
        if (call.name === "Skill" && !call.result.isError && typeof call.input.skill === "string" && call.input.skill.split(":").at(-1) === activity.skill.name) put(conversation, call.id, once(), call.at, { kind: "skill", skill: activity.skill });
        if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(call.name) && !call.result.isError) put(conversation, call.id, once(), call.at, { kind: "mutation", mutation: { at: call.at, paths: [String(call.input.file_path ?? call.input.notebook_path)] } });
      }
      if (path !== files.main) {
        const id = basename(path, ".jsonl").replace(/^agent-/, "");
        const taskCall = parent.calls.find(c => ["Agent", "Task"].includes(c.name) && c.result && !c.result.isError && c.result.text.includes(id));
        if (!taskCall || typeof taskCall.input.prompt !== "string") continue;
        const last = rows.filter(r => r.type === "assistant").at(-1);
        const handback = transcript.calls.findLast(c => c.name === "SubagentHandback" && c.result && !c.result.isError && typeof c.input.message === "string");
        const response = handback ? String(handback.input.message) : contentText(object(last?.message)?.content);
        const assessed = assessment(taskCall.input.prompt, response);
        if (assessed && last && typeof last.timestamp === "string") put(conversation, taskCall.id!, once(), last.timestamp, { kind: "assessment", assessment: assessed });
      }
    }
  }
  signal.throwIfAborted(); return result;
}
