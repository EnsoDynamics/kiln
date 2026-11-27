// A pressed Start goes ahead unless the chosen branch may be in use (Kiln Run Restart AC-FROM-06),
// through the engine and the HTTP route against real Git with a bare origin and the stand-in claude.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { createHarness, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { buildSnapshot } from "./snapshot.js";
import { shortSha } from "./git-reads.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const BRANCH = "feature/customer-returns";
const DIRECTORY = "docs/prds/customer-returns";
const exitsBeforeInit: ScenarioSession = { noInit: true, actions: [] };

/** Holds something Start waits for busy for `ms`, as a billing save or another command in flight is. */
function busyFor(ms: number, set: (busy: boolean) => void) {
  set(true);
  setTimeout(() => set(false), ms);
}

/** A commit on develop that leaves the PRD's documents alone, pushed: someone else's work landing on the base. */
function advanceDevelop(h: Harness, name: string): string {
  writeFileSync(join(h.repository, name), `${name}\n`);
  git(h.sandbox, h.repository, "add", name);
  git(h.sandbox, h.repository, "commit", "-q", "-m", `chore: ${name}`);
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  return git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
}

/** A branch with a commit of its own, pushed, with the person's checkout back on develop. */
function branchWithWork(h: Harness): string {
  git(h.sandbox, h.repository, "switch", "-q", "-c", BRANCH);
  writeFileSync(join(h.repository, "intake.txt"), "by hand\n");
  git(h.sandbox, h.repository, "add", "intake.txt");
  git(h.sandbox, h.repository, "commit", "-q", "-m", "feat: intake, by hand");
  git(h.sandbox, h.repository, "push", "-q", "-u", "origin", BRANCH);
  const tip = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "switch", "-q", "develop");
  return tip;
}

/** Another commit on the branch, pushed: someone still working on it. */
function pushToBranch(h: Harness): string {
  git(h.sandbox, h.repository, "switch", "-q", BRANCH);
  writeFileSync(join(h.repository, "more.txt"), "more\n");
  git(h.sandbox, h.repository, "add", "more.txt");
  git(h.sandbox, h.repository, "commit", "-q", "-m", "feat: more, by hand");
  git(h.sandbox, h.repository, "push", "-q", "origin", BRANCH);
  const tip = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "switch", "-q", "develop");
  return tip;
}

/** The preview id the page holds: the snapshot carries the engine's latest preview's (`documents.start.previewId`). */
const shownPreviewId = (h: Harness) => h.engine.startPreview!.previewId;

describe("a new-branch Start after the base moved (AC-FROM-06)", () => {
  it("starts from the base's new tip without pausing, and the run's settings say what it started from", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    expect(await h.engine.changeStart({ from: "new", bringUpToDate: true })).toEqual({ ok: true });
    const shown = shownPreviewId(h);

    const tip = advanceDevelop(h, "release-notes.txt");
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();

    expect(h.engine.record.repositories[0]!.baseCommit).toBe(tip);
    const sentence = `Started from develop at ${shortSha(tip)}. develop got 1 commit after the page loaded (chore: release-notes.txt). It doesn’t touch this PRD’s documents.`;
    expect(h.engine.record.startedFrom).toBe(sentence);
    expect(buildSnapshot(h.engine).settings.startedFrom).toBe(sentence);
  });

  it("says only the commit when nothing moved, and counts several commits", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const before = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    expect(buildSnapshot(h.engine).settings.startedFrom).toBeUndefined();
    const shown = shownPreviewId(h);
    advanceDevelop(h, "one.txt");
    const tip = advanceDevelop(h, "two.txt");
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();
    expect(before).not.toBe(tip);
    expect(h.engine.record.startedFrom).toBe(`Started from develop at ${shortSha(tip)}. develop got 2 commits after the page loaded. That didn’t change this PRD’s documents.`);
  });

  it("still finds the preview the page showed after another tab, or the terminal, refreshed it", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const shown = shownPreviewId(h);
    const tip = advanceDevelop(h, "release-notes.txt");
    // Another page loads and reads the base's new tip; this page still shows the earlier preview.
    await h.engine.refreshStartPreview();
    expect(shownPreviewId(h)).not.toBe(shown);
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.startedFrom).toBe(`Started from develop at ${shortSha(tip)}. develop got 1 commit after the page loaded (chore: release-notes.txt). It doesn’t touch this PRD’s documents.`);
  });

  it("says only the commit when the page was current", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const tip = git(h.sandbox, h.repository, "rev-parse", "develop").trim();
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shownPreviewId(h) })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.startedFrom).toBe(`Started from develop at ${shortSha(tip)}.`);
  });

  it("waits for a base check that is still running, where it used to refuse", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const shown = shownPreviewId(h);
    h.engine.checkBase();
    expect(h.engine.baseCheck).toBe("checking");
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.startedAt).toBeDefined();
  });
});

