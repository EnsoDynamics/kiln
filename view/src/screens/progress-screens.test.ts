// The progress screens rendered to HTML for the cases no mockup draws: the Needs you stops of
// UI-007, the pull-request session (AC-PR-05), Paused before the pull request (technical design,
// "Paused before the pull request"), and the Needs you stop seen while disconnected (UI-006).
// The drawn cases are checked in a real browser (src/server/view-in-browser.integration.test.ts).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { completeSnapshot, needsYouMessageSnapshot, pausedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import NeedsYou from "./NeedsYou.svelte";
import Paused from "./Paused.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const running = (snapshot: Snapshot, connected = true) => strip(render(Running, { props: { snapshot, connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);

function stopped(change: Partial<NonNullable<Snapshot["needsYou"]>>, drop: (keyof NonNullable<Snapshot["needsYou"]>)[] = []): Snapshot {
  const snapshot = needsYouMessageSnapshot();
  const stop = { ...snapshot.needsYou!, ...change };
  for (const key of drop) delete stop[key];
  snapshot.needsYou = stop;
  return snapshot;
}

describe("Needs you, for the stops nobody drew (UI-007)", () => {
  it("offers a fresh session in step 1, with no resume command, facts row or link, when the session can't be resumed (item 2, AC-KEEP-05)", () => {
    const page = needsYou(
      stopped({ kind: "not_resumable", stoppedAt: "2026-10-17T15:30:00Z", lastLines: [{ line: 9, at: "2026-10-17T15:29:58Z", source: "claude", text: "Writing the store-credit tests." }] }, ["finalMessage", "exitCode", "lastSkill", "resumeCommand"]),
    );
    const words = text(page);
    expect(words).toContain("Phase 2b ended before it was done. Kiln was interrupted at 11:30 AM while this session was working, and couldn’t resume it. These are the last lines it wrote.");
    expect(words).toContain("11:29:58 claude Writing the store-credit tests.");
    expect(words).toContain("1 Start a fresh Claude Code session in the worktree cd ~/devel/acme-shop-kiln/customer-returns claude Use the implement-from-requirements skill");
    expect(words).toContain("Copy prompt Points the new session at phase-2b-store-credit.md.");
    expect(words).toContain("2 Finish the phase with Claude, the way you normally would");
    expect(words).not.toContain("claude --resume");
    expect(words).not.toContain("exit 0");
    expect(words).not.toContain("Session can’t be opened?");
  });

  it("shows only the plan problem, the fresh-session link and Check again at a broken plan (item 3)", () => {
    const page = needsYou(
      stopped({ kind: "plan", phaseId: "3", checks: [{ name: "Phase plan reads", passed: false, fact: "phase-2-refund-routing.md lists 2c, which has no file" }] }, [
        "finalMessage",
        "exitCode",
        "lastSkill",
        "lastLines",
        "resumeCommand",
        "outputLineCount",
        "sessionEndedAt",
        "steps",
        "sessionId",
        "model",
        "effort",
        "sessionStartedAt",
        "commits",
      ]),
    );
    const words = text(page);
    expect(words).toContain("Phase 3 hasn’t started. Kiln read the phase plan and found the problem shown on the right. Pick it up yourself 1 Fix the phase plan Kiln only checks that the plan reads");
    expect(words).toContain("2 Come back and check again Kiln reads the plan again. If it reads, Kiln starts phase 3, or pauses first if you pressed Pause. Session can’t be opened? Copy a prompt for a fresh session instead");
    expect(words).toContain("Kiln continues when Phase plan reads Not yet phase-2-refund-routing.md lists 2c, which has no file Check again");
    for (const absent of ["Last message from Claude Code", "Full session output", "exit ", "last skill seen", "claude --resume"]) expect(words).not.toContain(absent);
  });

  it("shows the spawn error with its code, and the fresh session in step 1, when claude never started (item 4)", () => {
    const page = needsYou(
      stopped({ spawnError: { code: "ENOENT", message: "spawn claude ENOENT" }, lastLines: [{ line: 1, at: "2026-10-17T15:52:00Z", source: "stderr", text: "Couldn't start claude in /home/person/devel/acme-shop-kiln/customer-returns: spawn claude ENOENT" }] }, ["finalMessage", "exitCode", "lastSkill", "resumeCommand"]),
    );
    const words = text(page);
    expect(words).toContain("Kiln couldn’t start this session. This is the error it got. ENOENT 11:52 AM 11:52:00 stderr Couldn't start claude in /home/person/devel/acme-shop-kiln/customer-returns: spawn claude ENOENT");
    expect(words).toContain("1 Start a fresh Claude Code session in the worktree");
    expect(words).not.toContain("last skill seen");
  });

  it("keeps the resume command when only the restart failed (item 4)", () => {
    const words = text(needsYou(stopped({ spawnError: { code: "EACCES", message: "spawn claude EACCES" } }, ["finalMessage", "exitCode"])));
    expect(words).toContain("Kiln couldn’t restart this session. These are the last lines it wrote, ending with the error it got. EACCES 11:52 AM last skill seen: deliverable-review, 8 min earlier");
    expect(words).toContain("1 Open the same Claude Code session in a terminal cd ~/devel/acme-shop-kiln/customer-returns claude --resume");
  });

  it("speaks of the pull request when the pull-request session stopped (item 1, AC-PR-05)", () => {
    const snapshot = stopped({ phaseId: "pr", kind: "pull_request_check", checks: [{ name: "Pull request open", passed: false, fact: "No open pull request from feature/customer-returns into develop" }] });
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "needs_you", finishedByPerson: false });
    const words = text(needsYou(snapshot));
    expect(words).toContain("Needs you PR · Final pull request · Stopped 11:52 AM");
    expect(words).toContain("The pull-request session ended before it was done.");
    expect(words).toContain("2 Open the pull request with Claude, the way you normally would");
    expect(words).toContain("Kiln finishes when Pull request open Not yet No open pull request from feature/customer-returns into develop");
    expect(words).toContain("This is the check Kiln runs after the pull-request session.");
  });

  it("says Checking… while Check again's check runs, in place of when it last checked", () => {
    const words = text(needsYou(stopped({ checking: true })));
    expect(words).toContain("Check again Checking…");
    expect(words).not.toContain("Checked 11:52 AM.");
  });
});

