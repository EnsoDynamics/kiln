/** Audit routing consumes immutable accepted results, never provider prose or exits. */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { PrdRecord, SessionRecord } from "../state/records.js";
import { readSessionRecord } from "../state/records.js";
import { claudeConfigFolder } from "../session/transcripts.js";
import { readSkillList } from "../account/model-list.js";
import { readCodexMetadata } from "../agents/codex-metadata.js";
import { auditCurrentness, type AdmissionContext } from "./admission.js";
import { AuditRefusal, type AuditActivity, type AuditKind, type AuditReport, type AuditResult } from "./contracts.js";
import { AuditStore, hashBytes } from "./storage.js";

export interface ExecutionActivity {
  activityId: string; sequence: number; kind: "implementation" | AuditKind | "final_delivery";
  key: string; phaseId?: string; createdAt: string;
}
export const auditKey = (activity: Pick<AuditActivity, "activityId">) => `audit-${activity.activityId}`;
export const auditLabel = (kind: AuditKind) => kind === "delivery_audit" ? "Delivery audit" : "Test audit";
export function acceptedAudit(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): { result: AuditResult; report: AuditReport } | undefined {
  if (!activity.acceptedResult) return undefined;
  const result = store.read<AuditResult>(activity.acceptedResult);
  if (result.activityId !== activity.activityId || result.disposition !== "recorded") throw new AuditRefusal("missing_evidence", `Invalid accepted audit result for ${activity.reportPath}.`);
  return { result, report: JSON.parse(result.reportBytes) as AuditReport };
}
/** Upgrade only observed history, retaining original timestamps and session paths. */
export function activityHistory(record: PrdRecord, stateDirectory: string): ExecutionActivity[] {
  if (record.activities) return record.activities;
  const observed: Omit<ExecutionActivity, "sequence">[] = [];
  for (const [key, facts] of Object.entries(record.phases)) {
    const sessions = facts.sessionIds.map(id => readSessionRecord(stateDirectory, key, id)).filter((s): s is SessionRecord => !!s);
    const first = sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    const audit = record.completionAudits?.activities.find(a => auditKey(a) === key);
    if (audit) observed.push({ activityId: audit.activityId, kind: audit.kind, key, createdAt: audit.createdAt });
    else if (first) observed.push({ activityId: first.activityId ?? first.sessionId, kind: key === "pr" ? "final_delivery" : "implementation", key, ...(key === "pr" ? {} : { phaseId: key }), createdAt: first.createdAt });
  }
  for (const audit of record.completionAudits?.activities ?? []) if (!observed.some(a => a.activityId === audit.activityId)) observed.push({ activityId: audit.activityId, key: auditKey(audit), kind: audit.kind, createdAt: audit.createdAt });
  record.activities = observed.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((a, i) => ({ ...a, sequence: i + 1 }));
  return record.activities;
}
export function observeActivity(record: PrdRecord, stateDirectory: string, key: string, kind: ExecutionActivity["kind"], at: string, id: string = randomUUID()): ExecutionActivity {
  const history = activityHistory(record, stateDirectory);
  const prior = history.findLast(a => a.key === key);
  if (prior) return prior;
  const activity: ExecutionActivity = { activityId: id, sequence: Math.max(0, ...history.map(a => a.sequence)) + 1, kind, key, ...(kind === "implementation" ? { phaseId: key } : {}), createdAt: at };
  history.push(activity); return activity;
}
/** Reused by every completion entry point and again after repository finalization. */
export async function auditNext(context: AdmissionContext): Promise<AuditKind | "continue_test" | "final_delivery"> {
  const state = context.record.completionAudits;
  if (!state) throw new AuditRefusal("missing_evidence", "Completion audit policy is missing; reopen with a compatible Kiln.");
  if (state.policy === "legacy_complete" && context.record.completedAt) return "final_delivery";
  const delivery = state.activities.findLast(a => a.kind === "delivery_audit");
  if (!delivery) return "delivery_audit";
  const accepted = acceptedAudit(context.stateDirectory, delivery);
  if (!accepted || accepted.report.outcome !== "passed" || !context.record.phases[auditKey(delivery)]?.doneAt) return "delivery_audit";
  if (!(await auditCurrentness(context, delivery)).deliveryCurrent) return "delivery_audit";
  const tests = state.activities.findLast(a => a.kind === "test_audit");
  if (!tests || tests.sequence < delivery.sequence) return "test_audit";
  const testAccepted = acceptedAudit(context.stateDirectory, tests);
  if (!testAccepted || !context.record.phases[auditKey(tests)]?.doneAt) return "test_audit";
  const current = await auditCurrentness(context, tests);
  if (!current.deliveryCurrent) return "delivery_audit";
  if (!current.testsCurrent) return "test_audit";
  if (testAccepted.report.outcome === "continue_test") return "continue_test";
  return testAccepted.report.outcome === "passed" ? "final_delivery" : "test_audit";
}
/** Discover enabled skills at the launch directory; ambiguity is a visible refusal. */
export async function resolveAuditSkill(options: { kind: AuditKind; agent: string; claude: string; codex?: string; cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal }): Promise<AuditActivity["skill"]> {
  const name = options.kind === "delivery_audit" ? "delivery-audit" : "test-audit";
  let paths: string[] = [];
  if (options.agent === "codex") {
    const metadata = await readCodexMetadata({ executable: options.codex, cwd: options.cwd, cwds: [options.cwd], env: options.env, signal: options.signal });
    if (metadata.blockers.length) throw new Error(metadata.blockers.join("\n"));
    paths = (metadata.skills[0]?.entries ?? []).filter(s => s.enabled && [name, `enso-method:${name}`].includes(s.name)).map(s => s.path);
  } else {
    const enabled = await readSkillList({ claude: options.claude, cwd: options.cwd, env: options.env, signal: options.signal });
    if (!enabled.ok) throw new Error(enabled.error);
    const names = enabled.skills.filter(s => [name, `enso-method:${name}`].includes(s));
    if (names.length !== 1) throw new Error(`Enable exactly one ${name} skill in ${options.cwd}.`);
    const config = claudeConfigFolder(options.env);
    if (names[0] === name) {
      for (let root = options.cwd;; root = dirname(root)) {
        const candidate = join(root, ".claude", "skills", name, "SKILL.md");
        if (existsSync(candidate)) { paths.push(candidate); break; }
        if (dirname(root) === root) break;
      }
      if (!paths.length && existsSync(join(config, "skills", name, "SKILL.md"))) paths.push(join(config, "skills", name, "SKILL.md"));
    } else {
      const registry = JSON.parse(readFileSync(join(config, "plugins", "installed_plugins.json"), "utf8")) as { plugins: Record<string, { installPath: string; projectPath?: string }[]> };
      for (const [key, entries] of Object.entries(registry.plugins)) if (key.startsWith("enso-method@")) for (const entry of entries) {
        if (entry.projectPath) { const from = relative(entry.projectPath, options.cwd); if (isAbsolute(from) || from === ".." || from.startsWith(`..${sep}`)) continue; }
        paths.push(join(entry.installPath, "skills", name, "SKILL.md"));
      }
    }
  }
  paths = [...new Set(paths.map(p => realpathSync(p)))];
  if (paths.length !== 1) throw new Error(`Cannot resolve one enabled installed ${name} source in ${options.cwd}; found ${paths.length}.`);
  return { name, path: paths[0]!, digest: hashBytes(readFileSync(paths[0]!)) };
}
