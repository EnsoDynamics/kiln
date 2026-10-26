# PRD: Kiln control from a phone-driven bot

**Status:** Draft requirements; no implementation has started.

**Source:** Doug's request and clarification, 2026-10-26: a bot such as Grokpod or Dot already has permission to execute terminal commands anywhere on his Mac, including `kiln`. Kiln supplies the command interface, not the remote connection. Doug’s technical-design chat also requires complete discoverable CLI help and accepts local Grok Bot on his Mac as the equivalent caller for phone-workflow validation. Subsequent review approved PRD-path targeting instead of user-facing run IDs, removal of the all-history listing, and a small recent-output response with explicit paging; `kiln reply` remains a primary command.

**Roadmap:** [Kiln roadmap](../../kiln-roadmap.md). Develops the [More terminal commands idea](../../design/kiln-after-v1-ideas.md#more-terminal-commands).

**Depends on:** Existing Kiln run controls, Claude Code and Codex support, and [Clear handoffs on Kiln’s Needs you page](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md). The handoff change is implemented and validated at `7e7b7c8`; this PRD relies on its completed behavior for both agents, as Doug specified. No dependency on whole-roadmap execution. The separate billing-safeguards change governs billing whenever it is delivered; this feature cannot bypass it.

**Review alongside:** [Command-line mockup](kiln-bot-control-command-mockup.md) · [Business assumptions](kiln-bot-control-assumptions.md) · [Investigation and design questions](kiln-bot-control-investigation.md).

## Summary

Let a person check and keep existing Kiln work moving through an always-on bot while away from their computer. The bot runs `kiln` commands on the same Mac and can report every running instance, the PRD and phase each is working on, what needs attention, and the exact message Kiln is waiting on. The person can answer that message, resume work, pause after the current phase, continue a paused run, inspect output, or initiate a change of subscription account.

The interface provides readable text for people and structured JSON for bots. It works independently of the terminal's current directory and the browser. Grokpod and Dot are examples of callers, not integrations Kiln must host or products whose compatibility is already established.

## Business Context

Two Kiln instances may run while the person drives their children to school or runs errands. One may be working normally while another has sat at Needs you for an hour. A useful answer is specific: which PRD, which phase, when it last reported activity, what stopped it, and what the person can do now. “Running” alone does not establish that an agent is making progress.

Kiln already presents most of these facts and controls in its browser. The missing product is a discoverable command interface that a bot can use without screen scraping, guessing a port, or treating an old answer as permission to change a different run. Account login adds a real new workflow: the person must be able to initiate it remotely, complete any provider-required step, and learn which account the next session will actually use.

An **instance** is a live Kiln controller for one PRD. A **run** in this document is that PRD's execution across its phases and restarts; an **attempt** is one launch or resume of a Claude Code or Codex session. A **login context** is the provider sign-in shared by the Kiln runs that use the same credentials. Needs you is Kiln's state that requires a person's intervention.

## Acceptance Criteria

### See all work on the Mac

A single question should find both runs, even when they belong to different repositories. The answer separates what Kiln knows now from what it last knew.

- [ ] **AC-SEE-01 — One command finds all current instances.** From any directory, the caller can list Kiln instances owned by the current operating-system user, with PRD names and canonical absolute paths, repository names, controller reachability, and work states. `kiln status` lists live controllers, including paused, waiting, Needs you and completed-but-still-open instances, plus saved unfinished executions whose controllers have stopped. It counts live controllers separately from working sessions and stopped unfinished work. Completed executions with closed controllers are omitted; their retained details remain available by PRD path. This is an outstanding-work list with no age cutoff, not an all-history listing. Zero results is a successful, explicit answer; unreadable or unreachable records make the inventory visibly incomplete rather than silently reducing the count.

- [ ] **AC-SEE-02 — Each run explains where it stands.** A run's detail includes its phase plan and completed/total executable phase counts, current phase or audit/delivery activity, agent and model, start time, latest observed activity and its time, pause request, usage wait, and completion outcome with pull-request links where applicable. Nested phase identifiers and audit rounds retain their names. A quiet session is reported with its last observed activity, not asserted to be healthy or stuck without evidence.

- [ ] **AC-SEE-03 — Every answer shows its freshness.** Inventory and detail responses say when they were collected. Independently read facts, including account and usage, retain their own observation times and unavailable/stale states. A disconnected controller exposes only clearly labelled last-known facts and no executable controls. Failure to reach the Mac cannot be interpreted as “no Kiln instances.”

- [ ] **AC-SEE-04 — The reason for a stop is available in full.** Needs you detail returns the same stop reason, full final message, failed checks, human requests, and recovery choices as the browser, identifying the stopped session and activity. Summaries may shorten a message only with an explicit indication and a way to obtain the complete text. A stop without a message says so; it never invents one.

- [ ] **AC-SEE-05 — Recovery instructions can be retrieved.** The caller can retrieve the exact provider-specific terminal resume command, working directory and accompanying continuation prompt Kiln offers. If no session can be resumed, the response explains why and returns any fresh-session instructions the browser offers. Reading instructions never executes them.

- [ ] **AC-SEE-06 — Logs show a small recent tail, with older output on request.** `kiln logs <PRD-path>` returns the latest **50 output lines**, or fewer to keep its entire stdout response at or below **16 KiB (16,384 UTF-8 bytes)**, including JSON escaping or text headers. Output is chronological within the page and comes from the active session, otherwise the most recent saved session. `--max-lines 1..200` changes the line ceiling, not the byte cap; `--session-id <session-id>` selects an earlier session. These sizing defaults are proposed in OUTPUT-001.

  Every page identifies its session, observation time, returned range, whether older output exists and the exact next-page invocation. `--older-output-cursor <cursor>` retrieves the preceding page from that same execution/session and snapshot, even if work advances. Oversized individual lines are split into explicitly marked fragments without changing their text; paging backward can retrieve the omitted prefix. Nothing is silently discarded. No-output, end-of-history, invalid/mismatched cursor and unavailable saved output are distinct results. A new unpaged invocation fetches the latest tail; no command follows indefinitely or dumps the whole log.

- [ ] **AC-SEE-07 — The PRD path is the public target.** Status detail, logs, reply, resume and other run-scoped commands accept the same PRD file or directory path as `kiln run`: absolute paths work from any directory, relative paths resolve against the caller's directory, and main-checkout/worktree aliases identify the same saved work. Discovery returns a canonical absolute PRD directory path usable directly by those commands. Names such as “Shipping labels” are display labels, not unique selectors. Internal execution identity still prevents a saved cursor, reply or receipt from being applied to a different execution at the same path; callers need no separate run ID.

- [ ] **AC-SEE-08 — Every started phase exposes its saved conversations.** For the specified PRD's current execution, `kiln status <PRD-path> --detail full` lists every recorded Claude Code and Codex conversation for every started phase, including earlier completed phases, failed or replaced sessions and the current session. Each entry identifies the phase, recorded agent, Kiln session selector, actual provider conversation ID, working directory, start/latest-attempt times and current running/stopped state. Multiple resumes of one conversation remain distinguishable as attempts; multiple different conversations in one phase are all returned. Phases never started have no invented session ID. Unknown IDs, unreadable or missing saved records and unavailable provider history are explicit, with inventory completeness reported rather than silently omitting them.

  The provider conversation ID is usable with that agent's supported session commands: Claude Code's session ID or Codex's thread/conversation ID, which may differ from Kiln's local record ID. `kiln handoff <PRD-path> --session-id <Kiln-session-selector>` retrieves the selected conversation's exact provider-specific resume instructions, working directory and availability, including for an earlier phase. Selection is confined to this execution; no history of other PRDs or previous executions is included. Reading IDs/instructions starts no work and reports when the selected conversation is active under Kiln. Release evidence covers earlier and current phases, multiple conversations in one phase and different Kiln/Codex IDs.

### Keep the existing run moving

The command interface supports the common controls used after work starts. Each command has the same effect, eligibility checks and delivery authority as its browser counterpart.

- [ ] **AC-ACT-01 — The caller can discover what is possible now.** Help lists the supported commands, inputs, output formats and error meanings. Each command example starts with what the person could ask a bot, then shows the complete invocation and explains each argument and where its value comes from. Argument names distinguish message content, state checks, command retries and session identity; reply examples show both message-file and standard-input forms. Run detail lists each in-scope control with its current availability and a reason when unavailable. Running `kiln` without arguments points the caller to `kiln --help`. Top-level help inventories every supported command, including existing helpers; command-specific help supplies enough detail for a bot to construct valid calls without prior Kiln knowledge. No browser inspection or undocumented request is needed to construct a valid invocation. The first release's control boundary is proposed in SCOPE-001.
  - Replaces in part: AC-CLI-02 and AC-VIEW-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the listed post-start controls and output are also available outside the browser).