describe("Running during the pull-request session (AC-PR-05)", () => {
  it("offers no pause, shows no progress steps and names the pull request", () => {
    const snapshot = runningSnapshot();
    snapshot.current = { ...snapshot.current!, phaseId: "pr", steps: [] };
    snapshot.feature.currentPhaseId = "pr";
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "implementing", sessionStartedAt: "2026-10-17T15:40:00Z", finishedByPerson: false });
    const words = text(running(snapshot));
    expect(words).toContain("Implementing the pull request");
    expect(words).toContain("Now implementing · the pull request Final pull request");
    expect(words).toContain("Model and effort changes apply from the next phase; the pull-request session keeps what it started with.");
    expect(words).toContain("Close to the limit. Weekly");
    expect(words).toContain("Ctrl+C there interrupts the pull-request session");
    expect(words).not.toContain("Pause");
    expect(words).not.toContain("Deliverable review");
  });
});

describe("Paused before the pull request (UI-008)", () => {
  it("names the pull request as what Start begins", () => {
    const snapshot = pausedSnapshot();
    snapshot.phases = completeSnapshot().phases.map((phase) => (phase.id === "pr" ? { id: "pr", title: "Final pull request", file: "pull request session", state: "next" as const, finishedByPerson: false } : phase));
    snapshot.feature.phasesDone = 5;
    const words = text(strip(render(Paused, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));
    expect(words).toContain("Paused 5 of 5 phases done Paused after phase 4 Next: the pull request Phase 4, Restock check-in, finished with its commit and push at 2:46 PM. Nothing is running. Change the model or effort first if you want; they apply to the pull request. Start the pull request");
    expect(words).toContain("PR Final pull request pull request session Next");
  });
});

describe("a Needs you stop seen while disconnected (UI-006)", () => {
  it("uses the Disconnected progress layout: the header, the banner, the plan with the stopped phase, and the settings", () => {
    const words = text(running(needsYouMessageSnapshot(), false));
    expect(words).toContain("Customer returns Needs you Phase 2b · Store credit · Stopped 11:52 AM Kiln isn’t running");
    expect(words).toContain("This page shows what Kiln last saw, at 11:47 AM, in phase 2b. Its work is kept.");
    expect(words).toContain("2b Store credit phase-2b-store-credit.md Needs you");
    expect(words).toContain("Settings can be changed again once Kiln is running.");
    for (const absent of ["Now implementing", "Last seen ·", "Claude account", "Pause Kiln", "Check again"]) expect(words).not.toContain(absent);
  });
});
