<!-- Before editing, load the assumptions-document-writing skill. For stakeholder
feedback, also load assumptions-document-feedback. Keep one Last Updated line;
remove superseded wording rather than layering history. IDs are permanent. -->
# Kiln billing safeguards — business assumption

**Last Updated:** 2026-10-25

**Status:** Draft — pending business validation.

This document contains the one proposed business choice not settled by the launch discussion. The [PRD](kiln-billing-safeguards-prd.md) proceeds with it for review. Subscription-overflow behavior is already decided and is defined directly in AC-BILL-02–03.

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
