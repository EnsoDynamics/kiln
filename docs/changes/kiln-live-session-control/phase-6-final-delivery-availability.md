# Phase 6: Explain final-delivery live-control availability

**Closed:** 2026-10-28

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

## Implementation and acceptance evidence

The running final-delivery overview explains that live messages and terminal takeover are unavailable during final delivery and that live controls support Claude phases and audits. The current final-delivery detail shows the same explanation immediately after output and before session facts. Both retain the explanation during browser transport loss alongside existing last-known state/time and reconnect guidance. The existing Watch live link, output, settings and dedicated stopped recovery remain in place; final delivery gains no composer, takeover or deferred phase-pause action. Historical sessions remain outside the current-session guard.

| AC-LIVE-02 state contract | Evidence |
|---|---|
| Final-delivery overview/detail, connected/disconnected | `src/server/final-delivery-live-availability-browser.integration.test.ts`: built Svelte in real Chrome, Claude/Codex at 1200px/390px; navigate from Watch live, retain output and session/provider identity, place the explanation after output and before facts, exclude live/deferred pause controls, retain settings, label transport loss as last known with an observation time, disable mutations, reconnect and retain output without sideways overflow. Snapshot fixtures isolate presentation; they do not qualify provider execution. |
| Running, pending submission, recovered input loss, historical exclusion | `live-message-browser.integration.test.ts` retains composer/pause ordering, exact-attempt drafts, input-loss and pending HTTP/provider-write disables, successor isolation and historical exclusion. |
| Pausing/reconciling, released takeover and Codex availability | `live-control-browser.integration.test.ts` retains pending/released explanation and terminal-command gating, independent deferred-pause cancellation and Codex's Claude-only reason with working deferred pause. `phase-handoff-browser.integration.test.ts` retains ordinary stopped recovery. |
| Browser transport loss while the controller/attempt remains alive | `live-connection-browser.integration.test.ts` retains real controller/process liveness, last-known output/time, disabled actions, exact draft retention and reconnect. The new final-delivery fixture additionally covers both affected final-delivery routes. |
| Completed, usage wait, between activities and ordinary Needs you; shared bot availability | Existing `view-in-browser.integration.test.ts`, live engine/message/takeover and `control/live-commands.integration.test.ts` retain state-specific controls, current-target availability and no send/takeover in ineligible states. The repository gate reruns these compatibility boundaries. |

All four new browser cases failed on the omitted explanation before the repair and pass with it. Independent deliverable review found no material issue; fresh-eyes test hardening assessed the scoped evidence as adequate and required no changes. No business assumption, provider profile, release rule or permission changed. The earlier replacement pointers for AC-LIVE-02 and the design's disconnected presentation are already present; the audit's conflict check remains current, with no external PRD criteria changed since its recorded baseline.

## Publication and successor

This chat used the implement skill's scoped commit default and initially held publication for Doug under the authorization quoted in the phase plan's Audit publication and Phase 6 launch section (source chat `01a17fac-9acd-70c3-9931-5c4b69483ddd`). Doug lifted that hold in implementation chat `01a17fc8-27a6-7802-ac03-9a0ac8c2f1ea`: “Go ahead and push Phase 6, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.”

Phase 6 is published unchanged as `32264c1`. The remote baseline did not move before publication, so no replay or runtime/test change was needed. The shared checkout is fast-forwarded before launching the authorized audit with GPT 6.1 Sol at High effort. The successor uses the delivery-audit scoped commit default and holds publication of its later work for Doug; this approval does not authorize production changes or messages to other chats.

The next unit is the authorized fresh whole-PRD `delivery-audit`, followed by `test-audit` only when delivery is clean. The successor reads all six leaves and preserves Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run and Phase 5's full-run/focused-retest qualification as distinct historical records. Bot-control and plan-continuation remain separate tracks. No production changes or messages to other chats are authorized.

## Repository validation

On 2026-10-28 UTC, `npm run verify` passed in one complete current-build invocation: dependency audit (no blocking high/critical findings), ESLint, TypeScript/Svelte diagnostics, all 624 unit tests, all 17 Codex contract proofs and all 77 integration files, with **863 passed and two platform skips** (865 cases). The integration run took **568.58 seconds**. Runtime, browser, test, prompt and configuration hashes remained unchanged through the run. The passive-billing qualification used the required retained Claude 2.1.307 binary on an isolated test PATH; installed CLI selection and the existing 2.1.311 live-control profile were unchanged.

The focused portfolio separately passed the four new final-delivery browser cases and 22 existing live-control, message, connection and ordinary handoff browser cases. Independent deliverable review and test hardening found no material issue or evidence gap. Phase 3, Phase 4 and Phase 5 retain their separate historical verification records; this current green run does not rewrite them.

All seven installed-package checks passed via `npm run test:package` after packing and installing the current build into a disposable prefix (**17.84 seconds**). No test assertion, application deadline or provider qualification was weakened.
