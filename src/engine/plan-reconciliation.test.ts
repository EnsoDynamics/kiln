import { describe, it, expect } from "vitest";
import { normalizedScope, PLAN_LIMIT, PlanCapacityError } from "./plan-reconciliation.js";

describe("versioned structural scope comparison", () => {
  it("ignores emphasis, wrapping, checkbox status and historical closure metadata", () => {
    const first = "# Phase 1: Comet catalog\n\n**Closed:** 2026-10-01\n\n## Summary\nA **clear** catalog\nfor everyone.\n\n- [x] Search titles\n";
    const equivalent = "# Phase 1: Comet catalog\n\n**Closed:** 2026-10-02\n\n## Summary\nA clear catalog for everyone.\n\n* [ ] Search titles\n";
    expect(normalizedScope(first)).toBe(normalizedScope(equivalent));
    expect(normalizedScope(first.replace("everyone", "librarians"))).not.toBe(normalizedScope(first));
    expect(normalizedScope(first.replace("Comet catalog", "Comet lending"))).not.toBe(normalizedScope(first));
  });
  it("retains code, section boundaries and non-phase link destinations", () => {
    for (const [a, b] of [["`a  b`", "`a b`"], ["## Summary\nWords", "### Summary\nWords"], ["[Guide](guide.md)", "[Guide](other.md)"], ["```js\na\n```", "```js\nb\n```"]]) expect(normalizedScope(a!)).not.toBe(normalizedScope(b!));
    expect(normalizedScope("[Phase](phase-1-old.md#summary)", new Map([["phase-1-old.md", "1"]]))).not.toBe(normalizedScope("[Phase](phase-1-old.md#dependencies)", new Map([["phase-1-old.md", "1"]])));
    expect(normalizedScope("Return [x] literally")).not.toBe(normalizedScope("Return [ ] literally"));
    expect(normalizedScope("[Phase](phase-1-old.md)", new Map([["phase-1-old.md", "1"]]))).toBe(normalizedScope("[Phase](phase-1-new.md)", new Map([["phase-1-new.md", "1"]])));
  });
  it.each(["phase-2-old.md", "./phase-2-old.md", "../comet/phase-2-old.md", "x/../phase-2-old.md", "%70hase-2-old.md", "phase%2D2-old.md"])("resolves %s relative to the containing phase before mapping its identity", href => {
    const document = "docs/comet/phase-1-catalog.md";
    const old = new Map([["docs/comet/phase-2-old.md", "2"]]);
    const renamed = new Map([["docs/comet/phase-2-new.md", "2"]]);
    const scope = (target: string, links = old) => normalizedScope(`[Dependency](${target}?mode=read#summary)`, links, document);
    expect(scope(href)).toBe(scope("phase-2-new.md", renamed));
    expect(scope(href)).not.toBe(scope("phase-2-new.md", new Map([["docs/comet/phase-2-new.md", "3"]])));
    expect(scope(href)).not.toBe(normalizedScope(`[Dependency](${href}?mode=write#summary)`, old, document));
    expect(scope(href)).not.toBe(normalizedScope(`[Dependency](${href}?mode=read#other)`, old, document));
  });
  it("does not alias remote, unsafe, unrelated or encoded fragment targets to local phases", () => {
    const links = new Map([["docs/comet/phase-2.md", "2"]]);
    const scope = (target: string) => normalizedScope(`[Guide](${target})`, links, "docs/comet/phase-1.md");
    for (const href of ["https://example.com/docs/comet/phase-2.md", "/docs/comet/phase-2.md", "../../../../docs/comet/phase-2.md", "../other/phase-2.md", "phase-2.md%23summary", "phase-2.md%3Fmode=read", "phase-2.md%00", "..%5Ccomet%5Cphase-2.md"]) expect(scope(href)).not.toBe(scope("phase-2.md"));
  });
});


it("reports actual immutable accounting/proposal writer and reader capacity before any publication", async () => {
  const { mkdtempSync, readdirSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const { retainCompletionAccounting, readCompletionAccounting } = await import("./completed-plan-accounting.js");
  const { retainContinuationProposal, readContinuationProposal } = await import("./continuation-readiness.js");
  const root = mkdtempSync(join(tmpdir(), "kiln-capacity-"));
  try {
    const text = "x".repeat(PLAN_LIMIT);
    const accounting = { formatVersion: 1 as const, baselineId: "base", candidateDigest: "candidate", leaves: [{ id: "1", title: "Comet", file: "phase-1.md", classification: "externally_unverified" as const, problems: [text], repositories: [] }], references: [] };
    expect(() => retainCompletionAccounting(root, accounting)).toThrow(PlanCapacityError);
    const proposal = { formatVersion: 1 as const, id: "a".repeat(64), completedExecutionId: "old", baselineId: "base", candidateDigest: "candidate", added: [], readiness: "blocked" as const, problems: [text], prerequisites: [], repositories: [], preparation: [], settingsDigest: "settings" };
    expect(() => retainContinuationProposal(root, proposal)).toThrow(PlanCapacityError);
    expect(readdirSync(root)).toEqual([]);
    for (const folder of ["completion-accounting", "continuation-proposals"]) { mkdirSync(join(root, folder)); writeFileSync(join(root, folder, `${proposal.id}.json`), text + "x"); }
    expect(() => readCompletionAccounting(root, proposal.id)).toThrow(PlanCapacityError);
    expect(() => readContinuationProposal(root, proposal.id)).toThrow(PlanCapacityError);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
