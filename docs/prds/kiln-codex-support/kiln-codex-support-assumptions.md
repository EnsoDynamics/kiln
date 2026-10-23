# Codex support for Kiln — Business assumptions

<!-- EDITING THIS FILE? Load the assumptions-document-writing skill first.
Keep one Last Updated line. Remove superseded entry text; Git holds its history.
Assumption IDs are permanent and must never be renumbered. -->

**Last Updated:** 2026-10-23
**Status:** Draft — pending business validation

These are the product choices the request did not settle. The [PRD](kiln-codex-support-prd.md) proceeds on them unless corrected; no answer is needed to finish its design.

### AUTH-001. Is ChatGPT sign-in sufficient for the first Codex release?

**Assumption:** This delivery supports Codex signed in through ChatGPT. It does not support API-key-only accounts or other model providers. A person using those modes gets a clear explanation before work starts.

**Evidence:** The request emphasizes matching the current Claude subscription workflow, including usage limits. The existing Kiln account panel centers on signed-in accounts and subscription allowances. The installed Codex account and usage metadata worked with ChatGPT sign-in. The request did not explicitly choose an authentication scope, and Codex also supports API-key use.

**Confirm or Correct:**
- [ ] Correct — ChatGPT sign-in is enough for this release.
- [ ] Wrong — support API-key-only Codex use in this release too.
- [ ] Wrong — different scope: _______________

**Confidence:** 85% | **Impact if Wrong:** 🟡 MEDIUM — adds account modes and different usage/billing expectations.

### UI-001. Which model and effort should selecting Codex initially choose?

**Assumption:** Select the default model and that model's default reasoning effort reported by Codex. Show both before Start, and let the person change either. Keep Claude Code's existing initial settings unchanged.

**Evidence:** The user requires model and effort selection but names no default. Codex supplies a recommended model and a per-model default effort. The live reading recommended GPT-6.1-Sol with low effort, while other listed models reported medium. Using these reported values stays current; the plausible alternative is carrying Kiln's high-effort preference into Codex.

**Confirm or Correct:**
- [ ] Correct — start with Codex's reported defaults.
- [ ] Wrong — default to high effort when supported, using Codex's default model.
- [ ] Wrong — different defaults: _______________

**Confidence:** 75% | **Impact if Wrong:** 🟡 MEDIUM — changes the initial quality, latency and usage tradeoff for unattended work.