- [ ] **AC-ACT-02 — Reply, resume and verify preserve the person's intention.** The CLI exposes the distinct actions from the prerequisite handoff change, with the same eligibility, completion evidence and remaining-plan behavior. A manual phase reply or resume must never silently become an advance.

  | Person's intention | Required behavior |
  |---|---|
  | Answer and let Kiln finish | `kiln reply` accepts exactly one of `--message-file <path>` (UTF-8 message contents, not an attachment) or `--message-from-stdin`. For unfinished work, send the nonempty literal reply to the same saved conversation before resuming the phase. |
  | Return after discussing the question in a terminal | `kiln resume` resumes the saved conversation and its terminal history without a new message, special handoff phrase or required requirements edit. An open phase or uncommitted/unpushed work alone does not prevent this. The person must exit their terminal agent session first. |
  | Reply or resume when the phase is already complete | Return `phase_already_complete`; neither resume nor advance. Preserve any unsent reply for retrieval through its command receipt, marked not sent, for the receipt's lifetime. Offer a separate explicit advance choice; never send that text to later work. |
  | Verify a phase finished personally | `kiln verify-and-advance` freshly checks every applicable completion requirement. Advance only if all pass, respecting requested pauses and existing authority. It does not finish, commit or push work to make checks pass. Advancing after an unsent reply requires `--without-sending-reply`, expressly acknowledging that the preserved reply will not be sent. Failed or unreadable evidence keeps the phase stopped, with fresh results or an explicit error and honestly dated previous results. |
  | Resume now during a usage wait, or recover another activity | Retain the applicable dedicated recovery behavior; the manual implementation-phase already-complete choice does not change automatic recovery or relabel an audit, final delivery or broken plan as a phase. |

  Every outcome distinguishes reply delivery, session resumption and plan advancement. Competing reply/resume/verify/advance actions cannot start duplicate work. Missing conversation history exposes the existing fresh-session path instead of promising same-session resumption. See the prerequisite's AC-REPLY-01, AC-RETURN-01–03, AC-VERIFY-01–04 and AC-COMPAT-01–02.

