# Kiln automatic completion audits — business assumption

<!-- Before editing, load assumptions-document-writing; when folding stakeholder answers,
     also load assumptions-document-feedback. IDs are permanent; do not renumber. -->

**Last updated:** 2026-10-24
**Status:** Draft — pending business validation.

One proposed decision remains open. Work may proceed on it unless corrected.

<a id="upgrade-001"></a>
## UPGRADE-001 — Which existing executions receive the new audits?

**Assumption:** Apply the audits to **new and unfinished executions**, after any running session finishes. **Do not reopen completed executions solely for missing historical audits**, or claim audits ran retroactively. Existing recovery checks still apply; an execution they return to unfinished work must pass the new audits before completing again.

**Example:** A saved execution paused after its last implementation phase runs the audits when continued. An execution already marked Complete is not reopened just to add audits. If existing development-delivery recovery finds newer work that is not delivered, the reopened execution runs the audits before completing again.

**Evidence:** Doug requested audits before final completion. Existing Kiln recovery can finish a saved execution immediately when its final repository checks pass, so leaving unfinished executions on that path would preserve the gap.

The request did not specify retroactively reopening completed work. Development-deployments AC-RECOVERY-03 already requires reconciliation when reopening saved work; this proposal preserves it.

**Confidence:** 90%. **Impact if wrong:** Medium — users could get unexpected additional work after upgrading, or completed work they expected to recheck would stay historical.

**Confirm or correct:**

- [ ] Correct as stated.
- [ ] Wrong — apply only to executions started after the upgrade.
- [ ] Wrong — different behavior: _______________
