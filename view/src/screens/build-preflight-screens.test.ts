// The build preflight on the screens (Kiln Build Preflight PRD, Phase 1; mockup states 1, 2, 3 and 5):
// the planned and finished Preflight rows, the preflight stop page, and a running preflight's
// missing live controls. The engine's facts behind them are proved in build-preflight.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, needsYouMessageSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import Running from "./Running.svelte";
import { headerState } from "../lib/progress.js";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const KEY = "preflight-7c41e2d0";
const config = { base: "/customer-returns/", token: "t", page: "documents" } as never;

function preflightRow(change: Partial<PhaseView> = {}): PhaseView {
  return { id: KEY, activityId: "7c41e2d0", kind: "preflight", title: "Preflight", file: "", state: "done", finishedByPerson: false, sessionStartedAt: "2026-10-17T14:52:00Z", doneAt: "2026-10-17T14:55:00Z", preflight: { outcome: "ready", found: "Nothing to settle" }, details: { from: "2026-10-17T14:52:00Z", to: "2026-10-17T14:55:00Z", model: "Opus 5.5", effort: "high", worktree: "~/devel/.worktrees/customer-returns", branch: "feature/customer-returns", sessionId: "7c41e2d0-5b9a-4f3e-a1c8-0e6d2b9f4a17" }, ...change };
}
function runningWith(row: PhaseView): Snapshot {
  const snapshot = runningSnapshot();
  snapshot.activities = [row, ...snapshot.phases];
  return snapshot;
}
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);

describe("the Preflight row (AC-PREFLIGHT-08, AC-PREFLIGHT-02, AC-PREFLIGHT-06)", () => {
  it("a clean preflight's row shows PF, Ready, how long it took and Nothing to settle, with no file line", () => {
    const page = running(runningWith(preflightRow()));
    const row = text(page.slice(page.indexOf(`data-phase="${KEY}"`), page.indexOf('data-phase="1"')));
    expect(row).toContain("PF");
    expect(row).toContain("Preflight");
    expect(row).toContain("Ready");
    expect(row).toContain("3m");
    expect(row).toContain("Found Nothing to settle");
    expect(row).not.toContain("Done");
    expect(page.slice(page.indexOf(`data-phase="${KEY}"`), page.indexOf('data-phase="1"'))).not.toContain('class="file mono');
  });

  it("a preflight with no report warns No report, says it ended without a report, and one that launched nothing says why and is not a link", () => {
    const warned = running(runningWith(preflightRow({ preflight: { outcome: "no_report", found: "Ended without a report" } })));
    const row = warned.slice(warned.indexOf(`data-phase="${KEY}"`), warned.indexOf('data-phase="1"'));
    expect(text(row)).toContain("No report");
    expect(text(row)).toContain("Found Ended without a report");
    expect(row).toContain("amber-outline");
    const unresolved = running(runningWith(preflightRow({ preflight: { outcome: "no_report", found: "Ended without a report", reason: "Enable exactly one build-preflight skill in ~/devel/shop." } , details: undefined, sessionStartedAt: undefined })));
    const why = unresolved.slice(unresolved.indexOf(`data-phase="${KEY}"`), unresolved.indexOf('data-phase="1"'));
    expect(text(why)).toContain("Why Enable exactly one build-preflight skill in ~/devel/shop.");
    expect(why).not.toContain("phase-link");
  });

  it("a preflight marked complete reads Complete with its waived count", () => {
    const page = running(runningWith(preflightRow({ preflight: { outcome: "items" }, waivedChecks: 1, finishedByPerson: true })));
    const row = text(page.slice(page.indexOf(`data-phase="${KEY}"`), page.indexOf('data-phase="1"')));
    expect(row).toContain("Complete");
    expect(row).toContain("1 check waived");
  });

  it("a planned row sits above the activity it comes before on the run's plan and on Documents found", () => {
    const paused = runningWith(preflightRow());
    paused.activities = paused.phases;
    paused.preflight = { planned: { before: "3" } };
    const page = running(paused);
    expect(page.indexOf("preflight-planned")).toBeGreaterThan(page.indexOf('data-phase="2b"'));
    expect(page.indexOf("preflight-planned")).toBeLessThan(page.indexOf('data-phase="3"'));
    const documents = documentsFoundSnapshot({ preflight: { planned: { before: "1" } } });
    const found = text(strip(render(DocumentsFound, { props: { snapshot: documents, config, connected: true } }).body));
    expect(found).toContain("PF Preflight checks access and stops, then goes straight on 1 Return intake");
    const closed = documentsFoundSnapshot({ preflight: { planned: { before: "end" } } });
    const last = text(strip(render(DocumentsFound, { props: { snapshot: closed, config, connected: true } }).body));
    expect(last.indexOf("PF Preflight")).toBeGreaterThan(last.indexOf("4 Restock check-in"));
  });
});

