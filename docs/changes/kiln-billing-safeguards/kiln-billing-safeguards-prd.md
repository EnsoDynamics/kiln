# PRD: Kiln billing safeguards

**Status:** Draft for product review; implementation has not started.

**Source:** Doug's public npm launch review and subscription-overflow decision, 2026-10-25. [Mockups](mockups/kiln-billing-safeguards-mockups.html) · [Business assumption](kiln-billing-safeguards-assumptions.md)

## Summary

Before Kiln starts or resumes AI work, show how Claude will be billed and require an explicit choice if it will use API or other separately billed provider access. A subscription account continues normally, including when the user has enabled paid overflow in their own Claude account. When that setting is available, Kiln points it out without asking for another approval.

This is a bounded safeguard for public npm distribution. Kiln continues using the user's installed CLI and credentials. It does not introduce its own sign-in, billing service, or replacement execution engine.

## Business Context

Kiln currently displays the signed-in account and plan, but a successful sign-in does not establish how a headless run will be billed. For example, an API key inherited from the user's terminal can override subscription access. A subscription-looking screen can therefore precede separately charged work. Publishing quietly to npm does not make the package private or remove that exposure for pilot users.

Two different cases need different treatment. An unexpected API/provider override requires a deliberate choice in Kiln. Paid overflow already selected in Claude's own account settings is the user's existing choice: Doug explicitly rejected a second confirmation or alarming warning when Kiln cannot read that setting. Kiln must not imply that subscription use is always free of additional charges.

The launch review found no need to replace Kiln's current local CLI architecture. This PRD addresses billing visibility and authorization; it is not a claim that Anthropic requires this particular UI or that the change alone completes all npm release preparation. Official sources and the limits of the investigation are below.

## Acceptance Criteria

### Show How Claude Will Be Billed

The user should see the billing route the next run will actually use, rather than infer it from a plan name. Here, **billing route** means subscription access or separately billed API/provider access; **paid overflow** means additional usage enabled within a Claude subscription account.

- [ ] **AC-BILL-01 — The billing summary describes the next run.** Wherever Kiln offers to start or resume Claude work, it shows the effective billing route and provider, the account or organization when reliably available, and the source of any billing override. Classification accounts for the actual launch environment and applicable CLI settings, including credential helpers and alternate providers; the presence of a signed-in subscription alone is insufficient. Unavailable payer identity is stated honestly and is not replaced with the subscription account's email.
  - Replaces in part: AC-START-06 and AC-WATCH-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (account information gains effective billing information).

- [ ] **AC-BILL-02 — Each billing case has one clear treatment.** Start and resume follow this table after the existing non-billing readiness requirements have also passed. Metered access means API or provider access charged separately from Claude subscription usage.

  | Effective billing case | What the user sees | Permission to launch AI work |
  |---|---|---|
  | Claude subscription; paid overflow disabled | “Claude subscription” and “Billing follows your Claude account settings.” | No billing approval needed |
  | Claude subscription; paid overflow enabled | Subscription summary plus a factual, non-blocking notice: “Paid usage is enabled in your Claude account. Your account's spending limits apply.” | No billing approval needed |
  | Claude subscription; paid-overflow status unavailable | Normal subscription summary; no uncertainty alarm, waiver, or spending-settings confirmation | No billing approval needed |
  | Recognized, otherwise supported metered route | Provider, credential source, separate-billing explanation, and unticked approval choice | Requires AC-BILL-04 approval |
  | Effective route cannot be established, evidence conflicts, or no usable authentication | Specific reason and a way to recheck after fixing it | No AI work; there is no “continue anyway” override |
  | Route or provider already unsupported by Kiln | Existing compatibility explanation | Billing approval does not make it supported |

- [ ] **AC-BILL-03 — Paid-overflow information stays factual.** Kiln uses trustworthy status reported for the same subscription account when available. Unknown, missing, stale, or unreadable overflow data never becomes “disabled” and never prevents a confirmed subscription route from running. A known enabled setting has a non-blocking amber notice and a link to Claude's usage settings. Kiln neither changes that setting nor asks the user to accept its risk.

