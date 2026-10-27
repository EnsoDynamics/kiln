# Design Refinement State — Kiln bot control

Started: 2026-10-27 UTC   Current pass: 1   Status: In progress
Branch: wt/botcontrol-kiln-tdd-refine
Existing code posture: Preserve (source: Technical Design, Existing Code)
PRD words: at start 3097 · growth baseline 3097
Last updated: 2026-10-27T02:00:00.974909+00:00

## Documents
| Document | Path |
|---|---|
| PRD | kiln-bot-control-prd.md |
| Technical Design | kiln-bot-control-technical-design.md |
| Assumptions | kiln-bot-control-assumptions.md |
| Supporting | kiln-bot-control-command-mockup.md; kiln-bot-control-investigation.md |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2 | 0 | 2 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|

| Q1 | 1 | Does max-lines count saved output entries or physical newlines? | Business | MEDIUM | 85 → 85 | Assumption | OUTPUT-001; AC-SEE-06; TD Output Pages; mockup logs |
| Q2 | 1 | Does text/JSON execution include legacy helpers? | Business | MEDIUM | 92 → 92 | Assumption | SCOPE-001; AC-CLI-01; TD contracts; mockup |

## Question notes
Q1: preserve saved numbered entries (may contain internal newlines); hard byte cap unchanged. Source: session-output.ts:119; TD Output Pages. Business judgment, unit disposition at 85%; combined OUTPUT-001 stays 80% because numeric defaults remain proposed.
Q2: preserve existing helper execution contracts; text/JSON execution for new bot commands, all-command help. Sources: audit-command.ts:23, delivery-command.ts:20, add-repository-command.ts:60; TD Existing Code. Business judgment at 92%; combined SCOPE-001 stays 85% for its overall boundary.

## Exploration scripts
None.

## Conflict check
Pass 1: 2026-10-27 UTC · checked all nine other PRDs · one additional intended partial replacement found (v1 AC-CLI-01 prohibition on separate resume); pointer added to AC-ACT-02. Existing partial replacement of v1 AC-CLI-02/AC-VIEW-02 remains. No unintended conflicts.
Changed after pass 1: AC-SEE-06; AC-CLI-01.
Completion: 2026-10-27 UTC · rechecked AC-SEE-06 and AC-CLI-01; partial AC-ACT-02 pointer validated. No additional conflicts or earlier-criterion replacements.

## Noticed, out of scope
- The roadmap summary still mentions subscription login; roadmap ownership is outside this session and governing PRD scope is already explicit.

## Blockers
None. Source/filesystem available; no provider calls or real run control authorized or needed for initial discovery.

## Next action
Pass-1 conformance passed; commit checkpoint, then final readiness verification. Discovery yield 2 (<3); no backlog. Conformance: 25 links/anchors, 5 JSON examples, 18 criteria, assumption refs, diff check pass. No new AC changes.
