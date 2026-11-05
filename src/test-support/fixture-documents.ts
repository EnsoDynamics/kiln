// A small, complete Enso Method PRD directory, as the skills write it, for tests: phase 2 is
// split into 2a and 2b, and 2a is already closed.

export const FOLDER = "customer-returns";

export const PRD = `# PRD: Customer returns

## Acceptance Criteria

### Intake

- [ ] **AC-RET-01 — Return intake.** A customer starts a return.
- [x] **AC-RET-02 — Refund to card.** Refunds go back to the card.
  - sub-point that isn't a criterion
- [ ] **AC-RET-03 — Store credit.** Credit instead of a refund.
  Superseded in part by: AC-OTHER-01 in another PRD (still counted).
- [ ] **AC-RET-04 — Old flow.** Replaced.
  Superseded by: AC-NEW-02 in docs/changes/returns-v2.
- [ ] **AC-RET-05 — retired.** Merged into AC-RET-01.
- [ ] **AC-DASH-01 — Returns dashboard.** Staff see open returns.

Replaces: AC-LEGACY-09 (a label in prose isn't a criterion).
`;

export const DESIGN = `# Technical Design: Customer returns

| Criteria | Where |
|---|---|
| AC-RET-01 to 03 | Intake |
| AC-DASH-01 | Dashboard |
`;

export const ASSUMPTIONS = `# Customer returns - Business Assumptions

## Business Rules

### BR-001. Do refunds go to the original card?

**Assumption**: yes.

### BR-002. Is store credit worth 110%? ✅ VALIDATED

**Assumption**: yes.

### BR-003. Is the dashboard staff-only?

**Assumption**: yes.

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| BR-000 | Returns open for 30 days | 2026-10-01 | PRD AC-RET-01 |
`;

export const PHASES: Record<string, string> = {
  "phase-1-return-intake.md": `# Phase 1: Return intake

**Parent PRD:** docs/prds/customer-returns/customer-returns-prd.md

## Acceptance criteria covered
AC-RET-01

## Phase dependencies
None.
`,
  "phase-2-refunds.md": `# Phase 2: Refunds — split into 2a and 2b

## Split into

| Phase | Document | Covers |
|---|---|---|
| [2a](phase-2a-card-refunds.md) | Card refunds | AC-RET-02 |
| [2b](phase-2b-store-credit.md) | Store credit | AC-RET-03 |

## Phase dependencies
1 (return intake)
`,
  "phase-2a-card-refunds.md": `# Phase 2a: Card refunds
**Closed:** 2026-10-10

## Acceptance criteria covered
AC-RET-02

## Phase dependencies
Phase 1.
`,
  "phase-2b-store-credit.md": `# Phase 2b: Store credit

## Acceptance criteria covered
AC-RET-03

## Phase dependencies
2a — card refunds come first
`,
  "phase-3-returns-dashboard.md": `# Phase 3: Returns dashboard

## Acceptance criteria covered
AC-DASH-01

## Phase dependencies
- [Phase 2b](phase-2b-store-credit.md)
- Needs the schema from 2026-10-01 and commit a41c9e2 (prose isn't read).
`,
};

/** Every file of the fixture PRD directory, keyed by file name. */
export function prdDirectoryFiles(): Record<string, string> {
  return {
    [`${FOLDER}-prd.md`]: PRD,
    "technical-design.md": DESIGN,
    "assumptions.md": ASSUMPTIONS,
    ...PHASES,
  };
}
