# Design Refinement State — Kiln Deliver When Audit Loops Run Out

Started: 2026-11-19   Current pass: 3   Status: In progress
Branch: develop
Existing code posture: Preserve for everything in Kiln 1.3.0 the design does not name; removed for the loop stop machinery (source: TD §Existing Code)
PRD words: at start 3870 · growth baseline 3870
Last updated: 2026-11-19 (pass 2 checkpoint)

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md |
| Technical Design | docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md |
| Assumptions | docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-assumptions.md |
| Supporting | docs/changes/kiln-deliver-when-audit-loops-run-out/mockups/kiln-deliver-when-audit-loops-run-out.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 12 | 12 | 10 | 0 | 2 | 0 | 0 |
| 2 | 9 (+2 raised in pass) | 12 (3 carried + 9) | 10 | 0 | 2 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Frozen `atPullRequest` limits when `finalNeedsAudits` sends a run back to audits after the PR session started, then the hold stop | Technical | HIGH | 65 → 90 | Resolved | TD §Loops and the Ledger, hold stop, §Verification |
| Q2 | 1 | Hold stop on `pr` after the PR step already ran: `offerWording` offers Mark complete (completes with no PR) instead of Continue in normal order | Technical | HIGH | 75 → 92 | Resolved | TD §Items for a Person (hold stop), §Verification AC-ITEM-01 |
| Q3 | 1 | Upgraded `items_listed` stop on a passed test report: TD says a later audit relists items with kinds, but `auditNext` routes to final_delivery (AC-CHOICE-03) | Technical | MEDIUM | 55 → 90 | Resolved | TD §Upgrade, §Verification AC-CHOICE-03 |
| Q4 | 1 | How a holding item is settled at the hold stop (no session, no Reply; only waive), and how For you shows a waived holding item | Business→Technical | MEDIUM | 60 → 93 | Resolved | TD hold stop, §For you, §Verification AC-ITEM-01 |
| Q5 | 1 | Limit lowered during a non-last test-fix session: its report lists no `test` items, admission refuses → a limit-caused stop (AC-STOP-04) | Technical | MEDIUM | 70 → 91 | Resolved | TD §Settings floor, §The Last Test Loop, §Routing, §Verification; PRD AC-CHOICE-02 |
| Q6 | 1 | `kindsNeeded` stop whose conversation can't be reopened (no transcript, takeover held, Codex history gone) | Technical | MEDIUM | 75 → 92 | Resolved | TD §Upgrade, §Verification AC-CHOICE-03 |
| Q7 | 1 | Kind words For you shows for `other` (mockup screen 3 shows a sub-category the kind doesn't carry) | Technical | LOW | 70 → 92 | Resolved | TD §For you, §Verification AC-ITEM-03; mockup screens 3, 4 |
| Q8 | 1 | Schema-24 migration writes `atPullRequest` for records whose PR session already started | Technical | LOW | 75 → 92 | Resolved | TD §Upgrade, §Loops and the Ledger, §Verification AC-CHOICE-01 |
| Q9 | 1 | Test limit help text during a run with no `lastLoopSentence` (upgraded Always stop and ask me run) | Business→Technical | LOW | 75 → 95 | Resolved | TD §Settings, §Interfaces, §Verification AC-CHOICE-01 |
| Q10 | 1 | Items the hold row carries vs how known-problem rows itemize and match today (`waivers.ts:122`, 238) | Technical | LOW | 80 → 92 | Resolved | TD hold stop, §For you, §Verification AC-ITEM-01 |
| Q12 | 1 | Precheck completes on an earlier PR with no new session after a return to the audits: that PR's description lacks the new For you items and loop counts (AC-ITEM-03, AC-LEFT-01) | Technical | MEDIUM | 50 → 93 | Resolved | TD §What a Delivered Run Says, hold stop, §Prompts, §Verification AC-LEFT |
| Q13 | 1 | Finished-page order when For you lists a critical finding: AC-ITEM-03 puts For you first then; mockup screen 3 puts Closing audits first; TD doesn't say (raised by conformance) | Technical | LOW | 60 → 93 | Resolved | TD §What a Delivered Run Says, §Verification AC-ITEM-03; mockup 3b |
| Q14 | 2 | Complete screen's existing "Remaining human actions" card (`humanActions`, view/src/screens/Complete.svelte:27,135-141) vs For you listing human actions (AC-ITEM-03): shown twice? TD never mentions the card | Technical | LOW | 60 → 93 | Resolved | TD §For you, §Prompts, §Existing Code, §Changes to Earlier Designs; mockup 3, 4 |
| Q15 | 2 | Hold-stop waiver keeps covering an id an audit relists with a different kind/problem/action (coverage matches by id only, waivers.ts matchKey/coveringWaiver) | Technical | MEDIUM | 65 → 75 | Deferred | — |
| Q16 | 2 | How `{{nextSteps}}` is computed for each hypothetical outcome before the report exists (auditNext needs snapshots) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Prompts, §Verification AC-LAST-03 |
| Q17 | 2 | After a send-back, audits see an item waived at the hold stop as an open holding item and report `needs_you` again; `{{outstanding}}` has no waiver state | Technical | MEDIUM | 75 → 75 | Deferred | — |
| Q18 | 2 | Floor once `atPullRequest` is written and on a finished run (continuation has a fresh ledger; floor would refuse a continuation limit below loops used) | Technical | MEDIUM | 80 → 92 | Resolved | TD §Settings floor, §Loops and the Ledger, §Verification |
| Q19 | 2 | Which reads use `atPullRequest` once written: closure, appendLoop `limitAtStart`/`last`, last-loop `noneLeft`, admission, nextSteps, position, Closing audits (appendLoop and noneLeft read record.settings today) | Technical | MEDIUM | 85 → 95 | Resolved | TD §Loops and the Ledger (Limits in force), across sections |
| Q20 | 2 | `reconstructLedger` for a schema-21 run: a test audit's appended phases rebuilt as delivery (1.3.0) or test loops (this PRD) | Technical | LOW | 65 → 90 | Resolved | TD §Upgrade, §Loops and the Ledger, §Verification AC-CHOICE-01 |
| Q21 | 2 | Continue in normal order wording at the hold stop (existing continue-in-order heading/sentence and warning wrong; markCompleteOffer/forecastNext(pr) say Complete) | Technical | LOW | 80 → 90 | Resolved | TD hold stop, §Verification AC-ITEM-01 |
| Q22 | 2 | Closing audits limits on a run completed with no PR session (Mark complete at a `pr` stop, or precheck on an existing PR): write `atPullRequest` in the completion write? | Technical | LOW | 80 → 92 | Resolved | TD §Loops and the Ledger (`atPullRequest` at completion), §Verification AC-LEFT |
| Q24 | 2 | Schema-24 migration for a complete record with no pull request session (e.g. completed by the precheck on an outside PR): write `atPullRequest` at its completion time? (raised by the Q18/Q19/Q22 writer) | Technical | LOW | 70 → 70 | Pending | — |
| Q23 | 2 | `critical_next_step` can never be outstanding (only on `needs_you` reports, never accepted), so "critical_next_step first under For you" and its proof are unreachable | Technical | LOW | 85 → 85 | Deferred | — |
| Q25 | 2 | Hold stop offer says Continue "starts the pull request session", but §What a Delivered Run Says lets a run complete on an already-open PR when no session has begun in this execution: which wins on a first arrival? (conformance) | Technical | MEDIUM | 60 → 60 | Pending | — |
| Q26 | 2 | PRD AC-CHOICE-02 says raising the test limit after its last loop "runs the test audit again"; TD routing table says nothing runs when the last loop passed on unchanged work (conformance) | Technical | MEDIUM | 60 → 60 | Pending | — |
| Q27 | 2 | PRD never says a hold stop is passed by Continue in normal order (items waived, listed For you); only the TD says it — does a criterion need it? (conformance) | Technical | LOW | 70 → 70 | Pending | — |
| Q28 | 2 | TD puts Closing audits and For you after the pull request section; mockup screen 3 puts them before the "Open the pull request" button row (conformance) | Technical | LOW | 70 → 70 | Pending | — |
| Q11 | 1 | New CLI refuses `kiln settings` loop flags against a 1.3.0 controller (`loop_limits_move_on`) | Technical | LOW | 80 → 95 | Resolved | TD §Interfaces Compatibility, §Removed Controls, §Verification |

## Question notes


### Q15
Proposed (75%): coverage stays on id, ignores wording, but `against` becomes `<id>/<kind>` so a relisting that changes between holding kinds (blocker↔business_question) stops again. TD hold stop: "`subject` is the item's ledger id (`item-<n>`) and `against` is `<id>/<kind>`; `text` is its kind's words, problem, action and what waits on it. … A relisting that rewords an item keeps its waiver; one that gives it another holding kind is a different need and stops the run again on that item." TD §Prompts audit-session.txt: "A need that differs from an outstanding item's is a new entry with no `id`. When an item's need is met and another remains, settle the item and list the other as new; never relist a different need under an old id." Evidence: person-items.ts 34-38 (relisting replaces problem/action, keeps criterion); TD §Report contract keeps kind/waitsOn across relisting unless given; waivers.ts 155-164 coveringWaiver compares `against`. Open: whether `against` = id/kind breaks the "against names the item, not feature heads, so it survives commits" property (it shouldn't) and how the Waived tag lookup (subject = id) interacts.

### Q17
Proposed (75%): fix prompt and admission. §Prompts audit-session.txt: "`{{outstanding}}` marks each item whose current `<id>/<kind>` a **Nothing holds the run** waiver covers: "waived at final delivery <time>: settle it if it is done, otherwise relist it; it holds nothing and is never a reason for `needs_you`". The `needs_you` guidance counts only holding items no such waiver covers." §Report contract needs_you refusal: "a `needs_you` report with no `critical_next_step` item, and no `blocker` or `business_question` item that a **Nothing holds the run** waiver does not cover (matched as at the hold stop)." §Verification AC-ITEM-01: after Continue in normal order and a send-back, prompt marks the waived item, a needs_you report whose only holding item is that one is refused, run reaches the PR. Evidence: person-items.ts 45 outstandingLines; validate-report.ts 16, 35-41 (`record` in context); engine.ts 4903. Open: whether refusing that needs_you report (a refusal = a Needs you stop path?) is right vs admitting it as passed; check what a refused report does to the run.

### Q23
Deferred for the per-pass cap. Proposed (85%): order For you by `critical` only and prove with `critical`; the word table may keep `critical_next_step`. Evidence: person-items.ts:23-41, effective-result.ts:14-18.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-19 · 35 earlier criteria changed (21 already covered) · 14 Replaces-line fixes applied (5 added, 1 widened, 3 removed, 5 corrected; Changes: line gained Continue Added Phases and Completion Waivers) · 0 raised as questions. Note: `continue-with-phases` vs Bot Control's pending SCOPE-001 (new-run setup stays in browser) — not a conflict, PRD names the command on purpose and AC-BOT-01 keeps settings and Authorize early merges in the browser.
Changed after pass 1: AC-CHOICE-02 (floor counts the loops the latest audit or session has been told it will have and not yet used); AC-ITEM-03 (after-delivery actions listed under For you; AC-NEUTRAL-03 Replaces parenthetical)

## Register re-sort
Pass 1: 2026-11-19 · 1 open entry (TEST-001) · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 1 stays business, below the line (folded). Doubt check doubted it (ruling settles it); orchestrator kept it business: the ruling addressed the loop stop, not delivering an unaccepted failing test, and the earlier release stopped on that (Audit Loop Limits AC-TEST-02).

## Noticed, out of scope
- An audit marked complete at a `needs_you` stop adds none of its items to the ledger, so its blockers and `other` items never reach the hold check or For you (pre-existing, person-items.ts:5).
- Upgraded runs with an `allowed` epoch count Closing audits and the floor only from that epoch (`countedLoops`).
- A pull request opened outside Kiln before any session ran lets the precheck complete the run with no For you block (pre-existing; Preserve).
- Waived-check counts differ between `kiln status` (`activityWaivers`, src/control/waiver-facts.ts ~99: every `continued` waiver once the step is done) and the page (`waivedFacts`, src/engine/snapshot.ts ~1549: only waivers after the step's `doneAt`). Pre-existing; the hold stop's waiver will show it on final delivery. No PRD criterion counts waived checks.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 3: discovery (carry Q15, Q17, Q23 deferred; Q24–Q28 pending, ranked first). Q23 deferred, Q24 pending for pass 3. Q5, Q12 resolved.
