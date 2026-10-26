# Kiln bot control — command-line mockup

**Proposed interface, not implemented.** Read alongside the [PRD](kiln-bot-control-prd.md). These are text transcripts of what a bot would execute on the Mac and what Kiln would return. The person can speak naturally; the bot constructs the commands.

The examples use fictional records. Customer returns and its phase names come from Kiln's existing `src/test-support/sample-snapshots.ts`; Shipping labels is a second illustrative PRD. Paths under `/work/` are fictional absolute Mac paths; operation/session IDs are shortened for readability. Timestamps are UTC, as in repository documents; readable runtime output uses the caller's time zone and labels it. JSON never contains comments or terminal decoration.

## The everyday commands

The target is the **same PRD file or folder used with `kiln run`**. There is no new run-name system to learn.

```text
kiln status                              # list current and unfinished work
kiln status <PRD-path>                    # inspect one PRD
kiln logs <PRD-path>                      # recent output, small bounded page
kiln logs <PRD-path> --lines 20           # ask for fewer lines
kiln logs <PRD-path> --before <cursor>    # preceding page from the same session
kiln reply <PRD-path> --file <reply-file> # send the note and resume
kiln resume <PRD-path>                    # resume without a note
```

This overview shows command shapes. Changing commands also carry the current control context and a request ID, shown in the complete examples below. The bot copies the context from status and generates the request ID; the person does not invent either.

For readability in longer examples, these two **ordinary shell variables contain paths**, not Kiln identifiers:

```sh
returns_prd=/work/acme-shop/docs/prds/customer-returns
labels_prd=/work/acme-shipping/docs/prds/shipping-labels
```

An absolute path works from any directory. A relative path has the same meaning it has in `kiln run`: relative to the caller's directory. Quotes preserve paths containing spaces.

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

Customer returns · acme-shop · implementing
  Phase 3 · Returns dashboard · 3/5 executable phases complete
  Last output: 18 seconds ago
  PRD: /work/acme-shop/docs/prds/customer-returns

Shipping labels · acme-shipping · needs_you
  Phase 2 · Carrier selection · 1/4 executable phases complete
  Stopped: 6 minutes ago
  PRD: /work/acme-shipping/docs/prds/shipping-labels

Details: kiln status /work/acme-shipping/docs/prds/shipping-labels
```

The list includes live controllers and saved unfinished executions whose controller stopped, clearly separated. Paused, Waiting for usage and Needs you still count as live when their controller is running. Completed work appears only while its controller is still open; once closed, it disappears from this list. Its retained details remain available with `kiln status <PRD-path>`. There is no all-history command or arbitrary age cutoff: an unfinished execution stays visible as unfinished.

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
      "prd_path": "/work/acme-shop/docs/prds/customer-returns",
      "prd": {"name": "Customer returns", "path": "/work/acme-shop/docs/prds/customer-returns"},
      "repositories": ["acme-shop"],
      "controller": "reachable",
      "state": "implementing",
      "activity": {"kind": "implementation", "phase_id": "3", "title": "Returns dashboard"},
      "phases": {"completed": 3, "total": 5},
      "last_activity_at": "2026-10-26T12:59:42Z"
    },
    {
      "prd_path": "/work/acme-shipping/docs/prds/shipping-labels",
      "prd": {"name": "Shipping labels", "path": "/work/acme-shipping/docs/prds/shipping-labels"},
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
$ kiln status "$labels_prd"
Checked 2026-10-26 13:00:05 UTC
Shipping labels · Needs you
PRD: /work/acme-shipping/docs/prds/shipping-labels
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

kiln reply "$labels_prd" --context ctl_labels_7 --request-id <unique-id> --file <note-file>
```

The equivalent JSON carries `observed_at`, `stop.final_message`, `stop.message_complete: true`, `stop.failed_checks`, `session_id`, `control_context` and `controls` with availability, reasons and required inputs. A text message never supplies executable authority.

## Send the reply and resume

