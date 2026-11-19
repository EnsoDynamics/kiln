# Design Refinement State — Kiln Deliver When Audit Loops Run Out

Started: 2026-11-19   Current pass: 5   Status: In progress
Branch: develop
Existing code posture: Preserve for everything in Kiln 1.3.0 the design does not name; removed for the loop stop machinery (source: TD §Existing Code)
PRD words: at start 3870 · growth baseline 3870
Last updated: 2026-11-19 (pass 4 checkpoint)

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
| 3 | 5 | 12 (8 carried + 4) | 9 | 0 | 3 | 0 | 0 |
| 4 | 3 | 10 (7 carried + 3) | 9 | 0 | 1 | 0 | 0 |

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
| Q15 | 2 | Hold-stop waiver keeps covering an id an audit relists with a different kind/problem/action (coverage matches by id only, waivers.ts matchKey/coveringWaiver) | Technical | MEDIUM | 65 → 92 | Resolved | TD hold stop |
| Q16 | 2 | How `{{nextSteps}}` is computed for each hypothetical outcome before the report exists (auditNext needs snapshots) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Prompts, §Verification AC-LAST-03 |
| Q17 | 2 | After a send-back, audits see an item waived at the hold stop as an open holding item and report `needs_you` again; `{{outstanding}}` has no waiver state | Technical | MEDIUM | 75 → 92 | Resolved | TD §Report contract, §Prompts, §Verification AC-ITEM-01 |
| Q18 | 2 | Floor once `atPullRequest` is written and on a finished run (continuation has a fresh ledger; floor would refuse a continuation limit below loops used) | Technical | MEDIUM | 80 → 92 | Resolved | TD §Settings floor, §Loops and the Ledger, §Verification |
| Q19 | 2 | Which reads use `atPullRequest` once written: closure, appendLoop `limitAtStart`/`last`, last-loop `noneLeft`, admission, nextSteps, position, Closing audits (appendLoop and noneLeft read record.settings today) | Technical | MEDIUM | 85 → 95 | Resolved | TD §Loops and the Ledger (Limits in force), across sections |
| Q20 | 2 | `reconstructLedger` for a schema-21 run: a test audit's appended phases rebuilt as delivery (1.3.0) or test loops (this PRD) | Technical | LOW | 65 → 90 | Resolved | TD §Upgrade, §Loops and the Ledger, §Verification AC-CHOICE-01 |
| Q21 | 2 | Continue in normal order wording at the hold stop (existing continue-in-order heading/sentence and warning wrong; markCompleteOffer/forecastNext(pr) say Complete) | Technical | LOW | 80 → 90 | Resolved | TD hold stop, §Verification AC-ITEM-01 |
| Q22 | 2 | Closing audits limits on a run completed with no PR session (Mark complete at a `pr` stop, or precheck on an existing PR): write `atPullRequest` in the completion write? | Technical | LOW | 80 → 92 | Resolved | TD §Loops and the Ledger (`atPullRequest` at completion), §Verification AC-LEFT |
| Q24 | 2 | Schema-24 migration for a complete record with no pull request session (e.g. completed by the precheck on an outside PR): write `atPullRequest` at its completion time? (raised by the Q18/Q19/Q22 writer) | Technical | LOW | 70 → 92 | Resolved | TD §Upgrade, §Verification AC-CHOICE-01 |
| Q23 | 2 | `critical_next_step` can never be outstanding (only on `needs_you` reports, never accepted), so "critical_next_step first under For you" and its proof are unreachable | Technical | LOW | 85 → 97 | Resolved | TD §For you, §Verification AC-ITEM-03 |
| Q25 | 2 | Hold stop offer says Continue "starts the pull request session", but §What a Delivered Run Says lets a run complete on an already-open PR when no session has begun in this execution: which wins on a first arrival? (conformance) | Technical | MEDIUM | 60 → 92 | Resolved | TD §What a Delivered Run Says, hold stop, §Prompts, §Verification; PRD AC-LEFT-01 Replaces |
| Q26 | 2 | PRD AC-CHOICE-02 says raising the test limit after its last loop "runs the test audit again"; TD routing table says nothing runs when the last loop passed on unchanged work (conformance) | Technical | MEDIUM | 60 → 95 | Resolved | PRD AC-CHOICE-02; TD §Routing, §Verification AC-CHOICE-02 |
| Q27 | 2 | PRD never says a hold stop is passed by Continue in normal order (items waived, listed For you); only the TD says it — does a criterion need it? (conformance) | Technical | LOW | 70 → 90 | Resolved | PRD AC-ITEM-01 (+Replaces AC-WAIVE-02/04), Out of Scope; TD §Changes to Earlier Designs; mockup 5b |
| Q28 | 2 | TD puts Closing audits and For you after the pull request section; mockup screen 3 puts them before the "Open the pull request" button row (conformance) | Technical | LOW | 70 → 90 | Resolved | mockup screens 3, 3b |
| Q29 | 3 | Is the test audit that runs after a `continue_test` report with `changedImplementation: true` (delivery audit first) a test loop? TD says fresh test audit is not a loop; 1.3.0 counts it (loop-gate.ts:72,109-114) | Technical | HIGH | 75 → 95 | Resolved | TD §Loops and the Ledger, §Routing, §The Last Test Loop, §Prompts, §Verification |
| Q30 | 3 | Interrupted pull request session passes the saved-block gate (block saved at launch); checkInterrupted/restart complete on a passing PR check with no block test (engine.ts 5911-5916, 5954-5960) | Technical | MEDIUM | 65 → 92 | Resolved | with Q25 |
| Q31 | 3 | JSON shape of `delivered.forYou`/`items` can't hold after-delivery actions, kind-less items, Waived tag, prebuilt line; `effect` meaningless on a finished run (AC-BOT-02) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Interfaces, §For you, §Verification AC-BOT |
| Q32 | 3 | Upgraded 1.3.0 ledger mid-build: test audit's remaining phase leaves matched to its loop by `sourceAuditId` whatever recorded kind (loop-gate.ts:46 filters delivery) | Technical | LOW | 85 → 93 | Resolved | TD §Loops and the Ledger, §Settings floor, §Upgrade, §Verification AC-CHOICE-01 |
| Q33 | 3 | Which write is "the write that starts the first pull request session" (session record before spawn; billing hold can stop a recorded session); block built from the just-frozen values | Technical | LOW | 85 → 92 | Resolved | TD §Loops and the Ledger |
| Q34 | 3 | PRD AC-LAST-02 defines a test loop as phases plus "one session of test fixes"; TD now counts the test audit after a changed-implementation delivery audit as that loop — PRD wording? (conformance) | Technical | LOW | 70 → 92 | Resolved | PRD AC-LAST-02 |
| Q35 | 3 | Hold stop status line shows the latest audit's position ("after loop 3 of 4") though loop 4 was built — misleading? (conformance) | Technical | LOW | 70 → 90 | Resolved | TD §The Status Line; mockup 5b |
| Q36 | 3 | No mockup shows the **Waived** tag under For you, though PRD AC-ITEM-01 requires it (conformance) | Technical | LOW | 80 → 95 | Resolved | TD §For you, §Verification; mockup 3, 4 |
| Q37 | 4 | `{{outstanding}}` lines carry no kind or `waitsOn` (person-items.ts:45), so an audit can't tell which earlier items hold the run, or may re-kind a blocker to `other` on relisting | Technical | MEDIUM | 85 → 92 | Resolved | TD §Prompts, §Verification AC-ITEM-02 |
| Q38 | 4 | TD says 1.3.0 wrote test loops naming the audit they started; code names the predecessor (engine.ts:4766, loop-ledger.ts:40), only Accept named the started audit (4855); floor's "pending" depends on `sourceAuditId` meaning the audit whose report the loop acts on | Technical | LOW | 88 → 92 | Resolved | TD §Loops and the Ledger, §Settings floor |
| Q39 | 4 | PRD AC-CHOICE-02 says a delivery raise "runs a delivery audit"; delivery can close with a passed latest delivery audit (limit lowered to loops used); a later raise with test closed goes to the PR — narrow the delivery sentence like Q26? | Technical | LOW | 70 → 85 | Deferred | — |
| Q40 | 4 | **Pull request description** row forces a PR session when work is already merged in every repository or the execution used early delivery — contradicts AC-PRS-05 "start no further session"; Development Deployments §Evidence and Completion (conformance) | Technical | MEDIUM | 60 → 60 | Pending | — |
| Q41 | 4 | At a PR check stop where only **Pull request description** fails, is Mark final delivery complete offered? ("No waiver matches it" doesn't say) (conformance) | Technical | LOW | 70 → 70 | Pending | — |
| Q11 | 1 | New CLI refuses `kiln settings` loop flags against a 1.3.0 controller (`loop_limits_move_on`) | Technical | LOW | 80 → 95 | Resolved | TD §Interfaces Compatibility, §Removed Controls, §Verification |

## Question notes




### Q39
Proposed (85%): narrow the PRD delivery-raise sentence. After a lowering to the loops used with a passed latest delivery audit, a raise: test open + work changed → delivery audit; test open + unchanged → none; test closed → PR. Draft PRD AC-CHOICE-02 delivery sentence: "Raising the delivery audit limit after its last loop, before the pull request session starts, runs a delivery audit once the test audit loop under way, if any, ends, wherever that limit set from the start would: on the phases its last loop built, or on work changed since the latest delivery audit while a test audit loop is left. A delivery audit that passed on work unchanged since leaves nothing to do. The test audit then runs again only while a test audit loop is left, and otherwise Kiln goes on to the pull request." TD §Routing: split "delivery limit raised" row into latest-delivery-not-a-pass (delivery audit runs even with test closed; then test audit while a loop is left, else PR) and latest-delivery-passed (what auditNext asks with that limit from the start: test open → delivery audit if a test audit changed implementation or work changed, else test audit; test closed → PR). Why <90 / next pass: confirm "while a test audit loop is left" clause is right (with test closed and the latest delivery audit passed but work changed since, is a delivery audit really skipped — does the test-closed rule apply when delivery reopens?), and simplify the PRD sentence to plain terms.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-19 · 35 earlier criteria changed (21 already covered) · 14 Replaces-line fixes applied (5 added, 1 widened, 3 removed, 5 corrected; Changes: line gained Continue Added Phases and Completion Waivers) · 0 raised as questions. Note: `continue-with-phases` vs Bot Control's pending SCOPE-001 (new-run setup stays in browser) — not a conflict, PRD names the command on purpose and AC-BOT-01 keeps settings and Authorize early merges in the browser.
Changed after pass 1: AC-LEFT-01 (Replaces AC-PR-01 v1 and AC-PRS-05 multi-repo: open PR completes only after a session writes the block, pass 4); AC-LAST-02 (test loop includes the one after a changed-implementation delivery audit, pass 4); AC-CHOICE-02 test-raise sentence (pass 4); AC-ITEM-01 (how the hold stop is passed; Replaces AC-WAIVE-02/04, pass 3); AC-CHOICE-02 (floor counts the loops the latest audit or session has been told it will have and not yet used); AC-ITEM-03 (after-delivery actions listed under For you; AC-NEUTRAL-03 Replaces parenthetical)

## Register re-sort
Pass 1: 2026-11-19 · 1 open entry (TEST-001) · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 1 stays business, below the line (folded). Doubt check doubted it (ruling settles it); orchestrator kept it business: the ruling addressed the loop stop, not delivering an unaccepted failing test, and the earlier release stopped on that (Audit Loop Limits AC-TEST-02).

## Noticed, out of scope
- An audit marked complete at a `needs_you` stop adds none of its items to the ledger, so its blockers and `other` items never reach the hold check or For you (pre-existing, person-items.ts:5).
- Upgraded runs with an `allowed` epoch count Closing audits and the floor only from that epoch (`countedLoops`).
- Waived-check counts differ between `kiln status` (`activityWaivers`, src/control/waiver-facts.ts ~99: every `continued` waiver once the step is done) and the page (`waivedFacts`, src/engine/snapshot.ts ~1549: only waivers after the step's `doneAt`). Pre-existing; the hold stop's waiver will show it on final delivery. No PRD criterion counts waived checks.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 5: discovery; investigate Q39 (deferred), Q40, Q41 first. Then conformance, checkpoint.
