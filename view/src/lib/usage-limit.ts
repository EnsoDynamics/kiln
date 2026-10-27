// What the waiting screen and a usage-limit Needs you say about the limit (usage-limit recovery
// AC-LIMIT-01 to 03; technical design, "Screens"). The label stands alone only where the limit is
// shown as a name, the account card's row; every sentence uses its sentence form, "the 5-hour
// usage limit". Every time is rounded to the nearest minute, and the countdown is worked out
// from the reset time against the view's clock, so it keeps counting while the screen is open.

import type { LimitView } from "../../../src/engine/snapshot.js";
import { limitSentence } from "../../../src/session/usage-limit.js";
import { capitalized, phaseName, PR_ID } from "./progress.js";
import { ago, countdown, limitTime } from "./time.js";

/** "at 3:40 PM" today, or "Wed 8:00 AM" and "yesterday 3:40 PM" on another day, after a verb. */
function atTime(iso: string, now: Date): string {
  const time = limitTime(iso, now);
  return /^\d/.test(time) ? `at ${time}` : time;
}

/** Whether the limit's reset has passed: Kiln says so, or the view's clock has reached it since. */
export function resetHasPassed(limit: LimitView, now: Date): boolean {
  return limit.resetPassed || (limit.resetsAt !== undefined && now.getTime() >= Date.parse(limit.resetsAt));
}

/**
 * The reset line: "Resets at 3:40 PM, in 1h 12m", "Resets Wed 8:00 AM, in 2d 4h", or once it has
 * passed "Reset at 3:40 PM", with no countdown; none with no reset time (AC-LIMIT-01).
 */
export function resetLine(limit: LimitView, now: Date): string | undefined {
  if (limit.resetsAt === undefined) return undefined;
  if (resetHasPassed(limit, now)) return `Reset ${atTime(limit.resetsAt, now)}`;
  return `Resets ${atTime(limit.resetsAt, now)}, in ${countdown(limit.resetsAt, now)}`;
}

/** "the account’s 5-hour usage limit", or "a usage limit on the account" for a limit with no label. */
function owned(label: string, owner: "the account" | "this account"): string {
  const sentence = limitSentence(label);
  return sentence.startsWith("the ") ? `${owner}’s ${sentence.slice("the ".length)}` : `${sentence} on ${owner}`;
}

/**
 * "This account’s 5-hour usage limit is at 100% until 3:40 PM.", while the reading shows it at 100%
 * and the view's clock hasn't reached that time, so the line goes when the reset passes (AC-LIMIT-03).
 */
export function atLimitLine(limit: LimitView, now: Date): string | undefined {
  const until = limit.account?.atLimitUntil;
  if (until === undefined || now.getTime() >= Date.parse(until)) return undefined;
  return `${capitalized(owned(limit.label, "this account"))} is at 100% until ${limitTime(until, now)}.`;
}

/** "Phase 2b", or "The pull-request session". */
function sessionName(phaseId: string): string {
  return phaseId.startsWith("audit-") ? "This audit" : phaseId === PR_ID ? "The pull-request session" : capitalized(phaseName(phaseId));
}

export interface WaitingCopy {
  headline: string;
  /** What Claude Code reported. */
  reported: string;
  /** The reset line, drawn bold, with its full stop. */
  reset?: string;
  /** That Kiln resumes by itself, and any other limit that keeps the account at 100% once the reset has passed. */
  resumes: string;
  /** The account card's last line. */
  footnote: string;
}

/** Authentication and optional allowance reads have independent dates. */
function codexUsageObservation(limit: LimitView, now: Date): string {
  const observation = limit.allowancesObservation;
  if (!observation?.observedAt || observation.state === "unavailable") return "Usage observation unavailable. ";
  return `${observation.state === "stale" ? "Stale usage last updated" : "Usage last updated"} ${limitTime(observation.observedAt, now)}. `;
}

