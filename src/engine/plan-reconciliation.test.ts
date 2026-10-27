import { describe, it, expect } from "vitest";
import { normalizedScope } from "./plan-reconciliation.js";

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
});
