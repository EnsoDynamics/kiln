// The terminal command for an activity that hasn't started, rendered to HTML (Kiln Phase Model
// Tiers AC-PICK-07): once its current choice isn't the one its saved session ran on (here moved to
// Codex), the paused page's take-over column, the hand-back page's terminal card and the usage-limit
// Needs you page give the fresh-session command for the current choice's agent, never the command
// that reopens the saved conversation. The Waiting screen offers no terminal command at all
// (usage-limit recovery AC-LIMIT-04), so it has nothing to switch.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { handBackSnapshot, needsYouUsageLimitSnapshot, pausedHoldSnapshot, RUNNING_NOW, USAGE_LIMIT_NOW, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import NeedsYou from "./NeedsYou.svelte";
import PausedHold from "./PausedHold.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";
import Waiting from "./Waiting.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const page = { key: "2b", draft: "", choice: false, unsent: false };
/** The fresh-session command the engine builds for a Codex current choice in the sample worktree (`codexCommand`). */
const CODEX_FRESH = "cd ~/devel/acme-shop-kiln/customer-returns\ncodex";
const CLAUDE_FRESH = "cd ~/devel/acme-shop-kiln/customer-returns\nclaude";
const SESSION_2B = "7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04";
/** Whether a <pre>, whatever its class, holds exactly `command`. */
const preHolding = (html: string, command: string) => new RegExp(`<pre[^>]*>${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</pre>`).test(html);
/** The section whose aria-label is `label`, up to its closing tag. */
const section = (html: string, label: string) => html.match(new RegExp(`<section[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?</section>`))?.[0] ?? "";

/**
 * Phase 2b's session never got a response and its current choice moved to Codex: the snapshot
 * carries no reopen command and Codex's fresh-session command, as `stoppedView` builds it.
 */
function movedToCodex(snapshot: Snapshot): Snapshot {
  const stop = snapshot.needsYou!;
  expect(stop.resumeCommand).toContain(`claude --resume ${SESSION_2B}`);
  delete stop.resumeCommand;
  stop.newSession = true;
  stop.agent = "Claude Code";
  stop.freshSessionCommand = CODEX_FRESH;
  snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.1-sol", modelName: "GPT Sol", effort: "high" } } } : row);
  return snapshot;
}

function expectFreshCodexOnly(html: string) {
  expect(preHolding(html, CODEX_FRESH)).toBe(true);
  expect(html).not.toContain("--resume");
  expect(html).not.toContain(SESSION_2B);
  expect(preHolding(html, CLAUDE_FRESH)).toBe(false);
}

describe("the fresh-session command for an activity whose choice changed (AC-PICK-07)", () => {
  it("is the paused page's take-over command, with no reopen command", () => {
    const html = strip(render(PausedHold, { props: { snapshot: movedToCodex(pausedHoldSnapshot()), now: RUNNING_NOW, page } }).body);
    const column = section(html, "Or take it over yourself");
    expect(column).not.toBe("");
    expectFreshCodexOnly(column);
    expectFreshCodexOnly(html);
  });

  it("is the hand-back page's terminal card, Start a fresh session in your terminal, with no reopen command", () => {
    const html = strip(render(PhaseHandoff, { props: { snapshot: movedToCodex(handBackSnapshot()), now: RUNNING_NOW, page } }).body);
    expect(html).toMatch(/<h2[^>]*>Start a fresh session in your terminal<\/h2>\s*<p[^>]*>The saved conversation cannot be opened\. Start Codex in the recorded workspace and supply the recovery prompt\.<\/p>\s*<pre[^>]*>cd ~\/devel\/acme-shop-kiln\/customer-returns\ncodex<\/pre>/);
    expect(html).not.toContain("Talk it through in your terminal");
    expectFreshCodexOnly(html);
  });

  it("is the usage-limit Needs you page's first step, a fresh Codex session, with no reopen command", () => {
    const html = strip(render(NeedsYou, { props: { snapshot: movedToCodex(needsYouUsageLimitSnapshot()), now: USAGE_LIMIT_NOW } }).body);
    expect(html).toContain("Start a fresh Codex session in the worktree");
    expect(html).not.toContain("Open the same Claude Code session in a terminal");
    expectFreshCodexOnly(html);
  });

  it("leaves the Waiting screen without any terminal command to open a session", () => {
    const snapshot = waitingSnapshot();
    snapshot.waiting!.newSession = true;
    const html = strip(render(Waiting, { props: { snapshot, now: USAGE_LIMIT_NOW } }).body);
    expect(html).not.toContain("--resume");
    expect(html).not.toMatch(/<pre[^>]*>cd [^<]*\n(claude|codex)<\/pre>/);
  });
});
