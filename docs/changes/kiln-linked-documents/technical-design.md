# Technical Design: Kiln Linked Documents

**PRD:** [Kiln Linked Documents](kiln-linked-documents-prd.md) · **Screens:** [Documents found mockup](mockups/kiln-linked-documents.html)

## Overview

Kiln follows the local Markdown links in a PRD's documents in two readers: `observePlan` (`src/engine/plan-reconciliation.ts`), which reads the active worktree, and `observeGitPlan` (`src/engine/completed-plan-sources.ts`), which reads a Git revision. The Git reader already skips a missing optional target under `HISTORICAL_PLAN_READ`, which every caller uses. The worktree reader throws `Linked document is missing`, and its callers in the engine turn that into a **Phase plan reads** stop. That stop is the behavior this change removes.

Both readers apply one rule: a link Kiln cannot follow is recorded, not thrown. The record goes to the phase prompt and the Documents found screen. Required documents keep every check they have today.

## Existing Code

**Posture: Preserve.** Kiln is released. Everything outside link following keeps its behavior.

- **Changed:** `observePlan` and `safeFile` in `plan-reconciliation.ts`; the traversal loop in `observeGitPlan`; `phaseSessionPrompt` and the phase prompt values in `src/session/prompts.ts` and `engine.ts`; `StartCheckReport` in `src/start-checks.ts`, its snapshot mapping in `src/engine/snapshot.ts` and the **What Kiln found** list in `view/src/screens/DocumentsFound.svelte`.
- **Reused:** the readers' seed set (PRD, technical design, assumptions, `phase-plan` and phase documents), the `kiln:reference` title test, and the replacement-pointer rule that makes a target required.
- **Unchanged:** `planSourceFromDocuments`, scope and requirements digests, baselines, waivers, the audit snapshot (which follows no links since AC-NEUTRAL-02).

## Following Links (AC-LINK-01, AC-LINK-02)

A document Kiln reads is **required** when it is a seed or the target of a `Superseded by:` / `Replaces:` pointer; any other link target is **optional**. Both readers keep a `required` set, as `observeGitPlan` does today, and a target that is both is required.

Each optional target is classified before it is read:

| Target | Reason recorded | Required target |
|---|---|---|
| Normalizes outside the root (`../…`) or is absolute | `outside the repository` | Stops, as today |
| Not present (`ENOENT`, `ENOTDIR`, or absent from the Git tree) | `not in this repository` | Stops, as today |
| A path part is a symbolic link (worktree), or mode `120000` (Git) | `a symbolic link` | Stops, as today |
| Present but not a regular file (directory, submodule) | `not a file` | Stops, as today |
| A regular file that cannot be read (`EACCES`, I/O error) | not classified; the error propagates | Stops, as today |

An unfollowed target is not added to `documents`, so the scope and requirements digests are computed exactly as before over the documents read. A file that later appears at that path is read and changes the digest, so plan reconciliation still notices it. A changed or new broken link changes the bytes of the document that holds it, which the digest already covers.

The reader records each unfollowed link once per `(from, href)` as `{ from, href, target, reason }`: the repository path of the document holding the link, the link as written, the normalized target, and the reason. Both reads of `observePlan`'s double read include the list, so a list that changes between reads is `source_changed` like any other difference.

## Data Model

`PlanSource` gains `unfollowed?: UnfollowedLink[]`, set only when the list is non-empty. Retained baselines are JSON of `PlanSource`, and a baseline's id is the digest of its body, so leaving the field out when empty keeps every existing baseline readable and every newly accepted baseline without broken links identical in shape and id to today's. No normalizer version change.

```ts
/** A local Markdown link Kiln did not follow (AC-LINK-01). */
export interface UnfollowedLink { from: string; href: string; target: string; reason: "not in this repository" | "outside the repository" | "a symbolic link" | "not a file" }
```

## The Phase Prompt (AC-LINK-03)

`PhasePromptValues` gains `unfollowedLinks: UnfollowedLink[]`. `engine.phasePromptValues` fills it from a fresh `observePlan` of the worktree at each launch, so a link fixed since the last phase drops out; launch never uses a saved list. When the list is non-empty, `phaseSessionPrompt` appends `prompts/unfollowed-links.txt`, filled with one line per link (`- \`<from>\` links to \`<href>\`: <reason>.`), after the template body and before the delivery-authority text. The fresh-session prompt and the preparation prompts that wrap `phaseSessionPrompt` inherit it. Resume prompts continue the same conversation and add nothing. Audit and pull-request prompts are unchanged.

## Documents Found (AC-LINK-04, AC-LINK-05)

`runStartChecks` runs the link traversal of the shared checkout once every other start check has passed, through a function both `observePlan` and the start checks call (`readLinkedDocuments(root, prdDirectory)`, returning `{ documents, unfollowed }`), and adds `unfollowed` to `StartCheckReport`. It never adds a problem. The snapshot's `documents` gains `unfollowedLinks` (target, from, reason). `DocumentsFound.svelte` renders the **Linked documents** item after **Phase plan** with a neutral mark when the list is non-empty, as the mockup draws. Terminal output, the passed checks, the phase rows, waivers and stop copy are untouched.

## Changes to Earlier Designs

In the commit that builds this:

- `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Active execution handback: `Superseded in part by:` this design, §Following Links (unmarked local links are optional; governing seeds and replacement pointers stay required).
- AC-HANDBACK-03 in `kiln-continue-added-phases-prd.md`: `Superseded in part by: AC-LINK-01`.
- README §Audit document references: rewritten to say Kiln never stops on a link it cannot follow, and that `kiln:reference` is no longer needed for that.

## Tests

Real-Git integration tests through the engine harness, as the waiver tests use:

- A fresh run whose technical design has a link of each reason starts phase 1 with no stop, and the phase prompt the stand-in receives names each link (AC-LINK-01, 03).
- A run already stopped on a missing link (a saved stop written by the current code) continues on Check again (AC-LINK-01).
- Each row of AC-LINK-02's table still stops: a missing technical design, a `## Split into` row with no file, a missing `Replaces:` target, a symlinked phase document, an unreadable linked file.
- A file added at the missing target is read on the next handback and drops from the prompt.
- `observeGitPlan` records the same links as `observePlan` for the same tree.
- A view test renders the Linked documents item and its absence (AC-LINK-04), and the waiver and stop tests that expected `Linked document is missing` are rewritten to the new behavior (AC-LINK-05).

## Criteria Coverage

| Criterion | Section |
|---|---|
| AC-LINK-01 | Following Links, Data Model |
| AC-LINK-02 | Following Links |
| AC-LINK-03 | The Phase Prompt |
| AC-LINK-04 | Documents Found |
| AC-LINK-05 | Documents Found |
