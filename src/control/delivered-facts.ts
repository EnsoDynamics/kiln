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
import { recordedAuditName } from "../audit/audit-names.js";
import { waivedTagText } from "../audit/for-you.js";
import { closingAuditsText, type ClosingAudits } from "../state/audit-loops.js";
import { PR_PHASE_KEY, type PrdRecord } from "../state/records.js";
import { isPreflightKey, planPushKey } from "../state/activity-keys.js";
import { PREFLIGHT_TITLE } from "../engine/preflight.js";
import type { CompletedPlanCheck } from "../engine/completed-plan-discovery.js";
import { deliveryWaiting, latestPlanPush } from "../engine/delivery-reading.js";
import { formatCompletedPlanCheck } from "../underway-output.js";
import type { Snapshot } from "../engine/snapshot.js";
import { projectRef } from "./waiver-facts.js";

/** "Final delivery", "Delivery audit", "Phase 3": the activity a Waived tag names. */
function activityName(record: Pick<PrdRecord, "completionAudits" | "auditLoops" | "settings">, key: string): string {
  const audit = record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
  return key === PR_PHASE_KEY ? "Final delivery" : audit ? recordedAuditName(record, audit).title : isPreflightKey(key) ? PREFLIGHT_TITLE : `Phase ${key}`;
}

