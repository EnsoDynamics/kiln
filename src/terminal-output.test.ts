import { describe, expect, it } from "vitest";
import { formatTerminalEvent } from "./kiln-command.js";
import type { PrdRecord } from "./state/records.js";
import { formatDocumentsFound, formatOpenedLine, formatPhaseLine, formatStartedLine, formatStartFailure, resetClock, terminalColors } from "./terminal-output.js";

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
    expect(formatOpenedLine("http://127.0.0.1:4700/customer-returns", { kind: "opened" }, plain).split("\n")).toEqual([
      "● Opened http://127.0.0.1:4700/customer-returns. Review it there and press Start.",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
  });

  it("colors the ● and the address red and the rest grey, as drawn", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const [line] = formatOpenedLine("http://127.0.0.1:4700/customer-returns", { kind: "opened" }, colors).split("\n");
    expect(line).toBe(`${colors.red("●")} Opened ${colors.red("http://127.0.0.1:4700/customer-returns")}${colors.grey(". Review it there and press Start.")}`);
  });

  it("gives the address and why when the opener failed", () => {
    const failed = { kind: "failed", reason: "xdg-open exited with code 3" } as const;
    expect(formatOpenedLine("http://127.0.0.1:4700/x", failed, plain).split("\n")).toEqual([
      "● Kiln’s view is at http://127.0.0.1:4700/x. Review it there and press Start.",
      "✗ Couldn’t open the browser: xdg-open exited with code 3. Open http://127.0.0.1:4700/x yourself.",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    expect(formatOpenedLine("http://127.0.0.1:4700/x", failed, plain, true)).toBe("✗ Couldn’t open the browser: xdg-open exited with code 3. Open http://127.0.0.1:4700/x yourself.");
  });

  it("says where the view is, with no error, when the machine has no opener", () => {
    expect(formatOpenedLine("http://127.0.0.1:4700/x", { kind: "no_opener" }, plain).split("\n")).toEqual([
      "● Kiln’s view is at http://127.0.0.1:4700/x. Open it in your browser and press Start.",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    expect(formatOpenedLine("http://127.0.0.1:4700/x", { kind: "no_opener" }, plain, true)).toBe("● Kiln’s view is at http://127.0.0.1:4700/x. Open it in your browser.");
  });

  it("over SSH, says to open the view from the person's own computer through a tunnel to the same port", () => {
    expect(formatOpenedLine("http://127.0.0.1:4712/x", { kind: "remote" }, plain).split("\n")).toEqual([
      "● Kiln’s view is at http://127.0.0.1:4712/x on this remote machine. Open it from your own computer through an SSH tunnel to port 4712, then press Start.",
      "  For example: ssh -N -L 4712:127.0.0.1:4712 <this host>",
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    expect(formatOpenedLine("http://127.0.0.1:4712/x", { kind: "remote" }, plain, true).split("\n")).toEqual([
      "● Kiln’s view is at http://127.0.0.1:4712/x on this remote machine. Open it from your own computer through an SSH tunnel to port 4712.",
      "  For example: ssh -N -L 4712:127.0.0.1:4712 <this host>",
    ]);
  });
});

describe("the wait's terminal line (usage-limit recovery AC-LIMIT-05)", () => {
  const at = new Date(2026, 9, 22, 11, 31);
  const columns = { idWidth: 4, titleWidth: 19 };
  it("names the limit and its reset, with the day when it isn't today, and no reset part without one", () => {
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "waiting", label: "5-hour window", resetsAt: new Date(2026, 9, 22, 15, 40, 20).toISOString() }, columns, plain)).toBe(
      "11:31  2b  Store credit       waiting · 5-hour window resets 3:40 PM",
    );
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "waiting", label: "Weekly", resetsAt: new Date(2026, 9, 26, 0, 0).toISOString() }, columns, plain)).toBe(
      "11:31  2b  Store credit       waiting · Weekly resets Mon 12:00 AM",
    );
    // An hour-ahead reset crosses midnight in the runner's local timezone too.
    expect(formatPhaseLine(new Date(2026, 9, 22, 23, 31), "2b", "Store credit", { kind: "waiting", label: "5-hour window", resetsAt: new Date(2026, 9, 23, 0, 31).toISOString() }, columns, plain)).toBe(
      "11:31  2b  Store credit       waiting · 5-hour window resets Fri 12:31 AM",
    );
    expect(formatPhaseLine(at, "PR", "Final pull request", { kind: "waiting", label: "A usage limit" }, columns, plain)).toBe("11:31  PR  Final pull request  waiting · A usage limit");
  });

  it("prints the engine's waiting events for a phase and for the pull-request session", () => {
    const record = { plan: [{ id: "2b", title: "Store credit", file: "phase-2b-store-credit.md", closed: false, repositories: [] }] } as unknown as PrdRecord;
    const limit = { label: "5-hour window", resetsAt: new Date(2026, 9, 22, 15, 40).toISOString() };
    expect(formatTerminalEvent({ kind: "phase", at, phaseId: "2b", title: "Store credit", event: "waiting", limit }, record, plain)).toBe("11:31  2b  Store credit  waiting · 5-hour window resets 3:40 PM");
    expect(formatTerminalEvent({ kind: "pull_request", at, event: "waiting", limit: { label: "Weekly" } }, record, plain)).toBe("11:31  PR  Final pull request  waiting · Weekly");
  });

  it("rounds a reset to the nearest minute", () => {
    expect(resetClock(new Date(2026, 9, 22, 14, 59, 31), at)).toBe("3:00 PM");
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

  it("colors those lines as the terminal mockup draws them: the added line in the body color, the repository lists in grey", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const grey = (text: string) => `\x1b[38;2;140;133;119m${text}\x1b[39m`;
    const green = (text: string) => `\x1b[38;2;156;196;154m${text}\x1b[39m`;
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "added", name: "notifications" }, columns, colors)).toBe(`${grey("11:31  2b  ")}Store credit       added notifications`);
    const pushes = [
      { name: "returns-api", sha: "7f3d9a0aaaaaaa" },
      { name: "product", sha: "e07a4c8bbbbbbb" },
    ];
    expect(formatPhaseLine(at, "2b", "Store credit", { kind: "done", pushedSha: "e07a4c8", pushes }, columns, colors)).toBe(
      `${grey("11:31  2b  ")}Store credit       ${green("done")}${grey(" · pushed returns-api 7f3d9a0 · product e07a4c8")}`,
    );
    const opened = [
      { repository: "product", number: 12 },
      { repository: "returns-api", number: 57 },
    ];
    expect(formatPhaseLine(at, "PR", "Final pull request", { kind: "opened", number: 12, opened }, columns, colors)).toBe(
      `${grey("11:31  PR  ")}Final pull request  ${green("opened")}${grey(" product #12 · returns-api #57")}`,
    );
  });
});

