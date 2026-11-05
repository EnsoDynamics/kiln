<!-- EDITING THIS FILE? Load the assumptions-document-writing skill first.
     Superseded text comes out; version control holds it. Keep one Last Updated
     line and permanent assumption IDs. -->

# Kiln bot control — business assumptions

**Last Updated:** 2026-10-26
**Status:** Pending business validation

These are the proposed choices where Doug's request left a product boundary open. The [PRD](kiln-bot-control-prd.md) proceeds on them; correct any if it does not fit the intended workflow.

## SCOPE-001. Which commands and help should the first release expose?

**Assumption:** Cover **runs already started**: inspect status/output, reply and resume, request/cancel pause, continue, verify finished phases and recheck other recovery states, change keep-awake and automatic usage recovery, confirm outside-workspace handling. **New-run setup and new spending/deployment authority stay in the browser.** The new bot-control commands provide readable text, structured JSON and the documented result/exit contract. Every existing and new command gets discoverable help in text and JSON. Existing `run`, `add-repository`, `audit` and `delivery` keep their execution output formats and exit statuses.

**Evidence:** Doug said “once I have it started” and narrowed “anything” to the main actions that keep work moving. The older idea mentions every browser action, but the current request favors this bounded workflow. Including initial setup would add document selection and authority choices the errands example does not need. The current helpers already have distinct execution contracts: audit and delivery emit JSON with their existing success/failure exits, while add-repository emits readable text. Extending their help makes them discoverable without changing how existing callers execute them.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — preferred control or help boundary: _______________

**Confidence:** 85% | **Impact if Wrong:** 🟡 MEDIUM — changes the command and acceptance-test surface.

## OUTPUT-001. Should logs count saved entries, and how much should one request return?

**Assumption:** Default to the **latest 50 saved numbered output entries**. The public word “line” and `--max-lines` count one such entry, which can contain several lines of text. Keep a hard **16 KiB cap on the entire stdout response**, including headers or JSON metadata and escaping. Allow an explicit request for up to **200 entries**, still within that byte cap; fetch older output through separate pages. An entry too large to fit is returned in marked fragments without losing content. For example, one saved assistant message containing three paragraphs counts as one entry, even when its text contains several newlines.

**Evidence:** Doug requested a small response from the most recent logs and warned that a whole log would be too large. Kiln already saves whole assistant and tool blocks as individually numbered entries (`src/session/session-output.ts`, `SessionOutputReader.readEvent`); their text can contain newlines. Counting those entries keeps their existing identity and paging boundaries, while the byte cap bounds the actual response size. Counting every newline separately would change that unit and split saved messages. The proposed counts and byte cap were not specified by Doug; they balance nearby context against filling the bot's conversation with output.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — preferred counting unit, default or cap: _______________

**Confidence:** 80% | **Impact if Wrong:** 🟡 MEDIUM — changing the counting unit affects output paging, help and acceptance examples; changing the sizes alone adjusts defaults.

## Settled scope decisions

| ID | Decision | Source |
|---|---|---|
| ACCOUNT-001 | Retired: Kiln-managed provider sign-in and shared-login holds are outside this PRD. Account/usage visibility and existing recovery checks remain. | Doug, 2026-10-26, scope correction in technical-design chat `01a17a7d-36f1-7f10-a812-5f95eec308a2`. See PRD Out of Scope. |
