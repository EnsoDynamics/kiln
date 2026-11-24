# Phase 3: Change models

**Closed:** 2026-11-24

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "Resolving a Choice" (entries, Use the default, the Audits entry); the "Change while a launch of the activity is under way", "Model defaults across running Kilns", "Model defaults holds only what the person set", "Restore Kiln's defaults" and "Commands for Model defaults" decisions; "Model defaults file" (writing it); "HTTP"; `settings.models` in "Snapshot"; "Command line"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
The person can change the agent, model and effort of any phase that hasn't started, and the Audits choice for one PRD, on Documents found and in a running plan, from the browser or with `kiln model`, and return either to the default. A separate Model defaults page, and `kiln model-defaults` commands, set each tier's and the Audits row's first choice and fallback, restore Kiln's defaults, and turn the fallback switch and its threshold on, off or up and down for every PRD on the computer.

## Acceptance criteria covered
AC-PICK-03, AC-PICK-05, AC-OTHER-01, AC-KEEP-02, AC-DEFAULT-02, AC-DEFAULT-03, AC-DEFAULT-05, AC-FALLBACK-01, AC-KEEP-01 (also applies to this phase's work)

## Out of scope for this phase
What the fallback switch does at a launch: the launch decision, the Fallback tag, the card's facts, the terminal line and the heads-up (Phase 4). The public guide (Phase 4).

## Phase dependencies
1 (the resolver's per-phase and Audits entries, the kept choice from the schema 26 migration, and the delivery panel's model line); 2 (choices on either agent with their readiness and billing, and fresh launches on a changed choice).

## Phase-specific notes
- One editor and one omitted-effort rule (§Command line) serve the row Change, the Audits line and the Model defaults page; `kiln model` and `kiln model-defaults` join the new **Choose models** help group together.

## Carried forward from Phase 1
- **Where a choice changes before this phase:** only a written `model-defaults.json` (read on every resolution, watched by each running Kiln) and, for tests and migrated PRDs, `settings.modelChoices.kept`. `modelChoices.phases` and `modelChoices.audits` are read by the resolver (`resolveNotStarted`) but nothing writes them yet; Use the default writes `"default"`. The delivery panel's and the run's settings' model line ("Models · Chosen for each phase", with the tier counts on Documents found) is where the Model defaults link and the Audits line go; the Folder missing setup panel shows the same line. Mockup 5's state E shows Change on the stopped row of the Needs you page.
- **Stop wording that names controls this phase adds:** `choiceStopFact` (engine.ts) already says "Change it on its row in the phase plan" for a changed or kept choice and "Change the <row> row in Model defaults" for a Model defaults one; once the row Change and the Model defaults page exist, those words are true as written.

## Carried forward from Phase 2
- **Readers and needed agents exist.** `Engine.readers` holds one `AgentInfo` per agent; `neededBy()` names each needed agent's plan rows and whether only a fallback needs it (switch read from the file); `agentProblem()`, `modelsProblem` and `fallbackWarning()` gate Start. The snapshot's `agents[]` and `settings.models.fallback` (`enabled`, `threshold`, `warning`) are built in `snapshot.ts` (`agentViews`, `fallbackSettings`). Documents found shows the warning in the Models field; the AC-FALLBACK-01 line ("whether it is on and its threshold, with a link") is this phase's.
- **History reads for Change.** `Engine.readStart(key)` is the history read (Claude Code's conversation file, the Codex thread's turns); it runs on load, at each wait reading, at dispatch and at every launch, and an unreadable history sets `unknownStarts`. Change and Use the default call it before applying, and `unknownStarts` gives the row's unavailable reason. The read after an adopted process exits is not wired separately: a later dispatch or launch reads it, so Change must read it too.
- **A changed choice already takes effect.** A not-started activity launches fresh on its current choice (`launchFresh` from `resumeSession`), reopen commands follow `reopenMatchesChoice`, and a wait follows `waitAgent` (Claude changed-choice rule; Codex record `codexUsageRecovery`). Tests change choices through a written Model defaults file or `settings.modelChoices.kept` and must save the record (`writePrdRecord`) before `reopenFromDisk`.

