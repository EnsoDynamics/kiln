import { describe, expect, it } from "vitest";
import { PHASES } from "../test-support/fixture-documents.js";
import { dependencyIds, leavesOf, planStartProblems, readPhasePlan, type PhaseFile } from "./phase-plan.js";

const files = (texts: Record<string, string>): PhaseFile[] => Object.entries(texts).map(([fileName, markdown]) => ({ fileName, markdown }));
const leaf = (id: string, criteria = "AC-X-01", dependencies = "None.") =>
  `# Phase ${id}: Title ${id}\n\n## Acceptance criteria covered\n${criteria}\n\n## Phase dependencies\n${dependencies}\n`;

describe("readPhasePlan", () => {
  it("orders top-level phases numerically and puts a split record's children in its slot, in table order", () => {
    const plan = readPhasePlan(
      files({
        "phase-10-last.md": leaf("10"),
        "phase-2-split.md": "# Phase 2: Split\n\n## Split into\n\n| Phase | Covers |\n|---|---|\n| [2b](phase-2b-second.md) | x |\n| [2a](phase-2a-first.md) | y |\n",
        "phase-2a-first.md": leaf("2a"),
        "phase-2b-second.md": leaf("2b"),
        "phase-1-first.md": leaf("1"),
      }),
    );
    expect(plan.problems).toEqual([]);
    expect(plan.phases.map((phase) => phase.id)).toEqual(["1", "2", "2b", "2a", "10"]);
    expect(leavesOf(plan).map((phase) => phase.id)).toEqual(["1", "2b", "2a", "10"]);
    expect(plan.phases.find((phase) => phase.id === "2")?.splitInto).toEqual(["2b", "2a"]);
  });

  it("reads the fixture plan: titles word for word, split suffix dropped, Closed lines before the first section only", () => {
    const plan = readPhasePlan(files(PHASES));
    expect(plan.problems).toEqual([]);
    expect(plan.phases.map((phase) => [phase.id, phase.title, phase.closed])).toEqual([
      ["1", "Return intake", false],
      ["2", "Refunds", false],
      ["2a", "Card refunds", true],
      ["2b", "Store credit", false],
      ["3", "Returns dashboard", false],
    ]);
    const notClosed = readPhasePlan(files({ "phase-1-x.md": "# Phase 1: X\n\n## Notes\n**Closed:** 2026-10-10\n" }));
    expect(notClosed.phases[0]?.closed).toBe(false);
  });

  it("takes a Split into row's id from the file its link points at, not the link text, else from the cell's first word", () => {
    const plan = readPhasePlan(
      files({
        "phase-4-split.md": "# Phase 4: S\n\n## Split into\n\n| Phase | Covers |\n|---|---|\n| [4z](phase-4a-a.md) | x |\n| 4b **Second** | y |\n",
        "phase-4a-a.md": leaf("4a"),
        "phase-4b-b.md": leaf("4b"),
      }),
    );
    expect(plan.problems).toEqual([]);
    expect(plan.phases.map((phase) => phase.id)).toEqual(["4", "4a", "4b"]);
  });

  it("reads a Split into table without its separator row as listing nothing", () => {
    const plan = readPhasePlan(files({ "phase-3-split.md": "# Phase 3: S\n\n## Split into\n\n| Phase 3a | x |\n", "phase-3a-a.md": leaf("3a") }));
    expect(plan.problems).toEqual(["phase-3a-a.md is phase 3a, but phase-3-split.md doesn't list it under ## Split into."]);
  });

  it("names every structural problem with its files", () => {
    const plan = readPhasePlan(
      files({
        "phase-notes.md": "# Notes\n",
        "phase-1-one.md": leaf("1"),
        "phase-1-other.md": leaf("1"),
        "phase-2-refunds.md": "# Phase 2: Refunds\n\n## Split into\n\n| Phase |\n|---|\n| [2a](phase-2a-a.md) |\n| [2c](phase-2c-c.md) |\n| 3a |\n",
        "phase-2a-a.md": leaf("2a"),
        "phase-2d-unlisted.md": leaf("2d"),
        "phase-5a-orphan.md": leaf("5a"),
        "readme.md": "not a phase file",
      }),
    );
    expect(plan.problems).toEqual([
      "phase-1-one.md and phase-1-other.md both have phase id 1.",
      `phase-notes.md has a phase id Kiln can't read: "notes".`,
      "phase-2-refunds.md lists 2c, which has no file.",
      "phase-2-refunds.md lists 3a, which isn't one of its child phases.",
      "phase-2d-unlisted.md is phase 2d, but phase-2-refunds.md doesn't list it under ## Split into.",
      "phase-5a-orphan.md is phase 5a, but there is no phase 5 document to list it.",
    ]);
  });
});