// AC-DISPLAY-02: the terminal consumes the same separate outcomes as the browser.
describe("development delivery terminal outcomes", () => {
  it.each([
    ["Merge", "confirmed https://github.com/acme/returns-api/pull/41 (abcdef123456)"],
    ["Deployment", "unresolved: deployment job failed"],
    ["Verification", "confirmed"],
  ])("prints %s with its exact repository, environment and observed outcome", (stage, outcome) => {
    const at = new Date(2026, 9, 24, 11, 31);
    const record = { plan: [] } as unknown as PrdRecord;
    expect(formatTerminalEvent({ kind: "delivery", at, repository: "github.com/acme/returns-api", environment: "returns-api-dev", stage, outcome }, record, plain)).toBe(
      `${at.toLocaleTimeString()}  github.com/acme/returns-api · returns-api-dev · ${stage}: ${outcome}`,
    );
  });
});


describe("a stop that needs a person (AC-START-09)", () => {
  const at = new Date(2026, 9, 24, 11, 31);
  const record = { plan: [{ id: "2b", title: "Store credit", file: "phase-2b-store-credit.md", closed: false, repositories: [] }] } as unknown as PrdRecord;
  const address = "http://127.0.0.1:4700/customer-returns";
  const says = `stopped · waiting for you at ${address}`;

  it("says Kiln is waiting and where, for a phase, an audit and final delivery", () => {
    expect(formatTerminalEvent({ kind: "phase", at, phaseId: "2b", title: "Store credit", event: "stopped" }, record, plain, undefined, address)).toBe(`11:31  2b  Store credit  ${says}`);
    expect(formatTerminalEvent({ kind: "audit", at, activityId: "a1", label: "Test audit", round: 1, event: "stopped" }, record, plain, undefined, address)).toBe(`11:31      Test audit · Round 1  ${says}`);
    expect(formatTerminalEvent({ kind: "pull_request", at, event: "stopped" }, record, plain, undefined, address)).toBe(`11:31  PR  Final pull request  ${says}`);
  });

  it("colors the stop amber and the address as the view address, and leaves other events alone", () => {
    const colored = terminalColors({ isTTY: true }, {});
    const line = formatTerminalEvent({ kind: "phase", at, phaseId: "2b", title: "Store credit", event: "stopped" }, record, colored, undefined, address);
    expect(line).toContain(colored.amber("stopped")); expect(line).toContain(colored.red(address));
    expect(formatTerminalEvent({ kind: "phase", at, phaseId: "2b", title: "Store credit", event: "interrupted" }, record, plain, undefined, address)).toBe("11:31  2b  Store credit  interrupted");
  });

  it("still says Kiln is waiting when the view has no address yet", () => {
    expect(formatTerminalEvent({ kind: "phase", at, phaseId: "2b", title: "Store credit", event: "stopped" }, record, plain)).toBe("11:31  2b  Store credit  stopped · waiting for you");
  });
});

describe("audit activity terminal names", () => {
  it("prints audit rounds and stop/wait facts without exposing an audit as a numbered phase", () => {
    const at = new Date(2026,9,24,11,31);const record={plan:[]} as unknown as PrdRecord;
    for(const label of ["Delivery audit","Test audit"]){
      const event={kind:"audit" as const,at,activityId:"opaque-audit-id",label,round:2};
      const started=formatTerminalEvent({...event,event:"started"},record,plain);
      expect(started).toContain(`${label} · Round 2`);expect(started).toContain("started");
      expect(formatTerminalEvent({...event,continuationIndex:3,event:"started"},record,plain)).toContain(`${label} · Round 2 · Continuation 3`);
      expect(started).not.toContain("opaque-audit-id");expect(started).not.toContain("Phase");
      expect(formatTerminalEvent({...event,event:"waiting",limit:{label:"Weekly"}},record,plain)).toContain("waiting · Weekly");
      expect(formatTerminalEvent({...event,event:"done"},record,plain)).toContain("Audit result recorded");
    }
  });
});
