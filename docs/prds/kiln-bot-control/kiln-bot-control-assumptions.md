# Kiln bot control — business assumptions

<!-- EDITING THIS FILE? Load the assumptions-document-writing skill first.
     Superseded text comes out; version control holds it. Keep one Last Updated
     line and permanent assumption IDs. -->

**Last Updated:** 2026-10-26
**Status:** Pending business validation

These are the proposed choices where Doug's request left a product boundary open. The [PRD](kiln-bot-control-prd.md) proceeds on them; correct any if it does not fit the intended workflow.

## SCOPE-001. Which browser controls should the first release expose?

**Assumption:** Cover **runs already started**: inspect status/output, reply and resume, request/cancel pause, continue, verify finished phases and recheck other recovery states, change keep-awake and automatic usage recovery, confirm outside-workspace handling, and initiate subscription login. **New-run setup and new spending/deployment authority stay in the browser.**

**Evidence:** Doug said “once I have it started” and narrowed “anything” to the main actions that keep work moving. The older idea mentions every browser action, but the current request favors this bounded workflow. Including initial setup would add document selection and authority choices the errands example does not need.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — additional or excluded controls: _______________

**Confidence:** 85% | **Impact if Wrong:** 🟡 MEDIUM — changes the command and acceptance-test surface.

## ACCOUNT-001. What should happen to other runs sharing a subscription login?

**Assumption:** Changing a shared login requires **all affected Kiln sessions to be idle**. The user can request their ordinary pause first. Kiln holds automatic launches during login, then leaves each affected run **waiting for its own explicit resume or continue**, even if the login fails or is cancelled. Runs that were not affected carry on.

**Evidence:** Doug wants to choose another subscription after a limit. Existing recovery resumes using the account signed in at launch, and account state is shared outside a single PRD. A coordinated hold avoids changing another run's next account while the person is still authorizing it. Allowing active sessions to continue through the switch is an alternative, but its effect is provider-dependent and less predictable.

**Example:** Two stopped Claude PRDs share one login. Switching it for Customer returns also changes the next account for Shipping labels. The result names both; resuming Customer returns does not silently restart Shipping labels.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — desired handling of other runs: _______________

**Confidence:** 70% | **Impact if Wrong:** 🔴 HIGH — changes how shared account transitions and automatic recovery are coordinated.

## OUTPUT-001. How much recent output should one logs request return?

**Assumption:** Default to the **latest 50 lines**, with a hard **16 KiB cap on the entire response**. Allow an explicit request for up to **200 lines**, still within that byte cap; fetch older output through separate pages. A very long line is returned in marked fragments so it cannot defeat the cap or lose content.

**Evidence:** Doug explicitly requested a small response from the most recent logs and warned that a whole log would be too large. The proposed numbers balance enough nearby context to understand activity against filling a bot's conversation with terminal output. The exact numbers were not specified by Doug; they are tunable product defaults, not a measured optimal size.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — preferred default or cap: _______________

**Confidence:** 80% | **Impact if Wrong:** 🟢 LOW — adjust the documented defaults and corresponding acceptance examples.
