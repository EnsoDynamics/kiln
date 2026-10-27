# Kiln bot control — Phase 2 implementation validation

**PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md). **Phase:** [2 — Control existing work safely](phase-2-control-existing-work.md).

**Status:** Phase 2 implementation and release proof complete on 2026-10-27. Independent deliverable review, test hardening, the full repository and installed-package gates, both actual provider boundaries and the required local Grok Bot demonstration pass. Integration/push remains subject to Doug’s existing hold; whole-PRD delivery and test audits remain separate closeout work.

## Implementation and automated evidence

The CLI, browser and automatic launches share durable admission and dispatch correlation. Version-1 checksum-protected receipts are partitioned by execution and command-ID digest. PRD schema 10 and session attempts carry operation references. Reconciliation reads persisted effects; it never infers success from mutable memory or dispatches another turn to resolve uncertainty. The status token binds execution, controller epoch, material state, target, controls and retained unsent replies. Replay checks canonical identity before current eligibility.

| Requirement | Evidence |
|---|---|
| AC-ACT-02: separate reply, resume and verify | Real engine/Git/provider-subprocess tests exercise literal reply, no-message continuation, already-complete unsent retention, explicit acknowledgement and paused advancement. Existing phase-handoff and browser suites retain the completion-check and billing boundaries. |
| AC-ACT-03: routine existing controls | Existing pause, continue, settings and outside-confirmation browser/API paths enter the journal; settings receipts retain the resulting values. Existing eligibility/authority checks remain in the engine. |
| AC-ACT-04: stale/repeated requests | Command integration tests cover changed stop, epoch restart, execution replacement, canonical-input conflict, concurrent instructions, automatic recovery exclusion and original-target browser replay. A shipped-browser test loses the accepted response and asserts the next explicit retry sends the original ID/token and creates only one turn. |
| AC-ACT-05: durable effects | Real file/HTTP/process boundaries with injected write failures before intent, after provider stdin, during completion acceptance and during receipt settlement. Tests prove either no dispatch, correlated settlement, or persistent uncertainty that blocks another dispatch. Provider history correlation rejects a wrong conversation, old timestamp and different prompt, and does not rewrite the session record. |
| AC-CLI-01–03 and AC-SEE-03/07 | Packaged help/contracts expose mutations and receipt lookup. Built CLI tests exercise file/stdin identity, Unicode/quotes/literal shell metacharacters, invalid UTF-8/NUL/oversized/empty input, duplicate JSON fields and receipt-query exits. Existing inspection suites cover authenticated discovery and closed-controller projections. |
| AC-CLI-04: actual bot caller | Grok Bot 0.75.8 used shipped help and the built CLI from `/private/tmp` against two concurrent disposable controllers. Actual caller evidence below covers reply, no-note resume, history, replay, stale refusal, unsent retention and explicit advancement. |

Focused durable-command integration run: **15 passed**, including admission reconciliation of a previously persisted effect. TypeScript and Svelte checks: **0 errors, 0 warnings**. The final full gate results follow.

The fresh deliverable review found and the implementation corrected persisted-versus-memory reconciliation, asynchronous history overwrite, dispatch uncertainty, advance/unsent correlation, browser replay ordering, help wording, settings outcomes and definite spawn-failure handling. The separate test-hardening review added automatic recovery exclusion, positive/negative provider-history correlation and the actual browser lost-response retry test. Full-suite runs also exposed two test synchronization races: simulated sleep now waits until Kiln has read the last pre-sleep assistant message, and the legacy Pause exercise waits until automatic startup has released control. Assertions and production behavior were preserved. No production run or production repository was used for proof.

## Final repository and installed-package gates

`npm run verify` passed on the final implementation and synchronized tests:

- Dependency audit: zero blocking high/critical findings; ESLint passes.
- TypeScript and Svelte: zero errors and zero warnings.
- Unit suite: 624 tests pass across 42 files.
- Codex provider-contract suite: 17 tests pass.
- Integration suite: 778 tests pass, two skipped, across 64 files; 525.43 seconds.
- `npm run test:package`: all five tests pass against the packed, globally installed tarball in a disposable prefix; 10.09 seconds.

Machine-local final logs: `/private/tmp/kiln-bot-control-final-verify.log` and `/private/tmp/kiln-bot-control-final-package.log`. The earlier failing runs were diagnosed and fixed; the counts above come from a complete clean rerun, not a combination of selective passes.

## Actual provider-boundary proof

Both disposable controllers were live concurrently under isolated `XDG_STATE_HOME=/private/tmp/kiln-bot-control-release-state`. Commands invoked the built `dist/cli.js` from unrelated `/private/tmp`. Each repository has its own local bare Git origin. Existing provider authentication was used; no sign-in, spending permission or delivery authority was added.

| Provider | Configuration | Observed result |
|---|---|---|
| Codex CLI 0.162.1 | `gpt-6.1-sol`, high effort; local session `11900415-65e8-45a9-a636-fab5e06b68ff`, provider thread `01a17c87-c430-7f01-b9c6-29f6fdfe602a` | Terminal discussion marker survived no-message resume. Literal reply was recorded unchanged and confirmed in provider-owned history. Same-ID replay created no second turn. |
| Claude Code 2.1.311 | `haiku`, high effort (effective `claude-haiku-5-5`); conversation `ce0a02ff-cb2b-4f70-8d40-cf9a30fd518d` | Terminal discussion marker survived no-message resume. Literal reply was recorded unchanged and confirmed in provider-owned history. Same-ID replay created no second turn. |

