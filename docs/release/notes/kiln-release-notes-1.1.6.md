# Kiln 1.1.6

A finished phase or completion audit stays finished while later work builds, and a stopped
conversation on a Linux machine can be resumed again. Kiln 1.1.5 did not reach npm; its
changes ship here.

## Fixed

- **A finished phase is no longer reopened by a later phase's edits.** Each phase's
  development-delivery decision was tied to the PRD, the technical design and the phase
  document together. A later phase that edited the shared PRD or design made every earlier
  decision out of date, so Kiln went back to Phase 1 and stopped at Needs you. A finished
  phase's decision, and a check you waived on it, now hold until that phase's own document
  changes or the phase is reopened. Split phases and the accounting after the last phase
  follow the same rule.
- **`kiln delivery` works beside a set-aside copy of the saved state.** A renamed copy of a
  PRD's saved state in the same folder made `kiln delivery`, `kiln audit`,
  `kiln preparation` and `kiln add-repository` refuse, because two records claimed the same
  workspace. A session then could not record its delivery decision and the phase stopped at
  Needs you. These commands now ignore a copy whose folder name doesn't match its PRD,
  prefer the record a running Kiln holds, and name the conflicting folders when they still
  refuse.
- **A finished audit is no longer reopened by the phases it added.** A completion audit's
  development-delivery decision was tied to the PRD, the technical design and the phase
  documents as they stood. The completion phases an audit adds edit those documents, so the
  audit's own decision went out of date and Kiln stopped at Needs you, asking for a decision
  that a finished audit can no longer record. A finished audit now keeps the documents its
  check passed against.
- **Resume is offered again on Linux.** Kiln judged every folder under Claude Code's
  history before offering to resume a conversation and refused if any of them was
  group-writable, which Claude Code's own folders are under a common Linux setup. The
  stopped page then said conversation recovery was unavailable. Kiln now judges only the
  history root, the conversation's own folder and its file, and says which path it refused
  and why.

## Changed

- **The top bar shows the Kiln version.** The version of the Kiln serving the page appears
  beside the Kiln mark.

## Upgrade

A run picks up the new rule when it is started with 1.1.6. A phase that finished under an
earlier version is bound to its own document the next time its completion check passes, so
it may stop at Needs you once more; record its delivery decision or choose **Mark complete**
and it stays finished after that. An audit that finished under an earlier version is bound the
same way: choose **Mark complete** once and it stays finished.

```sh
npm install -g @ensodynamics/kiln@1.1.6
```