describe("planStartProblems", () => {
  it("passes the fixture plan", () => {
    expect(planStartProblems(readPhasePlan(files(PHASES)), "docs/prds/customer-returns")).toEqual([]);
  });

  it("requires every leaf to cite a criterion, and dependencies to name an earlier phase with a document", () => {
    const plan = readPhasePlan(
      files({
        "phase-1-one.md": leaf("1", "Nothing cited here."),
        "phase-2-refunds.md": leaf("2", "AC-X-02", "3 (later); 5 — missing"),
        "phase-3-three.md": leaf("3", "AC-X-03", "1, 2"),
      }),
    );
    expect(planStartProblems(plan, "docs/prds/gift-cards")).toEqual([
      "docs/prds/gift-cards/phase-1-one.md cites no acceptance criteria.",
      "phase-2-refunds.md depends on phase 3, which comes later in the plan.",
      "phase-2-refunds.md depends on phase 5, which has no phase document.",
    ]);
  });

  it("counts only labels under ## Acceptance criteria covered, not ones named elsewhere in the document", () => {
    const plan = readPhasePlan(
      files({
        "phase-1-one.md": "# Phase 1: One\n\n## Summary\nBuilds AC-X-01 and AC-X-02.\n\n## Phase dependencies\nNone.\n",
        "phase-2-two.md": "# Phase 2: Two\n\n## Summary\nAC-X-03.\n\n## Acceptance criteria covered\n\n## Phase dependencies\nNone.\n",
      }),
    );
    expect(planStartProblems(plan, "docs/prds/x")).toEqual([
      "docs/prds/x/phase-1-one.md cites no acceptance criteria.",
      "docs/prds/x/phase-2-two.md cites no acceptance criteria.",
    ]);
  });

  it("lets a child depend on an earlier sibling of its parent but not a later one, and ignores itself, ancestors and descendants", () => {
    const plan = readPhasePlan(
      files({
        "phase-1-one.md": leaf("1"),
        "phase-2-split.md": "# Phase 2: S\n\n## Split into\n\n| Phase |\n|---|\n| [2a](phase-2a-a.md) |\n| [2b](phase-2b-b.md) |\n\n## Phase dependencies\n2a; 2b\n",
        "phase-2a-a.md": leaf("2a", "AC-X-01", "1; 2; 2a; 3"),
        "phase-2b-b.md": leaf("2b", "AC-X-01", "2a"),
        "phase-3-three.md": leaf("3"),
      }),
    );
    expect(planStartProblems(plan, "docs/prds/x")).toEqual(["phase-2a-a.md depends on phase 3, which comes later in the plan."]);
  });

  it("checks split records' dependencies too", () => {
    const plan = readPhasePlan(
      files({
        "phase-1-split.md": "# Phase 1: S\n\n## Split into\n\n| Phase |\n|---|\n| [1a](phase-1a-a.md) |\n\n## Phase dependencies\n2\n",
        "phase-1a-a.md": leaf("1a"),
        "phase-2-two.md": leaf("2"),
      }),
    );
    expect(planStartProblems(plan, "docs/prds/x")).toEqual(["phase-1-split.md depends on phase 2, which comes later in the plan."]);
  });
});

describe("dependencyIds", () => {
  it.each([
    ["None.", []],
    ["None — this phase stands alone, though it mentions 3.", []],
    ["1 (the notification records); 2a (the retry queue)", ["1", "2a"]],
    ["Phase 1.", ["1"]],
    ["Phases 2a and 2b", ["2a", "2b"]],
    ["2a — card refunds come first", ["2a"]],
    ["- 1\n- 2b\n\n3", ["1", "2b", "3"]],
    ["[Phase 2b](phase-2b-store-credit.md), [the design](technical-design.md)", ["2b"]],
    ["Needs the schema from 2026-10-01 and AC-RET-01, after commit a41c9e2.", []],
    ["Phase 2 must land first because it adds the table.", []],
    ["1 (records (nested) here), 2", ["1", "2"]],
    ["Phase 3 (the dashboard).", ["3"]],
    ["The refund rules land in phase 2, which ships in\nPhase 3.", []],
    ["1 — the records, wrapped\nonto a second line\n\n2", ["1", "2"]],
  ])("reads %j as %j", (text, expected) => {
    expect(dependencyIds(text)).toEqual(expected);
  });

  it("reads no dependencies when the section is absent", () => {
    expect(dependencyIds(undefined)).toEqual([]);
  });
});
