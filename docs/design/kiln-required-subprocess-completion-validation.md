# Kiln required subprocess completion validation

## Intended behavior

When a subprocess, test run or delegated reviewer is needed to finish the assigned task,
the session waits for its outcome and continues the remaining work. A progress update
saying it is waiting is not a reason to hand the task to the person. This applies to
Claude Code and Codex without adding permissions or retrying an unknown side effect.
Persistent development servers retain their separate readiness and cleanup behavior.

## Incident and fix

The price-publishing incident on 2026-10-31 used Claude Code 2.1.316. Its saved stderr
explicitly reported the ten-minute background wait ceiling and stopped an actively
working reviewer plus its test subprocess. The parent then exited zero with an unfinished
phase. Kiln correctly failed its independent completion checks; no human answer had
actually been requested.

Claude work processes now receive `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, the documented
way to remove that ceiling ([Claude Code documentation](https://code.claude.com/docs/en/headless#background-tasks-at-exit)).
Reported background membership also keeps stdin open across
intermediate results. Older event streams use task/run bookends; complete membership
snapshots take precedence where available. Live-input accounting and stop controls remain.

Both provider adapters append `prompts/required-background-work.txt` on launch and resume.
Codex keeps its existing authoritative descendant-turn drain. It does not acquire Claude's
environment setting or wait indefinitely for every registered terminal: those terminals
can be persistent servers, and the provider is instructed to finish required work before
its final answer. This does not introduce automatic parent-turn retries.

## Automated regression evidence

- Pure event reduction checks complete-membership ordering, legacy completion/failure/stop,
  resumed task identities and malformed membership.
- Real Node process pipes exercise intermediate Claude results while a required reviewer
  remains active, with live input enabled and disabled. Ambient-only watchers do not hold either path
  open, and late membership snapshots cannot reopen terminal gate rows. File latches release the reviewer;
  premature stdin EOF fails the fixture. The test also checks the actual launch environment
  overrides an inherited short ceiling and that the submitted prompt contains the policy.
- Both adapters bind the durable control digest to the exact captured wire prompt,
  including the added instruction and Codex skill prefix. Existing exact-message reply
  confirmation remains intact; a policy addition cannot leave a delivered reply unconfirmed.
- A real-pipe Codex protocol fixture leaves a descendant turn active after the parent ends.
  The attempt cannot end or clean up until a file latch makes that child terminal. It
  starts no additional parent turn. Existing protection, interruption and cleanup tests
  remain in the targeted suite.

These fixtures prove Kiln's lifecycle handling. They do not substitute for live inference.

## Opt-in live provider checks

After `npm ci` and `npm run build`, run either command independently:

```sh
node scripts/proof-run/required-background-work-proof.mjs claude
node scripts/proof-run/required-background-work-proof.mjs codex
```

Each uses a fresh disposable Git repository, requires a fixed finalization command that
checks the worker marker, and asserts native worker/reviewer completion precedes that
parent command. It retains native events and `proof-result.json`
in the printed temporary folder, and touches no product repository or remote. The runs
require the provider's ordinary sign-in and use its allowance. They are intentionally
outside the credential-free CI suite; no nondeterministic model behavior is a CI gate.

On 2026-10-31 both checks passed:

| Provider | Actual exercise | Result |
| --- | --- | --- |
| Claude Code 2.1.316 | A native background reviewer ran the delayed command, delivered its outcome, and the parent then wrote its completion marker | One uninterrupted attempt, exit 0; native child completion observed |
| Codex CLI 0.166.0 | A real delayed command finished before the parent wrote its completion marker | Completed parent turn, no runner failure, tracked process cleanup succeeded |

The Claude proof supplies an inherited 1 ms ceiling, overridden by the production adapter.
It does not claim to reproduce ten minutes of elapsed waiting. The incident's saved stderr,
the documented setting, launch-environment regression and live completion together cover
that mechanism. Cross-platform native provider behavior remains unproved by these macOS
runs. Full product-scale reviews are additional real-world confidence, not claimed here.

## Verification commands

`npm run verify:development` passes: dependency audit, lint, TypeScript/Svelte, 718 unit
tests, release checks and 18 Codex contract proofs. The focused process integration run
passes 46 tests across the two adapters and live-input pipe contracts. The final focused
run of command receipts, routine bot workflows and both adapters passes all 78 tests. A further 29-test
run covers ambient-only completion, live-input contracts and takeover safety; all pass.
The final six-case subprocess regression file also passes, including late-snapshot
settlement and malformed live evidence. The latter must reject visibly after closing
input and draining the provider, rather than holding a finished process open.

The broad integration run also exercises an unchanged audit handback fixture that removes
`technical-design.md` from the original checkout and expects the assigned run to stop.
The same assertion fails identically on untouched baseline commit `48f9e7e` (exported to
a disposable directory and rebuilt), because active runs read their assigned worktree.
That pre-existing fixture failure is outside this change; no assertion was loosened here.
Exact engine launch/resume prompt expectations were deliberately updated for the new
shared instruction, including interruption and usage-limit recovery. Focused reruns pass
with the original account, authority, note and same-session assertions intact.

Two native preparation cases also failed in the broad run, then passed unchanged in
focused reruns on both the fixed tree and untouched baseline: unacknowledged verifier
intent recovery and the actual native hook timeout. Those assertions were not changed.

The unchanged real-browser continuation/history case also fails on both trees: the fixed
run times out waiting for the earlier-delivery history after continuation acceptance;
the untouched baseline exceeds the case's 120-second limit. No browser, continuation or
preparation behavior was changed to absorb these existing suite problems.

The installed-Claude authentication projection case also failed during the broad run,
then passed unchanged in focused runs on both trees. The broad run began before the
final corrections and retains earlier task-accounting, exact-prompt and receipt failures; the
fresh 78-test adapter/command run above exercises the corrected implementation. The
separate exact-Codex-delivery-evidence case also passes unchanged on the final tree.

The broad run completed in 5,011 seconds: 100 files passed, 11 failed; 1,320 tests
passed, 20 failed and 3 were skipped. Five failures are the unchanged audit, browser,
preparation (two cases) and installed-auth cases described above. The remaining 15
loaded earlier versions of this change in the long-lived runner; fresh-process tests
are the evidence for their final implementation. This broad result is not reported
as a clean run of the final tree.

After the broad run ended, one fresh Vitest process reran all 15 corrected cases
across the seven affected test files: all 15 passed (140 unrelated cases filtered
out). No source or test edits followed that run. The final development gate and
78-test focused run also passed after the final source correction.
