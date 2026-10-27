# Phase 6: Explain final-delivery live-control availability

**Added by delivery audit:** 2026-10-27, after all five implementation/completion leaves closed. Completes the AC-LIVE-02 gap confirmed against `16881f9`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Snapshot and browser; Existing Code; Evidence and Verification Gates.

## Summary

Explain why live messages and terminal takeover are unavailable during final delivery, while preserving its existing controls.

## Acceptance criteria covered

AC-LIVE-02 (completes it; owned by phase 2).

## What the audit found missing

- **AC-LIVE-02:** The running final-delivery overview (`view/src/screens/Running.svelte:40`, reached through `App.svelte`) excludes `PausePanel`; its current-session link (`CurrentPhase.svelte:57`) only says **Watch live**. The linked final-delivery detail (`PhaseDetail.svelte:69–74`) places both the composer and its unavailable-action explanation inside `current && !isPr`, suppressing the explanation too. No other final-delivery browser component supplies SCOPE-001's required explicit reason. Final-delivery live actions are correctly excluded; the missing part is their availability explanation in the running browser views.

## Conflict check

The audit shortlisted every other PRD/change by title and summary, then read applicable criteria in Kiln v1, multi-repository delivery, Codex support, Needs you handoff, completion audits, bot control and Continue Added Phases. No later-built criterion replaces this explanation. Earlier final-delivery recovery scope preserves its dedicated stopped recovery, while bot-control AC-ACT-01 reinforces unavailable-action reasons. SCOPE-001 and the design's Snapshot and browser section explicitly require an explanation for final delivery. The old `!isPr` guard hid deferred phase pause; `ae33be4` reused it for paired pause and `f82374c` also placed new explanatory text inside it. Neither records a decision to omit that text. This is an omission, not changed product scope; no replacement pointer or new business assumption is needed.

## Phase dependencies

2 (browser availability explanation and current-session detail); 4 (current disconnected presentation).

## Phase-specific notes

One bounded presentation slice fits one implementation session. Prove the whole AC-LIVE-02 state contract, including final-delivery overview/detail at desktop and narrow widths, explicit unavailability, retained output and existing controls, and honest disconnected presentation. Preserve SCOPE-001's exclusion of final-delivery live actions. Follow the design's existing browser and compatibility gates; this audit adds no runtime capability or permission.

After closure and publication, obtain a fresh whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean. Phase 3, Phase 4 and Phase 5 retain their distinct historical verification records. The audit is published as `8e508c6`; Doug's authorization for that publication and this implementation launch is recorded in the phase plan's Audit publication and Phase 6 launch section. This phase uses the implement skill's scoped commit default and holds publication of its later work for Doug; production changes and messages to other chats remain unauthorized.
