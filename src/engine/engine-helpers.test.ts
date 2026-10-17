import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPhasePlan } from "../plan/phase-plan.js";
import { launchArguments, modelNameFromId } from "../session/claude-session.js";
import { freshSessionPrompt, phaseSessionPrompt, pullRequestSessionPrompt } from "../session/prompts.js";
import { formatPhaseLine, formatStartedLine, planColumns, terminalColors, terminalTime } from "../terminal-output.js";
import { PHASES } from "../test-support/fixture-documents.js";
import { judgedLeaf, nextLeaf } from "./plan-reading.js";
import { resumeCommand } from "./snapshot.js";
import { baseBranchChoices, defaultSettings, displayPath } from "./worktree-setup.js";
import { readFileSync } from "node:fs";

const plain = terminalColors({ isTTY: false }, {});
const plan = readPhasePlan(Object.entries(PHASES).map(([fileName, markdown]) => ({ fileName, markdown })));

describe("the terminal's phase lines", () => {
  // The mockup's plan: the longest title is "Returns dashboard", so titles pad to 19.
  const mockupPlan = [
    { id: "1", title: "Return intake" },
    { id: "2", title: "Refund routing" },
    { id: "2a", title: "Card refunds" },
    { id: "2b", title: "Store credit" },
    { id: "3", title: "Returns dashboard" },
    { id: "4", title: "Restock check-in" },
  ];
  const at = (hours: number, minutes: number) => new Date(2026, 9, 17, hours, minutes);

  it("reads as the terminal mockup draws them", () => {
    const columns = planColumns(mockupPlan);
    expect(formatStartedLine(at(9, 17), "feature/customer-returns", "develop", plain)).toBe(" 9:17  Started  ·  feature/customer-returns from develop");
    expect(formatPhaseLine(at(9, 17), "1", "Return intake", { kind: "started" }, columns, plain)).toBe(" 9:17  1   Return intake      started");
    expect(formatPhaseLine(at(10, 57), "2a", "Card refunds", { kind: "done", pushedSha: "5d81b37aaaa" }, columns, plain)).toBe("10:57  2a  Card refunds       done · pushed 5d81b37");
    expect(formatPhaseLine(at(13, 4), "PR", "Final pull request", { kind: "opened", number: 218 }, columns, plain)).toBe(" 1:04  PR  Final pull request  opened #218");
    expect(formatPhaseLine(at(0, 5), "2b", "Store credit", { kind: "stopped" }, columns, plain)).toBe("12:05  2b  Store credit       stopped");
  });

  it("colors the event as drawn: started red, done green, stopped amber", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const line = formatPhaseLine(at(9, 17), "1", "Return intake", { kind: "started" }, planColumns(mockupPlan), colors);
    expect(line).toContain("\x1b[38;2;226;105;79mstarted");
    expect(formatPhaseLine(at(9, 17), "1", "x", { kind: "stopped" }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;230;180;80mstopped");
    expect(terminalTime(at(23, 59))).toBe("11:59");
  });
});

describe("the prompts", () => {
  const values = {
    phaseDoc: "docs/prds/greeting-cli/phase-1-greet-by-name.md",
    featureName: "Greeting cli",
    prdFile: "docs/prds/greeting-cli/greeting-cli-prd.md",
    worktreePath: "/tmp/kiln-gate2/greeting-tool-kiln/greeting-cli",
    branch: "feature/greeting-cli",
  };

  it("sends proof gate 2's launch prompt word for word", () => {
    const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-2/launch-prompt.txt", import.meta.url), "utf8").trimEnd();
    expect(phaseSessionPrompt(values)).toBe(recorded);
  });

  it("adds the previous-session sentence after the first only when a previous session ran", () => {
    const fresh = freshSessionPrompt(values, true);
    expect(fresh.split("\n\n")[0]).toBe(
      "Use the implement-from-requirements skill to implement `docs/prds/greeting-cli/phase-1-greet-by-name.md` of the `Greeting cli` PRD (`docs/prds/greeting-cli/greeting-cli-prd.md`). A previous session stopped partway through this phase; check the worktree's state before you start.",
    );
    expect(fresh.split("\n\n").slice(1)).toEqual(phaseSessionPrompt(values).split("\n\n").slice(1));
    expect(freshSessionPrompt(values, false)).toBe(phaseSessionPrompt(values));
  });

  it("asks the pull-request session for one ready pull request through gh --repo", () => {
    const prompt = pullRequestSessionPrompt({ featureName: "Customer returns", prdFile: "docs/prds/customer-returns/customer-returns-prd.md", branch: "feature/customer-returns", baseBranch: "develop", github: "acme/acme-shop" });
    expect(prompt).toContain("pass `--repo github.com/acme/acme-shop` to every `gh` command");
    expect(prompt).toContain("Open it ready for review, not as a draft");
    expect(prompt).toContain("You may not merge it, deploy anything, or touch any other branch.");
  });
});

describe("launching a session", () => {
  it("passes no --effort when the session records none", () => {
    expect(launchArguments("id", "haiku", undefined)).not.toContain("--effort");
    expect(launchArguments("id", "opus", "max").slice(5, 9)).toEqual(["--model", "opus", "--effort", "max"]);
  });

  it.each([
    ["claude-opus-5-5", "Opus 5.5"],
    ["claude-haiku-4-5-20251001", "Haiku 4.5"],
    ["claude-fable-5", "Fable 5"],
    ["opus", "opus"],
    ["some-other-model", "some-other-model"],
  ])("names %s as %s", (id, name) => {
    expect(modelNameFromId(id)).toBe(name);
  });
});

describe("the resume command", () => {
  const home = homedir();
  it.each([
    [join(home, "devel", "acme-shop-kiln", "customer-returns"), "cd ~/devel/acme-shop-kiln/customer-returns"],
    [join(home, "my repo", "x"), "cd ~/'my repo/x'"],
    ["/srv/it's here", "cd '/srv/it'\\''s here'"],
    [home, "cd ~"],
  ])("changes to %j quoted only where the shell needs it", (path, cd) => {
    expect(resumeCommand(path, "7c1e9f2a", "darwin")).toBe(`${cd}\nclaude --resume 7c1e9f2a`);
  });

  it("uses PowerShell's form on Windows", () => {
    expect(resumeCommand("C:\\Users\\alex\\it's", "7c1e9f2a", "win32")).toBe("cd 'C:\\Users\\alex\\it''s'; claude --resume 7c1e9f2a");
  });

  it("shows paths under the home directory as ~/…, on a path boundary", () => {
    expect(displayPath(join(home, "a"))).toBe("~/a");
    expect(displayPath(`${home}x/a`)).toBe(`${home}x/a`);
  });
});

describe("plan order after Start", () => {
  it("takes the first leaf without a Closed line, and judges a split leaf's first leaf", () => {
    expect(nextLeaf(plan)?.id).toBe("1");
    expect(judgedLeaf(plan, "2")?.id).toBe("2a");
    expect(judgedLeaf(plan, "2b")?.id).toBe("2b");
    expect(judgedLeaf(plan, "9")).toBeUndefined();
  });
});

describe("the default settings", () => {
  const paths = { mainCheckoutPath: join("/work", "acme-shop"), repositoryName: "acme-shop", folderName: "customer-returns", prdDirectoryFromRoot: "docs/prds/customer-returns" };
  it("branch feature/<folder>, worktree <repository>-kiln/<folder> beside it, base develop or else origin's default, latest Opus at high", () => {
    const withDevelop = defaultSettings(paths, { branches: new Map([["main", "a"], ["develop", "b"]]), defaultBranch: "main" });
    expect(withDevelop).toEqual({ worktreePath: join("/work", "acme-shop-kiln", "customer-returns"), featureBranch: "feature/customer-returns", baseBranch: "develop", model: "opus", effort: "high", keepAwake: true });
    expect(defaultSettings(paths, { branches: new Map([["trunk", "a"]]), defaultBranch: "trunk" }).baseBranch).toBe("trunk");
    expect(defaultSettings(paths, { branches: new Map([["x", "a"]]), defaultBranch: undefined }).baseBranch).toBe("");
  });

  it("lists develop, then origin's default, then the rest by name", () => {
    expect(baseBranchChoices({ branches: new Map([["zeta", "1"], ["main", "2"], ["alpha", "3"], ["develop", "4"]]), defaultBranch: "main" })).toEqual(["develop", "main", "alpha", "zeta"]);
  });
});
