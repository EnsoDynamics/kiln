// What the progress screens say, from the snapshot (PRD AC-WATCH-01, AC-WATCH-02, AC-PR-05,
// AC-STOP-02, AC-STOP-03; assumptions UI-007).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { completeRepositoriesSnapshot, completeSnapshot, needsYouCrashedSnapshot, needsYouMessageSnapshot, needsYouOutsideWorkspaceSnapshot, pausedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
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
    expect(headerState(completeSnapshot(), true, now)).toEqual({ kind: "complete", label: "PR ready for review", facts: ["5 of 5 phases done", "5h 38m", "Finished 2:55 PM"] });
  });

  it("reads Interrupted in phase <n> once the view has lost Kiln, and names the pull request rather than a number (AC-PR-05)", () => {
    expect(headerState(runningSnapshot(), false, now).label).toBe("Interrupted in phase 2b");
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

  it("shows nothing beside a phase closed without a Kiln session, and no duration for a pull request found already open", () => {
    expect(rowFacts({ id: "1", title: "Return intake", file: "f.md", state: "done", finishedByPerson: false }, "done", RUNNING_NOW)).toBeUndefined();
    expect(rowFacts({ id: "pr", title: "Final pull request", file: "pull request session", state: "done", doneAt: "2026-10-17T18:55:00Z", finishedByPerson: false }, "done", RUNNING_NOW)).toBeUndefined();
  });

  it("times an Implementing phase from its session's start, and shows it as Interrupted once disconnected", () => {
    const row = runningSnapshot().phases[3]!;
    expect(rowState(row, true)).toBe("implementing");
    expect(rowState(row, false)).toBe("interrupted");
    expect(rowFacts(row, "implementing", RUNNING_NOW)).toBe("49m");
    expect(rowPill(row, "interrupted", undefined)).toBe("Interrupted");
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
    expect(needsYouCopy({ ...base, phaseId: "pr" }, settings, now, true).finishText).toContain("into each repository’s base branch, in every repository that changed");
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

  it("uses UI-007 item 1's lines for the pull request", () => {
    expect(copyOf({ phaseId: "pr", kind: "pull_request_check" })).toMatchObject({
      headline: "The pull-request session ended before it was done.",
      finishTitle: "Open the pull request with Claude, the way you normally would",
      finishText: "Open it however you like. Kiln only looks for an open pull request from feature/customer-returns into develop that isn’t a draft, so it doesn’t matter who opens it.",
      checkAgainText: "Kiln re-checks GitHub. If the pull request is open and ready for review, the feature is complete.",
      sideHeading: "Kiln finishes when",
      footnote: "This is the check Kiln runs after the pull-request session.",
    });
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

describe("Needs you after work outside the workspace (multi-repo AC-OUTSIDE-02 to 04)", () => {
  const stop = needsYouOutsideWorkspaceSnapshot().needsYou!;
  const settings = needsYouOutsideWorkspaceSnapshot().settings;
  const outside = stop.outside!;

  it("asks the reopened session to bring its work in, and to confirm and check again, naming each checkout", () => {
    expect(needsYouCopy(stop, settings, now, true)).toMatchObject({
      firstStep: "resume",
      freshLink: true,
      outside: {
        title: "Ask it to bring its design-system work into the workspace",
        prompt: outside.prompt,
        againTitle: "Come back, confirm and check again",
        againText: "Once what’s left in design-system’s own checkout is put back, tick the confirmation on the right and press Check again. If the phase is done, Kiln starts the next one, or pauses first if you pressed Pause after this phase.",
      },
    });
    const two = needsYouCopy({ ...stop, outside: { ...outside, checkouts: ["design-system", "storefront"] } }, settings, now, true).outside!;
    expect(two.title).toBe("Ask it to bring its design-system and storefront work into the workspace");
    expect(two.againText).toMatch(/^Once what’s left in design-system’s and storefront’s own checkouts is put back/);
    const pr = needsYouCopy({ ...stop, phaseId: "pr" }, settings, now, true).outside!;
    expect(pr.title).toBe("Ask it what still needs putting back in design-system");
    expect(pr.againText).toMatch(/If every pull request is open and ready for review, the feature is complete\.$/);
  });

  it("offers the fresh session in place of the resume command when Kiln found no transcript, with no link to it (OUT-003)", () => {
    const noPrompt = { changes: [], checkouts: [], missingTranscripts: ["No transcript found for session 4d9a in ~/.claude/projects, so Kiln can't tell what it did outside the workspace"], confirmation: outside.confirmation };
    expect(needsYouCopy({ ...without(stop, "resumeCommand"), outside: noPrompt }, settings, now, true)).toMatchObject({
      firstStep: "fresh",
      freshLink: false,
      outside: {
        title: "Check your own checkouts for anything this session changed",
        text: "Kiln found no transcript for this session, so it can’t see what it did outside the workspace. Deal with anything it changed however you like.",
        againText: "Once your checkouts are as they should be, tick the confirmation on the right and press Check again. If the phase is done, Kiln starts the next one, or pauses first if you pressed Pause after this phase.",
      },
    });
    // An unreadable transcript keeps the resume command.
    const unreadable = needsYouCopy({ ...stop, outside: { ...noPrompt, missingTranscripts: ["Kiln couldn't read ~/.claude/projects/x/4d9a.jsonl: line 3 isn't JSON"] } }, settings, now, true);
    expect(unreadable).toMatchObject({ firstStep: "resume", outside: { text: expect.stringMatching(/^Kiln couldn’t read this session’s transcript/) } });
  });

  it("says the four checks once Stayed in the workspace is listed, and offers no fresh-session link wherever there is no resume command", () => {
    const four = { ...stop, checks: [...stop.checks.slice(0, 3), { name: "Stayed in the workspace", passed: true, facts: ["The changes outside the workspace have been dealt with"] }] };
    const confirmed = without(four, "outside");
    expect(needsYouCopy(confirmed, settings, now, true).finishText).toContain("Kiln only looks at the four checks on the right");
    expect(needsYouCopy(without(confirmed, "resumeCommand"), settings, now, true)).toMatchObject({ firstStep: "fresh", freshLink: false });
  });

  it("says Kiln couldn't see what an interrupted session did when it has no transcript to go on", () => {
    const unseen = { ...without(stop, "finalMessage", "resumeCommand"), interrupted: { at: "2026-10-17T17:20:00Z", atIsLastOutput: false }, outside: { ...outside, changes: [], checkouts: [], missingTranscripts: ["No transcript found for session 4d9a in ~/.claude/projects, so Kiln can't tell what it did outside the workspace"] } };
    expect(needsYouCopy(unseen, settings, now, true).line).toBe("Kiln was interrupted at 1:20 PM while this session was working, and didn’t resume it, since it can’t see what the session did outside the workspace. These are the last lines it wrote.");
  });

  it("says Kiln was interrupted and didn't resume the session, with its last lines", () => {
    const interrupted = { ...without(stop, "finalMessage"), interrupted: { at: "2026-10-17T17:20:00Z", atIsLastOutput: false } };
    expect(needsYouCopy(interrupted, settings, now, true)).toMatchObject({
      line: "Kiln was interrupted at 1:20 PM while this session was working, and didn’t resume it, since it worked outside the workspace. These are the last lines it wrote.",
      showFacts: false,
      firstStep: "resume",
    });
  });
});

