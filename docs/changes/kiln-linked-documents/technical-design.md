# Technical Design: Kiln Linked Documents

**PRD:** [Kiln Linked Documents](kiln-linked-documents-prd.md) · **Screens:** [Documents found mockup](mockups/kiln-linked-documents.html)

## Overview

Kiln follows the local Markdown links in a PRD's documents in two readers: `observePlan` (`src/engine/plan-reconciliation.ts`), which reads the active worktree, and `observeGitPlan` (`src/engine/completed-plan-sources.ts`), which reads a Git revision. `observePlan` throws `Linked document is missing`, which the engine turns into a **Phase plan reads** stop (`engine.ts`, the reconciliation in `readPlan`). `observeGitPlan` skips a missing optional target only under `HISTORICAL_PLAN_READ`; four callers use its default `"fail"` mode and stop on one today: `continuation-readiness.ts` (the readiness read of a binding's source revision), the two preparation-verification reads in `engine.ts`, and the delivery-base read in `completed-plan-discovery.ts`. Both readers also throw on a link with a backslash or malformed percent-encoding.

Both readers move to one rule: a link Kiln cannot follow is recorded, not thrown. The record goes to the phase prompt and the Documents found screen. Required documents keep every check they have today.

## Existing Code

**Posture: Preserve.** Kiln is released. Everything outside link following keeps its behavior.

- **Changed:** `observePlan` and `safeFile` in `plan-reconciliation.ts`; the traversal loop in `observeGitPlan`, with `GitPlanReadOptions` and `HISTORICAL_PLAN_READ` removed and their callers updated; `phaseSessionPrompt` and `PhasePromptValues` in `src/session/prompts.ts`; the two launch sites in `engine.ts`; `runStartChecks` and `StartCheckReport` in `src/start-checks.ts`; `documentsFound` and its caller in `src/kiln-command.ts`; the snapshot's documents in `src/engine/snapshot.ts`; the **What Kiln found** list in `view/src/screens/DocumentsFound.svelte`.
- **Reused:** the readers' seed set (PRD, technical design, assumptions, `phase-plan` and phase documents), the `kiln:reference` title test, and the replacement-pointer patterns.
- **Unchanged:** `planSourceFromDocuments`, `PlanSource`, scope and requirements digests, retained baselines and their ids, waivers, the audit snapshot (it reads no link targets since AC-NEUTRAL-02; `requirementsDocumentFilter` still treats a file a criterion links to as material, which this change does not touch).

## Following Links (AC-LINK-01, AC-LINK-02)

A document Kiln reads is **required** when it is a seed, or the target of a `Superseded by:` / `Replaces:` pointer written in a seed. Every other link target is **optional**, including a pointer found in a document Kiln reached by a link. `observeGitPlan` keeps a `required` set today; `observePlan` gains the same set. A target that is both is required.

Each optional target is classified before it is read:

| Link or target | Reason recorded | When required |
|---|---|---|
| The href has a backslash or NUL, or malformed percent-encoding | `not a usable path` | Stops, as today |
| Normalizes outside the root (`../…`) or is absolute | `outside the repository` | Stops, as today |
| Not present (`ENOENT`, `ENOTDIR`, or absent from the Git tree) | `not in this repository` | Stops, as today |
| A path part is a symbolic link (worktree), or mode `120000` (Git) | `a symbolic link` | Stops, as today |
| Present but not a regular file (directory, submodule) | `not a file` | Stops, as today |
| A regular file that cannot be read (`EACCES`, I/O error) | not classified; the error propagates | Stops, as today |

An unfollowed target is not added to `documents`, so the scope and requirements digests are computed exactly as before over the documents read. A file that later appears at that path is read and changes the digest, so plan reconciliation still notices it. A changed or new broken link changes the bytes of the document that holds it, which the digest already covers.

