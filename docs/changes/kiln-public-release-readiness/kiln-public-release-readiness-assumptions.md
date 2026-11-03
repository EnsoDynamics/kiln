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

### PUB-004. Accept that live messages on a newer Claude Code are trusted to arrive as typed, without retesting each version? — ⏳ PENDING (Added 2026-11-03 — new question; 75% confidence)

**Assumption**: **Message Claude** and `kiln message` work on **every Claude Code version at or above the minimum**, and Kiln keeps asking Claude Code to treat each message as **plain text**, as it does on 2.1.311 today. Kiln turns messaging off for a session when Claude Code's echo of a message differs from what was sent. **The remaining risk is accepted**: a future Claude Code could stop honouring that request and treat a message starting with `/` or containing `@file` as a command or file reference while still echoing it unchanged, and Kiln could not tell.

**Example**: a phone message `/clear and carry on` arrives in the conversation as that text on 2.1.311. On an affected future version it could instead clear the conversation.

**Evidence**: The live control requirements say a message reaches Claude literally (AC-MSG-04). The plain-text request is an internal Claude Code field, not part of its public interface, so the earlier design offered messaging only on the one version tested. Doug ruled on 2026-11-03 that Kiln must work with the latest versions. Each new version can still be checked by hand.

**Confirm or Correct**:
- [ ] Correct — offer live messages on any supported version, as stated
- [ ] Wrong — offer live messages only on versions Kiln has been tested with
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PUB-001 | Corrected: no release test run on the newest agents as an acceptance criterion; Doug tests the published release himself, unannounced, and patches if needed | 2026-11-03 | AC-AGENT-06 retired; PRD Out of Scope |
| PUB-002 | CI is green once a run ends with every job and test passing; failed jobs may be rerun, with no fixed limit | 2026-11-03 | PRD AC-CI-02 and AC-CI-03 |
