# Technical design: Kiln method-neutral completion audits

**PRD:** [Kiln method-neutral completion audits](kiln-method-neutral-audits-prd.md) · **Assumptions:** [EVID-001](kiln-method-neutral-audits-assumptions.md)

## Existing code

**Posture: Narrow.** Keep the audit scheduler (`auditNext`), activity allocation, rows, recovery, development-delivery ownership, the `kiln audit status` and `kiln audit submit` commands, report storage and Kiln-owned snapshots. Replace report validation and remove the provider-evidence catalog from audits. Per-phase done checks, development-delivery receipts and the history reader they use stay unchanged (AC-NEUTRAL-09).

## Report contract, version 2

The session writes `<prd-directory>/kiln-audit-<activityId>.json`, as today.

| Field | Contract |
|---|---|
| `schemaVersion` | `2` |
| `executionId`, `activityId`, `kind` | The assigned identities |
| `outcome` | `passed \| completion_phases \| continue_test \| needs_you` |
| `summary` | Non-empty plain text: what the audit concluded |
| `completionPhases` | Phase IDs this audit appended; `[]` when none |
| `needsYou` | `{problem, action}[]`, non-empty exactly when `outcome` is `needs_you` |
| `changedImplementation` | Test audits only, required boolean: whether it changed anything other than tests and audit records |
| `afterDeliveryActions` | Optional string list: person actions the requirements place after Kiln's delivery, shown at Complete |

Unknown extra fields are ignored, so a session may add detail. Strict JSON parsing (no duplicate keys) and the 8 MiB limit remain. A `schemaVersion` 1 report is refused with `invalid_report` naming the version-2 fields.

The audit prompt (`prompts/audit-session.txt`) states this contract and maps it onto the skill's own ending: the skill found nothing left → `passed`; it added phases → `completion_phases`; it saved test work for another session → `continue_test`; it stopped for a person, or ended normally while listing behavior changed outside the requirements or a person action due before delivery → `needs_you`. Configuration, dependency manifests and helpers runtime code also uses count as implementation for `changedImplementation`. It tells the session to follow the skill as written and to commit and push the report. It names no method vocabulary, record file or marker.

## Admission

`kiln audit submit` keeps idempotent retries, revision and activity checks, attempt retention and Needs you on refusal. Every refusal is recorded as a failing **Audit result recorded** check whose fact is the reason; the refusal code stays in the attempt's `refusal` and the resume prompt. A missing report reads "No audit report at <path> yet." Kiln captures the checked snapshot itself at submission; the session never issues one. Checks, in order:

1. Report readable, size, strict JSON, contract fields above.
2. Plan: the plan reads; each phase in the activity's initial snapshot is still present in order with the same ID, file, scope and closure; appended phases equal `completionPhases` and are open.
3. Routing: `passed` has no open leaf and no appended phase; `completion_phases` appends at least one; `continue_test` is a test audit with no open leaf, no appended phase and at least one assigned-repository file, other than its own report, changed since the initial snapshot, and for a continuation (index above 1) a file outside the requirements documents; `needs_you` has `needsYou` entries, and no other outcome has any.
4. Everything committed and Pushed (`repositoryChecks`), then development-delivery checks. The submission snapshot is stored before these run.
5. Re-read: heads and report bytes unchanged during admission.

A `needs_you` report adds a failing **Audit work resolved** check listing `needsYou`, so its attempt stays unresolved and the activity stops at Needs you; it is never accepted.

`nextAction`: `needs_you` → needs_you; `completion_phases` → implementation; `continue_test` → continue_test; test audit `passed` or `continue_test` with `changedImplementation` → delivery_audit; delivery `passed` → test_audit; test `passed` → final_delivery.

Removed: the evidence catalog and `refreshAuditEvidence`, `provider-evidence.ts`, criterion/part/status validation, red checks, suite pairing, skill-load evidence and digest comparison, `test-audit.md` checks, origin-marker and dependency-section checks, artifact-runtime checks and the test-path classification path in snapshots. `kiln audit snapshot` and `POST /api/audit/snapshot` refuse with `malformed_request` and change nothing. `kiln audit status` keeps identity, revision, report path, accepted results and the latest refusal, without an evidence page.

## Snapshots and currentness

Snapshots remain Kiln-captured per-file digests with the requirement manifest and normalized plan. Capture stops requiring a technical design and stops traversing document links; the required documents are the governing PRD, plan files and any design or assumptions in the PRD folder. Test-path declarations are always empty for new snapshots; old snapshots keep theirs for comparison.

`auditNext` keeps its order, with one change. For a settled version-2 test audit after the latest passing delivery audit, `changedImplementation: true` routes to a fresh delivery audit. Otherwise, when each test audit after that delivery audit started from work delivery-current with its predecessor's accepted snapshot, the delivery audit's own snapshot is not compared; the latest test audit's accepted snapshot is the baseline for both gates, and any later delivery-relevant change routes to a delivery audit. A version-1 test result keeps the earlier gate, compared against the delivery audit's snapshot with its stored test paths. Currentness no longer compares `test-audit.md` with a stored digest; Markdown beside a PRD is already compared through the manifest and plan.

## Development delivery

Audit-owned obligations keep their owner model. A version-2 report carries no criterion keys, so a repair phase or test continuation inherits every criterion of its source audit's obligations. An audit-owned development assessment reads the governing criteria as they are now rather than refusing when they changed since the latest snapshot, because sessions can no longer request one. Reading historical reports goes through one helper that returns appended phase IDs for either version.

## Upgrade and history

Accepted version-1 results stay valid gates under the comparison above, and their rows still show criteria, findings and blockers. Version-2 rows show the summary, `needsYou` and `afterDeliveryActions`. No schema migration is needed: the persisted record shape does not change, and evidence IDs already in saved state are ignored. An older Kiln reading a version-2 result fails loudly (its delivery assignment finds no criterion keys and throws) rather than misrouting, so a schema bump buys nothing a downgrade needs.

## Superseded design

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Portable report, §Commands and routes, §Evidence contract and limits, §Acceptance checks; §One completion decision (the test-audit baseline rule above); §Current Work and Invalidation (test-path classification, method-record comparison, the required technical design and required-document link traversal); §Provider Sessions and Development Delivery (skill-load and command evidence for audits, and the manifest-changed refusal for audit-owned assessments); §Progress and Detail Contract (version-2 rows show the summary and needsYou instead of per-criterion findings).

Replaces in part: `docs/changes/kiln-completion-checks/kiln-completion-checks-technical-design.md`, §Completion and recovery (authenticated audit evidence only; development-delivery receipts remain).

## Validation

Real temporary Git repositories and bare origins: each outcome advances or stops as above; a changed original phase, an unnamed appended phase, a passing report with an open leaf, an unchanged continuation, a v1 report and a dirty or unpushed worktree are refused; a changed skill file does not affect admission; `changedImplementation` routes to a delivery audit; a retired snapshot request changes nothing; a `needs_you` report is never accepted; a missing report leaves the activity at Needs you; an accepted version-1 result still gates; a version-2 repair inherits every criterion of its audit's development obligations. The engine audit workflow runs a delivery and test audit to completion with version-2 reports.
