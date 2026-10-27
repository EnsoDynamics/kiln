# Design Refinement State — Kiln live session control

Started: 2026-10-27 UTC   Current pass: 1   Status: In progress
Branch: wt/livectl-kiln-tdd-refine
Existing code posture: Preserve (source: Technical Design)
PRD words: at start 3365 · growth baseline 3365
Last updated: 2026-10-27 UTC

## Documents
| Document | Path |
|---|---|
| PRD | kiln-live-session-control-prd.md |
| Technical Design | kiln-live-session-control-technical-design.md |
| Assumptions | kiln-live-session-control-assumptions.md |
| Supporting | kiln-live-session-control-investigation.md; mockups/kiln-live-session-control.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 4 | 4 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|

| Q1 | 1 | Enforceable ownership for ordinary terminal resume? | Technical | HIGH | 45 → 95 | Resolved | TD ownership section; investigation ownership probes |
| Q2 | 1 | Complete subordinate tool admission, checkpoint and release coverage? | Technical | HIGH | 65 → 97 | Resolved | TD Safe Checkpoint and Release; investigation accounting probes |
| Q4 | 1 | Literal input retains applicable turn-start context? | Technical | HIGH | 65 → 94 | Resolved | TD Literal input; investigation dynamic-context probes |
| Q3 | 1 | One live instruction authority shared with final bot design? | Technical | MEDIUM | 90 → 98 | Resolved | TD durable records/bot extension; investigation integration contract |

## Question notes

### Q1
Resolved by design decision95 after independent contract review: provider-wide launch exclusion was TD overreach. Approved flow requires serialized Kiln-controlled admission and trustworthy known-owner checks; arbitrary new external direct launch after admission is outside that serialization, not a global exclusion guarantee. Ordinary terminal positive proof: original and different cwd same UUID detected, PID/start+pending --resume argv, clean /exit release; headless self registers before prompt, stale mismatch unknown. Full /private/tmp/livectl-ownership-proof/approved-flow.md. No general provider-wide acquisition primitive found; retain that negative limit. Per-launch settings hook did not propagate to ordinary same-ID resume: peer completed while owner alive. Explicit-hook peer blocked before model work. Proof directory /private/tmp/livectl-ownership-proof/launch-hooks-1793068567334. Persistent workspace prompt guard serialized model admission, but SessionStart could not refuse startup, so no transcript/process exclusivity. No changed command/flow needed for approved scope; independent reviewer agreed with PRD-specific boundary. Writer folded both negative limit and positive approved-flow evidence. Full prose/evidence /private/tmp/livectl-ownership-proof/Q1-verdict.md.

### Q2
Foreground/background Agent gate propagation, parallel/failure settlement, helper death and atomic admission proved in real fixtures. Resolved by design decision aligned to approved tracked-work boundary: known unresolved provider/tool/process identities block release; universal downstream effect containment was TD overreach, not a PRD obligation. Detached child wrote at 15.217s after clean CLI exit at 6.673s. macOS kqueue NOTE_TRACK unsupported, NOTE_FORK gives no child PID. Do not claim arbitrary untracked downstream effects stopped; retain negative evidence as proof limit. Artifacts /private/tmp/livectl-coverage-proof; Q2 folded into TD and investigation. Fsync fixture proves local process death, not power-loss durability; TD must specify containing-directory fsync too.

### Q3
Final bot refinement landed through d881ecc (consolidation e2a0705). One execution-owned digest-partitioned instruction journal; live action-specific evidence extends same authoritative receipt; PRD-wide locator rebuildable. Dedupe across execution replacement before eligibility/token validation, preserve original target/exact action input. New attempt ID before spawn; legacy identity execution/session/index. Browser works without bot discovery. Live text unchanged; stopped reply retains trim. Investigator confidence98; folded into shared receipt/admission contract.

### Q4
Resolved mechanism at94 confidence: exact CLI2.1.311/macOS native text_not_typed literal input with client_composed unset. Three-way slash/file exact replay plus new random UserPromptSubmit context marker on every no-tool input passed. Nested CLAUDE and skill listings retained. MCP resource server listed but ordinary input did not read resource; no empirical suppression-positive claim. Require validated version profiles, preserve existing execution on unproved versions; no rewrites/global settings. Folded into TD literal/profile gate and investigation dynamic-context results. No broader public stability or MCP read-positive claim. Proofs /private/tmp/livectl-literal-proof.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conformance
Pass1: complete; no new questions.24 relative links/fragments,49 uniqueHTML IDs,16 mockup states, JS syntax, diff check passed. Earlier Chrome counter evidence covers8 composer states,4001 units rejected without truncation,2000 emoji counted4000.

## Conflict check
Pass 1: 2026-10-27 UTC · 4 intended pointer groups · 0 unintended business conflicts. Writer must add scoped Replaces lines for v1 layout/pause wording/automatic recovery, usage recovery holds, bot extension and audit return. Existing handoff/completion-audit pointers suffice.
Changed after pass 1: AC-LIVE-01, AC-LIVE-04, AC-MSG-03, AC-TAKE-01, AC-BACK-04, AC-BOT-01/02 (scoped Replaces pointers; AC-BACK-04 acknowledged-message hold clarification).
Completion: pending.

## Noticed, out of scope
None.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| None | — | Runtime/documentation access established through permitted escalation; no missing prerequisites |

## Next action
Pass1 complete,4 questions resolved,0 assumptions/deferred/blocked. Commit checkpoint, then run scoped pass2 discovery (exclude tracked questions). No product implementation claims. Discovery found no additional questions; conformance must align AC-BACK-04 message hold release and visible input limit in mockup. Temporary proof artifacts live under /tmp, outside product source. No product implementation.
