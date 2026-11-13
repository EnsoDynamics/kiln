// What the progress screens say, from the snapshot (PRD AC-WATCH-01, AC-WATCH-02, AC-PR-05,
// AC-STOP-02, AC-STOP-03; assumptions UI-007).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { completeRepositoriesSnapshot, completeSnapshot, needsYouCrashedSnapshot, needsYouMessageSnapshot, pausedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { commitsAcross, detailRows, endingFact, folderShown, headerState, modelAndEffort, needsYouCopy, openedLabel, pausedAfter, phaseOfTotal, repositoriesLine, repositoryCommitsLine, rowFacts, rowPill, rowState, settingsModel } from "./progress.js";

const now = new Date(RUNNING_NOW);
type NeedsYou = NonNullable<Snapshot["needsYou"]>;
const without = (stop: NeedsYou, ...keys: (keyof NeedsYou)[]): NeedsYou => {
  const copy = { ...stop };
  for (const key of keys) delete copy[key];
  return copy;
};

describe("the header", () => {
  it("says where the PRD stands, with how many phases are done (AC-WATCH-02)", () => {
    expect(headerState(runningSnapshot(), true, now)).toEqual({ kind: "implementing", label: "Implementing phase 2b", facts: ["2 of 5 phases done"] });
    expect(headerState(pausedSnapshot(), true, now)).toEqual({ kind: "paused", label: "Paused", facts: ["2 of 5 phases done"] });
    expect(headerState(needsYouMessageSnapshot(), true, now)).toEqual({ kind: "needs_you", label: "Needs you", facts: ["Phase 2b · Store credit", "Stopped 11:52 AM"] });
    expect(headerState(completeSnapshot(), true, now)).toEqual({ kind: "complete", label: "PR ready for review", facts: ["5 of 5 phases done", "Finished 2:55 PM"], totals: { running: "5h 37m", waiting: "1m", since: "9:17 AM to 2:55 PM" } });
  });

  describe("the PRD total line (time totals AC-TOTAL-01 to 03)", () => {
    const asOf = new Date(RUNNING_NOW).toISOString();
    const later = new Date(RUNNING_NOW + 5 * 60_000);

    it("gives the whole PRD's running and waiting time and when it started, advancing the running counter while a session works", () => {
      const snapshot = runningSnapshot();
      snapshot.feature.timing = { runningMs: 100 * 60_000, waitingMs: 30 * 60_000, asOf, advancing: "running" };
      expect(headerState(snapshot, true, later)).toEqual({ kind: "implementing", label: "Implementing phase 2b", facts: ["2 of 5 phases done"], totals: { running: "1h 45m", waiting: "30m", since: "since 9:17 AM" } });
    });

    it.each([["paused", pausedSnapshot], ["needs you", needsYouMessageSnapshot]] as const)("advances the waiting counter while %s", (_, make) => {
      const snapshot = make();
      snapshot.feature.timing = { runningMs: 100 * 60_000, waitingMs: 30 * 60_000, asOf, advancing: "waiting" };
      expect(headerState(snapshot, true, later).totals).toEqual({ running: "1h 40m", waiting: "35m", since: "since 9:17 AM" });
    });

    it("dates a start on an earlier day", () => {
      const snapshot = runningSnapshot();
      snapshot.feature.startedAt = "2026-10-14T13:02:00Z";
      snapshot.feature.timing = { runningMs: 0, waitingMs: 0, asOf, advancing: "waiting" };
      expect(headerState(snapshot, true, now).totals?.since).toBe("since Wed 9:02 AM");
    });

    it("gives Complete's fixed totals with the span they cover, off the state row", () => {
      const snapshot = completeSnapshot();
      snapshot.feature.timing = { runningMs: 280 * 60_000, waitingMs: 58 * 60_000, asOf: snapshot.feature.completedAt! };
      const state = headerState(snapshot, true, later);
      expect(state.facts).toEqual(["5 of 5 phases done", "Finished 2:55 PM"]);
      expect(state.totals).toEqual({ running: "4h 40m", waiting: "58m", since: "9:17 AM to 2:55 PM" });
    });

    it("shows no line before anything has run, or while a folder is missing", () => {
      expect(headerState(runningSnapshot(), true, now).totals).toBeUndefined();
      const missing = runningSnapshot();
      missing.feature.timing = { runningMs: 60_000, waitingMs: 0, asOf, advancing: "waiting" };
      missing.feature.state = "folder_missing";
      expect(headerState(missing, true, now).totals).toBeUndefined();
    });
  });

  it("reads Last known: phase <n> once the view has lost Kiln, and names the pull request rather than a number (AC-PR-05)", () => {
    expect(headerState(runningSnapshot(), false, now).label).toBe("Last known: phase 2b");
    const pr = runningSnapshot();
    pr.current = { ...pr.current!, phaseId: "pr" };
    pr.feature.currentPhaseId = "pr";
    expect(headerState(pr, true, now).label).toBe("Implementing the pull request");
    expect(phaseOfTotal(pr, "pr")).toBe("the pull request");
  });

  it("names a stopped pull request as PR · Final pull request (UI-007 item 1)", () => {
    const stopped = needsYouMessageSnapshot();
    stopped.needsYou!.phaseId = "pr";
    stopped.phases.push({ id: "pr", title: "Final pull request", file: "pull request session", state: "needs_you", finishedByPerson: false });
    expect(headerState(stopped, true, now).facts[0]).toBe("PR · Final pull request");
  });
});

