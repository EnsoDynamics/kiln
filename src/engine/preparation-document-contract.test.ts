import { expect, it } from "vitest";
import { extractPreparation } from "./preparation-documents.js";
import { planSourceFromDocuments } from "./plan-reconciliation.js";

// AC-CONTINUE-07: ordinary document input at the extraction boundary. No commands run.
const file = "docs/catalog/phase-9-lending.md";
const opening = "First step: merge Phase 8. Merge the local branch `wt/access` at `1234567` into this phase's branch before building.";
const check = "Verify before building: run `npm test`.";

function extract(notes: string, dependencies = "8.", linked: Record<string, string> = {}) {
  const documents = {
    "docs/catalog/catalog-prd.md": "# Catalog\n\n## Acceptance Criteria\n- [ ] **AC-X-01** Catalog.\n",
    "docs/catalog/catalog-technical-design.md": "# Design\n",
    "docs/catalog/phase-7-search.md": "# Phase 7: Search\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-X-01\n",
    "docs/catalog/phase-8-access.md": "# Phase 8: Access\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-X-01\n",
    [file]: `# Phase 9: Lending\n\n## Acceptance criteria covered\nAC-X-01\n\n## Phase dependencies\n${dependencies}\n\n## Phase-specific notes\n${notes}\n`,
    ...linked,
  };
  const source = planSourceFromDocuments("/fictional", "docs/catalog", documents);
  return extractPreparation(source, "docs/catalog", source.plan.phases.find(phase => phase.id === "9")!, ["comet"]);
}

it("retains every prerequisite in a multiple-phase First step without adding a whole-PRD audit dependency", () => {
  const first = opening.replace("Phase 8.", "Phase 7 and Phase 8 and the whole-PRD test audit.");
  const result = extract(`${first}\n\n${check}`, "7 and 8.");
  expect(result.problems).toEqual([]);
  expect(result.instructions).toHaveLength(1);
  expect(result.instructions[0]).toMatchObject({ phaseId: "9", prerequisites: ["7", "8"], repository: "comet", sourceRef: "wt/access", revision: "1234567", destination: "assigned_feature" });
  expect(result.instructions[0]!.spans).toEqual([
    { file, line: 10, endLine: 10, text: first, section: "Phase-specific notes", links: [] },
    { file, line: 12, endLine: 12, text: check, section: "Phase-specific notes", links: [] },
  ]);
});

it("keeps a single prerequisite when the First step ends with the whole-PRD test audit", () => {
  const result = extract(`${opening.replace("Phase 8.", "Phase 8 and the whole-PRD test audit.")}\n\n${check}`);
  expect(result.problems).toEqual([]);
  expect(result.instructions.map(item => item.prerequisites)).toEqual([["8"]]);
});

it.each(["dependencies", "linked row", "linked amendment"] as const)("requires preparation destinations to agree with %s and identifies its exact span", location => {
  const path = "docs/catalog/implementation-plan.md";
  const linkedText = (target: string) => location === "linked row"
    ? `| Phase | Preparation |\n|---|---|\n| Phase 9 | Merge into branch \`${target}\` |\n`
    : `# Amendment\n\nPhase 9: merge to branch \`${target}\`.\n`;
  const prepare = (target: string) => extract(
    `[Implementation plan](implementation-plan.md)\n\n${opening}\n\n${check}`,
    location === "dependencies" ? `8 (Integrated in \`${target}\`).` : "8.",
    location === "dependencies" ? {} : { [path]: linkedText(target) },
  );
  // All three places may agree with an explicitly named configured target.
  const consistentNotes = `[Implementation plan](implementation-plan.md)\n\n${opening.replace("this phase's branch", "branch `develop`")}\n\n${check}`;
  const consistent = extract(consistentNotes, location === "dependencies" ? "8 (Integrated in `develop`)." : "8.", location === "dependencies" ? {} : { [path]: linkedText("develop") });
  expect(consistent.problems).toEqual([]);
  expect(consistent.instructions[0]!.destination).toBe("develop");

  const mismatch = prepare("develop");
  expect(mismatch.problems).toEqual([
    `${location === "dependencies" ? file + ":7–7" : path + ":3–3"}: Contradictory preparation destination develop; the preparation item names assigned_feature. Every destination assertion must agree. Reconcile the phase/plan prose and commit the coherent documents, then check again.`,
  ]);
  expect(mismatch.instructions[0]!.spans).toContainEqual(expect.objectContaining({ file: location === "dependencies" ? file : path, line: location === "dependencies" ? 7 : 3, endLine: location === "dependencies" ? 7 : 3 }));
});

it.each([
  { suffix: "", directory: ".", timeoutSeconds: 1800 },
  { suffix: " in `checks/catalog`", directory: "checks/catalog", timeoutSeconds: 1800 },
  { suffix: " with timeout `1` seconds", directory: ".", timeoutSeconds: 1 },
  { suffix: " in `checks/catalog` with timeout `86400` seconds", directory: "checks/catalog", timeoutSeconds: 86400 },
])("retains verification directory and timeout at the documented boundary: $suffix", ({ suffix, directory, timeoutSeconds }) => {
  const result = extract(`${opening}\n\nVerify before building: run \`npm test\`${suffix}.`);
  expect(result.problems).toEqual([]);
  expect(result.instructions[0]!.checks).toEqual([
    { command: "npm test", argv: ["npm", "test"], directory, timeoutSeconds, span: { file, line: 12, endLine: 12, text: `Verify before building: run \`npm test\`${suffix}.`, section: "Phase-specific notes", links: [] } },
  ]);
});

it.each([0, 86401])("blocks out-of-range verification timeout %s with its exact instruction and recovery", timeout => {
  const result = extract(`${opening}\n\nVerify before building: run \`npm test\` with timeout \`${timeout}\` seconds.`);
  expect(result.instructions[0]!.checks).toEqual([]);
  expect(result.problems).toEqual([
    `${file}:12–12: Verification timeout must be 1–86400 seconds. Reconcile the phase/plan prose and commit the coherent documents, then check again.`,
    `${file}:10–10: Preparation requires verification: Verify before building: run \`npm test\`. Reconcile the phase/plan prose and commit the coherent documents, then check again.`,
  ]);
});

it.each([
  { name: "missing", verification: "", reason: "Preparation requires verification: Verify before building: run `npm test`.", line: 10 },
  { name: "unsupported prose", verification: "Verify before building: run all the tests.", reason: "Unsupported verification. Use: Verify before building: run `npm test` in `.` with timeout `1800` seconds.", line: 12 },
  { name: "unsupported subordinate instruction", verification: "After merging, run all the tests.", reason: "Unsupported preparation instruction; use the documented merge and Verify before building forms.", line: 12 },
])("blocks $name verification with a supported replacement and source span", ({ verification, reason, line }) => {
  const result = extract(`${opening}\n\n${verification}`);
  expect(result.instructions[0]!.checks).toEqual([]);
  expect(result.problems[0]).toBe(`${file}:${line}–${line}: ${reason} Reconcile the phase/plan prose and commit the coherent documents, then check again.`);
  expect(result.problems).toContain(`${file}:10–10: Preparation requires verification: Verify before building: run \`npm test\`. Reconcile the phase/plan prose and commit the coherent documents, then check again.`);
});
