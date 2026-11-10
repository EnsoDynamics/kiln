import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, it, expect } from "vitest";
import { observeActivePlan, observePlan, retainBaseline, readBaseline, completedScopeProblems } from "./plan-reconciliation.js";
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
it("records links it can't follow, and still rejects oversized sources and structural errors (Kiln Linked Documents AC-LINK-01, AC-LINK-02)", () => {
  const root = fixture(); const file = join(root, "plan/comet-technical-design.md");
  const from = "plan/comet-technical-design.md";
  writeFileSync(file, "[Missing](missing.md)\n[Outside](../../secret.md)\n[Absolute](/etc/x.md)\n[Back](a%5Cb.md)\n[Broken](%zz.md)\n[Folder](folder.md)\n[Link](linked.md)\n");
  mkdirSync(join(root, "plan/folder.md")); symlinkSync(join(root, "plan/comet-prd.md"), join(root, "plan/linked.md"));
  const observed = observeActivePlan(root, "plan");
  expect(observed.unfollowed).toEqual([
    { from, href: "../../secret.md", target: "../../secret.md", reason: "outside the repository" },
    { from, href: "/etc/x.md", target: "/etc/x.md", reason: "outside the repository" },
    { from, href: "a%5Cb.md", target: "a%5Cb.md", reason: "not a usable path" },
    { from, href: "missing.md", target: "plan/missing.md", reason: "not in this repository" },
    // Markdown re-encodes a malformed escape, so the link names an ordinary missing file.
    { from, href: "%25zz.md", target: "plan/%zz.md", reason: "not in this repository" },
    { from, href: "folder.md", target: "plan/folder.md", reason: "not a file" },
    { from, href: "linked.md", target: "plan/linked.md", reason: "a symbolic link" },
  ]);
  expect(Object.keys(observed.source.documents).filter(name => !name.startsWith("plan/phase-") && !name.endsWith("-prd.md"))).toEqual([from]);
  expect(observePlan(root, "plan").digest).toBe(observed.source.digest);
  writeFileSync(file, "x".repeat(8 * 1024 * 1024)); expect(() => observePlan(root, "plan")).toThrow("plan_too_large");
  writeFileSync(file, "# Design\n"); writeFileSync(join(root, "plan/phase-1a-search.md"), "# Phase 1a: Search\n"); expect(() => observePlan(root, "plan")).toThrow("doesn't list it");
});

it("still refuses a symlinked document of the PRD's own (AC-LINK-02)", () => {
  const root = fixture(); const file = join(root, "plan/comet-technical-design.md");
  const real = join(root, "elsewhere-design.md"); writeFileSync(real, readFileSync(file, "utf8")); rmSync(file); symlinkSync(real, file);
  expect(() => observePlan(root, "plan")).toThrow("symlink");
});

it("keeps replacement pointers in the PRD's own documents required, and follows other links only when it can (AC-LINK-02)", () => {
  const root = fixture(); const file = join(root, "plan/comet-technical-design.md");
  writeFileSync(file, '# Design\n[Background](missing.md "kiln:reference")\n');
  expect(observeActivePlan(root, "plan")).toMatchObject({ unfollowed: [] });
  writeFileSync(file, '# Design\nReplaces: [Requirement](missing.md "kiln:reference")\n');
  expect(() => observePlan(root, "plan")).toThrow("Linked document is missing: plan/missing.md");
  writeFileSync(file, '# Design\nReplaces: AC-OLD-01 in `plan/missing.md`\n');
  expect(() => observePlan(root, "plan")).toThrow("Linked document is missing: plan/missing.md");
  writeFileSync(file, '# Design\n[Requirement](missing.md)\n');
  expect(observeActivePlan(root, "plan").unfollowed).toEqual([{ from: "plan/comet-technical-design.md", href: "missing.md", target: "plan/missing.md", reason: "not in this repository" }]);
  // A seed's optional link to a file does not make another seed's pointer to it optional.
  writeFileSync(file, '# Design\n[Requirement](missing.md)\n'); writeFileSync(join(root, "plan/comet-assumptions.md"), "Replaces: AC-OLD-01 in `plan/missing.md`\n");
  expect(() => observePlan(root, "plan")).toThrow("Linked document is missing: plan/missing.md");
  rmSync(join(root, "plan/comet-assumptions.md"));
  // A pointer inside a document Kiln reached by a link is a link like any other.
  writeFileSync(file, '# Design\n[Earlier](earlier.md)\n'); writeFileSync(join(root, "plan/earlier.md"), "Replaces: AC-OLD-01 in `plan/gone.md`\n");
  expect(observeActivePlan(root, "plan").unfollowed).toEqual([{ from: "plan/earlier.md", href: "plan/gone.md", target: "plan/gone.md", reason: "not in this repository" }]);
  // Once the file exists, it is read and the plan's digest changes.
  const before = observePlan(root, "plan").digest; writeFileSync(join(root, "plan/gone.md"), "# Earlier\n");
  const after = observeActivePlan(root, "plan");
  expect(after.unfollowed).toEqual([]); expect(after.source.digest).not.toBe(before);
});