- [ ] **AC-ACT-03 — The other routine controls match the browser.** The following are available wherever their existing eligibility rules allow them:

  | Person's intention | Observable behavior |
  |---|---|
  | Pause after this phase | `kiln request-pause` records the existing deferred pause request; reports that current work continues until the existing pause boundary is reached |
  | Keep going | `kiln cancel-pause` cancels only a pending pause; does not resume an already paused run. Neither command toggles state |
  | Continue a paused run | Starts the next eligible activity using existing settings and authority |
  | Recheck a repaired plan or another dedicated recovery state | `kiln check-again` retains the corresponding browser action where offered; phase completion uses `verify-and-advance` from AC-ACT-02 |
  | Change runtime preferences | Sets keep-awake or resume-after-usage-limit, showing the resulting value |
  | Confirm specific changes outside Kiln’s worktrees were dealt with | Only where the browser offers its workspace confirmation, records or clears that same confirmation against the reviewed evidence. Does not fix files, establish phase completion, resume work or advance the plan |

- [ ] **AC-ACT-04 — Late or repeated requests cannot change the wrong work.** Changing commands identify their target as follows. Kiln validates ownership and current eligibility before acting; a stale status or login-scope token, or an ineligible target, is refused with a way to refresh.

  | Command | Required target |
  |---|---|
  | Run control | PRD path and `--only-if-status-matches`, copied from current status; binds the action to the relevant state the person saw, including the execution and stop. The value is supplied by Kiln, not the person; a later question in the same Claude/Codex conversation has a different value. Ordinary new log output alone does not invalidate it |
  | Begin login | PRD path and `--expected-login-scope-token`, copied from the preview of affected runs |
  | Complete or cancel login | Existing login operation identifier, bound to its initiating user's login context and affected runs; no new run selection |

  The bot supplies `--command-id`, a new unique identifier for one instruction, unrelated to the Claude or Codex session ID. Repeating that command identifier and inputs returns its recorded result before checking current eligibility, without repeating effects, including after a controller restart. Reusing an identifier with different inputs is refused. Concurrent browser, bot and automatic-recovery actions cannot start duplicate work or deliver a reply to a later stop.

