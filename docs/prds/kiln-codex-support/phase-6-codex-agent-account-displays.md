# Phase 6: Complete Codex agent and account displays

**Closed:** 2026-10-23

**Added by delivery audit:** 2026-10-23, after every planned phase closed. It builds the missing parts confirmed in the whole-PRD audit at `676461a`.
**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — Identity before work; Resume and stopping; Live and saved output; Readings and identity; Local API and snapshot changes.

## Summary

Show the recorded agent on Complete and in usage-recovery instructions, and explicitly identify unavailable Codex account fields in Documents found and recovery views.

## Acceptance criteria covered

AC-VIEW-01 (completes it; owned by phase 3b2), AC-VIEW-04 (completes it; owned by phase 3b2), AC-USAGE-03 (completes it; owned by phase 2).

## What the audit found missing

- **AC-VIEW-01:** `view/src/App.svelte` routes completed PRDs to `Complete.svelte`, whose Agent row hardcodes Claude Code despite `snapshot.settings.agent` identifying Codex. Separately, `Engine.resumeSession` sends Codex usage resumes through `resumePrompt` without agent identity; `prompts/resume-opening-usage-limit.txt` says Claude Code refused the request and a Claude account is now signed in.
- **AC-VIEW-04:** The existing Complete screen's settings card (`view/src/screens/Complete.svelte`, Agent row) never displays the selected Codex agent; the snapshot already supplies the correct name.
- **AC-USAGE-03:** `codexAccount` permits absent email/plan, but Documents found's `accountLines` (`view/src/lib/documents-found.ts`) silently omits each missing field, and Waiting/usage-limit Needs you reach `limitView` → `LimitAccount.svelte`, whose `who` expression also omits them or renders an empty identity line. These paths lack the explicit unavailable labels already present in `AccountPanel.svelte`.

## Out of scope for this phase

New output-history screens, changes to Claude catalogue naming or existing phase-route behavior, metadata retry-policy changes, and any expansion of the approved platform, cleanup or live-quota validation scope.

## Phase dependencies

2 (selected-agent metadata and Documents found account summaries); 3b2 (Complete and recovery presentation); 4 (Codex usage-resume path).

## Audit disposition and handoff

The main auditor confirmed all three gaps after independent assessment. The conflict check read every other PRD's criteria: no later requirement authorizes these Codex omissions. Earlier Claude-only screen and recovery wording is superseded for Codex by the current PRD and design. No business assumption or requirements change is needed. The missing behavior is one bounded presentation capability and fits one implementation session; prove each whole criterion, retaining its original owner above.

After this completion phase closes, continue to the whole-PRD `test-audit` in a fresh chat. The original seven leaves retain their Closed lines. Read Phase 5's final validation/audit handoff and the shared proof results for reusable evidence and the exact full-suite concurrency distinction; no new quota exhaustion or Linux/Windows proof is required.

## Inherited delivery restrictions

Doug in source chat `01a1689e-dbff-7f61-9231-139a95505c95`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” These restrictions remain in force. The later “Authorize disposable proof only” answer in chat `01a16abe-da90-7ae0-8c0a-be086b7b1742` covered only the named proof repository's completed writes, not Kiln product pushes or future proof writes.

## Implementation and whole-PRD test-audit handoff — 2026-10-23

Complete reads the fixed agent name from `snapshot.settings.agent`. `Engine.resumeSession` passes the saved session's agent to the usage-resume template; Claude's existing wording and note/repair/carry-on order are preserved. Documents found and `LimitAccount` explicitly label each unavailable Codex identity/plan field while retaining known values and the existing reading/error paths. No selection, metadata, usage-release or cleanup policy changed.

| Completed criterion | Evidence for this completion and reusable whole-criterion coverage |
|---|---|
| AC-VIEW-01 | `engine-helpers.test.ts` checks exact Codex, explicit Claude and legacy phase usage-resume text for named/unknown limits, plus the agent opening and final-PR continuation. `codex-usage.integration.test.ts` checks the actual automatic and manual `turn/start` input, including note order and no Claude wording. Existing workflow, session/output, migration and terminal tests retain recorded agent/settings/timestamps/output across restart and recovery. |
| AC-VIEW-04 | `codex-displays.integration.test.ts` runs built screens in real Chrome at 360/1280 pixels: Complete for both agents, one/multiple repositories and disconnection, plus the three affected account summaries. Existing chooser/workflow/usage/browser suites retain all other screen, control and historical-output coverage. |
| AC-USAGE-03 | The new browser matrix checks missing email, missing plan, both missing and both known in Documents found, Waiting and usage-limit Needs you. Existing metadata, selection and usage suites prove unknown windows/percentages/resets, failed refresh/stale timestamps, invalid catalogues and permitted work despite usage-read failures; the shared selection/proof results retain actual provider evidence. |

Independent conflict check and deliverable review found no conflicts, missing supersession pointers or remaining findings. Whole-PRD test audit is the next unit after closure; the delivery audit already ran at `4085361`. Reuse Phase 5's final handoff and shared proof results. Actual quota exhaustion/recovery remains deferred to live use, Linux/Windows native runtime remains untested, and RECOVER-001's tracked-process cleanup limit remains unchanged. No new model turn or disposable GitHub write was required here.

Test hardening added an explicit note-presence assertion before checking its order in the actual dispatched manual-resume input, so a missing note cannot pass as index `-1`. No additional criterion evidence gap or unjustified mock was found. The complete integration run passed 453 tests with two existing skips at four workers (130.52 seconds); the final repeat after this assertion also passed (138.64 seconds). Final `npm run lint && npm run typecheck && npm test && npm run test:codex-proof && npm run test:integration -- --maxWorkers=4` passes, with TypeScript/Svelte at zero errors/warnings, 490 unit tests and 16 pinned protocol proofs. All four installed-package cases pass (7.60 seconds). Package verification installed only into a temporary prefix; nothing was published. Product delivery remains a scoped local commit, preserving the staged root README and all local predecessors, with no push authorized.

### Pre-existing dependency audit failure

On 2026-10-23, `npm run audit` reports high-severity [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) for `body-parser@2.3.0`, through Claude SDK's peer MCP SDK → Express. `package.json` and `package-lock.json` are unchanged. Exporting only those files from predecessor `4085361` into a fresh temporary directory and running `npm audit --package-lock-only --json` reproduces the same failure. No audit suppression, dependency change or claimed all-green `npm run verify` is part of this completion phase. Preserve this distinction in the test audit; dependency remediation is outside this phase's presentation criteria.
