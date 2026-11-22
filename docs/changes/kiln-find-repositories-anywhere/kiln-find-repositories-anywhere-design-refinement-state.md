# Design Refinement State — kiln-find-repositories-anywhere

Started: 2026-11-22   Current pass: 6   Status: In progress
Branch: prd/kiln-find-repositories-anywhere
Existing code posture: Preserve (source: user; the design's Existing Code says the same)
PRD words: at start 3644 · growth baseline 3644
Last updated: 2026-11-22

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md |
| Technical Design | docs/changes/kiln-find-repositories-anywhere/technical-design.md |
| Assumptions | docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-assumptions.md |
| Supporting | docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html (copy of record; mirrored on a Claude Design canvas, one artboard per state); docs/roadmap/kiln-find-repositories-anywhere-idea.md ("Decided, 2026-11-21" settled, not reopened); docs/changes/kiln-multi-repo-delivery/; docs/prds/kiln-bot-control/; the Enso Method's skills/phase-split/SKILL.md (read only, other repository) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 13 (5 design Open Questions + 8 discovery; 5 repeats) + 1 from conformance | 14 | 14 | 0 | 0 | 0 | 0 |
| 2 | 4 (4 repeats) | 4 | 4 | 0 | 0 | 0 | 0 |
| 3 | 5 (4 repeats) + 4 from pass 2 conformance + 1 copy gap | 10 | 10 | 0 | 0 | 0 | 0 |
| 4 | 4 (7 repeats) | 4 | 4 | 0 | 0 | 0 | 0 |
| 5 | 3 (4 repeats) | 3 | 3 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | The PRD's repository's short name and worktree folder when another repository shares its short name (TD Open Questions 1, AC-FOLDER-01) | Technical | MEDIUM | 75 → 95 | Resolved | PRD Terms, AC-FOLDER-01; TD §Worktree Folders and Labels |
| Q2 | 1 | AC-ASK-07's second case adds a question to stops run restart and needs-you handoff lay out, with no Replaces line (TD Open Questions 2) | Business | MEDIUM | 75 → 95 | Resolved | PRD Replaces lines on AC-SEE-02, AC-ASK-06, AC-FOLDER-02, AC-SEE-03, AC-ASK-07; AC-SEE-03 placement; AC-ASK-01, AC-FIND-04 wording; TD §Screens, §The stops that ask, Open Questions "None." |
| Q3 | 1 | The macOS guarded-folder list rests on documentation (TD Open Questions 3, AC-FIND-05) | Technical | HIGH | 70 → 90 | Resolved | TD §The search (guarded folders), §Testing Approach |
| Q4 | 1 | A continuation's readiness check and the Folder missing setup panel when a name ends in a question (TD Open Questions 4) | Technical | HIGH | 50 → 90 | Resolved | TD §After Start, A continuation and a base-branch start |
| Q5 | 1 | The example in the path-on-one-computer plan problem: mockup state 6 vs the design (TD Open Questions 5) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Names; mockup state 6; canvas artboard 6 (TerminalStops) |
| Q6 | 1 | When a stop's answer clears a session's refused request, is the resumed session told it can ask again? | Technical | MEDIUM | 65 → 90 | Resolved | TD §The stops that ask |
| Q7 | 1 | When the phase-split writer can't find a repository's checkout, what does the skill tell them to do? | Technical | MEDIUM | 65 → 90 | Resolved | TD §phase-split; PRD AC-SPLIT-01 |
| Q8 | 1 | In `kiln status --json`, do repository fields carry the name or the label? | Technical | MEDIUM | 75 → 90 | Resolved | TD §Interfaces `kiln status --json`, §The command, §Worktree Folders and Labels |
| Q9 | 1 | When a remembered answer fails its re-check and is forgotten, is the person told? | Technical | LOW | 60 → 90 | Resolved | TD §Finding a Checkout step 1, §Data Models The store, §Command line, Testing |
| Q10 | 1 | Is a `.git` file that is neither a worktree nor a submodule (a separate-git-dir clone) an own checkout? | Technical | LOW | 70 → 95 | Resolved | TD §The search, §The answer, §Integration Points, Testing |
| Q11 | 1 | Does an answer given in one running Kiln update another Kiln's open Documents found page? | Technical | LOW | 75 → 90 | Resolved | TD §The answer |
| Q12 | 1 | Does a name with a host (`github.com:acme/x`) match only checkouts on that host? | Technical | LOW | 80 → 90 | Resolved | TD §Names |
| Q13 | 1 | Is the "Git can't read this candidate" terminal line printed on every search? | Technical | LOW | 80 → 92 | Resolved | TD §The search Reading candidates, §Command line |
| Q14 | 1 | (conformance) Which earlier criteria AC-ASK-07's new Replaces line should name | Technical | LOW | 80 → 95 | Resolved | Kept as written (AC-CONTINUE-06, AC-SETUP-07) |
| Q15 | 2 | A request made while its phase is already stopped at Needs you: does the open stop gain the question at once? | Technical | MEDIUM | 75 → 90 | Resolved | TD §A session's request, §The stops that ask, Testing |
| Q16 | 2 | What `repository` carries in `POST /api/repository-location` and `/change`: address path or name? | Technical | LOW | 88 → 95 | Resolved | TD §Worktree Folders and Labels, §HTTP, §Snapshot |
| Q17 | 2 | Change's question when the remembered folder isn't among the checkouts found, or is the only one listed (count, singular) | Technical | LOW | 80 → 90 | Resolved | TD §The answer (Change), §Finding a Checkout (number rule), §Asking Before Start (status line) |
| Q18 | 2 | A search root that is itself a checkout: candidate, and are its entries searched? | Technical | LOW | 75 → 90 | Resolved | TD §The search, Testing |
| Q19 | 3 | (conformance) One page shows a count as a word where the page writes it and digits where the server does: accept or send words? | Technical | LOW | 80 → 95 | Resolved | TD §Finding a Checkout (number rule) |
| Q20 | 3 | (conformance) Change can ask about one found checkout; only the plural "Kiln found <n> checkouts" is defined | Technical | LOW | 90 → 95 | Resolved | TD §The answer (Change) |
| Q21 | 3 | (conformance) "The stop in Kiln now asks where it is." doesn't fit a request that ended in the "which checkout" question | Technical | LOW | 90 → 95 | Resolved | TD §A session's request |
| Q22 | 3 | (conformance) Labels paragraph says `/api/repositories`' `name` "stays a name"; the HTTP table says it takes every name form | Technical | LOW | 90 → 95 | Resolved | TD §Worktree Folders and Labels |
| Q23 | 3 | External completion evidence accounting when a phase names a repository by address path that would end in a question | Technical | MEDIUM | 75 → 95 | Resolved | TD §A continuation and a base-branch start, Testing; PRD AC-ASK-07 |
| Q24 | 3 | `kiln status` text for a stop that asks: the "which" form, a non-plan stop, the Controls line | Technical | LOW | 70 → 90 | Resolved | TD §The command (text form); mockup state 7 (canvas artboard 7 pending, see Blockers) |
| Q25 | 3 | After Start, which repositories count as "the PRD's repositories" for the label clash | Technical | LOW | 80 → 95 | Resolved | TD §Worktree Folders and Labels, Testing |
| Q26 | 3 | Under Change, is the remembered folder pickable, and how does the person back out | Technical | LOW | 80 → 90 | Resolved | TD §The answer, §Finding a Checkout |
| Q27 | 3 | Does "a folder is met once" let an outer root's walk cut an inner root's depth | Technical | LOW | 85 → 98 | Resolved | TD §The search, Testing |
| Q28 | 3 | The plan stop's Phase plan reads fact when the checkouts found aren't on GitHub has no wording | Technical | LOW | 90 → 95 | Resolved | TD §The stops that ask |
| Q29 | 4 | A plan stop that asks is waived (Mark complete): what key the skipped phase's recorded scope holds for a repository never set up | Technical | MEDIUM | 60 → 92 | Resolved | TD §Names, Testing |
| Q30 | 4 | A phase about to start names several repositories and one asks: does a question end the addition loop? | Technical | MEDIUM | 65 → 90 | Resolved | TD §The stops that ask, Testing |
| Q31 | 4 | Where a stop's question content (kind, checkouts, searched) comes from after `kiln run` restarts, and the status token | Technical | MEDIUM | 65 → 92 | Resolved | TD §Data Models, §The stops that ask, §Finding a Checkout, Testing |
| Q32 | 4 | The label of a session's request that Kiln didn't add | Technical | LOW | 85 → 90 | Resolved | TD §Worktree Folders and Labels, §Snapshot |
| Q33 | 5 | "Kiln searches when it makes the stop" vs a synchronous stop-recording path: when a phase's requests' questions land on a new stop | Technical | MEDIUM | 75 → 90 | Resolved | TD §The stops that ask, Testing |
| Q34 | 5 | Mockup state 8's "Kiln then adds it… and starts phase 4." is false when the plan stop holds several questions or a failure fact | Technical | LOW | 80 → 90 | Resolved | PRD AC-ASK-07 table; TD §Screens, Testing |
| Q35 | 5 | Does a billing hold count as a Needs you stop for a session's request? | Technical | LOW | 75 → 90 | Resolved | TD §The stops that ask, §Data Models, Testing |

Status values: Pending · Investigating · Answered, not folded · Resolved · Assumption · Deferred (carried to next pass) · Blocked · Dropped (failed the scope gate on closer look; reason in notes). A Reframed question is replaced by a new row marked Pending with "reframed from Qn" in its notes.

## Question notes

### Q1
Proposed answer: the PRD's repository's short name is always its main checkout's folder name; it is its `name` and worktree folder and never changes (keys the state directory before the plan is read, the one-repository worktree path, every record). It is set up first, so in a same-Start clash only the other repository takes the whole-path form. Clashes and labels compare short names without case. PRD: short-name term and AC-FOLDER-01 say so; design: drop Open Question 1. Evidence: src/prd-location.ts:98, src/state/state-files.ts:31-33, src/engine/worktree-setup.ts:37,118-121, src/state/new-record.ts:28, src/engine/engine.ts:1608,1616.

### Q3
Proposed answer (90%): the macOS list is correct and complete for a walk under the design's rules; listing alone asks. Trial on macOS 26: a walk under the rules from a PRD repository's parent (3 roots, ~2,100 folders, 0.48 s) logged no privacy request; requests are logged even when a grant hides the prompt, so the check needs no reset. Fold: Desktop/Documents/Downloads row says listing alone asks and iCloud Desktop & Documents keep these names; Library row names Mobile Documents and CloudStorage, other apps' containers ("data from other apps"), Mail/Messages/Safari; a sentence after the table on the `.`, link and device rules covering the Trash, a cloud folder's shortcut, removable/network volumes; Public, Applications, Sites not guarded; a terminal or editor is asked on behalf of. Windows and Linux rows stay (Controlled Folder Access blocks changes, not reads; a sandboxed terminal gets a refusal, covered by "a folder Kiln can't list"). Replace "not from a trial with permissions reset" with "confirmed by one log-checked walk on macOS 26, documentation for the rest". Build check: count requests whose accessing process is the search's own, across every folder-guarding service; wait a few seconds before reading the log; say whether the terminal has Full Disk Access. Unproven: a legacy cloud folder as a real folder at the home root; macOS 15; whether Full Disk Access suppresses the logged request. Evidence: eclecticlight.co 2026-04-15 and 2026-04-07; Apple Mac User Guide, Files & Folders; Apple Platform Security "Controlling app access to files"; TidBITS 2023-03-10; Microsoft Learn Controlled Folder Access (all read 2026-11-22). Script: scripts/exploration/guarded-folder-walk-tcc-log.mjs.

### Q4
Proposed answer (85%): neither a continuation nor a base-branch start on the Folder missing page asks; both are after Start (AC-ASK-07 "only at a phase's Needs you stop", AC-ASK-06, AC-SEE-03 doesn't list them). A name that ends in a question is left out of what the page sets up and isn't a problem; Kiln adds it before the phase that names it (multi-repo AC-ADD-04, engine addNamedRepositories), where the stop asks. Folder names not found stay problems (AC-FIND-04). Follow-up (90%): the left-out repository is not set up, not listed (the panel lists what its Start sets up; the settings while Kiln works list only set-up entries, engine.ts:1602) and not a problem. Exception: a repository the continuation's preparation reads (outside-Kiln prerequisite phase, preparation-documents.ts:53-72, continuation-readiness.ts:107-111,167-170) stays a problem under AC-CONTINUE-07's "Source … unavailable" row: the question's first sentence, then what clears it on Check again. No new copy on the panel. Design prose is in the investigator's report, folded under After Start. Evidence: src/engine/continuation-readiness.ts:51-56,128; src/engine/folder-setup.ts:287-299,377-378; missing-worktree-recovery TD:127; WTR-002 scope.

### Q5
Proposed answer (85%): the path-on-one-computer problem gives the form, not an example: "Name the repository by the path in its remote address, in the form owner/repository." The plan reader is pure (readPhasePlan(files), src/plan/phase-plan.ts:44) and called from six places; reading the named folder's origin would make each spawn Git, and the PRD's repository's address path isn't known when start checks read the plan (src/start-checks.ts:112 vs 129-157) and reads as the name to use. PRD AC-NAME-01 asks only that it "says to name the repository by its address path". Mockup state 6 line 340 changes to match; canvas artboard too.

### Q2 (conflict check)
Result: 16 earlier criteria changed; 8 existing Replaces lines correct. To write: (1) AC-SEE-02's line adds v1 AC-START-09 (docs/prds/kiln-v1/kiln-v1-prd.md); (2) AC-ASK-06 new line: AC-ACT-01 in kiln-bot-control PRD (one more command for a run already started; help and run detail list it); (3) AC-FOLDER-02 new line: AC-ADD-03, AC-CHECK-02, AC-PRS-03 in multi-repo (the name a repository is shown by once another shares its short name); (4) AC-SEE-03 new line: AC-LOOK-01 in kiln-run-restart, AC-NEXT-01 in kiln-completion-waivers, AC-SPACE-03 in multi-repo (a phase's Needs you page, one-repository PRDs included, gains the question about a session's request below its first card); widen AC-SHOW-01 line's parenthetical. Question A (placement of AC-ASK-07 second case's question): "above what it already shows" breaks run restart AC-CASE-04, build-preflight AC-ATTEND-03, needs-you handoff AC-PAGE-01, completion waivers AC-WAIVE-02 (owner approved 2026-11-01). Orchestrator: one sensible answer, below the first card and above the ways to resolve the stop, the slot AC-CURRENT-01's offer uses; fold into AC-SEE-03, design §Screens and §The stops that ask. Question B (continuation / Folder missing) is Q4, answered with code evidence the other way (left out, not a problem, asked at the stop before its phase; preparation exception stays a problem); needs Replaces lines on AC-ASK-07 for AC-CONTINUE-08 (and AC-OFFER-01 if it applies) in continue-added-phases and AC-SETUP-04/07 in missing-worktree recovery, plus one PRD sentence making AC-ASK-07's "only" explicit for those pages. Question C (95%): AC-ASK-01 and AC-FIND-04 "as today" also covers run restart AC-RESET-04 (a failed start check after a reset shows on Documents found); reword each as "reports it as it does today: in the terminal, or on Documents found after a reset".

### Q6
Answer: no new resume sentence; the PRD doesn't require Kiln to tell the session (AC-ASK-07 says a repeated request succeeds; AC-SESSION-01 tells once at refusal). Resume reopens the same conversation (src/engine/engine.ts:5451-5515), its prompt says how to ask, and the stop tells the person. Design gets one clarifying paragraph under §The stops that ask.

### Q7
Answer: the writer reads the address from the checkout's origin; with no checkout at hand, an address the PRD or design writes out; never a name worked out from a folder name or the design's wording written as fact. When neither source gives it, the writer puts its best-supported address on the line and records it in the PRD's assumptions register as a technical assumption (names the phase, says no checkout or written address was available, reading the checkout's origin settles it); the split never stops to ask (implementation-lifecycle: technical facts never stop a session). Evidence: phase-split/SKILL.md:246,339; assumptions-document-writing/SKILL.md:93,178-181; implementation-lifecycle/SKILL.md:64,128-135. Fold: TD §phase-split "Where the writer gets it"; PRD AC-SPLIT-01 "instead of guessing" made precise.

### Q8
Answer: `kiln status --json` keeps schema_version "1"; every change is a new optional field; wherever a repository appears it stays its name. `repository_details` new ({name,label,address_path} per `repositories` entry, same order); folder check repositories[] gain label and address_path; delivered.pullRequests[] gain label; stop.locate[] projected (kind, address_path, label, searched_from, searched_to, checkouts[] {folder, remote, pickable, remembered, next_argv when pickable}, available, reason, next_argv, next_command); controls[] gains locate-repository; capabilities feature locate_repository, protocol_minor 3. The text form is printed by the client from the same JSON, so labels must be in it. New fields snake_case. Evidence: bot-control TD lines 78,134; src/control/client.ts:46,117; projection.ts:235,293,325,344,371; waiver-facts.ts:196,233,242; delivered-facts.ts:57; server.ts:40.

### Q9
Answer: one terminal line when a remembered answer is forgotten (a silent swap to another checkout would be a silent fallback; precedent: the unreadable-candidate line). Step 1, after "A failed check deletes the answer and carries on.": "The terminal prints `<time>  Kiln no longer remembers <address path> at <folder>. <the failed check's message>` once, since the answer is gone. Documents found and the stop show nothing new." §Data Models "The store": unparseable file deleted, line `<time>  Kiln no longer remembers <address path>: it couldn’t read its record (<parse error>).`; newer schemaVersion left in place unused, Kiln searches, once per `kiln run` the line `<time>  Kiln can’t use what a newer Kiln remembers about <address path>. Update Kiln to use it.`; an answer accepted afterwards replaces it. Both cases in Testing Approach. Evidence: records.ts:577-579; state-files.ts:54-62; private-state.ts:58; terminal-output.ts:132-142; engineering-principles SKILL.md:31-55.

### Q11
Answer: no cross-process notice. Another running Kiln reads the answer only the next time it looks for its repositories (view connect reruns start checks, local-server.ts:312-313); a page already open keeps asking until reloaded (Start is disabled in the browser, documents-found.ts:155-172). An answer given there too replaces the one remembered. One sentence after "On a pass…" in §The answer.

### Q10
Answer (95%): a separate-git-dir clone is an own checkout (multi-repo PRD's definition). §The search: a `.git` folder → candidate; a `.git` file whose `gitdir:` points to `…/worktrees/<name>` → worktree, passed over without Git; any other `.git` file → candidate; a submodule is never reached (it sits inside its parent's checkout, which the search never enters); bare → never a candidate. Reading candidates and the answer: one Git call `rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir --show-superproject-working-tree` replaces `--show-toplevel`; own checkout = top level is the folder, Git dir is the common dir, no superproject. Answer messages by first mismatch: no `.git` entry → isn't a Git checkout; top level elsewhere → inside the checkout; Git dir ≠ common dir → worktree of <main checkout: the common dir's parent when it is a `.git` folder, else the common dir>; superproject → submodule of <superproject> (also catches an old-style submodule with a real `.git` folder). Evidence: Git 2.50.1 throwaway repos; src/engine/repositories.ts:59-69; folder-check.ts:62.

### Q12
Answer (90%, opposite of the proposal): no host filter. A name with `github.com:` reaches the same address path as the path alone and is found the same way (PRD AC-NAME-01 "That path, found as AC-FIND-01 finds a path"; AC-ASK-02 asks for the same path on two hosts); only GitHub checkouts can be used either way; filtering would make `acme/x` and `github.com:acme/x` find different sets though they are one repository (AC-NAME-02), and the store is keyed by path. One sentence after the §Names table.

### Q13
Answer (92%): in "Reading candidates", the line is `<time>  Kiln couldn’t read <folder> while searching for checkouts (<Git’s error>).`, at most once per `kiln run` for the same folder and error, however many searches meet it; a timeout is Git's error here (`timed out after 120 seconds`). Precedent: keep-awake's reported Set (src/platform/keep-awake.ts:133-141).

### Q14
Orchestrator check: AC-CONTINUE-06 (the continuation starts the next phase once prerequisites are verified in every affected repository) is the criterion whose words change; AC-CONTINUE-08 ("New repositories pass the existing setup checks before work in them starts") still holds, since a left-out repository is checked when it is added before its phase; continue-added-phases AC-FIND-04 (a failed required repository check shows a retry) still holds for the preparation exception, and a left-out repository is not a failed check. AC-SETUP-07 for the base-branch start. Line kept.

Conformance pass 1 fixes: TD Changes header links four more designs; Names lost a rejected-alternatives sentence; coverage table rows widened; Testing Approach gained three cases; mockup's field-message comment gained the submodule and no-origin messages (comment only; canvas artboards carry no comments, nothing to mirror).

### Q18
Answer (90%): a root is always searched, even when it is a checkout; AC-FIND-02's never-inside rule covers folders met going down; a root holding `.git` is a candidate when the root above lists it (every root but the topmost); the PRD's repository is a candidate like any other, reached first by §Names step 1; a folder is met once however many roots reach it (overlapping roots would otherwise count one checkout twice).

### Q15
Answer (90%): `kiln add-repository` is accepted at a stop (multi-repo AC-ADD-01; engine.ts:7591-7596), usually from the phase's conversation reopened in a terminal (handoff AC-TERMINAL-01) or a person; Kiln can't tell them apart, so both are treated alike. Today a request at an open stop changes neither the page nor the token (fingerprint engine.ts:665, controlRevision 8240 don't cover requests). Fold in §A session's request after "The phase doesn't stop.": "When the phase is already stopped at Needs you, whether the request comes from its conversation reopened in a terminal or from a person, the open stop gains the question at once, from the search the request just made. Kiln saves it, so the page and `kiln status` show it, and the status token changes. The answer also says "The stop in Kiln now asks where it is."" §The stops that ask row 2: "…when the stop is opened or checked, or that is made while it is open".

### Q17
Interim (85%): `<n>` counts only checkouts the search found; the remembered folder is listed even when the search didn't reach it, marked `You told Kiln where this is`; one found checkout on GitHub is asked about too under Change; with nothing found, Change shows the "where" question with the remembered folder in the field (state 2). Follow-up (90%): number rule: a count in a sentence the page writes is a word up to ten ("Kiln found two checkouts", "one checkout"), from COUNT_WORDS (view/src/lib/progress.ts:335, to be exported); every count the server writes, on the page or in the terminal, is digits ("1 repository to locate"). The view's status line "Tell Kiln where one repository is, then review and start." (state 2; the which wording in state 3) is missing from the design and goes in §Asking Before Start.

### Q16
Answer (95%): both location routes take the address path as `repository` (`Question.repository`), lower-cased by Kiln to match the open question; only the existing bodies (`bases` in /api/settings, `name` in /api/repositories) stay keyed by name. Fold: §Worktree Folders and Labels last paragraph; §HTTP both rows; §Snapshot `Question.repository` is the address path as the plan or the session's request writes it. Evidence: local-server.ts:512-518,815-821; view/src/lib/documents-found.ts:182.

Conformance pass 2: Testing Approach's search bullet now covers a root holding `.git` found as a candidate; four items raised as Q19–Q22.

### Q23
Answer (95%): the accounting runs only for a finished PRD's continuation check (engine.ts:3330-3331,3393,3436,3528-3533); only a closed, new, outside-Kiln leaf naming a repository not in the record reaches findRepository (completed-plan-accounting.ts:85-98,115-127). A repository that would ask stays a problem on that phase (`Phase <id>: ` + the question's first sentence + what clears it on Check again); leaving it out would verify the leaf falsely. A repository in the record never asks; a remembered answer is used. Fold: TD §A continuation and a base-branch start; PRD AC-ASK-07's exception sentence widened to cover a repository the continuation reads to verify earlier work; Testing line.

### Q27
Answer (98%): replace "A folder is met once, however many roots reach it." with: an outer root's walk lists the root inside it (so it can be a candidate) but never enters it; the inner root's own walk reaches everything below it the outer walk would, and more deeply; the walks then never meet the same folder, in any order. Pass-over rules depend only on the folder, so the union equals "each root four levels down" (checked on abstract trees of 1–4 roots).

### Q24
Answer (investigator 80%, orchestrator 90% on the code evidence): only a stop that asks gains lines in `kiln status` text; today's lines and state words stay (STATE_WORDS, waiver-facts.ts:191: "needs you"); under the stopped row, at the waiver lines' indent, each question's sentences, first prefixed `Phase plan reads: ` on the plan stop or `A session asked for <label>: ` on any other; one line per checkout found (`<folder>  <remote>`, `  (not on GitHub)` when not pickable); then `Controls: locate-repository (available|<reason>)`, continuing ` · waive-and-advance (once a recheck still fails)` when the stop offers Mark complete. Mockup state 7's `Needs you · hasn’t started` is drift (no criterion changes a state word; no code makes the suffix): corrected to `needs you`, canvas artboard 7 too.

Conformance pass 3: merged the Change paragraph's two sentences on the remembered folder's mark; Testing Approach covers pass 3's additions; AC-ASK-07's second Replaces line's "what stays" widened to match the exception; no new Replaces line needed.

### Q30
Answer (90%): a question doesn't end the additions before a phase; Kiln keeps it and goes on, so the stop asks every question at once; a failed check still ends them as today; repositories added before the stop stay set up whatever happens to the phase (harmless: no commits → no PR); the stop's facts are the question facts and any failure fact, in plan order; waivers match the joined facts exactly as today. Evidence: engine.ts:7608-7620,4453-4468,6206-6213; waivers.ts:242-243.

### Q31
Answer (92%): the stop saves its questions whole (`locate?: [ Question & { phaseFile? } ]`), as it saves its check rows (records.ts:111-136). Kiln searches when it makes the stop, at each Check again, when an answer is accepted, and when a request comes while the stop is open; the page, `kiln status` (which reads the record when kiln run isn't running, client.ts:73-76) and a restarted kiln run show the saved questions and never search to show them. "Opened" means Kiln making the stop. A question opening or closing changes the control revision (fingerprint engine.ts:8240-8245 must cover stop.locate), so the token changes; a restart already makes old tokens stale (controlEpoch, engine.ts:376,563,665). Rejected: searching on every page connect (stale refusals; the background check checks-at-a-stop rejects).

### Q29
Answer (92%): Mark complete can be offered on a plan stop that asks (AC-WAIVE-02, WAIVE-001); the skip records, for a repository with no entry, its lower-cased address path; a folder name that reached nothing keeps its spelling. An entry's name never holds `/`, so a key with `/` is an address path. A reader comparing a recorded key with a repository counts it as that repository when the key is its name or its address path: the scope comparison (also completed-plan-discovery.ts:151), readiness, external completion evidence. A skipped phase has no revisions, so readiness needs a valid preparation binding for that repository; one that still asks is a problem. A folder name that reached nothing has no address path, so re-spelling it reads as changed scope (loud, as renaming a folder does today). Evidence: engine.ts:4454-4463,8121-8122; plan-reconciliation.ts:276-296,331-337; completed-plan-accounting.ts:87-89; continuation-readiness.ts:77-80,107-108.

### Q32
Answer (90%): a request's label follows the same rule against the PRD's repositories: the label of the repository it asks for when that is one of them, otherwise its address path when its short name matches one of theirs, otherwise its short name; it changes no other label. `Question` gains `label` (stop.locate[] is projected from it). Not the address path everywhere: the text line would print the path twice.

Conformance pass 4: Data Models `stop.locate` lists the saved fields (label and fieldError aren't saved); a bullet notes a scopeRepositories key can be an address path; Testing covers a request's label; the schema 25 row names the address-path scope key (orchestrator, from conformance's pending question).

### Q34
Answer (90%): state 8's paragraph ("Kiln then adds it to the workspace and starts phase 4. Or clone it where the search reaches, and press Check again.") appears only when the stop holds one question and no other fact. Otherwise: one question block per question in plan order, each with its own field and button, and after the last block "Or clone it where the search reaches, and press Check again. Phase <n> starts once nothing else holds this stop." ("them" for several). Also the stop's lead ("Kiln couldn't add it") names one repository: with several, each block names its own. PRD AC-ASK-07 first row's last cell: "Adds the repository and starts the phase once nothing else holds the stop".

### Q35
Answer (investigator 85% reframed to yes; orchestrator 90%: the PRD's "for whatever reason" and the billing PRD's AC-RUN-02 calling the hold Needs you make inclusion required, and where to save follows the hold's own pattern): a billing hold is a Needs you stop of its phase (engine.ts:586,1479; snapshot.ts:746-750 builds its stop page). With a retained stop it shows that stop's saved questions; without one it saves them on `billing.hold.locate`, as it saves rows on `billing.hold.checks`; it searches when the hold is made and at each Check again; stoppedPhaseKey (engine.ts:8052) names the hold's phase, so locate-repository is eligible. Data Models: `billing.hold: { …, locate?: [ … ] }`, schema 25.

Conformance pass 5: PRD AC-SEE-03 names the plan stop with several questions and counts a billing hold among other Needs you stops; its Replaces line adds billing safeguards AC-RUN-02 (orchestrator confirmed: that criterion describes the hold's screen); §Screens says so; Testing covers the hold, a two-question plan stop and one question beside a failure.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|
| scripts/exploration/guarded-folder-walk-tcc-log.mjs | Q3 | A walk under the design's rules on macOS 26 logged no privacy request; prints counts only |

## Conflict check
Pass 1: 2026-11-22 · 16 earlier criteria changed · 8 existing lines confirmed · 4 Replaces lines to write (plus AC-ASK-07's lines from Q4) · 3 questions: A written up by the orchestrator (one sensible answer), B answered by Q4, C settled at 95% (Q2)
Changed after pass 1: AC-FOLDER-01 (Q1); AC-SEE-03, AC-ASK-07, AC-ASK-01, AC-FIND-04 (reworded by the conflict fold); AC-SPLIT-01 (Q7); AC-ASK-07 again (Q23, Q34); AC-SEE-03 again (pass 5 conformance: billing hold page, AC-RUN-02 Replaces)
Completion:

## Register re-sort
Pass 1: 2026-11-22 · 3 open entries · first sort kept all 3 business · doubt check doubted ASK-003 and ASK-002, re-sorted by the orchestrator · 0 moved to design · 2 written up (ASK-003: asking at a stop the run makes anyway adds no pause and is the only way to answer; pausing at once is ruled out by multi-repo AC-ADD-01 / REPO-002, which is that register's question. ASK-002: follows the base-branch and workspace pattern, fixed once set up; Reset Kiln covers moving after Start; "never" forces deleting a folder) · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 1 stays business (ASK-004, below the line; add evidence: under a whole-limit search "beside it first" orders nothing, which supports the alternative) · written to the register 2026-11-22; one open entry (ASK-004)

## Noticed, out of scope
- continuation-readiness.ts:64, completed-plan-accounting.ts:130 and engine.ts:3771 read origin with `git config --get remote.origin.url`, not `git remote get-url origin`, so URL rewrites (`insteadOf`) aren't applied there: pre-existing inconsistency
- A GitHub origin behind an SSH alias (`git@github-work:…`) is refused as not on GitHub: pre-existing, kept by AC-FIND-03
- Names of three or more parts can never be delivered to GitHub; making them an up-front plan problem would redesign AC-NAME-01
- `github.com/acme/x` (as `gh` and Go write it) reads as a three-part path; NAME-001 settles the form
- A one-part name starting with `.` becomes a plan problem though `.foo` is a valid folder name today
- About 600 Git processes per search with ~300 checkouts, rerun on every view connect: performance hardening
- `git rev-parse --path-format` needs Git 2.31 but the README says Kiln requires 2.29; src/engine/folder-check.ts:62 already uses it: pre-existing
- A candidate whose Git read hangs makes every search wait up to the 2-minute helper timeout (helper-process.ts:6): performance hardening
- outsideWorkspacePrompt's inWorkspace compares folder names, but only test fixtures build it

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| Canvas artboard 7 (TerminalCommands) update to `needs you` refused by the auto-mode permission check; the edited copy is in the session scratchpad | Q24 (mirror only) | Doug approves the publish, or edits artboard 7 by hand |
| The worktree has no node_modules, so Kiln's tests and build can't run here | Any question needing a run of Kiln code | Read the code instead; `npm ci` only if a question can't be settled by reading |

## Next action
Pass 6: discovery (one subagent, state file for repeats).
