# Kiln idea: Run independent phases in parallel

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

**The idea.** Instead of strictly one phase at a time, Kiln would start a phase whenever it's safe to, even while others are still implementing. Each parallel phase would get its own worktree.

**Where it comes from.** On very large plans with hundreds of phases, a person already does this by hand. One "air traffic controller" prompt reads the session marker logs in `.agent-sessions/` to see which chats are working on what. It then decides whether another phase can safely start alongside them, and hands out continuation prompts for the ones that can.

**Why it's not in v1.** A typical PRD's phases are written to run in order. `phase-split` makes dependencies point backward, and most phases build on the one before. For an ordinary PRD, parallel phases buy little. Sequential v1 already removes the babysitting, which is the main win.

**What it would need to answer first:**
- **Is it safe?** How does Kiln know two phases are independent? Options:
  - the phase docs' declared dependencies;
  - an analysis of which code each phase will touch;
  - a model judgment like the one the controller prompt makes today.
  Whichever it is, a wrong "yes" means merge conflicts or two phases building on different assumptions.
- **Is this a methodology question first?** Should `phase-split` start recording which phases can run in parallel? That would help people running the method by hand as much as Kiln. Any such change should be considered for the method on its own merits.
- **Bringing the work back together.** Each parallel phase runs on its own branch or worktree, so Kiln needs a rule for merging them back into the feature branch, and someone has to own the conflicts.
- **The done check.** It stays per phase, but "pushed" now refers to each phase's own branch, plus the merge back.
- **Stops.** When one phase needs you, Kiln must decide whether the other running phases carry on.
- **Scale.** Should there be a limit on concurrent sessions? Cost and machine load both grow with it.