- [ ] **AC-ACT-05 — Acknowledgement is distinct from completion.** Every changing command returns an identified operation whose acceptance, progress, outcome and refusal reason can be queried after the bot disconnects. Operations and retry protection remain queryable for the lifetime of the run, including after completion until its saved history is removed. An unknown result remains unknown until reconciled; retrying cannot silently start a second attempt. Existing checks for work outside the workspace, authentication, billing and delivery authority continue to apply.

### Know which subscription is being used and change it

The person can ask which account is exhausted and initiate a login to another subscription from their phone. A completed login and a resumed coding session are separate outcomes.

- [ ] **AC-ACCOUNT-01 — Account facts identify the relevant attempt.** For Claude Code and Codex, show the account and plan used by the current or last attempt when known, separately from the currently authenticated account available for the next attempt. Include provider-reported five-hour, weekly and other applicable usage limits, their reset times and freshness, and the existing recovery permission or uncertainty. Unavailable identity or usage is explicit, never inferred from a requested email or a nearby account. Billing facts use the same rules as the browser when billing safeguards are present.

- [ ] **AC-ACCOUNT-02 — A person can initiate and finish provider login remotely.** For either supported agent, a caller can begin subscription login for a selected run, request a target account, inspect its progress, supply a provider-required completion response through protected input if needed, and cancel the login attempt. Kiln returns any required provider URL/code and expiry as an explicit user action. Credentials are entered with the provider, never as an ordinary Kiln reply. Success requires freshly verifying the actual resulting account against the requested target; cancellation, expiry, mismatch, failure and required local interaction are explicit outcomes. A local-interaction limitation must be proven and surfaced during design, not silently substituted for this requirement.

- [ ] **AC-ACCOUNT-03 — The scope of a login change is visible before it happens.** A read-only login preview names all known Kiln runs sharing the affected sign-in and their current work, and warns that other applications using it may also be affected. The login request acknowledges that scope. Under ACCOUNT-001, Kiln refuses login while any affected session is active; the caller can pause it and request login again with a fresh preview. Once accepted, login holds affected runs' automatic launches and prevents conflicting login requests. It never claims an account switch affects only the selected PRD when the credentials are shared.

