# Kiln idea: Computer-use preflight and Codex desktop handoff

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

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
