/**
 * What `kiln status` shows of a finished run (Kiln Deliver When Audit Loops Run Out AC-LEFT-02,
 * AC-BOT-02): each kind's loops used against its limit in force, **For you** with each line word for
 * word and any Waived tag after it, each pull request's address, and the offer to continue when the
 * finished page's check found new phases. The JSON carries the same objects the page reads; the text
 * prints the loop line, then **For you** (first when it lists a critical finding), then the offer.
 *
 *   deliveredFacts(view.delivered, record)
 *   // { loops: { delivery: { used: 4, limit: 4 }, … }, forYou: { items: [{ id, kind, words, line, … }], afterDelivery: [] }, pullRequests: [{ repository, number, url }] }
 */
import { repositoryDetails } from "../engine/plan-repositories.js";
import { auditLabel } from "../audit/workflow.js";
import { waivedTagText } from "../audit/for-you.js";
import { closingAuditsText, type ClosingAudits } from "../state/audit-loops.js";
import { PR_PHASE_KEY, type PrdRecord } from "../state/records.js";
import { isPreflightKey } from "../state/activity-keys.js";
import { PREFLIGHT_TITLE } from "../engine/preflight.js";
import type { CompletedPlanCheck } from "../engine/completed-plan-discovery.js";
import type { Snapshot } from "../engine/snapshot.js";
import { projectRef } from "./waiver-facts.js";

/** "Final delivery", "Delivery audit", "Phase 3": the activity a Waived tag names. */
function activityName(record: Pick<PrdRecord, "completionAudits">, key: string): string {
  const audit = record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
  return key === PR_PHASE_KEY ? "Final delivery" : audit ? auditLabel(audit.kind) : isPreflightKey(key) ? PREFLIGHT_TITLE : `Phase ${key}`;
}

/** A finished run's facts in `kiln status` JSON. */
export function deliveredFacts(delivered: NonNullable<Snapshot["delivered"]>, record: Pick<PrdRecord, "completionAudits"> & Partial<Pick<PrdRecord, "repository" | "repositories" | "plan">>): Record<string, unknown> {
  // Each pull request's repository stays its name and gains its label (find repositories anywhere "kiln status --json").
  const details = record.repository && record.repositories ? repositoryDetails({ repository: record.repository, repositories: record.repositories, ...(record.plan ? { plan: record.plan } : {}) }) : [];
  return {
    loops: delivered.loops,
    forYou: {
      items: delivered.forYou.items.map(item => ({
        id: item.id, kind: item.kind, words: item.words, line: item.line, problem: item.problem, action: item.action, waits_on: item.waitsOn ?? null, criterion: item.criterion ?? null,
        ...(item.waiver ? { waived: projectRef(item.waiver), waived_tag: waivedTagText(item.waiver, activityName(record, item.waiver.activityKey)) } : {}),
      })),
      afterDelivery: delivered.forYou.afterDelivery,
    },
    pullRequests: delivered.pullRequests.map(pull => ({ ...pull, label: details.find(detail => detail.name === pull.repository)?.label ?? pull.repository })),
  };
}

/** The finished page's check and offer as `kiln status` shows them (AC-BOT-02), with the latest check's status and time. */
export function continuationFacts(check: CompletedPlanCheck): Record<string, unknown> {
  const proposal = check.result?.proposal;
  return {
    check: { status: check.status, attemptedAt: check.attemptedAt, lastSuccessfulAt: check.lastSuccessfulAt ?? null, errors: check.errors },
    ...(proposal ? { proposal: { id: proposal.id, readiness: proposal.readiness, phases: proposal.added.map(phase => ({ id: phase.id, title: phase.title })), problems: proposal.problems } } : {}),
  };
}

interface DeliveredJson { loops: ClosingAudits; forYou: { items: { kind: string | null; line: string; waived_tag?: string }[]; afterDelivery: string[] }; pullRequests: { repository: string; label?: string; number: number; url: string }[] }

/** `kiln status` text for a finished run: the loop line and each pull request, with **For you** first when it lists a critical finding. */
export function deliveredText(delivered: DeliveredJson | null | undefined, multiRepository: boolean): string | undefined {
  if (!delivered) return undefined;
  const loops = `Closing audits: ${closingAuditsText(delivered.loops)}`;
  const pulls = delivered.pullRequests.map(pull => `Pull request${multiRepository ? ` (${pull.label ?? pull.repository})` : ""}: ${pull.url}`);
  const lines = [...delivered.forYou.items.map(item => `  - ${item.line}${item.waived_tag ? ` (Waived: ${item.waived_tag})` : ""}`), ...delivered.forYou.afterDelivery.map(action => `  - ${action}`)];
  const forYou = lines.length ? ["For you:", ...lines].join("\n") : undefined;
  const critical = delivered.forYou.items.some(item => item.kind === "critical_next_step" || item.kind === "critical");
  return (critical ? [forYou, loops, ...pulls] : [loops, ...pulls, forYou]).filter(Boolean).join("\n");
}

interface ContinuationJson { check: { status: string; attemptedAt?: string; lastSuccessfulAt: string | null; errors: string[] }; proposal?: { id: string; readiness: string; phases: { id: string; title: string }[]; problems: string[] } }

/** `kiln status` text for the finished page's check for new phases and its offer to continue. */
export function continuationText(continuation: ContinuationJson | null | undefined): string | undefined {
  if (!continuation) return undefined;
  const { check, proposal } = continuation;
  const lines = [`Check for new phases: ${check.status}${check.attemptedAt ? ` at ${check.attemptedAt}` : ""}`];
  for (const error of check.errors) lines.push(`  ${error}`);
  if (proposal) {
    lines.push(`Continue with ${proposal.phases.length} ${proposal.phases.length === 1 ? "phase" : "phases"} (${proposal.readiness}), proposal ${proposal.id}:`);
    for (const phase of proposal.phases) lines.push(`  - Phase ${phase.id}: ${phase.title}`);
    for (const problem of proposal.problems) lines.push(`  Problem: ${problem}`);
  }
  return lines.join("\n");
}
