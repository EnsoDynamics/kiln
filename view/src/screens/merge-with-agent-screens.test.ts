// The finished page's pull request card after delivery and the merge stop (Kiln After Delivery
// AC-MERGE-01, AC-MERGE-04, AC-MERGE-05, AC-MERGE-06, AC-MERGE-07, mockup states 1 to 4), and the merge
// session's restart hold, usage wait and the PRD's totals (Phase 2b), rendered from snapshots.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { AfterDeliveryView, Snapshot } from "../../../src/engine/snapshot.js";
import { completeSnapshot, needsYouMessageSnapshot, RUNNING_NOW, USAGE_LIMIT_NOW, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { headerTotals } from "../lib/progress.js";
import { timeSpan } from "../lib/time.js";
import Waiting from "./Waiting.svelte";
import Complete from "./Complete.svelte";
import NeedsYou from "./NeedsYou.svelte";
import StateHeader from "../components/StateHeader.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const NOTE = "Merge with Claude Code starts one more session in this PRD’s worktree. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges #218 into develop. Merging into develop may start its CI or deployment. To review it yourself first, open it on GitHub.";
function finished(after: Partial<AfterDeliveryView>, rows?: AfterDeliveryView["pullRequests"]): Snapshot {
  const snapshot = completeSnapshot();
  snapshot.afterDelivery = { pullRequests: rows ?? [{ repository: "acme-shop", number: 218, state: "open", conflicts: true, readAt: "2026-10-17T19:00:00Z" }], waiting: true, offer: { kind: "offered", available: true, note: NOTE }, ...after };
  snapshot.continuation = { check: { status: "awaiting_merge", attemptedAt: "2026-10-17T19:00:00Z", errors: [], awaitingMerge: { repository: "acme-shop", number: 218, url: "https://github.com/acme/acme-shop/pull/218", baseBranch: "develop", closed: false } } } as Snapshot["continuation"];
  return snapshot;
}
const page = (snapshot: Snapshot) => text(render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body);
const header = (snapshot: Snapshot) => text(render(StateHeader, { props: { snapshot, connected: true, now: RUNNING_NOW } }).body);

describe("the pull request card after delivery", () => {
  it("offers Merge with {agent} beside Open on GitHub, with its note, the conflict mark and the waiting line (state 1)", () => {
    const words = page(finished({}));
    expect(words).toContain("Conflicts with develop");
    expect(words).toContain(`Merge with Claude Code Open on GitHub`);
    expect(words).toContain(NOTE);
    expect(words).toContain("New phases: Kiln can check for them once #218 has merged into develop.");
    expect(header(finished({}))).toContain("PR ready for review");
  });
  it("shows a closed pull request and the reopen line, with no merge offered", () => {
    const words = page(finished({ offer: { kind: "closed", available: false, line: "Pull request #218 was closed without merging, so Kiln doesn’t offer to merge it. Reopen it on GitHub and the merge comes back." } }, [{ repository: "acme-shop", number: 218, state: "closed", readAt: "2026-10-17T19:00:00Z" }]));
    expect(words).toContain("Closed without merging");
    expect(words).toContain("Reopen it on GitHub and the merge comes back.");
    expect(words).not.toContain("Merge with Claude Code");
  });
  it("shows the running merge session in the card with why it has no live controls, and the header Merging (state 2)", () => {
    const snapshot = finished({ merge: { state: "running", startedAt: "2026-10-17T19:02:00Z", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/devel/acme-shop-kiln/customer-returns" } });
    const words = page(snapshot);
    expect(words).toContain("Merge session Claude Code");
    expect(words).toContain("in ~/devel/acme-shop-kiln/customer-returns");
    expect(words).toContain("Like the pull request session, the merge session can’t be messaged, paused or taken over while it runs.");
    expect(words).not.toContain("Merge with Claude Code Open");
    expect(words).not.toContain("New phases: Kiln can check");
    expect(header(snapshot)).toContain("Merging");
  });
  it("shows Merged with each merge time and commit and the session's summary word for word (state 3)", () => {
    const snapshot = finished({ waiting: false, offer: { kind: "all_merged", available: false }, merge: { state: "done", summary: "Brought develop into the branch and resolved conflicts in 6 files. Pushed and merged #218.", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } }, [{ repository: "acme-shop", number: 218, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d9aa", readAt: "2026-10-17T19:20:00Z" }]);
    snapshot.continuation = undefined;
    const words = page(snapshot);
    expect(words).toContain("Merged into develop at");
    expect(words).toContain("merge 8e41c0d");
    expect(words).toContain("The merge session’s summary Brought develop into the branch and resolved conflicts in 6 files. Pushed and merged #218.");
    expect(header(snapshot)).toContain("Merged");
  });
});

describe("a stopped merge session (AC-MERGE-06, state 4)", () => {
  it("is the Needs you page with the last message, Resume and Check again, and no fresh session or Mark complete", () => {
    const snapshot = needsYouMessageSnapshot();
    snapshot.needsYou = { ...snapshot.needsYou!, phaseId: "merge", kind: "merge_check", resumeOffered: true, finalMessage: "The conflict in src/returns/refund-router.ts needs a decision from you.", checks: [{ name: "acme-shop #218", passed: false, facts: ["Open on GitHub and not merged into develop."] }], counts: { passed: 0, waived: 0, failed: 1 }, markComplete: { offered: false, reason: "GitHub decides whether the merge is done." } };
    snapshot.phases = [...snapshot.phases, { id: "merge", kind: "merge", title: "Merge", file: "Claude Code · Opus 5.5 · merging #218 into develop", state: "needs_you", finishedByPerson: false }];
    snapshot.afterDelivery = { pullRequests: [{ repository: "acme-shop", number: 218, state: "open", readAt: "2026-10-17T19:00:00Z" }], waiting: true, offer: { kind: "offered", available: false }, merge: { state: "stopped", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } };
    snapshot.pullRequests = completeSnapshot().pullRequests;
    const words = text(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
    expect(text(render(StateHeader, { props: { snapshot, connected: true, now: RUNNING_NOW } }).body)).toContain("Needs you Merging pull request #218 into develop · Stopped");
    expect(words).toContain("The merge session stopped before merging.");
    expect(words).toContain("The pull request is unchanged on GitHub.");
    expect(words).toContain("The conflict in src/returns/refund-router.ts needs a decision from you.");
    expect(words).toContain("Reply and continue in Kiln");
    expect(words).toContain("Check again");
    expect(words).toContain("GitHub shows each pull request merged into its base branch.");
    expect(words).not.toContain("Copy a prompt for a fresh session instead");
    expect(words).not.toContain("Mark ");
  });
});

// Phase 2b of Kiln After Delivery: the merge session held at the restart review, its usage wait, and the PRD's totals.
describe("the merge session's waits and restart hold (AC-MERGE-05)", () => {
  it("keeps the finished page after Ctrl+C: the Merge row reads Interrupted, the card offers Resume, the header reads Merging, Interrupted", () => {
    const snapshot = finished({ merge: { state: "interrupted", startedAt: "2026-10-17T19:02:00Z", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } });
    snapshot.phases = [...snapshot.phases, { id: "merge", kind: "merge", title: "Merge", file: "Claude Code · Opus 5.5 · merging #218 into develop", state: "next", finishedByPerson: false, interrupted: true }];
    snapshot.restartReview = { activityKey: "merge", action: "resume" };
    const words = page(snapshot);
    expect(words).toMatch(/Merge Claude Code · Opus 5\.5 · merging #218 into develop Interrupted/);
    expect(words).toContain("Resume Kiln was stopped while the merge session ran. Resume reads GitHub first; if a pull request is still to merge, it picks up the same session where it stopped.");
    expect(words).not.toContain("Watch the session");
    expect(header(snapshot)).toContain("Merging");
    expect(header(snapshot)).toContain("Interrupted · Resume to carry on");
    // Held after Ctrl+C during a usage wait, Resume restarts the wait.
    snapshot.restartReview = { activityKey: "merge", action: "wait" };
    expect(page(snapshot)).toContain("Kiln was stopped while the merge session waited for usage. Resume reads GitHub first; if a pull request is still to merge, it waits for usage again, then picks up the same session.");
  });
  it("shows the Waiting screen for a merge session's usage wait, naming the activity as its row does, reading GitHub first", () => {
    const snapshot = waitingSnapshot();
    snapshot.phases = [...snapshot.phases.map(row => ({ ...row, state: row.state === "waiting" ? "done" as const : row.state })), { id: "merge", kind: "merge", title: "Merge", file: "Claude Code · Opus 5.5 · merging #218 into develop", state: "waiting", finishedByPerson: false }];
    snapshot.waiting = { ...snapshot.waiting!, phaseId: "merge" };
    const words = text(render(Waiting, { props: { snapshot, now: USAGE_LIMIT_NOW } }).body);
    expect(words).toContain("The merge session is waiting for");
    expect(words).toContain("Kiln checks GitHub first, then picks up the same session.");
    expect(header(snapshot)).toMatch(/Waiting for usage Merge · Waiting since/);
  });
  it("keeps the PRD's totals counting while a merge activity is open, and ends Complete's span when it closed", () => {
    const snapshot = completeSnapshot();
    const timing = snapshot.feature.timing!;
    const open = headerTotals({ ...snapshot.feature, timing: { ...timing, advancing: "running" } }, new Date(RUNNING_NOW));
    expect(open!.since).toMatch(/^since /);
    const completeUntil = new Date(Date.parse(snapshot.feature.completedAt!) + 3 * 3_600_000).toISOString();
    const closed = headerTotals({ ...snapshot.feature, completeUntil }, new Date(RUNNING_NOW));
    expect(closed!.since).toBe(timeSpan(snapshot.feature.startedAt!, completeUntil, new Date(RUNNING_NOW)));
    expect(closed!.since).not.toBe(timeSpan(snapshot.feature.startedAt!, snapshot.feature.completedAt!, new Date(RUNNING_NOW)));
  });
});
