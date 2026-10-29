# Kiln bot control — whole-PRD test audit

**Status:** Done 2026-10-28 — all 18 active criteria Adequate; all 15 initial evidence gaps closed. No criterion waits on delivery or another action. The verification repair below closes the four recorded failures and passes the complete local gate. Audit `3aee728` is published; the repair is authorized to land on `develop`.
**Last audit:** 2026-10-28, whole PRD, runtime baseline `f778755`; the test changes accompanying this report were uncommitted when assessed.
**PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Delivery baseline:** [Whole-PRD delivery audit after Phase 10](kiln-bot-control-delivery-audit-after-phase-10.md), published assessment `9cffab4` and authorization `f778755`.

## Scope, currentness and ownership

All 18 active criteria are in scope across all ten closed implementation leaves. Retired AC-ACCOUNT-02–04 are excluded; no active criterion is fully superseded. AC-ACT-01/02/03 retain their existing partial supersessions. Phase 1 and Phase 2 retain original ownership; completion Phases 3–10 complete their existing criteria. Every existing Closed line and earlier audit remains unchanged.

The fresh worktree started from published `origin/develop` at `f778755`, after a clean shared-checkout fast-forward. Comparison with the delivery assessment's `7bd7ab5` baseline found only document/status/authorization changes, including independently owned live-control Phase 11. Runtime, tests, prompt resources and bot-control requirement bodies were unchanged at audit launch. That delivery verdict is current for this audit's ordinary bot-control scope. Live-control Phase 11's final admission during deliberate takeover/review hand-back belongs to AC-BOT-02's existing partial supersession; its repair and audit verdict are independently owned.

This audit changes tests and its closeout documents only. It does not add a delivery phase, change provider/account/recovery/delivery authority, or reinterpret another track's non-clean verdict. Test-only strengthening does not invalidate clean delivery of unchanged runtime. Any later runtime/requirements change must be checked against this baseline before publication or re-audit.

## By criterion

Grades below include independent source assessments/re-grades, final normal-suite results, unchanged failure triage and restoration-guarded calibration. Paths are repository-relative. “Inspection” means `src/control/inspection.integration.test.ts`; “commands” means `src/control/commands.integration.test.ts`; “routine” means `src/control/routine-commands.integration.test.ts`. All integration files are collected by the normal `test:integration` configuration. The Checked column refers to `2026-10-28 f778755` plus the test changes accompanying this report; it is not a claim that the historical full gate was green.

