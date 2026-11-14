// Top-level text help is a one-screen guide for people (AC-HELP-01); the JSON help keeps the
// complete reference for bots (AC-HELP-02).

import { describe, expect, it } from "vitest";
import { commandContracts, commandHelp, parseCommand, wrapNames } from "./help.js";

const GROUPS = ["start", "answer", "live", "inspect", "reset", "kiln-sessions"];
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
    // A group's names wrap past 80 characters, breaking after the last comma that fits (run restart "Command line").
    const names = (group: string) => wrapNames(commandContracts.filter(c => c.group === group).map(c => c.path.join(" "))).join("\n");
    expect(text).toContain(`Answer a stopped phase\n${names("answer")}\nMessage, pause or take over\n${names("live")}\nLook closer\n${names("inspect")}\nStart over\n${names("reset")}\n`);
    // Reset is the only command of the last group (run restart "Command line").
    expect(names("reset")).toBe("  reset");
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
      reply: "answer", resume: "answer", "carry-on": "answer", "start-again": "answer", "verify-and-advance": "answer", "check-again": "answer", "waive-and-advance": "answer",
      message: "live", "take-over": "live", "request-pause": "live", "cancel-pause": "live", continue: "live",
      logs: "inspect", handoff: "inspect", account: "inspect", settings: "inspect", "command-status": "inspect",
      reset: "reset",
    };
    for (const c of commandContracts) {
      const name = c.path.join(" ");
      const sessionHelper = name === "add-repository" || ["audit", "delivery", "preparation"].includes(c.path[0]!);
      expect(GROUPS, name).toContain(c.group);
      expect(c.group, name).toBe(sessionHelper ? "kiln-sessions" : expected[name]);
    }
    expect(Object.keys(expected).every(name => commandContracts.some(c => c.path.join(" ") === name))).toBe(true);
  });

  // AC-RESET-06: the help is the warning, before any option, and there is no confirming flag.
  it("warn in kiln reset --help that it can't be undone, what Kiln forgets and that nothing runs until Start", () => {
    const text = commandHelp(["reset"], false);
    const warning = text.slice(0, text.indexOf("--"));
    for (const part of ["This can't be undone.", "which phase it was on and each phase's result", "its sessions and their output", "stops, completion waivers and audit results", "its settings for this PRD", "its record of earlier deliveries", "nothing runs until someone opens the browser view with kiln run <PRD-path> and presses Start on Documents found"]) expect(warning).toContain(part);
    expect(Object.keys(commandContracts.find(c => c.path.join(" ") === "reset")!.flags).sort()).toEqual(["command-id", "help", "json", "only-if-status-matches"]);
  });

  it("keep every command, helpers included, in the JSON help, each with its group", () => {
    const json = JSON.parse(commandHelp([], true)) as { commands: { path: string[]; group: string }[] };
    expect(json.commands.map(c => c.path.join(" "))).toEqual(commandContracts.map(c => c.path.join(" ")));
    expect(json.commands.map(c => c.path.join(" "))).toEqual(expect.arrayContaining(["add-repository", "audit submit", "delivery evidence", "preparation submit"]));
    expect(json.commands.map(c => c.group)).toEqual(commandContracts.map(c => c.group));
  });
});

describe("the commands that start a stopped phase's session (run restart AC-CARRY-04)", () => {
  it("lists carry-on and start-again after resume under Answer a stopped phase, wrapping the group onto a second line", () => {
    const answer = commandContracts.filter(c => c.group === "answer").map(c => c.path.join(" "));
    expect(answer.slice(0, 4)).toEqual(["reply", "resume", "carry-on", "start-again"]);
    expect(text).toContain("Answer a stopped phase\n  reply, resume, carry-on, start-again, verify-and-advance, check-again,\n  waive-and-advance\n");
  });

  it("wraps names after the last comma that fits, with the two-space indent", () => {
    expect(wrapNames(["alpha", "beta"], 14)).toEqual(["  alpha, beta"]);
    expect(wrapNames(["alpha", "beta", "gamma"], 14)).toEqual(["  alpha, beta,", "  gamma"]);
  });

  it("gives each a changing command contract whose name, help and outcomes never promise to resume", () => {
    for (const name of ["carry-on", "start-again"]) {
      const contract = commandContracts.find(c => c.path.join(" ") === name)!;
      expect(contract).toMatchObject({ group: "answer", side_effect: "change", implemented: true });
      expect(contract.flags).toHaveProperty("only-if-status-matches");
      expect(contract.flags).toHaveProperty("command-id");
      const help = commandHelp([name], false);
      expect(help).toContain(`kiln ${name} <PRD-path>`);
      expect(`${contract.purpose} ${contract.result_fields["operation.outcome"]}`).not.toMatch(/resum/i);
      expect(contract.result_fields["operation.outcome"]).toContain("session_started");
    }
    const carry = commandContracts.find(c => c.path.join(" ") === "carry-on")!;
    // The reply is optional, in the same forms as kiln reply.
    expect(Object.keys(carry.flags)).toEqual(expect.arrayContaining(["message-file", "message-from-stdin", "message-reviewed"]));
    expect(carry.required_exclusive_groups).toEqual([{ at_most_one: ["message-file", "message-from-stdin"] }]);
    expect(commandHelp(["carry-on"], false)).toContain("At most one: message-file, message-from-stdin");
    const changing = ["--only-if-status-matches", "s", "--command-id", "c"];
    expect(parseCommand(["carry-on", "prd.md", ...changing]).flags["message-file"]).toBeUndefined();
    expect(() => parseCommand(["carry-on", "prd.md", ...changing, "--message-file", "reply.txt", "--message-from-stdin"])).toThrow(/At most one of --message-file, --message-from-stdin/);
    expect(Object.keys(commandContracts.find(c => c.path.join(" ") === "start-again")!.flags)).not.toContain("message-file");
  });
});
