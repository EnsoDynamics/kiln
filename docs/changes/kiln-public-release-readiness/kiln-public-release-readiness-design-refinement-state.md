# Design Refinement State — Kiln public release readiness

Started: 2026-11-03   Current pass: 1   Status: In progress
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

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| C1 | 1 | Unrecognised takeover hook after a takeover is accepted: keep the hold (AC-TAKE-01/02) or cancel and continue (TD)? | Business | HIGH | 85 → 96 | Resolved | PRD AC-AGENT-04; TD §Takeover hook recognition, Proving |
| D1 | 1 | When does the live message contract become unrecognised (missing echo, unreported consumption, array content)? | Technical | HIGH | 55 → 85 | Deferred | — |
| D2 | 1 | Hook-absence detection: false positives from pre-hook tool rejections; how is a missing PostToolBatch detected? | Technical | HIGH | 60 → 85 | Deferred | — |
| D3 | 1 | Codex tool-parameter allowlists (exec_command, view_image, wait): stay strict under AC-AGENT-07? | Technical | HIGH | 80 → 92 | Resolved (reframed: receipts, not confinement audit) | TD §Codex tool inputs, §Codex audit envelopes, Proving |
| D4 | 1 | Billing identity still carries CLI and SDK versions, so updates still void approvals | Technical | MEDIUM | 70 → 95 | Resolved | TD §Billing contract identifier, Proving gate tests |
| D5 | 1 | Unrecognised/prerelease agent versions: what each feature does; Codex prerelease handling | Technical | MEDIUM | 65 → 90 | Resolved | TD §Version comparison, §Start checks for versions |
| D6 | 1 | 40-line help vs long `purpose` text: add a short summary field, 80-column limit? | Technical | MEDIUM | 70 → 92 | Resolved (names only, no summary field) | TD §Text help, §Top-level text help |
| D7 | 1 | Standing guard: how a version literal is recognised (regex-escaped, Kiln self-version, prompts/) | Technical | MEDIUM | 75 → 92 | Resolved | TD §Standing guard, §Live control eligibility |
| D8 | 1 | Does an outdated agent the person isn't using block `kiln run`? | Business | MEDIUM | 70 → 96 | Resolved (settled by codex-support AC-AGENT-03) | PRD AC-AGENT-05, AC-SYNC-01; TD §Start checks for versions, §Start check problem wording |
| D9 | 1 | Where the browser view and `kiln status` show compatibility notices | Technical | MEDIUM | 75 → 92 | Resolved | TD §Compatibility notices; PRD Mockup states; mockups/kiln-public-release-readiness.html |
| D10 | 1 | Do underway runs (resume, started PRD) check minimums? | Technical | LOW | 80 → 95 | Resolved (by the D8 row: agent readiness checked at every launch; Node/Git follow AC-START-02) | TD §Start checks for versions |
| D11 | 1 | TD names the wrong test for the packed-file `.map` checks (installed-package test, not package-manifest) | Technical | LOW | 95 → 98 | Resolved | TD §Repository, Package and Documentation Changes |
| P1 | 1 | Billing contract v3→v4 voids metered approvals once: state it in the PRD (user-visible) or leave it in TD rationale? | Business | LOW | 70 → 70 | Pending | — |
| P2 | 1 | Codex command evidence notice reads "unavailable" for the whole feature though one unknown parameter withholds one receipt; mockup example puts `environment_id` on exec_command | Technical | LOW | 70 → 70 | Pending | — |
| P3 | 1 | `kiln status` compatibility uses `agent`/`agent_version`; record model uses `agentId`/`agentVersion`: state the mapping? | Technical | LOW | 85 → 85 | Pending | — |

## Question notes

