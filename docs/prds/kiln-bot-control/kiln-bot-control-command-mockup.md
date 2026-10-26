# Kiln bot control — command-line mockup

**Proposed interface, not implemented.** Read alongside the [PRD](kiln-bot-control-prd.md). These are text transcripts of what a bot would execute on the Mac and what Kiln would return. The person can speak naturally; the bot constructs the commands.

The examples use fictional records. Customer returns and its phase names come from Kiln's existing `src/test-support/sample-snapshots.ts`; Shipping labels is a second illustrative PRD. IDs are shortened for readability. Timestamps are UTC, as in repository documents; readable runtime output uses the caller's time zone and labels it. JSON never contains comments or terminal decoration.

## The main conversation

```text
Doug: How many Kilns are running, and what are they doing?

Bot: Two are open. Customer returns is working on phase 3,
     Returns dashboard; its last output was 18 seconds ago.
     Shipping labels needs you on phase 2, Carrier selection.
     It stopped at 12:54 UTC and asks which carrier to use.

Doug: What exactly did it ask?

Bot: “The requirements name both UPS and FedEx as the default.
     Which should I use for domestic shipments?”

Doug: Tell it UPS for domestic shipments and keep going.

Bot: Your reply was delivered to Shipping labels' stopped session.
     It has resumed phase 2. Customer returns is still working.
```

The bot learns these facts through the commands below, not by reading the web page.

## Find all current instances

Covers AC-SEE-01 to 03. No repository directory or browser port is required.

```console
$ kiln status
Checked 2026-10-26 13:00:00 UTC
2 live controllers · 1 working · 1 needs you

RUN          PRD               REPOSITORY    STATE         CURRENT ACTIVITY
run_returns  Customer returns  acme-shop     implementing  3 · Returns dashboard
run_labels   Shipping labels   acme-shipping needs_you     2 · Carrier selection

run_returns: 3/5 executable phases complete; last output 18 seconds ago.
run_labels: 1/4 executable phases complete; stopped 6 minutes ago.
Details: kiln status --run <RUN>
```

`kiln status --all` also includes saved stopped/completed runs. A saved record is not a live controller.

```console
$ kiln status --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "observed_at": "2026-10-26T13:00:00Z",
  "inventory_complete": true,
  "counts": {"live_controllers": 2, "working": 1, "needs_you": 1},
  "runs": [
    {
      "run_id": "run_returns",
      "prd": {"name": "Customer returns", "path": "~/devel/acme-shop/docs/prds/customer-returns/customer-returns-prd.md"},
      "repositories": ["acme-shop"],
      "controller": "reachable",
      "state": "implementing",
      "activity": {"kind": "implementation", "phase_id": "3", "title": "Returns dashboard"},
      "phases": {"completed": 3, "total": 5},
      "last_activity_at": "2026-10-26T12:59:42Z"
    },
    {
      "run_id": "run_labels",
      "prd": {"name": "Shipping labels", "path": "~/devel/acme-shipping/docs/prds/shipping-labels/shipping-labels-prd.md"},
      "repositories": ["acme-shipping"],
      "controller": "reachable",
      "state": "needs_you",
      "activity": {"kind": "implementation", "phase_id": "2", "title": "Carrier selection"},
      "phases": {"completed": 1, "total": 4},
      "last_activity_at": "2026-10-26T12:54:00Z"
    }
  ],
  "errors": []
}
```

## Read the exact stop and available actions

Covers AC-SEE-04 and AC-ACT-01. `--detail full` adds the complete phase/activity history, session identities, settings, account facts and completion links. The default targeted response includes the complete stop message and controls.

