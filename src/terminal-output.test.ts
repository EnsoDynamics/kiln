import { describe, expect, it } from "vitest";
import { formatDocumentsFound, formatStartFailure, terminalColors } from "./terminal-output.js";

const plain = terminalColors({ isTTY: false }, {});

describe("formatStartFailure", () => {
  it("draws the terminal mockup's missing-documents frame word for word", () => {
    const text = formatStartFailure(
      "Gift cards",
      "docs/prds/gift-cards",
      {
        missingDocuments: [
          { name: "technical-design.md", description: "the technical design" },
          { name: "phase-*.md", description: "phase documents" },
        ],
        problems: [],
      },
      plain,
    );
    expect(text.split("\n")).toEqual([
      "✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:",
      "    technical-design.md   the technical design",
      "    phase-*.md            phase documents",
      "  Kiln needs the PRD, its technical design and its phase documents. Nothing was started.",
    ]);
  });

  it("lists other problems after the missing documents, and closes with Nothing was started alone when no document is missing", () => {
    const both = formatStartFailure(
      "Gift cards",
      "docs/prds/gift-cards",
      { missingDocuments: [{ name: "gift-cards-prd.md", description: "the PRD" }], problems: ["gh isn't on the PATH."] },
      plain,
    );
    expect(both.split("\n")).toEqual([
      "✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:",
      "    gift-cards-prd.md   the PRD",
      "    gh isn't on the PATH.",
      "  Kiln needs the PRD, its technical design and its phase documents. Nothing was started.",
    ]);
    const problemsOnly = formatStartFailure("Gift cards", "docs/prds/gift-cards", { missingDocuments: [], problems: ["The checkout has uncommitted changes: 3 files."] }, plain);
    expect(problemsOnly.split("\n")).toEqual(["✗ Can’t start Gift cards.", "    The checkout has uncommitted changes: 3 files.", "  Nothing was started."]);
  });

  it("colors the cross amber and the rest in the mockup's greys on a terminal", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const text = formatStartFailure("Gift cards", "docs/prds/gift-cards", { missingDocuments: [], problems: ["x"] }, colors);
    expect(text).toContain("\x1b[38;2;230;180;80m✗\x1b[39m");
    expect(text).toContain("\x1b[38;2;189;182;168m    x\x1b[39m");
    expect(text).toContain("\x1b[38;2;140;133;119m  Nothing was started.\x1b[39m");
    expect(terminalColors({ isTTY: true }, { NO_COLOR: "1" }).amber("✗")).toBe("✗");
  });
});

describe("formatDocumentsFound", () => {
  it("reads like the drawn line", () => {
    expect(formatDocumentsFound("Customer returns", { assumptions: true, phaseDocCount: 6 }, plain)).toBe(
      "Customer returns  ·  PRD, technical design, assumptions, 6 phase docs  ·  all checks passed",
    );
    expect(formatDocumentsFound("Gift cards", { assumptions: false, phaseDocCount: 1 }, plain)).toBe(
      "Gift cards  ·  PRD, technical design, 1 phase doc  ·  all checks passed",
    );
  });
});
