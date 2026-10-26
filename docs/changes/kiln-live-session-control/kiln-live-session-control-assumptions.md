<!-- Before editing, read assumptions-document-writing, including Editing an Existing Document. -->
# Live session control — business assumptions

**Last Updated:** 2026-10-26

This proposed choice accompanies the [PRD](kiln-live-session-control-prd.md). Work proceeds on it unless corrected; it is not recorded as stakeholder-approved.

### SCOPE-001. Deliver live controls for Claude phases and audits first? ⏳ PENDING — 90%

**Assumption:** This bounded change covers Claude implementation phases, delivery audits and test audits. Codex and final-delivery sessions keep their current controls, with an explicit reason when live controls are unavailable.

**Evidence:** Doug named those three activities, the Claude input pipe, and the exact `claude --resume` command. The earlier Needs you flow supports both providers, but that alone does not establish live input support or equivalent interruption behavior for Codex. Including it without a provider investigation would enlarge this change beyond the evidence supplied.

**Example:** A running Claude test audit offers both live actions; a Codex test audit retains its existing deferred pause and recovery controls.

**Impact if wrong: MEDIUM.** Provider parity adds investigation, design and release evidence before these controls can ship for every run.

**Confirm or Correct:**
- [ ] Correct — Claude phases and audits first.
- [ ] Wrong — include Codex live sessions too.
- [ ] Wrong — different scope: _______________
