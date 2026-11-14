/** Durable continuation payloads; the engine and its existing command journal own mutations. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkedPath, INSPECTION_RECORD_BYTES, privateJson } from "../control/private-state.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { readContinuationProposal, type ContinuationProposal } from "./continuation-readiness.js";

export interface ExecutionSummary {
  executionId: string; archiveId: string; startedAt?: string;
  /** Absent only for an execution set up again from the Folder missing page (`ending: "folder_missing_setup"`). */
  completedAt?: string;
  branch: string; deliveries: { repository: string; url: string }[];
  /** Schema 20; a summary without them reads as `ending: "completed"`, `endedAt = completedAt`. */
  endedAt?: string; ending?: "completed" | "folder_missing_setup";
  /** Its sessions' recorded running time, saved when it was archived (time totals AC-TOTAL-02); absent on rows archived before. */
  runningMs?: number;
}
/** How an archived execution ended, with older summaries read as completed. */
export function executionEnding(row: ExecutionSummary): { ending: "completed" | "folder_missing_setup"; endedAt: string } {
  return { ending: row.ending ?? "completed", endedAt: row.endedAt ?? row.completedAt! };
}
export interface ContinuationAcceptance {
  formatVersion: 1; id: string; operationId: string; commandId: string; proposalId: string;
  completedExecutionId: string; newExecutionId: string; acceptedAt: string;
  candidateId: string; archiveId: string; proposal: ContinuationProposal;
  pendingAuthorityId?: string; authorization?: import("../state/development-delivery.js").DevelopmentAuthorization;
  settings: PrdRecord["settings"]; canonicalWorkspace: string; repositories: RepositoryEntry[];
  state: "preparing" | "blocked" | "active" | "superseded"; reason?: string; activatedAt?: string;
}
export interface AcceptanceSummary {
  id: string; commandId: string; proposalId: string; completedExecutionId: string; newExecutionId: string;
  state: ContinuationAcceptance["state"]; acceptedAt: string; reason?: string;
}
export interface ContinuationState {
  /** Absent after a base-branch start from the Folder missing page, which no acceptance produced. */
  formatVersion: 1; journalIndexed: true; currentAcceptanceId?: string;
  acceptances: AcceptanceSummary[]; executions: ExecutionSummary[];
}
export interface CompletedExecution {
  formatVersion: 1; record: Omit<PrdRecord, "continuation">;
  legacyBindings?: { version: number; execution_id: string; sessions: Record<string, string> };
}
export const safeIdentity = (id: unknown): id is string => typeof id === "string" && /^[\w.-]{1,128}$/.test(id);
export function executionDeliveries(record: Omit<PrdRecord, "continuation">): ExecutionSummary["deliveries"] {
  const links = [...(record.pullRequests ?? []).map(row => ({ repository: row.repository, url: row.url })),
    ...(record.mergedBranches ?? []).map(row => ({ repository: row.repository, url: row.url })),
    ...(record.developmentDelivery?.checkpoints ?? []).flatMap(row => row.merge ? [{ repository: row.target.repository, url: row.merge.url }] : []),
    ...(record.deliveryHistory?.repositories ?? []).flatMap(row => row.events.map(event => ({ repository: event.repository, url: event.url })))];
  return [...new Map(links.map(row => [row.url, row])).values()];
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function read<T>(directory: string, path: string): T { return privateJson<T>(dirname(dirname(directory)), path); }
export function acceptanceSummary(value: ContinuationAcceptance): AcceptanceSummary {
  return { id: value.id, commandId: value.commandId, proposalId: value.proposalId, completedExecutionId: value.completedExecutionId, newExecutionId: value.newExecutionId, state: value.state, acceptedAt: value.acceptedAt, ...(value.reason ? { reason: value.reason } : {}) };
}
function writeChecked(directory: string, path: string, value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > INSPECTION_RECORD_BYTES) throw new Error("Continuation metadata exceeds the 16 MiB retained-record limit.");
  let parent = dirname(path); while (!existsSync(parent)) parent = dirname(parent);
  checkedPath(dirname(dirname(directory)), parent);
  if (existsSync(path)) checkedPath(dirname(dirname(directory)), path);
  writeDurableMetadata(path, value);
}
export function writeAcceptance(directory: string, value: ContinuationAcceptance): void {
  if (!safeIdentity(value.id)) throw new Error("Invalid continuation acceptance identity.");
  writeChecked(directory, join(directory, "continuation-acceptances", `${value.id}.json`), value);
}
export function readAcceptance(directory: string, id: string): ContinuationAcceptance {
  if (!safeIdentity(id)) throw new Error("Invalid continuation acceptance identity.");
  const value = read<ContinuationAcceptance>(directory, join(directory, "continuation-acceptances", `${id}.json`));
  if (value.formatVersion !== 1 || value.id !== id || !safeIdentity(value.operationId) || !safeIdentity(value.completedExecutionId) || !safeIdentity(value.newExecutionId) || !/^[a-f0-9]{64}$/.test(value.proposalId) || value.proposal.id !== value.proposalId || !["preparing", "blocked", "active", "superseded"].includes(value.state) || !Array.isArray(value.repositories)) throw new Error("Invalid retained continuation acceptance; restore its durable record before retrying.");
  if (!/^[a-f0-9]{64}$/.test(value.candidateId) || !/^[a-f0-9]{64}$/.test(value.archiveId) || !Number.isFinite(Date.parse(value.acceptedAt)) || typeof value.canonicalWorkspace !== "string" || value.settings.workspaceFolder !== value.canonicalWorkspace || !value.settings.featureBranch.endsWith(`-continue-${value.newExecutionId}`) || value.repositories.length !== value.proposal.repositories.length || new Set(value.repositories.map(repo => repo.name)).size !== value.repositories.length) throw new Error("Damaged continuation setup identity.");
  if (JSON.stringify(readContinuationProposal(directory, value.proposalId)) !== JSON.stringify(value.proposal) || value.proposal.completedExecutionId !== value.completedExecutionId) throw new Error("The retained acceptance does not match its immutable proposal.");
  for (const repo of value.repositories) {
    const source = value.proposal.repositories.find(one => one.name === repo.name);
    if (!source || repo.github !== source.identity || repo.mainCheckoutPath !== source.path || repo.baseBranch !== source.baseBranch || repo.baseCommit !== source.baseRevision || repo.worktreePath !== join(value.canonicalWorkspace, repo.name) || !["prd", "named", "added"].includes(repo.kind)) throw new Error("Damaged repository setup binding; no workspace effects authorized.");
  }
  return value;
}
export function retainExecution(directory: string, record: PrdRecord): string {
  const { continuation: _continuation, ...saved } = structuredClone(record); void _continuation;
  const path = join(directory, "inspection-bindings.json");
  const archive: CompletedExecution = { formatVersion: 1, record: saved, ...(existsSync(path) ? { legacyBindings: read<NonNullable<CompletedExecution["legacyBindings"]>>(directory, path) } : {}) };
  const id = digest(archive);
  const file = join(directory, "completed-executions", `${id}.json`);
  if (!existsSync(file)) writeChecked(directory, file, archive);
  return id;
}
export function readExecution(directory: string, summary: ExecutionSummary): CompletedExecution {
  if (!/^[a-f0-9]{64}$/.test(summary.archiveId)) throw new Error("Invalid historical execution reference.");
  const archive = read<CompletedExecution>(directory, join(directory, "completed-executions", `${summary.archiveId}.json`));
  if (archive.formatVersion !== 1 || digest(archive) !== summary.archiveId || archive.record.executionId !== summary.executionId || archive.record.completedAt !== summary.completedAt || summary.completedAt === undefined && summary.ending !== "folder_missing_setup") throw new Error("Historical execution is unavailable or damaged.");
  return archive;
}
export function assertContinuationState(value: ContinuationState | undefined): void {
  if (value === undefined) return;
  if (value.formatVersion !== 1 || value.journalIndexed !== true || value.currentAcceptanceId !== undefined && (!safeIdentity(value.currentAcceptanceId) || !value.acceptances.some(row => row.id === value.currentAcceptanceId)) || !Array.isArray(value.acceptances) || !Array.isArray(value.executions)) throw new Error("Invalid continuation state; no new work authorized.");
  const ids = new Set<string>();
  for (const row of value.acceptances) {
    if (!safeIdentity(row.id) || !safeIdentity(row.commandId) || ids.has(row.id) || !safeIdentity(row.completedExecutionId) || !safeIdentity(row.newExecutionId) || !/^[a-f0-9]{64}$/.test(row.proposalId) || !["preparing", "blocked", "active", "superseded"].includes(row.state) || !Number.isFinite(Date.parse(row.acceptedAt))) throw new Error("Invalid continuation acceptance reference.");
    ids.add(row.id);
  }
  ids.clear();
  for (const row of value.executions) {
    const ended = row.ending === "folder_missing_setup";
    if (!safeIdentity(row.executionId) || ids.has(row.executionId) || !/^[a-f0-9]{64}$/.test(row.archiveId) || (row.completedAt === undefined ? !ended : !Number.isFinite(Date.parse(row.completedAt))) || row.ending !== undefined && !["completed", "folder_missing_setup"].includes(row.ending) || (row.endedAt === undefined ? ended : !Number.isFinite(Date.parse(row.endedAt))) || typeof row.branch !== "string" || !Array.isArray(row.deliveries) || row.runningMs !== undefined && !(Number.isSafeInteger(row.runningMs) && row.runningMs >= 0)) throw new Error("Invalid historical execution reference.");
    ids.add(row.executionId);
  }
}
