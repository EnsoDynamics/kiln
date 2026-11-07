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