describe("a plan row", () => {
  it("shows a Done phase's time and pushed commit, and finished by you when the person finished it (AC-WATCH-01)", () => {
    const rows = completeSnapshot().phases;
    expect(rowFacts(rows[0]!, "done", RUNNING_NOW)).toBe("52m · pushed a1c4e09");
    expect(rowFacts(rows[3]!, "done", RUNNING_NOW)).toBe("1h 19m · finished by you · pushed 7f3a91c");
    expect(rowPill(rows.at(-1)!, "done", openedLabel(completeSnapshot()))).toBe("Opened #218");
    expect(rowFacts(rows.at(-1)!, "done", RUNNING_NOW)).toBe("9m");
  });

  it("says items an audit left for the person are waiting until a later audit accounts for them (AC-NEUTRAL-03)", () => {
    const audit = { id: "audit-1", title: "Delivery audit", file: "Round 1", kind: "delivery_audit" as const, state: "done" as const, finishedByPerson: false, sessionStartedAt: "2026-10-17T15:00:00Z", doneAt: "2026-10-17T15:09:00Z" };
    const shape = (personItems?: { count: number; waiting: boolean }) => ({ ...audit, audit: { outcome: "completion_phases", checks: [], criteria: [], repositories: [], blockers: [], pendingActions: [], ...(personItems ? { personItems } : {}) } });
    expect(rowFacts(shape({ count: 1, waiting: true }), "done", RUNNING_NOW)).toBe("9m · 1 item waiting for you");
    expect(rowFacts(shape({ count: 2, waiting: false }), "done", RUNNING_NOW)).toBe("9m · listed 2 items for you");
    expect(rowFacts(shape(), "done", RUNNING_NOW)).toBe("9m");
  });

  it("shows nothing beside a phase closed without a Kiln session, and no duration for a pull request found already open", () => {
    expect(rowFacts({ id: "1", title: "Return intake", file: "f.md", state: "done", finishedByPerson: false }, "done", RUNNING_NOW)).toBeUndefined();
    expect(rowFacts({ id: "pr", title: "Final pull request", file: "pull request session", state: "done", doneAt: "2026-10-17T18:55:00Z", finishedByPerson: false }, "done", RUNNING_NOW)).toBeUndefined();
  });

  it("times an Implementing phase from its session's start, and marks its state last known once disconnected", () => {
    const row = runningSnapshot().phases[3]!;
    expect(rowState(row, true)).toBe("implementing");
    expect(rowState(row, false)).toBe("interrupted");
    expect(rowFacts(row, "implementing", RUNNING_NOW)).toBe("49m");
    expect(rowPill(row, "interrupted", undefined)).toBe("Last known: Implementing");
    expect(rowPill(runningSnapshot().phases[1]!, "split", undefined)).toBe("Split into 2a, 2b");
  });

  it("lists Details as the mockups do: when it ran, model and effort, worktree, branch, commits and session", () => {
    expect(detailRows(runningSnapshot().phases[2]!.details!, now).map((row) => `${row.term} ${row.value}`)).toEqual([
      "Ran 10:09 to 10:57 AM",
      "Model Opus 5.5 · medium effort",
      "Worktree ~/devel/acme-shop-kiln/customer-returns",
      "Branch feature/customer-returns",
      "Commits 4 · latest 5d81b37",
      "Session 9b0e3d72-1c5a-4f6e-b8d2-3a7c6e0f9d15",
    ]);
  });

  it("says a phase that stopped before committing has no commits yet (AC-WATCH-01)", () => {
    const details = { ...runningSnapshot().phases[2]!.details!, commitCount: 0 };
    delete details.latestCommit;
    expect(detailRows(details, now).find((row) => row.term === "Commits")?.value).toBe("None yet for this phase");
  });
});