Covers AC-ACT-02, 04 and 05; AC-CLI-02. The bot passes a UTF-8 file or stdin without interpolating the person's words into a shell command. Here `/tmp/kiln-reply.txt` contains “Use UPS for domestic shipments. Continue with the phase.”

```console
$ kiln reply "$labels_prd" --context ctl_labels_7 --request-id req_labels_reply_1 --file /tmp/kiln-reply.txt --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "prd_path": "/work/acme-shipping/docs/prds/shipping-labels",
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
$ kiln operation "$labels_prd" --request-id req_labels_reply_1
Checked 2026-10-26 13:01:00 UTC
op_reply_1 · Completed · Session resumed · note delivered
```

Completed here means the requested action finished, not that phase 2 finished. Retrying the same request ID and inputs returns this receipt, even if the run has since advanced. Reusing that ID for different input is an error.

## Reject an answer to an old stop

Covers AC-ACT-04. This example uses a new request ID after the browser already resumed phase 2.

```console
$ kiln reply "$labels_prd" --context ctl_labels_7 --request-id req_labels_reply_2 --file /tmp/kiln-reply.txt --json
```

```json
{
  "schema_version": "1",
  "ok": false,
  "operation": {"id": "op_reply_2", "state": "refused"},
  "error": {
    "code": "stale_control_context",
    "message": "Shipping labels is no longer waiting at the stop you read. Nothing was sent.",
    "next_command": "kiln status /work/acme-shipping/docs/prds/shipping-labels --json"
  }
}
```

Exit status: `3`. The bot refreshes and asks what the person intends if the old instruction no longer fits; it does not automatically send the text to the next stop.

## Pause, continue and check work

Covers AC-ACT-03. Each changing command below requires `--context <current-context> --request-id <unique-id>`; `<current-context>` is read immediately before that action, not reused from the earlier examples.

| Command after `kiln` | Text result |
|---|---|
| `pause "$returns_prd"` | op_pause_1 · Completed. Pause requested after phase 3. The current session continues. |
| `pause "$returns_prd" --cancel` | op_pause_cancel_1 · Completed. Pending pause cancelled. Kiln will keep going. |
| `continue "$returns_prd"` | op_continue_1 · Accepted. Continue this paused run. |
| `check-again "$labels_prd"` | op_check_1 · Completed. Completion checks failed. Still Needs you; the response includes the failed checks. |
| `settings "$labels_prd" --resume-after-usage-limit off` | op_settings_1 · Completed. Resume after a usage limit: off. |
| `settings "$returns_prd" --keep-awake on` | op_settings_2 · Completed. Keep awake: on. |
| `outside-confirmation "$labels_prd" --resolved` | op_outside_1 · Completed. Confirmation recorded for the outside-workspace facts you reviewed. No work started. |
| `outside-confirmation "$labels_prd" --clear` | op_outside_2 · Completed. Confirmation cleared. |

Unavailable commands return an identified, refused operation and a reason, with no effect. `kiln settings <PRD-path>` reads current runtime settings without changing them. A check that succeeds can advance work, so Check again is a changing command.

## Read a small tail of recent output

Covers AC-SEE-06. Logs are **not the full transcript**. With no options, Kiln reads the active session, otherwise the most recent saved session, and returns its newest 50 lines at most. The entire stdout response is capped at **16 KiB**, including headers or JSON metadata and escaping. The defaults are proposed in OUTPUT-001.

```console
$ kiln logs "$returns_prd"
Checked 2026-10-26 13:00:06 UTC
Customer returns · phase 3 · session sess_returns_3
Latest 50 lines · range 201–250 · older output available
[The 50 actual output lines, in oldest-to-newest order.]
Earlier: kiln logs /work/acme-shop/docs/prds/customer-returns --before page_returns_200
```

The bracketed line above stands for content in this mockup, not a product omission. A short explicit request is shown in full:

