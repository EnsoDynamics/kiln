# Phase 10: Complete bounded output and receipt selection

**Closed:** 2026-10-28 — local completion; publication held. Final verification records the non-green full gate and qualified scoped outcomes.

**Added by delivery audit:** 2026-10-28, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: “Architecture and Decisions”, “Command grammar”, “Common result and errors”, “Status, Conversations and Handoff”, “Output Pages”, “Validation Boundaries”.

## Summary

Return bounded, explicit inspection failures for nonregular saved output, and require the original receipt selector before command-status can query anything.

## Acceptance criteria covered

AC-SEE-01 (completes it; owned by phase 1), AC-SEE-06 (completes it; owned by phase 1), AC-SEE-08 (completes it; owned by phase 1), AC-CLI-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-01:** `src/control/client.ts::inventory` synchronously projects stopped unfinished work; `statusProjection → latestActivity → recentSavedOutput` opens owner-only FIFO output with blocking `openSync("r")` and never returns the required visibly incomplete inventory.
- **AC-SEE-06:** `src/control/logs.ts::outputPage` opens saved output without establishing a regular file. An owner-only FIFO blocks before the five-second deadline can run; reject unsupported/unreadable output with the promised output-specific unavailable result through unpaged and cursor entry points.
- **AC-SEE-08:** Full live/retained status samples output through `inspectionReader` and `latestActivity`; their shared `recentSavedOutput` has the same blocking open. Guard this sibling path so full inspection returns a finalized valid unavailable/incomplete response within its read budget.
- **AC-CLI-01:** The same output-reader gap prevents a bounded result. Separately, `src/control/help.ts::parseCommand` does not enforce command-status's required `--command-id`; `src/control/client.ts::runInspectionCommand` coerces its absence to the valid ID `"undefined"` and can return that receipt successfully. Missing required input must produce the documented invalid-input result before lookup, in both formats and live/retained paths.

The [after-Phase-9 audit](kiln-bot-control-delivery-audit-after-phase-9.md) records exact source paths, disposable public-CLI reproductions, sibling checks, assessment rounds and reverse requirements checks. No criterion, business rule or authority is added.

## Phase dependencies

1 (inspection/help and output); 2 (receipt lookup); 8–9 (guarded/spooled inspection and validated stable output metadata).

## Scope and proof boundaries

Complete each covered criterion as a whole through the existing design validation boundaries. Keep pure retained reads, ownership/symlink checks, supported legacy records, exact output text/fragments, frozen cursor identity, 50/default and 1–200 entry limits, and the 16,384-byte complete stdout cap. Ordinary descriptor-write failures retain their durable-write meaning. No provider/account/recovery/delivery authority or other track's behavior changes.

Use disposable real private files and subprocess deadlines to exercise FIFO/nonregular output without a hanging test runner. Cover actual CLI text/JSON for inventory, basic/full status and logs, live authenticated controller paths and retained reads, explicit sessions and frozen cursors, alongside regular empty/valid output. A failed observation must return explicit incompleteness/unavailability; it must not become successful no-output or consume the controller indefinitely. The audit reproduced retained JSON entry points and isolated built helpers; it did not reproduce a live controller hang or establish text-format boundary proof.

Exercise missing command IDs through actual text/JSON CLI dispatch before target/provider/controller lookup, plus valid original IDs, a deliberately valid ID `undefined`, unknown IDs and ordinary lifetime/replay query behavior. Do not prohibit a valid literal ID to hide omission. Preserve legacy helper execution contracts and help availability without Git/controller/provider access.

After this phase closes and is authorized for publication, repeat whole-PRD delivery audit in a fresh chat/worktree, then whole-PRD test audit only when delivery is clean. Phase 9's [Final verification](phase-9-complete-kiln-inspection-input.md#final-verification), Phase 8/7/6 Final verification and Phase 5 Known baseline failures remain historical non-green gates; provider/Grok evidence remains separately scoped in [release validation](kiln-bot-control-validation.md).

## Publication and launch boundary

