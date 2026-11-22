# Kiln After Delivery — real push session proof results (Phase 3)

**Execution date:** 2026-11-22 UTC.
**Scope:** [Phase 3 — Continue pushes the plan first](phase-3-continue-pushes-plan.md), AC-BACK-05's named proof "a real push session with each agent", against GitHub itself.

## The repository

`EnsoDynamics/kiln-proof-after-delivery-temp-20261122`, the temporary repository of the [merge proof](kiln-after-delivery-merge-proof-results.md). A ruleset protects `main`: changes go through a pull request with the required status check `check`. Other branches are unprotected.

## How each run works

`scripts/proof-run/plan-push-provider-proof.mjs <agent> <case>` builds the production Engine over a finished run of the repository's one-phase `docs/prds/merge-proof` PRD, whose work is already in the base, and commits a second phase document on the main checkout's base branch without pushing it. The check for new phases reads that offer from the main checkout; the run presses Continue as the page does and records what origin and Kiln then show. In `push` the base is a fresh unprotected branch, and the run stops Kiln as soon as Kiln has accepted the refreshed offer itself, so no build session runs. In `refused` the base is `main`. The installed providers ran with Kiln's own launch settings: Claude Code 2.1.330 and Codex CLI 0.170.0.

| Agent | Case | Base branch | Session | Origin afterwards | Kiln afterwards |
|---|---|---|---|---|---|
| Claude Code (opus) | Push | `plan-proof-claude_code-20261122162326` | `e209d6ed-5780-45c0-b169-55d5426813d4`, in the main checkout | At the pushed commit `1a37bff`, a plain push | Done read from origin; the re-check matched the offer, and Kiln accepted it itself (`plan-push-accept-…` instruction), the push closed in the same save |
| Claude Code (opus) | Refused by the ruleset | `main` | `f4bed88d-a191-4429-a32a-077fb42df128`, in the main checkout | Unchanged at `4dfdb42` | A `plan_push_check` stop at Needs you; the session's last message quotes GitHub's refusal (`GH013: Repository rule violations found for refs/heads/main … push declined due to repository rule violations`) word for word; no acceptance |
| Codex (gpt-6.2-sol) | Push | `plan-proof-codex-20261122164639` | `70dd2651-4c1c-4f2a-b3f7-64141d0e2dc7`, in the main checkout as its one assigned checkout | At the pushed commit `77f594d`, a plain push | Done read from origin; the re-check matched, and Kiln accepted it itself, the push closed in the same save |

The first Codex run found that Codex's launch check refused a session with no assigned repository: the push session is given the main checkout alone, so Kiln now assigns it as the session's one checkout, on the base branch. The run above is after that fix. The unprotected `plan-proof-*` branches are proof fixtures, deleted with the repository.