### D1
Deferred at 85: ordering read from the minified 2.1.317 binary, not observed (an observed run needs a model call). Proposed TD "Live message recognition" Decision text: contract starts unproven. Echo = `user` event with `isReplay: true`, the attempt's provider session ID and a sent UUID; text matches when `message.content` is exactly the sent text or an array of only `text` blocks joined with nothing = sent text. Consumption = sent UUID in `user_message_uuid`/`user_message_uuids` on `assistant` or `result`. Recognised: a sent message with matching echo later consumed. Unrecognised when: echo doesn't match; an `assistant` event or `result` with `is_error: false` names a sent UUID consumed with no earlier echo in the attempt; `user_message_uuid` not a string or `user_message_uuids` not an array of strings. Unreported consumption changes nothing (receipt stays "Sent to session — not confirmed read", becomes Delivery uncertain at attempt end). Unrecognised turns messaging off for the rest of the attempt; message shows Delivery uncertain. Rationale append: Claude Code echoes each prompt before the first reply naming it (dequeue of merged prompts, before first top-level assistant message, mid-turn fold via queued_command); consumption with no earlier echo means the echo is gone; error results exempt (turn cut off before first reply can name its prompt unechoed); missing UUID is normal. Mutation cell: drop echo while a successful result reports consumption; alter echoed text; `user_message_uuids` non-array; (+ existing hook cases); stand-in that echoes but never reports consumption leaves messaging on. Evidence: target.ts:44-48 (non-strings dropped silently); engine.ts:685-760 (no isReplay read; endLiveMessages 745; recoverLiveMessages 717); claude-session.ts:285-310, 242; SDK 0.3.310 sdk.d.ts:3704-3708, 5970-5974, 6630-6704; 2.1.317 binary ~offset 292109900, 292380676. Next pass: look for observed 2.1.317 stream evidence without a model call; else record as design decision with the gap stated (newest-version live proof during implementation confirms).

### D2
Deferred at 85: timing read from the 2.1.317 binary and SDK declarations, not an observed run. Proposed TD "Takeover hook recognition" Decision: replace "The engine also marks the contract unrecognised when a tool call in the stream settles without a matching `PreToolUse` observation." with: The hook records the tool-use ids of every `PostToolBatch` in the gate, whether or not a takeover is held. On the live stream the engine marks the contract unrecognised in two cases. First, a `tool_result` whose `is_error` is not `true` names a tool call the gate never admitted; results from calls that never ran (invalid input, unknown tools, denials, interruptions) are always errors and don't count. Second, in the main conversation (`parent_tool_use_id` null), an `assistant` event starts a new model response (new `message.id`) in the same turn (no `result` since), after a response whose tool calls the gate admitted, and no recorded `PostToolBatch` names any of those calls. Rationale append: Claude Code waits for PreToolUse before a tool runs and for PostToolBatch before the next model request, so both gate writes precede the stream evidence; new response not any assistant event because tools start while their response streams; resets at `result` because interrupted/deferred/hook-stopped turns end without PostToolBatch. Mutation cell adds: successful tool result for a call that never ran PreToolUse; tool call then a second model response in the same turn without PostToolBatch; controls keeping takeover on: parallel tool calls whose first result streams before the last tool call; error result for a call that never ran PreToolUse. Data model: gate needs a field for recorded PostToolBatch ids next to `contract`. Stand-in (test/stand-ins/claude-stand-in.mjs) must run the --settings hook command. Evidence: checkpoint-hook.ts:14-32; gate.ts:15,125-138; claude-session.ts:308-313; engine.ts:3562; sdk.d.ts:2683-2700; binary `tool_result_meta` non_execution_kind; test/fixtures/proof-gate-1/subagent-tool-calls-forwarded.jsonl (parallel tool use within one message id). Next pass: same as D1 — seek observed evidence; else record as decision with the gap stated.

### D5
Investigator rated 85 because the Codex alpha `--version` format is inferred from session_meta, not observed. Orchestrator folded at 90: the decision holds whatever that format is, since unparseable output is unrecognised and blocks nothing. Unparseable Codex no longer unselectable (contradicted start-checks row and AC-AGENT-04/07).

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-03 · 5 earlier criteria changed (AC-MSG-04, AC-ACT-01 already covered) · 1 Replaces line written (AC-LIVE-02 under AC-AGENT-04) · 1 raised as a question (C1: AC-TAKE-01/02)
Changed after pass 1: AC-AGENT-04, AC-AGENT-05, AC-SYNC-01
Completion:

## Noticed, out of scope
- `kiln_version: "1.0.0"` hard-coded in control capabilities and Codex clientInfo (won't follow releases); pre-existing
- Unknown-command message at kiln-command.ts:139 lists outdated commands; unreachable
- Managed `disableAllHooks`/`allowManagedHooksOnly` would make takeover look unrecognised and blame the version; pre-existing
- A Codex built from source reports `0.0.0` and would count as below minimum
- `src/session/codex-evidence-store.ts:46` hard-codes "Node.js 22.15" rather than reading the minimums module (two-part; guard won't see it)
- Codex 0.166 `migrate-rollouts` paginated history; TD claim that 0.166 uses only known record types not re-verified

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2: run discovery (carry D1, D2 first, then P1–P3), conflict check already done (re-check Changed-after-pass-1 at completion).