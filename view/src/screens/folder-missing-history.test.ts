// The Folder missing page's run history rendered to HTML: completion results recorded while a
// phase waited for usage stay visible only there, labelled with when they were checked (missing
// worktree recovery AC-GONE-02, Phase 8).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { folderMissingSnapshot, FOLDER_MISSING_NOW } from "../../../src/test-support/sample-snapshots.js";
import FolderMissing from "./FolderMissing.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const page = (snapshot: ReturnType<typeof folderMissingSnapshot>) => text(render(FolderMissing, { props: { snapshot, connected: true, now: FOLDER_MISSING_NOW, lastSeenAt: undefined } }).body);

describe("the run's history on the Folder missing page (AC-GONE-02)", () => {
  it("shows a waiting phase's recorded completion results, with when they were checked, and no phase state", () => {
    const snapshot = folderMissingSnapshot("unmerged");
    snapshot.phases = snapshot.phases.slice(0, 3);
    snapshot.folderMissing!.waitingResult = { phaseId: "4", checkedAt: new Date(FOLDER_MISSING_NOW - 2 * 3_600_000).toISOString(), passed: 1, failed: 2 };
    snapshot.phases.push({ ...snapshot.phases[0]!, id: "4", title: "Phase 4 work", state: "waiting" as never, doneAt: undefined });
    const body = page(snapshot);
    expect(body).toContain("This run’s history · 3 phases done · phase 4 was waiting for usage");
    expect(body).toMatch(/phase 4 · Phase 4 work Was waiting for usage · 2 of 3 completion checks failed · checked 6:35 AM /);
    expect(body).not.toMatch(/Waiting for usage\.|resets|Resume now/);
  });

  it("shows no waiting row when no phase was waiting", () => {
    expect(page(folderMissingSnapshot("unmerged"))).not.toContain("waiting for usage");
  });
});

describe("the put-it-back command on the Folder missing page (AC-SETUP-06)", () => {
  const body = (snapshot: ReturnType<typeof folderMissingSnapshot>) => render(FolderMissing, { props: { snapshot, connected: true, now: FOLDER_MISSING_NOW, lastSeenAt: undefined } }).body;
  it("shows the command git needs when the existing branch can be used", () => {
    const snapshot = folderMissingSnapshot("unmerged");
    const commands = snapshot.folderMissing!.restoreCommands;
    expect(commands.length).toBeGreaterThan(0);
    const markup = body(snapshot);
    const details = markup.slice(markup.indexOf("Show the command"), markup.indexOf("</details>", markup.indexOf("Show the command")));
    expect([...details.matchAll(/<code[^>]*>([^<]*)<\/code>/g)].map(match => match[1])).toEqual(commands);
  });

  it("shows no command when the existing branch isn't an available start", () => {
    expect(body(folderMissingSnapshot("occupied"))).not.toContain("Show the command");
  });
});
