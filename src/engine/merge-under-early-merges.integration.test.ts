// Kiln After Delivery, "Under early merges" (AC-MERGE-05): on a finished run with early merges, a
// review pull request GitHub shows merged counts as delivered, whoever merged it and however its
// branch was updated, and nothing is read from the run worktree for it. Real synchronized Git work
// plus the captured GitHub contract, as the early-merge recovery proofs use.
import { afterEach, expect, it, vi } from "vitest";
import * as auditWorkflow from "../audit/workflow.js";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { evaluateRepositories } from "./development-delivery.js";
import { MERGE_KEY } from "../state/activity-keys.js";

let fixture: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await fixture?.h.cleanup(); fixture = undefined; });

/** A finished early-merge run: checkpoint #1 merged early, then review pull request #2 holding later work, both delivered. */
async function finishedWithReview() {
  const f = fixture = await deliveryFixture();
  f.synchronize();
  writeFileSync(join(f.context.prdWorktree, "later.txt"), "Later review work\n");
  git(f.h.sandbox, f.context.prdWorktree, "add", "later.txt"); git(f.h.sandbox, f.context.prdWorktree, "commit", "-m", "Later review work"); git(f.h.sandbox, f.context.prdWorktree, "push", "origin", f.checkpoint.featureBranch);
  const head = git(f.h.sandbox, f.context.prdWorktree, "rev-parse", "HEAD").trim();
  const review = { ...structuredClone(f.pull), number: 2, state: "open", merged_at: null, html_url: "https://github.com/acme/acme-shop/pull/2", body: `PRD: ${f.context.prdDirectory}\nEarlier delivery: ${f.pull.html_url}` };
  review.head.sha = head;
  f.pull.body += `\nReview: ${review.html_url}`;
  const listing = `repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:" + f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`;
  f.responses[listing] = { body: [review] };
  f.responses["repos/acme/acme-shop/pulls/2"] = { body: review }; f.save();
  const delivered = await evaluateRepositories(f.context);
  expect(delivered).toMatchObject({ passed: true, pullRequests: [{ number: 2 }] });
  const record = f.context.record;
  record.completedAt = new Date().toISOString();
  record.pullRequests = delivered.pullRequests;
  return { f, review, listing, head };
}

/** GitHub now shows review #2 merged: off the open list, and the delivery reading saved it merged. */
function reviewMerged(setup: Awaited<ReturnType<typeof finishedWithReview>>, state: "merged" | "open" = "merged") {
  const { f, review, listing } = setup;
  f.responses[listing] = { body: [] };
  f.responses["repos/acme/acme-shop/pulls/2"] = { body: { ...review, state: "closed", merged_at: new Date().toISOString() } }; f.save();
  const at = new Date().toISOString();
  f.context.record.afterDelivery = { pullRequests: [{ repository: "acme-shop", number: 2, state, ...(state === "merged" ? { mergedAt: at, mergeCommit: "b".repeat(40) } : {}), readAt: at }] };
}