### Ask Once for Deliberate API Billing

A user intentionally using separately billed access can continue. Approval should be specific enough to prevent an old choice from silently authorizing a different provider or another PRD.

- [ ] **AC-BILL-04 — Metered billing needs a deliberate choice.** Before the first model request on a metered route, an initially unticked choice says “Use API billing for this PRD” for direct Anthropic API access, or “Use [provider] billing for this PRD” for another supported provider. Its adjacent text explains that charges are separate from Claude subscription usage and identifies the detected source, such as `ANTHROPIC_API_KEY`, without revealing its value. Approval is bound to the billing information the user reviewed; a changed reading cannot silently inherit a click on an older screen.

- [ ] **AC-BILL-05 — Approval lasts for this PRD's current execution.** Approval covers subsequent phases, related AI delivery work, and resumes of the same execution, including after a Kiln restart, only while the confirmed billing context remains the same. A different provider, credential source, known payer identity, or detectably changed credential requires new approval. Switching away from that metered context invalidates its approval. A separate PRD or a new execution after completion never inherits approval. The user can clear approval whenever no AI session is running. This duration is proposed in **BILLING-001** in the [assumptions document](kiln-billing-safeguards-assumptions.md).

- [ ] **AC-BILL-06 — Existing settings remain under the user's control.** Kiln does not remove credentials, rewrite provider settings, disable available CLI authentication methods, or silently select another billing route. An API override explains where it came from and tells the user to change that source and recheck if they intended subscription use. Rechecking is separate from approving and does not start AI work.

### Apply the Same Rule Throughout a Run

Billing protection must survive an unattended run and a restart. The screen explains why work is held, while existing progress and recovery behavior remain available.

- [ ] **AC-RUN-01 — Every AI launch gets a fresh billing check.** Kiln checks the effective context immediately before every model-consuming launch or resume, including phases, pull-request work, audits, and other AI helpers. Previously displayed or persisted metadata is not sufficient. The check itself makes no model request. While it is pending, the screen says “Checking billing…” and cannot launch AI work. A changed context is evaluated under AC-BILL-02 and AC-BILL-05 before launch, including after an application upgrade or restart.
  - Replaces in part: AC-WATCH-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (billing readiness is checked before every AI launch, alongside existing account refreshes).

- [ ] **AC-RUN-02 — A blocked continuation preserves the work.** Before the first run, a billing issue keeps Start unavailable and explains the required action beside it. Once work is underway, an unknown route or unapproved metered route holds the next AI launch at Needs you, retaining the recorded session and completed work. The screen shows the cause, current billing details, and a recheck action; Resume becomes available only after the applicable billing and existing recovery requirements pass. Approving billing alone does not resume work.

- [ ] **AC-RUN-03 — Automatic recovery cannot bypass billing approval.** Usage-limit recovery, wake-from-sleep recovery, manual Resume, and Resume now all obey AC-RUN-01. If billing is not eligible, automatic recovery enters Needs you instead of retrying or launching. A newly signed-in subscription account needs no billing confirmation if its effective subscription route is established. Existing percentage-used warnings remain advisory; a missing usage percentage is not by itself an unknown billing route.
  - Replaces in part: AC-AUTO-02 and AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Claude resumes require billing eligibility even when the usage reset permits recovery).

- [ ] **AC-RUN-04 — The safeguard has a clear boundary.** These are launch-time checks, not a per-request billing firewall or a Kiln spending cap. A configuration change while a CLI session is already running does not automatically interrupt that session under this change; the next launch requires a fresh check. Purely local completion checks remain available and need no billing approval, but any AI work they would cause must pass AC-RUN-01. User-facing documentation describes this boundary and makes no zero-cost guarantee.

