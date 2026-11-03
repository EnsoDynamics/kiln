# Design Refinement State — Kiln public release readiness

Started: 2026-11-03   Current pass: 4   Status: In progress
Branch: develop
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 2674 · growth baseline 2674
Last updated: 2026-11-03 (pass 1 checkpoint)

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-prd.md |
| Technical Design | docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-technical-design.md |
| Assumptions | docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-assumptions.md |
| Supporting | none beyond the earlier PRDs/designs the TD names in Replaces lines |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 12 | 12 | 10 | 0 | 2 | 0 | 0 |
| 2 | 8 | 12 (5 carried + 7) | 12 | 0 | 0 | 0 | 0 |
| 3 | 3 | 6 (3 carried + 3) | 6 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| C1 | 1 | Unrecognised takeover hook after a takeover is accepted: keep the hold (AC-TAKE-01/02) or cancel and continue (TD)? | Business | HIGH | 85 → 96 | Resolved | PRD AC-AGENT-04; TD §Takeover hook recognition, Proving |
| D1 | 1 | When does the live message contract become unrecognised (missing echo, unreported consumption, array content)? | Technical | HIGH | 55 → 90 | Resolved (pass 2, observed on 2.1.311; merged-prompt rule added) | TD §Live message recognition, Proving |
| D2 | 1 | Hook-absence detection: false positives from pre-hook tool rejections; how is a missing PostToolBatch detected? | Technical | HIGH | 60 → 90 | Resolved (pass 2, observed on 2.1.311–2.1.316) | TD §Takeover hook recognition, Data Models, Proving |
| D3 | 1 | Codex tool-parameter allowlists (exec_command, view_image, wait): stay strict under AC-AGENT-07? | Technical | HIGH | 80 → 92 | Resolved (reframed: receipts, not confinement audit) | TD §Codex tool inputs, §Codex audit envelopes, Proving |
| D4 | 1 | Billing identity still carries CLI and SDK versions, so updates still void approvals | Technical | MEDIUM | 70 → 95 | Resolved | TD §Billing contract identifier, Proving gate tests |
| D5 | 1 | Unrecognised/prerelease agent versions: what each feature does; Codex prerelease handling | Technical | MEDIUM | 65 → 90 | Resolved | TD §Version comparison, §Start checks for versions |
| D6 | 1 | 40-line help vs long `purpose` text: add a short summary field, 80-column limit? | Technical | MEDIUM | 70 → 92 | Resolved (names only, no summary field) | TD §Text help, §Top-level text help |
| D7 | 1 | Standing guard: how a version literal is recognised (regex-escaped, Kiln self-version, prompts/) | Technical | MEDIUM | 75 → 92 | Resolved | TD §Standing guard, §Live control eligibility |
| D8 | 1 | Does an outdated agent the person isn't using block `kiln run`? | Business | MEDIUM | 70 → 96 | Resolved (settled by codex-support AC-AGENT-03) | PRD AC-AGENT-05, AC-SYNC-01; TD §Start checks for versions, §Start check problem wording |
| D9 | 1 | Where the browser view and `kiln status` show compatibility notices | Technical | MEDIUM | 75 → 92 | Resolved | TD §Compatibility notices; PRD Mockup states; mockups/kiln-public-release-readiness.html |
| D10 | 1 | Do underway runs (resume, started PRD) check minimums? | Technical | LOW | 80 → 95 | Resolved (by the D8 row: agent readiness checked at every launch; Node/Git follow AC-START-02) | TD §Start checks for versions |
| D11 | 1 | TD names the wrong test for the packed-file `.map` checks (installed-package test, not package-manifest) | Technical | LOW | 95 → 98 | Resolved | TD §Repository, Package and Documentation Changes |
| P1 | 1 | Billing contract v3→v4 voids metered approvals once: state it in the PRD (user-visible) or leave it in TD rationale? | Business | LOW | 70 → 92 | Resolved by decision (stays in TD rationale: approvals are scoped to one execution, so the v4 change costs at most one re-approval for a run underway at upgrade; a consequence, not a requirement) | — |
| P2 | 1 | Codex command evidence notice reads "unavailable" for the whole feature though one unknown parameter withholds one receipt; mockup example puts `environment_id` on exec_command | Technical | LOW | 70 → 92 | Resolved | TD §Codex tool inputs; mockup state 3 |
| P3 | 1 | `kiln status` compatibility uses `agent`/`agent_version`; record model uses `agentId`/`agentVersion`: state the mapping? | Technical | LOW | 85 → 95 | Resolved | TD §Compatibility notices |
| E1 | 2 | Which commit is the release candidate when docs-only commits never run CI (reruns/scan files committed after the runs)? | Technical | HIGH | 60 → 90 | Resolved (candidate = develop head at PR open; dev CI = last watched-path push run) | TD §CI evidence; PRD AC-CI-03 |
| E2 | 2 | Release PR open: any develop push reruns the full macOS/Windows checks, breaking "once, last" | Technical | HIGH | 65 → 90 | Resolved | TD §CI evidence, §Run that stops before publishing; PRD AC-CI-03 |
| E3 | 2 | PowerShell minimum half specified: launch below/unrecognised, notice agent/version, README | Technical | MEDIUM | 60 → 93 | Resolved (reframed: PowerShell reader is proof-only; minimum matters at Windows launch) | TD §PowerShell (Codex on Windows), §Version problem wording, §Compatibility notices, Data Models, README bullet; PRD AC-AGENT-05 |
| E4 | 2 | Default Claude stand-in reports 2.1.299-stand-in, below the new minimum | Technical | MEDIUM | 65 → 90 | Resolved (unparseable default keeps today's test behavior; investigator 75, orchestrator 90: the only trade-off is notices on default records, which no assertion reads) | TD §Proving (stand-in paragraph) |
| E5 | 2 | Where the AC-REPO-07 client-name list lives without leaking a path into the public TD | Technical | MEDIUM | 75 → 93 | Resolved (the repo's pre-commit hook already runs the maintainer's client-terms checker) | TD §Candidate scan |
| E6 | 2 | README-linked docs (Codex macOS validation, command-line/bot control) become false | Technical | MEDIUM | 70 → 95 | Resolved | TD §README and minimums |
| E7 | 2 | "Each command's usage error" would degrade helper usage lines | Technical | LOW | 75 → 90 | Resolved (only kiln run changes) | TD §Usage errors |
| E8 | 2 | README test must require every minimum present (Claude Code absent today; engines.node) | Technical | LOW | 80 → 95 | Resolved (pass 3) | TD §README and minimums |
| F1 | 2 | PowerShell blocker only at pre-launch check; does Documents found also show it when Codex is selected on Windows (AC-AGENT-05 "when that agent is selected")? | Technical | LOW | 70 → 92 | Resolved (pass 3: pre-launch check satisfies "starts no session"; Documents found would add scope) | TD §PowerShell (Codex on Windows) |
| F2 | 2 | AC-SYNC-01 lists Node, Git, Claude Code, Codex but not PowerShell, which the README now states: does the website state it? | Technical | LOW | 70 → 92 | Resolved by decision (pass 3: AC-SYNC-01 unchanged; the website need not state PowerShell, Windows is best effort and the README states it) | — |
| G1 | 3 | When does the takeover hook contract (and Codex command evidence) become recognised, so its notice clears? | Technical | MEDIUM | 65 → 90 | Resolved by decision (moot under G2: notices clear on a different version, no recognised event needed) | TD §Compatibility notices, Data Models |
| G2 | 3 | Does an unrecognised contract carry over to later attempts on the same Claude Code version (panel vs composer; launch args)? | Technical | MEDIUM | 60 → 90 | Resolved by decision (investigator 85: residual is the false-positive trade-off, stated in the TD rationale; no fact left to investigate) | TD §Compatibility notices, §Live message recognition, §Takeover hook recognition, §Live launch arguments, Data Models, Proving |
| G3 | 3 | Per-command text help keeps the bot guidance paragraph? | Technical | LOW | 80 → 95 | Resolved (only top-level text help drops it; bot-control test audit pins per-command guidance) | TD §Text help |
| H1 | 3 | Notice lifecycle with an unparseable Claude Code version: does `unrecognised` match itself? | Technical | LOW | 80 → 95 | Resolved (conformance follow-up) | TD §Compatibility notices |

## Question notes

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-03 · 5 earlier criteria changed (AC-MSG-04, AC-ACT-01 already covered) · 1 Replaces line written (AC-LIVE-02 under AC-AGENT-04) · 1 raised as a question (C1: AC-TAKE-01/02)
Changed after pass 1: AC-AGENT-04, AC-AGENT-05, AC-SYNC-01, AC-CI-03, Mockup states
Completion:

## Noticed, out of scope
- `kiln_version: "1.0.0"` hard-coded in control capabilities and Codex clientInfo (won't follow releases); pre-existing
- Unknown-command message at kiln-command.ts:139 lists outdated commands; unreachable
- Managed `disableAllHooks`/`allowManagedHooksOnly` would make takeover look unrecognised and blame the version; pre-existing
- Latest develop CI run (1b8cc28) is red; no runs after it
- A Codex built from source reports `0.0.0` and would count as below minimum
- `src/session/codex-evidence-store.ts:46` hard-codes "Node.js 22.15" rather than reading the minimums module (two-part; guard won't see it)
- Codex 0.166 `migrate-rollouts` paginated history; TD claim that 0.166 uses only known record types not re-verified

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 4: discovery (no carried questions).