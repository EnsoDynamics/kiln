# PRD: Codex support for Kiln

**Source:** Doug's request of October 22, 2026: support Codex much as Kiln supports Claude Code, including model, effort and usage limits. Choosing one agent for the whole PRD is acceptable; switching agents between phases is optional only if it is a natural, small extension.

**Changes:** [Kiln v1](../kiln-v1/kiln-v1-prd.md), [multi-repository delivery](../../changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), and [usage-limit recovery](../../changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md). [Research](kiln-codex-support-research.md) records the code and Codex capabilities checked. Authentication and initial model settings were settled by Doug's feedback of October 22, 2026, recorded in [validated business assumptions](kiln-codex-support-assumptions.md).

## Summary

A person can choose Codex instead of Claude Code before starting a PRD in Kiln, choose its model and reasoning effort, and follow the same workflow through implementation, interruptions, usage-limit recovery and pull requests ready for review. Kiln shows the selected agent's account and available usage limits, with truthful explanations where the agent does not provide information.

The agent choice belongs to one PRD and stays fixed once work starts. Model and effort remain changeable for future sessions, as they are today. Separate PRDs can use different agents at the same time.

## Business Context

Kiln already runs an Enso Method phase plan, starts a fresh Claude Code session for each phase, checks the result in Git, and hands unsuccessful work back to the person. It also supports work spanning repositories and resuming the same session after a usage limit. People who prefer Codex should get that workflow without installing or signing in to Claude Code.

This is one deliverable: a usable Codex option throughout Kiln's existing workflow. Agent switching during a PRD would also change account reporting, recovery and the meaning of saved sessions, so it is excluded from this delivery. The existing settings provide a natural place for choosing the agent before Start.

A **session** is the agent conversation for one phase, or the final conversation that opens pull requests. Resuming a session continues that conversation. A **usage window** is a period over which the account's allowance is measured. **Needs you** is Kiln's existing stopped state, showing what prevents it from continuing and how the person can help.

## Acceptance Criteria

### Choose the Agent Before Starting

The existing Documents found screen is where the person chooses how Kiln will carry out the PRD. Only the selected agent needs to be ready.

- [x] **AC-AGENT-01 — Claude Code and Codex are choices for this PRD.** Documents found offers both agents alongside model and effort. Claude Code remains the initial choice for new PRDs. Choosing an agent updates the model choices, effort choices, account information and sign-in guidance together. The choice is saved for that PRD and is independent of other PRDs.
  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the agent is no longer always Claude Code).
- [ ] **AC-AGENT-02 — The agent stays fixed after Start.** Every phase and the final pull-request session use the chosen agent, including after restarting Kiln. Settings name the agent and explain that it is fixed for the PRD. Resuming a conversation never transfers it to the other agent.
- [ ] **AC-AGENT-03 — Readiness follows the selection.** A person with only the selected agent installed can reach Documents found and start. Before starting work, Kiln reports missing or unsupported agent software, missing sign-in, unavailable required Enso Method skills, and any known incompatibility with unattended operation, with the action needed to proceed. Such a failure starts no implementation session and leaves the person's selection intact. For Codex, the person authenticates through ChatGPT in Codex before launching Kiln; Kiln uses that existing authentication. API-key-only Codex accounts are outside this delivery.
  - Replaces in part: AC-INSTALL-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the local agent may be Codex instead of Claude Code).

### Choose the Model and How Much It Reasons

The model selector and effort control reflect what the selected agent offers. A setting for future work must not rewrite what an existing session used.

- [ ] **AC-MODEL-01 — Choices come from the selected agent.** Kiln offers the agent's current selectable models by their reported names and only the reasoning efforts supported by the chosen model. This includes efforts beyond Claude Code's current list when Codex offers them. A model being listed is not presented as a guarantee that the account can run it; an access refusal is shown without substituting another model.
  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (model and effort choices are agent-specific).
- [ ] **AC-MODEL-02 — Defaults and changed choices are visible.** On first selecting Codex for a PRD, Kiln selects the latest available GPT Sol version offered by Codex, with High effort: GPT-6.1-Sol as of October 22, 2026. Switching back to an agent before Start restores that agent's last valid choices for this PRD. An unsupported saved choice or an unavailable model list is explained and blocks starting a new session until a valid choice can be confirmed; Kiln does not silently replace it. When a model change requires a different effort, the replacement effort is shown before the new session starts.
  - Replaces in part: AC-START-06 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (new sessions, including Claude Code, require confirmed model and effort choices; an unavailable catalogue or invalid saved choice cannot launch an unchecked saved alias).
