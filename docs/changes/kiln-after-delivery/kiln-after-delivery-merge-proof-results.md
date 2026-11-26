# Kiln After Delivery — real merge session proof results (Phase 2a)

**Execution date:** 2026-11-22 UTC.
**Scope:** [Phase 2a — The merge press, the merge session and Merged](phase-2a-merge-press-and-session.md), AC-MERGE-03's named proof with each agent, and AC-MERGE-04 against GitHub itself.

## The repository

`EnsoDynamics/kiln-proof-after-delivery-temp-20261122`, public, described as a temporary Kiln test repository to be deleted once this PRD's test audit closes (technical design, "Delivery"). It holds test fixtures only. A ruleset protects `main`: changes go through a pull request, and the required status check `check` (a workflow that fails while a `FAIL` file exists) must pass.

## How each run works

`scripts/proof-run/merge-with-agent-provider-proof.mjs <agent> <case>` builds the production Engine over a finished run of a one-phase fixture PRD (`docs/prds/merge-proof` in that repository). It opens a pull request from a fresh feature branch, makes the case on GitHub, reads GitHub as the page's load does, presses Merge with the agent through the control journal, and records what GitHub and Kiln then show. The installed providers ran with Kiln's own launch settings: Claude Code 2.1.330 and Codex CLI 0.170.0.

| Agent | Case | Pull request | Session | GitHub afterwards | Kiln afterwards |
|---|---|---|---|---|---|
| Claude Code (opus) | The base gained a conflicting change to the same file after the pull request opened | [#3](https://github.com/EnsoDynamics/kiln-proof-after-delivery-temp-20261122/pull/3) | `db3311a7-5d7b-435e-b74b-8014a3737fb3` | Merged after the required check passed, merge commit `e4e114a` | Merged, with the session's closing summary saved word for word |
| Codex (gpt-6.2-sol) | The same conflict | [#5](https://github.com/EnsoDynamics/kiln-proof-after-delivery-temp-20261122/pull/5) | `b7f3384b-4175-45ae-bbf5-6a82228803d3` | Merged, merge commit `4f4cc83` | Merged, with the summary |
| Codex (gpt-6.2-sol) | An unrelated change merged to `main`, then GitHub's Update branch on the pull request | [#7](https://github.com/EnsoDynamics/kiln-proof-after-delivery-temp-20261122/pull/7) | `2acf42b6-7118-465d-8e3d-88e9b16da2de` | Merged, merge commit `4dfdb42`; the session fast-forwarded to GitHub's head before merging | Merged, with the summary |
| Claude Code (opus) | The ruleset set to require one approving review | [#9](https://github.com/EnsoDynamics/kiln-proof-after-delivery-temp-20261122/pull/9) | `5a5657e9-ad1e-433e-925e-b01a0ca6673c` | Still open: the session did not merge, used no `--admin` and pushed nothing; its last message names the missing approving review | A `merge_check` stop at Needs you; the activity stays open |

In each conflict run the session merged `main` into the feature branch, resolved the conflict as the file's own rule asked, pushed a plain merge commit, waited for `check` and merged with `gh pr merge --match-head-commit`, leaving the branch in place. After each run the check for new phases started unasked once Kiln confirmed the merge.

## Not covered here

- Two pull requests where the session stops at the first it cannot merge: the prompt's rule is asserted word for word by `src/engine/merge-with-agent.integration.test.ts`, and a real run would need two repositories.
- In the Update branch run, GitHub applied Update branch after Kiln's reading, so the press saw the old head; the press accepting a worktree behind GitHub's head is proved by the integration test "refuses a worktree with uncommitted work, a merge in progress, or commits on both sides, and accepts one behind GitHub's head".

Pull requests #1 (a run whose driver failed before pressing) and #9 were closed afterwards as fixtures; the ruleset was put back to no required review.