| Criterion | Grade | Required-part evidence | Code | Checked |
|---|---|---|---|---|
| AC-SEE-01 — Inventory (high risk) | Adequate | Inspection's real two-repository controllers, stopped unfinished/closed/setup/empty portfolio, exact canonical identity/name/repository/state/count assertions, incompatible/reused/unreachable/unsafe records, nonregular-output deadlines and pure saved-state bytes. | `client.ts::inventory`, `private-state.ts` | Baseline + this changeset |
| AC-SEE-02 — Run detail | Adequate | Inspection pins root Claude/Codex agent, requested/effective model, nested phase/audit identity and round, complete plan/executable counts, start/pause/completion/PR/merge facts live and retained, saved final-delivery identity and exact dated last activity after pause/completion. | `projection.ts::statusProjection`, `activity.ts`, `engine/snapshot.ts` | Baseline + this changeset |
| AC-SEE-03 — Freshness | Adequate | Inventory collection start/end UTC call windows and independently dated rows; retained sidecar observation date/null token/disabled controls; account-provenance and Codex-observation suites pin identity/usage/reset/recovery/billing dates, stale/unknown states and failed observations without false zero inventory. | `client.ts`, `projection.ts`, `public-facts.ts` | Baseline + this changeset |
| AC-SEE-04 — Full stop (high risk) | Adequate | Inspection pins exact multiline literal message, stop reason/session/phase, failed checks/check date and recovery choices; valid owned no-message stop reports explicit absence; foreign/unbound/missing/legacy/resource/error portfolios preserve complete text or explicit incompleteness. | `projection.ts::statusProjection`, `engine/snapshot.ts` | Baseline + this changeset |
| AC-SEE-05 — Handoff (high risk) | Adequate | Real current/earlier Claude handoffs and both-provider no-session fresh paths; successful selected historical Codex handoff pins separate local/provider IDs, exact argv/command/cwd/profile/model/effort/prompt, metadata-only RPC calls and unchanged private state; active/missing-history/cwd/context failures remain explicit. | `projection.ts::handoffProjection`, `history.ts` | Baseline + this changeset |
| AC-SEE-06 — Bounded output | Adequate | Actual output files and both final serializers: 50/default and 1–200 entry ceilings; full stdout ≤16,384 bytes including exact-cap cases; chronological Unicode/newline/empty-entry reconstruction with scalar bounds/slice/adjacency/coverage; exact next argv; fresh tail after append/frozen cursor; replacement/truncation/generation/descriptor/session/execution failures; explicit no-session/no-output/exhaustion and bounded special-file errors. | `logs.ts`, `result.ts` | Baseline + this changeset |
| AC-SEE-07 — PRD targeting (high risk) | Adequate | Real absolute/caller-relative file/directory/worktree/retained aliases and spaces; duplicate canonical targets refuse both read and mutation before controller/effect lookup, with unchanged state; cursor/token/receipt execution binding remains covered. | `private-state.ts::targetWork`, `client.ts` | Baseline + this changeset |
| AC-SEE-08 — Conversation history (high risk) | Adequate | Earlier completed phase, failed/replaced/current Claude/Codex records, distinct selectors/provider IDs, all required metadata, stable distinct saved/derived attempts across repeated reads, explicit unstarted empty phase; historical handoff; ownership/legacy/missing/corrupt/duplicate/deadline and large finalized-response portfolios. Its original failed stress run and unchanged passing rerun both retain their limits below. | `history.ts`, `projection.ts`, `spool.ts` | Baseline + this changeset |
| AC-ACT-01 — Discover commands | Adequate | Complete independent 27-command inventory, root/group/leaf text/JSON and installed empty-PATH help; request-first complete examples, nonempty rendered argument/flag value sources, parser/real helper payload admission; exact control names/availability/reasons/required inputs/invocations; operator/data/retry guidance. | `help.ts`, command resources, `projection.ts` | Baseline + this changeset |
| AC-ACT-02 — Preserve intent (high risk) | Adequate | Commands plus phase-handoff/engine/server portfolios distinguish literal reply, no-note same-conversation resume, already-complete unsent retention, explicit fresh Verify/acknowledgement/pause, failed/unreadable completion, missing/late-lost history, usage/audit/delivery/plan recovery and competing ownership. Combined public workflow preserves these distinct outcomes. | `engine.ts::applyControl/recoverPhase`, `commands.ts` | Baseline + this changeset |
| AC-ACT-03 — Routine controls (high risk) | Adequate | Browser journal tests already prove shared pause/cancel/Continue effects. Routine adds actual CLI settings read/resulting booleans, deferred pause/cancel, Continue to eligible broken-plan recovery, genuine Check-again before/after repair, and positive reviewed outside confirm/clear/replay with unchanged files/Git/session/phase evidence. | `engine.ts::applyControl`, `client.ts` | Baseline + this changeset |
| AC-ACT-04 — Retry/late safety (high risk) | Adequate | Real journal/HTTP/browser/automatic tests pin same-ID replay before eligibility, changed-input conflict, stop/epoch/execution replacement, ordinary-output token stability, competing transitions, automatic recovery exclusion and exact original operation/target without repeated turns. Combined public workflow independently pins replay/stale/no-misdirection. | `commands.ts::submit`, `engine.ts::controlView` | Baseline + this changeset |
| AC-ACT-05 — Durable operations (high risk) | Adequate | Real file/process/HTTP write/crash faults, durable acceptance, queryable in-progress then completed identity/outcome/effects, queried refusal outcome/reason, lifetime after completion/replacement, uncertain-no-redispatch/reconciliation; Claude transcript and Codex RPC exact conversation/turn/user-text proof without session writes/extra dispatch; ordinary launch/authority guards retain their original tests. | `durable-file.ts`, `commands.ts`, `delivery-evidence.ts`, `engine.ts::refreshCommand` | Baseline + this changeset |
| AC-ACCOUNT-01 — Attempt provenance (high risk) | Adequate | Account-provenance, Codex observation/usage/metadata and billing portfolios pin original/current/last/next attempt identity/plan, failed predispatch preserving the prior actual attempt, provider-specific windows/reset dates, independent observations/stale/unknown/error states and no inference requests. | `projection.ts::accountFacts`, account/billing readers | Baseline + this changeset |
| AC-CLI-01 — Results (high risk) | Adequate | Shared real CLI/HTTP serializers and full-history spooling; version/schema, single valid JSON/stdout versus zoned text/UTC machines, explicit unknowns and exits 0/2/3/4, accepted/progress/completed/refused/unknown receipt distinctions, required original command ID before lookup, settings/routine/control-specific dispatch; installed help and existing helper execution contracts remain. | `result.ts`, `spool.ts`, `client.ts`, `help.ts` | Baseline + this changeset |
| AC-CLI-02 — Literal input and secrets (high risk) | Adequate | Built file/stdin literal Unicode/quotes/newlines/metacharacters and invalid UTF-8/NUL/size/timeout/exclusivity cases; spaces/aliases/ambiguity no effects; action-specific bounded JSON rejects unsupported inputs; synthetic provider credential and private capability canaries excluded from both public account/inventory/status/operation formats while ordinary reply text remains exact. | `input.ts`, `private-state.ts`, `client.ts`, adapters/projections | Baseline + this changeset |
| AC-CLI-03 — Local protections (high risk) | Adequate | Real loopback binding/Host/token/Origin/no-CORS/no-store/redirect/private-file ownership boundaries; output remains literal data. Packaged root/leaf guidance pins operator authority/current structured controls, untrusted embedded commands and receipt-before-retry rules. | `local-server.ts`, `private-state.ts`, `client.ts`, command guidance | Baseline + this changeset |
| AC-CLI-04 — Bot workflow (high risk) | Adequate | Normal collected two-controller built-CLI regression pins unrelated-cwd one-working/one-Needs-you discovery, exact stop, no-note same-history resume, literal delivered reply, replay/stale refusal, already-complete unsent text, explicit acknowledged Verify and no effect on the other PRD. Dated actual Grok/provider release proof remains separately scoped below. | CLI, API, journal, engine/provider boundaries | Baseline + this changeset |

