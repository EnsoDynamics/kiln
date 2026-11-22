// Exit Kiln on a finished run's screens (Kiln After Delivery AC-EXIT-01, AC-EXIT-02, mockup states 1
// to 4 and 7), rendered from snapshots: the Kiln panel, the Merged card's main button, a merge stop's
// Needs you page, a merge session's Waiting screen, the reason while a session runs, and the page
// after Kiln has exited.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { completeSnapshot, needsYouMessageSnapshot, RUNNING_NOW, USAGE_LIMIT_NOW, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";
import Exited from "./Exited.svelte";
import NeedsYou from "./NeedsYou.svelte";
import Waiting from "./Waiting.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const COMMAND = "kiln run docs/prds/customer-returns";
const RUNNING = "Exit Kiln returns once the session ends, or once Kiln has started it. Ctrl+C still stops everything, the session included.";
const LINE = "Stops Kiln in its terminal. The pull request and the worktree stay.";
const exitButton = (markup: string) => markup.match(/<button[^>]*>Exit Kiln<\/button>/)?.[0];
const complete = (snapshot: Snapshot) => render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: undefined, config: { token: "t", base: "/customer-returns" } } }).body;
function finished(exit: Snapshot["exit"] = { available: true, command: COMMAND }): Snapshot {
  const snapshot = completeSnapshot();
  snapshot.exit = exit;
  return snapshot;
}

describe("Exit Kiln on a finished run (AC-EXIT-01)", () => {
  it("is in the Kiln panel, with the line saying it stops Kiln in its terminal and leaves the pull request and worktree (state 1)", () => {
    const markup = complete(finished());
    expect(exitButton(markup)).toBeDefined();
    expect(exitButton(markup)).not.toContain("disabled");
    expect(text(markup)).toContain(`Exit Kiln ${LINE}`);
  });

  it("is disabled with Kiln's reason while a session runs (state 2)", () => {
    const markup = complete(finished({ available: false, reason: RUNNING, command: COMMAND }));
    expect(exitButton(markup)).toContain("disabled");
    expect(text(markup)).toContain(`Exit Kiln ${RUNNING}`);
  });

  it("is the Merged card's main button, and the Kiln panel points to it (state 3)", () => {
    const snapshot = finished();
    snapshot.afterDelivery = { pullRequests: [{ repository: "acme-shop", number: 218, state: "merged", mergedAt: "2026-10-17T19:19:00Z", mergeCommit: "8e41c0d0000000000000000000000000000000000", readAt: "2026-10-17T19:19:00Z" }], waiting: false, offer: { kind: "all_merged", available: false }, merge: { state: "done", summary: "Merged #218.", pullRequests: [{ repository: "acme-shop", number: 218 }], folder: "~/w" } };
    const markup = complete(snapshot);
    expect(markup).toMatch(/<button class="button solid[^"]*"[^>]*>Exit Kiln<\/button>/);
    const words = text(markup);
    expect(words).toContain("Exit Kiln Nothing is left for Kiln to do on this PRD. Exiting stops Kiln in its terminal; the worktree stays until you remove it. Open on GitHub");
    expect(words).toContain("Exit Kiln is in the merge card. Ctrl+C in the terminal does the same.");
    expect(markup.match(/>Exit Kiln<\/button>/g)).toHaveLength(1);
  });

  it("is on the Needs you page of a merge stop (state 4)", () => {
    const snapshot = needsYouMessageSnapshot();
    snapshot.needsYou = { ...snapshot.needsYou!, phaseId: "merge", kind: "merge_check", resumeOffered: true, finalMessage: "A required review is missing.", checks: [] };
    snapshot.exit = { available: true, command: COMMAND };
    const words = text(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
    expect(words).toContain(`Exit Kiln ${LINE}`);
  });

  it("is on the Waiting screen of a merge session's usage wait", () => {
    const snapshot = waitingSnapshot();
    snapshot.waiting = { ...snapshot.waiting!, phaseId: "merge" };
    snapshot.exit = { available: true, command: COMMAND };
    expect(text(render(Waiting, { props: { snapshot, now: USAGE_LIMIT_NOW } }).body)).toContain(`Exit Kiln ${LINE}`);
  });

  it("is never on a run still in progress", () => {
    expect(exitButton(render(Waiting, { props: { snapshot: waitingSnapshot(), now: USAGE_LIMIT_NOW } }).body)).toBeUndefined();
    expect(exitButton(render(NeedsYou, { props: { snapshot: needsYouMessageSnapshot(), now: RUNNING_NOW } }).body)).toBeUndefined();
  });
});

describe("after Exit Kiln (AC-EXIT-02, state 7)", () => {
  it("says Kiln has exited, when, that the page no longer updates, and the command that opens the PRD again", () => {
    const at = new Date(2026, 10, 22, 15, 24).toISOString();
    const words = text(render(Exited, { props: { exit: { at, via: "browser", command: COMMAND }, now: new Date(2026, 10, 22, 15, 30).getTime() } }).body);
    expect(words).toContain("Kiln has exited You exited Kiln from this page at 3:24 PM. Nothing is running. The pull request and the worktree stay as they are, and this page no longer updates.");
    expect(words).toContain(`To open this PRD in Kiln again: ${COMMAND}`);
    const bot = text(render(Exited, { props: { exit: { at, via: "command_line", command: COMMAND }, several: true, now: new Date(2026, 10, 22, 15, 30).getTime() } }).body);
    expect(bot).toContain("Kiln was exited from the command line at 3:24 PM. Nothing is running. The pull requests and the worktrees stay as they are");
  });
});
