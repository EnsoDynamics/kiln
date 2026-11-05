import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, it, expect } from "vitest";
import { observePlan, retainBaseline, readBaseline, completedScopeProblems } from "./plan-reconciliation.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kiln-comet-plan-")); roots.push(root);
  mkdirSync(join(root, "plan"));
  writeFileSync(join(root, "plan/comet-prd.md"), "# PRD: Comet library\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n");
  writeFileSync(join(root, "plan/comet-technical-design.md"), "# Technical design\nA local catalog.\n");
  writeFileSync(join(root, "plan/phase-1-catalog.md"), "# Phase 1: Catalog\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-COMET-01\n");
  return root;
}
it("retains bytes independently of the checkout, verifies sidecar identity and recognizes a rename", () => {
  const root = fixture(); const active = observePlan(root, "plan");
  const baseline = retainBaseline(join(root, "state"), { formatVersion: 1, normalizerVersion: 1, prdDirectory: "plan", active, sources: [], completions: {} });
  renameSync(join(root, "plan/phase-1-catalog.md"), join(root, "plan/phase-1-books.md"));
  expect(completedScopeProblems(active, observePlan(root, "plan"))).toEqual([]);
  rmSync(join(root, "plan"), { recursive: true });
  expect(readBaseline(join(root, "state"), baseline.id).active.documents).toEqual(active.documents);
  const path = join(root, "state/plans", `${baseline.id}.json`);
  writeFileSync(path, readFileSync(path, "utf8").replace("Catalog", "Changed"));
  expect(() => readBaseline(join(root, "state"), baseline.id)).toThrow("damaged");
});
it("rejects reopening a completed leaf in the active plan", () => {
  const root = fixture(); const accepted = observePlan(root, "plan");
  const file = join(root, "plan/phase-1-catalog.md"); const original = readFileSync(file, "utf8");
  writeFileSync(file, original.replace("**Closed:** 2026-10-01", ""));
  const reopened = observePlan(root, "plan");
  expect(completedScopeProblems(accepted, reopened)).toEqual([expect.stringContaining("Phase 1")]);
});
it("rejects missing linked files, escaping links, symlinks, oversized sources and structural errors", () => {
  const root = fixture(); const file = join(root, "plan/comet-technical-design.md");
  writeFileSync(file, "[Missing](missing.md)"); expect(() => observePlan(root, "plan")).toThrow();
  writeFileSync(file, "[Outside](../../secret.md)"); expect(() => observePlan(root, "plan")).toThrow("escapes");
  writeFileSync(file, "[Link](linked.md)"); symlinkSync(file, join(root, "plan/linked.md")); expect(() => observePlan(root, "plan")).toThrow("symlink");
  writeFileSync(file, "x".repeat(8 * 1024 * 1024)); expect(() => observePlan(root, "plan")).toThrow("plan_too_large");
  writeFileSync(file, "# Design\n"); writeFileSync(join(root, "plan/phase-1a-search.md"), "# Phase 1a: Search\n"); expect(() => observePlan(root, "plan")).toThrow("doesn't list it");
});

it("preserves the current audit contract for optional provenance and mandatory replacement links", () => {
  const root = fixture(); const file = join(root, "plan/comet-technical-design.md");
  writeFileSync(file, '# Design\n[Background](missing.md "kiln:reference")\n');
  expect(Object.keys(observePlan(root, "plan").documents)).not.toContain("plan/missing.md");
  writeFileSync(file, '# Design\nReplaces: [Requirement](missing.md "kiln:reference")\n');
  expect(() => observePlan(root, "plan")).toThrow();
  writeFileSync(file, '# Design\nReplaces: AC-OLD-01 in `plan/missing.md`\n');
  expect(() => observePlan(root, "plan")).toThrow();
  writeFileSync(file, '# Design\n[Requirement](missing.md)\n');
  expect(() => observePlan(root, "plan")).toThrow();
});