it("counts a merged review pull request as delivered on a finished run, reading nothing from the run worktree, even once it is removed", async () => {
  const setup = await finishedWithReview();
  const { f } = setup;
  reviewMerged(setup);
  // Update branch with rebase, then a hand merge: the worktree no longer holds the recorded feature head, and is then removed.
  git(f.h.sandbox, f.context.prdWorktree, "commit", "-q", "--allow-empty", "-m", "rebased elsewhere");
  expect(await evaluateRepositories(f.context)).toMatchObject({ passed: true, pullRequests: [{ number: 2 }] });
  expect(f.context.record.developmentDelivery!.repositoryResults).toMatchObject([{ state: "mixed", reviewPullRequest: { number: 2 }, deliveredCheckpointIds: [f.checkpoint.id] }]);
  f.h.tools.gh = f.context.gh; Object.assign(f.h.env, f.context.env);
  // The next kiln run after the merge session brought develop in and merged, with the worktree still there: the run stays
  // complete, and its files are not audited again.
  writeFileSync(join(f.context.prdWorktree, "README.md"), "Brought develop in during the merge session\n");
  git(f.h.sandbox, f.context.prdWorktree, "commit", "-qam", "Merge develop into the feature branch");
  // The harness answers the audit routing for every run; the final check would ask it whether the worktree's files still match the audits.
  vi.mocked(auditWorkflow.auditNext).mockClear();
  expect(await f.h.engine.decide()).toMatchObject({ kind: "complete" });
  expect(auditWorkflow.auditNext).not.toHaveBeenCalled();
  // Left part-way through a merge by an interrupted merge session, then removed: still complete, judged without it.
  const gitDir = git(f.h.sandbox, f.context.prdWorktree, "rev-parse", "--absolute-git-dir").trim();
  writeFileSync(join(gitDir, "MERGE_HEAD"), `${setup.head}\n`);
  writeFileSync(join(f.context.prdWorktree, "later.txt"), "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> develop\n");
  expect(await f.h.engine.decide()).toMatchObject({ kind: "complete" });
  rmSync(f.context.prdWorktree, { recursive: true, force: true });
  expect(await f.h.engine.decide()).toMatchObject({ kind: "complete" });
  expect(f.h.engine.currentlyComplete).toBe(true);
});

it("keeps today's rule when the reading does not show the review pull request merged, and for a run still in progress", async () => {
  const setup = await finishedWithReview();
  const { f } = setup;
  // A reading that does not show it merged (still open, or merged into another base, which the delivery reading
  // records as a failed read and never as merged: Phase 1's "merged into main, not develop" proof).
  reviewMerged(setup, "open");
  expect(await evaluateRepositories(f.context)).toMatchObject({ passed: false });
  reviewMerged(setup);
  delete f.context.record.completedAt;
  expect(await evaluateRepositories(f.context)).toMatchObject({ passed: false });
});

it("still fails an early-merge checkpoint whose pull request merged at a different head", async () => {
  const setup = await finishedWithReview();
  const { f } = setup;
  reviewMerged(setup);
  f.pull.head.sha = "c".repeat(40); f.save();
  const result = await evaluateRepositories(f.context);
  expect(result).toMatchObject({ passed: false });
  expect(result.checks[0]!.facts).toEqual(["first-checkpoint / requiredMerge: Pull request identity changed for first-checkpoint."]);
});

it("leaves the run complete through a merge stop and the merge's close on an early-merge run, and at the next kiln run", async () => {
  const setup = await finishedWithReview();
  const { f } = setup;
  const engine = f.h.engine;
  f.h.tools.gh = f.context.gh; Object.assign(f.h.env, f.context.env);
  expect(engine.record.developmentDelivery!.currentComplete).toBe(true);
  // The merge activity open for review #2, its session stopped short, then GitHub shows #2 merged and the activity closes.
  const at = new Date().toISOString();
  engine.record.afterDelivery = { pullRequests: [{ repository: "acme-shop", number: 2, state: "open", readAt: at }], merge: { operationId: "merge-press", requestedAt: at, via: "browser", pullRequests: [{ repository: "acme-shop", number: 2 }], pressHeads: [{ repository: "acme-shop", sha: setup.head }] } };
  const internals = engine as unknown as { recordStop(key: string, kind: string, checks: unknown[]): void; closeMerge(summary?: string): void };
  internals.recordStop(MERGE_KEY, "merge_check", []);
  expect(engine.record.developmentDelivery!.currentComplete).toBe(true);
  expect(engine.currentlyComplete).toBe(false);
  reviewMerged(setup);
  engine.record.afterDelivery!.merge = { operationId: "merge-press", requestedAt: at, via: "browser", pullRequests: [{ repository: "acme-shop", number: 2 }], pressHeads: [{ repository: "acme-shop", sha: setup.head }] };
  internals.closeMerge();
  expect(engine.record.developmentDelivery!.currentComplete).toBe(true);
  expect(engine.currentlyComplete).toBe(true);
  expect(await engine.decide()).toMatchObject({ kind: "complete" });
});