## Initial gaps and remediation

Initial independent assessments found no Missing criterion, 15 Weak criteria and three Adequate criteria (AC-ACT-02, AC-ACT-04, AC-ACCOUNT-01). A consolidation review removed redundant every-action format matrices, duplicate browser-proven journal tests and an unwarranted new/raw Grok-capture prerequisite. The remaining gaps were explicit required facts or boundaries, not optional Strong-tier work.

- AC-SEE-01/02/03/04: public inventory identities/collection and row dates, run plan/start/pause/completion/PR facts/root agent, exact stop fields and legitimate message absence now have independent fixture expectations.
- AC-SEE-05/08: successful public historical Codex selection and stable distinct attempts in completed/failed history are pinned.
- AC-SEE-06: explicit empty/exhausted outcomes, fresh unpaged tail, actual replacement/truncation/generation and final emitted fragment coordinates/fidelity/complete coverage are pinned.
- AC-SEE-07/CLI-02: duplicate canonical records refuse selection and leave every saved byte unchanged. Public account/operation credential exclusion gains explicit synthetic sentinel assertions.
- AC-ACT-01/CLI-03: request-first examples, value sources, returned executable controls and packaged authority/untrusted-output guidance are pinned.
- AC-ACT-03/CLI-01: unique public routine-command input/result paths now reach real controllers, journal and Git evidence; shared browser/serializer proof is retained without unnecessary duplication.
- AC-ACT-05: normal-collected Codex delivery correlation checks exact thread/turn/user text and refuses wrong evidence; durable progress, terminal outcome and refused reason are separately queryable.
- AC-CLI-04: the complete two-controller workflow is now collected by the normal suite, with verified provider peers beside the already completed actual caller demonstration.

Fresh reviewers re-derived requirements before reading the changed tests. They found residual omissions in root agent, Unicode scalar coordinates, queryable progress/refusal reason and provider-secret exclusion; all were added and re-graded Adequate. A final independent evidence-map review found no unsupported passing/Strong claims or loss of scope/ownership. Final result review confirmed the affected criteria against the completed JSON reports. No production action, actual provider model turn, real provider account change or new Grok demonstration is part of this audit.

## Verification

### Original full baseline

The `verify`-equivalent stage sequence ran dependency audit, lint, TypeScript/Svelte checks, `npm test`, `npm run test:codex-proof`, `npm run test:integration`, then the separate installed-package gate. Vitest's additional JSON reporter saved each pass/fail/skip outside the repository. Runtime and original collected test bodies remained at `f778755`; strengthened/new tests were developed separately after their original file had completed or outside the original discovered file list.

