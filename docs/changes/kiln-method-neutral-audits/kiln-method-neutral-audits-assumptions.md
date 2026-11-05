# Kiln method-neutral completion audits - Business Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE `assumptions-document-writing` SKILL FIRST ⚠️
     It owns this document's format. Folding a stakeholder's answers? Load
     `assumptions-document-feedback` as well.

     Superseded entry text comes OUT — version control holds it. Keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️ -->

**Last Updated**: 2026-11-01
**Status**: DRAFT - Pending business validation

**Document Purpose**: The business assumptions behind [Kiln method-neutral completion audits](kiln-method-neutral-audits-prd.md). We are proceeding with them and need business validation or correction of any that are wrong.

**Technical details** are in the [Technical Design](kiln-method-neutral-audits-technical-design.md).

---

## Evidence Assumptions

### EVID-001. Should Kiln stop checking that the test runs an audit cites really ran?

**Assumption**: **Yes. Kiln trusts the audit's own account of its test runs** and no longer reads Codex or Claude history to confirm them. Kiln still checks that the audit reached a natural end, that the plan routes correctly, and that the work is committed and pushed.

**Evidence**: the direction asked for the bare minimum and to rely on the skill. The investigating session recommended keeping one check, that a run cited as passing really ran and succeeded in an assigned repository. That one check still needs the history reader, the second-largest source of recent fixes, and a report that names the runs it relies on, which ties the report back to the skill's procedure. Committed tests stay in the repository for any later reviewer.

**Confirm or Correct**:
- [ ] Correct — trust the audit's account of its runs
- [ ] Wrong — keep the one check that each cited passing run appears, successful, in the session's own history
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM (the development-delivery receipt reader remains and could back a narrow check)

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