describe("a running preflight (AC-PREFLIGHT-08)", () => {
  it("names the preflight in the header and offers neither live controls nor a pause, saying why", () => {
    const snapshot = runningWith(preflightRow({ state: "implementing", doneAt: undefined, preflight: {} }));
    snapshot.feature.currentPhaseId = KEY;
    snapshot.current = { ...snapshot.current!, phaseId: KEY };
    expect(headerState(snapshot, true, new Date(RUNNING_NOW)).label).toBe("Running preflight");
    const page = text(running(snapshot));
    // The card names it in full, with PF in its circle, never the activity key or a phase's build steps.
    const card = page.slice(page.indexOf("Now checking"), page.indexOf("Details"));
    expect(card).toContain("Now checking Preflight check");
    expect(text(running(snapshot))).not.toContain("Now implementing");
    expect(page).not.toContain(KEY);
    expect(page).toContain("PF");
    expect(page).not.toMatch(/Deliverable review|Test hardening|Refactor pass/);
    expect(page).toContain("Live messages, terminal takeover and a pause are unavailable during the preflight.");
    expect(page).not.toContain("When should Kiln pause?");
    const detail = text(strip(render(PhaseDetail, { props: { snapshot, phaseId: KEY, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));
    expect(detail).toContain("Live messages, terminal takeover and a pause are unavailable during the preflight.");
    expect(detail).not.toContain("Pause & take over");
    expect(detail).toContain("Checking");
    expect(detail).toContain("Preflight check");
    expect(detail).not.toMatch(/Deliverable review|Test hardening|Refactor pass/);
  });
});

describe("the preflight stop (AC-PREFLIGHT-03, mockup state 2)", () => {
  function preflightStop(resumable = true): Snapshot {
    const snapshot = needsYouMessageSnapshot();
    snapshot.activities = [preflightRow({ state: "needs_you", doneAt: undefined, preflight: { outcome: "items" } }), ...snapshot.phases];
    snapshot.feature.currentPhaseId = KEY;
    const stop = snapshot.needsYou!;
    snapshot.needsYou = {
      ...stop, phaseId: KEY, kind: "preflight", resumeOffered: false,
      checks: [{ name: "Preflight", passed: false, facts: ["one", "two"], reason: true }],
      ...(resumable ? { resumeCommand: "cd ~/devel/shop/.worktrees/customer-returns && claude --resume 7c41e2d0-5b9a-4f3e-a1c8-0e6d2b9f4a17" } : { resumeCommand: undefined }),
      preflight: {
        headline: "Preflight: 2 items need you",
        items: ["The cloud sign-in for the development account expires in 8 hours. Run `aws sso login --profile app-dev-longlived`", "The repository's instructions say to ask before spending past the limit, and phase 4 will pass it. Nothing in the requirements authorizes that."],
        nextActivity: { kind: "phase", key: "1", title: "Phase 1 · Return intake" },
        line: "Nothing has been built. Settle these and check again, and Kiln starts Phase 1.",
      },
      markComplete: { offered: true, label: "Mark complete", heading: "", continueInOrder: false, checkRunId: "run-1", items: [], failingChecks: 1, nextActivity: { kind: "phase", key: "1", title: "Phase 1 · Return intake" }, resultingLabel: "Complete · 1 check waived", noReport: false, sentence: ["Check Preflight again runs a fresh preflight. Mark complete starts Phase 1 with the items as they are, and the Preflight row shows it was marked complete."] },
    };
    return snapshot;
  }

  it("shows the headline, the numbered items with inline code, the terminal command, then the two controls and the sentence", () => {
    const page = strip(render(NeedsYou, { props: { snapshot: preflightStop(), now: RUNNING_NOW } }).body);
    const words = text(page);
    expect(words).toContain("Preflight: 2 items need you");
    expect(words).toContain("Nothing has been built. Settle these and check again, and Kiln starts Phase 1.");
    expect(words).toContain("1. The cloud sign-in for the development account expires in 8 hours.");
    expect(page).toContain('<span class="code-inline">aws sso login --profile app-dev-longlived</span>');
    expect(words).toContain("Open the preflight session in a terminal to work through an item with it:");
    expect(words).toContain("claude --resume 7c41e2d0-5b9a-4f3e-a1c8-0e6d2b9f4a17");
    expect(words).toContain("When you're done there, press Check Preflight again.");
    expect(words.indexOf("Check Preflight again runs")).toBeGreaterThan(words.indexOf("Mark complete"));
    expect(words).toMatch(/Check Preflight again\s+Mark complete/);
    expect(words).toContain("Mark complete starts Phase 1 with the items as they are, and the Preflight row shows it was marked complete.");
    // No reply field, no check rows, no stop lines and no pick-it-up card.
    expect(page).not.toContain("<textarea");
    expect(words).not.toContain("Pick it up yourself");
    expect(words).not.toContain("Why Kiln stopped");
    expect(words).not.toContain("Copy a prompt for a fresh session");
    expect(words).not.toContain("The build will stop");
    expect(headerState(preflightStop(), true, new Date(RUNNING_NOW)).facts[0]).toBe("Preflight · Preflight");
  });

  it("leaves out the terminal block when the session cannot be reopened", () => {
    const words = text(strip(render(NeedsYou, { props: { snapshot: preflightStop(false), now: RUNNING_NOW } }).body));
    expect(words).not.toContain("Open the preflight session in a terminal");
    expect(words).toContain("Check Preflight again");
  });
});
