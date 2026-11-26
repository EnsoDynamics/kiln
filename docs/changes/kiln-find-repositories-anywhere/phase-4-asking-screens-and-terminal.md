# Phase 4: Finish the asking screens and terminal lines

**Closed:** 2026-11-23

**Added by delivery audit:** 2026-11-22, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Asking Before Start", "The stops that ask", "Interfaces" ("Command line"), "Screens"
**Model tier:** standard

## Summary
Documents found after a reset reports a failing start check and holds the repository question until that check passes. The terminal says a repository needs locating even when Kiln couldn't open a browser. Start's note is amber while a question holds it, as drawn. The question on a held Pause now page sits above the ways to resolve the stop.

## Acceptance criteria covered
AC-ASK-01 (completes it; owned by phase 1), AC-SEE-02 (completes it; owned by phase 1), AC-SEE-04 (completes it; owned by phase 1), AC-SEE-05 (completes it; owned by phase 2)

## What the audit found missing
- **AC-ASK-01:** Documents found on a page built after a reset shows each repository question and the "to locate" check beside the failing start checks, and accepts an answer. It should report only the failed checks and ask once they pass. `Engine.rerunStartChecks` and `resetEngine` (`src/kiln-command.ts`) still set the asking rows, `repositoryRows` and `withRepositoriesCheck` (`src/engine/snapshot.ts`) show them, and `Engine.locateRepository` (`src/engine/engine.ts`) doesn't check `resetDocuments()?.checksFailed`.
- **AC-SEE-02:** when no browser opener exists, or Kiln runs on a remote machine, the line under the summary never says to tell Kiln where the repositories are. `formatOpenedLine` (`src/terminal-output.ts`) ignores `locating` in the `no_opener` and `remote` cases.
- **AC-SEE-04:** the note under Start ("Tell Kiln where … is to start." / "Tell Kiln which checkout of … to use to start.") is drawn amber (#e6b450) in mockup states 2 and 3. It renders in the dim `.help` style (`view/src/screens/DocumentsFound.svelte`, the Start column).
- **AC-SEE-05:** on the held Pause now page, `RequestQuestions` comes after the ways to resolve the stop (`view/src/screens/PausedHold.svelte`). It should sit below the paused facts and above the carry-on, fresh-terminal, Resume and take-over sections and their heading.

## Phase dependencies
1 (Documents found's questions and terminal lines); 2 (the question on other Needs you stops)