describe("the model and effort", () => {
  it("shows a model that takes no effort on its own (UI-011 item 2)", () => {
    expect(modelAndEffort("Opus 5.5", "xhigh")).toBe("Opus 5.5 · extra high effort");
    expect(modelAndEffort("Haiku 4.5", undefined)).toBe("Haiku 4.5");
    const settings = { ...runningSnapshot().settings, model: { value: "haiku", displayName: "Haiku 4.5" }, effortLevels: [] };
    expect(settingsModel(settings)).toBe("Haiku 4.5");
  });
});

describe("Paused", () => {
  it("names the phase it paused after: the Done phase that finished last", () => {
    expect(pausedAfter(pausedSnapshot())?.id).toBe("2a");
  });
});

describe("the Needs you screen's copy", () => {
  const settings = runningSnapshot().settings;
  const base = needsYouMessageSnapshot().needsYou!;
  const copyOf = (change: Partial<NeedsYou>) => needsYouCopy({ ...base, ...change }, settings, now);

  it("reads as drawn for a session that ended with a message, or crashed with none (AC-STOP-02)", () => {
    expect(needsYouCopy(base, settings, now)).toMatchObject({ headline: "Phase 2b ended before it was done.", line: "Kiln doesn’t try to interpret why. This is how the session ended.", firstStep: "resume", freshLink: true, sideHeading: "Kiln continues when" });
    expect(needsYouCopy({ ...base, phaseId: "pr" }, settings, now, true).finishText).toBe("Each changed repository needs a ready pull request from feature/customer-returns into its intended base, or proof that its current feature commit is already merged into that base.");
    expect(needsYouCopy(needsYouCrashedSnapshot().needsYou!, settings, now).line).toBe("The session exited with an error and no final message. These are the last lines it wrote.");
    expect(endingFact(base)).toBe("exit 0");
  });

  it("says how a session with no final message ended: exit 0, or a signal from something else", () => {
    const noMessage = without(base, "finalMessage");
    expect(needsYouCopy({ ...noMessage, exitCode: 0 }, settings, now).line).toBe("The session exited with no final message. These are the last lines it wrote.");
    const signalled = without(noMessage, "exitCode");
    expect(needsYouCopy({ ...signalled, signal: "SIGKILL" }, settings, now).line).toBe("The session was ended by SIGKILL with no final message. These are the last lines it wrote.");
    expect(endingFact({ ...signalled, signal: "SIGKILL" })).toBe("SIGKILL");
  });

  it("says no session ran when a check stops a phase no Kiln session worked on", () => {
    const noSession = without(without(without(base, "finalMessage"), "exitCode"), "sessionId");
    expect(needsYouCopy({ ...noSession, kind: "done_check" }, settings, now)).toMatchObject({ headline: "Phase 2b hasn’t passed its checks.", line: "No Kiln session ran this phase. Kiln checked it and found what’s shown on the right.", showFacts: false, firstStep: "fresh", freshLink: false });
    for (const phaseId of ["pr", "audit-a1"]) expect(needsYouCopy({ ...noSession, phaseId, kind: "done_check" }, settings, now).line).not.toContain("No Kiln session ran this phase");
  });

  it("uses UI-007 item 1's lines for the pull request", () => {
    expect(copyOf({ phaseId: "pr", kind: "pull_request_check" })).toMatchObject({
      headline: "The pull-request session ended before it was done.",
      finishTitle: "Open the pull request with Claude, the way you normally would",
      finishText: "Kiln accepts a ready pull request from feature/customer-returns into develop, or proof that its current feature commit is already merged into that base.",
      checkAgainText: "Kiln checks GitHub and the worktrees. When every changed repository has a ready pull request or verified prior integration, the feature is complete.",
      sideHeading: "Kiln finishes when",
      footnote: "This is the check Kiln runs after the pull-request session.",
    });
  });

  it("distinguishes checking audit completion from resuming unfinished work without a reply", () => {
    expect(copyOf({ phaseId: "audit-proof", resumeOffered: true }).footnote).toBe("Check again checks completion. To continue unfinished audit work, press Resume; your reply is optional.");
    expect(copyOf({ phaseId: "audit-proof", resumeOffered: false }).footnote).toBe("A successful process exit does not establish an audit result.");
  });

  it("uses UI-007 item 2's lines for a session that can't be resumed: no facts row, the fresh session as step 1, no link", () => {
    expect(copyOf({ kind: "not_resumable", stoppedAt: "2026-10-17T15:30:00Z" })).toMatchObject({
      headline: "Phase 2b ended before it was done.",
      line: "Kiln was interrupted at 11:30 AM while this session was working, and couldn’t resume it. These are the last lines it wrote.",
      showFacts: false,
      firstStep: "fresh",
      freshLink: false,
    });
    expect(copyOf({ kind: "not_resumable", stoppedAt: "2026-10-17T15:30:00Z", stoppedAtIsLastOutput: true }).line).toBe(
      "Kiln was interrupted while this session was working, and couldn’t resume it. Its last output was at 11:30 AM. These are the last lines it wrote.",
    );
  });

  it("uses UI-007 item 3's lines for a broken plan: no session, steps to fix the plan and check again", () => {
    expect(copyOf({ kind: "plan", phaseId: "3" })).toMatchObject({
      headline: "Phase 3 hasn’t started.",
      line: "Kiln read the phase plan and found the problem shown on the right.",
      showFacts: false,
      firstStep: "none",
      finishTitle: "Fix the phase plan",
      checkAgainText: "Kiln reads the plan again. If it reads, Kiln starts phase 3, or pauses first if you pressed Pause.",
    });
    expect(copyOf({ kind: "plan", phaseId: "pr" }).headline).toBe("The pull request hasn’t started.");
  });

  it("uses UI-007 item 4's lines when claude couldn't be started or restarted", () => {
    const neverRan = without(base, "resumeCommand", "finalMessage");
    const spawnError = { code: "ENOENT", message: "spawn claude ENOENT" };
    expect(needsYouCopy({ ...neverRan, spawnError }, settings, now)).toMatchObject({ line: "Kiln couldn’t start this session. This is the error it got.", firstStep: "fresh", freshLink: false });
    expect(copyOf({ spawnError })).toMatchObject({ line: "Kiln couldn’t restart this session. These are the last lines it wrote, ending with the error it got.", firstStep: "resume", freshLink: true });
    expect(endingFact({ ...base, spawnError })).toBe("ENOENT");
  });
});

