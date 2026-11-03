# Kiln public release readiness - Business Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️ -->

**Last Updated**: 2026-11-03
**Status**: All assumptions ruled

**Document Purpose**: This document lists the business assumptions made to get Kiln ready for its first public release ([PRD](kiln-public-release-readiness-prd.md)). Work proceeds on these assumptions; business validation confirms or corrects any that are wrong.

---

## Release Assumptions

None pending. Every assumption has a ruling; see the table below.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PUB-001 | Corrected: no release test run on the newest agents as an acceptance criterion; Doug tests the published release himself, unannounced, and patches if needed | 2026-11-03 | AC-AGENT-06 retired; PRD Out of Scope |
| PUB-002 | CI is green once a run ends with every job and test passing; failed jobs may be rerun, with no fixed limit | 2026-11-03 | PRD AC-CI-02 and AC-CI-03 |
| PUB-003 | Accepted risk: billing details are trusted on every Claude Code version at or above the minimum. **Claude subscription** shows only when Kiln recognises every setting and credential source it reads; anything unfamiliar shows **Claude Code settings**. A credential source a future Claude Code adds may go undetected until Kiln learns it | 2026-11-03 | Doug in chat; PRD AC-AGENT-02; design §Billing gate |
| PUB-004 | Accepted risk: live messages are offered on every supported Claude Code version, though a future version might not treat a message as plain text (for example, reading a leading `/` as a command). Kiln can never guarantee how Claude handles a message | 2026-11-03 | Doug in chat; PRD AC-AGENT-03 (replaces in part AC-MSG-04); design §Live control eligibility |