- [ ] **AC-MODEL-03 — Changes apply to new sessions.** The person can change model and effort while working or paused. Each new session uses the latest saved choices; an active or resumed session keeps its own recorded model and effort. Kiln shows these separately from the choices for the next session. If a resumed session's choices are no longer usable, Needs you explains the refusal rather than starting another conversation.
  - Replaces in part: AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the model and effort control also supports Codex).

### Run the Same Enso Method Workflow

Choosing Codex changes the agent doing the work. It preserves Kiln's phase order, engineering responsibilities and checks before moving forward.

- [ ] **AC-WORK-01 — Codex carries the PRD through to review.** Kiln starts a fresh Codex session for each next unclosed leaf phase, follows phases that split themselves, and uses Codex for the final pull-request session. Sessions use the published Enso Method skills unchanged. The result is the existing one pull request per changed repository, ready for review; Kiln does not merge or deploy.
  - Superseded in part by: AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the open-pull-request endpoint and mandatory final pull-request session give way to the applicable final result and outstanding finalization work; Codex remains the selected agent).
  - Superseded in part by: AC-DEV-01 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (Codex’s unconditional no-merge/no-deploy boundary; agent selection alone still grants no additional authority).
  - Superseded in part by: AC-PRS-05 and AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (already-integrated completion skips unnecessary final sessions and reports truthful delivery facts).
  - Replaces in part: AC-RUN-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a fresh session may use Codex).
- [ ] **AC-WORK-02 — Sessions retain the same workspace and authority.** Codex sessions can read, change, test, commit and push in every worktree Kiln assigns to the PRD, including a repository added during a phase through Kiln's existing command. They receive the same phase scope, repository instructions and authorization boundaries as Claude Code sessions. Selecting Codex does not grant authority to merge, deploy or change other branches or checkouts.
- [ ] **AC-WORK-03 — Unattended sessions do not wait for a hidden answer.** Permission requests and questions requiring a person cannot leave a Codex session waiting indefinitely. Requests requiring human approval are declined or the session is stopped with the request visible at Needs you. Kiln does not auto-approve every request or disable protection merely to keep work moving. Work already performed remains available for recovery.
  - Replaces in part: AC-RUN-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a Codex request requiring a person may interrupt the session and show the request at Needs you).
- [x] **AC-WORK-04 — Completion still requires the existing checks.** For Codex, Kiln applies the existing phase and pull-request checks across all repositories, including Stayed in the workspace. That check covers the session's and its subagents' recorded work, including work done after reopening the session outside Kiln. Missing or unreadable Codex evidence cannot count as a pass, even after confirmation. Confirmation covers only identified outside-workspace changes in the evidence checked; later recorded work cannot inherit that confirmation without a new check. Existing repair behavior remains available; Claude Code confirmation behavior is unchanged. A model's success message or successful process exit does not establish completion.
  - Superseded in part by: AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the final delivery check accepts confirmed earlier deliveries; Codex evidence and workspace-check requirements remain).
  - Replaces in part: AC-OUTSIDE-01 and AC-OUTSIDE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Codex requires complete conversation evidence and confirmation tied to the checked evidence; confirmation cannot clear missing evidence; Claude Code behavior is unchanged).

### See Who Is Working and What Has Happened

Codex work appears in the existing progress and output views. Kiln distinguishes what it observed from what it cannot observe.

- [ ] **AC-VIEW-01 — Agent and session details are accurate.** Settings, current work, phase details, completed work, terminal messages and recovery instructions identify the selected or recorded agent as appropriate. Each session retains its agent, session ID, actual model and effort, timestamps and output across restarts. Codex output is labeled Codex; historical Claude Code output remains labeled Claude Code.
  - Replaces in part: AC-WATCH-01, AC-WATCH-06 and AC-WATCH-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (agent identity joins session facts and settings).
