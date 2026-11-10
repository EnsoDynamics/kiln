import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPhasePlan } from "../plan/phase-plan.js";
import { launchArguments, modelNameFromId, resumeArguments } from "../session/claude-session.js";
import { auditRecoveryPrompt, auditSessionPrompt, freshSessionPrompt, outsideWorkspacePrompt, phaseSessionPrompt, pullRequestSessionPrompt, resumePrompt } from "../session/prompts.js";
import { keepAwakeMissingMessage, keepAwakeTool } from "../platform/keep-awake.js";
import { formatPhaseLine, formatStartedLine, planColumns, terminalColors, terminalTime } from "../terminal-output.js";
import { PHASES } from "../test-support/fixture-documents.js";
import { judgedLeaf, nextLeaf } from "./plan-reading.js";
import { resumeCommand } from "./snapshot.js";
import { baseBranchChoices, defaultSettings, displayPath } from "./worktree-setup.js";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

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
    expect(formatPhaseLine(at(0, 5), "2b", "Store credit", { kind: "stopped" }, columns, plain)).toBe("12:05  2b  Store credit       stopped · waiting for you");
    expect(formatPhaseLine(at(11, 4), "2b", "Store credit", { kind: "resumed" }, columns, plain)).toBe("11:04  2b  Store credit       resumed");
    expect(formatPhaseLine(at(11, 2), "2b", "Store credit", { kind: "interrupted" }, columns, plain)).toBe("11:02  2b  Store credit       interrupted");
  });

  it("colors the event as drawn: started red, done green, stopped amber", () => {
    const colors = terminalColors({ isTTY: true }, {});
    const line = formatPhaseLine(at(9, 17), "1", "Return intake", { kind: "started" }, planColumns(mockupPlan), colors);
    expect(line).toContain("\x1b[38;2;226;105;79mstarted");
    expect(formatPhaseLine(at(9, 17), "1", "x", { kind: "stopped" }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;230;180;80mstopped");
    // Green for done: a phase's push and the pull request opened.
    expect(formatPhaseLine(at(9, 17), "1", "x", { kind: "done", pushedSha: "a1c4e09f" }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;156;196;154mdone");
    expect(formatPhaseLine(at(14, 55), "PR", "Final pull request", { kind: "opened", number: 218 }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;156;196;154mopened");
    // The terminal mockup draws resumed in the accent red; an interrupted phase is amber (AC-LOOK-04).
    expect(formatPhaseLine(at(11, 4), "2b", "x", { kind: "resumed" }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;226;105;79mresumed");
    expect(formatPhaseLine(at(11, 4), "2b", "x", { kind: "interrupted" }, planColumns(mockupPlan), colors)).toContain("\x1b[38;2;230;180;80minterrupted");
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
    parentFolder: "/tmp/kiln-gate2",
  };

  it("sends proof gate 2's launch prompt word for word, with the paragraph on adding a repository after the worktree's (multi-repo AC-SPACE-02)", () => {
    const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-2/launch-prompt.txt", import.meta.url), "utf8").trimEnd().split("\n\n");
    const added =
      "If you need a repository that isn't in this worktree's workspace, run `kiln add-repository <folder name>`; Kiln adds a worktree of it on `feature/greeting-cli` and prints where. Work there, never in a repository's own checkout such as `/tmp/kiln-gate2/<folder name>`. Before you change a repository, read its own `CLAUDE.md` and `AGENTS.md`, if it has them, and follow them in that repository.";
    expect(phaseSessionPrompt(values)).toBe([...recorded.slice(0, 2), added, ...recorded.slice(2)].join("\n\n"));
  });

  it("gives a multi-repository session the workspace, each worktree and its base, and every repository in its authorization", () => {
    const prompt = phaseSessionPrompt({
      ...values,
      phaseDoc: "product/docs/prds/customer-returns/phase-2b-store-credit.md",
      workspace: {
        folder: "/home/a/acme/.worktrees/customer-returns",
        repositories: [
          { name: "product", github: "acme/product", worktreePath: "/home/a/acme/.worktrees/customer-returns/product", baseBranch: "main", isPrd: true },
          { name: "returns-api", github: "acme/returns-api", worktreePath: "/home/a/acme/.worktrees/customer-returns/returns-api", baseBranch: "develop", isPrd: false },
        ],
      },
    });
    expect(prompt).toContain("Work only in this Kiln workspace, `/home/a/acme/.worktrees/customer-returns`: one worktree of each repository below, every one on branch `feature/greeting-cli`.");
    expect(prompt).toContain("such as `/tmp/kiln-gate2/returns-api`");
    expect(prompt).toContain(
      "- `product`: `/home/a/acme/.worktrees/customer-returns/product`, base `main` (the PRD's repository)\n- `returns-api`: `/home/a/acme/.worktrees/customer-returns/returns-api`, base `develop`",
    );
    expect(prompt).toContain("run `kiln add-repository <folder name>` from this workspace");
    expect(prompt).toContain("Before you change a repository, read its own `CLAUDE.md` and `AGENTS.md`");
    expect(prompt).toContain("push it to origin (`git push -u origin feature/greeting-cli`) in each repository you change");
    expect(prompt).toContain("committed and pushed to `origin/feature/greeting-cli` in every repository.");
    const product = { name: "product", github: "acme/product", worktreePath: "/w/product", baseBranch: "main", isPrd: true };
    expect(freshSessionPrompt({ ...values, workspace: { folder: "/w", repositories: [product] } }, true)).toContain("check the workspace's state before you start.");
  });

  it("adds the previous-session sentence after the first only when a previous session ran", () => {
    const fresh = freshSessionPrompt(values, true);
    expect(fresh.split("\n\n")[0]).toBe(
      "Use the implement-from-requirements skill to implement `docs/prds/greeting-cli/phase-1-greet-by-name.md` of the `Greeting cli` PRD (`docs/prds/greeting-cli/greeting-cli-prd.md`). A previous session stopped partway through this phase; check the worktree's state before you start.",
    );
    expect(fresh.split("\n\n").slice(1)).toEqual(phaseSessionPrompt(values).split("\n\n").slice(1));
    expect(freshSessionPrompt(values, false)).toBe(phaseSessionPrompt(values));
  });

  it("asks the pull-request session for one ready pull request per repository, each through gh --repo", () => {
    const repository = (name: string, base: string, isPrd = false) => ({ name, github: `acme/${name}`, worktreePath: `/w/${name}`, baseBranch: base, isPrd });
    const one = pullRequestSessionPrompt({ featureName: "Customer returns", prdFile: "docs/prds/customer-returns/customer-returns-prd.md", branch: "feature/customer-returns", repositories: [repository("acme-shop", "develop", true)] });
    expect(one).toContain("Pass `--repo github.com/<owner>/<name>` to every `gh` command for that repository:\n\n- `acme-shop` (`acme/acme-shop`), worktree `/w/acme-shop`, into `develop`\n\nOpen them ready for review");
    expect(one).not.toContain("links every other pull request");
    expect(one).toContain("You may not merge, deploy anything, or touch any other branch.");
    const several = pullRequestSessionPrompt({
      featureName: "Customer returns",
      prdFile: "product/docs/prds/customer-returns/customer-returns-prd.md",
      branch: "feature/customer-returns",
      repositories: [repository("product", "main", true), repository("returns-api", "develop")],
    });
    expect(several).toContain("- `returns-api` (`acme/returns-api`), worktree `/w/returns-api`, into `develop`\n\nEach description names the PRD and links every other pull request opened for it");
    expect(several).toContain("as the technical design gives the order.\n\nOpen them ready for review");
  });

  it("states Kiln's version-2 report contract without the method's vocabulary (AC-NEUTRAL-01, AC-NEUTRAL-02)", () => {
    const prompt = auditSessionPrompt({ label: "Test audit", skillName: "test-audit", skillPath: "/skills/test-audit/SKILL.md", executionId: "execution", activityId: "activity", round: 1, continuationIndex: 1, reportPath: "docs/prds/proof/kiln-audit-activity.json", prdFile: "docs/prds/proof/proof-prd.md", repositories: [{ name: "proof", github: "acme/proof", worktreePath: "/w/proof", baseBranch: "develop", isPrd: true }], branch: "feature/proof", cli: "kiln" }).replace(/\s+/g, " ");
    expect(prompt).toContain("Follow that skill exactly as it is written");
    for (const field of ['"schemaVersion": 2', '"outcome"', '"summary"', '"completionPhases"', '"needsYou"', '"changedImplementation"', '"afterDeliveryActions"']) expect(prompt).toContain(field);
    expect(prompt).toContain("or ended normally but lists anything a person must still decide or do before delivery");
    // Added phases still build while a person settles listed items; the next audit carries unsettled ones (AC-NEUTRAL-03).
    expect(prompt).toContain('"completion_phases" when it added phases to the plan for missing work, even when it also lists something a person must decide or do');
    expect(prompt).toContain('"needs_you" when it added no phases');
    expect(prompt).toContain("An item a prior report below lists in needsYou that is still unsettled goes in this report's needsYou again.");
    expect(prompt).toContain("Never write \"passed\" to finish");
    for (const method of ["red check", "test-audit.md", "Added by", "kiln-assessment", "audit snapshot", "independent assessment"]) expect(prompt).not.toContain(method);
  });
});

describe("the resumed session's prompt", () => {
  const phaseDoc = "docs/prds/customer-returns/phase-2b-store-credit.md";

  it.each(["codex", "claude_code", undefined] as const)("names the recorded %s agent after a usage refusal without changing prompt order", agentId => {
    const agent = agentId === "codex" ? "Codex" : "Claude Code";
    const account = agentId === "codex" ? "Codex" : "Claude";
    for (const usageLimit of ["", "the weekly usage limit"]) {
      const prompt = resumePrompt({ ...(agentId ? { agentId } : {}), usageLimit, time: "2026-10-23T18:00:00Z", phaseDoc, note: "Keep my edits.", outside: "Repair the workspace first." });
      expect(prompt.split("\n\nThis session runs unattended.")[0]).toBe(`The person running Kiln says:\n\nKeep my edits.\n\nRepair the workspace first.\n\nThis session stopped at \`2026-10-23T18:00:00Z\` because ${agent}'s usage limit${usageLimit ? ` (${usageLimit})` : ""} refused its request. Kiln has resumed it on the ${account} account signed in now. Carry on with \`${phaseDoc}\` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.`);
    }
    const pr = resumePrompt({ ...(agentId ? { agentId } : {}), usageLimit: "", time: "t", multiRepository: true });
    expect(pr).toContain(`because ${agent}'s usage limit refused`);
    expect(pr).toContain("Carry on opening the pull requests from where you stopped; check GitHub first");
  });

  it("names when and why Kiln was interrupted, and sends the session back to its phase", () => {
    expect(resumePrompt({ cause: "sigint", time: "2026-10-17T15:02:11Z", phaseDoc })).toBe(
      "Kiln was interrupted at `2026-10-17T15:02:11Z` (Ctrl+C) while this session was working, and has resumed it. " +
        "Carry on with `docs/prds/customer-returns/phase-2b-store-credit.md` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.",
    );
    expect(resumePrompt({ cause: "sighup", time: "t", phaseDoc })).toContain("(the terminal closed)");
    expect(resumePrompt({ cause: "sigterm", time: "t", phaseDoc })).toContain("(Kiln was stopped)");
    expect(resumePrompt({ cause: "sleep", time: "t", phaseDoc })).toContain("(the computer slept)");
  });

  it("says Kiln recorded no reason when it was killed outright, giving the last output's time", () => {
    expect(resumePrompt({ time: "2026-10-17T15:02:11Z", phaseDoc }).split(". ")[0]).toBe(
      "Kiln stopped without recording why while this session was working; its last output was at `2026-10-17T15:02:11Z`, and Kiln has resumed it",
    );
  });

  it("asks the pull-request session to check GitHub first", () => {
    expect(resumePrompt({ cause: "sigint", time: "t" })).toContain(
      "Carry on opening the pull request from where you stopped; check GitHub first, because the pull request may already be open. Everything in the first message still applies.",
    );
  });

  it("asks a session that changed several checkouts outside the workspace to add only the repositories the workspace lacks (multi-repo AC-OUTSIDE-02)", () => {
    const facts = ["Ran git stash in ~/devel/acme/storefront", "Edited a.ts in ~/devel/acme/design-system"];
    expect(
      outsideWorkspacePrompt({
        phaseName: "phase 2b",
        facts,
        checkouts: [
          { shownPath: "~/devel/acme/storefront", name: "storefront", inWorkspace: true },
          { shownPath: "~/devel/acme/design-system", name: "design-system", inWorkspace: false },
        ],
        branch: "feature/customer-returns",
        multiRepository: true,
      }),
    ).toBe(
      [
        "While working on phase 2b, you changed checkouts outside the Kiln workspace, the worktrees listed in your instructions:",
        "- Ran git stash in ~/devel/acme/storefront",
        "- Edited a.ts in ~/devel/acme/design-system",
        "",
        "Bring the changes you made there into the workspace, committed and pushed on feature/customer-returns, and nothing else from those checkouts. design-system isn’t in the workspace yet, so ask Kiln to add it first. Leave ~/devel/acme/storefront and ~/devel/acme/design-system as they are, and tell me what in them still needs putting back.",
      ].join("\n"),
    );
  });

  it("resumes with --resume in place of --session-id, the same flags otherwise", () => {
    const args = resumeArguments("7c1e9f2a-0000", "claude-opus-5-5", "high");
    expect(args.slice(0, 7)).toEqual(["-p", "--input-format", "stream-json", "--resume", "7c1e9f2a-0000", "--model", "claude-opus-5-5"]);
    expect(args).not.toContain("--session-id");
    expect(args.slice(7)).toEqual(launchArguments("x", "y", "high").slice(7));
    // A resumed run gets no PowerShell tool either (multi-repo design, "Sessions").
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("PowerShell");
    expect(resumeArguments("id", "claude-haiku-4-5", undefined)).not.toContain("--effort");
  });
});

describe("the keep-awake hold", () => {
  const reason = "Kiln: Customer returns is being implemented";

  it("is caffeinate -i on macOS, watching Kiln's PID", () => {
    expect(keepAwakeTool("darwin", { PATH: "" }, 4242, "Customer returns")).toEqual({ ok: true, command: "/usr/bin/caffeinate", args: ["-i", "-w", "4242"] });
  });

  it("is gnome-session-inhibit in a GNOME session and systemd-inhibit elsewhere on Linux, never one for the other", () => {
    expect(keepAwakeTool("linux", { PATH: "", XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, 1, "Customer returns")).toEqual({ ok: false, missing: "gnome-session-inhibit" });
    expect(keepAwakeTool("linux", { PATH: "", XDG_CURRENT_DESKTOP: "KDE" }, 1, "Customer returns")).toEqual({ ok: false, missing: "systemd-inhibit" });
    expect(keepAwakeMissingMessage("systemd-inhibit")).toBe("Can’t keep this computer awake: systemd-inhibit isn’t available.");
  });

  it("holds a sleep block with a reason naming the feature, around a command that ends with Kiln, under GNOME's tool or systemd's", () => {
    // Stand-in tools on PATH, so the arguments are pinned on every machine, whichever tool it has.
    const bin = mkdtempSync(join(tmpdir(), "kiln-keep-awake-"));
    try {
      for (const name of ["gnome-session-inhibit", "systemd-inhibit"]) {
        const file = join(bin, process.platform === "win32" ? `${name}.cmd` : name);
        writeFileSync(file, "");
        chmodSync(file, 0o755);
      }
      const until = ["sh", "-c", "while kill -0 77 2>/dev/null; do sleep 5; done"];
      const gnome = keepAwakeTool("linux", { PATH: bin, XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, 77, "Customer returns");
      expect(gnome).toMatchObject({ ok: true, command: expect.stringMatching(/gnome-session-inhibit/) });
      expect(gnome.ok && gnome.args).toEqual(["--inhibit", "suspend", "--app-id", "kiln", "--reason", reason, ...until]);
      const systemd = keepAwakeTool("linux", { PATH: bin, XDG_CURRENT_DESKTOP: "KDE" }, 77, "Customer returns");
      expect(systemd).toMatchObject({ ok: true, command: expect.stringMatching(/systemd-inhibit/) });
      expect(systemd.ok && systemd.args).toEqual(["--what=sleep", "--mode=block", "--who=Kiln", `--why=${reason}`, ...until]);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });

  it("is PowerShell holding SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) until Kiln's process ends, on Windows", () => {
    const tool = keepAwakeTool("win32", { SystemRoot: "C:\\Windows" }, 4242, "Customer returns");
    expect(tool.ok).toBe(true);
    if (!tool.ok) return;
    expect(tool.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
    const script = Buffer.from(tool.args[3]!, "base64").toString("utf16le");
    expect(script).toContain("SetThreadExecutionState([uint32]2147483649)");
    expect(script).toContain("Wait-Process -Id 4242");
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
  it("branch feature/<folder>, workspace .worktrees/<folder> beside it with the worktree in it, base develop or else origin's default, latest Opus at high", () => {
    const withDevelop = defaultSettings(paths, { branches: new Map([["main", "a"], ["develop", "b"]]), defaultBranch: "main" });
    expect(withDevelop).toEqual({
      workspaceFolder: join("/work", ".worktrees", "customer-returns"),
      worktreePath: join("/work", ".worktrees", "customer-returns", "acme-shop"),
      featureBranch: "feature/customer-returns",
      baseBranch: "develop",
      bases: {},
      model: "opus",
      effort: "high",
      keepAwake: true,
      resumeAfterUsageLimit: true,
    });
    expect(defaultSettings(paths, { branches: new Map([["trunk", "a"]]), defaultBranch: "trunk" }).baseBranch).toBe("trunk");
    expect(defaultSettings(paths, { branches: new Map([["x", "a"]]), defaultBranch: undefined }).baseBranch).toBe("");
  });

  it("lists develop, then origin's default, then the rest by name", () => {
    expect(baseBranchChoices({ branches: new Map([["zeta", "1"], ["main", "2"], ["alpha", "3"], ["develop", "4"]]), defaultBranch: "main" })).toEqual(["develop", "main", "alpha", "zeta"]);
  });
});

describe("reply policy keeps unattended continuation as the default", () => {
  it.each(["claude_code", "codex"] as const)("qualifies carry-on after a person's reply for %s, including PR and workspace repair", agentId => {
    for (const phaseDoc of [undefined, "docs/phase-1-build.md"]) {
      const prompt = resumePrompt({ agentId, time: "2026-10-24T12:00:00Z", note: "Why is a merge necessary? Explain before doing it.", outside: "Repair the workspace first.", ...(phaseDoc ? { phaseDoc } : {}) });
      expect(prompt.indexOf("Why is a merge necessary?")).toBeLessThan(prompt.indexOf("Repair the workspace first."));
      expect(prompt.indexOf("These reply-handling instructions qualify")).toBeGreaterThan(prompt.indexOf("Carry on"));
      expect(prompt).toContain("continue through the authorized work by default");
      expect(prompt).toContain("Do not stop for progress updates, reassurance, optional preferences, or incidental questions");
      expect(prompt).toContain("answer clearly in your final message and end this turn before taking that action");
      expect(prompt).toContain("writing a message does not mean they have read it or granted permission");
      expect(prompt).toContain("do not expand your authorization");
    }
    expect(resumePrompt({ agentId, time: "t", usageLimit: "weekly" })).not.toContain("reply-handling");
  });
});


describe("development finalization recovery task", () => {
  it("uses outstanding delivery work for both providers and every resume cause, with reply/repair precedence", () => {
    for (const agentId of ["claude_code", "codex"] as const) {
      for (const cause of [{}, { cause: "sleep" as const }, { cause: "sigint" as const }, { usageLimit: "usage limit" }, { endedOnItsOwn: true }]) {
        const prompt = resumePrompt({ ...cause, agentId, time: "2026-10-24T12:00:00Z", deliveryAuthority: JSON.stringify({ grants: [{ repository: "github.com/acme/api", baseBranch: "develop", environment: "api-dev" }], confirmedMerges: [{ url: "https://github.com/acme/api/pull/1" }] }), note: "Answer my question first.", outside: "Repair assigned workspace evidence first." });
        expect(prompt.indexOf("Answer my question first.")).toBeLessThan(prompt.indexOf("Repair assigned workspace evidence first."));
        expect(prompt.indexOf("Repair assigned workspace evidence first.")).toBeLessThan(prompt.indexOf("saved early-merge authority"));
        expect(prompt).toContain("outstanding evidence, assigned-branch synchronization, remaining review PRs and description links");
        expect(prompt).toContain("create no empty or duplicate final PR");
        expect(prompt).toContain("does not authorize merging remaining review work");
        expect(prompt).not.toContain("Carry on opening");
        expect(prompt).toContain("https://github.com/acme/api/pull/1");
      }
    }
    expect(resumePrompt({ time: "2026-10-24T12:00:00Z" })).toContain("Carry on opening the pull request");
  });
});

describe("audit recovery prompt (AC-RUN-02)", () => {
  const task = { label: "Delivery audit", prdFile: "docs/prds/proof/proof-prd.md", activityId: "a1", round: 2, reportPath: "docs/prds/proof/kiln-audit-a1.json", skillPath: "/skills/delivery-audit/SKILL.md" };
  it("carries Kiln's last refusal so a resumed session can correct it without a hand-written reply", () => {
    const prompt = auditRecoveryPrompt({ ...task, lastRefusal: { at: "2026-10-31T22:49:00Z", text: "invalid_report: Part applicability must be \"current\" or \"superseded\"." } });
    expect(prompt).toContain("Kiln's latest check of this report, at 2026-10-31T22:49:00Z, did not accept it: invalid_report: Part applicability must be \"current\" or \"superseded\". If the report already corrects this, resubmit it.");
    expect(prompt).toContain("submit with `kiln audit submit`");
  });
  it("says nothing about a refusal when there is none", () => {
    expect(auditRecoveryPrompt(task)).not.toContain("did not accept it");
  });
});
