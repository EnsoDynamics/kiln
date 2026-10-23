# Codex support for Kiln — Prerequisite proof results

**Recorded:** 2026-10-23 UTC. **Phase:** [1 — Prove Codex can be audited before integration](phase-1-codex-audit-proof.md). **Criterion:** AC-PROOF-02.

**Gate 1: PASS for the corrected prerequisite candidate.** The original grammar failed; it was corrected and the unchanged recorded work was re-audited in this phase. Normal Codex execution remains unavailable. Release support still requires the remaining planned phases.

The final complete audit accounts for **117 policy operations across five conversations**, with no unknown coverage and exactly one outside-workspace finding: the deliberately planted terminal-recovery marker. Its `audit.passed` is correctly **false** because that outside write must fail Stayed in the workspace. Gate 1 passes because complete evidence detects this known negative control. No outside write or unknown evidence was confirmed into a clean audit. The capture reports `gate1: not-evaluated-by-capture`; this document qualifies the combined workflow evidence.

## Actual runtime and workflow

Installed `codex-cli 0.162.1`, macOS, existing ChatGPT authentication, `gpt-6.1-sol` / `high`. The private stdio server returned workspace-write, on-request and auto_review. Provider fallback was disabled on creation. Identity was saved before dispatch. Authoritative contexts record Sol/High for all seven own turns.

The unchanged installed `implement-from-requirements` skill built Slugify in disposable linked worktrees. Its implementation child read and wrote the shared library; separate children ran the published deliverable review and test hardening. The parent ran the published refactor pass. Repository instructions were read. No published skill, Enso Method source or wrapper-syntax prompt was changed for the exercise.

| Required case | Actual evidence / result |
|---|---|
| Published-method parent delivery | Thread `01a168db-2ad0-7061-8338-eadcf8e0876a`, original turn `01a168db-2d88-7223-aa15-16caf6ce233c`; raw and normalized completed |
| Read/write implementation child | Thread `01a168db-ed3d-7760-8561-152fb0908563`; own completed turn, shared-library reads, writes and tests |
| Published review and hardening | Threads `01a168dd-d9ac-71f2-a188-d09bf42e9417` and `01a168de-cf46-7272-a7f0-7ae47fb0b37e`; completed |
| Guarded commit/push in original worktrees | Recorded reviewed escalation for protected linked metadata. API `5d6a9e133e7d13a12ab9f31c98092e8d5287a068`, shared `c41661ec97c1c847c6765d0f5d662d7ded79aef5`; both clean and equal their local bare-origin branch. Real Node 22: 10 API and 5 shared tests passed |
| Native terminal recovery | Actual `codex resume` reopened the same parent with Sol/High; turn `01a168e2-54d7-7270-8a7d-26cce9359e04` completed, terminal exited normally |
| Deliberate outside mutation | Terminal recovery added `outside-sentinel/manual-audit-marker.txt` in a separate disposable checkout; raw call `call_83f44f1a4d614b83b5603fdd77931e59`. Complete audit detects exactly this outside repository |
| Repository added during that conversation | Parent continuation `01a16912-1804-73a3-9d68-c45e98e561f1` ran the existing Kiln `add-repository` CLI against the real local server/Engine. Third assigned root persisted at `2026-10-23T14:03:03.735Z`, after the original work and terminal turn |
| Child reads/writes in added root | Thread `01a16912-fc71-78e0-a40b-ca2821dc3760`, own turn `01a16912-fdfc-7443-82d6-362185896dea`; read instructions, wrote marker/module test; real Node 22 test passed |
| Guarded delivery of added repository | Commit `f5dc9fa131cf4b9a08a42da3bd7a8d6a7c0edb95`, clean worktree and matching local bare-origin branch |
| Complete provider evidence | Full normalized turns, archived/unarchived descendant discovery plus recursive referenced-child union, returned raw paths, source identity/hash/newline checks, repeated tree/source/turn frontiers. All five conversations settled. Native commands/file changes settled and covered by decoded inputs |
| No hidden human wait | Real provider turns completed without a client request. Verified request contracts were separately exercised through real process pipes below |

All fixture pushes were local. The third repository used a GitHub-shaped SSH URL to satisfy the existing validator, with a repository-local SSH command restricted to its local upload/receive-pack. This exercises real setup, Git protection and CLI/Engine addition; it does not claim GitHub network/PR proof. No Kiln Codex executor or normal session was started.

## Request contracts and negative checks

The design permits verified uncommon-form contracts beside actual provider runs. [Request fixtures](../../../test/fixtures/codex-audit-proof/server-request-contracts.json) retain exact generated schemas from installed 0.162.1, source digests and valid examples. Independent regeneration matched all five schemas; Ajv validates the examples. A real Node child sends each request through the actual JSONL transport and checks response/interruption within five seconds:

- Command/file approvals: decline, never session acceptance.
- Permission expansion: empty grant, turn scope.
- MCP elicitation: decline without content.
- Questions and unknown methods: error plus interruption of the recorded thread/turn, preserving the full request; no invented answer.
- Structured asynchronous questions: interruption, including direct questions alongside JSON text without questions.

These are verified contract/pipe tests, not claims that the live provider emitted every rare request. Ordinary unchanged-method execution, native terminal recovery and repository addition above are actual Codex runs.

Regressions reject unknown tools/namespaces, dynamic inputs, unsupported wrappers, mutable or opaque loop sources, unawaited aggregation, unresolved delegation, missing children, incomplete turns, unsettled/orphan commands and uncovered native writes. Temporary Git checkouts prove rename endpoints and failed/missing-result writes. Changed inherited starts and missing recorded shell identity remain inconclusive.

## Initial failure and correction within Phase 1

The first grammar could not decode four parent wrappers and ten child-file wrappers, some copied from parent history. Ordinary callbacks, finite loops, destructuring and spreads exceeded it. Full-history child prefixes also copied an unfinished parent start. [Recorded wrapper fixtures](../../../test/fixtures/codex-audit-proof/wrappers.json) preserve sanitized actual programs, original digests/source IDs and initial outcomes.

The technical design now explicitly defines bounded static dataflow for those forms. The decoder traverses syntax without evaluating JavaScript. Literal inputs remain immutable, tool results opaque, pending promises require await, and bounds limit arrays, program size and traversal. Inherited starts/contexts/calls must match their owning ancestor's hashes. Unchanged programs now decode completely; unknown programs still fail closed. Recorded provider shell context selects the pinned default-shell contract when a failed call lacks a native event; explicit overrides require matching native argv.

Independent review identified and fixed counted-loop reevaluation, async callback/promise handling, missed delegation, unsettled commands, structured-question overwrite and already-signaled-process cleanup. Regressions cover them. These defects were addressed here, not deferred.

## Remaining planned work and owner

| Owner | Remaining obligation |
|---|---|
| [Phase 2](phase-2-codex-agent-selection.md) | Agent/model/account controls, metadata/catalogue transport, migration and browser proof; no work dispatch |
| [Phase 3](phase-3-codex-session-workflow.md) | Execution integration and production evidence reader: bounded paginated memory, persisted frontiers, missing/corrupt/truncated/archived/compacted history and changing-frontier tests; durable stop/resume, process-tree cleanup and confirmation/repair behavior |
| [Phase 4](phase-4-codex-usage-recovery.md) | Actual structured usage refusal and real recovery, account identity and repeat-refusal suppression |
| [Phase 5](phase-5-codex-platform-proof.md) | Native macOS/Linux/Windows package/process/shell matrix, real GitHub PR delivery and assembled two-phase workflow before release claims |

These are the original plan's later obligations. No mandatory gate-1 case is moved there to close this phase. A newly unsupported ordinary operation discovered during integration stays inconclusive and reopens compatibility qualification; it cannot be silently accepted.

## Reproduction and retained evidence

The isolated `scripts/proof-run/codex-*` harness is outside application entry points and packaged files. Acorn and Ajv are pinned development dependencies; production dependency placement belongs to Phase 3.

```
npm ci
npm run test:codex-proof
node scripts/proof-run/codex-audit-proof.mjs seed
node scripts/proof-run/codex-audit-proof.mjs run <folder printed by seed>
node scripts/proof-run/codex-capture-evidence.mjs <same folder>
```

`seed` creates disposable repositories. `run` invokes real inference using existing authentication. `resume <folder> <prompt-file>` continues the saved conversation through a fresh private server. Native recovery needs a terminal in the saved directory: `codex resume <saved thread-id> --no-daemon --model gpt-6.1-sol -c 'model_reasoning_effort="high"'`, preserving interactive permissions and adding the assigned workspace directory. The outside marker must be explicitly authorized in the recovery prompt.

For addition, run `codex-repository-addition-proof.mjs <folder>` separately, then resume with `codex-addition-proof-prompt.txt`; stop the receiver afterward. It serves only the existing addition API. Recapture the full tree. `codex-check-manual-marker.mjs <folder>` reproduces the specific negative witness, never substitutes for full capture.

Owner-only local evidence: `/var/folders/p3/fyw8z5213xn41qkl15tr42d80000gn/T/kiln-codex-audit-a9SUs2`, containing manifest, identities, dispatch/profile, RPC events, normalized history, full audit, negative finding and terminal observation. Raw files remain at provider-returned paths; no database was opened. Local logs may include account/task data and are not committed. Sanitized fixtures and workflow identifiers retain reviewable provenance; temporary logs are not a durable product prerequisite.

Final `npm run verify` passed dependency audit, ESLint, TypeScript/Svelte checks, 471 unit tests, all 13 proof tests and 297 integration tests (two existing skips; integration 74.06 seconds). Deliverable review reports no remaining High/Medium findings; test hardening completed. The post-commit refactor verdict is reported in the session close-out.