describe("across repositories (multi-repo AC-PRS-03, AC-ADD-03, AC-SPACE-05)", () => {
  it("counts the repositories a Done phase pushed to in place of its commit, and the pull requests opened", () => {
    const rows = completeRepositoriesSnapshot().phases;
    expect(rowFacts(rows[0]!, "done", RUNNING_NOW)).toBe("52m · pushed to 2 repositories");
    expect(rowFacts(rows[3]!, "done", RUNNING_NOW)).toBe("1h 19m · finished by you · pushed to 4 repositories");
    expect(rowFacts({ ...rows[0]!, pushedRepositoryCount: 1 }, "done", RUNNING_NOW)).toBe("52m · pushed to 1 repository");
    expect(rowFacts({ ...rows[0]!, pushedRepositoryCount: 0 }, "done", RUNNING_NOW)).toBe("52m");
    expect(openedLabel(completeRepositoriesSnapshot())).toBe("Opened 4 pull requests");
    const one = completeRepositoriesSnapshot();
    one.pullRequests = one.pullRequests!.slice(0, 1);
    expect(openedLabel(one)).toBe("Opened 1 pull request");
  });

  it("lists Details as Complete draws them: no single worktree or branch, the commits by repository", () => {
    const rows = detailRows(completeRepositoriesSnapshot().phases[0]!.details!, now);
    expect(rows.map((row) => `${row.term} ${row.value}`)).toEqual(["Ran 9:17 to 10:09 AM", "Model Opus 5.5 · high effort", "Commits 3 in 2 repositories", "Session 4f2a9c1e-7b3d-4c8a-a5e6-1d9f0b2c7e34"]);
    expect(rows[2]!.repositories!.map((repository) => repository.name)).toEqual(["product", "returns-api"]);
    expect(repositoryCommitsLine(1, "3e8b2f1d4a07")).toBe("1 commit · latest 3e8b2f1");
    expect(commitsAcross(0, 0)).toBe("None yet for this phase");
  });

  it("counts the repositories under the workspace folder, with the ones sessions added", () => {
    const rows = completeRepositoriesSnapshot().repositories;
    expect(repositoriesLine(rows)).toBe("4 repositories, one added in phase 2b");
    expect(repositoriesLine(rows.slice(0, 3))).toBe("3 repositories");
    expect(repositoriesLine([...rows, { ...rows[3]!, name: "search", addedInPhase: "3" }])).toBe("5 repositories, two added in phases 2b and 3");
    expect(repositoriesLine([...rows, { ...rows[3]!, name: "search" }])).toBe("5 repositories, two added in phase 2b");
    expect(folderShown("~/devel/acme/.worktrees/customer-returns")).toEqual(["~/devel/acme/.worktrees/", "customer-returns/"]);
  });
});



