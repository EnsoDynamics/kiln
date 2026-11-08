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
