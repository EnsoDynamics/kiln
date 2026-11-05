import { describe, expect, it } from "vitest";
import { belowMinimumProblem, compareToMinimum, POWERSHELL_MISSING, requirement, TOOLING_MINIMUMS } from "./tooling-minimums.js";

describe("agent tooling minimums", () => {
  it.each([
    ["claudeCode", "2.1.317 (Claude Code)", "2.1.317"],
    ["claudeCode", "2.1.311 (Claude Code)", "2.1.311"],
    ["codex", "codex-cli 0.162.1\n", "0.162.1"],
    ["codex", "codex-cli 0.166.0", "0.166.0"],
    ["codex", "codex-cli 0.167.0-alpha.4", "0.167.0-alpha.4"],
    ["codex", "codex-cli 0.165.0+build.1", "0.165.0+build.1"],
    ["codex", "codex-cli 0.162.1+build.1", "0.162.1+build.1"],
    ["codex", "codex-cli 0.1000.0", "0.1000.0"],
    ["codex", "codex-cli 1.0.0", "1.0.0"],
    ["git", "git version 2.39.5 (Apple Git-154)", "2.39.5"],
    ["git", "git version 2.39.5.windows.1", "2.39.5"],
    ["git", "git version 2.29.0", "2.29.0"],
    ["node", "v22.15.0", "22.15.0"],
    ["powershell", "PowerShell 7.5.2", "7.5.2"],
  ] as const)("accepts %s %j with no upper version cap", (tool, output, version) => {
    expect(compareToMinimum(tool, output)).toEqual({ state: "supported", version });
  });

  it.each([
    ["codex", "codex-cli 0.162.1-alpha.1", "0.162.1-alpha.1"],
    ["codex", "codex-cli 0.162.0", "0.162.0"],
    ["codex", "codex-cli 0.99.999", "0.99.999"],
    ["claudeCode", "2.1.300 (Claude Code)", "2.1.300"],
    ["git", "git version 2.25.1", "2.25.1"],
    ["node", "v22.14.9", "22.14.9"],
    ["powershell", "PowerShell 7.4.6", "7.4.6"],
  ] as const)("reports %s %j below its minimum, a prerelease of the minimum included", (tool, output, version) => {
    expect(compareToMinimum(tool, output)).toEqual({ state: "below_minimum", version });
  });

  it.each(["", "codex-cli", "codex-cli 0.165", "unrecognized", "codex-cli 9007199254740992.0.0", undefined])("treats unparseable output %j as unrecognised, never below minimum", output => {
    expect(compareToMinimum("codex", output)).toEqual({ state: "unrecognised" });
  });

  it("words version problems as the design states them", () => {
    expect(belowMinimumProblem("git", "2.25.1")).toBe("Git 2.25.1 is older than Kiln supports. Install Git 2.29 or later.");
    expect(belowMinimumProblem("claudeCode", "2.1.300")).toBe("Claude Code 2.1.300 is older than Kiln supports. Install Claude Code 2.1.311 or later: claude update");
    expect(belowMinimumProblem("codex", "0.160.0")).toBe("Codex 0.160.0 is older than Kiln supports. Install Codex 0.162.1 or later: codex update");
    expect(belowMinimumProblem("powershell", "7.4.6")).toBe("PowerShell 7.4.6 is older than Kiln supports. Install PowerShell 7.5.2 or later.");
    expect(POWERSHELL_MISSING).toBe("Codex on Windows needs PowerShell 7.5.2 or later. Install it before starting work.");
    expect(requirement("codex")).toBe("Codex 0.162.1 or later");
    expect(requirement("codex")).not.toContain("stable");
    expect(TOOLING_MINIMUMS.codex).toBe("0.162.1");
  });
});
