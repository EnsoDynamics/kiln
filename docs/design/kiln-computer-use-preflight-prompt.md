# Kiln computer-use preflight prompt

Proposed separate Claude analysis prompt. Run once over the completed PRD, design, and ordered phase plan before implementation, then rerun for affected unfinished phases after document changes. This pass has no implementation or Git authority.

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

Illustrative item (the real result contains **all** leaves):

```json
{
  "source_digest": "PLAN_AND_DOCUMENT_DIGEST",
  "phases": [
    {
      "phase_id": "3",
      "phase_title": "Add notification settings to the staff desktop app",
      "execution_mode": "codex_desktop_handoff",
      "required_capabilities": ["native_desktop_computer_use"],
      "evidence": [{
        "document": "phase-3-desktop-settings.md",
        "criterion_or_step": "AC-DESKTOP-03",
        "reason": "Acceptance requires opening the native app and changing settings through its UI."
      }],
      "unresolved_question": null
    }
  ]
}
```

Kiln validates the digest, IDs, order, titles, source references, and schema, then shows all planned desktop handoffs before Phase 1. Kiln computes the digest from governing requirements and normalized phase content; routine closure markers, completion records, and handoff files are excluded so normal delivery does not invalidate every future route. Substantive requirement, design, ordering, or dependency changes do invalidate affected unfinished routes. The classification is a model judgment and may miss a need; an early guard in `implement-from-requirements` still checks capabilities before edits. A later mismatch stops that phase for a desktop handoff rather than asking the user to perform a few clicks inside a Claude session.
