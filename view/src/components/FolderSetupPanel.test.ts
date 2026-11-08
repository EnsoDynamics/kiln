// The Folder missing setup panel rendered to HTML: its Agent, Model and Effort fields carry
// Documents found's messages and effort behavior for the model chosen in the panel (missing
// worktree recovery AC-SETUP-01).

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { SetupPanel } from "../../../src/engine/folder-setup.js";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { folderMissingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import FolderSetupPanel from "./FolderSetupPanel.svelte";

const config = { token: "t", base: "/invoice-evidence-collection" };
const html = (snapshot: Snapshot) => render(FolderSetupPanel, { props: { snapshot, config, connected: true } }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const withPanel = (change: Partial<SetupPanel>, snapshot = folderMissingSnapshot("merged")): Snapshot => {
  snapshot.folderMissing!.panel = { ...(snapshot.folderMissing!.panel as SetupPanel), ...change };
  return snapshot;
};

describe("the setup panel's Agent, Model and Effort (AC-SETUP-01)", () => {
  it("lists the panel model's efforts, disabling none it takes, with the chosen one pressed", () => {
    const page = html(withPanel({ effortLevels: ["high", "max"], fields: { ...(folderMissingSnapshot("merged").folderMissing!.panel as SetupPanel).fields, effort: "max" } }));
    const buttons = [...page.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((match) => [match[2], match[1]]);
    expect(buttons).toEqual([["High", "false"], ["Max", "true"]]);
    expect(page).not.toMatch(/<button type="button" aria-pressed="(true|false)"[^>]*disabled/);
    expect(text(page)).not.toContain("This model takes no effort setting.");
  });

  it("says when the panel's model takes no effort setting, with no level pressed", () => {
    const page = html(withPanel({ effortLevels: [], fields: { ...(folderMissingSnapshot("merged").folderMissing!.panel as SetupPanel).fields, effort: "" } }));
    expect(text(page)).toContain("This model takes no effort setting.");
    expect(page).not.toMatch(/aria-pressed="true"/);
  });

  it("offers only the levels the panel’s model takes", () => {
    const page = html(withPanel({ effortLevels: ["low", "medium", "high"] }));
    expect(page).not.toContain(">Max</button>");
  });

  it("shows Model's field message and the model list's error under Model", () => {
    const snapshot = withPanel({ fieldErrors: { model: "Choose a supported effort for Fable 5.1. Saved effort: low." } });
    snapshot.settings.modelListError = "Claude Code couldn’t list its models.";
    const words = text(html(snapshot));
    expect(words).toContain("Choose a supported effort for Fable 5.1. Saved effort: low.");
    expect(words).toContain("Claude Code couldn’t list its models.");
  });

  it("shows the account's error, or its usage error, under Agent", () => {
    const failed = withPanel({});
    failed.account = { ...failed.account!, error: "Claude Code isn’t signed in." } as Snapshot["account"];
    const failedWords = text(html(failed));
    expect(failedWords).toContain("Claude Code isn’t signed in.");
    // The error replaces the account and usage lines, as on Documents found.
    expect(failedWords).not.toContain(failed.account!.email!);
    const usage = withPanel({});
    usage.account = { ...usage.account!, limitsError: "Usage couldn’t be read." } as Snapshot["account"];
    expect(text(html(usage))).toContain("Usage couldn’t be read.");
  });
});

describe("the rest of Documents found's fields (Phase 5 of missing worktree recovery: AC-SETUP-01)", () => {
  it("shows keep-awake's error under its switch, and the readiness errors and a reset effort's notice after the account-access line", () => {
    const snapshot = withPanel({ choiceNotice: "Effort changed to high for Fable 5.1." });
    snapshot.settings.keepAwakeError = "Kiln couldn’t keep this computer awake.";
    snapshot.settings.readinessErrors = ["Codex needs a newer CLI."];
    const words = text(html(snapshot));
    expect(words).toMatch(/Kiln picks up where it left off afterwards\. Kiln couldn’t keep this computer awake\. Resume after a usage limit/);
    expect(words).toMatch(/Listed models do not guarantee account access\. Effort changed to high for Fable 5\.1\. Codex needs a newer CLI\. Refresh agent information/);
    expect(text(html(withPanel({})))).not.toMatch(/Effort changed|Kiln couldn’t keep/);
  });

  it("holds Refresh agent information while agent information or billing is still loading", () => {
    const refresh = (snapshot: Snapshot) => /<button type="button" class="button"( disabled="")?[^>]*>Refresh agent information/.exec(html(snapshot))?.[1] !== undefined;
    expect(refresh(withPanel({}))).toBe(false);
    const metadata = withPanel({});
    metadata.settings.metadataPending = true;
    expect(refresh(metadata)).toBe(true);
    const billing = withPanel({});
    billing.billing = { ...(billing.billing ?? {}), pending: true } as Snapshot["billing"];
    expect(refresh(billing)).toBe(true);
  });

  it("shows the Codex account panel under Effort for a Codex run, and none for Claude Code", () => {
    const codex = withPanel({});
    codex.settings.agentId = "codex";
    codex.settings.agent = "Codex";
    codex.account = { ...codex.account!, agentId: "codex" } as Snapshot["account"];
    const words = text(html(codex));
    expect(words).toMatch(/uses more of your plan\. (This model takes no effort setting\. )?Codex account[\s\S]*Keep this computer awake/);
    expect(text(html(withPanel({})))).not.toContain("Claude account");
  });

  it("tags a repository a session added with the phase that added it, as Documents found does", () => {
    const snapshot = folderMissingSnapshot("multi");
    const panel = snapshot.folderMissing!.panel as SetupPanel;
    panel.repositories = [panel.repositories[0]!, { ...panel.repositories[1]!, kind: "added", addedInPhase: "3" }];
    expect(text(html(snapshot))).toMatch(/harbor-portal added in phase 3/);
  });
});

describe("a Start that stopped partway (Phase 9 of missing worktree recovery: AC-SAFE-01)", () => {
  it("says why it stopped, what it did and what remains", () => {
    const snapshot = withPanel({});
    snapshot.folderMissing!.startProgress = { error: "Start stopped before it finished.", done: ["Create feature/x-2 and its folder"], remaining: ["Read the plan in the new folder", "Start the fresh execution"] };
    expect(text(html(snapshot))).toContain("Start stopped: Start stopped before it finished. Done: Create feature/x-2 and its folder. Still to do: Read the plan in the new folder; Start the fresh execution. Press Start again to do only what remains.");
  });
});

const panelOf = (snapshot: Snapshot) => snapshot.folderMissing!.panel as SetupPanel;
/** Whether the control whose opening tag `pattern` matches is disabled. */
const disabledTag = (page: string, pattern: RegExp) => { const tag = pattern.exec(page)?.[0]; if (!tag) throw new Error(`No control matches ${pattern}`); return /\sdisabled(=""|\s|>)/.test(tag); };
const WORKTREE = /<input[^>]*id="fm-worktree"[^>]*>/, BRANCH = /<input[^>]*id="fm-branch"[^>]*>/, BASE = /<select[^>]*id="fm-base"[^>]*>/, WORKSPACE = /<input[^>]*id="fm-workspace"[^>]*>/, AGENT = /<select[^>]*id="fm-agent"[^>]*>/;

describe("the panel's sections and first-Start words (AC-SETUP-01)", () => {
  it("is titled Set the run up again, with its four parts in order", () => {
    const words = text(html(withPanel({})));
    expect(words).toMatch(/^Set the run up again/);
    const at = ["Start from", "What will run", "How Kiln will deliver it", "Before you start", "Starting lets Kiln"].map((label) => words.indexOf(label));
    expect(at.every((position) => position >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("lays out How Kiln will deliver it in Documents found's order, for one repository", () => {
    const words = text(html(withPanel({})));
    const order = ["Worktree", "Feature branch", "Branch from, and PR into", "Sessions can add a repository they find they need.", "Agent", "Model", "Listed models do not guarantee account access.", "Effort", "Keep this computer awake while a session works or Kiln waits", "Resume after a usage limit", "Pushes", "Ends at"];
    const deliver = words.slice(words.indexOf("How Kiln will deliver it"), words.indexOf("Before you start"));
    const at = order.map((label) => deliver.indexOf(label));
    expect(at.every((position) => position >= 0), JSON.stringify(at)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("says what sessions may do in a repository they add, for one repository and for several", () => {
    const line = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";
    expect(text(html(withPanel({})))).toContain(line);
    expect(text(html(folderMissingSnapshot("multi")))).toContain(line);
  });

  it("shows the agent's account and usage lines and that the agent is fixed", () => {
    const words = text(html(withPanel({})));
    expect(words).toContain("alex@acme-shop.dev · Max plan");
    expect(words).toContain("Used: 5-hour 82% · weekly 41% · Fable 6%");
    expect(words).toContain("Agent fixed for this PRD.");
  });

  it("shows each repository's base in the Repositories list, and lets a base start change it", () => {
    const snapshot = folderMissingSnapshot("multi");
    const panel = panelOf(snapshot);
    panel.selected = "base"; panel.fixed = ["agentId"];
    panel.repositories = [{ ...panel.repositories[0]!, baseBranch: "develop" }, { ...panel.repositories[1]!, baseBranch: "main" }];
    const page = html(snapshot);
    const selects = [...page.matchAll(/<select class="mono[^"]*"[^>]*>([\s\S]*?)<\/select>/g)].map((match) => [/<option value="([^"]+)" selected/.exec(match[1]!)?.[1], /\sdisabled/.test(match[0].split(">")[0]!)]);
    expect(selects).toEqual([["develop", false], ["main", false]]);
    expect(text(page)).toContain("Repositories Branch from, and PR into");
  });

  it("shows a fixed repository base as PR into, not to be changed, on an existing-branch start", () => {
    const page = html(folderMissingSnapshot("multi"));
    const selects = [...page.matchAll(/<select class="mono[^"]*"[^>]*>/g)].map((match) => match[0]);
    expect(selects).toHaveLength(2);
    expect(selects.every((tag) => /\sdisabled/.test(tag))).toBe(true);
    expect(text(page)).toContain("Repositories PR into");
    expect(disabledTag(page, WORKSPACE)).toBe(true);
  });

  it("disables only the agent on a base start, and calls the base Branch from, and PR into", () => {
    const page = html(withPanel({}));
    expect(disabledTag(page, AGENT)).toBe(true);
    expect(disabledTag(page, WORKTREE)).toBe(false);
    expect(disabledTag(page, BRANCH)).toBe(false);
    expect(disabledTag(page, BASE)).toBe(false);
    expect(text(page)).toContain("Branch from, and PR into");
  });

  it("disables the branch and base on an existing-branch start, keeps the folder editable, and says PR into", () => {
    const page = html(folderMissingSnapshot("unmerged"));
    expect(disabledTag(page, BRANCH)).toBe(true);
    expect(disabledTag(page, BASE)).toBe(true);
    expect(disabledTag(page, WORKTREE)).toBe(false);
    const words = text(page);
    expect(words).toContain("PR into");
    expect(words).not.toContain("Branch from, and PR into");
  });

  it("gives the folder and the branch one more line saying whether each is new or the run's saved one", () => {
    const base = text(html(withPanel({})));
    expect(base).toContain("New: a folder named for the new branch.");
    expect(base).toContain("New, so this run’s earlier branch and pull request stay separate.");
    const branch = text(html(folderMissingSnapshot("unmerged")));
    expect(branch).toContain("The run’s saved path.");
    expect(branch).toContain("The run’s existing branch. Kiln creates no new branch.");
  });

  it("shows the switches in Documents found's words with their saved state", () => {
    const off = withPanel({ fields: { ...(folderMissingSnapshot("merged").folderMissing!.panel as SetupPanel).fields, keepAwake: false, resumeAfterUsageLimit: true } });
    const page = html(off);
    const box = (label: string) => new RegExp(`<input type="checkbox"([^>]*)>\\s*<span>${label}`).exec(page)?.[1];
    expect(box("Keep this computer awake")).not.toMatch(/checked/);
    expect(box("Resume after a usage limit")).toMatch(/checked/);
    const words = text(page);
    expect(words).toContain("Stops idle sleep only. Closing a laptop’s lid can still put it to sleep; Kiln picks up where it left off afterwards.");
    expect(words).toContain("Switch off to finish the phase yourself; Needs you then shows how.");
  });

  it("says Pushes and Ends at, for one repository, several and a run with early merges", () => {
    const words = (snapshot: Snapshot) => text(html(snapshot)).match(/Pushes After every phase Ends at (.*?)(?= Before you start| Billing| Early|$)/)?.[1];
    expect(words(withPanel({}))).toBe("One PR, ready for review. Kiln won’t merge.");
    expect(words(folderMissingSnapshot("multi"))).toBe("One PR in each repository that changed, ready for review. Kiln won’t merge.");
    const early = withPanel({});
    early.settings.developmentDeployments = { enabled: true, targets: [] };
    expect(words(early)).toBe("Confirmed development deliveries and any remaining review PRs");
  });

  it("starts Model and Effort from the choices the panel carries", () => {
    const snapshot = withPanel({ fields: { ...(folderMissingSnapshot("merged").folderMissing!.panel as SetupPanel).fields, model: "sonnet", effort: "medium" }, effortLevels: ["low", "medium", "high"] });
    const page = html(snapshot);
    const model = /<select id="fm-model"[^>]*>([\s\S]*?)<\/select>/.exec(page)![1]!;
    expect(/<option[^>]*value="sonnet"[^>]*selected/.test(model) || /<option[^>]*selected[^>]*value="sonnet"/.test(model)).toBe(true);
    expect(page).toMatch(/aria-pressed="true"[^>]*>Medium</);
  });
});

describe("the panel's early-merges and billing panels (AC-SETUP-01)", () => {
  const earlyMerges = (snapshot: Snapshot, enabled: boolean) => {
    snapshot.settings.developmentDeployments = { enabled, targets: [] };
    snapshot.developmentDelivery = { executionId: "e", authorization: { revision: 1, enabled, grants: enabled ? [{ target: { repository: "acme/harbor-ledger", baseBranch: "develop" }, confirmedAt: "2026-10-24T13:00:00Z", source: "start" }] : [] }, checkpoints: [], repositoryResults: [] } as unknown as Snapshot["developmentDelivery"];
    return snapshot;
  };

  it("shows the early-merges panel with what the run saved, only when the run has early merges on", () => {
    const on = text(html(earlyMerges(withPanel({}), true)));
    expect(on).toContain("Early merges allowed");
    expect(on).toContain("acme/harbor-ledger · develop");
    expect(text(html(earlyMerges(withPanel({}), false)))).not.toContain("Early merges allowed");
  });

  it("shows the billing panel with the billing the run saved", () => {
    const snapshot = withPanel({});
    snapshot.feature.state = "folder_missing" as Snapshot["feature"]["state"];
    const launch = { agentId: "claude_code", route: "subscription", sources: [], email: "alex@acme-shop.dev", observedAt: "2026-10-24T13:12:00Z", diagnostics: [], approved: false } as const;
    snapshot.billing = { executionId: "e", selectionGeneration: 0, pending: false, lastLaunch: launch, next: { ...launch, readingId: "r", canApprove: false, canClear: false }, canLaunch: true } as unknown as Snapshot["billing"];
    const words = text(html(snapshot));
    expect(words).toContain("Billing used to launch this session");
    expect(words).toContain("Billing follows your Claude account settings.");
  });
});

describe("Start while a session runs (AC-SAFE-01)", () => {
  const startButton = (page: string) => /<button type="button" class="primary[^"]*"[^>]*>Set up &amp; start[^<]*<\/button>/.exec(page)?.[0];
  const busyLine = "A session is still running. Start becomes available when it ends, or when you stop Kiln in the terminal.";

  it("holds Start and says why while the engine reports a session running", () => {
    const page = html(withPanel({ busy: busyLine }));
    expect(startButton(page)).toMatch(/\sdisabled/);
    expect(text(page)).toContain(busyLine);
    expect(text(page)).not.toContain("Earlier phases, sessions and delivery links stay in this run’s history.");
  });

  it("offers Start, with its history line, when nothing is running", () => {
    const page = html(withPanel({}));
    expect(startButton(page)).not.toMatch(/\sdisabled/);
    expect(text(page)).toContain("Earlier phases, sessions and delivery links stay in this run’s history.");
  });
});