- [ ] **AC-RUN-05 — Running and disconnected views distinguish fact from history.** The account panel shows the billing route used to launch the current or most recent AI run and whether metered approval applies to this PRD. A newer reading that differs is labelled for the next run, without relabelling the active run. A disconnected view marks its billing information as last known and offers no actionable approval or launch controls. The terminal reports a billing hold and points to the browser for the required action; it does not prompt for credentials.

- [ ] **AC-RUN-06 — Billing checks do not collect credentials or broaden support.** Screens, logs, saved approval records, and diagnostic output contain no raw API keys, OAuth tokens, helper output containing secrets, or credential-store contents. Kiln continues invoking the user's unmodified installed CLI and does not implement its own Claude OAuth flow. Existing Codex ChatGPT-only eligibility and provider restrictions remain unchanged; this PRD does not authorize Codex API billing.

- [ ] **AC-RUN-07 — Public installation guidance explains the choice.** The npm-facing installation and usage documentation explains subscription access, accidental API/provider overrides, intentional metered approval, paid overflow, and the launch-time boundary in AC-RUN-04. It points users to their provider's own spending settings and describes what to do when the route cannot be established. The [mockups](mockups/kiln-billing-safeguards-mockups.html) show every new billing presentation and approval control in Kiln's existing visual language.

## Mockups

The interactive [screen gallery](mockups/kiln-billing-safeguards-mockups.html) is a design reference. Its example is an existing Kiln PRD; account identity and readiness values are illustrative. Existing delivery controls are abbreviated to focus on the added billing UI. Scenario navigation is outside the product UI.

| State | Requirements illustrated |
|---|---|
| Subscription ready | AC-BILL-01–03 |
| Paid overflow enabled | AC-BILL-02–03 |
| API approval required / approved | AC-BILL-04–06 |
| Billing unknown / checking | AC-BILL-02, AC-RUN-01–02 |
| Changed billing at Needs you | AC-BILL-05, AC-RUN-02–03 |
| Running / disconnected | AC-RUN-04–05 |

## Scope and Design Questions

In scope: effective Claude billing classification, scoped approval, checks at every AI launch, recovery behavior, account/billing presentation, and npm-facing guidance. No new billing service, provider support, SDK migration, spending cap, per-request interception, or broad redesign of setup and recovery screens.

The technical design must establish how to resolve the effective billing context without inference or credential disclosure for the supported CLI versions and launch directories. It must cover environment and settings precedence, credential helpers, alternate endpoints/providers, account changes, and what observable changes invalidate approval. Anything the supported interfaces cannot classify must follow the unknown-route case, rather than infer subscription use from the absence of one environment variable. A provider that cannot satisfy existing execution constraints remains unsupported.

The design must also validate paid-overflow metadata across supported versions. On 2026-10-25, a non-inference `/usage` check of installed Claude Code 2.1.307 returned `rate_limits.extra_usage.is_enabled` and optional spending fields. This establishes that detection is possible on that installation; it is not a stable-schema promise or proof that every account exposes the fields. Missing overflow metadata follows AC-BILL-03.

## Source Basis

Official sources checked 2026-10-25; recheck material provider-policy or CLI changes during implementation. These sources support the bounded product decision, not a legal guarantee or a general approval of every hosted integration.

- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance): guidance for unmodified Claude Code in third-party products, end-user authentication, and direct provider billing.
- [Using the Claude Agent SDK with a Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): subscription use for SDK/headless integrations. Read alongside the more general [Agent SDK authentication guidance](https://code.claude.com/docs/en/agent-sdk/overview), rather than assuming every SDK login integration is allowed.
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars): API credentials and provider settings can alter effective billing, including API-key precedence in headless use.
- [Managing usage credits for paid Claude plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): account-managed paid usage after subscription limits and spending controls.
- [Headless Claude Code](https://code.claude.com/docs/en/headless): headless behavior and changing authentication defaults need version-specific verification; this PRD does not require `--bare`.

Local investigation found that Kiln already executes Claude work through the installed CLI, while its account summary discards billing-method fields and its launch environment can retain provider overrides. The change addresses that gap; it does not presume that the existing inference path uses an SDK-managed subscription login.