The [audit's Publication boundary](kiln-bot-control-delivery-audit-after-phase-9.md#publication-boundary) preserves Doug's exact authorization and source chat. It authorized Phase 9 publication and this delivery-audit launch. Scoped audit commits follow the skill default; this audit's publication, this Phase 10 implementation launch, future implementation/audit publication and production release remain held for explicit authorization. The prepared continuation is valid only after authorized audit publication, shared-checkout fast-forward and explicit Phase 10 launch authorization. Other tracks remain independently owned.

## Implementation launch authorization

Doug authorized publication of the after-Phase-9 audit and launch of this Phase 10 implementation on 2026-10-28. The [audit's authorization record](kiln-bot-control-delivery-audit-after-phase-9.md#audit-publication-and-phase-10-launch-authorization) preserves his exact instruction and source chat. This supersedes the audit-publication and implementation-launch holds above. After publication and shared-checkout fast-forward, the prepared fresh-chat continuation is valid immediately. Scoped implementation commits follow the skill default; publication of future implementation/later-audit commits and production release remain held.

## Implementation

Both output entry points share a guarded saved-output opener. It checks the owner-controlled path and regular-file type before opening, uses nonblocking/no-follow flags where supported to close replacement races, then checks the opened descriptor's file type, ownership, permissions and deadline. FIFO, directory, unreadable and dangling-symlink output cannot consume the controller or become successful no-output. Status sampling validates the parent before probing with `lstat`; only genuine missing output keeps the supported no-sample behavior, while unsafe ancestors and failed observations remain explicit. Output-page failures retain `saved_output_unavailable`; status/activity failures retain explicit unavailable facts and incomplete inventory. Snapshot writes remain outside the read-error translation, preserving ordinary durable-write failure semantics.

The command-status contract declares its required original `command-id`, and the shared parser enforces required flag groups before target/controller/receipt lookup. Help bypasses execution requirements. An explicitly supplied literal `undefined` remains a valid instruction ID. No provider, account, recovery, delivery or other track authority changed.

The independent reverse requirements check read all 11 requirement-root titles/summaries and relevant full criteria/designs. No later-built criterion permits indefinite reads or omission of the receipt selector; no new supersession pointer or business assumption is needed. Existing AC-ACT partial supersessions and the independently owned live-control completion remain intact.

## Covered-criterion evidence

| Criterion | Boundary evidence |
|---|---|
| AC-SEE-01 | Real multi-repository controllers and pure retained discovery cover all live states, stopped unfinished work, independent controller/working/waiting/Needs-you/paused counts, empty inventory, path aliases and incomplete records. The new subprocess matrix exercises nonregular, unreadable and dangling-symlink output through inventory in both formats, with explicit incompleteness and subsequent authenticated controller responsiveness. |
| AC-SEE-06 | Actual saved files and built CLI text/JSON cover default 50 entries, explicit 200 entries, executed next-page argv, empty/valid output, explicit sessions and frozen cursors. Existing final-serializer tests reconstruct exact Unicode/scalar fragments, internal newlines and empty entries within the complete 16,384-byte cap, and retain generation/prefix/session/execution/descriptor failure checks. Nonregular/error reads return the output-specific unavailable result. |
| AC-SEE-08 | The history portfolio retains both providers, earlier/replaced conversations, distinct selectors/provider IDs, attempts, phase/title/agent/cwd/start/latest-attempt metadata, active/stopped states and an explicitly empty unstarted phase. Existing legacy/ownership/identity, unavailable-history, 48 MiB controller/CLI and finalized-response tests remain. The new matrix reaches live browser-derived snapshot sampling and retained basic/full status, returning unavailable activity rather than hanging or concealing a failed read. |
| AC-CLI-01 | Built CLI text/JSON dispatch covers the same unavailable failures/exits and valid empty output; public text requires date/time/UTC offset while machine observations remain UTC. Receipt tests reject omitted IDs before valid or invalid target lookup, retain literal `undefined` and ordinary original IDs, unknown-ID errors, replay and completion/execution-replacement lifetime, pure retained bytes and no-tools help. Existing installed help/helper tests retain legacy execution contracts. |

Independent deliverable review reproduced the sampler's old `existsSync` bypass through the built retained CLI and found no remaining issue after parent validation plus `lstat` and the public dangling-link regression. Independent test hardening identified and closed the four assertion gaps above, then graded the whole covered criteria adequate after the final unchanged focused reruns, with the non-green full/partition limits below. No deliberate red mutation, new provider turn, account change or whole-PRD delivery/test audit ran. The existing provider/Grok evidence remains separately scoped.

## Final verification

The complete `npm run verify` passed dependency security (zero blocking high/critical findings), lint, TypeScript/Svelte checks (zero errors/warnings), all **639 unit cases** and all **17 provider-contract checks**. Integration completed **962 passed, 38 failed and two existing skipped cases across 89 files in 3,415.45 seconds**. The full gate is **non-green**. An earlier verify was deliberately interrupted during integration to fix the review finding; it supplies no complete-result claim.

Runtime/prompt source remained unchanged during the complete gate. The six assertion strengthenings were added before integration started and are included in its 54-case inspection file. The later test-only partition below changed no runtime, expected result or deadline. Final lint/type checks were repeated after that partition. Neither a selective pass nor a source comparison reclassifies a complete failed run as green.

The six new pre-partition CLI regressions passed (105.45 seconds), and the six strengthened whole-criterion checks passed (63.23 seconds). In the complete run, the existing 48 MiB history case returned a finalized `state_unavailable` read-deadline error rather than partial/corrupt output; one new aggregated matrix reached its existing 60-second test limit. The same file-type assertions were partitioned into independent cases, each retaining all six CLI entry points, cursor checks, controller health and empty/valid controls, with unchanged seven-second child watchdogs and 1.5-second health deadlines.

That final 19-case boundary portfolio completed **17 passed, two failed** (704.82 seconds). Both failures were child watchdog expirations in positive controls: restored regular-output logs and an ordinary original-ID receipt read. All nonregular/unreadable/dangling output failures and subsequent controller-health checks passed. Those two positive cases and the unchanged existing 48 MiB history case then passed together in isolation: **three passed, 63 unselected cases, 60.62 seconds**. This resolves the scoped regression concern without turning either larger run green or asserting that its precise timing cause is established.

All **eight installed-package checks pass** (407.97 seconds). To avoid rebuilding the `dist/` used by active integration, the unchanged package harness ran `npm run test:package` in a disposable source archive: all 701 tracked files matched this worktree byte-for-byte at creation, and all compiled CLI/runtime/prompt files match the worktree build. Its packed/installed artifact proves complete help without Git/controller/provider access and preserves the existing helper contracts. Later changes were test partitioning and documentation only.

### Full-gate failure disposition

An untouched disposable `git archive 3dd3b3f` reproduces **nine** of the complete run's failures with original assertions/deadlines:

- All three installed-Claude passive qualification failures (three failed, three passed; 6.33 seconds): installed Claude is `2.1.311`, while the existing qualified boundary expects `2.1.307`. No provider installation, qualification, sign-in, billing or authority rule changed.
- The 32-message admission case (one failed, 37 unselected; 38.89 seconds) returns `input_unavailable`/409 instead of 202 while checking/dispatching/reconciling. The current run fails on message 23 and the baseline on message 20, at the same assertion and refusal mechanism; this is not a claim of identical instruction identity or timing.
- All five selected account/output-selection cases (five failed, five unselected; 319.88 seconds) reproduce their existing 60-second test deadlines: missing/corrupt newest output selection, later Claude dispatch-checkpoint failure, independently dated Claude usage and Codex original/resumed provenance. Their assertions and provider/account behavior were not changed here.

The other **27** complete-run failures are timeouts, waits or latency bounds in unchanged audit-workflow (11), live-command (2), development-dependency (1), outside-workspace (1), takeover (9) and Codex-session (3) tests. Their precise causes and baseline failure reproduction were **not established by this phase**. No assertion/deadline, recovery/dispatch rule or independently owned track was changed to obtain a pass. The complete log retains each case and error; these are limits of this gate, not proof that the other track's work is complete.

A machine snapshot during the run reported load average 99.54, 75 running processes and about 47 GiB used physical memory, with a 20 GiB compressor. That observation documents concurrent resource pressure; it does not establish the cause of any particular failure. Only this chat's own checks were controlled. Independent final test hardening retains **adequate**, not strong, grades for the four whole covered criteria after inspecting these outcomes and passing unchanged scoped reruns.

Historical Phase 9/8/7/6/5 non-green gates, Closed lines, partial supersessions and separately scoped provider/Grok release evidence remain unchanged. No new business assumption, provider turn, production action, whole-PRD delivery audit or whole-PRD test audit occurred. The next planned closeout is the fresh whole-PRD delivery audit after authorized publication/launch; test audit still waits for current clean delivery.

Machine-local supplementary logs, all under `/private/tmp`: `kiln-ph10-final-verify.log`, `kiln-ph10-review-regressions.log`, `kiln-ph10-hardened-assertions.log`, `kiln-ph10-final-boundaries.log`, `kiln-ph10-final-isolated.log`, `kiln-ph10-package.log`, `kiln-ph10-baseline-passive.log`, `kiln-ph10-baseline-messages.log`, `kiln-ph10-baseline-account.log`, `kiln-ph10-final-lint.log` and `kiln-ph10-final-typecheck.log`. The recorded outcomes/configurations/limits above are the durable evidence; scratch files are not portable dependencies.

## Publication and fresh-audit handoff

Doug's exact instruction in source chat `01a182ef-0c8e-7cf1-aed8-75c2defb17e7` was “Okay, go ahead and commit and push, and then launch another chat to continue to resolve these issues in the next phase.” The [audit authorization record](kiln-bot-control-delivery-audit-after-phase-9.md#audit-publication-and-phase-10-launch-authorization) limits it to audit publication and this implementation launch. Audit `9afa5fe` and authorization `3dd3b3f` were published before this phase began. Scoped implementation commits follow the skill default; publishing Phase 10 or later audit/implementation commits, launching a successor and production release remain held. This is not a standing publication or launch grant.

After authorized Phase 10 publication and shared-checkout fast-forward, repeat whole-PRD delivery audit in a fresh chat/worktree from published `origin/develop`. Do not reuse this implementation worktree. Test audit waits for current clean delivery. Preserve original criterion ownership, all earlier Closed lines, partial supersessions, Phase 9/8/7/6/5 historical non-green gates and separately scoped provider/Grok release evidence. Other tracks remain independently owned.

## Phase 10 publication and fresh-audit authorization

Doug's exact instruction on 2026-10-28 in source chat `01a18319-4a12-7f70-ab07-bcea83979511` was “All right, go ahead and commit and push and then launch another chat to continue with the next step.” This authorizes publication of Phase 10 implementation `0c9a5fe` (rebased without patch changes from local `338f0f6`), this scoped handoff record, and launch of the next planned fresh whole-PRD delivery audit after publication and shared-checkout fast-forward. It supersedes only the Phase 10 publication and successor-launch holds above. The existing non-green full gate, qualified scoped outcomes, original ownership and historical verification limits remain intact.

The fresh audit owns this PRD's audit documents in a new worktree from published `origin/develop`; other tracks remain independently owned. Scoped audit commits follow the skill default. Publishing later audit/implementation commits, further successor launches and production release remain held for explicit authorization. Test audit still waits for current clean whole-PRD delivery. This instruction is not a standing publication, launch or release grant.

### Publication compatibility verification

Before publication, the implementation and scoped authorization record were rebased onto published live-control commits `0cc1055` and `ae72a06`. `git range-diff` confirms that original local implementation `338f0f6` and rebased implementation `0c9a5fe` have identical patches. No conflict, runtime edit, assertion change or deadline change was needed.

On the rebased source, `npm run build` and the new live-history unit case pass. The selected built-CLI integration portfolio passes **21 cases**, with 45 unselected: the 19 Phase 10 output/receipt cases plus existing complete conversation/attempt history and usable-Claude-history handoff checks (156.58 seconds). The first sandbox-restricted attempt passed ten and failed eleven: ten live fixtures reported no free test port and the history fixture had no transcript after startup. Repeating the identical command with localhost/process access enabled passes all 21; no test or source was changed between attempts. Supplementary logs are `/private/tmp/kiln-ph10-rebase-build.log`, `kiln-ph10-rebase-unit.log`, `kiln-ph10-rebase-integration.log` and `kiln-ph10-rebase-integration-unrestricted.log`.

These compatibility checks do not replace or reclassify the complete non-green gate in Final verification. No new whole-repository gate, installed-package gate, provider turn or production release was run during publication.

### Prepared fresh-audit continuation

Valid only after explicit Phase 10 publication and successor-launch authorization, publication and shared-checkout fast-forward. This prepared prompt grants none of those actions.

```text
botControl kiln delivery audit

In service of: Kiln control from a phone-driven bot (PRD)
  Whole PRD — all implementation phases, including completion Phase 10
  This chat: audits whether it is built.
Parallel: yes

Use enso-method:delivery-audit for
 docs/prds/kiln-bot-control/kiln-bot-control-prd.md.

Locate Kiln's existing shared checkout with git worktree list; it uses develop.
Create a fresh sibling worktree from published origin/develop under the
shared checkout's organization directory, named
 .worktrees/botcontrol-kiln-delivery-audit-after-ph10/kiln
on wt/botcontrol-kiln-delivery-audit-after-ph10.
Do not reuse Phase 10's implementation worktree. Own this PRD's audit documents;
other tracks remain independently owned.

Under docs/prds/kiln-bot-control/, read Phase 10's Implementation,
Covered-criterion evidence, Final verification, and Publication and fresh-audit
handoff for work state, proof limits and authorization. Load the parent PRD,
design, assumptions, phase plan and after-Phase-9 audit. Preserve original
ownership, Closed lines and partial supersessions. Keep Phase 9/8/7/6 Final
verification, Phase 5 Known baseline failures and release validation separately
scoped. Whole-PRD test audit waits for current clean delivery.

Carry the exact authorization and remaining holds from Phase 10's handoff and
its later publication/launch record. Scoped audit commits follow the skill
default; publication and production release remain held unless explicitly granted.

First: read the Phase 10 document in full.
```