Audit, lint and type checks pass; all **640 unit cases** and **17 provider-contract checks** pass. The complete original integration run reports **1,010 passed, 14 failed and two existing skips across 90 files**, in **2,936.22 seconds** (the build-plus-integration command took 2,949.00 seconds). This is a **non-green full baseline**, not a collection of selected passes.

| Original failing portfolio | Cases | Observed failure, without inferring an unproved cause |
|---|---:|---|
| Installed Claude passive qualification | 3 | Installed `2.1.311` versus the existing `2.1.307` qualification; version and related qualification assertions fail. No provider installation or qualification rule is changed. |
| Large history under 48 MiB child heaps | 1 | First retained JSON request returns one finalized `state_unavailable` saved-state read-deadline error instead of expected success. No OOM or partial JSON was observed; the separate positive rerun below supplies passing aggregate-memory evidence. |
| Audit-workflow completion/continuation | 3 | Original 60-second test deadlines in completion-phase return, direct-fix return and fresh browser continuation. |
| Audit weekly recovery | 2 | Original 20-second wait for whole-workflow completion expires after the account-change recovery action. |
| Development dependency verification | 1 | Original 60-second test deadline. |
| Live message/review/takeover portfolios | 4 | Two explicit `EADDRINUSE` errors at localhost ports 43020 and 4701, plus two original 60-second test deadlines. These live-control obligations remain independently owned under the existing partial supersessions. |

The normal command portfolio (18), account provenance (10), Codex account observations (6), engine billing (16), Codex usage (22), server local protections (11), ordinary usage waits (30), engine resume (16) and historical takeover checks (12) all pass in that full run. Those named passes do not turn its failed cases green. Precise causes of the wait/deadline failures are not established merely by observing concurrent execution or by the absence of runtime changes.

### Focused remediation and failure triage

The first 21-case remediation selection returned 19 passes and two failed fixture assertions. One fixture had a controller not yet through setup, correctly reported as `not_started`; its expected state was corrected. The other compared a mutable stop object to itself after recheck; it now snapshots the original evidence before asserting a fresher check date. Both corrected cases passed unchanged product behavior/deadlines in a two-case rerun (32.93 seconds). No production behavior was changed to satisfy either assertion.

The fresh reviewers' four residual agent/scalar-coordinate/progress checks pass (35.30 seconds). The combined workflow plus provider-secret/refusal-reason selection passes both cases (50.90 seconds). The earlier focused run also passed the real Codex delivery-correlation case and every new empty/exhaustion, ambiguity, successful historical handoff and output replacement/truncation/generation case. These remain selected-run observations pending the final complete changed portfolios.

An unchanged three-case failure selection, while the original baseline still ran, repeated all three failures: the same finalized history read-deadline refusal and both whole-audit weekly completion waits (101.63 seconds). It did not establish a delivery defect or a precise timing cause, and is not a passing rerun. That failed selection did not count as positive aggregate-memory evidence; the subsequent unchanged passing selection below closes that evidence hold.

All **eight installed-package checks pass**, in **202.83 seconds** (204.99 seconds for the command). With that build released, an isolated complete original large-history retry first failed at its retained text deadline; a temporary text-only diagnostic and both unchanged weekly cases then passed. Diagnostic copies were removed and do not supply lasting normal-suite evidence. The subsequent **unchanged original three-case selection passes all three** in **71.29 seconds**, including all four live/retained text/JSON 48 MiB history requests and its over-budget failure assertions. No original assertion, deadline, runtime, provider fixture or recovery behavior changed. Independent re-grading now accepts the positive history boundary as Adequate; no timing cause or green full-gate claim is inferred. Post-restoration full results and red calibration are recorded below. Supplementary JSON/logs are under `/private/tmp/kiln-botcontrol-test-audit`; this document records durable commands/outcomes/limits rather than relying on those scratch files.

### Final complete verification

After every mutation was restored, the complete `verify`-equivalent stage sequence ran again: dependency audit, lint, TypeScript/Svelte checks, all **640 unit cases**, all **17 provider-contract checks**, and `npm run test:integration` with verbose/JSON reporting. Audit/lint/type checks and both preliminary test tiers pass. Integration reports **1,037 passed, four failed and two existing skips across 92 files**; the build-plus-integration command took **1,379.06 seconds**. All **17 new cases** and **seven strengthened existing cases** passed in that full run (24 changed cases total).

