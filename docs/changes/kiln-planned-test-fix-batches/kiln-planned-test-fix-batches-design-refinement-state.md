# Design Refinement State — kiln-planned-test-fix-batches

Started: 2026-11-24   Current pass: 1   Status: In progress
Branch: feature/kiln-planned-test-fix-batches
Existing code posture: Preserve (source: TD §Existing Code, itself the default)
PRD words: at start 1378 · growth baseline 1378, blob 776ed4ddb5cc563abcbe56c546449f45c270965e
Last updated: 2026-11-24

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-planned-test-fix-batches/kiln-planned-test-fix-batches-prd.md |
| Technical Design | docs/changes/kiln-planned-test-fix-batches/kiln-planned-test-fix-batches-technical-design.md |
| Assumptions | none |
| Supporting | docs/changes/kiln-planned-test-fix-batches/mockups/kiln-planned-test-fix-batches.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 4 (+2 from conformance) | 6 | 6 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Where not-started batch rows sit, and when the first reads Next, when pending completion-phase rows also exist | Technical | MEDIUM | 70 → 92 | Resolved | TD §Reading the Plan, 'Where the rows sit'; coverage AC-BATCH-01 |
| Q2 | 1 | Is `fixBatches: []` on a delivery audit's report refused? | Technical | LOW | 60 → 95 | Resolved | TD §The Fix Plan in the Report; coverage AC-BATCH-02 |
| Q3 | 1 | Is a criterion ID twice inside one batch refused? | Technical | LOW | 85 → 95 | Resolved | TD §The Fix Plan in the Report; coverage AC-BATCH-02 |
| Q4 | 1 | Where the surviving help-text sentences go (reclassified Technical: wording within AC-MAX-02) | Technical | LOW | 70 → 92 | Resolved | TD §Settings Help (intro table; flag descriptions corrected) |
| Q5 | 1 | `audit_loops` description in kiln-command-contracts.json still says "A loop is one run of an audit" (from conformance) | Technical | LOW | 90 → 95 | Resolved | TD §Settings Help; coverage AC-MAX-02 |
| Q6 | 1 | Phase Model Tiers Open Question no longer fits the new row order (from conformance) | Technical | LOW | 85 → 92 | Resolved | TD §Open Questions |

## Question notes

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-24 · 8 criteria checked against 485 in 29 PRDs · 6 existing Replaces lines accurate · 1 earlier criterion changed (AC-RUN-01, kiln-completion-audits) → 1 Replaces line written on AC-BATCH-01 · AC-MAX-01's AC-STOP-05 line sharpened (batch named) · 0 raised as questions
Changed after pass 1:

## Register re-sort
Pass 1: no assumptions register exists; nothing to re-sort.

## Noticed, out of scope
- Mark complete preview (engine.ts:2289) and the planned Preflight row's next activity (engine.ts:2134) name a pending session of test fixes "Test audit"; the Preflight row sits after the PR row (its `before` is "end"). Predates this feature.
- `auditNext` re-routes on currentness (workflow.ts:71-82), which the chain-open rule doesn't model: after a person edits the work between sessions, rows can show through a delivery audit a new test audit will follow, vanishing when it is allocated. Accepted by the design.
- `auditStepAfterSettled` (engine.ts:5663) ignores a delivery audit's outcome when naming the Preflight's next activity; existing behavior.
- `position.loop` for a session of test fixes is the latest counted test loop, not the chain start (loop-view.ts:67-69); same in practice.
- AC-SEE-02 in kiln-bot-control still says "audit rounds retain their names"; AC-AUDIT-01/AC-BOT-02 (kiln-after-delivery) changed that with no Replaces pointer — belongs to kiln-after-delivery.
- AC-TEST-01 in kiln-completion-audits is titled "runs and fixes its findings"; the method's test audit now fixes nothing itself (Kiln defers how per AC-NEUTRAL-02).

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 1 done; next: pass 2 discovery.
