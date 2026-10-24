# Kiln automatic completion audits — business assumption

<!-- Before editing, load assumptions-document-writing; when folding stakeholder answers,
     also load assumptions-document-feedback. IDs are permanent; do not renumber. -->

**Last updated:** 2026-10-24
**Status:** Draft — pending business validation.

One proposed decision remains open. Work may proceed on it unless corrected.

<a id="upgrade-001"></a>
## UPGRADE-001 — Which existing executions receive the new audits?

**Assumption:** Apply the audits to **new and unfinished executions**, after any running session finishes. **Preserve completed executions** as historical results, without reopening them or claiming audits ran retroactively.

**Example:** A saved execution paused after its last implementation phase runs the audits when continued. An execution already marked Complete before the upgrade stays complete under its original workflow.

**Evidence:** Doug requested audits before final completion. Existing Kiln recovery can finish a saved execution immediately when its final repository checks pass, so leaving unfinished executions on that path would preserve the gap. The request did not specify retroactively reopening completed work; those pull requests may already have been reviewed or delivered.

**Confidence:** 90%. **Impact if wrong:** Medium — users could get unexpected additional work after upgrading, or completed work they expected to recheck would stay historical.

**Confirm or correct:**
- [ ] Correct as stated.
- [ ] Wrong — apply only to executions started after the upgrade.
- [ ] Wrong — different behavior: _______________