```console
$ kiln logs "$returns_prd" --lines 2 --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "observed_at": "2026-10-26T13:00:06Z",
  "prd_path": "/work/acme-shop/docs/prds/customer-returns",
  "session_id": "sess_returns_3",
  "snapshot_end_line": 250,
  "requested_lines": 2,
  "response_byte_limit": 16384,
  "byte_limit_reached": false,
  "lines": [
    {"number": 249, "at": "2026-10-26T12:59:40Z", "text": "Dashboard changes saved.", "fragment": null},
    {"number": 250, "at": "2026-10-26T12:59:42Z", "text": "Running the returns dashboard integration checks.", "fragment": null}
  ],
  "has_older": true,
  "next_before": "page_returns_248",
  "next_command": "kiln logs /work/acme-shop/docs/prds/customer-returns --before page_returns_248 --lines 2 --json"
}
```

```console
$ kiln logs "$returns_prd" --before page_returns_248 --lines 2
Checked 2026-10-26 13:01:00 UTC
Customer returns · session sess_returns_3 · snapshot through line 250
Earlier page · range 247–248 · older output available
247  2026-10-26 12:59:36 UTC  Updating dashboard filters.
248  2026-10-26 12:59:38 UTC  Saving dashboard changes.
Earlier: kiln logs /work/acme-shop/docs/prds/customer-returns --before page_returns_246 --lines 2
```

The cursor fixes the execution, session and snapshot. If Kiln has since started phase 4, this page still reads phase 3. It never silently switches to phase 4. A fresh `kiln logs "$returns_prd"` reads the latest tail again.

| Request or condition | Result |
|---|---|
| `kiln logs "$returns_prd" --lines 100` | Up to 100 recent lines, still capped at 16 KiB for the response |
| `kiln logs "$returns_prd" --session sess_returns_2` | Tail of the selected earlier session; session IDs are listed by full status detail |
| Requested lines do not fit | Fewer recent lines, `byte_limit_reached: true`, and an earlier-page cursor |
| One line exceeds the response budget | The newest fragment fits; it is explicitly marked as a fragment with its position in the line. The earlier-page cursor retrieves the preceding fragment. Text is not silently truncated. |
| No session or no output yet | Successful empty result, with the reason and no earlier-page cursor |
| Reached the beginning | `has_older: false`, `next_before: null`, `next_command: null` |
| Cursor is invalid or belongs to another PRD/session | Error, exit 2; no other session is substituted |
| Saved output has been removed or cannot be read | Explicit unavailable result, exit 4; no empty-success result |

`--lines` accepts 1–200. Larger, zero or negative values are errors, not unlimited requests. Every page stays within the byte cap in text and JSON modes, including errors. There is no follow mode or whole-log dump. To read everything, the caller must explicitly request successive bounded pages; the bot should stop once it has enough context to answer the person.

## Obtain the terminal hand-back

Covers AC-SEE-05. This separate read returns instructions, not logs.

```console
$ kiln handoff "$labels_prd"
Checked 2026-10-26 13:00:07 UTC
Agent: Codex
Session: sess_labels_2
Working directory: /work/acme-shipping-kiln/shipping-labels
Resume command: codex resume sess_labels_2
Continuation prompt:
[The complete continuation prompt supplied by this run, including its current authority.]

Close any manual session before asking Kiln to resume it.
This command did not open a terminal or start a session.
```

The brackets stand for long sample content, not product truncation. JSON returns the complete hand-back as separate `working_directory`, `resume_command` and `continuation_prompt` fields. Claude runs return their Claude command. A missing provider session returns `resumable: false`, its reason, and any available fresh-session instructions.

## Ask which account is exhausted

Covers AC-ACCOUNT-01. This is a later scenario with two Claude runs sharing one sign-in, not the earlier mixed-provider pair.

