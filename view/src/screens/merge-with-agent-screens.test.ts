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
import PhaseDetail from "./PhaseDetail.svelte";
import type { PhaseView } from "../../../src/engine/snapshot.js";

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

// Watching the merge and push sessions (AC-MERGE-05): the finished page links to the running session, whose page
// shows its live output with no message box or pause, and says why; the header reads Merging or Pushing the plan.
describe("watching a running merge or push session (AC-MERGE-05)", () => {
  const details = (sessionId: string): PhaseView["details"] => ({ agentId: "claude_code", agent: "Claude Code", from: "2026-10-17T19:02:00Z", model: "Opus 5.5", effort: "high", worktree: "~/w", branch: "develop", sessionId });
  const detail = (snapshot: Snapshot, phaseId: string) => text(render(PhaseDetail, { props: { snapshot, phaseId, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
  const watch = (markup: string) => /<a class="button solid" href="([^"]+)"[^>]*>Watch the session<\/a>/.exec(markup)?.[1];
  const MERGE_LIVE = "Like the pull request session, the merge session can’t be messaged, paused or taken over while it runs.";
  const PUSH_LIVE = "Like the pull request session, the push session can’t be messaged, paused or taken over while it runs.";

  it("links the running merge session from the card to its page, which shows its live output and no message box or pause", () => {
    const snapshot = finished({ merge: { state: "running", sessionId: "merge-session-1", startedAt: "2026-10-17T19:02:00Z", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } });
    snapshot.phases = [...snapshot.phases, { id: "merge", kind: "merge", title: "Merge", file: "Claude Code · Opus 5.5 · merging #218 into develop", state: "implementing", finishedByPerson: false, details: details("merge-session-1") }];
    const markup = render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;
    expect(watch(markup)).toBe("/customer-returns/phase/merge");
    expect(text(markup)).toContain("Merge session Claude Code · Opus 5.5");
    const words = detail(snapshot, "merge");
    expect(words).toContain("Session output LIVE");
    expect(words).toContain(MERGE_LIVE);
    expect(words).not.toContain("Pause now");
    expect(words).not.toContain("Send");
    expect(header(snapshot)).toContain("Merging");
  });

  it("shows the running push session on the finished page with its reason and a link to its page, which shows its live output; the header reads Pushing the plan", () => {
    const key = "plan-push-7f3a";
    const snapshot = finished({ waiting: false, offer: { kind: "all_merged", available: false }, planPush: { key, state: "running", sessionId: "push-session-1", proposalId: "p".repeat(64) } }, [{ repository: "acme-shop", number: 218, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d9aa", readAt: "2026-10-17T19:20:00Z" }]);
    snapshot.continuation = undefined;
    snapshot.phases = [...snapshot.phases, { id: key, kind: "plan_push", title: "Push the plan", file: "Claude Code · Opus 5.5 · pushing 1 commit to develop", state: "implementing", finishedByPerson: false, details: details("push-session-1") }];
    const markup = render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;
    expect(watch(markup)).toBe(`/customer-returns/phase/${key}`);
    const page = text(markup);
    expect(page).toContain("Push the plan Claude Code · Opus 5.5 · pushing 1 commit to develop Watch the session");
    expect(page).toContain(`${PUSH_LIVE} Once develop holds the documents, the build starts. If the push session stops, Kiln shows Needs you with its last message.`);
    const words = detail(snapshot, key);
    expect(words).toContain("Session output LIVE");
    expect(words).toContain(PUSH_LIVE);
    expect(words).not.toContain("Pause now");
    expect(words).not.toContain("Send");
    expect(header(snapshot)).toContain("Pushing the plan");
    expect(header(snapshot)).not.toContain("Merged");
  });
});

// Phase 5 of Kiln After Delivery (the display gaps the delivery audit found): the check's answer beside
// Exit Kiln once merged (AC-WAIT-03, mockup state 3) and the header while a pull request is closed (AC-MERGE-07).
describe("the check's answer and the header after delivery", () => {
  const result = (added: { id: string; title: string }[]) => ({ baselineId: "b", candidateId: "c", source: { kind: "remote_base", branch: "develop", revision: "0a3d75d" }, uncommitted: [], added, problems: [], ...(added.length ? { origin: { kind: "commit", revision: "a41c0d2aa", committedAt: "2026-10-18T14:10:00Z", subject: "Plan the return labels" } } : {}) });
  const check = (status: string, added: { id: string; title: string }[] = []) => ({ check: { status, attemptedAt: "2026-10-17T19:20:00Z", lastSuccessfulAt: "2026-10-17T19:20:00Z", errors: status === "failed" ? ["HTTP 502"] : [], ...(status === "checking" || status === "failed" ? {} : { result: result(added) }) } }) as unknown as Snapshot["continuation"];
  function merged(continuation: Snapshot["continuation"]): Snapshot {
    const snapshot = finished({ waiting: false, offer: { kind: "all_merged", available: false }, merge: { state: "done", summary: "Merged #218.", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } }, [{ repository: "acme-shop", number: 218, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d9aa", readAt: "2026-10-17T19:20:00Z" }]);
    snapshot.exit = { available: true, command: "kiln run docs/prds/customer-returns" };
    snapshot.continuation = continuation;
    return snapshot;
  }
  const html = (snapshot: Snapshot) => render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;

  it("shows the answer in the Merged card beside Exit Kiln, with no panel of its own above the card (state 3)", () => {
    const markup = html(merged(check("unchanged")));
    expect(markup.match(/class="plan-check/g)).toHaveLength(1);
    const card = markup.indexOf("Pull request #218");
    const exit = markup.indexOf(">Exit Kiln</button>");
    const panel = markup.indexOf("class=\"plan-check");
    expect(card).toBeGreaterThan(-1);
    expect(exit).toBeGreaterThan(card);
    expect(panel).toBeGreaterThan(exit);
    expect(markup.slice(card, markup.indexOf("Phase plan"))).toContain("No new phases found");
    expect(markup).toMatch(/class="plan-check[^"]*in-card/);
    // With the check's answer "unchanged" present, the header reads Merged, not New phases found (AC-WAIT-03).
    const top = header(merged(check("unchanged")));
    expect(top).toContain("Merged");
    expect(top).not.toContain("New phases");
    expect(top).not.toContain("PR ready for review");
    // The page's clock decides the date: none for a check made today, the date for an earlier one.
    const at = (now: number) => text(render(Complete, { props: { snapshot: merged(check("unchanged")), connected: true, now, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body);
    const time = new Date("2026-10-17T19:20:00Z").toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    expect(at(Date.parse("2026-10-17T19:30:00Z"))).toContain(`No new phases found. Kiln checked develop at ${time}. Check for new phases`);
    expect(at(Date.parse("2026-10-25T12:00:00Z"))).toMatch(new RegExp(`No new phases found\\. Kiln checked develop on Oct 1[78] at ${time}\\. Check for new phases`));
  });

  it("keeps found phases in the prominent panel above the earlier delivery, and names them beside Exit Kiln (AC-WAIT-03 with Kiln Continue Added Phases AC-OFFER-01)", () => {
    const markup = html(merged(check("available", [{ id: "5", title: "Return labels" }])));
    expect(markup.match(/class="plan-check/g)).toHaveLength(1);
    expect(markup).not.toMatch(/class="plan-check[^"]*in-card/);
    const panel = markup.indexOf("class=\"plan-check");
    const card = markup.indexOf("Pull request #218");
    const exit = markup.indexOf(">Exit Kiln</button>");
    expect(panel).toBeLessThan(card);
    expect(text(markup.slice(exit, markup.indexOf("Phase plan")))).toContain("1 phase was added to this PRD after Kiln finished it. Continue is at the top of this page.");
    expect(header(merged(check("available", [{ id: "5", title: "Return labels" }])))).toContain("New phases found");
  });

  it("shows the answer in the card on a run with several pull requests too", () => {
    const snapshot = merged(check("unchanged"));
    const one = snapshot.pullRequests![0]!;
    snapshot.feature.multiRepository = true;
    snapshot.pullRequests = [one, { ...one, repository: "acme-api", number: 57, url: "https://github.com/acme/acme-api/pull/57" }];
    snapshot.afterDelivery!.pullRequests = [...snapshot.afterDelivery!.pullRequests, { repository: "acme-api", number: 57, state: "merged", mergedAt: "2026-10-17T19:18:00Z", mergeCommit: "77aa0000", readAt: "2026-10-17T19:20:00Z" }];
    const markup = html(snapshot);
    expect(markup.match(/class="plan-check/g)).toHaveLength(1);
    expect(markup).toMatch(/class="plan-check[^"]*in-card/);
    expect(markup.indexOf("class=\"plan-check")).toBeGreaterThan(markup.indexOf(">Exit Kiln</button>"));
    expect(text(markup)).toContain("the worktrees stay until you remove them.");
  });

  it("keeps the panel of its own while the delivery is not merged", () => {
    const snapshot = finished({ waiting: false, offer: { kind: "closed", available: false, line: "Pull request #218 was closed without merging, so Kiln doesn’t offer to merge it. Reopen it on GitHub and the merge comes back." } }, [{ repository: "acme-shop", number: 218, state: "closed", readAt: "2026-10-17T19:00:00Z" }]);
    snapshot.continuation = check("unchanged");
    const markup = html(snapshot);
    expect(markup.indexOf("class=\"plan-check")).toBeLessThan(markup.indexOf("Pull request #218"));
    expect(markup).not.toMatch(/class="plan-check[^"]*in-card/);
  });

  it("keeps PR ready for review while a pull request is closed, unless a check finds new phases (AC-MERGE-07)", () => {
    const closed = (continuation: Snapshot["continuation"]) => {
      const snapshot = finished({ waiting: false, offer: { kind: "closed", available: false } }, [{ repository: "acme-shop", number: 218, state: "closed", readAt: "2026-10-17T19:00:00Z" }]);
      snapshot.continuation = continuation;
      return header(snapshot);
    };
    for (const status of ["checking", "failed", "unchanged"]) {
      const words = closed(check(status));
      expect(words, status).toContain("PR ready for review");
      expect(words, status).not.toContain("new phases");
    }
    expect(closed(check("available", [{ id: "5", title: "Return labels" }]))).toContain("New phases found");
    // A merged delivery's check still shows in the header, as today.
    expect(header(merged(check("failed")))).toContain("Could not check for new phases");
  });
});

// Test audit of Kiln After Delivery: a delivery of two pull requests, one merged and one open; another
// agent's press; the header while a closed reading meets a merge activity; a hand merge with no summary.
describe("a delivery of several pull requests and the merge's other faces (AC-MERGE-01, AC-MERGE-04, AC-MERGE-07)", () => {
  const PARTLY = "acme-api #57 is already merged, so Merge with Claude Code merges only acme-shop #218. It starts one more session in this PRD’s workspace. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges acme-shop #218 into develop. Merging into develop may start its CI or deployment.";
  const MERGED_AT = "2026-10-17T19:18:00Z";
  function twoPulls(after: Partial<AfterDeliveryView>, api: AfterDeliveryView["pullRequests"][number], shop: AfterDeliveryView["pullRequests"][number]): Snapshot {
    const snapshot = finished(after, [shop, api]);
    const one = snapshot.pullRequests![0]!;
    snapshot.feature.multiRepository = true;
    snapshot.pullRequests = [one, { ...one, repository: "acme-api", number: 57, url: "https://github.com/acme/acme-api/pull/57" }];
    return snapshot;
  }
  const apiMerged = { repository: "acme-api", number: 57, state: "merged" as const, mergedAt: MERGED_AT, mergeCommit: "77aa00001234", readAt: "2026-10-17T19:20:00Z" };
  const shopOpen = { repository: "acme-shop", number: 218, state: "open" as const, readAt: "2026-10-17T19:20:00Z" };

  it("shows the merged one with its merge time and commit beside one Merge press for the rest, and the header is not Merged while one is open", () => {
    const snapshot = twoPulls({ offer: { kind: "offered", available: true, note: PARTLY } }, apiMerged, shopOpen);
    const markup = render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;
    const words = text(markup);
    const time = new Date(MERGED_AT).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    expect(words).toContain(`Merged into develop at ${time} · merge 77aa000`);
    // Only the merged one has a merge line.
    expect(words.match(/Merged into develop/g)).toHaveLength(1);
    expect(markup.match(/>Merge with Claude Code</g)).toHaveLength(1);
    expect(words).toContain(PARTLY);
    expect(header(snapshot)).not.toContain("Merged");
    expect(header(snapshot)).toContain("PR ready for review");
    // Once both read merged, the header reads Merged.
    const both = twoPulls({ waiting: false, offer: { kind: "all_merged", available: false } }, apiMerged, { ...shopOpen, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d9aa" });
    expect(header(both)).toContain("Merged");
  });

  it("names the run's agent on the press: Merge with Codex", () => {
    const snapshot = finished({ offer: { kind: "offered", available: true, note: NOTE.replace("Merge with Claude Code", "Merge with Codex") } });
    snapshot.settings = { ...snapshot.settings, agent: "Codex" };
    const markup = render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;
    expect(markup).toContain(">Merge with Codex</button>");
    expect(markup).not.toContain("Merge with Claude Code");
  });

  it("reads Merging while a merge runs and Needs you once it stopped, even with a pull request read closed", () => {
    const closed = [{ repository: "acme-shop", number: 218, state: "closed" as const, readAt: "2026-10-17T19:00:00Z" }];
    const running = finished({ waiting: false, offer: { kind: "closed", available: false }, merge: { state: "running", startedAt: "2026-10-17T19:02:00Z", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } }, closed);
    expect(header(running)).toContain("Merging");
    expect(header(running)).not.toContain("PR ready for review");
    const stopped = needsYouMessageSnapshot();
    stopped.needsYou = { ...stopped.needsYou!, phaseId: "merge", kind: "merge_check", resumeOffered: true, checks: [{ name: "acme-shop #218", passed: false, facts: ["acme-shop #218 was closed on GitHub without merging. Reopen it there, then press Resume."] }], counts: { passed: 0, waived: 0, failed: 1 } };
    stopped.afterDelivery = { pullRequests: closed, waiting: false, offer: { kind: "closed", available: false }, merge: { state: "stopped", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } };
    stopped.pullRequests = completeSnapshot().pullRequests;
    expect(header(stopped)).toContain("Needs you Merging pull request #218 into develop · Stopped");
  });

  it("shows Merged from a hand merge with no summary section", () => {
    const snapshot = finished({ waiting: false, offer: { kind: "all_merged", available: false }, merge: { state: "done", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } }, [{ repository: "acme-shop", number: 218, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d9aa", readAt: "2026-10-17T19:20:00Z" }]);
    snapshot.continuation = undefined;
    const words = page(snapshot);
    expect(words).toContain("Merged into develop at");
    expect(words).toContain("merge 8e41c0d");
    expect(words).not.toContain("The merge session’s summary");
    expect(header(snapshot)).toContain("Merged");
  });
});
