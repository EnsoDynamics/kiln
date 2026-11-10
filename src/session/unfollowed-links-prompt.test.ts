// The phase prompt's text for links Kiln did not follow (Kiln Linked Documents AC-LINK-03).
import { describe, expect, it } from "vitest";
import { phaseSessionPrompt, type PhasePromptValues } from "./prompts.js";

const values: PhasePromptValues = {
  phaseDoc: "docs/prds/customer-returns/phase-1-return-intake.md", featureName: "Customer returns", prdFile: "docs/prds/customer-returns/customer-returns-prd.md",
  worktreePath: "/home/person/devel/shop-customer-returns", branch: "feature/customer-returns", parentFolder: "~/devel",
};
const link = { from: "docs/prds/customer-returns/technical-design.md", href: "../../../billing-service/docs/event-history.md", target: "billing-service/docs/event-history.md", reason: "not in this repository" as const };

describe("the phase prompt and links Kiln did not follow", () => {
  it("names each link, its document and the reason, after the phase instructions", () => {
    const prompt = phaseSessionPrompt({ ...values, unfollowedLinks: [link, { ...link, href: "notes.md", target: "docs/prds/customer-returns/notes.md", reason: "a symbolic link" }] });
    expect(prompt.endsWith([
      "Kiln could not follow these links in the requirements, so it did not read the documents they point at:",
      "",
      "- `docs/prds/customer-returns/technical-design.md` links to `../../../billing-service/docs/event-history.md`: not in this repository.",
      "- `docs/prds/customer-returns/technical-design.md` links to `notes.md`: a symbolic link.",
      "",
      "If this phase needs one of those documents, find it. If you can't, and the phase needs it, say so in your final message.",
    ].join("\n"))).toBe(true);
  });

  it("speaks of one link in the singular, as the mockup draws it", () => {
    const prompt = phaseSessionPrompt({ ...values, unfollowedLinks: [link] });
    expect(prompt).toContain("Kiln could not follow this link in the requirements, so it did not read the document:");
    expect(prompt).toContain("If this phase needs that document, find it. If you can't, and the phase needs it, say so in your final message.");
  });

  it("is the unchanged prompt with no such links", () => {
    expect(phaseSessionPrompt({ ...values, unfollowedLinks: [] })).toBe(phaseSessionPrompt(values));
    expect(phaseSessionPrompt(values)).not.toContain("Kiln could not follow");
  });

  it("comes before saved delivery authority", () => {
    const prompt = phaseSessionPrompt({ ...values, deliveryAuthority: "Merge to develop is authorized.", unfollowedLinks: [link] });
    expect(prompt.indexOf("Kiln could not follow")).toBeGreaterThan(0);
    expect(prompt.indexOf("Kiln could not follow")).toBeLessThan(prompt.indexOf("Merge to develop is authorized."));
  });
});
