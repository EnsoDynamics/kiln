// Which criterion a bold title in a PRD's Acceptance Criteria is (Kiln Completion Audits
// technical design, "The requirement manifest").

import { describe, expect, it } from "vitest";
import { PRD } from "../test-support/fixture-documents.js";
import { criterionIdentity, requirementManifest } from "./snapshots.js";

const manifest = (criteria: string) => requirementManifest("shop", "docs/returns-prd.md", "blob", `# PRD\n\n## Acceptance Criteria\n\n${criteria}\n`);
const labels = (criteria: string) => manifest(criteria).criteria.map(criterion => criterion.label);

describe("a criterion's identity is the label that opens its title", () => {
  // Retirement notes as phase-split writes them, three from Kiln's own PRDs; each was refused as ambiguous.
  it.each([
    ["- **AC-PRS-01 — retired, split into AC-PRS-05 and AC-PRS-06.**", "AC-PRS-01"],
    ["- **AC-CONTINUE-02 — retired, split into AC-CONTINUE-06 and AC-CONTINUE-07.**", "AC-CONTINUE-02"],
    ["- **AC-CONTINUE-04 — retired, split into AC-CONTINUE-08 and AC-CONTINUE-09.**", "AC-CONTINUE-04"],
    ["- **AC-RET-01 — retired, split into AC-RET-05, AC-RET-06 and AC-RET-07.**", "AC-RET-01"],
    ["- **AC-BACK-02 — retired; what Kiln says about an edited finished phase is now in AC-BACK-01.**", "AC-BACK-02"],
  ])("reads the retirement note %s as %s", (note, label) => {
    expect(labels(note)).toEqual([label]);
  });

  it("keeps a retirement note beside the criteria it names, each under its own label", () => {
    const read = manifest([
      "- [ ] **AC-RET-01 — Return intake.** A customer starts a return.",
      "- **AC-RET-02 — retired, split into AC-RET-03 and AC-RET-04.**",
      "- [ ] **AC-RET-03 — By email.** The customer is told by email.",
      "- [ ] **AC-RET-04 — In the app.** The customer is told in the app.",
    ].join("\n"));
    expect(read.criteria.map(criterion => criterion.key)).toEqual(["AC-RET-01", "AC-RET-02", "AC-RET-03", "AC-RET-04"].map(label => `shop:docs/returns-prd.md#${label}`));
    expect(read.criteria[1]!.content).toBe("- **AC-RET-02 — retired, split into AC-RET-03 and AC-RET-04.**");
  });

  it("reads labels after the opening one as references, and a lone label anywhere as the criterion's", () => {
    expect(criterionIdentity("AC-RET-01 — Refunds follow AC-PAY-02's limits")).toBe("AC-RET-01");
    expect(criterionIdentity("Return intake (AC-RET-01)")).toBe("AC-RET-01");
    expect(criterionIdentity("Return intake")).toBe("Return intake");
    expect(labels("- [ ] **Return intake.** A customer starts a return.\n- [ ] **Refund (AC-RET-02).** To the card.")).toEqual(["Return intake.", "AC-RET-02"]);
  });

  it.each([
    "AC-RET-01 and AC-RET-02 — Both channels",
    "AC-RET-01, AC-RET-02 — Both channels",
    "AC-RET-01/AC-RET-02 — Both channels",
    "AC-RET-01 to AC-RET-03 — retired",
    "AC-RET-01–AC-RET-03 — retired",
    "AC-RET-01 – AC-RET-03 — retired",
    "AC-RET-01 thru AC-RET-03 — retired",
    "AC-RET-01 and/or AC-RET-02 — Either channel",
    "AC-RET-01; AC-RET-02 — Both channels",
    "AC-RET-01 — AC-RET-02's limits apply",
    "Intake for AC-RET-01 and AC-RET-02",
    "Intake for AC-RET-01, see AC-RET-01",
  ])("still refuses %s, which holds two labels without one opening it ahead of its title text", title => {
    expect(criterionIdentity(title)).toBeUndefined();
    expect(() => manifest(`- [ ] **AC-RET-09 — Fine.** Text.\n- [ ] **${title}.** Text.`)).toThrow(/^The bold title at docs\/returns-prd\.md:6 holds more than one criterion label \(AC-RET-01, AC-RET-0[123]\), so Kiln can't tell which criterion it is\. Open the title with that criterion's own label and its title text, and give each criterion its own list item\.$/);
  });

  // An audit Kiln already accepted stays current only while the manifest id is unchanged, so a PRD
  // that read before must keep its id: the fixture's single-label retirement note stays an entry.
  it("leaves the manifest of a PRD that already read as it was", () => {
    const read = requirementManifest("shop", "docs/returns-prd.md", "blob", PRD);
    expect(read.criteria.map(criterion => criterion.label)).toEqual(["AC-RET-01", "AC-RET-02", "AC-RET-03", "AC-RET-04", "AC-RET-05", "AC-DASH-01"]);
    expect(read.id).toBe("a6fa13d529e6e156752aee81c2721ec9e9fb821d9a6392d8ce409b19c9b824c0");
  });
});
