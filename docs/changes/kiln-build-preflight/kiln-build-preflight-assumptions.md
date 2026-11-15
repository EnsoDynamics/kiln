# Kiln Build Preflight - Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.
     Most edits here are made by sessions doing something else, which is
     exactly how the format drifts.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-11-15
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Build Preflight. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Run Assumptions

### RUN-002. Should Kiln show where the build will stop before you walk away, and on which page?

**Assumption**: **Only on the items page, when the preflight stops anyway.** The preflight's report ends with "The build will stop" text naming each place the plan stops: phases **marked as needing you**, **planned stops** in the technical design, **early merges** the design plans, and stops you chose to keep.

When the preflight finds items, Kiln stops on a page listing them (the items page), and beneath them shows that text **as the preflight wrote it, all of it**, marked phases included. When the preflight is clean, Kiln goes straight on, and the **Preflight row** in the plan shows only "Nothing to settle"; opening the row shows the full report, stops included.

**This changes two things you approved on 2026-11-14.** The approved items page had **no stop text**; it now has the report's. The approved line above Start said **"Phases 2 to 5 run without you"**; it now names the marked phases and says the preflight's report names any other stop.

**Evidence**: The 2026-11-14 review took the stop lines off a clean preflight's row: "the row repeated where the build will stop, which the marked phase's own badge already shows and which says nothing about the preflight once Kiln has moved on to Phase 1."

Kiln does not read which phases plan an early merge, so no marker can show one. On a clean preflight, **planned stops and early merges are shown nowhere** you would look; an earlier review traced a lost overnight run to an early-merge permission that was "avoidable" if settled before Start.

The product owner's own habits point the other way. Their hand-written instructions for an earlier Kiln build (2026-10-17) named the human stops up front, and Kiln requirements they reviewed say such things are shown once, before starting: a link Kiln did not follow is something "the person needs to see once, before starting, and never as a warning to clear" (2026-11-10 review), and the person chooses before Start when audit loops stop to ask. That is what the second option below would give them on every clean run.

**If they choose otherwise**: Kiln also lists every stop on a clean preflight's row, reversing part of the 2026-11-14 ruling; or it never lists them, and the items page drops the stop text and shows only the numbered items.

**Confirm or Correct**:
- [ ] Correct — show them on the items page only; on a clean run, the markers show marked phases and the full report holds the rest
- [ ] Wrong — also list them on a clean preflight's row, so you see them before walking away
- [ ] Wrong — never list them; the items page drops the stop text, and the preflight's report holds them
- [ ] Wrong — different approach: _______________

**Confidence**: 50% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-15, third pass, answer unchanged, confidence down from 55%; the 2026-11-14 review's rulings and the drafts around them; the method's preflight report format; the early-merge option in Kiln Development Deployments; the product owner's hand-written instructions for an earlier Kiln build (2026-10-17, 2026-10-18); every accepted Kiln requirement on what Documents found shows before Start (Kiln v1, Multi-repo Delivery, Linked Documents, Audit Loop Limits) and the public Kiln page. No stakeholder ruling on this question or review transcript exists, so no avenue is left untried.

---

## Validated Assumptions

| ID | Decision | Validated | Where it lives |
|---|---|---|---|
| RUN-001 | Kiln starts a phase marked as needing a person like any other and does what it can until it reaches that work; the mark is only a heads-up. Per the stakeholder (2026-11-15): "it most certainly should not just stop preemptively, it should do what it can until it gets to that point. The badge and the wording is just kind of like a heads up." | ✅ 2026-11-15 | PRD, AC-ATTEND-04 |
| RUN-003 | Every press of Start or Continue runs the preflight first, including a Start where every phase is already closed (it runs before the delivery audit); phases added mid-run get none. | Written up 2026-11-15 | The team's call, one sensible answer (a run of audits alone is hours long and unattended): PRD AC-PREFLIGHT-01 and AC-PREFLIGHT-08 |
