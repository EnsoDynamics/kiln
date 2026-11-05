# Kiln Needs you handoff implementation validation

**Scope:** The whole [Clear handoffs on Kiln’s Needs you page PRD](kiln-needs-you-handoff-prd.md), both Claude Code and Codex. No phase split. Implementation followed the recorded decision to proceed without another design-refinement round.

## Acceptance evidence

| Criteria | Evidence |
|---|---|
| AC-PAGE-01, AC-PAGE-02 | `phase-handoff-browser.integration.test.ts`: verbatim escaped message, identity, message/reply/terminal/return ordering; desktop and 390px layouts for both providers; unavailable-history output fallback. |
| AC-REPLY-01 | Browser checks the direct-reply-only payload; `resume.integration.test.ts` asserts note-first production prompt composition; real Claude and Codex proofs retain the same conversation and deliver the reply. |
| AC-TERMINAL-01, AC-TERMINAL-02 | Browser verifies the exact copied saved command causes no request, renders terminal exit and optional requirements-recording guidance. Real provider proofs reopen each conversation independently in the installed CLI and exit before Kiln resumes. |
| AC-RETURN-01 | Browser omits the draft from the no-reply request; real-Git resume tests permit open/uncommitted/unpushed work; actual provider proofs recover the terminal-only decision marker. |
| AC-RETURN-02 | Real HTTP/Git precheck leaves the phase stopped with no Done event or model turn; explicit advance reevaluates changed/unreadable evidence. Real browser/engine test exercises choice, back, retained reply, explicit advance and resulting screen. Both actual providers start no turn for complete prechecks. |
| AC-RETURN-03 | Browser preserves exact drafts through output navigation, connection loss, failed checks, choice/back and deferred refusal of the same actual attempt; a new turn does not inherit the draft or an old response. |
| AC-VERIFY-01, AC-VERIFY-02 | Real HTTP/Git verifies only, accepts once and respects pause. Browser asserts current dynamic denominator and check time. Billing-held completion uses actual phase rows/time and advances without authorizing another model turn. Existing outside-workspace and multi-repository suites preserve conditional rows and repository facts. |
| AC-VERIFY-03 | Unavailable real worktree/origin and injected required delivery-source failure preserve old rows/time with `check_unavailable`; retry refreshes evidence. Injected completion-record write failure preserves stop and billing hold in memory and on disk, without Done or dispatch. |
| AC-VERIFY-04 | Real HTTP malformed/stale/competing requests and mutation guards; browser pending/disconnected controls and stale-response rejection; accepted completion cannot run twice. |
| AC-COMPAT-01, AC-COMPAT-02 | Existing billing, Codex workspace/history, usage-limit wait, restart/interruption, audit, final-delivery, outside-workspace, split-plan and multi-repository suites. Manual clients now submit the current target; automatic recovery remains on its existing dispatch path. |

## Actual installed-provider handoffs

On 2026-10-26 the opt-in `scripts/proof-run/phase-handoff-provider-proof.mjs` passed for both installed providers. It creates disposable repositories and local bare origins, starts a real conversation through the production adapter, independently reopens it through the provider CLI, then submits requests through the production local HTTP server and Engine. Its prompts are checked in separately. Only the proof driver edits its fixture; no remote repository is pushed and no deployment runs.

| Provider | Local session | Provider conversation | Result |
|---|---|---|---|
| Claude Code | `3158ec40-6c90-4815-96e5-923789af3ffe` | Same ID | Terminal decision retained on no-reply resume; direct reply and decision retained; complete precheck and Verify add no model turn; exactly one completion event. |
| Codex | `3694f72e-7f45-4b78-a270-a411482889aa` | `01a17a37-fa8a-75b2-b9cc-d46941c05fbd` | Same assertions passed through installed Codex 0.162.1. |

Each proof recorded three Kiln-managed runs: initial, no-reply resume, direct-reply resume. The independent terminal discussion is provider history, not a fabricated Kiln run. Reproduce after `npm run build` with `node scripts/proof-run/phase-handoff-provider-proof.mjs claude_code` or `codex`, using the normal signed-in provider. The script prints its disposable artifact directory, including `proof-result.json` and terminal evidence. Existing documented platform/protocol limitations remain unchanged.

## Review and suite gate

Independent deliverable review identified deferred-refusal draft loss, required-source error classification and the advancement notice race; these were corrected. Independent test-hardening assessment added billing-held acceptance/write rollback, late-response isolation and rendered timestamp assertions. A final compatibility regression also confirms that accepting a reopened historical phase clears its recovery stop while preserving original completion facts. No new business assumption was needed.

Final checks on 2026-10-26:

- `npm run verify` passed: dependency audit (zero blocking high/critical findings), ESLint, TypeScript/Svelte checks (zero errors/warnings), 604 unit tests, 17 Codex protocol proofs, and 719 integration tests across 61 files. Two existing conditional platform tests were skipped. The integration run took 338.72 seconds.
- `npm run test:package` passed all four package smoke tests in 12.43 seconds.
- Product visuals: all 12 combinations of provider, initial/complete-choice/unavailable-history state, and 1200px/390px width were inspected. The Codex fresh-session fixture command was corrected and both affected screenshots regenerated and reinspected.
- All 14 criteria have evidence above; changed relative Markdown links resolve; staged whitespace, credential-pattern and expected-path checks passed.

The retained provider-proof script is an opt-in reproducible integration check, not part of normal credential-free CI. Local proof artifacts are disposable and their locations are printed by the script.
