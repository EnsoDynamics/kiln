// The usage-limit screens rendered to HTML for the cases no mockup draws (usage-limit recovery,
// technical design "Screens"): the countdown and its day form, no reset time and a reset that has
// passed, the account card before a reading, signed out and with no percent, Needs you after a
// refused automatic resume and with no Resume, the pull-request session's wait, Full session
// output and the Disconnected view of a wait, and the new setting beside keep-awake. The drawn
// cases are checked in a real browser (src/server/view-in-browser.integration.test.ts).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { LimitView, Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, needsYouUsageLimitSnapshot, pausedSnapshot, runningSnapshot, USAGE_LIMIT_NOW, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import Paused from "./Paused.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import Running from "./Running.svelte";
import Waiting from "./Waiting.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const MINUTE = 60_000;
const waitingPage = (snapshot: Snapshot, now = USAGE_LIMIT_NOW) => strip(render(Waiting, { props: { snapshot, now } }).body);
const needsYouPage = (snapshot: Snapshot, now = USAGE_LIMIT_NOW) => strip(render(NeedsYou, { props: { snapshot, now } }).body);
const buttonNamed = (page: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`, "s").exec(page)?.[0];

/** The waiting sample with its limit changed; a key set to undefined is dropped. */
function waitingWith(change: Partial<LimitView>, phase: Partial<NonNullable<Snapshot["waiting"]>> = {}): Snapshot {
  const snapshot = waitingSnapshot();
  const limit: LimitView = { ...snapshot.waiting!.limit, ...change };
  for (const key of Object.keys(change) as (keyof LimitView)[]) if (change[key] === undefined) delete limit[key];
  snapshot.waiting = { ...snapshot.waiting!, ...phase, limit };
  return snapshot;
}

/** The usage-limit Needs you sample with its stop changed; a key set to undefined is dropped. */
function limitStop(change: Partial<NonNullable<Snapshot["needsYou"]>>, limit: Partial<NonNullable<NonNullable<Snapshot["needsYou"]>["limit"]>> = {}): Snapshot {
  const snapshot = needsYouUsageLimitSnapshot();
  const stop = { ...snapshot.needsYou!, ...change, limit: { ...snapshot.needsYou!.limit!, ...limit } };
  for (const key of Object.keys(change) as (keyof typeof stop)[]) if (change[key] === undefined) delete stop[key];
  for (const key of Object.keys(limit) as (keyof typeof stop.limit)[]) if (limit[key] === undefined) delete stop.limit[key];
  snapshot.needsYou = stop;
  return snapshot;
}

describe("the waiting screen's limit and reset (AC-LIMIT-01, AC-LIMIT-04)", () => {
  it("says which limit it waits for, counts down to the reset, and names the account and its percent", () => {
    const page = waitingPage(waitingSnapshot());
    const words = text(page);
    expect(words).toContain("Customer returns Waiting for usage Phase 2b · Store credit · Waiting since 2:28 PM");
    expect(words).toContain(
      "Phase 2b is waiting for the 5-hour usage limit to reset. Claude Code reported that the account’s 5-hour usage limit was used up. Resets at 3:40 PM, in 1h 12m. Kiln resumes this session by itself at the first reading that shows usage left: after the reset, or sooner if you sign in to another account.",
    );
    // The label stands alone only as the limit's name, in the account card; the reading's fractional reset rounds to the minute.
    expect(words).toContain("Signed in now alex@acme-shop.dev · Max plan 5-hour window 100% As of Kiln’s latest reading, 2:28 PM. Kiln reads again every 5 minutes and after the reset buffer. Resume now This account’s 5-hour usage limit is at 100% until 3:40 PM.");
    for (const absent of ["Check again", "claude --resume", "Pause", "Phase plan", "Claude account alex@acme-shop.dev"]) expect(words).not.toContain(absent);
  });

  it("recomputes the countdown from the reset time as the clock moves", () => {
    expect(text(waitingPage(waitingSnapshot(), USAGE_LIMIT_NOW + 30 * MINUTE))).toContain("Resets at 3:40 PM, in 42m.");
  });

  it("gives the weekday and a countdown in days for a reset on a later day", () => {
    const words = text(waitingPage(waitingWith({ label: "Weekly", resetsAt: "2026-10-19T22:40:00Z", account: { email: "alex@acme-shop.dev", plan: "Max plan", percent: 100, at: "2026-10-17T18:28:00Z", atLimitUntil: "2026-10-19T22:40:00Z" } })));
    expect(words).toContain("Phase 2b is waiting for the weekly usage limit to reset. Claude Code reported that the account’s weekly usage limit was used up. Resets Mon 6:40 PM, in 2d 4h.");
    expect(words).toContain("Weekly 100%");
    expect(words).toContain("This account’s weekly usage limit is at 100% until Mon 6:40 PM.");
  });

  it("names a model's weekly limit, and a limit with no label, in their sentence forms", () => {
    expect(text(waitingPage(waitingWith({ label: "Weekly · Fable" })))).toContain("Phase 2b is waiting for the weekly Fable usage limit to reset. Claude Code reported that the account’s weekly Fable usage limit was used up.");
    const unknown = text(waitingPage(waitingWith({ label: "A usage limit", account: { email: "alex@acme-shop.dev", plan: "Max plan", at: "2026-10-17T18:28:00Z" } })));
    expect(unknown).toContain("Phase 2b is waiting for a usage limit to reset. Claude Code reported that a usage limit on the account was used up.");
  });

  it("has no reset line with no reset time, and says Kiln resumes at the first reading that shows usage left", () => {
    const words = text(waitingPage(waitingWith({ resetsAt: undefined })));
    expect(words).toContain("Claude Code reported that the account’s 5-hour usage limit was used up. Kiln resumes this session by itself at the first reading that shows usage left. exit 1");
    expect(words).not.toContain("Resets");
    expect(words).toContain("Kiln reads again every 5 minutes. Resume now");
  });

  it("says when the reset passed, with no countdown, and names another limit still at 100%", () => {
    const passed = { resetPassed: true, account: { email: "alex@acme-shop.dev", plan: "Max plan", percent: 100, at: "2026-10-17T19:46:00Z" } };
    const now = Date.parse("2026-10-17T19:47:00Z");
    const alone = text(waitingPage(waitingWith(passed), now));
    expect(alone).toContain("Claude Code reported that the account’s 5-hour usage limit was used up. Reset at 3:40 PM. Kiln resumes this session by itself at the first reading that shows usage left. exit 1");
    expect(alone).toContain("As of Kiln’s latest reading, 3:46 PM. Kiln reads again every 5 minutes. Resume now");
    expect(alone).not.toContain("in 0m");
    const blocked = text(waitingPage(waitingWith({ ...passed, blockingLimit: { label: "Weekly", resetsAt: "2026-10-21T12:00:00Z" } }), now));
    expect(blocked).toContain("Reset at 3:40 PM. Kiln resumes this session by itself at the first reading that shows usage left. The weekly usage limit is at 100% until Wed 8:00 AM. exit 1");
    const noReset = text(waitingPage(waitingWith({ ...passed, blockingLimit: { label: "Weekly · Fable" } }), now));
    expect(noReset).toContain("The weekly Fable usage limit is at 100%. exit 1");
  });

  it("treats a reset the view's clock has reached as passed, before Kiln says so", () => {
    expect(text(waitingPage(waitingSnapshot(), Date.parse("2026-10-17T19:41:00Z")))).toContain("Reset at 3:40 PM. Kiln resumes this session by itself at the first reading that shows usage left.");
  });

  it("names the pull-request session as what waits, under v1's pull-request title", () => {
    const snapshot = waitingWith({}, { phaseId: "pr" });
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "waiting", finishedByPerson: false });
    const words = text(waitingPage(snapshot));
    expect(words).toContain("Waiting for usage PR · Final pull request · Waiting since 2:28 PM Will resume automatically in 1h 13m");
    expect(words).toContain("The pull-request session is waiting for the 5-hour usage limit to reset.");
    expect(words).toContain("Kiln checks GitHub first, then picks up the same session.");
  });
});

describe("the account card on both screens (AC-LIMIT-03)", () => {
  it("says Kiln is reading the account before a reading taken after the refusal, with no amber line", () => {
    const words = text(waitingPage(waitingWith({ account: undefined })));
    expect(words).toContain("Signed in now Reading the signed-in account… Kiln reads again every 5 minutes and after the reset buffer. Resume now");
    expect(words).not.toContain("is at 100% until");
    expect(text(needsYouPage(limitStop({}, { account: undefined })))).toContain("Signed in now Reading the signed-in account… Switch accounts and this changes within 5 minutes.");
  });

  it("shows v1's line in place of the account when the reading couldn't read one, with no percent", () => {
    const words = text(waitingPage(waitingWith({ account: { error: "Not signed in to Claude Code. Run `claude auth login`.", at: "2026-10-17T18:28:00Z" } })));
    expect(words).toContain("Signed in now Not signed in to Claude Code. Run claude auth login . As of Kiln’s latest reading, 2:28 PM.");
    expect(words).not.toContain("5-hour window");
    expect(words).not.toContain("is at 100% until");
  });

  it("shows the account alone when the reading has no row for the limit", () => {
    const words = text(waitingPage(waitingWith({ account: { email: "sam@acme-shop.dev", plan: "Pro plan", at: "2026-10-17T18:28:00Z" } })));
    expect(words).toContain("Signed in now sam@acme-shop.dev · Pro plan As of Kiln’s latest reading");
    expect(words).not.toContain("5-hour window");
  });

  it("draws the percent in the text color below 100%, and never holds Resume now or Resume for the amber line", () => {
    const page = waitingPage(waitingWith({ account: { email: "sam@acme-shop.dev", plan: "Pro plan", percent: 12, at: "2026-10-17T18:28:00Z" } }));
    expect(page).toMatch(/<span class="percent[^"]*">5-hour window 12%<\/span>/);
    expect(page).not.toMatch(/class="percent[^"]* full/);
    expect(buttonNamed(waitingPage(waitingSnapshot()), "Resume now")).not.toContain("disabled");
    // Nor Resume on a usage-limit Needs you, beside the same amber line (AC-LIMIT-03).
    const stopped = needsYouPage(needsYouUsageLimitSnapshot());
    expect(text(stopped)).toContain("This account’s 5-hour usage limit is at 100% until 3:40 PM.");
    expect(buttonNamed(stopped, "Resume")).toBeDefined();
    expect(buttonNamed(stopped, "Resume")).not.toContain("disabled");
  });

  it("drops the amber line once the view's clock reaches the reset, before the next reading", () => {
    const before = Date.parse("2026-10-17T19:39:00Z");
    const after = Date.parse("2026-10-17T19:40:00Z");
    expect(text(waitingPage(waitingSnapshot(), before))).toContain("This account’s 5-hour usage limit is at 100% until 3:40 PM.");
    expect(text(needsYouPage(needsYouUsageLimitSnapshot(), before))).toContain("This account’s 5-hour usage limit is at 100% until 3:40 PM.");
    expect(text(waitingPage(waitingSnapshot(), after))).not.toContain("is at 100% until");
    expect(text(needsYouPage(needsYouUsageLimitSnapshot(), after))).not.toContain("is at 100% until");
    // The percent the reading took stays as read, until the next one.
    expect(text(needsYouPage(needsYouUsageLimitSnapshot(), after))).toContain("5-hour window 100%");
  });

  it("holds Resume now while a resume or check is under way (AC-RESUME-02)", () => {
    const snapshot = waitingSnapshot();
    snapshot.waiting!.checking = true;
    expect(buttonNamed(waitingPage(snapshot), "Resume now")).toContain("disabled");
  });
});

describe("Needs you after a usage limit (AC-LIMIT-01 to 03, AC-AUTO-05)", () => {
  it("says Kiln resumed by itself and the limit refused it again, under the heading", () => {
    const words = text(needsYouPage(limitStop({}, { refusedAgainAt: "2026-10-17T19:41:00Z", resetPassed: true }), Date.parse("2026-10-17T19:45:00Z")));
    expect(words).toContain("Phase 2b stopped at the 5-hour usage limit. Kiln resumed by itself at 3:41 PM and the limit refused it again. Claude Code reported that this account’s 5-hour usage limit is used up. Reset at 3:40 PM.");
    expect(words).toContain("1 Wait for the reset The 5-hour usage limit reset at 3:40 PM; press Resume.");
  });

  it("waits for the limit to reset with no reset time", () => {
    const words = text(needsYouPage(limitStop({}, { resetsAt: undefined })));
    expect(words).toContain("Claude Code reported that this account’s 5-hour usage limit is used up. exit 1");
    expect(words).toContain("1 Wait for the reset Wait for the 5-hour usage limit to reset, then press Resume. 2 Or switch to another Claude account now");
  });

  it("keeps the limit and the account with no Resume, and waits for the reset or another account in step 1's fresh session", () => {
    const words = text(needsYouPage(limitStop({ resumeOffered: false, resumeCommand: undefined })));
    expect(words).toContain("Phase 2b stopped at the 5-hour usage limit. Claude Code reported that this account’s 5-hour usage limit is used up. Resets at 3:40 PM, in 1h 12m.");
    expect(words).toContain(
      "Pick it up yourself 1 Start a fresh Claude Code session in the worktree Start it after the reset, or after switching accounts. claude auth login Copy command To fill in the other account’s email, add it: claude auth login --email <address>",
    );
    expect(words).toContain("Signed in now alex@acme-shop.dev · Max plan 5-hour window 100% Usage updated 1 min ago. Switch accounts and this changes within 5 minutes. This account’s 5-hour usage limit is at 100% until 3:40 PM.");
    for (const absent of ["Two ways to carry on", "Resume", "Close the session first"]) expect(words).not.toContain(absent);
  });

  it("names the pull-request session as what stopped", () => {
    const snapshot = limitStop({ phaseId: "pr", kind: "pull_request_check", checks: [{ name: "Pull request open", passed: false, facts: ["No open pull request from feature/customer-returns into develop"] }] });
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "needs_you", finishedByPerson: false });
    const page = needsYouPage(snapshot);
    expect(text(page)).toContain("The pull-request session stopped at the 5-hour usage limit.");
    expect(page).toContain('placeholder="Give instructions, answer its question, or ask what you need to know before it continues."');
  });
});

describe("a wait on the other screens", () => {
  it("serves the waiting phase's route as Full session output, back to the waiting screen, its pill styled as Paused (technical design, Screens)", () => {
    const page = strip(render(PhaseDetail, { props: { snapshot: waitingSnapshot(), phaseId: "2b", connected: true, now: USAGE_LIMIT_NOW, lastSeenAt: USAGE_LIMIT_NOW } }).body);
    const words = text(page);
    expect(words).toContain("Waiting for usage 2b Store credit Waiting for usage Phase 2b of 5 · Claude Code · Started 10:58 AM · 3h 30m");
    expect(page).toMatch(/<span class="pill strong-outline[^"]*">/);
    expect(words).not.toContain("LIVE");
    expect(words).not.toContain("Pause after this phase");
    expect(words).toContain("Commits None for this phase.");
  });

  it("shows a waiting phase as last known once the view has lost Kiln, as for Implementing (AC-LIMIT-04)", () => {
    const words = text(strip(render(Running, { props: { snapshot: waitingSnapshot(), connected: false, now: USAGE_LIMIT_NOW, lastSeenAt: USAGE_LIMIT_NOW } }).body));
    expect(words).toContain("Customer returns Last known: phase 2b 2 of 5 phases done Connection to Kiln lost");
    expect(words).toContain("Last-known state, observed at 2:28 PM, in phase 2b. Work may still be running. Reconnecting automatically; reconnect before acting or opening the conversation in your terminal.");
    expect(words).toContain("2b Store credit phase-2b-store-credit.md 3h 30m Last known: Waiting for usage");
    expect(words).not.toContain("Resume now");
  });
});

describe("Resume after a usage limit, beside keep-awake (AC-AUTO-04, AC-AUTO-03)", () => {
  const ROW = "Resume after a usage limit Switch off to finish the phase yourself; Needs you then shows how.";

  it("sits under keep-awake on Running and Paused, which now covers a wait too", () => {
    for (const page of [
      strip(render(Running, { props: { snapshot: runningSnapshot(), connected: true, now: USAGE_LIMIT_NOW, lastSeenAt: USAGE_LIMIT_NOW } }).body),
      strip(render(Paused, { props: { snapshot: pausedSnapshot(), connected: true, now: USAGE_LIMIT_NOW, lastSeenAt: USAGE_LIMIT_NOW } }).body),
    ]) {
      expect(text(page)).toContain(`Keep awake While a session works or Kiln waits Closing the lid can still put the computer to sleep. On ${ROW} On`);
      expect(page).toMatch(/<input type="checkbox" checked=""[^>]*aria-label="Resume after a usage limit"/);
    }
  });

  it("shows it off when it is off, and disabled in place while disconnected", () => {
    const snapshot = runningSnapshot();
    snapshot.settings.resumeAfterUsageLimit = false;
    const page = strip(render(Running, { props: { snapshot, connected: false, now: USAGE_LIMIT_NOW, lastSeenAt: USAGE_LIMIT_NOW } }).body);
    expect(text(page)).toContain(`${ROW} Off`);
    expect(page).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*aria-label="Resume after a usage limit"/);
    expect(page).not.toMatch(/<input type="checkbox" checked=""[^>]*aria-label="Resume after a usage limit"/);
  });

  it("sits under keep-awake on Documents found", () => {
    const words = text(strip(render(DocumentsFound, { props: { snapshot: documentsFoundSnapshot(), config: { token: "t", base: "/customer-returns" }, connected: true, now: USAGE_LIMIT_NOW } }).body));
    expect(words).toContain(`Kiln picks up where it left off afterwards. ${ROW} Pushes After every phase`);
  });

  it("sits under keep-awake on the waiting screen", () => {
    expect(text(waitingPage(waitingSnapshot()))).toContain(`Settings for this PRD Keep awake While a session works or Kiln waits Closing the lid can still put the computer to sleep. On ${ROW} On`);
  });
});
