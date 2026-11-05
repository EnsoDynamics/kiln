# Kiln development deployments — Business assumptions

<!-- EDITING THIS FILE? Load assumptions-document-writing before editing, and
     assumptions-document-feedback when recording stakeholder answers.
     Assumption IDs are permanent. Keep one Last Updated line; remove superseded
     entry text, which version control retains. -->

**Last Updated:** 2026-10-30
**Status:** All assumptions settled

These are the business assumptions used in the [development-deployments PRD](kiln-development-deployments-prd.md). No assumption awaits validation.

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|---|---|---|---|
| <a id="auth-001"></a>AUTH-001 | Cross-PRD remembering and reuse removed; early-merge permission belongs only to the current PRD execution | 2026-10-30 | Doug: “remove the remember/reuse feature and its preference storage”; PRD AC-PERMIT-03 |
| AUTH-002 | Approve early merges to a named repository and configured base branch for this execution, without an environment field or non-production attestation; retain the grant across restarts without resuming | 2026-10-26 | Doug corrected the earlier environment-based ruling in conversation `01a17975-ea88-7082-ae74-c10be2ad7121`: “the whole thing is we’re merging to a Git branch”; PRD AC-PERMIT-02/05 and Technical Design → Execution grants |
