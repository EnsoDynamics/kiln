# Kiln After Delivery: Inputs for the Technical Design

Code facts found while the PRD was written, read from `develop` at `c41c7af` on 2026-11-21. They are inputs, not decisions. The technical design verifies each against the code, takes what it needs, and this file is deleted in the commit that adds the design.

## Why a finished run with an open pull request reported "Plan needs reconciliation" (AC-WAIT-01)

Observed on a run whose PRD was planned on the base branch, built on a feature branch where an audit added a second phase, and delivered as an open pull request. Unrelated commits then landed on the base branch, touching documents the PRD links to but nothing in its folder, and the main checkout stayed behind the remote.

In `src/engine/completed-plan-discovery.ts`, `checkCompletedPlan`:

- The awaiting block reaches the right answer: the delivered revisions are not in the base, the base's copy of the PRD folder is unchanged since the fork, so `awaiting` is set.
- The early return then requires `conflicts.length && semantic(local) === semantic(remote)`. A plan source covers every linked governing document, not only the PRD folder (`planSourceFromDocuments` in `completed-plan-sources.ts`), so a main checkout that is merely behind differs from the remote and the return is skipped.
- The code falls through and reports, all falsely: completed scope "removed, reopened, split or materially changed" (both sources hold the plan from before the audit added a phase), `source_conflict` (a checkout that is only behind counts as separately revised), every document that differs between the stale checkout and the remote as unintegrated, and the "cannot be carried forward" and "leaf absent or split" lines from `completed-plan-accounting.ts`.
- Separate gap: with `awaiting` set and no conflicts there is no awaiting return either.

The existing integration test "reports completed work still on its unmerged branch as waiting for the merge" in `completed-plan-discovery.integration.test.ts` covers only a main checkout level with the remote. A regression test needs the base to gain a commit to a linked document outside the PRD folder while the main checkout stays behind, and a variant with the checkout fast-forwarded.

No PRD criterion owned the waiting-to-merge state before this change; AC-WAIT-01 and AC-WAIT-02 now do.

## Where the surfaces this change touches are built

- The check's panel and its headings: `view/src/components/CompletedPlanCheck.svelte`. The header pill: `view/src/components/StateHeader.svelte`. The terminal's sentence: `src/underway-output.ts` and `src/engine/awaiting-merge.ts`.
- The finished page and its pull request card: `view/src/screens/Complete.svelte`.
- The check reads the main checkout's files as they are on disk (`observePlan`) and does not look at which branch that checkout is on (AC-BACK-03's third row).
- Audit row names: the `file` field built in `src/engine/snapshot.ts` ("Round n · Continuation k"), `auditName` in `src/audit/person-items.ts`, and the audit event line in `src/kiln-command.ts`. A test audit's first session has `continuationIndex` 1 and each fixing session the next number.
- Kiln stays in the foreground until Ctrl+C in `src/kiln-command.ts`; a signalled stop exits through `EXIT_SIGNALLED` in `src/kiln-main.ts`.
- The Needs you page already offers the reply box, Resume and the copyable `claude --resume` command, with copy written for the pull request session, in `view/src/screens/NeedsYou.svelte` and `view/src/lib/progress.ts`.
- Bot commands are listed in `ACTIONS` in `src/control/commands.ts`.