it("labels all-merged and mixed completion without claiming every repository needs review", () => {
  const snapshot = completeSnapshot();
  snapshot.mergedBranches = [{ repository: "pricing", head: "feature/x", base: "develop", featureCommit: "a".repeat(40), baseCommit: "b".repeat(40), url: "https://github.com/acme/pricing/commit/" + "a".repeat(40) }];
  expect(headerState(snapshot, true, new Date(RUNNING_NOW)).label).toBe("Ready for review · some work already merged");
  expect(openedLabel(snapshot)).toBe("1 PR ready · 1 already merged");
  snapshot.pullRequests = [];
  expect(headerState(snapshot, true, new Date(RUNNING_NOW)).label).toBe("Already merged");
  expect(openedLabel(snapshot)).toBe("Already merged");
});


describe("development delivery completion", () => {
  it.each(["delivered", "review", "mixed"] as const)("names the actual %s result while preserving timing/history", state => {
    const snapshot = completeSnapshot();
    snapshot.developmentDelivery = { executionId: "test-execution", phaseId: undefined, revision: 0, authorization: { revision: 1, enabled: true, grants: [] }, assessments: [], checkpoints: [], splits: [], repositoryResults: [{ repository: "app", state, deliveredCheckpointIds: [], reasons: [] }] };
    const result = headerState(snapshot, true, now);
    expect(result.label).toBe(state === "delivered" ? "Development delivered" : state === "review" ? "Ready for review" : "Development delivered; review remaining");
    snapshot.feature.timing = { runningMs: 338 * 60_000, waitingMs: 0, asOf: snapshot.feature.completedAt! };
    expect(result.facts).toEqual(["5 of 5 phases done", "Finished 2:55 PM"]);
    expect(headerState(snapshot, true, now).totals).toEqual({ running: "5h 38m", waiting: "0m", since: "9:17 AM to 2:55 PM" });
    const stop = needsYouMessageSnapshot().needsYou!;
    expect(needsYouCopy(stop, snapshot.settings, now, false, true).finishText).toContain("artifact verification evidence");
  });
});
