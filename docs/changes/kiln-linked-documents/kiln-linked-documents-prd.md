# PRD: Kiln Linked Documents

**Source:** Doug's review on 2026-11-10 of a run that would not start because a background link in its technical design pointed at a file in another repository.

**Follow-on to:** [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md)

**Changes:** [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md).

**Mockup:** [Documents found with a link Kiln did not follow](mockups/kiln-linked-documents.html).

## Summary

Kiln reads a PRD's own documents (the PRD, the technical design, the assumptions and the phase documents) and follows the Markdown links in them to other documents in the repository. Today, a link that points at a file Kiln cannot find stops the run before a phase starts. After this change, a broken link never stops Kiln. Kiln starts the work, tells the agent which links it could not follow, and lists them quietly on the Documents found screen. The documents Kiln itself runs on still stop it when they are missing or broken.

## Business Context

A linked document is almost always there, just not where the link says. Links get copied between documents at different depths, or written for a folder layout where several repositories sit side by side. In the run that prompted this change, the technical design linked a background document by a path that only made sense from a parent folder. Kiln refused to start phase 1, and its screen talked about phase numbers and `## Split into` tables, so the plan looked broken when it was not. Fixing the link by hand let the run go on.

Run by hand, one session at a time, nobody would stop for that link. The session would start, the agent would look for the document if the phase needed it, and say so if it could not find it. Kiln should behave the same way. The stop protected nothing a person could act on better than the agent: Kiln records a fingerprint of the documents it reads, and a document that appears later still changes that fingerprint. The completion audits already stopped following links.

## Acceptance Criteria

### Keep going when a link is broken

A broken link in the requirements is the agent's to deal with, during the phase, like any other detail in the documents.

- [ ] **AC-LINK-01 — A broken link never stops Kiln.** When a local Markdown link in a document Kiln reads cannot be followed, Kiln carries on as if the link were not there: at setup, when it starts the first phase, after a handback, on restart and on Check again. A link cannot be followed when its target is not in the repository, is outside the repository, is reached through a symbolic link, or is not a file. A run already stopped on such a link continues on its next Check again. Kiln no longer stops for linked documents; required documents stay as AC-LINK-02 says.
  - Replaces in part: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (only the requirement that every document the plan links to be present; the assigned worktree still owns the run's plan).
- [ ] **AC-LINK-02 — The documents Kiln runs on still stop it.** Kiln stops, as it does today, for each case in the table. Nothing else about following links stops it.

  | Case | Why it still stops |
  |---|---|
  | The PRD, the technical design or a phase document is missing, or the assumptions or phase documents are named twice | Kiln reads these to know what to build |
  | The phase plan does not read: a phase number Kiln can't read, a `## Split into` row with no file, a phase file no parent lists | Kiln can't choose the next phase |
  | A `Superseded by:` or `Replaces:` pointer names a file that is not there | The pointer says which requirement is in force |
  | One of the PRD's own documents is a symbolic link | Kiln reads only real files in the repository |
  | A document exists but can't be read, such as for its permissions | The computer has a problem the agent would also hit |
  | A document changes while Kiln reads it | Kiln reads again, as today |

### Tell the agent and show it once

The agent needs to know about a broken link, because it may need that document. The person needs to see it once, before starting, and never as a warning to clear.

- [ ] **AC-LINK-03 — Each phase session is told which links Kiln could not follow.** While a link cannot be followed, the prompt for each phase session names it: the document that has it, the link as written, and why Kiln could not follow it. The prompt says Kiln did not read that document, and asks the agent to find it if the phase needs it and to say in its final message when the phase needs a document it can't find. A phase session whose documents have no such link gets no such text.
- [ ] **AC-LINK-04 — Documents found lists the links Kiln did not follow.** When the plan has a link Kiln cannot follow, the Documents found screen lists it under **What Kiln found** as **Linked documents**, with a neutral mark rather than a passed or failed one, after the phase plan: the line "N not followed. Kiln starts anyway and tells the agent.", then each link's target as Kiln resolved it and the document that links to it. It is not one of the passed checks, and Start stays available. With no such link, the item does not appear.
- [ ] **AC-LINK-05 — Nothing else changes on screen.** No stop, waiver, warning marker, phase-row label or count of waived checks appears for a link Kiln could not follow, during the run or after it.

## Mockup

[The mockup](mockups/kiln-linked-documents.html) draws the **What Kiln found** panel of Documents found with one link not followed (AC-LINK-04), and the text a phase session's prompt gains (AC-LINK-03).

## Out of Scope

- The `kiln:reference` link title keeps working: a link with it is still not followed. Nobody needs it to avoid a stop any more, and Kiln does not list such links.
- The completion audits are unchanged. They already read only the PRD's own documents and do not follow links.
- Waivers are unchanged. A broken link no longer produces a failing check, so there is nothing to waive.
- Missing credentials, vendor setup and other prerequisites a phase finds while it works are a separate matter, handled as they are today.