Codex proof command IDs: resume `8194bdaa-6979-4ab9-a733-c3c22cf5488f`, reply `a5ab66c2-7f67-42cd-8ae1-f154880b451f`. Claude proof command IDs: resume `7903121f-b15c-43b5-a442-3c38b938de51`, reply `e9bb64eb-6b7a-46f6-a44e-4a9696a90db3`.

Reproducible drivers are `scripts/proof-run/bot-control-provider-fixture.mjs`, `bot-control-controller.mjs` and `bot-control-provider-proof.mjs`. Each script's header documents invocation. The proof checks exact stored notes, provider result markers, provider-history delivery and attempt counts; model text alone is not treated as delivery evidence.

Machine-local artifacts retained from the completed demonstration:

- Fixture manifests: `/private/tmp/kiln-bot-control-release-state/codex-fixture.json` and `claude_code-fixture.json`.
- Provider result summaries: `/private/tmp/kiln-bot-control-codex-proof.log` and `/private/tmp/kiln-bot-control-claude-proof.log`.
- Each fixture root retains its terminal discussion and `provider-control-proof-result.json`; each isolated state directory retains the authoritative session attempts and control receipts.

The two disposable controllers were stopped cleanly after the completed Grok demonstration; both processes exited successfully and their instance locks were released. Conversations, receipts and evidence remain intact. Restart a fixture only with `bot-control-controller.mjs`, its manifest and the isolated state-root argument.

These are machine-local scratch artifacts, not portable repository dependencies. The repeatable scripts and the result/configuration summary above are retained in Git when this implementation is committed.

## Actual Grok Bot caller demonstration

Completed on 2026-10-27 using installed **Grok Bot 0.75.8**, task **Kiln control release proof**, and its normal Mac terminal runner. Caller model and reasoning configuration were not exposed by the app or bot; its existing default configuration was used without changing settings. The bot read root/leaf help, constructed commands itself and invoked the absolute built CLI from unrelated `/private/tmp`. Both controllers used the provider versions/configuration above. No provider sign-in, account change, new spending permission or production run was involved.

| Actual caller exercise | Recorded result |
|---|---|
| Concurrent discovery and exact stop | One inventory response contained two reachable controllers: Claude working and Codex at Needs you. The bot retrieved the stopped phase, exact final marker, failed completion check, continuation details, output and phase conversation/attempt history. |
| Terminal discussion and no-note Resume | `grok-resume-codex-1793104002` completed as `session_resumed`; the terminal decision marker survived. Claude was separately resumed while Codex stayed stopped. |
| Literal reply and replay | `grok-reply-codex-1793104030` delivered the normalized text with quotes, Unicode and literal `$(echo literal)`. Replaying the identical ID/token/arguments returned its original receipt; Codex stayed at five attempts. |
| Stale instruction | `grok-stale-codex-1793104069` was refused with `stale_status_token`, exit 3, without another attempt. |
| Existing pause eligibility | Requesting pause while stopped was refused as `control_unavailable`. During one subsequent no-note resume, the bot polled for offered control and submitted `grok-pause2-codex-1793104277`; the pause request persisted and both receipts completed. |
| Already-complete reply | After the driver closed and committed/pushed only the disposable phase to its local bare origin, `grok-unsent-reply-codex-1793104539` completed as `phase_already_complete`: reply `not_sent`, session `not_started`, plan `not_advanced`. The exact retained text was `Retain this unsent reply: "blue" 🐦 $(echo literal)`. Attempts remained six. |
| Explicit acknowledgement and advancement | `grok-verify-noack-codex-1793104559` was refused as `unsent_reply_acknowledgement_required`. With fresh status and `--without-sending-reply`, `grok-verify-ack-codex-1793104572` completed as `advanced`. Phase completion and the unsent receipt reference the same operation `ba76bcbe-3a70-4bd9-92ea-16291c7d9aad`; text remains retained and not sent. |
| Verify replay and final history | Identical original verify arguments returned the same operation, with unchanged phase history and six attempts. Claude was unaffected by this segment. No audit/provider session was launched. |

The disposable PRD deliberately has minimal acceptance-criterion syntax. After the single successful advancement, existing audit-readiness validation stopped it at Needs you because that syntax is not audit-compatible. Its pause remained **requested, not active**; the demonstration does not claim an active pause. The fixture was not repaired and no further resume/check-again was attempted. Automated real-engine tests separately prove active pause after advancement. This observed fixture stop does not alter the successful control receipts or bypass the existing audit gate.

The implementing agent independently checked the saved journal and PRD/session files: exact unsent text/effects, acknowledgement-operation correlation, one completion, replay identity, unchanged six attempts and the concurrent inventory all passed. The app visibly confirmed completion. Machine-local command/output evidence is under `/private/tmp/kiln-bot-control-grok-evidence`: `16-inventory-one-working-one-needs-you.json`, `21-seg3-log.txt`, `27-unsent-reply.txt`, `29-verify-without-ack.txt`, `30-verify-with-ack.txt`, `33-replay-verify.txt`, and `37-FINAL-EVIDENCE-SUMMARY.md`. Raw account-bearing output is intentionally not copied into Git; this configuration/result summary is the durable release evidence.

## Closeout

The normal full `npm run verify` and installed `npm run test:package` gates passed as recorded above. The full gate uses the already-installed qualified Claude Code 2.1.307 through a temporary PATH entry for the repository's existing billing qualification tests; it does not change the user's default 2.1.311 installation. Only documentation and a proof-script invocation comment changed after that gate.

Both implementation phases are closed. Whole-PRD delivery audit follows completed integration in a fresh chat, then whole-PRD test audit; neither is performed by this implementation session. The existing hold on integration/push remains in force.