```console
$ kiln status --run run_labels
Checked 2026-10-26 13:00:05 UTC
Shipping labels · run_labels · Needs you
Phase 2 · Carrier selection · 1/4 executable phases complete
Agent: Codex · session sess_labels_2
Stopped: 2026-10-26 12:54:00 UTC
Reason: Session ended before the phase passed its completion checks.

Final message (complete):
The requirements name both UPS and FedEx as the default.
Which should I use for domestic shipments?

Failed checks:
- Phase closed: no Closed line is recorded for phase 2.

Controls (context ctl_labels_7):
  reply / resume / check-again: available
  pause / continue: unavailable — no active or paused activity
  settings / account login preview: available
  outside-confirmation: unavailable — no outside-workspace confirmation offered

kiln reply --run run_labels --context ctl_labels_7 --request-id <unique-id> --file <note-file>
```

The equivalent JSON carries `observed_at`, `stop.final_message`, `stop.message_complete: true`, `stop.failed_checks`, `session_id`, `control_context` and `controls` with availability, reasons and required inputs. A text message never supplies executable authority.

## Send the reply and resume

Covers AC-ACT-02, 04 and 05; AC-CLI-02. The bot passes a UTF-8 file or stdin without interpolating the person's words into a shell command. Here `/tmp/kiln-reply.txt` contains “Use UPS for domestic shipments. Continue with the phase.”

```console
$ kiln reply --run run_labels --context ctl_labels_7 --request-id req_labels_reply_1 --file /tmp/kiln-reply.txt --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "run_id": "run_labels",
  "request_id": "req_labels_reply_1",
  "operation": {
    "id": "op_reply_1",
    "state": "completed",
    "outcome": "session_resumed",
    "session_id": "sess_labels_2",
    "note_delivered": true
  },
  "run_state": "implementing"
}
```

`kiln reply ... --stdin` is the same input contract. `kiln resume` has no note and serves Resume or Resume now according to the current state. If checks already pass, the outcome is `advanced_after_checks` with `note_delivered: false`. If the work is still starting, the initial operation state is `accepted`; query its receipt:

```console
$ kiln operation --run run_labels --request-id req_labels_reply_1
Checked 2026-10-26 13:01:00 UTC
op_reply_1 · Completed · Session resumed · note delivered
```

Completed here means the requested action finished, not that phase 2 finished. Retrying the same request ID and inputs returns this receipt, even if the run has since advanced. Reusing that ID for different input is an error.

## Reject an answer to an old stop

Covers AC-ACT-04. This example uses a new request ID after the browser already resumed phase 2.

```console
$ kiln reply --run run_labels --context ctl_labels_7 --request-id req_labels_reply_2 --file /tmp/kiln-reply.txt --json
```

```json
{
  "schema_version": "1",
  "ok": false,
  "operation": {"id": "op_reply_2", "state": "refused"},
  "error": {
    "code": "stale_control_context",
    "message": "Shipping labels is no longer waiting at the stop you read. Nothing was sent.",
    "next_command": "kiln status --run run_labels --json"
  }
}
```

Exit status: `3`. The bot refreshes and asks what the person intends if the old instruction no longer fits; it does not automatically send the text to the next stop.

## Pause, continue and check work

Covers AC-ACT-03. Each changing command below requires `--context <current-context> --request-id <unique-id>`; `<current-context>` is read immediately before that action, not reused from the earlier examples.

| Command after `kiln` | Text result |
|---|---|
| `pause --run run_returns` | op_pause_1 · Completed. Pause requested after phase 3. The current session continues. |
| `pause --run run_returns --cancel` | op_pause_cancel_1 · Completed. Pending pause cancelled. Kiln will keep going. |
| `continue --run run_returns` | op_continue_1 · Accepted. Continue this paused run. |
| `check-again --run run_labels` | op_check_1 · Completed. Completion checks failed. Still Needs you; the response includes the failed checks. |
| `settings --run run_labels --resume-after-usage-limit off` | op_settings_1 · Completed. Resume after a usage limit: off. |
| `settings --run run_returns --keep-awake on` | op_settings_2 · Completed. Keep awake: on. |
| `outside-confirmation --run run_labels --resolved` | op_outside_1 · Completed. Confirmation recorded for the outside-workspace facts you reviewed. No work started. |
| `outside-confirmation --run run_labels --clear` | op_outside_2 · Completed. Confirmation cleared. |