/** A finished run's facts in `kiln status` JSON. */
export function deliveredFacts(delivered: NonNullable<Snapshot["delivered"]>, record: Pick<PrdRecord, "completionAudits" | "auditLoops" | "settings"> & Partial<Pick<PrdRecord, "repository" | "repositories" | "plan">>): Record<string, unknown> {
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

/**
 * The finished page's check and offer as `kiln status` shows them (Kiln Deliver When Audit Loops Run
 * Out AC-BOT-02; Kiln After Delivery AC-BOT-02): the latest check's status and time, the pull request
 * the delivery waits on, the answer with where its phases came from, and `summary`, the terminal's
 * words for it.
 */
export function continuationFacts(check: CompletedPlanCheck, prdDirectory = ""): Record<string, unknown> {
  const result = check.status === "failed" || check.status === "checking" ? undefined : check.result;
  const proposal = result?.proposal;
  return {
    check: { status: check.status, attemptedAt: check.attemptedAt, lastSuccessfulAt: check.lastSuccessfulAt ?? null, errors: check.errors },
    summary: formatCompletedPlanCheck(check, prdDirectory),
    ...(check.awaitingMerge ? { waiting: { repository: check.awaitingMerge.repository, number: check.awaitingMerge.number, url: check.awaitingMerge.url, baseBranch: check.awaitingMerge.baseBranch, closed: check.awaitingMerge.closed } } : {}),
    ...(result ? { answer: { source: result.source, notRead: result.notRead ?? null, uncommitted: result.uncommitted, origin: result.origin ?? null, phases: result.added.map(phase => ({ id: phase.id, title: phase.title })) } } : {}),
    ...(proposal ? { proposal: { id: proposal.id, readiness: proposal.readiness, phases: proposal.added.map(phase => ({ id: phase.id, title: phase.title })), problems: proposal.problems } } : {}),
  };
}

/** What GitHub last showed of a finished run's pull requests, and whether the delivery waits to merge (Kiln After Delivery AC-BOT-02). */
export function afterDeliveryFacts(record: PrdRecord, view?: import("../engine/snapshot.js").AfterDeliveryView): Record<string, unknown> | null {
  if (!record.completedAt || !record.afterDelivery) return null;
  // A live controller's view adds the merge offer and the merge activity's state (Kiln After Delivery AC-BOT-02).
  if (view) return { ...view, readError: view.readError ?? null, merge: view.merge ?? null, planPush: view.planPush ?? null };
  const { pullRequests, readError, merge } = record.afterDelivery;
  const push = latestPlanPush(record);
  const pushKey = push ? planPushKey(push.operationId) : "";
  // The same for the latest push of the plan: past Done it is accepting until its check decides.
  const planPush = push ? { key: pushKey, state: push.closedAt ? "done" : push.doneAt ? "accepting" : record.phases[pushKey]?.stop || record.billing?.hold?.phaseKey === pushKey ? "stopped" : record.phases[pushKey]?.wait ? "waiting" : "interrupted", proposalId: push.proposalId } : null;
  // With no Kiln running nothing runs: an open merge with no stop or wait was interrupted, and the next `kiln run` holds it (Kiln After Delivery, "Ctrl+C and restart").
  return { pullRequests: pullRequests.map(({ headSha: _head, ...row }) => { void _head; return row; }), readError: readError ? { at: readError.at, problem: readError.problem } : null, waiting: deliveryWaiting(record) ?? null, merge: merge ? { state: merge.closedAt ? "done" : record.phases.merge?.stop || record.billing?.hold?.phaseKey === "merge" ? "stopped" : record.phases.merge?.wait ? "waiting" : "interrupted", ...(merge.doneAt ? { doneAt: merge.doneAt } : {}), ...(merge.summary !== undefined ? { summary: merge.summary } : {}), pullRequests: merge.pullRequests } : null, planPush };
}

interface AfterDeliveryJson { pullRequests: { repository: string; number: number; state: string; mergedAt?: string; mergeCommit?: string; conflicts?: true }[]; offer?: { kind: string; available: boolean; note?: string; line?: string; reason?: string }; merge: { state: string; summary?: string } | null; planPush?: { state: string } | null }

/** `kiln status` text for Continue's push of the plan while it is open (Kiln After Delivery AC-BOT-02). */
const PUSH_TEXT: Record<string, string> = {
  running: "Pushing the plan: the push session is running.",
  stopped: "Pushing the plan: the push session stopped before pushing the plan; it needs you.",
  interrupted: "Pushing the plan, interrupted: resume with kiln continue.",
  waiting: "Pushing the plan: the push session is waiting for usage.",
  accepting: "Pushing the plan: pushed. Kiln is checking for new phases again before it starts the build.",
};

/**
 * `kiln status` text for the merge (Kiln After Delivery AC-BOT-02), in the page's words: merging,
 * a stopped merge session, merged with each merge commit and the session's summary, or the offer.
 */
export function afterDeliveryText(after: AfterDeliveryJson | null | undefined, multiRepository: boolean): string | undefined {
  if (!after) return undefined;
  if (after.planPush && PUSH_TEXT[after.planPush.state]) return PUSH_TEXT[after.planPush.state];
  const name = (pull: { repository: string; number: number }) => `${multiRepository ? `${pull.repository} ` : ""}#${pull.number}`;
  const merged = after.pullRequests.filter(pull => pull.state === "merged");
  if (after.merge?.state === "done" || after.pullRequests.length > 0 && merged.length === after.pullRequests.length) {
    return [`Merged: ${merged.map(pull => `${name(pull)} at ${pull.mergedAt} (merge ${pull.mergeCommit?.slice(0, 7)})`).join(" · ")}`, ...(after.merge?.summary ? [`The merge session's summary: ${after.merge.summary}`] : [])].join("\n");
  }
  if (after.merge) return after.merge.state === "stopped" ? "Merging: the merge session stopped before merging; it needs you." : after.merge.state === "interrupted" ? "Merging, interrupted: resume with kiln continue." : after.merge.state === "waiting" ? "Merging: the merge session is waiting for usage." : "Merging: the merge session is running.";
  if (after.offer?.note) return `Merge with the agent${after.offer.available ? "" : ` (unavailable: ${after.offer.reason})`}: ${after.offer.note} Run kiln merge to start it.`;
  if (after.offer?.line) return after.offer.line;
  return undefined;
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

interface ContinuationJson { check: { status: string; attemptedAt?: string; lastSuccessfulAt: string | null; errors: string[] }; summary?: string; proposal?: { id: string; readiness: string; phases: { id: string; title: string }[]; problems: string[] } }

/** `kiln status` text for the finished page's check for new phases: the terminal's words for its answer, then the offer to continue. */
export function continuationText(continuation: ContinuationJson | null | undefined): string | undefined {
  if (!continuation) return undefined;
  const { check, proposal } = continuation;
  const lines = [`Check for new phases: ${check.status}${check.attemptedAt ? ` at ${check.attemptedAt}` : ""}`];
  if (continuation.summary) lines.push(`  ${continuation.summary}`);
  else for (const error of check.errors) lines.push(`  ${error}`);
  if (proposal?.phases.length) {
    lines.push(`Continue with ${proposal.phases.length} ${proposal.phases.length === 1 ? "phase" : "phases"} (${proposal.readiness}), proposal ${proposal.id}:`);
    for (const phase of proposal.phases) lines.push(`  - Phase ${phase.id}: ${phase.title}`);
    for (const problem of proposal.problems) lines.push(`  Problem: ${problem}`);
  }
  return lines.join("\n");
}