- [ ] **AC-VIEW-02 — Output is live and remains readable.** The browser shows timestamped Codex messages as they arrive, tool activity and results, errors and the final message. Reported subagent output is distinguishable from the parent session; a reviewer is named as such only when its role is known. Saved output is accessible after the session stops. If child output is unavailable, the view says so instead of suggesting the display is complete.
  - Replaces in part: AC-WATCH-05 and AC-WATCH-10 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Codex output and explicit limits on child-output visibility).
- [ ] **AC-VIEW-03 — Progress never invents completed work.** Kiln retains Build, Deliverable review, Test hardening, Commit, Refactor pass and Push. A step advances only from evidence of that activity. Where Codex does not expose reliable evidence, the step is identified as unobserved; missing visibility neither claims the step happened nor changes the done check.
  - Superseded in part by: AC-DISPLAY-02 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (Codex progress also distinguishes authorized development-delivery activity without inventing completion).
  - Replaces in part: AC-WATCH-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Codex evidence may differ from Claude Code skill calls).
- [ ] **AC-VIEW-04 — The existing screens accommodate the choice.** Documents found gains the agent selection; the existing model, effort, account, settings, output and recovery areas display the selected agent's information. Running, Paused, Waiting for usage, Needs you, Disconnected, Phase detail and Complete keep their existing purposes and visual style. The earlier mockups remain references for unaffected layout; these criteria govern their agent-specific differences.
  - Superseded in part by: AC-PAGE-02 in [Kiln Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) (implementation-phase Needs you layout, retaining agent-specific information).
  - Superseded in part by: AC-CODEX-05 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (account areas gain Codex billing and credit information; screen purposes and visual style remain).
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md`, and the screen requirements in AC-RESUME-01 and AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (agent selection and agent-specific information only).

### See the Selected Account's Usage Limits

The account panel gives the same practical visibility for Codex as for Claude Code. It shows the limits actually reported, which can differ between accounts and models.

- [ ] **AC-USAGE-01 — The account and its limits belong to the selected agent.** Wherever Kiln shows account information, Codex work shows the current Codex account identity and plan when available, when the reading was taken, and each reported usage window's percent used and reset time in the viewer's local time. Multiple allowances are distinguishable by their reported names or identifiers. The view does not assume a five-hour window, a weekly window, or exactly two windows. These are account allowances, not consumption attributable solely to this PRD.
  - Superseded in part by: AC-CODEX-01 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (account identity and plan gain a billing summary).
  - Replaces in part: AC-WATCH-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (account and limit information supports either agent).
- [ ] **AC-USAGE-02 — Readings stay current without model calls.** Kiln refreshes account and usage at least every five minutes while running, before starting or resuming a session, and at the additional recovery points in AC-RECOVER-03. Available live updates can refresh the view sooner. Reading account, model and usage metadata starts no model turn. Switching agents before Start cannot leave the other agent's readings displayed as current.
  - Replaces in part: AC-WATCH-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the selected agent supplies the readings).
- [ ] **AC-USAGE-03 — Missing information stays visibly unknown.** Missing windows, percentages, reset times or account fields are not shown as zero, unlimited or healthy. A failed refresh is shown, and any retained reading is labeled with its last successful update time. A model-list or usage lookup never fabricates choices or allowance. A usage lookup failure alone does not prevent work that the agent otherwise permits. Claude usage follows the cases below; the plan name alone never determines which limits apply. Existing waiting and automatic resumption rules remain, including weekly limits when no five-hour reading exists.

  | Claude usage report | Browser display and behavior |
  |---|---|
  | Numeric five-hour reading | Keep its percentage, reset and existing warning. |
  | Successful report omits the five-hour window or gives it a null/absent percentage | Keep other reported limits; show “5-hour: N/A (not reported)” in current usage displays, without a meter, reset or warning for that window. N/A never means zero or unlimited. |
  | Failed or wholly missing report | Show usage as unavailable; never claim N/A or available quota. |

  - Replaces in part: AC-WATCH-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (optional Claude five-hour readings).

- [ ] **AC-USAGE-04 — Warnings and sign-in guidance name the right agent.** The existing warning at 80% used applies to reported Codex windows. Guidance for signing in or changing accounts refers to Codex's own sign-in process in a terminal. Kiln has no separate credential entry or account-switching flow. Changing the terminal sign-in is reflected on the next refresh and before a later session begins; a session's recorded account is not rewritten by that refresh.
  - Replaces in part: AC-LIMIT-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Codex sign-in guidance uses Codex's own terminal login command).

### Resume Codex Work After Stops and Usage Limits

The person can pick up the same Codex conversation from Kiln or a terminal. Usage recovery uses facts reported by Codex, with explicit handling when a reset cannot be established.

- [ ] **AC-RECOVER-01 — Interruptions preserve a resumable conversation.** Ctrl+C interrupts Codex and stops the command processes Kiln can track, without discarding edits. Kiln keeps native execution lightweight; independently detached programs can survive and are outside this stop guarantee. Terminal stop guidance and the browser's recovery view explain that limitation and tell the person to check background servers or jobs before resuming. A known cleanup failure is visible and prevents automatic continuation. Restarting Kiln and recovery after sleep run the existing checks first, then resume the same interrupted conversation when needed. If that conversation is unavailable, Needs you offers the existing fresh-session prompt and explains why it cannot be resumed.
  - Replaces in part: AC-KEEP-02 and AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (interruption and resumption also apply to Codex).
  - Native cleanup scope confirmed by Doug on 2026-10-23 in chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “finish strengthening native cleanup first” and “Let's try to keep things lightweight.” See decision RECOVER-001 and the retained detached-process proof in the conversation runner results.
- [ ] **AC-RECOVER-02 — Manual recovery uses Codex and its saved context.** Needs you offers the correct copyable Codex resume command, Resume with an optional note, and Check again under the existing recovery rules. The note reaches the resumed conversation before the carry-on instruction. Manual terminal work and work resumed by Kiln are recognized by the same completion and workspace checks. Explicit Resume remains available when the saved Codex conversation can be resumed, including while its workspace check fails or evidence is incomplete; resuming does not clear that failure. Missing conversation history removes the resume options and exposes the fresh-session path.
  - Superseded in part by: AC-REPLY-01, AC-RETURN-02 and AC-VERIFY-01 in [Kiln Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) (manual phase handoff labels and the explicit already-complete choice; existing recovery protections remain).
  - Replaces in part: AC-STOP-05 and AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md`, and AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (commands, prompts and conversation resumption support Codex).
  - Replaces in part: AC-OUTSIDE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (an explicit Codex repair resume remains available despite a failed or inconclusive audit when the saved conversation is resumable).