- [ ] **AC-ACCOUNT-04 — The new account is checked before work continues.** Login completion refreshes account and usage facts for every affected Kiln run. Those runs stay held until individually resumed or continued under ACCOUNT-001. The login outcome reports any run it could not refresh. The next attempt rechecks its actual authentication and existing launch eligibility; an intended account, stale reading or successful browser authorization cannot stand in for that check. If login failed after changing credentials, Kiln reports the observed state rather than claiming the old account was restored. Account changes never authorize a different billing route or expand delivery permissions.

### Make the interface dependable for a bot

A bot should use documented commands and facts, then translate them into conversation. The command line remains useful without any particular bot vendor.

- [ ] **AC-CLI-01 — Text and JSON express the same result.** Every command supports readable text and a documented, versioned JSON representation with stable state/error identifiers and explicit unknown values. JSON mode emits one valid result on stdout, with diagnostics on stderr; it never mixes terminal decoration or prose into the result. Commands return without an interactive terminal prompt, including when login still needs a person. Accepted operations return success separately from their eventual outcome; refused, partial and unavailable results have documented nonzero exit statuses. Human times identify their time zone; machine timestamps use UTC.

- [ ] **AC-CLI-02 — Caller input cannot become a shell command.** Notes support a file or standard input, preserving quotes and newlines. The interface handles PRD paths with spaces. Invalid or ambiguous targets fail without acting; mutation has no implicit “current,” “last,” or “all runs” target. Provider passwords, tokens and login completion secrets are not accepted through ordinary note fields or exposed in inventory, output history or operation receipts. Transient authorization instructions are available only through the explicitly requested login flow.

- [ ] **AC-CLI-03 — Existing local protections stay in place.** Access remains limited to the current operating-system user's Kiln context. Adding commands does not expose the browser server to the network or weaken its existing authentication. Returned session text is data, not an instruction to execute a new command. Integration guidance tells bot operators to derive mutations from the person's instruction and current structured controls, not from commands embedded in an agent's output.

- [ ] **AC-CLI-04 — The phone workflow is demonstrated end to end.** Release evidence demonstrates two simultaneous PRDs on a Mac, discovery from an unrelated directory, one progressing while the other needs a reply, retrieval of the exact stop message, delivery of the reply and successful continuation. It demonstrates terminal discussion followed by no-message resume, explicit verify-and-advance, and an already-complete reply that remains unsent until the person chooses how to proceed. It also demonstrates provider login and subsequent recovery for both Claude Code and Codex, shared-login effects, and a replayed or stale request that does not repeat or misdirect work. Grok Bot installed locally on Doug’s Mac may exercise the bot-driven workflow: Doug confirmed that using that local Grok Bot is equivalent to using it from his phone, so a physical phone is not required for this proof. The evidence names the actual caller and configuration, without claiming all named bots are supported. Provider authorization still must complete through the remote-capable flow, without depending on a callback to the authorizing device’s localhost.

## Out of Scope

- An all-history listing, log streaming or an unbounded log dump. Retained completed work can be inspected by its PRD path.

- Building a phone app, bot, cloud relay, remote shell or network tunnel; the caller already has Mac terminal access, as Doug confirmed.
- Starting/configuring a new PRD, editing its requirements, changing development-delivery grants, approving new metered billing, merging or releasing work, or arbitrary terminal interaction through Kiln. The chosen post-start boundary is SCOPE-001; existing helper commands are unaffected.
- Automatically choosing another subscription, storing a roster of credentials, managing billing or purchasing usage. This feature initiates the provider's supported sign-in workflow.
- Notifications, scheduling, keeping Kiln alive after its terminal closes, or waking an offline Mac. These are separate ideas; unreachable state is still reported honestly.

## Before Technical Design Is Complete

Resolve the provider-specific login and shared-account questions in the [investigation](kiln-bot-control-investigation.md). The command mockup is the proposed user-facing contract, not evidence that those commands already exist. Any feasibility limit that prevents the promised phone workflow must return as a product decision before implementation.