All four failures match cases in the original pre-change full baseline: the three installed-Claude passive-qualification assertions and the unchanged 48 MiB history read-deadline stress case. The other ten originally failing cases pass in this final complete run without assertion, deadline or runtime changes. The stress case's separate unchanged three-case selection still proves its positive boundary; neither that pass nor this improved failure count makes either complete full run green. Precise timing causes remain unestablished. No failure was suppressed, skipped, reclassified as a pass or changed to an expected failure.

The eight installed-package checks passed on the same runtime/resources before calibration. Runtime/resource bytes were restored exactly and matched published HEAD before the final build; subsequent edits are tests/closeout documents only, so that artifact proof retains its stated scope. This is not a new actual-provider/Grok demonstration or a production release.

Independent final result review confirmed the new/strengthened public control, progress, secret, history and workflow evidence and the four-failure limitation. All 18 active criteria meet the Adequate target. Original ownership, every Closed line, partial supersessions and separately owned live-control work remain intact.

## Red checks and restoration

All **22 calibrations pass**: each deliberate regression produced criterion-specific assertion failures on **two runs** (44 red selections), then its mapped selection passed after **byte-identical restoration** (22 green selections). Their total execution time was 411.94 seconds. No crash, import failure, timeout or unrelated failure was accepted as a successful red. Every new/strengthened test was included in a successful calibration. The final runtime/resource files were also compared directly with `git show HEAD:<path>` and all match.

| Calibration | Mapped assertion that failed twice |
|---|---|
| Public inventory name | Exact identities in stopped discovery and two live repositories |
| Public run start date | Exact live/retained status facts |
| Inventory collection date | UTC collection call-window bounds |
| Public stop reason | Exact full stop/recovery projection |
| Invented absent message | Owned valid no-message stop remains null with explicit absence |
| Removed historical argv | Exact selected Codex resume arguments/context |
| Wrong scalar total | Emitted fragment coordinates/source slices/complete reconstruction |
| Empty-result reason | Distinct no-session/no-output/exhaustion in both formats |
| Output error exit made successful | Replacement/truncation/generation failures retain nonzero unavailable result |
| Collapsed attempt IDs | Distinct stable attempts including saved IDs and failed/completed history |
| Removed example request | Complete request-first help metadata |
| Removed operator guidance | Shipped operator authority/current controls/untrusted output/retry rules |
| Wrong already-complete outcome in public receipt clone | Unsent reply/explicit acknowledgement and complete two-controller workflow |
| Wrong public execution identity | Original-execution replay receipt |
| Premature completed state in public receipt clone | Queryable in-progress acceptance before any provider dispatch |
| Wrong public delivered label in cloned effects | Exact Codex history proof and unchanged session/turn count |
| Wrong public preference value in cloned settings | Actual CLI receipt matches the resulting booleans |
| Wrong public Continue state | Dedicated next-activity/plan recheck contract |
| Wrong public outside effect in cloned effects | Confirmation does not resume or advance |
| Synthetic credential in public account output | Provider/private canaries stay absent from both public formats |
| Ambiguous-target error exit made successful | Ambiguous reads/mutations refuse without saved-state changes |
| Removed last-attempt public account | Independently dated actual-attempt provenance |

Mutations were sequential in this chat's private worktree. Each source/resource file had an external byte copy, recorded SHA-256, a pre-restore checksum comparison, byte-identical restoration and REDCHECK/RESTORED entries in this chat's shared-checkout session marker. Public receipt mutations used cloned scalars/nested effects/settings, preserving authoritative journal state. No production target, provider turn, credential/config/environment selection, ownership/admission/retry/dispatch/write-limit guard was changed. Those protected guards were **not eligible for destructive red mutation** under the skill; their real-boundary positive/negative tests supply read grades capped at Adequate. These sampled public failures do not claim all-part Strong proof.

## To fix, in order

None. All 15 initial Weak rows are now Adequate. Strong is optional and not part of this audit target.

## Waiting

None. No missing non-production counterpart, stakeholder decision, unraised row or delivery completion phase remains. The original audit publication hold was satisfied by commit `3aee728`.

## Historical and external proof limits

