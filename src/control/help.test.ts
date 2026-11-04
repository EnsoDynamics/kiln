// Top-level text help is a one-screen guide for people (AC-HELP-01); the JSON help keeps the
// complete reference for bots (AC-HELP-02).

import { describe, expect, it } from "vitest";
import { commandContracts, commandHelp } from "./help.js";

const GROUPS = ["start", "answer", "live", "inspect", "kiln-sessions"];
const text = commandHelp([], false);
const lines = text.trimEnd().split("\n");

describe("top-level text help", () => {
  it("fits one terminal screen: at most 40 lines of at most 80 characters", () => {
    expect(lines.length).toBeLessThanOrEqual(40);
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(80);
  });

  it("opens with how to start and how to see what's running", () => {
    expect(lines.slice(0, 5)).toEqual([
      "Kiln runs an Enso Method phase plan with Claude Code or Codex.",
      "",
      "Start:        kiln run <PRD-path>",
      "See work:     kiln status",
      "",
    ]);
  });

  it("groups every people-facing command under its task heading, in a fixed order", () => {
    const names = (group: string) => commandContracts.filter(c => c.group === group).map(c => c.path.join(" ")).join(", ");
    expect(text).toContain(`Answer a stopped phase\n  ${names("answer")}\nMessage, pause or take over\n  ${names("live")}\nLook closer\n  ${names("inspect")}\n`);
    for (const c of commandContracts.filter(c => c.group !== "kiln-sessions")) expect(text, c.path.join(" ")).toMatch(new RegExp(`(?<![\\w-])${c.path.join(" ")}(?![\\w-])`));
  });

  it("collapses the helpers Kiln's sessions call into one line with their count, naming none of them", () => {
    const helpers = commandContracts.filter(c => c.group === "kiln-sessions");
    const runnable = helpers.filter(c => c.side_effect !== "group").length;
    expect(runnable).toBeGreaterThan(0);
    expect(lines).toContain(`Used by Kiln's sessions: ${runnable} helper commands (kiln <command> --help for each).`);
    for (const name of new Set(helpers.map(c => c.path[0]!))) expect(text, name).not.toMatch(new RegExp(`(?<![\\w-])${name}(?![\\w-])`));
  });

  it("points bots at the JSON help in one closing sentence instead of the guidance paragraph", () => {
    expect(lines.at(-1)).toBe("Bots and scripts: kiln --help --json lists every command with full metadata.");
    const { guidance } = JSON.parse(commandHelp([], true)) as { guidance: string };
    expect(text).not.toContain(guidance);
  });
});

describe("the command contracts", () => {
  // Pinned by task, not read back from the contracts: a people-facing command moved into
  // kiln-sessions would vanish from kiln --help behind the helper count.
  it("put each command in the group its task belongs to", () => {
    const expected: Record<string, string> = {
      run: "start", status: "start",
      reply: "answer", resume: "answer", "verify-and-advance": "answer", "check-again": "answer", "waive-and-advance": "answer",
      message: "live", "take-over": "live", "request-pause": "live", "cancel-pause": "live", continue: "live",
      logs: "inspect", handoff: "inspect", account: "inspect", settings: "inspect", "command-status": "inspect",
    };
    for (const c of commandContracts) {
      const name = c.path.join(" ");
      const sessionHelper = name === "add-repository" || ["audit", "delivery", "preparation"].includes(c.path[0]!);
      expect(GROUPS, name).toContain(c.group);
      expect(c.group, name).toBe(sessionHelper ? "kiln-sessions" : expected[name]);
    }
    expect(Object.keys(expected).every(name => commandContracts.some(c => c.path.join(" ") === name))).toBe(true);
  });

  it("keep every command, helpers included, in the JSON help, each with its group", () => {
    const json = JSON.parse(commandHelp([], true)) as { commands: { path: string[]; group: string }[] };
    expect(json.commands.map(c => c.path.join(" "))).toEqual(commandContracts.map(c => c.path.join(" ")));
    expect(json.commands.map(c => c.path.join(" "))).toEqual(expect.arrayContaining(["add-repository", "audit submit", "delivery evidence", "preparation submit"]));
    expect(json.commands.map(c => c.group)).toEqual(commandContracts.map(c => c.group));
  });
});
