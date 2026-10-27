# Live session control — implementation phase plan

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md) · **Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md).

## Implementation order

Build and verify each phase in this order before starting the next. Phase 1 closed on 2026-10-27 with its scoped criteria verified; Phases 2 and 3 remain open. A closed leaf records implementation completion; shared-branch publication is a separate delivery action.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Safe terminal takeover and return](phase-1-safe-takeover-return.md) — **closed 2026-10-27** | Pause a Claude phase or audit at a safe completed operation, release it for terminal use and hand it back through the browser's existing recovery flow. | None; uses the already implemented handoff and completion-audit prerequisites. |
| [2: Live messages and delivery recovery](phase-2-live-message-recovery.md) | Send exact live instructions, show honest receipts and resolve uncertain delivery through the working takeover/return flow. | 1 (shared durable authority, safe release, terminal ownership and phase/audit return). |
| [3: Bot commands for live session control](phase-3-bot-live-controls.md) | Expose live messages, takeover and reviewed-message return through the existing bot interface. | 1 (takeover/return and shared authority); 2 (message accounting/review); external bot-control Phases 1–2 (read/authentication and durable mutation framework). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-LIVE-03, AC-LIVE-04, AC-TAKE-01–05, AC-BACK-01–04 |
| 2 | AC-LIVE-01, AC-LIVE-02, AC-MSG-01–05 |
| 3 | AC-BOT-01, AC-BOT-02 |

All 20 active criteria have one owner. The phase documents mark repeated interface-wide availability, pause wording, serialization and retained-obligation constraints as also applying to later work. Phase 1 proves its browser/provider behavior; Phase 2 completes the composer and messaging states; Phase 3 proves the corresponding bot behavior under AC-BOT-01/02. No criterion is retired or rewritten. Phase 1’s 11 criteria are marked implemented in the parent PRD; the other nine remain unchecked.

## Sizing decision

The whole change combines two substantial runtime capabilities with separate proof surfaces: safe operation-boundary takeover and multi-turn live input. Holding both race/restart models, terminal ownership, phase/audit completion and the bot interface in one implementation session would make verification unreliable. Three phases keep each implementation chat focused on one end-to-end capability.

Phase 1 deliberately keeps the gate, durable hold/admission journal, release accounting, ordinary-terminal ownership, audit return and browser controls together. These are the inseparable safety path of one takeover capability, supported by existing phase recovery and audit evidence code. It owns 11 criteria, including the paired deferred-pause presentation; none can be deferred to a later safety-hardening phase. Its assembled-provider and real-Git proof is part of the build, not a preliminary feasibility investigation or a later validation-only phase.

Phase 2 owns seven criteria and extends that working path with literal input, multiple-result settlement, receipts and uncertainty review through every layer. Messaging comes second because its required recovery would otherwise depend on an unfinished takeover path. Phase 3 is a small, separately deliverable command extension to another PRD's framework, with its own built-CLI/retry proof and external readiness boundary; folding it into browser delivery would create an unnecessary dependency on that framework. These are session-sized capability cuts, not storage/API/UI layers or assumed parallel lanes.

## Proof allocation and closeout

Use the single design's [Evidence and Verification Gates](kiln-live-session-control-technical-design.md#evidence-and-verification-gates) and the investigation's [remaining implementation proof](kiln-live-session-control-investigation.md#design-decisions-and-remaining-implementation-proof). Phase 1 owns safe yield, exclusive terminal return, takeover/restart/hand-back engine and Git cases, takeover HTTP races and browser pause/return states. Phase 2 owns literal-input/lifecycle and message durability cases, message-versus-takeover races, HTTP receipt/review and all remaining browser states. Phase 3 owns built-CLI and cross-interface retry/target/review cases. Each phase proves its affected compatibility boundaries and runs the repository's current full verification gate before its implementation commit.

Provider feasibility recorded during refinement is not assembled-product proof. Phases 1–2 do not depend on bot delivery; if bot code lands first, both reuse its shared journal contract. The bot prerequisite is checked again when Phase 3 becomes next; this plan does not declare that separate track complete or take ownership of it. Add earlier-design replacement back-pointers only as the implementing phase makes them true.

After all three leaves close, run whole-PRD delivery audit, then test audit under the implementation lifecycle. They are this PRD's closeout, not extra planned implementation phases. The next implementation unit is Phase 2, after Phase 1 is delivered to the shared branch.
