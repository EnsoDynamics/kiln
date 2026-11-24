# Phase 4: Usage fallback

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "The launch decision" (including the fallback's launch checks, Skills and the heads-up); "A Wait Before the Start" (the fallback row); the "Telling a model-scoped Codex bucket, and a usage block" and "Usage read for a launch" decisions; `launch` on the session record in "Data Models"; `fallback` and `forecast` in "Snapshot"; "Criteria Coverage" for AC-GUIDE-01
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** demanding — AC-FALLBACK-02 combines the threshold, which usage windows count, Codex's usage blocks and the fallback's own launch checks (rules that interact), and a wrong decision spends the other agent's account (money)

## Summary
With the fallback switched on, each time Kiln launches an activity that hasn't started it reads both accounts' usage and starts the activity on the other agent when the first choice's account is at or above the threshold and the other agent can take it. The row, the card, the phase detail and the terminal say when that happened, the next activity warns in advance, and Kiln's public guide explains tiers, changing models, Model defaults and the fallback.

## Acceptance criteria covered
AC-FALLBACK-02, AC-FALLBACK-03, AC-FALLBACK-04, AC-GUIDE-01, AC-PICK-06 (also applies to this phase's work), AC-PICK-07 (also applies to this phase's work)

## Out of scope for this phase
Nothing beyond the PRD's own Out of Scope.

## Phase dependencies
1 (each activity's fallback from the resolver); 2 (both agents' readings, readiness and billing, and fresh launches on the current choice, including from a wait); 3 (the fallback switch and threshold).

## Phase-specific notes
- Real-session proof from Delivery owned here: a launch decided for the fallback starts and reports there, with the usage reading supplied at the reader's boundary; the evidence states that no live reading at the threshold was taken.
- The guide covers every phase's work: where the tier comes from, Change and Model defaults in the browser and from a terminal, and the fallback.

## Carried forward from Phase 2
- **Where the decision goes.** Every launch of a not-started activity reaches `launchSession`, which takes its choice from `launchChoice(key)`; Kiln's own resume, the person's Resume or reply and the end of a wait reach it through `launchFresh`. The launch decision belongs immediately before the existing launch checks in `launchReadiness`, and must save its result on the session (`launch`) before the process starts.
- **What already exists for it.** `fallbackOf(key)` (none on the same agent), `countedFor(limit, model)` for Claude Code's model-scoped windows, `agents[].account.limits[].overThreshold`, `kiln account`'s `over_threshold` and `fallback`, and the activity's one-attempt record (`activityUsageRelease`, `automaticAttempt` in `runCodexSession`), which already bounds an automatic Codex launch ending a wait whichever choice it is on. A wait's handlers (`claudeReadingForOtherChoice`, `codexReadingBeforeStart`) watch `waitAgent(key)`, the current choice's agent; the fallback row of "A Wait Before the Start" adds the decision there. A fallback-only Claude Code with an unapproved metered route leaves Start available today; the decision must not use it until approved.

## Carried forward from Phase 3
- **The switch is written; reads are unchanged.** `editModelDefaults` (`src/models/model-defaults-edit.ts`) writes the switch and threshold for the page, `POST /api/model-defaults` and `kiln model-defaults fallback`; every reader still takes them from `readModelDefaults(...).defaults.fallback`, and each running Kiln's watch republishes on a write.
- **Where the launch decision's result shows.** `ModelView` (`src/engine/activity-models.ts`) now carries `change` and `useDefault` beside the fields this phase adds (`fallback`, `forecast`); a row whose launch is under way reads `Engine.sessionBusy(key)`, true from `launchSession`'s start until the launch ends, so a decision saved inside `launchSessionNow` is already covered by Change's refusal.
- **The guide (AC-GUIDE-01) covers Phase 3's surfaces:** a row's Change and Use the default (and the stopped page's own row), the Audits line, the Model defaults page and its link, `kiln model` (`--phase` or `--audits`, `--use-default`, the omitted-effort rule) with `plan_models` in `kiln status`, and `kiln model-defaults`, `set`, `restore` and `fallback`.
