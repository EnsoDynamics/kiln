# Design Refinement State — Kiln billing safeguards

Started: 2026-10-25   Current pass: 1   Status: In progress
Branch: wt/kiln-billing-safeguards-prd
Existing code posture: Preserve (source: Technical Design)
PRD words: at start 3687 · growth baseline 3687
Last updated: 2026-10-25 UTC

## Documents
| Document | Path |
|---|---|
| PRD | kiln-billing-safeguards-prd.md |
| Technical Design | kiln-billing-safeguards-technical-design.md |
| Assumptions | kiln-billing-safeguards-assumptions.md |
| Supporting | mockups/ galleries and screenshots |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2 | 2 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|

| Q1 | 1 | How is inspection safe under managed startup configuration? | Technical | HIGH | 70 → 95 | Resolved | TD §Claude Inspection Contract, §Testing and Validation, §Open Questions |
| Q2 | 1 | What exact effective-environment projection does authentication use? | Technical | HIGH | 85 → 95 | Resolved | TD §Claude Inspection Contract, §Route and source classification |

## Question notes

### Q1
Proposed answer: use existing SDK0.3.310 passive resolveSettings inventory for qualified CLI2.1.307; never session initialize/get_settings/query/usage/bare to fill optional gaps. Resolver omits dynamic policyHelper and refresh; permit builtin OS policy readers only. Managed/dynamic/host/unknown contracts make affected additional facts unavailable, with concrete inherited/extracted override evidence retained. No trial session, warning, acknowledgement or unsupported-version blocker. Apply Q2 map only to qualified ordinary settings; existing independent auth/model/provider/skill/mandatory-policy readiness authoritative. Consume safe required readiness facts, never add managed auth status merely for optional data. Partial inventory does not prove subscription or clear detected override/grant revision. Work env/policy unchanged; fingerprint observable settings plus identity and contract version, no claim to unknown remote changes.
Evidence: sdk.d.ts3369–3381 (passive API/omissions),4296 (managed hooks); synthetic passive probe detected project API key/helper/hooks with customizationExecuted:false. Auth canary ran no hooks but preaction includes managed-helper machinery, hence not universally safe. Official headless bare documentation changes settings/OAuth; rejected.

### Q2
Proposed answer: 2.1.307 ordinary-local projection starts from an immutable launch environment and applies per-key resolved settings strings literally (including empty), with managed > flag > local > project > user precedence. Explicit billing map covers direct API/auth/OAuth credentials, active provider selectors/endpoints, provider-relevant cloud context, profile/federation, custom headers and configured helpers; helpers are detected, never independently executed. Empty entries disable earlier values. Credentials/region alone do not select a cloud provider. Host-managed or incomplete managed profiles are unqualified; preserve concrete evidence and Q1 neutral optional-unavailable treatment, mandatory auth/policy retained. Only qualified projection reaches auth subprocess; actual work environment unchanged.
Evidence: official Claude environment/settings/authentication references; installed 2.1.307 embedded env filters at /private/tmp/kiln-billing-env-application-2.1.307.js; sdk.d.ts:3338–3380. No CLI/model requests launched. Fold writer retains full field map in design.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|
| /private/tmp/kiln-billing-passive-probe.mjs | Q1 | Passive inventory detects synthetic key/helper/hooks without customization execution |
| /private/tmp/kiln-billing-auth-only-probe.py | Q1 | Project canary untouched; not proof of managed safety |

## Conformance
Pass 1 and final: placement, all20 acceptance criteria coverage, crossrefs and Open Questions checked. Removed existing account-card narration; named exact host marker. No new questions. PRD3774 / TD4793 / assumptions651 words.

## Conflict check
Pass 1: 2026-10-25 · 11 earlier criteria intentionally changed · six already linked; four new pointer lines covering five criteria folded · zero unintended questions (six earlier PRDs checked)
Changed after pass 1: AC-BILL-03, AC-RUN-03, AC-RUN-07, AC-CODEX-05 (replacement pointers only)
Completion: 2026-10-25 · AC-BILL-03, AC-RUN-03, AC-RUN-07, AC-CODEX-05 rechecked · 11 earlier criteria intentionally replaced overall, zero unintended conflicts

## Noticed, out of scope
- None.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| None; local installed CLI and SDK available, remote fetch succeeds with network permission | — | — |

## Next action
Pass1 and final conformance complete; checkpoint pass1 then run independent final readiness verification.
