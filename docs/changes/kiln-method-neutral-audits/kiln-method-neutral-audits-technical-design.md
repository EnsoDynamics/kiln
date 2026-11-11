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
| `needsYou` | `{id?, problem, action}[]`: non-empty when `outcome` is `needs_you`, allowed with `completion_phases` and `continue_test`; with `passed`, it may list outstanding items again by `id` (no new item), which ride to the next audit, except that a test audit with `changedImplementation` false, which leads to final delivery, lists none. `id` names an outstanding item listed again; an entry without one is a new item |
| `settled` | Optional `{id, how}[]`: each outstanding item this audit found settled, and how |
| `changedImplementation` | Test audits only, required boolean: whether it changed anything other than tests and audit records |
| `afterDeliveryActions` | Optional string list: person actions the requirements place after Kiln's delivery, shown at Complete |

Unknown extra fields are ignored, so a session may add detail. Strict JSON parsing (no duplicate keys) and the 8 MiB limit remain. A `schemaVersion` 1 report is refused with `invalid_report` naming the version-2 fields.

The audit prompt (`prompts/audit-session.txt`) states this contract and maps it onto the skill's own ending: the skill found nothing left → `passed`; it added phases → `completion_phases`; it saved test work for another session → `continue_test`; either may list in `needsYou` what a person must decide or do that the added phases or saved work do not depend on. An audit that found nothing to build reports `passed` and lists each still-open outstanding item again by `id`, so a clean audit does not stop Kiln on an item the next audit does not depend on; a test audit that changed only tests passes only with every item settled. It stopped for a person, ended normally while listing behavior changed outside the requirements or a person action due before delivery, or added phases that depend on a person's answer → `needs_you`. The prompt lists every outstanding item with its ID and the audit that listed it, and tells the session to account for each: in `needsYou` with its `id` when still open, or in `settled` with how. Configuration, dependency manifests and helpers runtime code also uses count as implementation for `changedImplementation`. It tells the session to follow the skill as written and to commit and push the report. It names no method vocabulary, record file or marker.

## Admission

Superseded in part by: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Coverage and §Audits Marked Complete (the no-open-phase routing rule counts phases closed or skipped by waiver as closed; a waived attempt counts as AC-WAIVE-12 says).

`kiln audit submit` keeps idempotent retries, revision and activity checks, attempt retention and Needs you on refusal. Every refusal is recorded as a failing **Audit result recorded** check whose fact is the reason; the refusal code stays in the attempt's `refusal` and the resume prompt. A missing report reads "No audit report at <path> yet." Kiln captures the checked snapshot itself at submission; the session never issues one. Checks, in order:

1. Report readable, size, strict JSON, contract fields above.
2. Plan: the plan reads; each phase in the activity's initial snapshot is still present in order with the same ID, file, scope and closure; appended phases equal `completionPhases` and are open.
3. Routing: `passed` has no open leaf and no appended phase; `completion_phases` appends at least one; `continue_test` is a test audit with no open leaf, no appended phase and at least one assigned-repository file, other than its own report, changed since the initial snapshot, and for a continuation (index above 1) a file outside the requirements documents; `needs_you` has `needsYou` entries; `passed` has only entries with an outstanding `id`, and none from a test audit with `changedImplementation` false, so no accepted report leads to final delivery with an item open. Items: every outstanding item appears exactly once, in `needsYou` by `id` or in `settled`; an unknown or repeated ID is refused, and a report that omits one is refused naming each missing ID and its problem.
4. Everything committed and Pushed (`repositoryChecks`), then development-delivery checks. The submission snapshot is stored before these run.
5. Re-read: heads and report bytes unchanged during admission.

A `needs_you` report adds a failing **Audit work resolved** check listing `needsYou`, so its attempt stays unresolved and the activity stops at Needs you; it is never accepted. A `completion_phases` or `continue_test` report with `needsYou` entries is accepted and routes as its outcome says.

**Outstanding items.** `src/audit/person-items.ts` derives them, in activity order, from accepted version-2 results only: each new `needsYou` entry becomes item `item-<n>`, numbered in order across the execution; an entry with an `id` keeps that item outstanding with its latest wording; a `settled` entry moves the item to the settled list with the settling audit and `how`. A result marked complete without being accepted neither adds nor settles, so its outstanding items carry to the next audit; a `needs_you` attempt is never accepted, so it changes nothing until the resumed audit's report is. Admission checks a report against the items outstanding before its activity. Nothing new is persisted: the ledger is recomputed from immutable accepted results. The audit prompt's **Items earlier audits left for a person** section lists the outstanding items; the final-delivery prompt asks for the settled ones in the pull request description (each as listed by, settled by, how), and adds the outstanding ones only if a waiver left some open.

**Display.** An audit row's detail shows the items it listed and, for each item it settled, "Listed by <audit>, settled by <audit>: <how>". Its plan row reads "N items waiting for you" until a later audit's report is accepted (one marked complete in between settles nothing), and "listed N items for you" after.

`nextAction`: `needs_you` → needs_you; `completion_phases` → implementation; `continue_test` → continue_test; test audit `passed` or `continue_test` with `changedImplementation` → delivery_audit; delivery `passed` → test_audit; test `passed` → final_delivery.

Removed: the evidence catalog and `refreshAuditEvidence`, `provider-evidence.ts`, criterion/part/status validation, red checks, suite pairing, skill-load evidence and digest comparison, `test-audit.md` checks, origin-marker and dependency-section checks, artifact-runtime checks and the test-path classification path in snapshots. `kiln audit snapshot` and `POST /api/audit/snapshot` refuse with `malformed_request` and change nothing. `kiln audit status` keeps identity, revision, report path, accepted results and the latest refusal, without an evidence page.

## Snapshots and currentness

Superseded in part by: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Audits Marked Complete (a waived audit's baseline is its waiver snapshot).

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

Real temporary Git repositories and bare origins: each outcome advances or stops as above; a changed original phase, an unnamed appended phase, a passing report with an open leaf, an unchanged continuation, a v1 report and a dirty or unpushed worktree are refused; a changed skill file does not affect admission; `changedImplementation` routes to a delivery audit; a retired snapshot request changes nothing; a `needs_you` report is never accepted, with or without appended phases; a `completion_phases` report (delivery) or a test audit's report with `changedImplementation` and `needsYou` entries is accepted, routes as before, and its items reach the next audit's prompt; a report that omits an outstanding item is refused naming it; settling shows on the settling audit's detail and in the final-delivery prompt; an audit marked complete keeps items outstanding; a missing report leaves the activity at Needs you; an accepted version-1 result still gates; a version-2 repair inherits every criterion of its audit's development obligations. The engine audit workflow runs a delivery and test audit to completion with version-2 reports.
