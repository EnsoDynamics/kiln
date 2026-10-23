# Design Refinement State — Codex support for Kiln

Started: 2026-10-23   Current pass: 2   Status: Pass complete
Branch: develop
Existing code posture: Preserve (source: Technical Design, Existing Code)
PRD words: at start 2876 · growth baseline 2876
Last updated: 2026-10-23 UTC

## Documents
| Document | Path |
|---|---|
| PRD | kiln-codex-support-prd.md |
| Technical Design | kiln-codex-support-technical-design.md |
| Assumptions | kiln-codex-support-assumptions.md |
| Supporting | kiln-codex-support-research.md |

## Preflight
Shared develop checkout; fast-forward-only pull succeeded, already current at 77bd463. User explicitly requires this checkout and preservation of unrelated staged README.md, view/index.html, view/src/assets/kiln-favicon.svg. No other live session marker identified. Favicon session subsequently committed and pushed aaaba96 independently; its DONE log confirms closure. HEAD advanced without touching governing documents; README remains staged and excluded. All four governing documents read in full; independent review read from 77bd463 commit body. Requirements-only commits authorized; push expressly withheld. No product implementation or external writes authorized. Installed CLI/schema/history reads available; real quota exhaustion and Linux/Windows runtime proof have not been established. Record evidence gaps honestly.

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 3 | 2 | 0 | 1 | 0 | 0 |
| 2 | 0 | 2 (Q1, Q2 reopened) | 2 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|

| Q1 | 1, 2 | Can unchanged published-method parent/child and manual work satisfy the authoritative decoder and activity proof? | Technical | HIGH | 65 → 85 | Resolved by decision (runtime proof unrun) | TD Overview, Proof gate1, Open Questions; Research Recorded Frontier Evidence |
| Q2 | 1, 2 | What structured scope/reset and account permission can release a real Codex usage stop? | Technical | HIGH | 75 → 95 | Resolved | TD Readings and identity, Classification and bounded release, schema, proof gates; Research Usage Identity and Recovery Evidence |
| Q3 | 1 | What native Windows shell audit profile supports required normal work? | Technical | HIGH | 85 → 94 | Resolved | TD Unattended execution profile, Authoritative evidence, proof gates; Research Native Windows Profile Evidence |

## Question notes

### Q1
Proposed answer: audit the recorded frontier using matched raw task_started/task_complete turn_id and normalized Turn.status; no global exclusive lease is required. Private idle/notLoaded/loaded-list absence alone proves nothing externally. Unknown/missing terminal facts remain inconclusive. Nonexecuting Acorn syntax inventory of disposable parent 01a1668e-511f-74b1-8195-4b7ce60de0ed found 11 raw exec wrappers with 21 nested exec_command/apply_patch calls, literal AST forms fitting proposed grammar; this is not a semantic decoder coverage test. Child discovery metadata initialization timed out. No identified unchanged published-method parent/child/manual corpus available. Actual ordinary-method wrapper viability remains 85%, pre-integration proof unresolved. Deferred in passes1 and2 at unchanged confidence; resolve by explicit design decision per skill: choose bounded raw decoder+frontier candidate and proof-first work, blocking normal integration/automatic passage/support claim until unchanged parent/child/manual proof passes. Decision selects what to prove, not runtime success. Concrete frontier subdecision is >95%.

### Q2
Pass1 and pass2 alignment folded: PRD AC-RECOVER03 must explicitly count fresh provider ordinary account-wide permission as evidence for one original-model attempt without an identified window, with repeat-refusal suppression and unknown→Needs you. This narrows existing fresh-reading-may-proceed rule, no new Business assumption. Prior answer: codex-cli0.162.1 stable usage identity is account/rateLimits/read.result.accountId, corroborated by account/read.result.workspaceRouting.chatgptAccountId before/after; account contains no account ID. Missing/inconsistent identity prevents automatic account-change release. ordinaryUsageAllowed is account-wide ordinary-included-usage permission, not model entitlement/window recovery. A fresh full true with matching identity permits one original-conversation/original-settings resume attempt absent known applicable model/admin/spend-control blocks; false blocks, null is unknown. Never infer permission from percentages/reset/credits/earned resets; normalModelSlug is quota-alias display/reasoning relation, not refusing-window scope. Persist consumed semantic fingerprint before dispatch. Initial fresh true after refusal can permit one attempt even if earlier true; repeated refusal before model activity suppresses unchanged true. Later attempt requires proven blocked-to-allowed transition, different stable account fresh permission, or newly established applicable recovery event, not timestamps/IDs. Scalar codexErrorInfo usageLimitExceeded has no structured allowance/model/reset in TurnError: pinned-profile reset-only recovery unsupported; no prose parsing or convenient window-reset attachment. Unknown permission → Needs you/manual recovery. Future validated profile may implement PRD conditional reset-only rule.
Evidence: installed GetAccountRateLimitsResponse/GetAccountResponse/WorkspaceRouting/RateLimitSnapshot/TurnError/CodexErrorInfo schemas; fresh read-only metadata probe matched routing identity before/after usage identity, true ordinary permission, one codex bucket normalModelSlug=null, spendControlReached=false. No model turn/login change/exhaustion. Actual refusal, reset, changed-account and retry-suppression runtime remain unrun release proofs.

### Q3
Answer in current serialized writer fold: native PowerShell executable/version and literal command/path grammar through fixed nonexecuting ParseInput helper; Windows sandbox readiness must be ready and permitted managed profile. Choose explicit no-fallback MXC candidate, never auto-provision or relax policy. Native runtime/cleanup/roots/Git proof remains unrun. Investigation confidence94%; installed WindowsSandboxReadinessResponse and ConfigRequirements schemas, existing Bash-only reader, official Microsoft parser and OpenAI Windows/config docs checked.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-10-23 · whole PRD checked against earlier PRDs/changes; five criterion rows need additional intended Replaces pointers; no unintended conflict. Writer folded links for AC-MODEL-02, AC-WORK-03, AC-WORK-04, AC-USAGE-04, AC-RECOVER-02 and Claude/Codex audit wording qualification.
Changed after pass 1: AC-MODEL-02, AC-WORK-03, AC-WORK-04, AC-USAGE-04, AC-RECOVER-02, AC-RECOVER-03 (intended supersession references; WORK-04/RECOVER-02 make reviewed design behavior explicit, no new product scope).
Pass 1 conformance: clean after bounded fixes; PRD 3058, TD 6497, assumptions 158, research 1829 words; 16 local links and 24 mapped criteria pass.
Completion: 2026-10-23 · prior five amended criteria checked at 7c877bd; AC-RECOVER-03 checked after pass2 alignment; all intended partial replacements present, no unintended conflicts. Both conflict checks ran.

## Noticed, out of scope
None.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass2 conformance complete; explicit positive/blocked/unknown PRD rows aligned with TD. Six changed criteria conflict-checked. PRD3108, TD6583, research1892, assumptions158 words. Checkpoint then final readiness verification, completion and consolidation. No normal Codex integration readiness claim until unrun audit proof passes.
