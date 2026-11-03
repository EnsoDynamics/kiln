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

### PUB-001. Check the release with one real Kiln run per agent on the newest Claude Code and Codex, including a live message and a takeover?

**Assumption**: Before the release, run Kiln for real on macOS twice, once with **the newest stable Claude Code** and once with **the newest stable Codex** available that day. Each run is a small disposable feature of **at least two phases**. The Claude run also exercises **billing details, a live message, and a takeover with hand-back**. This is AC-AGENT-06.

**Evidence**: The exact version pins were a deliberate choice. Billing and live control were proven only on the versions they were tested with, and the automated suites replay those recorded versions. Once the pins go, only a real run on the current versions proves the features still work. Each run spends model usage, probably under an hour per agent.

**Confirm or Correct**:
- [ ] Correct — one real run per agent on the newest versions, as stated
- [ ] Wrong — Claude Code only; Codex keeps its existing proof
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟡 MEDIUM

---

### PUB-002. Count a candidate as green if failed CI jobs pass within two reruns?

**Assumption**: A release candidate's CI counts as green when every job passes, **rerunning a failed job at most twice**. Each test that needed a rerun is written down with its failure, so it can be fixed after the release. This is AC-CI-02 and AC-CI-03.

**Evidence**: On 2026-11-03 Doug ruled that a green candidate is enough and that the release shouldn't wait on making the whole suite reliable. In the latest develop runs, each failure was a different timing-sensitive test that passes on its own. Two reruns gives an intermittent failure a fair chance to clear. A test that fails three times in a row is more likely a real defect.

**Confirm or Correct**:
- [ ] Correct — at most two reruns
- [ ] Wrong — no reruns; every job must pass the first time
- [ ] Wrong — different limit: _______________

**Confidence**: 70% | **Impact if Wrong**: 🟢 LOW

---

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
