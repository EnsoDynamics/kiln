/**
 * The runs and helpers the folder-setup integration files share: setting a run up again from the
 * Folder missing page (missing worktree recovery), with real Git. Each file owns its harness and
 * its command counter, because some of its tests set or advance them directly, so the helpers
 * that create a harness or number a command come from `folderSetupRuns`, which hands each new
 * harness to `keep` and draws each number from `nextCommand`.
 */
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { createHarness, landingSession, type Harness } from "./engine-harness.js";
import { createGithubOrigin, createRepository, git } from "./git-repositories.js";
import { prdDirectoryFiles } from "./fixture-documents.js";
import type { SetupPanel } from "../engine/folder-setup.js";

export const panelOf = (h: Harness): SetupPanel => {
  const panel = h.engine.folderPanel;
  if (!panel || "blocked" in panel) throw new Error(`No setup panel: ${JSON.stringify(panel)}`);
  return panel;
};

export const text = (parts: { text?: string }[]) => parts.map(part => part.text ?? "").join("");

/** A delivery loop already counted, which a Start on Folder missing either restarts or keeps (Kiln Audit Loop Limits AC-LOOP-04). */
export function seedLoops(h: Harness) {
  const at = h.engine.record.startedAt!;
  h.engine.record.auditLoops = { epochs: [{ kind: "delivery", at, cause: "start", loopsBefore: 0 }, { kind: "test", at, cause: "start", loopsBefore: 0 }], loops: [{ kind: "delivery", number: 1, startedAt: at, activityKey: "audit-seeded" }] };
  return structuredClone(h.engine.record.auditLoops);
}

