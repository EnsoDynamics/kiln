// The progress screens rendered to HTML for the cases no mockup draws: the Needs you stops of
// UI-007, the pull-request session (AC-PR-05), Paused before the pull request (technical design,
// "Paused before the pull request"), the Needs you stop seen while disconnected (UI-006), and
// the screens the multi-repo delivery change alters without drawing (multi-repo AC-SHOW-01).
// The drawn cases are checked in a real browser (src/server/view-in-browser.integration.test.ts).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { stepStates } from "../../../src/session/session-output.js";
import {
  completeRepositoriesSnapshot,
  completeSnapshot,
  documentsFoundSnapshot,
  needsYouCrashedSnapshot,
  needsYouMessageSnapshot,
  needsYouRepositoriesSnapshot,
  pausedSnapshot,
  RUNNING_NOW,
  runningRepositoriesSnapshot,
  runningSnapshot,
} from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import Paused from "./Paused.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
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
      stopped({ kind: "not_resumable", resumeOffered: false, stoppedAt: "2026-10-17T15:30:00Z", lastLines: [{ line: 9, at: "2026-10-17T15:29:58Z", source: "claude", text: "Writing the store-credit tests." }] }, ["finalMessage", "exitCode", "lastSkill", "resumeCommand"]),
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
      stopped({ kind: "plan", resumeOffered: false, phaseId: "3", checks: [{ name: "Phase plan reads", passed: false, facts: ["phase-2-refund-routing.md lists 2c, which has no file"] }] }, [
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
        "repositories",
      ]),
    );
    const words = text(page);
    expect(words).toContain("Phase 3 hasn’t started. Kiln read the phase plan and found the problem shown on the right. Pick it up yourself 1 Fix the phase plan Kiln only checks that the plan reads");
    expect(words).toContain("2 Come back and check again Kiln reads the plan again. If it reads, Kiln starts phase 3, or pauses first if you pressed Pause. Session can’t be opened? Copy a prompt for a fresh session instead");
    expect(words).toContain("Kiln continues when Phase plan reads Not yet phase-2-refund-routing.md lists 2c, which has no file Check again");
    for (const absent of ["Last message from Claude Code", "Full session output", "exit ", "last skill seen", "claude --resume", "Reply and continue in Kiln"]) expect(words).not.toContain(absent);
  });

  it("shows the spawn error with its code, and the fresh session in step 1, when claude never started (item 4)", () => {
    const page = needsYou(
      stopped({ spawnError: { code: "ENOENT", message: "spawn claude ENOENT" }, resumeOffered: false, lastLines: [{ line: 1, at: "2026-10-17T15:52:00Z", source: "stderr", text: "Couldn't start claude in /home/person/devel/acme-shop-kiln/customer-returns: spawn claude ENOENT" }] }, ["finalMessage", "exitCode", "lastSkill", "resumeCommand"]),
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
    const snapshot = stopped({ phaseId: "pr", kind: "pull_request_check", checks: [{ name: "Pull request open", passed: false, facts: ["No open pull request from feature/customer-returns into develop"] }] });
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

describe("Resume on Needs you (usage-limit recovery AC-RESUME-01 to 03)", () => {
  const resumeButton = (page: string) => /<button[^>]*>(?:(?!<\/button>).)*Resume<\/button>/s.exec(page)?.[0];
  const checkAgainButton = (page: string) => /<button[^>]*>(?:(?!<\/button>).)*Check again<\/button>/s.exec(page)?.[0];

  it("offers Resume and its optional note above the steps, which become the other way", () => {
    const page = needsYou(stopped({}));
    expect(text(page)).toContain(
      "Let Kiln carry on Reply and continue in Kiln Kiln checks Git first. If the phase isn’t done, it picks up the same session, with its full history, and sends your reply before continuing with Phase 2b. Then the plan continues as usual. Your reply to Claude Optional Your reply goes to the same Claude session, with its full history. It continues unattended unless your reply calls for an answer before proceeding or it needs a material decision. For a longer conversation, open the session in your terminal below. Kiln checks completion first; if the work is already done, it continues without sending your reply. Resume Uses whichever Claude account is signed in now. Close the session first if you opened it in a terminal. Or pick it up yourself 1 Open the same Claude Code session",
    );
    expect(page).toContain('placeholder="Give instructions, answer its question, or ask what you need to know before it continues."');
    expect(resumeButton(page)).not.toContain("disabled");
  });

  it("says Kiln couldn't resume the session when the person pressed Resume, never that it was interrupted (AC-RESUME-04, AC-STOP-04)", () => {
    const words = text(needsYou(stopped({ kind: "not_resumable", resumeOffered: false, pressedResume: true, stoppedAt: "2026-10-17T15:30:00Z" }, ["finalMessage", "exitCode", "lastSkill", "resumeCommand"])));
    expect(words).toContain("Phase 2b ended before it was done. Kiln couldn’t resume this session when you pressed Resume. It had stopped at 11:30 AM. These are the last lines it wrote.");
    expect(words).not.toContain("interrupted");
    expect(words).toContain("1 Start a fresh Claude Code session in the worktree");
  });

  it("offers no Resume where Kiln can't pick the session up, and keeps the steps as v1's", () => {
    const words = text(needsYou(stopped({ resumeOffered: false })));
    expect(words).not.toContain("Reply and continue in Kiln");
    expect(words).toContain("Pick it up yourself 1 Open the same Claude Code session");
    expect(words).not.toContain("Or pick it up yourself");
  });

  it("holds Resume and Check again while a check or a resume is under way (AC-RESUME-02)", () => {
    const page = needsYou(stopped({ checking: true }));
    expect(resumeButton(page)).toContain("disabled");
    expect(checkAgainButton(page)).toContain("disabled");
  });

  it("tells the pull-request session to carry on opening the pull request, or the pull requests (technical design, Screens)", () => {
    const snapshot = stopped({ phaseId: "pr", kind: "pull_request_check", checks: [{ name: "Pull request open", passed: false, facts: ["No open pull request from feature/customer-returns into develop"] }] });
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "needs_you", finishedByPerson: false });
    const page = needsYou(snapshot);
    expect(text(page)).toContain(
      "Reply and continue in Kiln Kiln checks delivery first, including whether the work is already merged. If delivery is incomplete, it picks up the same session, with its full history, and sends your reply before continuing to open the pull request. Your reply to Claude",
    );
    expect(page).toContain('placeholder="Give instructions, answer its question, or ask what you need to know before it continues."');
    snapshot.feature.multiRepository = true;
    expect(text(needsYou(snapshot))).toContain("If delivery is incomplete, it picks up the same session, with its full history, and sends your reply before continuing to open the remaining pull requests.");
  });
});

describe("Running during the pull-request session (AC-PR-05)", () => {
  it("offers no pause, shows no progress steps and names the pull request", () => {
    const snapshot = runningSnapshot();
    // The six unreached steps the engine sends for the pull-request session: the view is what hides them.
    snapshot.current = { ...snapshot.current!, phaseId: "pr", steps: stepStates([]) };
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

describe("Needs you says nothing of its own about why (AC-STOP-04, AC-STOP-02)", () => {
  const section = (page: string, pattern: RegExp) => text(pattern.exec(page)![0]);
  it.each([
    [
      "a session that ended with a final message",
      needsYouMessageSnapshot,
      "Phase 2b ended before it was done. Kiln doesn’t try to interpret why. This is how the session ended. exit 0 11:52 AM last skill seen: deliverable-review, 8 min earlier Last message from Claude Code Critical finding, stopping to surface: the reviewer found that develop has since added its own migration 0042 (gift cards), so this branch’s 0042_store_credits clashes with it. The store-credit tests pass here, but the migration won’t apply once this branch meets develop. Recommendation: rebase feature/customer-returns on develop and renumber this migration to 0043. Nothing for 2b is committed yet. Full session output · 612 lines",
      "Kiln continues when Phase doc closed Not yet No Closed line in phase-2b-store-credit.md Everything committed Not yet 12 files changed, not committed Pushed Yes Matches origin at 5d81b37 Check again Checked 11:52 AM. This is the same check Kiln runs after every phase. Later phases wait until it passes.",
    ],
    [
      "a session that crashed with no final message",
      needsYouCrashedSnapshot,
      "Phase 3 ended before it was done. The session exited with an error and no final message. These are the last lines it wrote. exit 1 1:21 PM last skill seen: test-hardening, 6 min earlier 13:20:51 claude Running the dashboard Playwright suite. It needs the dev server on 5173; starting it. 13:20:52 tool Bash npm run dev & 13:20:55 stderr Error: listen EADDRINUSE: address already in use :::5173 13:21:03 exit Process exited with code 1 Full session output · 2,031 lines",
      "Kiln continues when Phase doc closed Not yet No Closed line in phase-3-returns-dashboard.md Everything committed Yes Latest commit a41c9e2, tree clean Pushed Not yet a41c9e2 isn’t on origin yet Check again Checked 1:21 PM. This is the same check Kiln runs after every phase. Later phases wait until it passes.",
    ],
  ])("shows %s with only fixed statements, the recorded facts and the session's own words, whole", (_name, make, ended, side) => {
    const page = needsYou(make());
    expect(section(page, /<section class="card ended[\s\S]*?<\/section>/)).toBe(ended);
    expect(section(page, /<aside[\s\S]*?<\/aside>/)).toBe(side);
  });
});

describe("the disconnected view on every screen (AC-VIEW-07)", () => {
  const lastSeenAt = RUNNING_NOW - 5 * 60_000;
  const banner = "Kiln isn’t running Nothing is being worked on. This page shows what Kiln last saw, at 11:42 AM.";
  const pickUp = "To pick up where it left off, run this in a terminal: kiln run docs/prds/customer-returns/";
  const kilnPanel = "Kiln Disconnected The terminal running Kiln was closed or stopped. Controls come back when Kiln is running again.";

  it("says plainly on Paused and Complete that nothing is running, how to pick up, and shows Kiln as disconnected", () => {
    for (const words of [
      text(strip(render(Paused, { props: { snapshot: pausedSnapshot(), connected: false, now: RUNNING_NOW, lastSeenAt } }).body)),
      text(strip(render(Complete, { props: { snapshot: completeSnapshot(), connected: false, now: RUNNING_NOW, lastSeenAt } }).body)),
    ]) {
      expect(words).toContain(`${banner} Its work is kept. ${pickUp}`);
      expect(words).toContain(kilnPanel);
      expect(words).not.toContain("Kiln Connected");
    }
  });

  it("says so on Documents found too, without claiming any work is kept, since none has started", () => {
    const words = text(strip(render(DocumentsFound, { props: { snapshot: documentsFoundSnapshot(), config: { token: "t", base: "/customer-returns" }, connected: false, now: RUNNING_NOW, lastSeenAt } }).body));
    expect(words).toContain(`${banner} ${pickUp}`);
    expect(words).not.toContain("Its work is kept.");
  });
});

describe("the Complete screen (AC-PR-04)", () => {
  it("counts a pull request of 100 commits or more as 100+, as gh's list stops there", () => {
    const snapshot = completeSnapshot();
    snapshot.pullRequests = [{ ...snapshot.pullRequests![0]!, commits: 100 }];
    const words = text(strip(render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));
    expect(words).toContain("100+ commits · +2,184 −312");
  });
});

describe("Phase detail", () => {
  const detail = (snapshot: Snapshot) => text(strip(render(PhaseDetail, { props: { snapshot, phaseId: snapshot.current!.phaseId, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));

  it("says, while a pause is pending, that Kiln pauses once this phase is done and Keep going cancels it (AC-VIEW-03, UI-002)", () => {
    const snapshot = runningSnapshot();
    snapshot.pause = { pending: true, active: false };
    expect(detail(snapshot)).toContain("Keep going Kiln pauses once phase 2b is done, including its commit and push. Keep going cancels the pause.");
  });

  it("labels the repository and the PRD folder above the feature name (AC-LOOK-05)", () => {
    expect(detail(runningSnapshot())).toMatch(/^Repository acme-shop PRD folder docs\/prds\/customer-returns\/ Customer returns /);
  });

  it("offers no pause and shows no progress steps during the pull-request session (AC-PR-05)", () => {
    const snapshot = runningSnapshot();
    // The six unreached steps the engine sends for the pull-request session: the view is what hides them.
    snapshot.current = { ...snapshot.current!, phaseId: "pr", steps: stepStates([]) };
    snapshot.feature.currentPhaseId = "pr";
    snapshot.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "implementing", sessionStartedAt: "2026-10-17T15:40:00Z", finishedByPerson: false });
    const words = detail(snapshot);
    expect(words).toContain("Final pull request");
    for (const absent of ["Pause", "Deliverable review", "Test hardening", "Refactor pass"]) expect(words, absent).not.toContain(absent);
  });
});

describe("Running's current-phase panel and phase plan (AC-WATCH-03, AC-WATCH-01)", () => {
  it("puts the current phase above the phase plan, with its own Details, collapsed", () => {
    const page = running(runningSnapshot());
    const now = /<section class="now[\s\S]*?<\/section>/.exec(page)![0];
    expect(page.indexOf('<section class="now')).toBeLessThan(page.indexOf('<section class="plan'));
    expect(now).toMatch(/<details(?![^>]*\bopen\b)[^>]*>/);
    const words = text(now);
    for (const row of ["Model Opus 5.5 · high effort", "Worktree ~/devel/acme-shop-kiln/customer-returns", "Branch feature/customer-returns", "Commits None yet for this phase", "Session 7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04"]) expect(words).toContain(row);
  });

  it("stops an interrupted phase's time when the view lost Kiln, however long ago that was", () => {
    const lostAt = RUNNING_NOW;
    const later = (minutes: number) => text(strip(render(Running, { props: { snapshot: runningSnapshot(), connected: false, now: RUNNING_NOW + minutes * 60_000, lastSeenAt: lostAt } }).body));
    expect(later(0)).toContain("2b Store credit phase-2b-store-credit.md 49m Interrupted");
    expect(later(90)).toContain("2b Store credit phase-2b-store-credit.md 49m Interrupted");
  });
});

describe("the progress screens across repositories (multi-repo AC-PRS-03, AC-PRS-04, AC-SPACE-05, AC-SHOW-01)", () => {
  const complete = (snapshot: Snapshot) => text(strip(render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));

  it("lists every pull request on Complete with its repository, branches, size and link, and the workspace kept", () => {
    const page = strip(render(Complete, { props: { snapshot: completeRepositoriesSnapshot(), connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
    const words = text(page);
    expect(words).toContain("4 pull requests · feature/customer-returns One in each repository that changed product #12 PRD’s repository Customer returns: phase documents feature/customer-returns → main · 5 commits · +5 −0 Open on GitHub");
    expect(words).toContain("returns-api #57 Customer returns: intake, refunds, store credit and restock feature/customer-returns → develop · 9 commits · +1,402 −201 Open on GitHub");
    expect(words).toContain("notifications #9 added in phase 2b Customer returns: store credit emails");
    expect(words).toContain("PR Final pull request pull request session 9m Opened 4 pull requests");
    expect(words).toContain("Workspace folder ~/devel/acme/.worktrees/ customer-returns/ 4 repositories, one added in phase 2b Kiln keeps the folder and its worktrees until you remove them.");
    expect(words).toContain("Every phase is done. Ctrl+C in the terminal closes Kiln; the pull requests and workspace stay.");
    expect(page).toMatch(/href="https:\/\/github\.com\/acme\/storefront\/pull\/218"/);
    for (const absent of ["Worktree", "Pull request #"]) expect(words).not.toContain(absent);
  });

  it("shows a Done phase's repositories in place of its pushed commit, and its commits by repository in its Details", () => {
    const words = complete(completeRepositoriesSnapshot());
    expect(words).toContain("2b Store credit phase-2b-store-credit.md 1h 19m · finished by you · pushed to 4 repositories Done Details Ran 10:58 AM to 12:17 PM Model Opus 5.5 · high effort Commits 6 in 4 repositories product ~/devel/acme/.worktrees/customer-returns/product feature/customer-returns · 1 commit · latest e07a4c8");
    expect(words).toContain("notifications added in phase 2b ~/devel/acme/.worktrees/customer-returns/notifications feature/customer-returns · 2 commits · latest 2b6f1d3 Session 7c1e9f2a");
  });

  it("lists the workspace folder and each repository's base, fixed, in Running's settings, and groups the current phase's commits by repository", () => {
    const page = running(runningRepositoriesSnapshot());
    const words = text(page);
    expect(words).toContain(
      "Workspace folder ~/devel/acme/.worktrees/ customer-returns/ 4 repositories, one added in phase 2b Feature branch feature/customer-returns Repositories Branch from, and PR into product PRD’s repository main returns-api develop storefront develop notifications added in phase 2b main The same for every phase Workspace folder, feature branch, and one PR in each repository into its base, set before the first phase.",
    );
    // What Kiln may do in each repository, those added later included (multi-repo AC-PRS-04).
    expect(words).toContain(
      "In each repository Kiln commits and pushes to the feature branch, and opens one pull request into that repository’s base once every phase closes, added repositories included. It never merges, deploys, or touches other branches.",
    );
    const now = text(/<section class="now[\s\S]*?<\/section>/.exec(page)![0]);
    expect(now).toContain("Model Opus 5.5 · high effort Commits 3 in 2 repositories returns-api 7f3d9a0 feat(credit): store credit ledger (phase 2b) 4c1a8e5 test(credit): ledger balances notifications added in phase 2b 2b6f1d3 feat(emails): store credit issued email (phase 2b) Session");
    expect(now).not.toContain("Worktree");
    expect(words).toContain("1 Return intake phase-1-return-intake.md 52m · pushed to 2 repositories Done");
  });

  it("keeps the panel's empty Commits line while no repository has a commit", () => {
    const snapshot = runningRepositoriesSnapshot();
    snapshot.current!.repositories = [];
    expect(text(/<section class="now[\s\S]*?<\/section>/.exec(running(snapshot))![0])).toContain("Commits None yet for this phase Session");
  });

  it("groups Phase detail's commits by repository, each with its added-in-phase label", () => {
    const snapshot = runningRepositoriesSnapshot();
    const words = text(strip(render(PhaseDetail, { props: { snapshot, phaseId: "2b", connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body));
    expect(words).toContain("Commits returns-api 7f3d9a0 feat(credit): store credit ledger (phase 2b) 4c1a8e5 test(credit): ledger balances notifications added in phase 2b 2b6f1d3 feat(emails): store credit issued email (phase 2b)");
  });

  it("shows each check's facts one per line on Needs you, each naming its repository (multi-repo AC-CHECK-02)", () => {
    const page = needsYou(needsYouRepositoriesSnapshot());
    expect(page).toMatch(/Pushed<span class="verdict[^"]*">Not yet<\/span><\/span><span class="fact[^"]*">product: 2f7b9e0 on origin<\/span><span class="fact[^"]*">storefront: 8d4a1c6 isn’t on origin yet<\/span>/);
    expect(text(page)).toContain("Everything committed Not yet storefront: 3 files changed, not committed");
  });

  it("starts a fresh session in the workspace, not the worktree", () => {
    const snapshot = needsYouRepositoriesSnapshot();
    snapshot.needsYou = { ...snapshot.needsYou!, kind: "not_resumable" };
    delete snapshot.needsYou.resumeCommand;
    expect(text(needsYou(snapshot))).toContain("1 Start a fresh Claude Code session in the workspace");
  });
});


describe("resumed progress and time", () => {
  it("keeps Push as observed history and puts the spinner on Follow-up, with overnight waiting separate", () => {
    const snapshot = runningSnapshot();
    snapshot.current!.followUp = true;
    snapshot.current!.steps = [{ name: "Push", state: "observed", startedAt: "2026-10-17T15:00:00Z" }];
    snapshot.phases.find(row => row.id === snapshot.current!.phaseId)!.timing = { runningMs: 111 * 60_000, waitingMs: 532 * 60_000, asOf: new Date(RUNNING_NOW).toISOString(), advancing: "running" };
    const html = running(snapshot);
    expect(text(html)).toContain("1h 51m running · 8h 52m waiting");
    expect(text(html)).toContain("Push· observed Follow-up");
    expect(html).toMatch(/class="observed[^>]*>Push/);
    expect(html).toMatch(/class="current[^>]*>.*?Follow-up/s);
    const stoppedClock = strip(render(Running, { props: { snapshot, connected: false, now: RUNNING_NOW + 30 * 60_000, lastSeenAt: RUNNING_NOW } }).body);
    expect(text(stoppedClock)).toContain("1h 51m running · 8h 52m waiting");
    expect(text(stoppedClock)).not.toContain("2h 21m running");
    const disconnectedDetail = strip(render(PhaseDetail, { props: { snapshot, phaseId: "2b", connected: false, now: RUNNING_NOW + 30 * 60_000, lastSeenAt: RUNNING_NOW } }).body);
    expect(text(disconnectedDetail)).toContain("1h 51m running · 8h 52m waiting");
    expect(text(disconnectedDetail)).not.toContain("2h 21m running");
  });
});


describe("truthful completion after prior integration", () => {
  it.each([false, true])("shows merged evidence without inventing a PR, mixed=%s", mixed => {
    const snapshot = mixed ? completeRepositoriesSnapshot() : completeSnapshot();
    snapshot.pullRequests = mixed ? snapshot.pullRequests!.slice(0, 1) : [];
    snapshot.mergedBranches = [{ repository: "pricing", head: "feature/customer-returns", base: "develop", featureCommit: "a".repeat(40), baseCommit: "b".repeat(40), url: "https://github.com/acme/pricing/commit/" + "a".repeat(40) }];
    const page = strip(render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
    const words = text(page);
    expect(words).toContain("Already merged into develop");
    expect(words).toContain("pricing"); expect(words).toContain("aaaaaaa");
    expect(page).toContain(snapshot.mergedBranches[0]!.url);
    if (mixed) { expect(words).toContain("some work already merged"); expect(words).toContain("Human review is next"); }
    else { expect(words).not.toContain("Human review is next"); expect(words).not.toContain("PR ready for review"); expect(words).not.toContain("Pull request #"); }
  });
});