[Phase 10 Final verification](phase-10-complete-kiln-inspection-boundaries.md#final-verification) remains non-green: 962 integration passes, 38 failures and two existing skips, with only its stated nine baseline reproductions and scoped isolated/package/publication checks. Its 27 then-unestablished failures do not become established causes through this audit's new run. Earlier Phase 9/8/7/6 gates and Phase 5 known failures retain their recorded scope.

[Provider/Grok release validation](kiln-bot-control-validation.md) remains dated evidence: actual Grok Bot 0.75.8/default configuration and the recorded Claude/Codex versions, exact disposable workflow receipts and fixture limitations. The new normal regression uses real local CLI/HTTP/private-state/Git/process boundaries with checked-in verified provider peers; it does not claim a fresh Grok, provider-model or phone run or general compatibility with later bot/provider versions. A portable raw Grok trace is not required by AC-CLI-04; the committed verified caller/configuration/result summary establishes the historical release demonstration. Skipped, uncollected and failing cases do not independently earn a current passing grade.

No criterion is Strong: every required part has not been individually broken and seen red. Strong is recommended for every high-risk row marked above, especially delivery/retry/target/secret boundaries; it is optional and no protected guard is weakened to obtain it.

## Publication and closeout boundary

Doug's actual instruction in source chat `01a18395-b827-75c3-88b2-aa53da8d4070` was: “Go ahead and push the audit, then launch a new chat to run the whole-PRD test audit.” Audit `9cffab4` and authorization `f778755` were published, the shared checkout was fast-forwarded and this fresh chat was launched. That grant is satisfied. This chat is `01a183a3-791f-7f03-b1ab-d46193df314a`. Its original `botcontrol-kiln-test-audit` worktree was removed after publication.

Doug subsequently said “go ahead and push first of all” in this chat; the audit landed as `3aee728`. He then required all tests to succeed, said “Just please proceed.” and requested completion on `develop`. That authorizes the scoped verification repair and its publication. Other tracks remain independently owned. Production release requires separate authorization. This report's filename follows Doug's standalone-document naming rule rather than the skill's generic `test-audit.md` example.

## Track closeout

All ten implementation leaves are closed and published, the delivery and whole-PRD test-audit targets are complete, and the verification repair below closes the remaining local gate failures. This PRD has no remaining planned implementation/audit child and needs no successor prompt.

## Verification repair and complete passing gate — 2026-10-28

The three native passive-billing failures came from selecting the auto-updated Claude 2.1.311 while the supported passive contract remains 2.1.307 / SDK 0.3.310. The exact 2.1.307 CLI is now a development-only dependency selected explicitly by the tests. A clean `npm ci` installs that native proof in CI and locally; the runtime qualification policy is preserved.

Large-history finalization now batches serializer fragments into bounded buffers of 262,144 UTF-16 code units, checking the deadline for every fragment. Profiling identified substantial small-file-write overhead. The added real-file regression rejects the old 32,768-code-unit pattern (65 writes against a maximum of 16), and checks bounded writes plus exact Unicode/JSON bytes. The complete memory proof runs in a separate fresh worker. Its controller waits for actual metadata/billing refresh completion before server initialization, preventing late startup cache writes from racing the authentication probe. Production server initialization supplies its initial inspection cache.

Ordinary integration files use at most two workers. Two complete multi-session audit workflows have a bounded 120-second whole-test budget: isolated measurements showed correct completion near or beyond the old generic 60-second limit. All workflow assertions, the 48 MiB child heaps, the 40-record / greater-than-40-MiB response proof, the 16 MiB record budget, and the production authentication/read/transport deadlines are preserved.

The complete gate ran the `npm run verify` constituent commands, followed by the separate installed-package suite. JSON reporters retain individual outcomes.

| Gate | Result | Command seconds |
|---|---|---:|
| `npm run audit` | Zero blocking high/critical findings | 1.71 |
| `npm run lint` | Pass | 9.19 |
| `npm run typecheck` | Pass, no Svelte errors or warnings | 23.89 |
| `npm test` | 641 pass | 6.59 |
| `npm run test:codex-proof` | 17 pass | 11.41 |
| `npm run test:integration` | 1,053 pass, zero failures, two existing platform skips | 1,350.63 |
| `npm run test:package` | Eight pass | 61.39 |

All 94 integration files were collected exactly once, and the memory project completed before the ordinary project. The memory proof passed in 16.48 seconds in that full run. Both formerly timed-out audit workflows passed (16.29 and 9.92 seconds). Nine repair source/configuration files stayed byte-identical throughout the gate. The full gate ran on `33161aa` plus the repair; rebasing over the later `226fea7` live-control audit documents preserved those files.

After the full integration run, review corrected the fixture's explicit readiness sanity check to include `billing.pending`, the metadata flag, alongside the already-awaited refresh and command-busy check. Lint and the entire memory proof then passed again, one case in 24.67 seconds. This is a stronger fixture assertion; runtime source and all behavioral assertions are unchanged from the full passing run. Final deliverable review and test hardening cover the scoped repair.

Three earlier complete-gate attempts were stopped after reproduced history-deadline, workflow-duration or controller-startup failures; they remain interrupted attempts, not passing results. Earlier audit/phase non-green runs above remain historical evidence. The passing gate here supersedes the four outstanding failures for current local verification, without extending dated provider/Grok or native-platform proof. Supplementary reports and profiles are in `/private/tmp/kiln-full-suite-repair`; the commands, outcomes and limits are recorded here.


## CI controller-port isolation repair — 2026-10-28

The first repair was published as `a0a8464`. After Doug cleared the GitHub Actions budget hold, [CI run 40772625569](https://github.com/EnsoDynamics/kiln/actions/runs/40772625569) ran the actual checks. Linux and Windows build/pack passed. The macOS gate passed 641 unit and 17 provider-contract checks, then reported 1,003 integration passes, one failure and 51 existing platform skips. The sole failure was `EADDRINUSE` on loopback port 4700 in the closed-at-start audit workflow; the package step was not reached. That CI run remains failed evidence despite the earlier passing local gate.

Independent fixture state roots each had their own production port registry but competed in the same TCP namespace. Their probe-close-bind sequence could select the same port across workers. Six audit/live fixture files now use one test-support helper that asks the OS to bind port 0 atomically and publishes the actual bound port with its PID/start-time identity for real CLI discovery. Existing fixture restarts reuse their first actual port. The production server reports its bound address and restricts Host headers to that actual port; token and Origin checks are preserved. The production CLI's stable port allocator, registry/instance-lock policy and request deadlines are unchanged.

A new real concurrent-controller regression requires distinct live ports, the correct authenticated capability and CLI execution identity for each fixture, exact rejection of Host/Origin port 0 and the peer token, and independent discovery-file cleanup. Every original assertion in the six converted fixture files is retained. Focused execution passed both this regression and the exact CI-failing workflow. Independent deliverable review and test-hardening assessment found no material gaps.

The complete `verify`-equivalent stage sequence and installed-package suite then passed on the port repair:

| Gate | Result | Command seconds |
|---|---|---:|
| `npm run audit` | Zero blocking high/critical findings | 0.92 |
| `npm run lint` | Pass | 5.17 |
| `npm run typecheck` | Pass, no Svelte errors or warnings | 9.28 |
| `npm test` | 641 pass | 3.64 |
| `npm run test:codex-proof` | 17 pass | 5.27 |
| `npm run test:integration` | 1,054 pass, zero failures, two existing platform skips | 3057.99 |
| `npm run test:package` | Eight pass | 59.88 |

All 95 integration files were collected exactly once. The new concurrent-controller regression passed in the complete run, as did the exact CI-failing closed-at-start workflow. All nine port-repair source files remained byte-identical throughout the gate. The longer local duration affected unchanged suites as well; no assertion, test deadline or production request budget was relaxed. Reports are retained under `/private/tmp/kiln-full-suite-repair/port-fix`. The earlier failed CI run remains historical; this local gate does not by itself establish a passing subsequent GitHub run.


## CI reset-clock and account-fixture repair

[CI run 40785941543](https://github.com/EnsoDynamics/kiln/actions/runs/40785941543) on published port repair `b145978` passed Linux/Windows build and pack, 641 macOS unit checks and 17 provider-contract checks. Integration reported 1,003 passes, two failures and 51 existing platform skips across 95 collected files; the package step was not reached. The concurrent-controller regression and previously failing closed-at-start workflow passed. This failed run remains historical evidence.

The usage-wait terminal fixture added one hour to the real clock but expected a reset without a weekday. At 23:31 UTC the documented formatter correctly emitted `Thu 12:31 AM`; the test's same-day assumption was wrong. Its fully anchored recovery-line grammar now permits only the seven optional weekday names. An exact terminal-format expectation separately proves a civil 23:31-to-next-day-00:31 reset, with the correct weekday and 12-hour output. No formatter or product clock changed.

The migration fixture assumed that usage was stale before taking its baseline snapshot. Phase dispatch intentionally starts an independent usage refresh while required auth-only readiness runs; either legal reading can finish last. The fixture now completes real billing/full-account refreshes, requires a dated usage observation, then performs the real auth-only readiness read to establish stale usage with the same observation date. Every original stale-to-fresh, account-content, independent-date and whole-snapshot migration assertion remains. It does not assign account state or add a mock.

Both exact CI-failing integration cases passed in UTC before midnight, including the next-day reset, and all 17 terminal unit cases passed. Independent deliverable review and test-hardening assessment found no material gap. Runtime source, deadlines, heap budgets and production port/authority policies remain unchanged from the published port repair.

The complete `verify`-equivalent stage sequence and separate installed-package suite then ran with `TZ=UTC`, matching CI, and passed:

| Gate | Result | Command seconds |
|---|---|---:|
| `npm run audit` | Zero blocking high/critical findings | 1.42 |
| `npm run lint` | Pass | 8.78 |
| `npm run typecheck` | Pass, no Svelte errors or warnings | 18.55 |
| `npm test` | 641 pass | 4.43 |
| `npm run test:codex-proof` | 17 pass | 6.26 |
| `npm run test:integration` | 1,054 pass, zero failures, two existing platform skips | 1742.23 |
| `npm run test:package` | Eight pass | 27.94 |

All 95 integration files were collected once. Both previously failing CI cases pass in this complete UTC run. All three repaired test files remained byte-identical throughout the gate, and runtime source remains unchanged from `b145978`. No new skip, retry, relaxed deadline or fabricated account state was added. Reports are retained in `/private/tmp/kiln-full-suite-repair/metadata-time-fix`. The two earlier CI failures retain their historical meaning; this local result does not replace the next actual CI result.


## Browser test control-readiness repair

[CI run 40792979673](https://github.com/EnsoDynamics/kiln/actions/runs/40792979673) on published fixture repair `b1d91e3` passed Linux/Windows build and pack, 641 macOS unit and 17 provider-contract checks. Integration reported 1,004 passes, one failure and 51 existing platform skips across 95 collected files; package checks were not reached. The prior reset-clock, migration and controller-port cases passed. The sole failure timed out waiting for phase advancement after the real browser's complete-reply precheck.

The browser driver's raw `.click()` returned silently when its target was disabled. A precheck's HTTP response can render the complete-choice panel before the independently throttled event stream clears its `checking` flag, so finding the choice text alone does not establish that Advance is enabled. CI retained page text, not button attributes; this timing mechanism is supported by the source ordering and the real-browser reproduction rather than a captured disabled attribute from CI.

The driver now waits for the first matching button/link to exist and be enabled, rechecks within the single browser click task, then clicks once. It does not retry the action, bypass a product guard or extend a timeout. Product UI, controller source and every existing workflow assertion remain unchanged.

A new real-Chrome regression starts an actually disabled fixture button. A DevTools round trip establishes that the click promise stays pending and no event is sent; enabling that synthetic fixture permits exactly one event. The old unchanged driver fails the pending assertion (`true` instead of `false`), while the repaired driver passes. The regression and the exact real-controller advancement workflow both pass in the focused run. Independent deliverable review and test-hardening assessment found no material gap.

The complete `verify`-equivalent stage sequence and separate installed-package suite then ran with `TZ=UTC` and passed:

| Gate | Result | Command seconds |
|---|---|---:|
| `npm run audit` | Zero blocking high/critical findings | 1.80 |
| `npm run lint` | Pass | 6.54 |
| `npm run typecheck` | Pass, no Svelte errors or warnings | 13.86 |
| `npm test` | 641 pass | 3.98 |
| `npm run test:codex-proof` | 17 pass | 6.72 |
| `npm run test:integration` | 1,055 pass, zero failures, two existing platform skips | 1713.57 |
| `npm run test:package` | Eight pass | 28.20 |

All 95 integration files were collected once, and all 71 cases in the real-browser file passed, including the new driver regression and the exact previously failing advancement workflow. The repaired test file remained byte-identical throughout the gate. Runtime source remains unchanged from `b1d91e3`; no product guard, timeout or existing workflow assertion was relaxed. Reports are retained in `/private/tmp/kiln-full-suite-repair/browser-action-fix`. Earlier failed CI runs retain their historical meaning; this local result does not establish a passing subsequent CI run.
