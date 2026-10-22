import { describe, expect, it } from "vitest";
import { formatDocumentsFound, formatOpenedLine, formatPhaseLine, formatStartedLine, formatStartFailure, terminalColors } from "./terminal-output.js";

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
    const problemsOnly = formatStartFailure("Gift cards", "docs/prds/gift-cards", { missingDocuments: [], problems: ["The checkout ~/devel/acme-shop has uncommitted changes in 3 files: README.md, a.txt and b.txt."] }, plain);
    expect(problemsOnly.split("\n")).toEqual(["✗ Can’t start Gift cards.", "    The checkout ~/devel/acme-shop has uncommitted changes in 3 files: README.md, a.txt and b.txt.", "  Nothing was started."]);
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
    expect(formatDocumentsFound("Customer returns", { designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 6 }, plain)).toBe(
      "Customer returns  ·  PRD, technical design, assumptions, 6 phase docs  ·  all checks passed",
    );
    expect(formatDocumentsFound("Gift cards", { designFile: "technical-design.md", phaseDocCount: 1 }, plain)).toBe(
      "Gift cards  ·  PRD, technical design, 1 phase doc  ·  all checks passed",
    );
  });
});

describe("the not-started ● line (AC-START-09)", () => {
  const plain = terminalColors({ isTTY: false }, {});
  it("says the view was opened, to review it there, and to keep the terminal open", () => {
    expect(formatOpenedLine("http://127.0.0.1:4700/customer-returns", undefined, plain).split("\n")).toEqual([
      "● Opened http://127.0.0.1:4700/customer-returns. Review it there and press Start.",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
  });

  it("colors the ● and the address red and the rest grey, as drawn", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const [line] = formatOpenedLine("http://127.0.0.1:4700/customer-returns", undefined, colors).split("\n");
    expect(line).toBe(`${colors.red("●")} Opened ${colors.red("http://127.0.0.1:4700/customer-returns")}${colors.grey(". Review it there and press Start.")}`);
  });

  it("gives the address and why when the browser couldn't be opened", () => {
    expect(formatOpenedLine("http://127.0.0.1:4700/x", "xdg-open isn’t on the PATH", plain).split("\n")).toEqual([
      "● Kiln’s view is at http://127.0.0.1:4700/x. Review it there and press Start.",
      "✗ Couldn’t open the browser: xdg-open isn’t on the PATH. Open http://127.0.0.1:4700/x yourself.",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    expect(formatOpenedLine("http://127.0.0.1:4700/x", "no display", plain, true)).toBe("✗ Couldn’t open the browser: no display. Open http://127.0.0.1:4700/x yourself.");
  });
});

describe("the terminal lines for several repositories (multi-repo technical design, Command line)", () => {
  const at = new Date(2026, 9, 22, 11, 31);
  const columns = { idWidth: 4, titleWidth: 19 };
  it("counts the repositories on the first line and the Started line, only when there is more than one", () => {
    const found = { designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 6 };
    expect(formatDocumentsFound("Customer returns", found, plain, 3)).toBe("Customer returns  ·  PRD, technical design, assumptions, 6 phase docs, 3 repositories  ·  all checks passed");
    expect(formatDocumentsFound("Customer returns", found, plain, 1)).toBe("Customer returns  ·  PRD, technical design, assumptions, 6 phase docs  ·  all checks passed");
    expect(formatStartedLine(at, "feature/customer-returns", "develop", plain, 3)).toBe("11:31  Started  ·  feature/customer-returns in 3 repositories");
    expect(formatStartedLine(at, "feature/customer-returns", "develop", plain)).toBe("11:31  Started  ·  feature/customer-returns from develop");
  });

  it("draws the added line, the done line by repository and the opened line by repository", () => {
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "added", name: "notifications" }, columns, plain)).toBe("11:31  2b  Store credit       added notifications");
    const pushes = [
      { name: "returns-api", sha: "7f3d9a0aaaaaaa" },
      { name: "product", sha: "e07a4c8bbbbbbb" },
    ];
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "done", pushedSha: "e07a4c8", pushes }, columns, plain)).toBe("11:31  2b  Store credit       done · pushed returns-api 7f3d9a0 · product e07a4c8");
    const opened = [
      { repository: "product", number: 12 },
      { repository: "returns-api", number: 57 },
    ];
    expect(formatPhaseLine(at, "PR", "Final pull request", { kind: "opened", number: 12, opened }, columns, plain)).toBe("11:31  PR  Final pull request  opened product #12 · returns-api #57");
  });
});
