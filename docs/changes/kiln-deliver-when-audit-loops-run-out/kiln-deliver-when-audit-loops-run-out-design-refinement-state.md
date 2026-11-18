# Design Refinement State — kiln-deliver-when-audit-loops-run-out

Started: 2026-11-18   Current pass: 3   Status: In progress
Branch: develop
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 3663 · growth baseline 3663
Last updated: 2026-11-18

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
| 1 | 16 (13 discovery + 3 conflict check) | 12 | 7 | 1 | 8 (4 taken + 4 not taken) | 0 | 0 |
| 2 | 13 (+3 from pass-1 investigations, Q17–Q19) | 12 (backlog Q1, Q2, Q5, Q8, Q13–Q19 + Q20) | 9 | 1 | 15 (Q14, Q17 + Q21–Q33 not taken) | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Same-branch Continue: worktree HEAD ahead of the PR head (unpushed phase commit) — accept descendant? | Technical | HIGH | 70 → 88 → 92 | Resolved | TD §Continuing, §Changes to Earlier Designs, Verification |
| Q2 | 1 | Same-branch Continue: prerequisite evidence when nothing merged (readiness needs integrated_verified; `added` non-empty) | Technical | HIGH | 80 → 88 → 92 | Resolved | TD §Continuing |
| Q3 | 1 | Phase written only on the delivery base while PRs open: FIND-02 forbids silent choice (conflict check; TD OQ3) | Business | MEDIUM | 85 → 90 (prior ruling CAP AC-FIND-02) | Resolved | PRD AC-LEFT-03; TD §Continuing; TD OQ3 removed |
| Q4 | 1 | "Delivered, with work left" heading when only For you items remain? | Business | MEDIUM | 60 → 95 | Resolved | TD §What Was Left; §Interfaces note (PRD already says it) |
| Q5 | 1 | Person-added phase depending on a set-aside phase (TD OQ2) | Technical | MEDIUM | 55 → 85 → 92 | Resolved | PRD AC-GOON-01, AC-LEFT-01; TD §Phases Left Open, §What Was Left, §Interfaces, §Continuing; OQ emptied |
| Q6 | 1 | PR check: block boundary and stale-block detection | Technical | MEDIUM | 70 → 90 | Resolved | TD §What Was Left, §Prompts, Verification AC-LEFT-01; mockup state 3 |
| Q7 | 1 | `phaseCriteria.built` mapping for phases the test audit adds | Technical | MEDIUM | 80 → 92 | Resolved | TD §Report Contract, §Prompts |
| Q8 | 1 | `items_listed` → `tests_to_accept` changes a status JSON value bots read (Bot Control AC-CLI-01) | Technical | MEDIUM | 60 → 85 → 93 | Resolved | TD §Loop Stops, §Interfaces, §Delivery, Verification |
| Q9 | 1 | Phase added by hand alone, PRs open, no phase left open: stays as today? | Business | LOW | 75 → 90 (PRD already draws the line) | Resolved | PRD Out of Scope |
| Q10 | 1 | Same-branch delivery recorded beside the completed one with same PR numbers (TD OQ1, AC-CONTINUE-05) | Technical | LOW | 80 → 93 | Resolved | TD §Continuing, §Changes to Earlier Designs, Verification AC-LEFT-03; OQ1 removed |
| Q11 | 1 | Same-branch Continue with worktree missing: way back | Technical | LOW | 75 → 92 | Resolved | TD §Continuing Same branch |
| Q12 | 1 | Does a limit raised by Allow carry into a continued run? | Technical | LOW | 70 | Pending | — |
| Q13 | 1 | Upgrade: pending legacy `allowed` epoch keeps marking the allowed loop | Technical | LOW | 85 → 92 | Resolved | TD §Upgrade |
| Q14 | 1 | Person action: `other` item vs `afterDeliveryActions` | Technical | LOW | 85 → 88 | Deferred | — |
| Q15 | 1 | Pre-upgrade delivery stop with no phaseCriteria: work-left says "the audit did not say" | Technical | LOW | 85 → 90 | Resolved | TD §What Was Left, §Interfaces |
| Q16 | 1 | Multi-repo: same whole block in every PR | Technical | LOW | 85 → 98 | Resolved | already stated: TD §What Was Left |
| Q17 | 1 | Same-branch Continue when an added phase names a repository the completed execution lacks (no workspace preparation): block or fresh-base? | Technical | MEDIUM | 50 → 88 (corrected: don't block) | Deferred | — |
| Q18 | 1 | Same-branch Continue: `newAcceptance` turns developmentDeployments off and mints folder/branch; same-branch keeps settings — dev deploys and early-merge grant on or off? | Business (consent) | MEDIUM | 50 → 86 | Assumption | DEV-001 (above the line); TD §Continuing; PRD AC-LEFT-03 + Replaces AC-CONTINUE-09 |
| Q19 | 1 | Same-branch Continue: waiver-skipped leaf (receipt with no revision) and a leaf closed by hand on the feature branch after delivery — carry or block? | Technical | LOW | 50 → 90 | Resolved | TD §Continuing |
| Q20 | 2 | Admission of a `needs_you` report listing only riding items (critical/other) — vacuous loop stop | Technical | HIGH | 70 → 92 | Resolved | TD §Report Contract, §Items, §Prompts |
| Q21 | 2 | Raising the delivery limit in settings after phases were set aside under `deliver`: do they come back? | Business | MEDIUM | 60 | Deferred | — |
| Q22 | 2 | How a bot gets/refreshes the proposal for `continue-with-phases` (no continuation field in status; check runs on page mount) | Technical | MEDIUM | 65 | Deferred | — |
| Q23 | 2 | Same-branch blocking: any base PRD-folder change, or only phase/requirements changes (assumptions-only edit)? | Business | MEDIUM | 65 | Deferred | — |
| Q24 | 2 | Allow at a later delivery stop also builds phases set aside earlier incl. Accepted ones; rationale contradicts TD person-added rule | Business | MEDIUM | 65 | Deferred | — |
| Q25 | 2 | Left-open delivery with PRD-repo PR closed unmerged, or one repo merged and another open: finished page result | Technical | MEDIUM | 65 | Deferred | — |
| Q26 | 2 | Phase committed only locally in the shared checkout (not pushed / other branch): blocks same-branch? | Technical | MEDIUM | 70 | Deferred | — |
| Q27 | 2 | Development deployments on: work-left check row in `evaluateRepositories`; which PR descriptions are held | Technical | MEDIUM | 75 | Deferred | — |
| Q28 | 2 | audit-accept.txt "passed only when needsYou is empty" vs riding items kept open | Technical | MEDIUM | 85 | Deferred | — |
| Q29 | 2 | Upgrade: pre-upgrade needs_you test stop with kind-less items stays a loop stop? | Technical | LOW | 70 | Deferred | — |
| Q30 | 2 | AC-TEST-03 acceptance line when a session carried the sentence but `acceptedTests` is empty | Technical | LOW | 75 | Deferred | — |
| Q31 | 2 | Relisting by id: admission judges waitsOn/criterion on merged item? | Technical | LOW | 80 | Deferred | — |
| Q32 | 2 | After-delivery action shape in `forYou` (`kind: after_delivery`, no problem) | Technical | LOW | 85 | Deferred | — |
| Q33 | 2 | Nothing refuses `test_acceptance` on a delivery-audit report (would become an item stop) — limit to test audits? | Technical | LOW | 75 | Deferred (from Q20) | — |
| Q34 | 2 | Terminal phases-done count with phases left open: say something extra, or counts stand? (conformance) | Technical | LOW | 70 | Pending | — |
| Q35 | 2 | Audit Loop Limits ledger field `itemsListedStops` has nothing to record once items_listed is not stored on passed reports: drop or clear at schema 24? (conformance) | Technical | LOW | 70 | Pending | — |

Status values: Pending · Investigating · Answered, not folded · Resolved · Assumption · Deferred (carried to next pass) · Blocked · Dropped (failed the scope gate on closer look; reason in notes). A Reframed question is replaced by a new row marked Pending with "reframed from Qn" in its notes.

## Question notes
Discovery (pass 1) settled from code/skills, no question: review not-verified (a) same-branch reuse traced — activateExecution reusable (engine.ts:3316-3320), gaps are Q1/Q2/Q10; (b) test audit writes a new completion phase at closing audits (test-audit SKILL:170, phase-split SKILL:410; append-only enforced validate-report.ts:53-54); (c) `gh pr list --json body` exists (gh 2.103.3), CRLF possible, normalization covers it. TD OQ3: method puts document changes on the unmerged feature branch (engineering-principles SKILL:278,280) — but see Q3 for FIND-02.

### Q1
Verdict Refined, 88% (below 90, deferred). Proposed TD §Continuing "Same branch" prose: plan read from the PRD repo worktree's HEAD. Each repo's worktree clean (untracked counted) and on the feature branch; where it has a PR, HEAD equals or descends from origin's feature tip (read by ls-remote + fetch by revision, never a tracking ref) and the PR's headRefOid (same GitHub read as its state) equals that tip. Unpushed commits since delivery are expected; first phase session pushes, Pushed check holds it. Repo with no PR: no head check. `blocked` when worktree missing / other branch / dirty / behind / diverged, or PR head ≠ origin tip (clears on Check again); each names repo and fix (commit/remove; checkout; pull when behind; merge when diverged); Kiln never resets/rebases/force-pushes. Fetch/read failure → `failed` with retry. Identity binds per repo worktree HEAD, origin tip, PR number; acceptance recomputes → `proposal_changed`. Evidence: engine.ts:3215-3218,3257; checks.ts:180-194,314,363-367; engine.ts:7322-7326,7739-7745; folder-facts.ts:233-240; completed-plan-sources.ts:11-17; records.ts:215-226; prompts/phase-session.txt:7,11. Fold together with Q2 next pass if Q2 lands.
### Q2
Verdict Refined, 88% (deferred). Corrections to TD: (1) the rule blocking a left-open leaf is accounting's `unresolved_earlier_work` (completed-plan-accounting.ts:89; baseline used when planReconciliation.baselineId exists, discovery.ts:58), not the legacy baseline refusal (discovery.ts:71) — lift it in both modes: classify `new_unfinished` when the completed ledger's leftOpen (no endedAt) holds it, open in baseline and plan, no receipt. (2) Don't reuse `integrated_verified` — prepareContinuation stamps integration (engine.ts:3274-3285) that later reads as integrated even if PR closed unmerged; new prerequisite status `on_feature_branch` (receipt revision ancestor of bound feature head, evidence identity@revision in branch@head); first-leaf dependency check and same_branch acceptance accept only it; fresh_base unchanged. (3) Drop "built as a base-branch start from Folder missing" — completed baseline already has receipts from pushedSha (engine.ts:8022-8033), carried by discovery.ts:170. (4) `added` can be empty (hand-closed/removed left-open leaf); keep the refusal (engine.ts:3218). Same-branch: no delivery base read, no preparation; blocked when first open leaf has a preparation instruction or a phase names an unset-up repo (→ continue after merge; overlaps Q17). No loop counted: fresh ledger (engine.ts:3320-3324; loop-ledger.ts:29-33). Full prose in investigator report; fold with Q1 next pass.
### Q3
Already answered by prior ruling CAP AC-FIND-02 (not replaced by this PRD): plan from feature branch; same-branch check also reads shared checkout + delivery base; a phase change there the branch lacks (base PRD folder since fork point, or uncommitted in shared checkout) → `blocked`, names doc + source, commit on feature branch; no auto-merge. Evidence: CAP prd:37, readiness row :97; completed-plan-discovery.ts:111-116,129-133,154-159,176.
### Q4
95%: heading "Delivered, with work left" only for phases left open or tests accepted (AC-LEFT-01's two rows); For-you-only keeps today's heading (AC-DISPLAY-03, AC-PRS-03) and shows For you where Remaining human actions shows; PR block has what-was-left part only then, For you whenever open. Residual noted: a riding `critical` finding also keeps today's heading — possible product-owner question, not raised (no PRD statement implies more).
### Q5
Refined, 85% (deferred). Derive, don't store: unclosed leaf set aside when its (or an ancestor's) Phase dependencies name a set-aside phase, transitively, ids from `dependencyIds` only; no-dependency phase still built in plan order. Same predicate, never stored, no new `cause`. Recorded plan gains `dependencies?: string[]` (RecordedPlanPhase records.ts:257-269 lacks it; orderSource engine.ts:6619 sets dependenciesText undefined; plan re-recorded every read engine.ts:6402); planStructure leaves it out like `attended`. Allow ending entries → dependent rejoins; Accept → follows. Work left: listed with the phase it depends on, no phaseCriteria rows, "criteria not assessed by an audit". Discovery after merge/close accepts any leaf the completed predicate sets aside (amend §Continuing "After a merge or close"). PRD: AC-GOON-01 sentence "A phase whose Phase dependencies name a phase left open is left open with it, whoever added it; Kiln reads only the phases the plan names."; AC-HANDBACK-02 Replaces parenthetical "(… nor is a phase that depends on one)"; AC-LEFT-01 row addition. Evidence: phase-plan.ts:140-158; plan-reading.ts:35; engine.ts:2878; delivery-audit SKILL:44, test-audit SKILL:42. Survey: 30 completion phases locally, no person phase after one. Script: scripts/exploration/added-phase-dependencies.mjs (untracked). Out of scope note: test-audit SKILL:170 carries gaps into the next open planned phase — could land in a set-aside person phase.
Reframed → closing markers, 90%. Block wrapped in `<!-- kiln:work-left -->` … `<!-- /kiln:work-left -->`. Normalize: whitespace runs → one space, trim. Built a block: pass only if description (leading ws stripped) starts with opening marker, contains it once, and text to first closing marker equals block (normalized). Built none: fail if opening marker anywhere. Same block in every repo's PR; repo proven integrated has no row. `gh pr list` adds `body`. Prompt: start with block word for word incl. marker lines (Kiln's, not template comments); keep first and unchanged on every edit; replace an earlier block rather than add a second; same_branch with nothing left: remove an earlier block. Also: mockup state 3 shows the marker lines; `personItemsForDelivery` (engine.ts:~7783) lists only settled items under "Settled during the build" once outstanding ones move to For you; `development-finalization.txt` gets the block too (prompts.ts:94-109). Evidence: checks.ts:298-355; prompts/pull-request-cross-links.txt.
### Q7
Resolved 92%. TD §Prompts audit-session bullet add: "For `phaseCriteria`, the prompt maps the skill's own status for each criterion an appended phase covers: `none` only when no code does any part of it (the delivery or test audit's Not implemented), and `partly` for every other gap (Partly implemented, or a test audit's criterion broken in a way bigger than the test work left, since broken code still does part of it)." TD §Report Contract under phaseCriteria: "`built` describes the criterion as the audit graded it, not the phase's share of it, so every row naming one criterion gives the same value." Evidence: delivery-audit SKILL:52-64,55-56,107; test-audit SKILL:67,168,170,342. Optional (not folded): admission refuses one criterion with two built values.
### Q8
85% (deferred). Keep `items_listed` (released meaning already covers a needs_you test stop, loop-gate.ts:146); drop the `tests_to_accept` rename. Also §Interfaces snapshot drops released fields — keep `stop.holds`, `loops[].label`/`activity`, `stop.audit.items {name, problem, action}`, test stop `afterLastTest`; JSON key is `audit_loops` (projection.ts:328). New values are additions; controller `protocol_minor` 3. Prose drafted in investigator report (Loop Stops first paragraph; Interfaces paragraph after snapshot). Evidence: bot-control PRD:120 (AC-CLI-01), bot-control TD:78; kiln-command-contracts.json:58; loop-view.ts:35,190; loop-text.ts:82; server.ts:38; CHANGELOG.md:24-36. Also: Delivery changelog line — some needs_you test stops that are loop stops today become item stops with no audit_loops.stop. Out of scope: server.ts:38 hard-codes kiln_version "1.0.0".
### Q10
93%. Paragraph "Its delivery record" for TD §Continuing; no "updated" label (ExecutionHistory.svelte:44-51); after merge "Also contains other commits" (Complete.svelte:45; engine.ts:6477-6491); nothing double counts (engine.ts:3293,3321; continuation-state.ts:46-52,110-115; projection.ts:331). Acceptance setup-identity check (continuation-state.ts:72-76, `-continue-` branch, canonical workspace) fresh_base only. Departs from CAP TD "never reuse delivered branch/worktree" and "cannot silently extend old open PR".
### Q11
92%. Stay blocked, no repair. Reuse folder check predicate (`checkFolder`; missing-worktree-recovery TD Design Decisions "The 'run's worktree' predicate") per repo. Missing: "Kiln continues only in the run's own worktree." + AC-SETUP-06 restore commands built/gated as `gatherFolderFacts` builds `restoreCommands`: `git -C <shared checkout> worktree add -f <saved folder> <feature branch>` (preceded by `git -C <shared checkout> fetch origin <feature branch>` when only origin has it); -f needed while git records the missing folder, no prune; when the rule offers no command, give its reason, no command. Holds something else: say what, no command. Unknown: say what couldn't be read. Ends "then press Check for new phases." Kiln writes nothing; no Folder missing setup. Evidence: folder-facts.ts:147-153,346-360; folder-check.ts:58-77; snapshot.ts:514; engine.ts:779,3931; CompletedPlanCheck.svelte:120; git 2.43 scratch test.
### Q5 (conformance note)
When folded, drop or replace the TD Open Question's "Check how often added phases name completion phases…" — answered by scripts/exploration/added-phase-dependencies.mjs.
### Q8 (pass 2)
93%. Correction: do NOT bump protocol_minor (client checks only protocol_major + features, client.ts:19,31,149-156; precedent 0a9d239, 3eda734, e675f07 added features at minor 2). Receipt echo ControlSettingsEcho (records.ts:336) keeps older key too. `holds` false at items_listed as released. Changelog: needs_you test with blocker/business/critical and no test loop → ordinary Needs you stop (was loop stop with Allow/Accept, loop-gate.ts:146, engine.ts:632-633).
### Q1/Q2 (pass 2)
92% each. Additions: clean ignores ignored files; removed left-open leaf also blocks today (accounting.ts:166) — lift covers removal; same-branch skips delivery-base documents-together check (discovery.ts:158-159); fresh-workspace validation needs HEAD = base (continuation-setup.ts:35-38).
### Q17 (pass 2)
88%, corrected: don't block. Run adds a named repo on the feature branch at phase start (AC-ADD-04 in Kiln Multi-Repo Delivery; engine.ts:4274-4277,6110-6113,7505-7518); PR repos come from branch tips (7738-7745). Proposed prose: "A phase naming a repository the run lacks does not block. The continued execution adds it on the feature branch when that phase starts (AC-ADD-04), and its delivery opens that repository's pull request." + "Its delivery record": "and any it opens for a repository added since". Need to verify the add works with no workspace preparation in a same-branch execution.
### Q18 (pass 2)
86%, consent → DEV-001. Keep dev deployments and early-merge grants on (Folder missing base-branch Start carries them, engine.ts:3862; grant demand continuation-readiness.ts:142-147 only from preparation targets). Fresh-base override continuation-setup.ts:20.
### Q19 (pass 2)
90%: waiver-skipped leaf carries (engine.ts:8015-8017, 6591); hand-closed left-open leaf blocks (external-evidence route accounting.ts:95-159).
### Q5 (pass 2)
92%. Holds, corrections: no AC-HANDBACK-02 edit; lift must also reach accounting.ts:89. PRD: AC-GOON-01 after first sentence "A phase whose Phase dependencies name a phase left open is left open with it, whoever added it."; AC-LEFT-01 "Phases left open" cell end "; a phase left open because it depends on one is listed with that phase, its criteria not assessed by an audit." TD §Phases Left Open insert after "…and not closed." (derived transitively, never stored, no cause; ids from dependencyIds; source = read plan / audit snapshot phase content / recorded plan with `dependencies?: string[]` written by recordedPlan, kept by order source, left out by planStructure like Attended (else baseline_unavailable, completed-plan-discovery.ts:67); Allow rejoins; Accept/setting sets aside; `{{setAside}}` names it). Bullet "(see Open Questions…)" → "…with no dependency on a set-aside phase is still built in plan order." Plan row "left open: depends on Phase N". §What Was Left: dependent has no rows, names phases it depends on; PR line example "- Phase 12 — Refund export: depends on Phase 10, left open; no audit assessed its criteria"; tests-not-audited counts listed criteria; workLeft.phases[] gains dependsOn?: string[], criteria []. §Continuing After a merge: "accepts an open leaf the completed execution set aside (its ledger, read with the dependencies in its plan)"; same-branch left-open leaves include dependents. Verification AC-GOON-01 row add. Remove last Open Question (section empties).
### Pass 2 discovery: settled by reading code (fold with conformance)
snapshot.ts:1124 next-leaf marker, snapshot.ts:1175 PR row only when every leaf closed, underway-output.ts:47 must ask the set-aside predicate; development-delivery.ts:135,871 (+:935) finalization refuses unless every leaf closed — skip set-aside; page Continue sends command id + status token to /api/continuation/accept (api.ts:132-141), continue-with-phases reuses that receipt; fresh-base continuation copies settings too (continuation-setup.ts:20) so LOOP-001 holds in both modes; accept-and-deliver is in STARTING_ACTIONS (commands.ts:14) — at a delivery stop it starts no session, receipt must not say started (engine.ts:5712); for "which way" a repo in `mergedBranches` counts as merged.
### Q20
Proposed (70%): admission refuses a `needs_you` report listing no critical_next_step/blocker/business_question/test_acceptance item. Evidence validate-report.ts:35; TD Items/Admission.
### Q21–Q32 (pass 2 discovery proposals)
Q21: no — set-aside stays; raised limit applies to phases added later; settings text says so (contracts.json:502). Q22: status adds `continuation {check_status, checked_at, proposal_id, mode, phases, problems}`; engine runs completed-plan check once when a left-open delivery completes (projection.ts:330-340; CompletedPlanCheck.svelte:52; engine.ts:3931). Q23: block on phase/PRD/TD change the branch lacks; not on assumptions-only edit (CAP AC-FIND-03; discovery.ts:128-133; mockup For you "Record a change to AC-RETURNS-09 in the PRD"). Q24: keep build-all, rewrite rationale, page calls out accepted phases (AC-ANSWER-03). Q25: today's result incl. awaiting_merge; reword TD "awaiting-merge stays for a delivery with no phase left open" (discovery.ts:122-145). Q26: any phase/requirements change in shared checkout working tree on neither base nor branch blocks (discovery.ts:111). Q27: hold only the remaining open review PR per repo, reason inside evaluateRepositories (engine.ts:6326-6331; development-delivery.ts:991-1011). Q28: passed when needsYou holds only critical/other; needs_you when a holding item open. Q29: kind-less item neither stops nor holds → stays loop stop (loop-gate.ts:129-147). Q30: keep line outside block, unchecked, today's heading (prompts.ts:100; Loop Limits PRD AC-TEST-03 "never hidden"). Q31: judge on merged item (person-items.ts:36-37). Q32: `{kind: "after_delivery", action}`, block prints action alone (validate-report.ts:32).
### Q14 (pass 2)
88% (deferred). TD §Prompts: "An action the requirements place after delivery goes in `afterDeliveryActions` and is never also an item. Any other person action that no remaining work needs is an `other` item." §What Was Left For you append: "each after-delivery action from the settled `passed` audits, listed once by its text" — new gap: each passed audit gives its own list (snapshot.ts:1419), a release named by both closing audits would show twice.
### Q13
Proposed: keep pendingAllow honoring a legacy `allowed` epoch; new Allows use `allowances`. Evidence: loop-gate.ts:65-69,108-114.
### Q14
Proposed: requirement-placed post-delivery actions stay `afterDeliveryActions`; any other action no remaining work needs is `other`; both shown once under For you. Evidence: audit-session.txt; validate-report.ts:15,33.
### Q15
Proposed: work-left and PR block say "the audit did not say" for partly/none, matching gate `not_stated`. Evidence: TD:68,116,217.
### Q16
Proposed: the same whole block in every PR (PRD AC-LEFT-01 "each pull request's description"; TD:158).