```console
$ kiln account "$returns_prd" --refresh
Checked 2026-10-26 14:00:00 UTC
Customer returns · Claude Code · Waiting for usage
Last attempt: primary@example.invalid · Max plan
Authenticated for next attempt: primary@example.invalid · Max plan
Account read: 2026-10-26 14:00:00 UTC · current
5-hour window: 100% used · resets 2026-10-26 17:00:00 UTC
Weekly: 72% used · resets 2026-10-30 09:00:00 UTC
Resume after usage limit: on
Login context: login_claude_default

$ kiln account "$returns_prd" --login-preview
Checked 2026-10-26 14:00:01 UTC
Switching this sign-in affects the next attempt of:
  Customer returns · waiting · /work/acme-shop/docs/prds/customer-returns
  Shipping labels · needs_you · /work/acme-shipping/docs/prds/shipping-labels
Other applications using this Claude sign-in may also be affected.
Both Kiln sessions are idle. Login can begin.
Scope context: login_scope_4
```

If an affected session is active, preview says login is unavailable and identifies it; a login request is refused, not queued. The caller can request its normal pause, then refresh the preview once it has stopped. There is no hidden interruption.

## Begin login and finish it on the phone

Covers AC-ACCOUNT-02 to 04. Provider UI, authorization URL/code format and completion method require the design proofs listed in the investigation. `auth.example.invalid` is a mock provider URL, not an actual login destination.

```console
$ kiln account login "$returns_prd" --expected-account alternate@example.invalid --scope-context login_scope_4 --request-id req_login_1 --json
```

```json
{
  "schema_version": "1",
  "ok": true,
  "operation": {"id": "op_login_1", "state": "awaiting_user"},
  "affected_prds": ["/work/acme-shop/docs/prds/customer-returns", "/work/acme-shipping/docs/prds/shipping-labels"],
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
Refreshed affected PRDs:
  /work/acme-shop/docs/prds/customer-returns
  /work/acme-shipping/docs/prds/shipping-labels
Both runs remain held. No coding session was resumed.

$ kiln status "$returns_prd"
Checked 2026-10-26 14:02:01 UTC
Customer returns · Waiting for usage · account-change hold
Next account: alternate@example.invalid · Max plan · current
Controls (context ctl_returns_12): resume available

$ kiln resume "$returns_prd" --context ctl_returns_12 --request-id req_resume_1
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
| No controllers, unfinished saved work exists | 0 live controllers; 1 unfinished execution is stopped. Its PRD path and last-known state are shown; no controls are available. |
| No current or unfinished work | 0 live controllers; no unfinished executions found. |
| PRD complete | Customer returns: complete; final delivery checks passed. Pull request: the recorded PR link. |
| Unsupported older instance | Shipping labels: live controller found, but this command interface is unsupported by that instance. Upgrade guidance provided; no controls attempted. |
| Mac itself unreachable | The bot's remote command invocation failed. It cannot conclude how many Kilns are running. |

## Command and result conventions

These proposed conventions make the examples reviewable; the technical design supplies the complete field schema. Internal execution identity protects against reuse of the same PRD path for different work, but is not a second public selector.

- `kiln --help` and `kiln <command> --help` describe inputs and output fields; all commands support `--json`.
- Reads return facts only. Changing commands return operation receipts. Run controls target a PRD path and control context; beginning login targets a PRD path and login scope context. Login completion/cancellation target the existing operation, with its ownership and current eligibility checked under AC-ACT-04.
- A run control context changes when relevant controls or their target change, not whenever another output line arrives. Login scope context changes when the affected runs or their eligibility change.
- Operation lookup uses a PRD path and request ID for ordinary controls or a login operation ID for login. A replay is checked before applying the old control context, so a successfully completed request can return its old receipt.
- Login status is the explicit place to retrieve still-valid authorization instructions. Ordinary operation receipts, output and logs omit transient login secrets.

| Exit | Meaning |
|---|---|
| `0` | Read succeeded, or changing request accepted; inspect operation state for completion |
| `2` | Invalid input, unresolved PRD path, invalid cursor, or request ID reused with different inputs |
| `3` | State, authorization or account conflict; no requested change accepted |
| `4` | Incomplete inventory, unavailable controller/provider, incompatible instance, or indeterminate operation result |

Querying an operation successfully returns `0` even if its recorded outcome is failure. JSON always names that outcome explicitly. A login awaiting the person is an accepted operation, not a blocked terminal process.
