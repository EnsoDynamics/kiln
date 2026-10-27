# Kiln idea: Run a whole PRD roadmap

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

**What.** `kiln run docs/roadmaps/<name>` takes a [`prd-roadmap`](https://github.com/EnsoDynamics/enso-method) instead of a single PRD. Kiln runs the first PRD through its own audits and final delivery, then moves on to the next one, and keeps going until the roadmap is done. The roadmap is the whole body of work the person asked for; its PRDs are just the cut, so stopping after each one only waits on a person to type the next command.

Each PRD retains Kiln's existing final-delivery rules: review pull requests for remaining work across its repositories, or current evidence that authorized work is already integrated. A PRD need not reach production before the next one starts. Where a review PR remains open, roadmap execution can carry on without assuming permission to merge it.

**Builds on.** Existing [automatic completion audits](../changes/kiln-completion-audits/kiln-completion-audits-prd.md), so each PRD is built and proven before Kiln leaves it.

**Questions for its PRD.**

- **PRDs not ready yet.** Whether Kiln runs only PRDs already written, refined and phase split, stopping at Needs you at the first that isn't, or runs the requirements skills itself (PRD, refinement, technical design, review, design refinement, phase split) before building it. Starting with ready PRDs only is the likely first cut.
- **Building on an unmerged PRD.** The next PRD usually needs the last one's code, which sits in an open pull request. The likely answer is stacked pull requests: each PRD's branch starts from the one before, and its pull request targets that branch, so each shows only its own PRD's changes. Kiln v1 can already do this by hand, since the base branch is a setting. What its PRD has to settle: how a fix made in review of an earlier pull request reaches the later branches (merging it forward, never a rebase and force push), how the stack is merged (in order, as merge commits; a squash merge of an earlier one makes the later ones show its commits again), and how deep a stack gets before Kiln waits for a merge.
- **Stopping the run.** Whether a Needs you on one PRD stops the whole roadmap, or Kiln skips to a later PRD whose prior PRDs don't block it.
- **On screen.** How the browser view shows the roadmap: each PRD's status above its phase plan, and which pull requests are open.
- **The roadmap's record.** Whether Kiln marks each PRD done in the roadmap document as it closes, and what counts as the roadmap being done.

**Design still needed.** Single-PRD execution and completion audits already exist. Cross-PRD dependencies, branch integration and roadmap-level recovery remain the design work for this idea.
