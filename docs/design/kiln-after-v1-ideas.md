# Kiln ideas after v1

**Not part of v1.** Nothing here is designed in detail or scheduled. These ideas came up while designing v1 and were deliberately left out. Each needs its own research before it becomes a design. v1 itself is described in the [Kiln v1 PRD](../prds/kiln-v1/kiln-v1-prd.md) and the [Kiln architecture proposal](kiln-architecture-proposal.md).

## Run independent phases in parallel

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

## Computer-use preflight and Codex desktop handoff

Before the first phase starts, a separate model pass would classify which phases need a native desktop app. Those phases would be handed to Codex desktop with a prepared prompt, and Kiln would continue once the same done check passes. In v1, such a phase simply stops and comes to you like any other stop. A first draft of the classifier prompt, kept for whoever designs this:

```text
Classify native desktop computer-use needs for an already-written PRD and its executable leaf phases. Do not implement, edit files, create phases, or reorder the plan.

Read the PRD {PRD_PATH}, design {DESIGN_PATH}, ordered plan {PLAN_PATH}, and every leaf phase file {PHASE_PATHS}. For each phase, inspect setup, main implementation, acceptance criteria, deliverable review, test hardening, and final verification.

Choose exactly one route for every leaf:
- claude_unattended: no known required action needs native desktop computer use;
- codex_desktop_handoff: a required action needs seeing and operating a macOS or Windows app or OS UI;
- unresolved_capability: read-only investigation cannot resolve a material capability question.

Browser-only automation does not satisfy native desktop use. UI source code alone does not require desktop use. Do not route to desktop merely because work is difficult. Cite each decisive phase document and acceptance criterion or required step. Explain the specific UI action, or why code, tests, and APIs suffice. Do not infer that a Codex CLI feature flag supplies supported unattended desktop control. For an ambiguity, return the exact unresolved question rather than guessing Claude is safe.

Return only JSON matching the supplied schema, with exactly one item per leaf in source-plan order. Keep phase IDs and titles verbatim and echo Kiln's source-document digest. No prose outside JSON.
```

## Codex as an unattended agent

Codex would run ordinary phases headlessly, the way Claude Code does in v1. This needs the same four things v1 relies on: a session ID Kiln chooses, live output, no permission prompts, and a resume command for a person.

## Review each phase before commit

In this mode, Kiln wouldn't authorize commits. `implement-from-requirements` already stages its work and hands the commit to the person in that case. Kiln would show "ready for your review" when the phase is closed and staged. After you look at the diff, Commit and continue would resume the session with "commit and push".

## Merge the final PR

Today Kiln stops at "PR ready for review". With authority to merge, Kiln would carry through CI and the merge, and Kiln would confirm the merged state.

## Desktop app

This is a wrapper around the local web view, mainly so you can drop a PRD folder onto it. A browser page can't learn the path of a dropped folder. Worth building only if the command line plus web view proves awkward.

## A "why it stopped" headline

When a phase ends without being done, Kiln could ask the stopped session itself, through a forked headless resume, for a one-line reason to show above its last message. This would use the person's own Claude login, not a separate model service.

## A background service

In v1, `kiln run` runs in the foreground of its terminal, and closing the terminal interrupts Kiln until `kiln run` picks it back up. A background service (launchd, systemd or a Windows service) would keep Kiln going with no terminal open. Worth building only if real use shows that interruptions from closed terminals cost more than the cheap resume makes them.

## Notifications

System notifications when a phase needs you and when the PR is ready, so you hear about a stop without watching the browser tab. v1 shows everything in the browser view only.

## A home screen

A screen that lists a repository's PRDs, or accepts a dropped PRD folder, as a way in besides `kiln run <PRD folder>`. A browser page can't learn the path of a dropped folder, so dropping needs a desktop app.

## More terminal commands

`kiln status`, `kiln logs`, `kiln open` and `kiln pause`. In v1 the browser view does all of these, and `kiln run` is the only command.

Business feedback (2026-10-17) widens this: any action the browser view offers should later be possible from outside it, including from a chat bot the person drives from a phone. The v1 technical design keeps that open ("Control From Outside the Browser"); reaching Kiln from off the machine needs its own design.

## An end-of-PRD summary

A panel on the Complete screen with how often Kiln needed you, how many sessions ran, and the assumptions still awaiting stakeholder feedback.

## Codex usage limits

When Codex becomes an agent option, its app-server's `account/rateLimits/read` gives the same 5-hour and weekly percentages and reset times, so the Claude account card can become an agent account card.