The traversal is one exported function per reader, returning `{ documents, unfollowed }`. `readLinkedDocuments(root, prdDirectory)` serves `observePlan` and the start checks; `observeGitPlan` keeps its Git-object loop with the same classification. `observePlan` returns `{ source, unfollowed }` to its callers that need the list (below) and its `PlanSource` alone to the rest. Each unfollowed link is recorded once per `(from, href)` as:

```ts
/** A local Markdown link Kiln did not follow (AC-LINK-01). */
export interface UnfollowedLink { from: string; href: string; target: string; reason: "not a usable path" | "outside the repository" | "not in this repository" | "a symbolic link" | "not a file" }
```

`from` is the repository path of the document holding the link, `href` the link as written, `target` the normalized path (the href itself for `not a usable path`). `observePlan`'s double read compares the lists too, so a list that changes between reads is `source_changed` like any other difference.

The list is not stored in `PlanSource` or any saved record, so baselines, their ids and `comparisonBaseline`'s reparse are untouched.

## The Phase Prompt (AC-LINK-03)

The engine keeps the list from its most recent active-plan read in memory (`this.unfollowedLinks`), set by the reconciliation in `readPlan` that runs before each launch. `PhasePromptValues` gains `unfollowedLinks`; `phasePromptValues` reads the in-memory list, so the snapshot's fresh-session prompt and the projection show the same text the next launch would send, without a read of their own. When the list is non-empty, `phaseSessionPrompt` appends `prompts/unfollowed-links.txt`, filled with one line per link (`- \`<from>\` links to \`<href>\`: <reason>.`), after the template body and before the delivery-authority text. The preparation prompts that wrap `phaseSessionPrompt` inherit it. Resume prompts continue the same conversation and add nothing. Audit and pull-request prompts are unchanged.

## Documents Found (AC-LINK-04, AC-LINK-05)

`runStartChecks` calls `readLinkedDocuments` on the shared checkout once every other start check has passed, and adds `unfollowed` to `StartCheckReport`; it never adds a problem. A required case it throws on (a symbolic-link seed, a missing pointer target in a seed) becomes a start-check problem with the reader's message, as the engine would stop on it at its first read. `kiln-command.ts` passes `report.unfollowed` to `documentsFound`, which adds `unfollowedLinks` (target, from, reason) to the snapshot's documents. `DocumentsFound.svelte` renders the **Linked documents** item after **Phase plan** with a neutral mark when the list is non-empty, as the mockup draws. Terminal output, the passed checks, the phase rows, waivers and stop copy are untouched.

## Changes to Earlier Designs

In the commit that builds this, `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Active execution handback, gets `Superseded in part by:` this design, §Following Links (unmarked local links are optional; seeds and the replacement pointers they hold stay required). The README's paragraph on `kiln:reference` under "Writing requirements for Kiln" is rewritten to say Kiln never stops on a link it cannot follow, so the title is optional.

## Tests

Real-Git integration tests through the engine harness, as the waiver tests use:

- A fresh run whose technical design has a link of each reason starts phase 1 with no stop, and the phase prompt the stand-in receives names each link (AC-LINK-01, 03).
- A run stopped on a missing link by today's code continues on Check again (AC-LINK-01).
- Preparation verification and Check for new phases on a revision with a broken link proceed instead of failing (AC-LINK-01).
- Each row of AC-LINK-02's table still stops: a missing technical design, a `## Split into` row with no file, a missing `Replaces:` target in the technical design, a symlinked phase document, an unreadable linked file; and a missing `Replaces:` target inside a linked document does not.
- A file added at the missing target is read on the next handback and drops from the prompt.
- `observeGitPlan` and `readLinkedDocuments` record the same links for the same tree.
- A view test renders the Linked documents item and its absence (AC-LINK-04), and the waiver and stop tests that expected `Linked document is missing` are rewritten to the new behavior (AC-LINK-05).

## Criteria Coverage

| Criterion | Section |
|---|---|
| AC-LINK-01 | Following Links |
| AC-LINK-02 | Following Links, Documents Found |
| AC-LINK-03 | The Phase Prompt |
| AC-LINK-04 | Documents Found |
| AC-LINK-05 | Documents Found |