/** The waiting screen's words (AC-LIMIT-01, AC-LIMIT-02, AC-LIMIT-04). */
export function waitingCopy(phaseId: string, limit: LimitView, now: Date, agent = "Claude Code"): WaitingCopy {
  if (limit.agentId === "codex") return {
    headline: `${sessionName(phaseId)} is waiting for Codex usage permission.`,
    reported: "Codex reported an exhausted allowance. No applicable reset was reported.",
    resumes: limit.recovery?.reason ?? "Kiln checks fresh Codex permission before one attempt with the original model and effort.",
    footnote: `${codexUsageObservation(limit, now)}These are account allowances, not usage solely from this PRD. Kiln reads again every 5 minutes and on waking.`,
  };
  const reset = resetLine(limit, now);
  const passed = resetHasPassed(limit, now);
  const toCome = limit.resetsAt !== undefined && !passed;
  const blocking = passed ? limit.blockingLimit : undefined;
  const others = blocking === undefined ? "" : ` ${capitalized(limitSentence(blocking.label))} is at 100%${blocking.resetsAt === undefined ? "" : ` until ${limitTime(blocking.resetsAt, now)}`}.`;
  return {
    headline: `${sessionName(phaseId)} is waiting for ${limitSentence(limit.label)} to reset.`,
    reported: `${agent} reported that ${owned(limit.label, "the account")} was used up.`,
    ...(reset === undefined ? {} : { reset: `${reset}.` }),
    resumes: `Kiln resumes this session by itself at the first reading that shows usage left${toCome ? ": after the reset, or sooner if you sign in to another account" : ""}.${others}`,
    footnote: `${limit.account ? `As of Kiln’s latest reading, ${limitTime(limit.account.at, now)}. ` : ""}Kiln reads again every 5 minutes${toCome ? " and at the reset" : ""}.`,
  };
}

export interface LimitStopCopy {
  headline: string;
  reported: string;
  reset?: string;
  /** "Kiln resumed by itself at 3:41 PM and the limit refused it again." (AC-AUTO-05). */
  refusedAgain?: string;
  /** Step 1, waiting for the reset. */
  waitText: string;
  /** The account card's last line. */
  footnote: string;
}

/** A usage-limit Needs you's words (AC-LIMIT-01 to 03, AC-AUTO-05); without Resume the account card says nothing of it. */
export function limitStopCopy(phaseId: string, limit: LimitView & { refusedAgainAt?: string }, resumeOffered: boolean, now: Date, agent = "Claude Code"): LimitStopCopy {
  if (limit.agentId === "codex") return {
    headline: `${sessionName(phaseId)} stopped at a Codex usage limit.`,
    reported: limit.recovery?.reason ?? "Codex reported an exhausted allowance. Automatic usage recovery is off or a recovery check failed.",
    waitText: "Check usage in Codex, then press Resume when ready. No applicable reset was reported.",
    footnote: `${codexUsageObservation(limit, now)}These are account allowances, not usage solely from this PRD. Sign in with codex login in a terminal to change accounts. Close the session first if you opened it in a terminal.`,
  };
  const reset = resetLine(limit, now);
  const sentence = limitSentence(limit.label);
  let waitText = `Wait for ${sentence} to reset, then press Resume.`;
  if (limit.resetsAt !== undefined) {
    waitText = resetHasPassed(limit, now)
      ? `${capitalized(sentence)} reset ${atTime(limit.resetsAt, now)}; press Resume.`
      : `${capitalized(sentence)} resets ${atTime(limit.resetsAt, now)}, in ${countdown(limit.resetsAt, now)}. Come back after that and press Resume.`;
  }
  return {
    headline: `${sessionName(phaseId)} stopped at ${sentence}.`,
    reported: `${agent} reported that ${owned(limit.label, "this account")} is used up.`,
    ...(reset === undefined ? {} : { reset: `${reset}.` }),
    ...(limit.refusedAgainAt === undefined ? {} : { refusedAgain: `Kiln resumed by itself ${atTime(limit.refusedAgainAt, now)} and the limit refused it again.` }),
    waitText,
    footnote: `${limit.account ? `Usage updated ${ago(limit.account.at, now)}. ` : ""}Switch accounts and this changes within 5 minutes.${resumeOffered ? " Close the session first if you opened it in a terminal." : ""}`,
  };
}
