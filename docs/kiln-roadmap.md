# Kiln roadmap

What Kiln does next, in order. Each item gets its own PRD when its turn comes. Ideas with no place in the order yet are in [Kiln ideas after v1](design/kiln-after-v1-ideas.md).

## Now: release v1

Phase 6 of the [Kiln v1 PRD](prds/kiln-v1/kiln-v1-prd.md): the proof run and the first npm release. Then the PRD's own close out, run by hand: `delivery-audit`, any completion phases it adds, then `test-audit`. That run is also the first real use of the two audits, and what it shows shapes the next item.

## Next: close out each PRD with the two audits

**What.** Kiln v1 opens the pull request as soon as every phase closes. The Enso Method now closes a split PRD with two more steps, each in a fresh session:

- `delivery-audit` checks that every acceptance criterion is built. It writes no code. Gaps become completion phases at the end of the plan, marked `**Added by delivery audit:**` at the top.
- `test-audit` checks that the tests prove every criterion, and fills the gaps until its `test-audit.md` says `Done`.

Kiln would run both between the last phase and the pull request session, so the pull request opens on a PRD that is built and proven.

**How it would run.**

1. Every leaf is closed and the branch has no `delivery audit complete (whole PRD)` commit: start a delivery audit session on the whole PRD.
2. Completion phases either audit adds are leaves without a Closed line. Kiln's next-phase walk already builds them like any other phase, with the same session prompt and done check.
3. Every leaf is closed after that delivery audit: start test audit sessions on the whole PRD until `test-audit.md` says `Done`, which it says only when nothing waits on delivery. A completion phase the test audit adds is built by step 2, then the test audit runs again.
4. Then the pull request session, as in v1.

**Questions for its PRD.**

- **Done checks.** What each audit session must leave in Git to count as done, in the spirit of the phase done check: the delivery audit's commit, pushed; `test-audit.md`'s Status line and the commits behind it, pushed.
- **Bounding the loop.** How many rounds of test audit, completion phase, test audit before Kiln stops at Needs you instead of looping again. Two is a likely start.
- **On screen.** How the audit sessions appear in the phase plan and the terminal, next to the "PR" row v1 already adds.
- **Settings.** Whether the audits can be turned off for a PRD (on by default), and whether Kiln offers a test audit after every phase, which costs a person an extra chat by hand but costs nothing under Kiln.
- **The pull request.** Whether its description carries what the audits left open: criteria waiting on a sandbox or a person, and behavior changed outside the requirements.

**Why not in v1.** v1 is releasing, and the audits are new. Running them by hand on Kiln v1 first shows what Kiln has to handle before it automates them.

## Later: run a whole PRD roadmap

**What.** `kiln run docs/roadmaps/<name>` takes a [`prd-roadmap`](https://github.com/EnsoDynamics/enso-method) instead of a single PRD. Kiln runs the first PRD in the roadmap to its pull request, then moves on to the next one, and keeps going until the roadmap is done. The roadmap is the whole body of work the person asked for; its PRDs are just the cut, so stopping after each one only waits on a person to type the next command.

Each PRD still ends with its own pull request. Every PRD in a roadmap finishes with something that could go to production, but it doesn't have to go before the next one starts. Kiln leaves the pull request open and carries on.

**Builds on.** The audit close out above, so each PRD is built and proven before Kiln leaves it.

**Questions for its PRD.**

- **PRDs not ready yet.** Whether Kiln runs only PRDs already written, refined and phase split, stopping at Needs you at the first that isn't, or runs the requirements skills itself (PRD, refinement, technical design, review, design refinement, phase split) before building it. Starting with ready PRDs only is the likely first cut.
- **Building on an unmerged PRD.** The next PRD usually needs the last one's code, which sits in an open pull request. The likely answer is stacked pull requests: each PRD's branch starts from the one before, and its pull request targets that branch, so each shows only its own PRD's changes. Kiln v1 can already do this by hand, since the base branch is a setting. What its PRD has to settle: how a fix made in review of an earlier pull request reaches the later branches (merging it forward, never a rebase and force push), how the stack is merged (in order, as merge commits; a squash merge of an earlier one makes the later ones show its commits again), and how deep a stack gets before Kiln waits for a merge.
- **Stopping the run.** Whether a Needs you on one PRD stops the whole roadmap, or Kiln skips to a later PRD whose prior PRDs don't block it.
- **On screen.** How the browser view shows the roadmap: each PRD's status above its phase plan, and which pull requests are open.
- **The roadmap's record.** Whether Kiln marks each PRD done in the roadmap document as it closes, and what counts as the roadmap being done.

**Why not now.** One PRD at a time has to run cleanly first, audits included. The branch question is the real design work here.