- [x] **AC-RECOVER-03 — A confirmed usage stop follows an explicit recovery rule.** The existing Resume after a usage limit setting, on by default, also governs Codex. Only a structured provider report of an exhausted allowance establishes a usage stop; prose mentioning limits or a generic network/rate error does not. A passing completion check finishes the work first; a failed workspace check goes to Needs you first. Otherwise apply this table, preserving the existing Resume now, pause, keep-awake, sleep and restart behavior.

  | Available evidence | Behavior when automatic recovery is on |
  |---|---|
  | Fresh provider evidence establishes a definite blocked or allowed state for the applicable allowance or the active account's ordinary usage | Wait while blocked; refresh immediately, every five minutes, on waking and at a reported reset. Resume the original conversation with its original settings only from fresh positive provider permission. Explicit account-wide ordinary-usage permission permits one attempt without an identified window; it does not guarantee model access. A repeated refusal before model activity requires changed applicable evidence before another automatic attempt. Known other-model allowances do not block it when their scope is known. |
  | Usage cannot be read, but Codex supplied an applicable future reset | Wait until that reset, check again, and make one resume attempt if usage is still unreadable. A new refusal requires new evidence or a later reset before another automatic attempt. |
  | The provider cannot establish an applicable blocked or allowed state and supplies no applicable future reset; or Codex reports an administrative/credit block without timed recovery | Show Needs you with the reported problem and manual recovery options. Do not invent a reset or retry repeatedly. |

  With automatic recovery off, the session goes directly to Needs you. A different signed-in Codex account can release a wait only when its fresh reading establishes allowance for the stopped session; the resumed attempt records that account. Kiln never switches agent or model, purchases credits, or consumes a usage-reset credit automatically.
  - Replaces in part: AC-AUTO-01, AC-AUTO-02, AC-AUTO-05 and AC-LIMIT-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Codex usage classification, account identification and recovery evidence; Claude behavior is unchanged).