describe("a press while Kiln is finishing something else (AC-FROM-06)", () => {
  it("doesn't wait for a billing approval being saved: that press is refused, saying so, and the next one starts", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const billing = h.engine.billing as unknown as { commandBusy: boolean };
    // The save ends well inside the wait another command gets, and the press still doesn't ride on it.
    busyFor(200, busy => { billing.commandBusy = busy; });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shownPreviewId(h) })).toEqual({ ok: false, status: 409, reason: "Kiln is saving a billing approval. Press Start again once it’s saved." });
    expect(h.engine.record.startedAt).toBeUndefined();
    billing.commandBusy = false;
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shownPreviewId(h) })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.startedAt).toBeDefined();
  });

  it("waits, through the HTTP route, for another command being applied, and says to try again when it hasn't finished", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const commands = h.engine.commands as unknown as { applying: Receipt | undefined };
    const { startLocalServer } = await import("../server/local-server.js");
    const server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const origin = new URL(server.address).origin;
      const press = async () => {
        const response = await fetch(`${origin}/api/start`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ refinementConfirmed: true, previewId: shownPreviewId(h) }) });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
      };
      h.engine.pressWaitMs = 150;
      commands.applying = {} as Receipt;
      expect(await press()).toEqual({ status: 409, body: { ok: false, code: "busy", reason: "Another command to Kiln hasn’t finished, from the terminal or another tab. Try Start again in a moment." } });
      expect(h.engine.record.startedAt).toBeUndefined();

      h.engine.pressWaitMs = 5_000;
      busyFor(200, busy => { commands.applying = busy ? ({} as Receipt) : undefined; });
      expect(await press()).toEqual({ status: 200, body: { ok: true } });
      await h.engine.settled();
      expect(h.engine.record.startedAt).toBeDefined();
    } finally { await server.close(); }
  });
});

