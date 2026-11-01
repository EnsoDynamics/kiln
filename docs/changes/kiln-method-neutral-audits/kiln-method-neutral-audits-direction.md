# Kiln method-neutral completion audits: direction and findings

Input for the change PRD in this directory. Recorded 2026-11-01 from Doug's direction after the
consulting-prospect-intelligence test audit stalled repeatedly on Kiln's report validation.

## Doug's direction (his words, 2026-11-01)

> I don't think Kiln and the Enso Method should be so tightly coupled like that because I'm
> changing the Enso Method all the time. Like, I could make a change to the test audit skill later
> this afternoon, and then anyone who had a version of Kiln installed, like, if Kiln was
> specifically relying on certain stuff in the test audit skill, then, like, that's a problem.

> We need to rely on the skill doing what it says. [...] It seems like it's like way too tightly
> integrated with it. [...] this stuff is, I don't know, just seems buggy and brittle. [...] We just
> basically want to make sure that the test audit skill didn't end in some spot where it was just
> like, hey, I need you for blah, blah, blah decision or whatever. And it's clearly not in a place
> where it came to a natural, normal end. That's the kind of thing we want to try to catch if we
> can. But I don't want to go completely overboard trying to double check all these things [...]
> I could decide that the whole way that the test audit loop works is not that great and make a
> change like that. So, I think we need to pull a lot of it out and just go to the kind of like
> the bare minimum of what we feel is going to be sturdy and stable. And I guess this would apply
> to the delivery audit as well as the test audit. Possibly, even some of the other areas [...]
> what we're doing for each individual phase [...] we may even want to make some changes there.

> Any changes we do, we need to change requirements first and then change the implementation to
> meet those requirements.

## What Kiln encodes from the Enso Method today

Report validation (`src/audit/validate-report.ts`, contract in `src/audit/contracts.ts`) refuses a
report unless it follows the current test-audit and delivery-audit procedures:

- **Vocabulary:** grades `missing / weak / adequate / strong`, five test statuses, seven delivery
  statuses.
- **Procedure:** independent assessor subagent conversations, a reviewer in a distinct
  conversation, a re-grade after any remediation, red checks with mutation, restoration, exactly
  two failing runs and a restored passing run, baseline and final suite runs paired by command,
  every cited verification mapped by an assessor, per-part quotes from the PRD by line span.
- **Method file formats:** `test-audit.md` in the PRD directory, the `**Added by test audit:**` /
  `**Added by delivery audit:**` marker, the `## Phase dependencies` section,
  `Superseded by: AC-X in \`path\`` pointer syntax.
- **The skill file itself:** Kiln hashes the installed skill when the audit activity starts and
  refuses evidence if it changes (`src/audit/provider-evidence.ts:67`, `validate-report.ts:62`), so
  shipping an Enso Method update during a running audit breaks that audit.

Every stall on that run came from this layer: the stale snapshot, "needs the superseded status",
invalid applicability, unbound evidence IDs, "not mapped by an independent test assessor". It had
14 commits under `src/audit/` between 2026-10-25 and 2026-11-01.

Separately, Kiln authenticates the commands an audit cites by reading Codex or Claude history
(`src/session/codex-evidence.ts`, `src/audit/provider-evidence.ts`, `src/audit/admission.ts`). The
same reader also serves per-phase delivery receipts (`src/engine/engine.ts`, command evidence for
`DeliveryRefusal`). It is the other large source of recent fixes (a170417, 06088d1).

## Precedent

`docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` removed the workspace audit the
same way: a change PRD whose criteria `Replaces` the older ones, then the build.

## Decisions for the change PRD

- **Natural end.** Kiln's core question is whether the audit session ended where the skill
  normally ends (passed, added phases, more test work), or stopped needing a person. How Kiln tells
  these apart without knowing the skill's internals.
- **Passing-run evidence.** Whether Kiln still authenticates that cited passing runs really ran
  (the history reader), or trusts the skill entirely. Recommendation from the investigating session:
  keep only "a run cited as passing really ran and succeeded in an assigned repository", lax on
  currentness; Doug leaned toward the bare minimum.
- **Per-phase checks.** Which per-phase completion checks are method-specific (phase-document
  format, receipts) versus sturdy Git facts (committed, pushed, on branch), and what to remove.
- **Skills.** The test-audit and delivery-audit skills write this report today; the narrowed
  contract has to be stated so a skill change cannot break it.