/** develop's plan no longer has Phase 1; the phases that depended on it depend on nothing. */
export function dropPhaseOne(h: Harness): void {
  git(h.sandbox, h.repository, "rm", "-q", "docs/prds/customer-returns/phase-1-return-intake.md");
  for (const file of ["phase-2-refunds.md", "phase-2a-card-refunds.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
    const path = join(h.repository, "docs/prds/customer-returns", file);
    writeFileSync(path, readFileSync(path, "utf8").replace(/## Phase dependencies\n[^\n]*\n/, "## Phase dependencies\nNone.\n"));
  }
  git(h.sandbox, h.repository, "commit", "-qam", "Phase 1 folded into another PRD");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
}

/** Phase 1 merged into develop on origin, with the given phases closed there too: the 2026-11-06 case. */
export function mergedWithClosed(h: Harness, files: string[]): void {
  git(h.sandbox, h.repository, "fetch", "-q", "origin");
  git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge", "origin/feature/customer-returns");
  for (const file of files) {
    const path = join(h.repository, "docs/prds/customer-returns", file);
    const [title, ...rest] = readFileSync(path, "utf8").split("\n");
    writeFileSync(path, [title, "**Closed:** 2026-11-06", ...rest].join("\n"));
  }
  git(h.sandbox, h.repository, "commit", "-qam", "Close phases elsewhere");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
}

/** A commit on Phase 2b's branch that was never pushed: the work of the phase the run was on. */
export function storeCreditWork(h: Harness): void {
  writeFileSync(join(h.engine.worktreePath, "src", "credit.txt"), "half done\n");
  git(h.sandbox, h.engine.worktreePath, "add", "src/credit.txt");
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "wip: store credit");
}

/** The git commands the existing limits forbid during Start; merge-base and similar reads don't match (AC-SAFE-03). */
export const FORBIDDEN_GIT = /^(merge|reset|rebase|worktree prune)( |$)|^branch .*(-D|-d|--delete)( |$)|^push .*(--force\S*|-f|--delete|--mirror)( |$)|^push .* \+\S|^update-ref -d /;

export const heldBy = (h: Harness, key = "2b") => {
  const session = h.engine.latestSession(key)!;
  const target = { executionId: h.engine.record.executionId!, activityId: key, activityKey: key, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: session.runs.at(-1)!.control?.attemptId ?? createHash("sha256").update(`${h.engine.record.executionId}:${session.sessionId}:${session.runs.length - 1}`).digest("hex") };
  const at = new Date().toISOString();
  return { version: 1 as const, revision: 1, takeover: { target, operationId: "take-over", instructionId: "take-over", requestedAt: at, releasedAt: at, state: "released" as const, observedAt: at, reason: "Paused." } };
};

export const lines = (panel: SetupPanel) => panel.preview.lets.map(row => text(row.parts));

/** Phase 2b finished by hand on the run's feature branch before the folder went: closed, committed and pushed. */
export function landStoppedPhase(h: Harness, push = true): void {
  const folder = h.engine.worktreePath;
  const path = join(folder, "docs/prds/customer-returns/phase-2b-store-credit.md");
  const [title, ...rest] = readFileSync(path, "utf8").split("\n");
  writeFileSync(path, [title, "**Closed:** 2026-11-07", ...rest].join("\n"));
  writeFileSync(join(folder, "src", "credit.txt"), "done\n");
  git(h.sandbox, folder, "add", "-A");
  git(h.sandbox, folder, "commit", "-qm", "feat: store credit");
  if (push) git(h.sandbox, folder, "push", "-q", "origin", "feature/customer-returns");
}

export const shown = (path: string) => path.replace(process.env.HOME ?? "\0", "~");

export const CLEAR_LINE = "Clear git’s record of the missing folder";

export const removedRecords = (h: Harness, from: number) => h.kilnGitCalls().slice(from).filter(call => call.startsWith("worktree remove"));

export function folderSetupRuns({ keep, nextCommand }: { keep: (h: Harness) => void; nextCommand: () => number }) {
  async function start(h: Harness, overrides: Record<string, unknown> = {}) {
    const panel = panelOf(h);
    return h.engine.folderSetupStartCommand({ commandId: `start-${nextCommand()}`, factsId: h.engine.folderMissing!.factsId, previewId: panel.previewId, start: panel.selected, fields: {}, ...overrides });
  }

  /** Phase 1 landed and pushed (2a is closed in the fixture); Phase 2b then stops at Needs you. */
  async function landedThenStopped(): Promise<Harness> {
    const h = await createHarness({ sessions: [landingSession(), { actions: [{ result: "I need a decision." }] }, landingSession("src/b.txt"), landingSession("src/c.txt"), landingSession("src/d.txt")] });
    keep(h);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    return h;
  }

  /** A two-repository run: phase 1 names returns-api beside the PRD's acme-shop, and stops at Needs you. */
  async function twoRepositories(): Promise<Harness> {
    const files = prdDirectoryFiles();
    const [title, ...rest] = files["phase-1-return-intake.md"]!.split("\n");
    files["phase-1-return-intake.md"] = [title, "", "**Repositories:** returns-api", ...rest].join("\n");
    const h = await createHarness({ files, sessions: [{ actions: [{ result: "I need a decision." }] }, { actions: [{ result: "Still stuck." }] }] });
    keep(h);
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
    const api = createRepository(h.sandbox, "returns-api", origin.url);
    git(h.sandbox, api, "push", "-q", "origin", "develop");
    Object.assign(h.env, h.sandbox.env);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.setUpRepositories.map(entry => entry.name)).toEqual(["acme-shop", "returns-api"]);
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    return h;
  }

  /** Real git, except the reads a failing-read test names, which fail as an unreadable object makes them fail. */
  function failingGit(h: Harness, pattern: string): void {
    const context = (h.engine as unknown as { git: { git: string } }).git;
    const path = join(h.sandbox.root, `git-failing-${nextCommand()}`);
    writeFileSync(path, `#!/bin/sh\ncase "$*" in ${pattern}) echo "fatal: bad object" >&2; exit 128;; esac\nexec '${h.tools.git}' "$@"\n`);
    chmodSync(path, 0o755);
    context.git = path;
  }

  /** Two repositories, Phase 1 recorded as completed with its work pushed in returns-api only, and no stop. */
  async function phaseOneDoneInApi(): Promise<{ h: Harness; apiSha: string }> {
    const h = await twoRepositories();
    const api = h.engine.setUpRepositories.find(entry => entry.name === "returns-api")!;
    writeFileSync(join(api.worktreePath, "api.txt"), "endpoint\n");
    git(h.sandbox, api.worktreePath, "add", "api.txt");
    git(h.sandbox, api.worktreePath, "commit", "-qm", "feat: returns endpoint");
    git(h.sandbox, api.worktreePath, "push", "-q", "origin", "feature/customer-returns");
    const apiSha = git(h.sandbox, api.worktreePath, "rev-parse", "HEAD").trim();
    const phase = h.engine.record.phases["1"]!;
    delete phase.stop;
    phase.doneAt = new Date().toISOString();
    phase.repositories["returns-api"] = { ...phase.repositories["returns-api"]!, pushedSha: apiSha, commitCount: 1 };
    rmSync(api.worktreePath, { recursive: true, force: true });
    return { h, apiSha };
  }

  /** A session stopped at Needs you with the logging harness, so Start's own git calls can be read. */
  async function loggedThenStopped(sessions = [landingSession(), { actions: [{ result: "I need a decision." }] }, landingSession("src/b.txt"), landingSession("src/c.txt")]): Promise<Harness> {
    const h = await createHarness({ logGit: true, sessions });
    keep(h);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    return h;
  }

  return { start, landedThenStopped, twoRepositories, failingGit, phaseOneDoneInApi, loggedThenStopped };
}
