<!-- Before editing, load the assumptions-document-writing skill. For stakeholder
feedback, also load assumptions-document-feedback. Keep one Last Updated line;
remove superseded wording rather than layering history. IDs are permanent. -->
# Kiln billing safeguards — business assumptions

**Last Updated:** 2026-10-25

**Status:** Draft — pending business validation.

This document contains proposed business choices not fully settled by the launch discussion. The [PRD](kiln-billing-safeguards-prd.md) proceeds with them for review. Subscription-overflow behavior is already decided and is defined directly in AC-BILL-02–03.

## API Billing Approval

### BILLING-001. Should API approval last for the current PRD's entire execution?

**Assumption:** One explicit approval covers the current PRD execution, including later phases and restarts, while its confirmed billing context stays the same. A different billing context requires fresh approval; a different PRD or a new execution after completion cannot reuse it. The user can clear approval while no AI session is running.

**Evidence:** The purpose is to prevent accidental metered billing while preserving Kiln's unattended delivery and recovery. Doug distinguished an accidental API override from paid overflow deliberately enabled in Claude, but did not specify the duration of API approval. Existing recovery requirements carry the same PRD through usage waits and application restarts. Approval on every process start would repeatedly interrupt that flow; indefinite approval across unrelated PRDs would be broader than the choice shown on screen. The existing account and recovery requirements contain no API-approval duration to reuse.

**Example:** For the existing Kiln usage-limit recovery PRD, approving direct Anthropic API billing before work starts would cover a restart later in that same execution. It would not approve the separate Kiln billing safeguards PRD. This is an illustrative approval scenario, not a record of a real paid run.

**Confirm or Correct:**

- [ ] Correct — keep approval for the current PRD execution while the billing context stays the same.
- [ ] Wrong — require approval again after every Kiln restart.
- [ ] Wrong — different scope or duration: __________

**Confidence:** 90% | **Impact if Wrong:** High — the duration controls when separately billed AI work can proceed without another human action.

## Missing Billing Details

### BILLING-002. Should a working sign-in continue when additional billing details are unavailable?

**Assumption:** If authentication readiness passes and Kiln detects no API/provider override, unavailable additional billing metadata does not prevent Start or automatic recovery. Show a neutral Claude Code settings summary, with optional details, and require no acknowledgement. A detected override still requires approval even when other fields are missing or conflict with a subscription label. Authentication failure remains an actionable readiness error.

**Evidence:** Doug rejected the alarming, unresolved “billing unknown / needs attention” presentation and asked for reconsideration of the behavior, not just different words. He did not settle every incomplete-metadata case. Existing account handling accepts a successful sign-in without a plan name. The local CLI currently reports subscription authentication clearly, and its official CLI reference documents authentication-method categories; neither establishes how often other installations omit billing details. This proposal preserves normal use and asks only about concrete detected overrides. The alternative is to block or ask for confirmation whenever billing metadata is incomplete, which would add the friction Doug challenged.

**Tradeoff:** A custom or unreported override could escape detection and incur charges without a separate Kiln approval. This is a safeguard for detected overrides, not certification that every allowed run uses subscription billing. Technical design must still implement and validate detection for supported configurations and surface diagnostic failures; it cannot simply classify failures as subscription access.

**Confirm or Correct:**

- [ ] Correct — proceed normally after successful authentication when no override is detected; missing additional details require no checkbox.
- [ ] Wrong — require one explicit confirmation of the existing Claude Code settings when those details are unavailable.
- [ ] Wrong — different behavior: __________

**Confidence:** 90% | **Impact if Wrong:** High — this decides whether incomplete billing visibility can prevent otherwise working AI runs.
