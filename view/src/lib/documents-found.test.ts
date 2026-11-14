import { describe, expect, it } from "vitest";
import { documentsFoundRepositoriesSnapshot, documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { accountLines, assumptionsLine, designLine, effortDisabled, modelOptions, planCountLine, planRows, prdLine, startState } from "./documents-found.js";

describe("what Documents found says it found (AC-START-04)", () => {
  it("words each document's line as drawn", () => {
    const documents = documentsFoundSnapshot().documents!;
    expect(prdLine(documents.prd)).toBe("14 acceptance criteria, AC-RET-01 to AC-RET-14");
    expect(designLine(documents.design!, 14)).toBe("Cites all 14 criteria");
    expect(designLine({ file: "technical-design.md", criteriaCited: 12 }, 14)).toBe("Cites 12 of 14 criteria");
    expect(assumptionsLine(documents.assumptions)).toBe("11 assumptions, 2 not yet confirmed. They’re green lights; nothing waits on them.");
    expect(assumptionsLine(null)).toBe("No assumptions document.");
    expect(prdLine({ file: "x-prd.md", criteriaCount: 1, firstLabel: "AC-X-01", lastLabel: "AC-X-01" })).toBe("1 acceptance criterion, AC-X-01");
  });

  it("counts only the phases left to implement, with the closed ones after (UI-010 item 12)", () => {
    expect(planCountLine({ leafCount: 5, closedCount: 0 })).toBe("5 phases to implement, in this order");
    expect(planCountLine({ leafCount: 5, closedCount: 1 })).toBe("4 phases to implement, in this order · 1 already closed");
    expect(planCountLine({ leafCount: 5, closedCount: 4 })).toBe("1 phase to implement · 4 already closed");
    expect(planCountLine({ leafCount: 5, closedCount: 5 })).toBe("No phases left to implement · all 5 already closed");
  });

  it("lists every phase in plan order, a split phase's children nested under it", () => {
    const rows = planRows(documentsFoundSnapshot().documents!.plan!.phases);
    expect(rows.map((row) => [row.id, row.title, row.splitNote, row.children.map((child) => child.id)])).toEqual([
      ["1", "Return intake", undefined, []],
      ["2", "Refund routing", "split into 2a and 2b", ["2a", "2b"]],
      ["3", "Returns dashboard", undefined, []],
      ["4", "Restock check-in", undefined, []],
    ]);
  });
});

describe("the settings fields", () => {
  it("dims effort levels the chosen model doesn't take, and none when there's no entry for it (UI-011)", () => {
    const limited = documentsFoundSnapshot({ settings: { effortLevels: ["low", "medium", "high"] } }).settings;
    expect((["low", "high", "xhigh", "max"] as const).map((effort) => effortDisabled(limited, effort))).toEqual([false, false, true, true]);
    expect(effortDisabled(documentsFoundSnapshot({ settings: { effortLevels: null } }).settings, "max")).toBe(false);
  });

  it("keeps a saved model the list doesn't offer as one more option, named as saved", () => {
    expect(modelOptions(documentsFoundSnapshot()).map((model) => model.displayName)).toEqual(["Opus 5.5", "Fable 5.1", "Sonnet 5.5"]);
    const unlisted = documentsFoundSnapshot({ settings: { model: { value: "claude-opus-4-8", displayName: "claude-opus-4-8" } } });
    expect(modelOptions(unlisted).map((model) => model.value)).toEqual(["opus", "fable", "sonnet", "claude-opus-4-8"]);
    // Before the list loads, or when it can't be read, the saved alias is the only option.
    const noList = documentsFoundSnapshot();
    delete noList.models;
    expect(modelOptions(noList)).toEqual([{ value: "opus", displayName: "Opus 5.5" }]);
  });

  it("shows the account and its usage as one line each, or the not-signed-in line alone", () => {
    expect(accountLines(documentsFoundSnapshot().account)).toEqual({ line: "alex@acme-shop.dev · Max plan", usage: "Used: 5-hour 13% · weekly 22% · Fable 0%" });
    expect(accountLines({ startedAt: "", updatedAt: "", limits: [], error: "Not signed in to Claude Code. Run `claude auth login`." })).toEqual({ error: "Not signed in to Claude Code. Run `claude auth login`." });
    expect(accountLines({ email: "a@b.dev", startedAt: "", updatedAt: "", limits: [], limitsError: "Claude Code didn't report this plan's usage limits." })).toEqual({ line: "a@b.dev", usageError: "Claude Code didn't report this plan's usage limits." });
    expect(accountLines(undefined)).toEqual({});
  });
});

describe("Start (AC-START-05)", () => {
  const ready = documentsFoundSnapshot();

  it("stays unavailable until the person confirms refinement", () => {
    expect(startState(ready, false, true)).toEqual({ enabled: false, note: "Confirm refinement to start." });
    expect(startState(ready, true, true)).toEqual({ enabled: true });
  });

  it("is held by a field message, but not by the model-list or keep-awake messages", () => {
    expect(startState(documentsFoundSnapshot({ settings: { fieldErrors: { featureBranch: "That isn’t a valid branch name." } } }), true, true).enabled).toBe(false);
    expect(startState(documentsFoundSnapshot({ settings: { fieldErrors: { model: "Haiku 4.5 can’t run unattended on this account; it needs auto mode." } } }), true, true).enabled).toBe(false);
    expect(startState(documentsFoundSnapshot({ settings: { modelListError: "Couldn’t load Claude Code’s models: timed out", keepAwakeError: "Can’t keep this computer awake: systemd-inhibit isn’t available." } }), true, true).enabled).toBe(true);
  });

  it("says what Kiln is doing while it checks the base branch or sets up, setting up first (UI-010 item 4)", () => {
    expect(startState(documentsFoundSnapshot({ settings: { baseCheck: "checking" } }), true, true)).toEqual({ enabled: false, note: "Checking develop on origin…" });
    expect(startState(documentsFoundSnapshot({ settings: { baseCheck: "checking" }, documents: { starting: true } }), true, true)).toEqual({ enabled: false, note: "Setting up the worktree…" });
  });

  it("is unavailable while the view isn't connected to Kiln, and says so", () => {
    expect(startState(ready, true, false)).toEqual({ enabled: false, note: "Not connected to Kiln." });
  });

  it("says under Start which field holds it (UI-010 item 4)", () => {
    const one = documentsFoundSnapshot({ settings: { fieldErrors: { worktreePath: "That folder already exists and isn’t empty. Choose a new one." } } });
    expect(startState(one, true, true)).toEqual({ enabled: false, note: "Worktree: That folder already exists and isn’t empty. Choose a new one." });
    const base = documentsFoundSnapshot({ settings: { fieldErrors: { baseBranch: "develop isn’t on origin." } } });
    expect(startState(base, true, true)).toEqual({ enabled: false, note: "Base branch: develop isn’t on origin." });
    const two = documentsFoundSnapshot({ settings: { fieldErrors: { featureBranch: "That isn’t a valid branch name.", worktreePath: "Enter a worktree path." } } });
    expect(startState(two, true, true)).toEqual({ enabled: false, note: "Fix the 2 fields marked above to start." });
    expect(startState(one, false, true).note).toBe("Confirm refinement to start.");
    expect(startState(one, true, false).note).toBe("Not connected to Kiln.");
  });
});

describe("Documents found across repositories (multi-repo AC-REPO-03)", () => {
  it("keeps each phase's repositories with its row", () => {
    const rows = planRows(documentsFoundRepositoriesSnapshot().documents!.plan!.phases);
    expect(rows.map((row) => [row.id, row.repositories, row.children.map((child) => child.repositories)])).toEqual([
      ["1", ["returns-api"], []],
      ["2", ["returns-api"], [["returns-api"], ["returns-api", "storefront"]]],
      ["3", ["storefront"], []],
      ["4", ["returns-api"], []],
    ]);
  });

  it("holds Start on a repository row's base message, and while any base is checked", () => {
    const ready = documentsFoundRepositoriesSnapshot();
    expect(startState(ready, true, true)).toEqual({ enabled: true });
    const held = documentsFoundRepositoriesSnapshot();
    held.repositories[1] = { ...held.repositories[1]!, fieldErrors: { baseBranch: "develop isn’t on origin." } };
    expect(startState(held, true, true)).toEqual({ enabled: false, note: `${held.repositories[1]!.name}’s base branch: develop isn’t on origin.` });
    const prdBase = documentsFoundRepositoriesSnapshot();
    const prdRow = prdBase.repositories.findIndex((row) => row.kind === "prd");
    prdBase.settings.fieldErrors = { baseBranch: "develop isn’t on origin." };
    prdBase.repositories[prdRow] = { ...prdBase.repositories[prdRow]!, fieldErrors: { baseBranch: "develop isn’t on origin." } };
    expect(startState(prdBase, true, true)).toEqual({ enabled: false, note: `${prdBase.repositories[prdRow]!.name}’s base branch: develop isn’t on origin.` });
    const checking = documentsFoundRepositoriesSnapshot();
    checking.repositories[2] = { ...checking.repositories[2]!, baseCheck: "checking" };
    expect(startState(checking, true, true)).toEqual({ enabled: false, note: "Checking the base branches on origin…" });
  });
});