describe("an existing-branch Start (AC-FROM-06)", () => {
  it("pauses when the branch moved after the page was drawn, starts nothing, and goes ahead on the refreshed page", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    const was = branchWithWork(h);
    expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toEqual({ ok: true });
    const shown = shownPreviewId(h);

    const now = pushToBranch(h);
    const { startLocalServer } = await import("../server/local-server.js");
    const server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const origin = new URL(server.address).origin;
      const press = async (previewId: string) => {
        const response = await fetch(`${origin}/api/start`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ refinementConfirmed: true, previewId }) });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
      };
      const paused = await press(shown);
      expect(paused.status).toBe(409);
      expect(paused.body).toMatchObject({
        ok: false,
        code: "start_changed",
        paused: {
          headline: "Someone may be working on this branch",
          detail: `${BRANCH} changed after this page loaded: it was at ${shortSha(was)} and is now at ${shortSha(now)}.`,
          caution: "Only start if those commits are yours and that work is finished. Otherwise two sessions would be pushing to the same branch.",
          changed: ["branch"],
        },
      });
      expect(paused.body.reason).toContain("Nothing has started.");
      // Nothing started: no record of a Start, no worktree, and the page is back on Documents found.
      expect(h.engine.record.startedAt).toBeUndefined();
      expect(h.engine.record.repositories.some(entry => entry.setupCompletedAt !== undefined)).toBe(false);
      expect(shownPreviewId(h)).not.toBe(shown);

      // Start anyway submits the refreshed preview.
      const again = await press(shownPreviewId(h));
      expect(again).toEqual({ status: 200, body: { ok: true } });
      await h.engine.settled();
      expect(h.engine.record.repositories[0]).toMatchObject({ runStartCommit: now });
      expect(h.engine.record.startedFrom).toBe(`Started from ${BRANCH} at ${shortSha(now)}.`);
    } finally { await server.close(); }
  });

  it("pauses when a worktree for the branch appeared after the page was drawn", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    branchWithWork(h);
    await h.engine.changeStart({ from: "existing", bringUpToDate: true });
    const shown = shownPreviewId(h);
    expect(h.engine.startPreview!.repositories[0]!.worktree).toBeUndefined();

    const elsewhere = join(h.sandbox.root, "elsewhere", "acme-shop");
    mkdirSync(join(h.sandbox.root, "elsewhere"), { recursive: true });
    git(h.sandbox, h.repository, "worktree", "add", "-q", elsewhere, BRANCH);

    const answer = await h.engine.start({ refinementConfirmed: true, previewId: shown });
    expect(answer).toMatchObject({ ok: false, status: 409, code: "start_changed", paused: { headline: "This branch’s worktree changed", caution: "Only start if that folder is yours and nothing else is running there.", changed: ["worktree"] } });
    expect(answer.ok === false && answer.paused!.detail).toMatch(/^Kiln would work in .*elsewhere\/acme-shop, which wasn’t this branch’s worktree when this page loaded\.$/);
    expect(h.engine.record.startedAt).toBeUndefined();

    expect(await h.engine.start({ refinementConfirmed: true, previewId: shownPreviewId(h) })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]).toMatchObject({ worktreePath: elsewhere, adoptedWorktree: true });
  });

  it("doesn't pause when only the base moved or a pull request for the branch was opened, and says so afterwards", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    const tip = branchWithWork(h);
    await h.engine.changeStart({ from: "existing", bringUpToDate: true });
    const shown = shownPreviewId(h);

    advanceDevelop(h, "merged-elsewhere.txt");
    h.setPulls([{ number: 48, url: "https://github.com/acme/acme-shop/pull/48", title: "Customer returns", isDraft: false, isCrossRepository: false, headRefName: BRANCH, baseRefName: "develop", additions: 1, deletions: 0, commits: 1 }]);

    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.repositories[0]).toMatchObject({ runStartCommit: tip });
    expect(h.engine.record.startedFrom).toBe(`Started from ${BRANCH} at ${shortSha(tip)}. develop got 1 commit after the page loaded (chore: merged-elsewhere.txt). Pull request #48 for the branch was opened after the page loaded, and Kiln will use it.`);
  });

  it("doesn't pause when a phase was closed on the base of an untouched branch: it brings the branch up to date, starts at the next phase and says so", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    // The branch has no commits of its own and isn't behind when the page is drawn, so the page offers no catch-up.
    git(h.sandbox, h.repository, "branch", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "-u", "origin", BRANCH);
    await h.engine.changeStart({ from: "existing", bringUpToDate: true });
    const shown = shownPreviewId(h);
    expect(h.engine.startPreview).toMatchObject({ closedCount: 1, startAt: { id: "1" } });
    expect(h.engine.startPreview!.catchUp).toBeUndefined();

    // Phase 1 is marked closed on develop after the page was drawn.
    const path = join(h.repository, DIRECTORY, "phase-1-return-intake.md");
    const lines = readFileSync(path, "utf8").split("\n");
    lines.splice(1, 0, "", "**Closed:** 2026-11-12");
    writeFileSync(path, lines.join("\n"));
    git(h.sandbox, h.repository, "commit", "-q", "-am", "docs: phase 1 closed");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const tip = git(h.sandbox, h.repository, "rev-parse", "develop").trim();

    expect(await h.engine.start({ refinementConfirmed: true, previewId: shown })).toEqual({ ok: true });
    await h.engine.settled();
    expect(git(h.sandbox, h.origin, "rev-parse", `refs/heads/${BRANCH}`).trim()).toBe(tip);
    expect(h.engine.record.startedFrom).toBe(`Started from ${BRANCH}, brought up to date with develop at ${shortSha(tip)}. develop got 1 commit after the page loaded (docs: phase 1 closed). The phases closed there changed after the page loaded, so Kiln starts at Phase 2b.`);
    expect(h.claudeCalls()[0]!.prompt).toContain("phase-2b-store-credit.md");
  });

  it("pauses a page that showed other settings, and one whose preview Kiln no longer holds", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    branchWithWork(h);
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const shownAsNew = shownPreviewId(h);
    // Another tab chose the existing branch; this page still showed a new one.
    await h.engine.changeStart({ from: "existing", bringUpToDate: true });
    for (const previewId of [shownAsNew, "0".repeat(64)]) {
      expect(await h.engine.start({ refinementConfirmed: true, previewId })).toMatchObject({ ok: false, status: 409, code: "start_changed", paused: { headline: "This page was out of date", changed: ["settings"] } });
      expect(h.engine.record.startedAt).toBeUndefined();
    }
  });
});

describe("a Start that can't go ahead (AC-FROM-06)", () => {
  it("names a setting that stopped passing its check before it considers pausing, and says a started PRD has started", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit] });
    const h = harness;
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    const shown = shownPreviewId(h);
    // The name Kiln would give its branch is taken after the page was drawn.
    git(h.sandbox, h.repository, "branch", BRANCH);
    const refused = await h.engine.start({ refinementConfirmed: true, previewId: shown });
    expect(refused).toMatchObject({ ok: false, status: 409, reason: "The settings don’t pass their checks. Each one that needs fixing is marked on the page." });
    expect(refused).not.toHaveProperty("paused");
    expect(refused.ok === false && refused.fieldErrors!.featureBranch).toMatch(/^That branch already exists\./);
    expect(buildSnapshot(h.engine).settings.fieldErrors.featureBranch).toMatch(/^That branch already exists\./);

    git(h.sandbox, h.repository, "branch", "-D", BRANCH);
    await h.engine.changeStart({ from: "new", bringUpToDate: true });
    expect(await h.engine.start({ refinementConfirmed: true, previewId: shownPreviewId(h) })).toEqual({ ok: true });
    await h.engine.settled();
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
  });
});
