# Phase 2: Live control on newer Claude Code

**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [technical design](kiln-public-release-readiness-technical-design.md) — Design Decisions rows Standing guard against new exact pins, Live control eligibility, Live message recognition, Takeover hook recognition, Live launch arguments, Compatibility notices, Proof scripts; Data Models (SessionRun.live, gate state); Proving Features on Newer Agent Versions (live control column, stand-in paragraph).
**Phase plan:** [Execution order](kiln-public-release-readiness-phase-plan.md)

## Summary
Message Claude, `kiln message`, Pause & take over and `kiln take-over` are offered on every Claude Code at or above the minimum on macOS. When Kiln stops recognising the replies or hook signals it relies on, that feature turns off with a compatibility notice and the run carries on; an accepted takeover keeps its hold. A test then stops any exact agent version from coming back into the code.

## Acceptance criteria covered
AC-AGENT-03, AC-AGENT-01.

AC-AGENT-04, AC-AGENT-07 (also apply to this phase's work; owned by Phase 1).

## Out of scope for this phase
Help, package, repository and documentation work, including the README's live messaging description (Phase 3).

## Phase dependencies
1 (the minimums module, version comparison, and the compatibility notice record, panel and status field).

## Phase-specific notes
- The newest-version live proof (`npm run test:live-proof` on the newest installed Claude Code) runs here and writes the fixtures CI replays.
- Mockup states 1 and 2 are this phase's screens.
