# Codex support for Kiln — Business assumptions

<!-- EDITING THIS FILE? Load the assumptions-document-writing skill first.
Keep one Last Updated line. Remove superseded entry text; Git holds its history.
Assumption IDs are permanent and must never be renumbered. -->

**Last Updated:** 2026-10-23
**Status:** Validated — no open business assumptions

Doug settled authentication and default model choices on October 22, 2026, and native cleanup scope on October 23, 2026. The decisions are incorporated into the [PRD](kiln-codex-support-prd.md); no items remain pending.

## Validated Assumptions

| ID | Decision | Validated | Notes |
|---|---|---|---|
| AUTH-001 | Use Codex's existing ChatGPT authentication, completed before launching Kiln; API-key-only accounts remain outside this release. | 2026-10-22 | Confirmed by Doug in this chat; incorporated into PRD AC-AGENT-03. |
| UI-001 | Default to the latest available GPT Sol version, currently GPT-6.1-Sol, with High effort. | 2026-10-22 | Corrected by Doug in this chat: “use the latest version of GPT Sol” and “High effort”; incorporated into PRD AC-MODEL-02. |
| RECOVER-001 | Strengthen native Codex cleanup while keeping Kiln lightweight. Stop the conversation and tracked commands; explain that independently detached programs may survive and should be checked before resume. Do not introduce a privileged helper or isolated execution architecture for this release. | 2026-10-23 | Doug in chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “finish strengthening native cleanup first”; a warning “maybe ... would be okay in the meantime”; “I don't want to do anything that would substantially change the architecture”; “Let's try to keep things lightweight.” AC-RECOVER-01 now states the limited native stop contract; implementation must validate the strengthened cleanup and truthful guidance. |
