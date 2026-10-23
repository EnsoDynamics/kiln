# Phase 6: Complete Codex agent and account displays

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
