# Design Refinement State — Kiln development deployments

Started: 2026-10-24   Current pass: 1   Status: In progress
Branch: wt/kiln-devdeploy-tdd
Existing code posture: Preserve (source: Technical Design; default)
PRD words: at start 2636 · growth baseline 2636
Last updated: 2026-10-24 UTC

## Documents
| Document | Path |
|---|---|
| PRD | kiln-development-deployments-prd.md |
| Technical Design | kiln-development-deployments-technical-design.md |
| Assumptions | kiln-development-deployments-assumptions.md |
| Supporting | Referenced repository PRDs and current supersession owners; design review commit 4cb6699 (rebased from 36fb128) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2 | 2 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|

| Q1 | 1 | How do delivery obligations map to descendants when a phase splits? | Technical | MEDIUM | 80 → 95 | Resolved | TD records, assessment API, split evaluator, coverage matrix |
| Q2 | 1 | How does first grant activate an execution with prior restricted completions? | Technical | MEDIUM | 85 → 97 | Resolved | TD grants, assessment/prepare scope, evaluator, coverage matrix |

## Question notes
### Q1
Proposed answer: explicitly map obligations to descendant leaves, preserve checkpoint/evidence identities and criterion references, and validate complete coverage. Evidence: TD split recovery; src/engine/plan-reading.ts judgedLeaf currently selects first descendant. Answer at 95%: Explicit assignments identify checkpoint, required merge or evidence-requirement ID, origin phase/criteria, descendant leaf IDs; retain immutable checkpoint/evidence; atomically validate complete coverage, real descendant destinations and prerequisite order against ledger revision and split documents. Keep first-descendant judged leaf for session attribution, evaluate its assigned obligations, and require all retained obligations/required merges at final completion. Missing/stale assignments prevent progression. Each child submits current assessment. Evidence: plan-reading.ts:44–52, checks.ts:99–107, engine.integration.test.ts:155–184, state/records.ts:130, engine.ts:1809. Add later-child, spanning-checkpoint, missing-mapping, repeat-split and restart implementation cases.

### Q2
Proposed answer: enable atomically with first grant and assess previous completed leaves without fabricating no-delivery assessments. Answer at 97%: first Needs you grant atomically stores enabled=true, confirmed target and incremented authorization revision; repeating same grant idempotent and does not resume. Historical doneAt/completedAt/session/push facts remain. Before advancing/final completion require current prior-completed and stopped leaf assessments; Check again reconciles, Resume/manual recovery supplies missing assessments and required operations via same recovery session, limited to engine-identified unresolved prior leaves in dependency order. No future leaves/new targets/repositories; missing assessments never infer no-delivery. Reuse independently verified evidence, do not rerun implementation solely for absent historical assessments or repeat confirmed delivery. Enabled evaluator overrides historical completion shortcuts without rewriting those facts. Evidence: AUTH-002, PRD AC-PERMIT-05/AC-DEV-03/AC-DELIVER-04, state/records.ts:130/439, engine.ts:632/1646/2740/1032/1127/1811/2615, plan-reading.ts:35. Tests: activation restart/idempotency, missing assessment, prior-checkpoint recovery, denied future scope, retained evidence/history/restricted behavior, both providers.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-10-24 · all four earlier PRDs and current supersession owners checked · 18 existing PRD and 11 design replacement lines · 4 intended lineage gaps folded (4 PRD lines covering 6 earlier criteria, 1 design-owner line); 22 unique earlier criteria now traced · 0 raised as business questions.
Changed after pass 1: AC-DEV-03, AC-RECOVERY-03, AC-DISPLAY-03 (replacement pointers only); TD One authority statement everywhere (replacement pointer only).
Completion: pending.

## Noticed, out of scope
None.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| Real provider/GitHub mutation proofs are implementation obligations; external writes prohibited in design | None yet | Authorized implementation stage |

## Next action
Pass-1 conformance clean: 19 criteria covered, references/assumptions valid, no new questions. Checkpoint pass 1, then final conformance and changed-criteria conflict check; final readiness follows.
