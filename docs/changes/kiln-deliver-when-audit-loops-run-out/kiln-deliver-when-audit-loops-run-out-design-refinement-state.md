# Design Refinement State — Kiln Deliver When Audit Loops Run Out

Started: 2026-11-19   Current pass: 2   Status: In progress
Branch: develop
Existing code posture: Preserve for everything in Kiln 1.3.0 the design does not name; removed for the loop stop machinery (source: TD §Existing Code)
PRD words: at start 3870 · growth baseline 3870
Last updated: 2026-11-19 (pass 1 checkpoint)

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

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Frozen `atPullRequest` limits when `finalNeedsAudits` sends a run back to audits after the PR session started, then the hold stop | Technical | HIGH | 65 → 90 | Resolved | TD §Loops and the Ledger, hold stop, §Verification |
| Q2 | 1 | Hold stop on `pr` after the PR step already ran: `offerWording` offers Mark complete (completes with no PR) instead of Continue in normal order | Technical | HIGH | 75 → 92 | Resolved | TD §Items for a Person (hold stop), §Verification AC-ITEM-01 |
| Q3 | 1 | Upgraded `items_listed` stop on a passed test report: TD says a later audit relists items with kinds, but `auditNext` routes to final_delivery (AC-CHOICE-03) | Technical | MEDIUM | 55 → 90 | Resolved | TD §Upgrade, §Verification AC-CHOICE-03 |
| Q4 | 1 | How a holding item is settled at the hold stop (no session, no Reply; only waive), and how For you shows a waived holding item | Business→Technical | MEDIUM | 60 → 93 | Resolved | TD hold stop, §For you, §Verification AC-ITEM-01 |
| Q5 | 1 | Limit lowered during a non-last test-fix session: its report lists no `test` items, admission refuses → a limit-caused stop (AC-STOP-04) | Technical | MEDIUM | 70 → 85 | Deferred | — |
| Q6 | 1 | `kindsNeeded` stop whose conversation can't be reopened (no transcript, takeover held, Codex history gone) | Technical | MEDIUM | 75 → 92 | Resolved | TD §Upgrade, §Verification AC-CHOICE-03 |
| Q7 | 1 | Kind words For you shows for `other` (mockup screen 3 shows a sub-category the kind doesn't carry) | Technical | LOW | 70 → 92 | Resolved | TD §For you, §Verification AC-ITEM-03; mockup screens 3, 4 |
| Q8 | 1 | Schema-24 migration writes `atPullRequest` for records whose PR session already started | Technical | LOW | 75 → 92 | Resolved | TD §Upgrade, §Loops and the Ledger, §Verification AC-CHOICE-01 |
| Q9 | 1 | Test limit help text during a run with no `lastLoopSentence` (upgraded Always stop and ask me run) | Business→Technical | LOW | 75 → 95 | Resolved | TD §Settings, §Interfaces, §Verification AC-CHOICE-01 |
| Q10 | 1 | Items the hold row carries vs how known-problem rows itemize and match today (`waivers.ts:122`, 238) | Technical | LOW | 80 → 92 | Resolved | TD hold stop, §For you, §Verification AC-ITEM-01 |
| Q12 | 1 | Precheck completes on an earlier PR with no new session after a return to the audits: that PR's description lacks the new For you items and loop counts (AC-ITEM-03, AC-LEFT-01) | Technical | MEDIUM | 50 → 85 | Deferred | — |
| Q13 | 1 | Finished-page order when For you lists a critical finding: AC-ITEM-03 puts For you first then; mockup screen 3 puts Closing audits first; TD doesn't say (raised by conformance) | Technical | LOW | 60 → 60 | Pending | — |
| Q11 | 1 | New CLI refuses `kiln settings` loop flags against a 1.3.0 controller (`loop_limits_move_on`) | Technical | LOW | 80 → 95 | Resolved | TD §Interfaces Compatibility, §Removed Controls, §Verification |

## Question notes

### Q5
Proposed answer (85%): floor also adds one while a test-fix session counted `last: false` is running (option 1); admission keeps reading the current limit. Option 2 (admission reads the loop's `last` flag) rejected: a `continue_test` report names covered criteria only via `test` items (validate-report.ts:63-73), so saved work would be silently dropped (AC-LAST-03/04/05). Draft prose, TD §Settings replacing "The floor." from its second sentence:
> The floor is the loops of that kind used, plus one while the latest activity of that kind was launched with a loop of its kind still to follow, and has either not settled or settled with findings not yet counted as a loop. Two activities are launched that way. One is an audit allocated as an audit, not as a loop: it ran because a loop was left, so its findings take that loop. The other is a session of test fixes counted with `last: false`: it was told more test loops follow (§The Last Test Loop), so its saved test work or phases take the next one. Without the extra one, lowering a limit while an audit runs would make its findings a loop past the limit. Lowering the test limit while such a session runs would make it the last loop without its having been told, so its `continue_test` report would list no `test` item and be refused, a Needs you stop caused by a limit (AC-STOP-04). With it, the ledger's `last` flag, the prompt and admission's reading of the current limit always agree. A session counted with `last: true` adds nothing.
New row, TD §Routing After the Last Loop cases table:
> | The test limit lowered to its floor while a session of test fixes that was not the last runs, and it reports `continue_test` | The continuation is the next test loop and the last: told so, it carries the sentence when the run has one, lists its `test` items, and the pull request follows |
Why not ≥90: leftover gap — a fresh test audit launched with ≥2 loops left, limit lowered to used+1, reports `completion_phases`: its phases become the last loop and plain Weak rows they don't fix are never listed. Next pass: confirm whether that gap is the ordinary last-loop-with-phases case (AC-LAST-04 last sentence) or a defect; check the floor wording against "latest activity settled with findings not yet counted". Evidence: audit-loops.ts:132-138 appendLoop; engine.ts:4865-4868 last-loop prompt `noneLeft || ownLoop?.last`; admission.ts:132-157.

### Q12
Proposed answer (85%), option (a): save the description block each pull request session is given (For you, Closing audits with any last-loop line, Settled during the build) on its session record at launch, as `carried` is. At each arrival at `final_delivery`, after the hold check, the precheck may complete on an open PR only when no PR session has run in this execution or the latest one's saved block equals the block Kiln would give now; otherwise a PR session runs, finds the PR open and replaces that block (`pull-request-person-items.txt` says to replace whatever an earlier session wrote). Draft prose for TD §What a Delivered Run Says, replacing the paragraph starting "This is an instruction in the pull request prompt…":
> This is an instruction in the pull request prompt, as the settled items are today; Kiln does not read the description back. The block a pull request session is given (**For you**, **Closing audits** with any last-loop line, and **Settled during the build**, rendered as above) is saved on its session record when it launches, as `carried` is. At each arrival at `final_delivery`, after the hold check, the precheck may complete the run on an open pull request only when no pull request session has run in this execution or the latest one's saved block equals the block Kiln would give now. Otherwise Kiln starts the pull request session. It finds the pull request already open and replaces that block in the description; `pull-request-person-items.txt` says to replace whatever an earlier session wrote there. Its own check then completes the run as today. This covers items listed or settled by audits the run was sent back to, loops counted since, and items waived at the hold stop (§Items for a Person).
Plus hold stop Continue bullet: "on a second arrival the pull request session starts by the rule in §What a Delivered Run Says, never the precheck alone." Both precheck sites need the gate (engine.ts ~4160 routing decision, ~4294 engine loop); add a test variant of completion-waivers-flow ~436-447 where second-round audits list an item. Rejected (b) Kiln edits PR body (Kiln never edits PRs; no gh pr edit in src) and (c) comparing model-written text. Why not ≥90: next pass should confirm the saved block's comparison is deterministic (rendering stable across arrivals, e.g. timestamps in Waived tags) and that a re-run PR session on an open PR is safe in multi-repo delivery (one block per PR). Evidence: pullRequestPromptValues ~7747, personItemsForDelivery ~7782, loopAcceptanceForDelivery ~7763, records.ts ~549, pullRequestCheck ~6327, development-delivery.ts ~1003-1025.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-19 · 35 earlier criteria changed (21 already covered) · 14 Replaces-line fixes applied (5 added, 1 widened, 3 removed, 5 corrected; Changes: line gained Continue Added Phases and Completion Waivers) · 0 raised as questions. Note: `continue-with-phases` vs Bot Control's pending SCOPE-001 (new-run setup stays in browser) — not a conflict, PRD names the command on purpose and AC-BOT-01 keeps settings and Authorize early merges in the browser.
Changed after pass 1:

## Register re-sort
Pass 1: 2026-11-19 · 1 open entry (TEST-001) · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 1 stays business, below the line (folded). Doubt check doubted it (ruling settles it); orchestrator kept it business: the ruling addressed the loop stop, not delivering an unaccepted failing test, and the earlier release stopped on that (Audit Loop Limits AC-TEST-02).

## Noticed, out of scope
- A pull request opened outside Kiln before any session ran lets the precheck complete the run with no For you block (pre-existing; Preserve).
- Waived-check counts differ between `kiln status` (`activityWaivers`, src/control/waiver-facts.ts ~99: every `continued` waiver once the step is done) and the page (`waivedFacts`, src/engine/snapshot.ts ~1549: only waivers after the step's `doneAt`). Pre-existing; the hold stop's waiver will show it on final delivery. No PRD criterion counts waived checks.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2: discovery (with Q5, Q12 deferred and Q13 pending carried first).
