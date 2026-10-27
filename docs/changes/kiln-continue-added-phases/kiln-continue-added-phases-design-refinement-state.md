# Design Refinement State — Kiln Continue Added Phases

Started: 2026-10-27   Current pass: 2   Status: In progress
Branch: wt/continuep-kiln-tdd-refine
Existing code posture: Preserve (source: Technical Design)
PRD words: at start 2294 · growth baseline 2294
Last updated: 2026-10-27T13:26Z

## Documents
| Document | Path |
|---|---|
| PRD | kiln-continue-added-phases-prd.md |
| Technical Design | kiln-continue-added-phases-technical-design.md |
| Assumptions | kiln-continue-added-phases-assumptions.md |
| Supporting | mockups/kiln-continue-added-phases.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 3 | 3 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Exact preparation Markdown grammar and destination reconciliation | Technical | HIGH | 75 → 94 | Resolved | TD Readiness and Planned Preparation / historical fixture / coverage |
| Q2 | 1 | Original human authority binding across fresh executions | Technical | HIGH | 80 → 95 | Resolved | TD Preparation authority / AuthorityEvidence / AC-CONTINUE-04 coverage |
| Q3 | 1 | Verification commands prove integrated revision before implementation | Technical | HIGH | 85 → 96 | Resolved | TD Preparation verification / interfaces / records / AC-CONTINUE-02 coverage |

## Question notes

### Q1
Answer: deterministic versioned Markdown preparation extraction in Phase-specific notes, explicit prerequisite IDs/source repository/ref+commit/destination and verification; reject conflicting destination assertions across dependencies/plan/notes. Ordinary prose recovery, no private state editing. Pin historical pricing 8fe0f45477c190f09611d3990c5782b3b6dccee8/source 5ce52cc8382ad631ddcec7c659d9d53c334855bc; raw blocked by destination conflict and missing phase8 doc; ready fixture explicitly reconciles both plus authority/check evidence. Evidence: phase-plan.ts:139–147,164–198; phase-document.ts:55–58,68–75; markdown-sections.ts; immutable pricing Git trees. Folded in TD; resolved by design decision at 94%.

### Q2
Answer: retain immutable private AuthorityEvidence: source kind/original grant or explicit provider conversation+message identity, exact source text with surrounding restrictions, UTC observation, retained bytes/digest/provenance, normalized repository/source revision/destination/operation/conditions/exclusions, bound preparation and authority revision. Resolve only explicitly referenced original sources using local history readers; quotation/caller/provider-user role alone not a grant. Trusted local-user boundary, no cryptographic identity claim. Assigned-feature preparation uses narrowly applicable original permission; delivery-base integration additionally requires new execution target grant, never copied. Revalidate at acceptance/preparation/implementation admission. Block missing/conflicting/ambiguous evidence; recovery restore/reference source, reconcile instructions or existing Authorize early merges for uncovered target. No extra approval if existing source suffices. Evidence: control/delivery-evidence.ts:25,35–38; control/commands.ts:15–24,63–66; engine.ts:1112–1140; state/development-delivery.ts:25–31,112–118; development-deployments TD:38–44; original pricing phase8 restrictions. Folded in TD; resolved by design decision at 95%.

### Q3
Answer: engine-owned sequential verification after preparation-only provider turn and normal cleanup/provenance checks, no provider turn concurrent. Require committed conflict-free assigned-branch checkpoint with repo/worktree/branch/HEAD/tree/index plus actual tracked+nonignored untracked fingerprints. Independently verify source integration. Exact executable/argv/check ID/cwd/finite timeout and pinned document/config/script source from accepted checkpoint; ordinary npm test/pytest allowed without SHA output, no free-form shell/eval/substitution/agent override. Respect existing environment/authority/provider restrictions; blocked if runner cannot enforce them. Before/after each command checkpoints identical; unexpected changes retained and invalidate gate. Engine invocation/process/exit/time/output/checkpoint receipts durable. Recheck checkpoint+source+authority+holds before same-conversation implementation dispatch; interrupted process reconciled before retry, external side effects unresolved block repetition. No arbitrary external-writer/transient-edit exclusion claimed. Evidence: engine.ts:1250–1269; codex-evidence.ts:302–321; development-delivery.ts:135–138,317–330; audit/snapshots.ts:87–114; helper-process.ts:78–139. Folded in TD; resolved by design decision at 96%.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-10-27 · 11 earlier criteria changed · 7 replacement lines present: original 1 plus 6 added lines covering 10 additional earlier criteria · 0 unintended conflicts. Compared all 11 PRDs and followed scoped supersession chains. Folded: AC-FIND-02 replaces v1 AC-RUN-01; AC-CONTINUE-02 replaces v1 AC-START-07 and multi-repo AC-SPACE-01/AC-PRS-04; AC-OFFER-01 replaces v1 AC-WATCH-02/AC-LOOK-01, multi-repo AC-PRS-03/AC-SHOW-01/AC-SPACE-03 and development-deployments AC-DISPLAY-03. Earlier source documents remain unchanged until implementation adds reverse links.
Changed after pass 1: none.
Completion: pending.

## Noticed, out of scope
None.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

Investigation environment: local code, Git objects and requirements available. Network Git works through escalation; no external data mutation authorized or needed. Runtime implementation and live provider execution outside scope.

## Next action
Pass-1 conformance complete: all16 criteria,20 links,7 document refs,git diff --check pass; real Chrome exercised all six states, collapse/return, stale/blocked Continue disabled, continuation and pause. No Pending questions. Checkpoint then pass2 discovery (running).