Unavailable commands return an identified, refused operation and a reason, with no effect. `kiln settings --run <RUN>` reads current runtime settings without changing them. A check that succeeds can advance work, so Check again is a changing command.

## Read output or obtain the terminal hand-back

Covers AC-SEE-05. Commands below are read-only.

```console
$ kiln logs --run run_returns --session current --limit 50
Checked 2026-10-26 13:00:06 UTC
Session sess_returns_3 · lines 201–250 of 250
2026-10-26 12:59:42 UTC  Running the returns dashboard integration checks.
[49 further lines in this illustrative page]
Earlier: kiln logs --run run_returns --session sess_returns_3 --before 201 --limit 50

$ kiln handoff --run run_labels
Checked 2026-10-26 13:00:07 UTC
Agent: Codex
Session: sess_labels_2
Working directory: ~/devel/acme-shipping-kiln/shipping-labels
Resume command: codex resume sess_labels_2
Continuation prompt:
[The complete continuation prompt supplied by this run, including its current authority.]

Close any manual session before asking Kiln to resume it.
This command did not open a terminal or start a session.
```

Brackets above stand for long sample content, not product truncation. JSON returns the same complete hand-back as separate `working_directory`, `resume_command` and `continuation_prompt` fields. Claude runs return their Claude command. A missing provider session returns `resumable: false`, its reason, and any available fresh-session instructions.

## Ask which account is exhausted

Covers AC-ACCOUNT-01. This is a later scenario with two Claude runs sharing one sign-in, not the earlier mixed-provider pair.

```console
$ kiln account --run run_returns --refresh
Checked 2026-10-26 14:00:00 UTC
Customer returns · Claude Code · Waiting for usage
Last attempt: primary@example.invalid · Max plan
Authenticated for next attempt: primary@example.invalid · Max plan
Account read: 2026-10-26 14:00:00 UTC · current
5-hour window: 100% used · resets 2026-10-26 17:00:00 UTC
Weekly: 72% used · resets 2026-10-30 09:00:00 UTC
Resume after usage limit: on
Login context: login_claude_default

$ kiln account --run run_returns --login-preview
Checked 2026-10-26 14:00:01 UTC
Switching this sign-in affects the next attempt of:
  run_returns · Customer returns · waiting
  run_labels  · Shipping labels · needs_you
Other applications using this Claude sign-in may also be affected.
Both Kiln sessions are idle. Login can begin.
Scope context: login_scope_4
```

If an affected session is active, preview says login is unavailable and identifies it; a login request is refused, not queued. The caller can request its normal pause, then refresh the preview once it has stopped. There is no hidden interruption.

## Begin login and finish it on the phone

Covers AC-ACCOUNT-02 to 04. Provider UI, authorization URL/code format and completion method require the design proofs listed in the investigation. `auth.example.invalid` is a mock provider URL, not an actual login destination.

```console
$ kiln account login --run run_returns --expected-account alternate@example.invalid --scope-context login_scope_4 --request-id req_login_1 --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "operation": {"id": "op_login_1", "state": "awaiting_user"},
  "affected_runs": ["run_returns", "run_labels"],
  "automatic_launches": "held",
  "verified_account": null,
  "user_action": {
    "kind": "provider_authorization",
    "url": "https://auth.example.invalid/authorize/sample",
    "code": null,
    "expires_at": "2026-10-26T14:10:00Z",
    "instruction": "Open the provider page and sign in as alternate@example.invalid. Complete any required verification there."
  }
}
```

```text
Bot: Open this provider sign-in link on your phone and choose the alternate
     account. Customer returns and Shipping labels will remain held until
     you ask to continue each one.
```

If the provider asks for a one-time completion response, Kiln's explicit login operation accepts it via protected stdin:

```console
$ kiln account login complete --operation op_login_1 --stdin --request-id req_login_complete_1
op_login_1 · In progress. Authorization response received. Checking the actual account.

$ kiln account login status --operation op_login_1
Checked 2026-10-26 14:02:00 UTC
op_login_1 · Completed. Account verified: alternate@example.invalid · Max plan
Refreshed affected runs: run_returns, run_labels
Both runs remain held. No coding session was resumed.

$ kiln status --run run_returns
Checked 2026-10-26 14:02:01 UTC
Customer returns · Waiting for usage · account-change hold
Next account: alternate@example.invalid · Max plan · current
Controls (context ctl_returns_12): resume available

$ kiln resume --run run_returns --context ctl_returns_12 --request-id req_resume_1
op_resume_1 · Completed. Same session resumed using alternate@example.invalid.
Shipping labels remains held.
```

When the provider completes authorization without a returned response, skip `complete` and query `status`. A Codex run uses the same Kiln commands, with a provider-issued device URL/code when the supported flow provides one. Kiln does not substitute an API key for ChatGPT login.

While login is pending, `kiln account login cancel --operation op_login_1 --request-id <unique-id>` returns `op_login_1 · Cancelled. Login cancelled; affected runs remain held.` Complete and cancel act only on that operation's original login scope. Kiln rejects a new completion/cancellation request when ownership or current eligibility fails; it never selects another login. Status explicitly reports `expired`, `cancelled`, `failed`, `account_mismatch`, or `local_interaction_required` when applicable; it never calls those success. A request for alternate@example.invalid that verifies primary@example.invalid is `account_mismatch`; neither run resumes. Subsequent commands use the freshly observed account state.

## Other answers the bot can give

Covers AC-SEE-02 to 03 and AC-CLI-01.

| Situation | Representative text |
|---|---|
| All implementation phases done, audit running | Customer returns: delivery audit, round 1; 5/5 executable phases complete. The PRD is not complete yet. |
| Waiting at a weekly limit | Shipping labels: waiting for weekly usage; reset 2026-10-30 09:00:00 UTC. Automatic recovery is on. |
| Usage refresh failed | Account last read at 13:55 UTC; usage unavailable. This does not establish remaining allowance. |
| Known controller unreachable | Customer returns: controller unreachable; last known state implementing at 13:02 UTC. No current controls available. Inventory incomplete. |
| No controllers | 0 live controllers. Use `kiln status --all` to inspect saved runs. |
| PRD complete | Customer returns: complete; final delivery checks passed. Pull request: the recorded PR link. |
| Unsupported older instance | Shipping labels: live controller found, but this command interface is unsupported by that instance. Upgrade guidance provided; no controls attempted. |
| Mac itself unreachable | The bot's remote command invocation failed. It cannot conclude how many Kilns are running. |

## Command and result conventions

These proposed conventions make the examples reviewable; the technical design supplies the complete field schema.

- `kiln --help` and `kiln <command> --help` describe inputs and output fields; all commands support `--json`.
- Reads return facts only. Changing commands return operation receipts. Run controls target a run and control context; beginning login targets a run and login scope context. Login completion/cancellation target the existing operation, with its ownership and current eligibility checked under AC-ACT-04.
- A run control context changes when relevant controls or their target change, not whenever another output line arrives. Login scope context changes when the affected runs or their eligibility change.
- Operation lookup uses a run/request ID for ordinary controls or a login operation ID for login. A replay is checked before applying the old control context, so a successfully completed request can return its old receipt.
- Login status is the explicit place to retrieve still-valid authorization instructions. Ordinary operation receipts, output and logs omit transient login secrets.

| Exit | Meaning |
|---|---|
| `0` | Read succeeded, or changing request accepted; inspect operation state for completion |
| `2` | Invalid input, unknown/ambiguous run, or request ID reused with different inputs |
| `3` | State, authorization or account conflict; no requested change accepted |
| `4` | Incomplete inventory, unavailable controller/provider, incompatible instance, or indeterminate operation result |

Querying an operation successfully returns `0` even if its recorded outcome is failure. JSON always names that outcome explicitly. A login awaiting the person is an accepted operation, not a blocked terminal process.
