<!-- Before editing, read assumptions-document-writing, including Editing an Existing Document. -->
# Live session control — business assumptions

**Last Updated:** 2026-10-26

These proposed choices accompany the [PRD](kiln-live-session-control-prd.md). Work proceeds on them unless corrected; neither is recorded as stakeholder-approved.

### PAUSE-001. May takeover interrupt the current tool rather than finish its batch? ⏳ PENDING — 85%

**Assumption:** Pause & take over means an orderly interruption followed by exclusive terminal access. It may cancel the current tool. Finishing a particular batch first is a message to Claude, not a guarantee of the pause button.

**Evidence:** Doug asked for a “safe point” and a resumable conversation. The existing stop mechanism and the real 2026-10-26 probe cancel a running tool while retaining history. A job-specific finish-the-batch pause would require cooperative interpretation and could take arbitrarily long. The proposed interpretation makes safety mean no simultaneous session owners and retained work, not transactional completion of outside operations. This is the product meaning that needs validation, not a claim that interruption is harmless.

**Example:** For the motivating test audit, send “finish this batch, merge into develop and push, then carry on” to steer it. Choose Pause & take over when prepared to inspect and recover an interrupted test/tool in the terminal.

**Impact if wrong: HIGH.** A person expecting a batch to finish could interrupt work they meant to preserve. A required finish-current-operation boundary changes pause semantics and must be proved before implementation.

**Confirm or Correct:**
- [ ] Correct — controlled interruption with the visible warning.
- [ ] Wrong — wait for a safe completed-operation checkpoint before stopping.
- [ ] Wrong — different behavior: _______________

### SCOPE-001. Deliver live controls for Claude phases and audits first? ⏳ PENDING — 90%

**Assumption:** This bounded change covers Claude implementation phases, delivery audits and test audits. Codex and final-delivery sessions keep their current controls, with an explicit reason when live controls are unavailable.

**Evidence:** Doug named those three activities, the Claude input pipe, and the exact `claude --resume` command. The earlier Needs you flow supports both providers, but that alone does not establish live input support or equivalent interruption behavior for Codex. Including it without a provider investigation would enlarge this change beyond the evidence supplied.

**Example:** A running Claude test audit offers both live actions; a Codex test audit retains its existing deferred pause and recovery controls.

**Impact if wrong: MEDIUM.** Provider parity adds investigation, design and release evidence before these controls can ship for every run.

**Confirm or Correct:**
- [ ] Correct — Claude phases and audits first.
- [ ] Wrong — include Codex live sessions too.
- [ ] Wrong — different scope: _______________
