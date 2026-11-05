import { expect, it } from "vitest";
import { checkArgv, extractPreparation } from "./preparation-documents.js";
import { planSourceFromDocuments } from "./plan-reconciliation.js";
const phase = "# Phase 9: Lending\n\n## Acceptance criteria covered\nAC-X-01\n\n## Phase dependencies\n8.\n\n## Phase-specific notes\n";
const notes = "First step: merge Phase 8. Merge the local branch `wt/access` at `1234567` into this phase's branch before building.\n\nVerify before building: run `npm test` in `.` with timeout `60` seconds.\n\n> Merge branch `wt/access` into this phase's branch.\n";
function extract(text: string, extra: Record<string, string> = {}) {
  const source = planSourceFromDocuments("/fictional", "docs/catalog", { "docs/catalog/catalog-prd.md": "# Catalog\n\n## Acceptance Criteria\n- [ ] **AC-X-01** Catalog.", "docs/catalog/catalog-technical-design.md": "# Design", "docs/catalog/phase-8-access.md": "# Phase 8: Access\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-X-01", "docs/catalog/phase-9-lending.md": phase + text, ...extra });
  return extractPreparation(source, "docs/catalog", source.plan.phases[1]!, ["comet"]);
}
it("extracts the merge, exact source spans, shell-free verification", () => {
  const result = extract(notes); expect(result.problems).toEqual([]);
  expect(result.instructions[0]).toMatchObject({ phaseId: "9", prerequisites: ["8"], repository: "comet", sourceRef: "wt/access", revision: "1234567", destination: "assigned_feature", checks: [{ argv: ["npm", "test"], timeoutSeconds: 60 }] });
  expect(extract(notes.replace("First step:", "**First step:**").replace("Merge the local", "Merge\nthe local")).problems).toEqual([]);
});
it("never extracts quoted/fenced preparation or silently ignores unsupported operands", () => {
  expect(extract(notes.split("\n").map(line => `> ${line}`).join("\n")).instructions).toEqual([]);
  expect(extract("```\n" + notes + "```\n").instructions).toEqual([]);
  expect(extract(notes.replace("before building.", "and push before building.")).problems.join(" ")).toContain("Unsupported preparation operands");
  expect(extract(notes.replace("Phase 8.", "Phase 7.")).problems.join(" ")).toContain("parsed Phase dependencies");
});
it.each(["npm test && git push", "X=1 npm test", "python -c 'print(1)'", "bash script.sh", "npm test > output", "npm test $(whoami)"])("rejects shell/evaluation command %s", command => expect(() => checkArgv(command)).toThrow());
it("retains literal quoted arguments without executing them", () => expect(checkArgv('python -m pytest "tests/catalog cases.py"')).toEqual(["python", "-m", "pytest", "tests/catalog cases.py"]));

it("checks whole linked plan rows and ignores fenced table examples", () => {
  const text = "[Implementation plan](implementation-plan.md)\n\n" + notes;
  const table = "| Phase | Preparation |\n|---|---|\n| Phase 9 | Merge into branch `develop` |\n";
  expect(extract(text, { "docs/catalog/implementation-plan.md": table }).problems.join(" ")).toContain("Contradictory preparation destination");
  expect(extract(text, { "docs/catalog/implementation-plan.md": "```\n" + table + "```\n" }).problems).toEqual([]);
});