## Exploration scripts
| Script | Question | Finding |
|---|---|---|
| scripts/exploration/added-phase-dependencies.mjs | Q5 | No person-written phase after a completion phase among 30 locally; 5 of 30 completion phases depend on each other |

## Conflict check
Pass 1: 2026-11-18 · 33 earlier criteria changed (34 with V1 AC-PR-02) · 17 already covered · 17 Replaces lines + 1 widened written (item 16 retargeted to MRD AC-PRS-05, which replaced V1 AC-PR-02; CAP CONTINUE-002 assumption got a "Later departure" line; CA AC-TEST-03 covered via the AC-DELIV-01 chain, per the check) · 2 raised as questions (C1 FIND-02 delivery-base phase, C2 hand-added phase alone) · design note C3 (items_listed status value)
Changed after pass 1: AC-LEFT-03 (Q3; LOOP-001 sentence, conformance; DEV-001 + Replaces AC-CONTINUE-09); Out of Scope line (Q9); AC-GOON-01, AC-LEFT-01 (Q5)

## Register re-sort
Pass 1: 2026-11-18 · 0 open entries (ITEM-001 and SET-001 already in the Validated table) · nothing to sort

## Noticed, out of scope
- prompts/pull-request-session.txt opens "Every phase … is implemented" — needs rewording in the build (obvious edit)
- completed-plan-discovery.ts:138 waiting-for-merge reads only the PRD repo's PR; superseded by the per-PR read
- `REPORT_FIELDS` (validate-report.ts:15) and the audit prompt's field list need the new fields (obvious)
- src/control/server.ts:38 hard-codes kiln_version "1.0.0"
- fresh-base path blocks any continuation carrying a waiver-skipped leaf (continuation-readiness.ts:80-81), contradicting the waivers TD "Continuation executions"
- a PR closed without merging leaves today's path at awaiting merge unless the base PRD folder changes (completed-plan-discovery.ts:126-138)
- items on a needs_you report lost when that audit is marked complete (person-items.ts:26) — pre-existing
- item text containing `<!--` would hide the rest of the rendered block on GitHub
- block dates depend on controller locale
- closed unmerged PR shows waiting-for-merge indefinitely when nothing left open — pre-existing
- loop-gate.ts:114 `items_listed` from a pending Allow is reachable only with a lowered limit; removed by `tests_to_accept`

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2 committed. Start pass 3: discovery (pass the state file); backlog first: Q17, Q14, Q21–Q35 ranked by impact (take 12: HIGH/MEDIUM first — Q21–Q28, Q17, then Q14, Q33/Q29 etc.).
