// What the progress screens say, from the snapshot (PRD AC-WATCH-01, AC-WATCH-02, AC-PR-05,
// AC-STOP-02, AC-STOP-03; assumptions UI-007).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { completeSnapshot, needsYouCrashedSnapshot, needsYouMessageSnapshot, pausedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { detailRows, endingFact, headerState, modelAndEffort, needsYouCopy, pausedAfter, phaseOfTotal, rowFacts, rowPill, rowState, settingsModel } from "./progress.js";

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
    expect(rowPill(rows.at(-1)!, "done", 218)).toBe("Opened #218");
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