### Preserve Existing Work and Prove the New Option

Adding Codex must preserve existing Claude work. Acceptance requires real Codex operation as well as checks of the surrounding application.

- [ ] **AC-COMPAT-01 — Existing Claude PRDs keep working.** Saved PRDs created before agent selection remain Claude Code PRDs with their settings, conversation IDs, output, waits and recovery intact. They do not require Codex. Selecting Codex on a new PRD does not change the defaults or state of another PRD. Concurrent Claude and Codex PRDs remain isolated by Kiln's existing workspace and instance rules.
- [ ] **AC-COMPAT-02 — One installation, with explicit platform validation.** The single Kiln package provides Codex integration validated on the available Mac. Linux and Windows remain intended targets with best-effort compatibility work, explicitly untested in this delivery. Document agent prerequisites, the validated version and these platform limits; unavailable Linux/Windows test hosts do not block acceptance. No Codex desktop installation or desktop-only capability is required. An incompatible local version is identified before work starts.
**AC-PROOF-01 — retired, split into AC-PROOF-02 and AC-PROOF-03.** The proof prerequisites and assembled-workflow proof have separate owners in the phase plan; their combined scope is unchanged.

- [x] **AC-PROOF-02 — Real sessions demonstrate work across repositories and workspace checking.** Before release, real Codex sessions demonstrate work across repositories including a repository added during a phase, and workspace checking. The technical design's pre-integration proof gate establishes the required prerequisites before normal Codex execution is integrated.
- [ ] **AC-PROOF-03 — Real sessions demonstrate the assembled workflow.** Before release, a real Codex PRD runs through at least two phases to its expected pull requests. Evidence includes supported model/effort selection, live output, an interrupted conversation resumed by Kiln, manual terminal recovery, and usage display. The applicable AC-RECOVER-03 path is initially verified with the pinned provider contracts and automated recovery tests; actual exhaustion and recovery are deferred to Doug’s first live occurrence and remain explicitly unproved. Platform-specific process stopping and resumption are demonstrated on macOS; Linux/Windows runtime validation is outside this delivery’s acceptance gate and remains explicitly untested. Existing Claude behavior is regression-checked. Reuse applicable evidence from completed phases; repeat a proof only when a changed boundary or discovered defect requires it. Unrun required Mac/workflow cases remain explicit release gaps; the approved live-quota and platform limits below are exceptions.
  - Validation decision, Doug, 2026-10-23, chat `01a16a2e-3595-7d31-b4e5-25753d32f125`: an exhausted account is unavailable; “Just do your best to have it work the right way, and I will have to test it in real life conditions when that actually occurs.” This defers the real quota case without changing AC-RECOVER-03’s required behavior or authorizing release/push.

  - Platform validation decision, Doug, 2026-10-23, chat `01a16a2e-3595-7d31-b4e5-25753d32f125`: only his Mac is available; “It's just going to have to be best efforts for now.” Set up Linux/Windows compatibility as well as practical without native testing, state that limitation, and investigate reports when they arise. Phase 5 retains only the missing installed-package and assembled two-phase GitHub proof, reusing earlier evidence. No Linux/Windows host provisioning or native proof is required for closure. This does not authorize push or release.

## Out of Scope

- Switching agents after a PRD starts, assigning different agents to individual phases, transferring conversations between agents, or automatic failover to another model or account.
- Codex desktop handoff, native computer-use routing, and reproducing every Codex application feature inside Kiln.
- New end-of-PRD audits, roadmap orchestration or parallel phase execution; these are separate Kiln roadmap items.
- API-key-only Codex operation, alternative model providers, billing management, credit purchases and usage-reset redemption.

## Evidence and Dependencies

Read-only checks against the installed Codex CLI confirmed model/effort discovery, account and usage readings, and discovery of the required method skills. They did not start an implementation session. [Research and remaining proof questions](kiln-codex-support-research.md) distinguish those observations from documented capabilities and unproven behavior.

The technical design must establish unattended permissions, faithful conversation recovery, workspace evidence including subagents, and reliable usage-stop classification before implementation relies on them. If a required behavior cannot be supported, bring the product consequence back explicitly; an integration limitation does not silently remove an acceptance criterion.
