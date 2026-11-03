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
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions made to get Kiln ready for its first public release ([PRD](kiln-public-release-readiness-prd.md)). Work proceeds on these assumptions; business validation confirms or corrects any that are wrong.

---

## Release Assumptions

### PUB-003. Accept that billing details on a newer Claude Code are trusted without retesting each version?

**Assumption**: Billing details work on **every Claude Code version at or above the minimum**, not only the tested one. Kiln still shows **Claude subscription** only when it recognises every setting and credential source it reads. Anything unfamiliar falls back to the neutral **Claude Code settings** summary (AC-AGENT-02). **The remaining risk is accepted**: a new way of supplying credentials that a future Claude Code adds might not be detected until Kiln learns about it. This is the same limit the README already states ("not a per-request billing firewall or a spending cap").

**Evidence**: Today the billing check only runs on the exact Claude Code 2.1.307 and Agent SDK 0.3.310 pair. Claude Code updates itself, so in practice every public user would see the neutral summary and never a confirmed subscription. Doug ruled on 2026-11-03 that Kiln must work with the latest versions. This assumption records the billing risk that ruling brings with it.

**Confirm or Correct**:
- [ ] Correct — trust recognised billing information on any supported version, as stated
- [ ] Wrong — keep the neutral summary on any version Kiln hasn't been tested with
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PUB-001 | Corrected: no release test run on the newest agents as an acceptance criterion; Doug tests the published release himself, unannounced, and patches if needed | 2026-11-03 | AC-AGENT-06 retired; PRD Out of Scope |
| PUB-002 | CI is green once a run ends with every job and test passing; failed jobs may be rerun, with no fixed limit | 2026-11-03 | PRD AC-CI-02 and AC-CI-03 |
| PUB-004 | Accepted risk: live messages are offered on every supported Claude Code version, though a future version might not treat a message as plain text (for example, reading a leading `/` as a command). Kiln can never guarantee how Claude handles a message | 2026-11-03 | Doug in chat; PRD AC-AGENT-03 (replaces in part AC-MSG-04); design §Live control eligibility |
