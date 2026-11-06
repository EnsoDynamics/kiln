// The mockups' sample data as Snapshots (fictional), for the view's tests: Documents found,
// then the progress screens, then the multi-repo delivery mockups' PRD across repositories.

import type { PhaseView, RepositoryDetails, RepositoryRow, Snapshot, WaiverView } from "../engine/snapshot.js";
import type { CheckItem, MarkCompleteOffer, WaiverRef } from "../engine/waivers.js";
import type { CheckResult } from "../state/records.js";
import type { OutputLine } from "../session/session-output.js";
import { outsideWorkspacePrompt } from "../session/prompts.js";

export function documentsFoundSnapshot(overrides: { settings?: Partial<Snapshot["settings"]>; documents?: Partial<NonNullable<Snapshot["documents"]>> } & Partial<Omit<Snapshot, "settings" | "documents">> = {}): Snapshot {
  const { settings, documents, ...rest } = overrides;
  return {
    feature: { name: "Customer returns", repositoryName: "acme-shop", multiRepository: false, prdFolder: "docs/prds/customer-returns/", state: "not_started", phasesDone: 0, phasesTotal: 5 },
    documents: {
      prd: { file: "customer-returns-prd.md", criteriaCount: 14, firstLabel: "AC-RET-01", lastLabel: "AC-RET-14" },
      design: { file: "technical-design.md", criteriaCited: 14 },
      assumptions: { file: "assumptions.md", total: 11, notYetConfirmed: 2 },
      plan: {
        phaseDocCount: 6,
        leafCount: 5,
        closedCount: 0,
        phases: [
          { id: "1", title: "Return intake", closed: false, repositories: [] },
          { id: "2", title: "Refund routing", splitInto: ["2a", "2b"], closed: false, repositories: [] },
          { id: "2a", title: "Card refunds", closed: false, repositories: [] },
          { id: "2b", title: "Store credit", closed: false, repositories: [] },
          { id: "3", title: "Returns dashboard", closed: false, repositories: [] },
          { id: "4", title: "Restock check-in", closed: false, repositories: [] },
        ],
      },
      checks: [
        { name: "Every phase cites its criteria", passed: true },
        { name: "Dependencies point backward", passed: true },
        { name: "Working tree is clean", passed: true },
      ],
      ...documents,
    },
    settings: {
      agent: "Claude Code",
      model: { value: "opus", displayName: "Opus 5.5" },
      effort: "high",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
      keepAwake: true,
      resumeAfterUsageLimit: true,
      workspaceFolder: "~/devel/.worktrees/customer-returns",
      worktreePath: "~/devel/acme-shop-kiln/customer-returns",
      featureBranch: "feature/customer-returns",
      baseBranch: "develop",
      baseBranches: ["develop", "main"],
      baseCheck: "ok",
      fixed: { workspaceFolder: true, featureBranch: false, worktreePath: false },
      fieldErrors: {},
      ...settings,
    },
    repositories: [
      { name: "acme-shop", kind: "prd", baseBranch: "develop", baseBranches: ["develop", "main"], baseCheck: "ok", worktreePath: "~/devel/acme-shop-kiln/customer-returns", fixed: false, fieldErrors: {} },
    ],
    models: [
      { value: "opus", displayName: "Opus 5.5" },
      { value: "fable", displayName: "Fable 5.1" },
      { value: "sonnet", displayName: "Sonnet 5.5" },
    ],
    phases: [],
    pause: { pending: false, active: false },
    account: {
      email: "alex@acme-shop.dev",
      plan: "Max plan",
      startedAt: "2026-10-17T13:15:00Z",
      updatedAt: "2026-10-17T13:15:00Z",
      limitsObservedAt: "2026-10-17T13:15:00Z",
      limits: [
        { kind: "session", label: "5-hour window", shortLabel: "5-hour", percent: 13, nearLimit: false },
        { kind: "weekly_all", label: "Weekly", shortLabel: "weekly", percent: 22, nearLimit: false },
        { kind: "weekly_scoped", scope: { by: "model", name: "Fable" }, label: "Weekly · Fable", shortLabel: "Fable", percent: 0, nearLimit: false },
      ],
    },
    ...rest,
  };
}

// ---- The progress mockups' sample data (fictional). Times are the mockups' local times in
// New York (EDT, UTC−4); the tests that read them set TZ to America/New_York.

/** 11:47 AM on the mockups' day, when Running and Phase detail were drawn. */
export const RUNNING_NOW = Date.parse("2026-10-17T15:47:00Z");

const WORKTREE = "~/devel/acme-shop-kiln/customer-returns";
const BRANCH = "feature/customer-returns";

function details(from: string, to: string | undefined, effort: "high" | "medium", commitCount: number | undefined, latestCommit: string | undefined, sessionId: string): NonNullable<PhaseView["details"]> {
  return {
    from,
    ...(to ? { to } : {}),
    model: "Opus 5.5",
    effort,
    worktree: WORKTREE,
    branch: BRANCH,
    ...(commitCount === undefined ? {} : { commitCount }),
    ...(latestCommit ? { latestCommit } : {}),
    sessionId,
  };
}

const PHASE_1: PhaseView = {
  id: "1",
  title: "Return intake",
  file: "phase-1-return-intake.md",
  state: "done",
  sessionStartedAt: "2026-10-17T13:17:00Z",
  doneAt: "2026-10-17T14:09:00Z",
  pushedSha: "a1c4e09f3b2d",
  finishedByPerson: false,
  details: details("2026-10-17T13:17:00Z", "2026-10-17T14:09:00Z", "high", 3, "a1c4e09f3b2d", "4f2a9c1e-7b3d-4c8a-a5e6-1d9f0b2c7e34"),
};
const PHASE_2: PhaseView = { id: "2", title: "Refund routing", file: "phase-2-refund-routing.md", state: "split", splitInto: ["2a", "2b"], finishedByPerson: false };
const PHASE_2A: PhaseView = {
  id: "2a",
  title: "Card refunds",
  file: "phase-2a-card-refunds.md",
  state: "done",
  sessionStartedAt: "2026-10-17T14:09:00Z",
  doneAt: "2026-10-17T14:57:00Z",
  pushedSha: "5d81b37a90c1",
  finishedByPerson: false,
  details: details("2026-10-17T14:09:00Z", "2026-10-17T14:57:00Z", "medium", 4, "5d81b37a90c1", "9b0e3d72-1c5a-4f6e-b8d2-3a7c6e0f9d15"),
};
const PHASE_2B = { id: "2b", title: "Store credit", file: "phase-2b-store-credit.md", finishedByPerson: false } as const;
const PHASE_3 = { id: "3", title: "Returns dashboard", file: "phase-3-returns-dashboard.md", finishedByPerson: false } as const;
const PHASE_4: PhaseView = { id: "4", title: "Restock check-in", file: "phase-4-restock-check-in.md", state: "planned", finishedByPerson: false };

const SESSION_2B = "7c1e9f2a-4b6d-4e1a-9c3f-2d8b5a6e1f04";
const SESSION_3 = "e3b07d51-92c4-4f8e-a1d6-5c0f4e7b2a19";

function underwaySettings(): Snapshot["settings"] {
  const settings: Snapshot["settings"] = { ...documentsFoundSnapshot().settings, fixed: { workspaceFolder: true, featureBranch: true, worktreePath: true } };
  delete settings.baseBranches;
  delete settings.baseCheck;
  return settings;
}

/** The PRD's one repository once Kiln has set it up. */
const UNDERWAY_REPOSITORIES: RepositoryRow[] = [{ name: "acme-shop", kind: "prd", baseBranch: "develop", worktreePath: "~/devel/acme-shop-kiln/customer-returns", fixed: true, fieldErrors: {} }];

const ACCOUNT: NonNullable<Snapshot["account"]> = {
  email: "alex@acme-shop.dev",
  plan: "Max plan",
  startedAt: "2026-10-17T15:45:00Z",
  updatedAt: "2026-10-17T15:45:00Z",
  limitsObservedAt: "2026-10-17T15:45:00Z",
  limits: [
    { kind: "session", label: "5-hour window", shortLabel: "5-hour", percent: 82, resetsAt: "2026-10-17T16:59:00Z", nearLimit: true },
    { kind: "weekly_all", label: "Weekly", shortLabel: "weekly", percent: 41, resetsAt: "2026-10-21T16:00:00Z", nearLimit: false },
    { kind: "weekly_scoped", scope: { by: "model", name: "Fable" }, label: "Weekly · Fable", shortLabel: "Fable", percent: 6, resetsAt: "2026-10-21T16:00:00Z", nearLimit: false },
  ],
};

function underway(rest: Partial<Snapshot> & Pick<Snapshot, "feature" | "phases">): Snapshot {
  return { settings: underwaySettings(), repositories: UNDERWAY_REPOSITORIES, models: documentsFoundSnapshot().models!, pause: { pending: false, active: false }, account: ACCOUNT, ...rest };
}

const FEATURE = { name: "Customer returns", repositoryName: "acme-shop", multiRepository: false, prdFolder: "docs/prds/customer-returns/", phasesTotal: 5, startedAt: "2026-10-17T13:17:00Z" };

/** Running and Phase detail: phase 2b, Store credit, at Deliverable review, its reviewer working. */
export function runningSnapshot(): Snapshot {
  return underway({
    feature: { ...FEATURE, state: "implementing", currentPhaseId: "2b", phasesDone: 2 },
    phases: [PHASE_1, PHASE_2, PHASE_2A, { ...PHASE_2B, state: "implementing", sessionStartedAt: "2026-10-17T14:58:00Z" }, { ...PHASE_3, state: "planned" }, PHASE_4],
    current: {
      phaseId: "2b",
      sessionId: SESSION_2B,
      model: "Opus 5.5",
      effort: "high",
      startedAt: "2026-10-17T14:58:00Z",
      steps: [
        { name: "Build", state: "finished", startedAt: "2026-10-17T14:58:00Z" },
        { name: "Deliverable review", state: "current", startedAt: "2026-10-17T15:44:16Z" },
        { name: "Test hardening", state: "unreached" },
        { name: "Commit", state: "unreached" },
        { name: "Refactor pass", state: "unreached" },
        { name: "Push", state: "unreached" },
      ],
      seenInSession: { text: "deliverable-review skill started", at: "2026-10-17T15:45:00Z" },
      latestLine: { line: 1284, at: "2026-10-17T15:46:58Z", source: "reviewer", text: "The credit multiplier is applied before rounding; checking that against…" },
      repositories: [],
      reviewerWorking: true,
    },
  });
}

/** Phase detail's session output, as drawn. */
export const PHASE_DETAIL_LINES: OutputLine[] = [
  { line: 1277, at: "2026-10-17T15:44:02Z", source: "tool", text: "Bash pytest tests/returns -k store_credit -q" },
  { line: 1278, at: "2026-10-17T15:44:09Z", source: "out", text: "23 passed in 4.81s" },
  { line: 1279, at: "2026-10-17T15:44:15Z", source: "claude", text: "AC-RET-08 to AC-RET-10 have passing tests. Running deliverable review now." },
  { line: 1280, at: "2026-10-17T15:44:16Z", source: "skill", text: "Skill deliverable-review" },
  { line: 1281, at: "2026-10-17T15:45:01Z", source: "tool", text: "Agent fresh-eyes reviewer · 7 changed files" },
  { line: 1282, at: "2026-10-17T15:45:40Z", source: "reviewer", text: "Read src/returns/store_credit.py" },
  { line: 1283, at: "2026-10-17T15:46:22Z", source: "reviewer", text: "Read src/returns/models.py" },
];

/** Paused after phase 2a, with phase 2b next. */
export function pausedSnapshot(): Snapshot {
  return underway({
    feature: { ...FEATURE, state: "paused", phasesDone: 2 },
    phases: [PHASE_1, PHASE_2, PHASE_2A, { ...PHASE_2B, state: "next" }, { ...PHASE_3, state: "planned" }, PHASE_4],
    pause: { pending: false, active: true },
  });
}

/** Needs you, ended with a message: phase 2b stopped at 11:52 AM. */
export function needsYouMessageSnapshot(): Snapshot {
  return underway({
    feature: { ...FEATURE, state: "needs_you", currentPhaseId: "2b", phasesDone: 2, stoppedAt: "2026-10-17T15:52:00Z" },
    phases: [PHASE_1, PHASE_2, PHASE_2A, { ...PHASE_2B, state: "needs_you", sessionStartedAt: "2026-10-17T14:58:00Z" }, { ...PHASE_3, state: "planned" }, PHASE_4],
    needsYou: {
      phaseId: "2b",
      kind: "done_check",
      stoppedAt: "2026-10-17T15:52:00Z",
      // A session that ended on its own, with its transcript: Resume is offered (usage-limit recovery AC-RESUME-01).
      resumeOffered: true,
      finalMessage:
        "**Critical finding, stopping to surface:** the reviewer found that develop has since added its own migration 0042 (gift cards), so this branch’s `0042_store_credits` clashes with it. The store-credit tests pass here, but the migration won’t apply once this branch meets develop.\n\nRecommendation: rebase feature/customer-returns on develop and renumber this migration to 0043. Nothing for 2b is committed yet.",
      exitCode: 0,
      lastSkill: { name: "deliverable-review", at: "2026-10-17T15:44:00Z" },
      checks: [
        { name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"] },
        { name: "Everything committed", passed: false, facts: ["12 files changed, not committed"] },
        { name: "Pushed", passed: true, facts: ["Matches origin at 5d81b37"] },
      ],
      checkedAt: "2026-10-17T15:52:00Z",
      resumeCommand: `cd ${WORKTREE}\nclaude --resume ${SESSION_2B}`,
      freshSessionPrompt: "Use the implement-from-requirements skill to implement `docs/prds/customer-returns/phase-2b-store-credit.md` …",
      freshSessionCommand: `cd ${WORKTREE}\nclaude`,
      outputLineCount: 612,
      sessionEndedAt: "2026-10-17T15:52:00Z",
      steps: [
        { name: "Build", state: "finished", startedAt: "2026-10-17T14:58:00Z" },
        { name: "Deliverable review", state: "current", startedAt: "2026-10-17T15:44:00Z" },
        { name: "Test hardening", state: "unreached" },
        { name: "Commit", state: "unreached" },
        { name: "Refactor pass", state: "unreached" },
        { name: "Push", state: "unreached" },
      ],
      sessionId: SESSION_2B,
      model: "Opus 5.5",
      effort: "high",
      sessionStartedAt: "2026-10-17T14:58:00Z",
      repositories: [],
    },
  });
}

/** Needs you, crashed: phase 3 exited 1 with no final message at 1:21 PM. */
export function needsYouCrashedSnapshot(): Snapshot {
  const done2b: PhaseView = { ...PHASE_2B, state: "done", sessionStartedAt: "2026-10-17T14:58:00Z", doneAt: "2026-10-17T16:17:00Z", pushedSha: "7f3a91c", finishedByPerson: true };
  return underway({
    feature: { ...FEATURE, state: "needs_you", currentPhaseId: "3", phasesDone: 3, stoppedAt: "2026-10-17T17:21:00Z" },
    phases: [PHASE_1, PHASE_2, PHASE_2A, done2b, { ...PHASE_3, state: "needs_you", sessionStartedAt: "2026-10-17T16:17:00Z" }, PHASE_4],
    needsYou: {
      phaseId: "3",
      kind: "done_check",
      stoppedAt: "2026-10-17T17:21:00Z",
      resumeOffered: true,
      exitCode: 1,
      lastSkill: { name: "test-hardening", at: "2026-10-17T17:15:00Z" },
      lastLines: [
        { line: 2028, at: "2026-10-17T17:20:51Z", source: "claude", text: "Running the dashboard Playwright suite. It needs the dev server on 5173; starting it." },
        { line: 2029, at: "2026-10-17T17:20:52Z", source: "tool", text: "Bash npm run dev &" },
        { line: 2030, at: "2026-10-17T17:20:55Z", source: "stderr", text: "Error: listen EADDRINUSE: address already in use :::5173" },
        { line: 2031, at: "2026-10-17T17:21:03Z", source: "exit", text: "Process exited with code 1" },
      ],
      checks: [
        { name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-3-returns-dashboard.md"] },
        { name: "Everything committed", passed: true, facts: ["Latest commit a41c9e2, tree clean"] },
        { name: "Pushed", passed: false, facts: ["a41c9e2 isn’t on origin yet"] },
      ],
      checkedAt: "2026-10-17T17:21:00Z",
      steps: [
        { name: "Build", state: "finished", startedAt: "2026-10-17T16:17:00Z" },
        { name: "Deliverable review", state: "finished", startedAt: "2026-10-17T16:58:00Z" },
        { name: "Test hardening", state: "current", startedAt: "2026-10-17T17:15:00Z" },
        { name: "Commit", state: "unreached" },
        { name: "Refactor pass", state: "unreached" },
        { name: "Push", state: "unreached" },
      ],
      resumeCommand: `cd ${WORKTREE}\nclaude --resume ${SESSION_3}`,
      freshSessionPrompt: "Use the implement-from-requirements skill to implement `docs/prds/customer-returns/phase-3-returns-dashboard.md` …",
      freshSessionCommand: `cd ${WORKTREE}\nclaude`,
      outputLineCount: 2031,
      sessionEndedAt: "2026-10-17T17:21:03Z",
      sessionId: SESSION_3,
      model: "Opus 5.5",
      effort: "high",
      sessionStartedAt: "2026-10-17T16:17:00Z",
      repositories: [{ name: "acme-shop", commits: [{ sha: "a41c9e2d0b11", subject: "feat(returns): returns dashboard (phase 3)" }] }],
    },
  });
}

/** Complete: pull request #218 ready for review at 2:55 PM. */
export function completeSnapshot(): Snapshot {
  const done = (phase: { id: string; title: string; file: string }, from: string, to: string, sha: string, commits: number, sessionId: string, byPerson: boolean): PhaseView => ({
    ...phase,
    state: "done",
    sessionStartedAt: from,
    doneAt: to,
    pushedSha: sha,
    finishedByPerson: byPerson,
    details: details(from, to, "high", commits, sha, sessionId),
  });
  return underway({
    feature: { ...FEATURE, state: "complete", phasesDone: 5, completedAt: "2026-10-17T18:55:00Z" },
    phases: [
      PHASE_1,
      PHASE_2,
      PHASE_2A,
      done(PHASE_2B, "2026-10-17T14:58:00Z", "2026-10-17T16:17:00Z", "7f3a91c5e2aa", 2, SESSION_2B, true),
      done(PHASE_3, "2026-10-17T16:17:00Z", "2026-10-17T17:48:00Z", "b29e6f0c7d31", 5, SESSION_3, true),
      done({ id: "4", title: "Restock check-in", file: "phase-4-restock-check-in.md" }, "2026-10-17T17:48:00Z", "2026-10-17T18:46:00Z", "0c4d8a2e9f10", 3, "2d6c8f40-5e1b-4a9d-8c73-0f4e9b1a6d28", false),
      { id: "pr", title: "Final pull request", file: "pull request session", state: "done", sessionStartedAt: "2026-10-17T18:46:00Z", doneAt: "2026-10-17T18:55:00Z", finishedByPerson: false },
    ],
    pullRequests: [{ repository: "acme-shop", number: 218, title: "Customer returns: intake, refund routing, dashboard and restock", url: "https://github.com/acme/acme-shop/pull/218", head: BRANCH, base: "develop", commits: 17, additions: 2184, deletions: 312 }],
  });
}

// ---- The multi-repo delivery mockups' sample data (fictional): the same feature with its PRD in
// product and its code in returns-api and storefront, notifications added in phase 2b
// (docs/changes/kiln-multi-repo-delivery/mockups/).

const WORKSPACE = "~/devel/acme/.worktrees/customer-returns";
const MULTI_FEATURE = { ...FEATURE, repositoryName: "product", multiRepository: true };

function multiRow(name: string, kind: RepositoryRow["kind"], baseBranch: string, extra: Partial<RepositoryRow> = {}): RepositoryRow {
  return { name, kind, baseBranch, worktreePath: `${WORKSPACE}/${name}`, fixed: true, fieldErrors: {}, ...extra };
}

/** Documents found for the PRD across three repositories (kiln-screen-documents-found-repositories.html). */
export function documentsFoundRepositoriesSnapshot(): Snapshot {
  const snapshot = documentsFoundSnapshot({ settings: { workspaceFolder: WORKSPACE, worktreePath: `${WORKSPACE}/product`, baseBranch: "main", baseBranches: ["main"], fixed: { workspaceFolder: false, featureBranch: false, worktreePath: false } } });
  const repositories: Record<string, string[]> = { "1": ["returns-api"], "2": ["returns-api"], "2a": ["returns-api"], "2b": ["returns-api", "storefront"], "3": ["storefront"], "4": ["returns-api"] };
  const documents = snapshot.documents!;
  return {
    ...snapshot,
    feature: { ...snapshot.feature, repositoryName: "product", multiRepository: true },
    documents: {
      ...documents,
      plan: { ...documents.plan, phases: documents.plan.phases.map((phase) => ({ ...phase, repositories: repositories[phase.id]! })) },
      checks: [
        { name: "Every phase cites its criteria", passed: true },
        { name: "Dependencies point backward", passed: true },
        { name: "Named repositories found beside product", passed: true },
        { name: "Working tree of product is clean", passed: true },
      ],
    },
    repositories: [
      multiRow("product", "prd", "main", { baseBranches: ["main"], baseCheck: "ok", fixed: false }),
      multiRow("returns-api", "named", "develop", { baseBranches: ["develop", "main"], baseCheck: "ok", fixed: false }),
      multiRow("storefront", "named", "develop", { baseBranches: ["develop", "main"], baseCheck: "ok", fixed: false }),
    ],
  };
}

/** The four repositories once underway, notifications added in phase 2b. */
const MULTI_REPOSITORIES: RepositoryRow[] = [
  multiRow("product", "prd", "main"),
  multiRow("returns-api", "named", "develop"),
  multiRow("storefront", "named", "develop"),
  multiRow("notifications", "added", "main", { addedInPhase: "2b" }),
];

/** A screen underway across the four repositories: their settings and rows replace any one-repository snapshot's in `rest`. */
function multiUnderway(rest: Partial<Snapshot> & Pick<Snapshot, "feature" | "phases">): Snapshot {
  return underway({ ...rest, settings: { ...underwaySettings(), workspaceFolder: WORKSPACE, worktreePath: `${WORKSPACE}/product`, baseBranch: "main" }, repositories: MULTI_REPOSITORIES });
}

/** A repository's line in a phase's Details: its worktree and branch, commit count and latest commit. */
function inRepository(name: string, commitCount: number, latestCommit: string, addedInPhase?: string): RepositoryDetails {
  return { name, ...(addedInPhase ? { addedInPhase } : {}), worktree: `${WORKSPACE}/${name}`, branch: BRANCH, commitCount, latestCommit };
}

/** A Done phase across repositories: the snapshot keeps the PRD's repository's pushed commit and count beside the per-repository facts. */
function multiDone(phase: { id: string; title: string; file: string }, from: string, to: string, sessionId: string, effort: "high" | "medium", byPerson: boolean, repositories: RepositoryDetails[]): PhaseView {
  const product = repositories.find((repository) => repository.name === "product")!;
  return {
    ...phase,
    state: "done",
    sessionStartedAt: from,
    doneAt: to,
    pushedSha: product.latestCommit,
    finishedByPerson: byPerson,
    pushedRepositoryCount: repositories.length,
    details: { ...details(from, to, effort, product.commitCount, product.latestCommit, sessionId), worktree: `${WORKSPACE}/product`, repositories },
  };
}

const MULTI_PHASE_1 = multiDone(PHASE_1, "2026-10-17T13:17:00Z", "2026-10-17T14:09:00Z", "4f2a9c1e-7b3d-4c8a-a5e6-1d9f0b2c7e34", "high", false, [inRepository("product", 1, "3e8b2f1d4a07"), inRepository("returns-api", 2, "a1c4e09f3b2d")]);
const MULTI_PHASE_2A = multiDone(PHASE_2A, "2026-10-17T14:09:00Z", "2026-10-17T14:57:00Z", "9b0e3d72-1c5a-4f6e-b8d2-3a7c6e0f9d15", "medium", false, [inRepository("product", 1, "9a0c6e2b5d18"), inRepository("returns-api", 3, "5d81b37a90c1")]);

/** Complete: four pull requests ready for review at 2:55 PM (kiln-screen-complete-repositories.html). */
export function completeRepositoriesSnapshot(): Snapshot {
  const github = (repository: string, number: number) => `https://github.com/acme/${repository}/pull/${number}`;
  return multiUnderway({
    feature: { ...MULTI_FEATURE, state: "complete", phasesDone: 5, completedAt: "2026-10-17T18:55:00Z" },
    phases: [
      MULTI_PHASE_1,
      PHASE_2,
      MULTI_PHASE_2A,
      multiDone(PHASE_2B, "2026-10-17T14:58:00Z", "2026-10-17T16:17:00Z", SESSION_2B, "high", true, [
        inRepository("product", 1, "e07a4c8f2b91"),
        inRepository("returns-api", 2, "7f3d9a0c6e12"),
        inRepository("storefront", 1, "c41e8b5d7a03"),
        inRepository("notifications", 2, "2b6f1d3e9c48", "2b"),
      ]),
      multiDone(PHASE_3, "2026-10-17T16:17:00Z", "2026-10-17T17:48:00Z", SESSION_3, "high", true, [inRepository("product", 1, "2f7b9e0a4c65"), inRepository("storefront", 4, "8d4a1c6f0e27")]),
      multiDone({ id: "4", title: "Restock check-in", file: "phase-4-restock-check-in.md" }, "2026-10-17T17:48:00Z", "2026-10-17T18:46:00Z", "2d6c8f40-5e1b-4a9d-8c73-0f4e9b1a6d28", "high", false, [
        inRepository("product", 1, "61d2f0c8b3a4"),
        inRepository("returns-api", 2, "0b9e3a7d5f16"),
      ]),
      { id: "pr", title: "Final pull request", file: "pull request session", state: "done", sessionStartedAt: "2026-10-17T18:46:00Z", doneAt: "2026-10-17T18:55:00Z", finishedByPerson: false },
    ],
    pullRequests: [
      { repository: "product", number: 12, title: "Customer returns: phase documents", url: github("product", 12), head: BRANCH, base: "main", commits: 5, additions: 5, deletions: 0 },
      { repository: "returns-api", number: 57, title: "Customer returns: intake, refunds, store credit and restock", url: github("returns-api", 57), head: BRANCH, base: "develop", commits: 9, additions: 1402, deletions: 201 },
      { repository: "storefront", number: 218, title: "Customer returns: store credit and returns dashboard", url: github("storefront", 218), head: BRANCH, base: "develop", commits: 5, additions: 694, deletions: 103 },
      { repository: "notifications", number: 9, title: "Customer returns: store credit emails", url: github("notifications", 9), head: BRANCH, base: "main", commits: 2, additions: 88, deletions: 8 },
    ],
  });
}

/** Running across repositories: phase 2b, with commits so far in returns-api and in notifications, added during it. */
export function runningRepositoriesSnapshot(): Snapshot {
  const snapshot = runningSnapshot();
  return multiUnderway({
    ...snapshot,
    feature: { ...snapshot.feature, repositoryName: "product", multiRepository: true },
    phases: [MULTI_PHASE_1, PHASE_2, MULTI_PHASE_2A, ...snapshot.phases.slice(3)],
    current: {
      ...snapshot.current!,
      repositories: [
        { name: "returns-api", commits: [{ sha: "7f3d9a0c6e12", subject: "feat(credit): store credit ledger (phase 2b)" }, { sha: "4c1a8e5b2d90", subject: "test(credit): ledger balances" }] },
        { name: "notifications", commits: [{ sha: "2b6f1d3e9c48", subject: "feat(emails): store credit issued email (phase 2b)" }] },
      ],
    },
  });
}

/** Needs you across repositories: phase 3 stopped with storefront's work not committed or pushed. */
export function needsYouRepositoriesSnapshot(): Snapshot {
  const snapshot = needsYouCrashedSnapshot();
  const complete = completeRepositoriesSnapshot();
  return multiUnderway({
    ...snapshot,
    feature: { ...snapshot.feature, repositoryName: "product", multiRepository: true },
    phases: [...complete.phases.slice(0, 4), { ...PHASE_3, state: "needs_you", sessionStartedAt: "2026-10-17T16:17:00Z" }, PHASE_4],
    needsYou: {
      ...snapshot.needsYou!,
      checks: [
        { name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-3-returns-dashboard.md"] },
        { name: "Everything committed", passed: false, facts: ["storefront: 3 files changed, not committed"] },
        { name: "Pushed", passed: false, facts: ["product: 2f7b9e0 on origin", "storefront: 8d4a1c6 isn’t on origin yet"] },
      ],
      repositories: [
        { name: "product", commits: [{ sha: "2f7b9e0a4c65", subject: "docs(returns): close phase 3" }] },
        { name: "storefront", commits: [{ sha: "8d4a1c6f0e27", subject: "feat(dashboard): returns list and filters (phase 3)" }] },
      ],
    },
  });
}

const OUTSIDE_SESSION = "4d9a2c7e-1f53-4b8e-9a06-3c5e7b1d2f88";
const DESIGN_SYSTEM = "~/devel/acme/design-system";

/**
 * Needs you after work outside the workspace (multi-repo AC-OUTSIDE-01 to 03), as the mockup
 * draws it: phase 3 closed, committed and pushed in every repository, but its session edited
 * and committed in design-system's own checkout; stopped at 1:20 PM.
 */
export function needsYouOutsideWorkspaceSnapshot(): Snapshot {
  const snapshot = needsYouRepositoriesSnapshot();
  const changes = [`Edited src/tokens/colors.ts in ${DESIGN_SYSTEM}`, `Committed 6b0d2fa to main in ${DESIGN_SYSTEM}`];
  return {
    ...snapshot,
    feature: { ...snapshot.feature, stoppedAt: "2026-10-17T17:20:00Z" },
    needsYou: {
      ...snapshot.needsYou!,
      stoppedAt: "2026-10-17T17:20:00Z",
      exitCode: 0,
      lastSkill: { name: "refactor-pass", at: "2026-10-17T17:18:00Z" },
      finalMessage:
        "**Phase 3 is done.** The returns dashboard is at `/admin/returns` in storefront: the returns list with status filters, a detail drawer, and approve and refund actions that call returns-api. All 14 Playwright tests pass, phase-3-returns-dashboard.md is closed, and storefront and product are pushed to feature/customer-returns.\n\nAlong the way I adjusted the badge colors in design-system. Pending and refunded were nearly the same amber in dark mode, so refunded now has its own token in `src/tokens/colors.ts`, committed there. Refactor pass: no refactor warranted.",
      checks: [
        { name: "Phase doc closed", passed: true, facts: ["Closed line in phase-3-returns-dashboard.md"] },
        { name: "Everything committed", passed: true, facts: ["Clean in product, returns-api, storefront and notifications"] },
        { name: "Pushed", passed: true, facts: ["product: 2f7b9e0 on origin", "returns-api: 7f3d9a0 on origin", "storefront: 8d4a1c6 on origin", "notifications: 2b6f1d3 on origin"] },
        { name: "Stayed in the workspace", passed: false, facts: [...changes, "Kiln changed nothing in that checkout, since it may hold other work too."] },
      ],
      checkedAt: "2026-10-17T17:20:00Z",
      resumeCommand: `cd ${WORKSPACE}\nclaude --resume ${OUTSIDE_SESSION}`,
      freshSessionCommand: `cd ${WORKSPACE}\nclaude`,
      outputLineCount: 1148,
      sessionEndedAt: "2026-10-17T17:20:00Z",
      sessionId: OUTSIDE_SESSION,
      outside: {
        changes,
        missingTranscripts: [],
        checkouts: ["design-system"],
        // Built from Kiln's own template, so the layout test proves it reads as the mockup draws it.
        prompt: outsideWorkspacePrompt({
          phaseName: "phase 3",
          facts: changes,
          checkouts: [{ shownPath: DESIGN_SYSTEM, name: "design-system", inWorkspace: false }],
          branch: BRANCH,
          multiRepository: true,
        }),
        confirmation: { offered: true, ticked: false },
      },
    },
  };
}

// ---- The usage-limit recovery mockups' sample data (fictional): phase 2b refused by the 5-hour
// usage limit at 2:28 PM, resetting at 3:40 PM, with Kiln's reading showing the same account at
// 100% (docs/changes/kiln-usage-limit-recovery/mockups/).

/** The clock both usage-limit mockups are drawn at: 2:28 PM in New York. */
export const USAGE_LIMIT_NOW = Date.parse("2026-10-17T18:28:00Z");

/** The limit as both mockups show it; the reading's reset carries fractions of a second, as a real one does. */
function fiveHourLimit(readAt: string): NonNullable<Snapshot["waiting"]>["limit"] {
  return {
    label: "5-hour window",
    resetsAt: "2026-10-17T19:40:00Z",
    resetPassed: false,
    account: { email: "alex@acme-shop.dev", plan: "Max plan", percent: 100, at: readAt, atLimitUntil: "2026-10-17T19:39:59.700Z" },
  };
}

/** The account panel's reading behind the limit card, the 5-hour window at 100%. */
function accountAtLimit(readAt: string): NonNullable<Snapshot["account"]> {
  return { ...ACCOUNT, startedAt: readAt, updatedAt: readAt, limitsObservedAt: readAt, limits: [{ ...ACCOUNT.limits[0]!, percent: 100, resetsAt: "2026-10-17T19:39:59.700Z" }, ...ACCOUNT.limits.slice(1)] };
}

const LIMIT_STEPS: NonNullable<NonNullable<Snapshot["waiting"]>["steps"]> = [
  { name: "Build", state: "current", startedAt: "2026-10-17T14:58:00Z" },
  { name: "Deliverable review", state: "unreached" },
  { name: "Test hardening", state: "unreached" },
  { name: "Commit", state: "unreached" },
  { name: "Refactor pass", state: "unreached" },
  { name: "Push", state: "unreached" },
];

/** Waiting for usage, just after the wait started (kiln-screen-waiting-for-usage.html). */
export function waitingSnapshot(): Snapshot {
  return underway({
    feature: { ...FEATURE, state: "waiting", currentPhaseId: "2b", phasesDone: 2 },
    phases: [PHASE_1, PHASE_2, PHASE_2A, { ...PHASE_2B, state: "waiting", sessionStartedAt: "2026-10-17T14:58:00Z" }, { ...PHASE_3, state: "planned" }, PHASE_4],
    account: accountAtLimit("2026-10-17T18:28:00Z"),
    waiting: {
      phaseId: "2b",
      since: "2026-10-17T18:28:00Z",
      limit: { ...fiveHourLimit("2026-10-17T18:28:00Z"), automaticResume: { label: "5-hour window", at: "2026-10-17T19:41:00Z" } },
      sessionId: SESSION_2B,
      stoppedAt: "2026-10-17T18:28:00Z",
      finalMessage: "5-hour limit reached · resets 3:40pm",
      exitCode: 1,
      lastSkill: { name: "implement-from-requirements", at: "2026-10-17T18:25:00Z" },
      outputLineCount: 248,
      model: "Opus 5.5",
      effort: "high",
      sessionStartedAt: "2026-10-17T14:58:00Z",
      sessionEndedAt: "2026-10-17T18:28:00Z",
      steps: LIMIT_STEPS,
      repositories: [],
    },
  });
}

/** Needs you after a usage limit, with Resume (kiln-screen-needs-you-usage-limit.html). */
export function needsYouUsageLimitSnapshot(): Snapshot {
  return underway({
    feature: { ...FEATURE, state: "needs_you", currentPhaseId: "2b", phasesDone: 2, stoppedAt: "2026-10-17T18:28:00Z" },
    phases: [PHASE_1, PHASE_2, PHASE_2A, { ...PHASE_2B, state: "needs_you", sessionStartedAt: "2026-10-17T14:58:00Z" }, { ...PHASE_3, state: "planned" }, PHASE_4],
    account: accountAtLimit("2026-10-17T18:27:00Z"),
    needsYou: {
      phaseId: "2b",
      kind: "done_check",
      stoppedAt: "2026-10-17T18:28:00Z",
      resumeOffered: true,
      finalMessage: "5-hour limit reached · resets 3:40pm",
      exitCode: 1,
      lastSkill: { name: "implement-from-requirements", at: "2026-10-17T18:25:00Z" },
      checks: [
        { name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"] },
        { name: "Everything committed", passed: false, facts: ["3 files changed, not committed"] },
        { name: "Pushed", passed: true, facts: ["Matches origin at 5d81b37"] },
      ],
      checkedAt: "2026-10-17T18:28:00Z",
      resumeCommand: `cd ${WORKTREE}\nclaude --resume ${SESSION_2B}`,
      freshSessionPrompt: "Use the implement-from-requirements skill to implement `docs/prds/customer-returns/phase-2b-store-credit.md` …",
      freshSessionCommand: `cd ${WORKTREE}\nclaude`,
      outputLineCount: 248,
      sessionEndedAt: "2026-10-17T18:28:00Z",
      steps: LIMIT_STEPS,
      sessionId: SESSION_2B,
      model: "Opus 5.5",
      effort: "high",
      sessionStartedAt: "2026-10-17T14:58:00Z",
      repositories: [],
      limit: fiveHourLimit("2026-10-17T18:27:00Z"),
    },
  });
}

/** Complete with independently verified, broader delivery PR and direct merge evidence. */
export function completeDeliveryHistorySnapshot(): Snapshot {
  const snapshot = completeSnapshot();
  snapshot.pullRequests = [];
  snapshot.mergedBranches = [{ repository: "acme-shop", head: "feature/customer-returns", base: "develop", featureCommit: "c".repeat(40), baseCommit: "d".repeat(40), url: "https://github.com/acme/acme-shop/commit/" + "c".repeat(40) }];
  snapshot.deliveryHistory = { checkedAt: "2026-10-17T18:55:00Z", repositories: [{ repository: "acme-shop", workCommitCount: 6, unattributedCommitCount: 0, problems: [], events: [
    { kind: "pull_request", repository: "acme-shop", number: 3, commit: "e".repeat(40), title: "Release Customer returns", target: "main", url: "https://github.com/acme/acme-shop/pull/3", workCommits: ["a".repeat(40), "b".repeat(40)], broader: true, occurredAt: "2026-10-15T13:00:00Z" },
    { kind: "merge", repository: "acme-shop", commit: "f".repeat(40), title: "Close customer returns", target: "develop", url: "https://github.com/acme/acme-shop/commit/" + "f".repeat(40), workCommits: ["c".repeat(40)], broader: false, occurredAt: "2026-10-17T14:30:00Z" },
    { kind: "pull_request", repository: "acme-shop", number: 4, commit: "1".repeat(40), title: "Release intake fixes", target: "main", url: "https://github.com/acme/acme-shop/pull/4", workCommits: ["d".repeat(40)], broader: false, occurredAt: "2026-10-16T15:00:00Z" },
    { kind: "pull_request", repository: "acme-shop", number: 5, commit: "2".repeat(40), title: "Release store credit", target: "main", url: "https://github.com/acme/acme-shop/pull/5", workCommits: ["e".repeat(40)], broader: false, occurredAt: "2026-10-17T14:00:00Z" },
    { kind: "pull_request", repository: "acme-shop", number: 6, commit: "3".repeat(40), title: "Release returns acceptance", target: "main", url: "https://github.com/acme/acme-shop/pull/6", workCommits: ["f".repeat(40)], broader: true, occurredAt: "2026-10-17T15:00:00Z" },
    { kind: "merge", repository: "acme-shop", commit: "4".repeat(40), title: "Merge returns into another branch", target: "develop", url: "https://github.com/acme/acme-shop/commit/" + "4".repeat(40), workCommits: ["a".repeat(40), "b".repeat(40)], broader: false, occurredAt: "2026-10-17T15:30:00Z" },
  ] }] };
  return snapshot;
}

// ---- The completion waivers mockup's states (docs/changes/kiln-completion-waivers/mockups/),
// on this feature's phase 2b: a hand-back stop whose development verification Kiln refuses,
// Mark complete, and the displays after the waiver.

const DELIVERY_CHECK = "Required development delivery verified";
const DELIVERY_TEXT = "api-checkpoint / verify: /deployed_sha does not match its declared target/artifact.";
const DELIVERY_ITEM: CheckItem = { kind: "development_requirement", subject: "api-checkpoint/verify", text: DELIVERY_TEXT, against: "api-checkpoint@abcdef123456" };
export const WAIVER_AT = "2026-10-17T15:58:22Z";
export const WAIVER: WaiverView = {
  id: "waiver-2b", at: WAIVER_AT, activityKey: "2b", activity: "Phase 2b", effect: "completed",
  source: { via: "browser", account: "alex" }, checkRun: { id: "run-2b-recheck", at: "2026-10-17T15:56:05Z" },
  items: [{ check: DELIVERY_CHECK, kind: DELIVERY_ITEM.kind, subject: DELIVERY_ITEM.subject, text: DELIVERY_ITEM.text, against: DELIVERY_ITEM.against }],
};
const WAIVER_REF: WaiverRef = { waiverId: WAIVER.id, activityKey: "2b", at: WAIVER_AT, via: "browser", account: "alex" };

function handBackChecks(mixed: boolean): CheckResult[] {
  return [
    mixed ? { name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"], items: [{ kind: "phase_closed", subject: "2b", text: "No Closed line in phase-2b-store-credit.md", against: "2b" }] } : { name: "Phase doc closed", passed: true, facts: ["phase-2b-store-credit.md has a Closed line"] },
    { name: "Everything committed", passed: true, facts: ["acme-shop: working tree is clean"] },
    mixed ? { name: "Pushed", passed: false, facts: ["acme-shop: 1 commit not pushed (head 4c1a9e07)"], items: [{ kind: "repository_work", subject: "acme-shop", text: "acme-shop: 1 commit not pushed (head 4c1a9e07)", against: "4c1a9e07:clean" }] } : { name: "Pushed", passed: true, facts: ["acme-shop: no commits waiting to be pushed"] },
    { name: DELIVERY_CHECK, passed: false, facts: [DELIVERY_TEXT], items: [{ ...DELIVERY_ITEM }] },
  ];
}

/** The offer on phase 2b once a recheck still fails (AC-WAIVE-02, AC-WAIVE-03). */
export function markCompleteOfferSample(mixed = false): Extract<MarkCompleteOffer, { offered: true }> {
  const failing = mixed ? 3 : 1;
  return {
    offered: true, label: "Mark Phase 2b complete", heading: "Phase 2b is done, and Kiln’s check is wrong?", continueInOrder: false, checkRunId: "run-2b-recheck",
    items: handBackChecks(mixed).filter(check => !check.passed).flatMap(check => check.items!.map(item => ({ check: check.name, kind: item.kind, subject: item.subject, text: item.text, against: item.against }))),
    failingChecks: failing, nextActivity: { kind: "phase", key: "3", title: "Returns dashboard" }, resultingLabel: `Complete · ${failing} check${failing === 1 ? "" : "s"} waived`, noReport: false,
    sentence: [
      `Mark it complete. Kiln skips the ${failing} failing check${failing === 1 ? "" : "s"} above, records ${failing === 1 ? "it" : "them"} as waived, never as passed, and moves to the next step. Phase 2b will show as “Complete · ${failing} check${failing === 1 ? "" : "s"} waived”.`,
      ...(mixed ? ["acme-shop has work that is not committed and pushed. Work that is not committed and pushed will be missing from the final pull request. To push it instead, have Kiln resume Phase 2b."] : []),
    ],
  };
}

/**
 * The hand-back page for phase 2b (waivers mockup states 1 to 4): before a recheck, the checks
 * from when Kiln stopped; after one, `rechecked`, Mark complete offered unless `checking`.
 */
export function handBackSnapshot(options: { resumeOffered?: boolean; rechecked?: boolean; checking?: boolean; mixed?: boolean } = {}): Snapshot {
  const { resumeOffered = true, rechecked = false, checking = false, mixed = false } = options;
  const snapshot = needsYouMessageSnapshot();
  const stop = snapshot.needsYou!;
  const checks = handBackChecks(mixed);
  const failed = checks.filter(check => !check.passed).length;
  const handBack: NonNullable<Snapshot["needsYou"]> = {
    ...stop,
    resumeOffered,
    checks,
    counts: { passed: checks.length - failed, waived: 0, failed },
    checkedAt: rechecked ? "2026-10-17T15:56:05Z" : "2026-10-17T15:52:00Z",
    checkRun: rechecked ? { id: "run-2b-recheck", at: "2026-10-17T15:56:05Z", origin: "recheck", finished: true } : { id: "run-2b-stop", at: "2026-10-17T15:52:00Z", origin: "stop", finished: true },
    markComplete: rechecked && !checking ? markCompleteOfferSample(mixed) : { offered: false, reason: checking ? "Kiln is checking." : "No check has run since Phase 2b stopped." },
    ...(checking ? { checking: true as const } : {}),
    phaseRecovery: { target: { executionId: "display-execution", phaseKey: "2b", sessionId: SESSION_2B, stoppedAt: "2026-10-17T15:52:00Z" }, completion: "incomplete" },
  };
  if (!resumeOffered) delete handBack.resumeCommand;
  snapshot.needsYou = handBack;
  return snapshot;
}

/** After phase 2b was marked complete (waivers mockup state 6): phase 3 running, 2b Complete · 1 check waived. */
export function waivedPhaseSnapshot(): Snapshot {
  const snapshot = runningSnapshot();
  const waivedChecks: CheckResult[] = [
    { name: "Phase doc closed", passed: true, facts: ["phase-2b-store-credit.md has a Closed line"] },
    { name: "Everything committed", passed: true, facts: ["acme-shop: working tree is clean"] },
    { name: "Pushed", passed: true, facts: ["acme-shop: no commits waiting to be pushed"] },
    { name: DELIVERY_CHECK, passed: true, waived: true, facts: [DELIVERY_TEXT], items: [{ ...DELIVERY_ITEM, waiver: WAIVER_REF }] },
  ];
  const done2b: PhaseView = {
    ...PHASE_2B, state: "done", sessionStartedAt: "2026-10-17T14:58:00Z", doneAt: WAIVER_AT, finishedByPerson: false,
    details: details("2026-10-17T14:58:00Z", WAIVER_AT, "high", 2, "7f3a91c5e2aa", SESSION_2B),
    waivedChecks: 1, waivedCompletion: { checks: waivedChecks, counts: { passed: 3, waived: 1, failed: 0 } }, waivers: [WAIVER],
  };
  snapshot.feature = { ...snapshot.feature, currentPhaseId: "3", phasesDone: 3 };
  snapshot.phases = [PHASE_1, PHASE_2, PHASE_2A, done2b, { ...PHASE_3, state: "implementing", sessionStartedAt: "2026-10-17T15:58:30Z" }, PHASE_4];
  snapshot.current = { ...snapshot.current!, phaseId: "3", sessionId: SESSION_3, startedAt: "2026-10-17T15:58:30Z" };
  snapshot.waivers = [WAIVER];
  return snapshot;
}

/**
 * Final delivery on the standard Needs you page (waivers mockup state 7): a carried waiver tags
 * its item within a check that still fails, and Mark complete sits below Check again.
 */
export function finalDeliveryNeedsYouSnapshot(): Snapshot {
  const snapshot = needsYouMessageSnapshot();
  const stop = snapshot.needsYou!;
  const checks: CheckResult[] = [{
    name: "Development delivery and remaining review", passed: false,
    facts: [DELIVERY_TEXT, "acme-shop: unresolved — no complete source-work delivery provenance."],
    items: [{ ...DELIVERY_ITEM, waiver: WAIVER_REF }, { kind: "other", subject: "acme-shop", text: "acme-shop: unresolved — no complete source-work delivery provenance.", against: "acme-shop=9e04c7d2" }],
  }];
  snapshot.feature = { ...snapshot.feature, currentPhaseId: "pr", phasesDone: 5 };
  snapshot.waivers = [WAIVER];
  snapshot.needsYou = {
    ...stop, phaseId: "pr", resumeOffered: true, checks, counts: { passed: 0, waived: 0, failed: 1 },
    checkedAt: "2026-10-17T16:41:00Z", checkRun: { id: "run-pr-recheck", at: "2026-10-17T16:41:00Z", origin: "recheck", finished: true },
    markComplete: {
      offered: true, label: "Mark final delivery complete", heading: "Final delivery is done, and Kiln’s check is wrong?", continueInOrder: false, checkRunId: "run-pr-recheck",
      items: [{ check: checks[0]!.name, kind: "other", subject: "acme-shop", text: checks[0]!.facts[1]!, against: "acme-shop=9e04c7d2" }],
      failingChecks: 1, nextActivity: { kind: "complete", key: "complete", title: "Complete" }, resultingLabel: "Complete · 1 check waived", noReport: false,
      sentence: ["Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to Complete. Final delivery will show as “Complete · 1 check waived”."],
    },
  };
  return snapshot;
}

/** A delivery audit with no usable report, marked complete (waivers mockup state 10, after Mark complete). */
export function noReportAuditSnapshot(): Snapshot {
  const snapshot = waivedPhaseSnapshot();
  const auditWaiver: WaiverView = { id: "waiver-audit", at: "2026-10-17T16:34:10Z", activityKey: "audit-da1", activity: "Delivery audit", effect: "completed", source: { via: "browser", account: "alex" }, checkRun: { id: "run-da1", at: "2026-10-17T16:33:00Z" }, items: [{ check: "Audit result recorded", kind: "other", subject: "No audit report yet.", text: "No audit report yet.", against: "acme-shop=0c4d8a2e9f10" }] };
  const reportCheck: CheckResult = { name: "Audit result recorded", passed: true, waived: true, facts: ["No audit report yet."], items: [{ kind: "other", subject: "No audit report yet.", text: "No audit report yet.", against: "acme-shop=0c4d8a2e9f10", waiver: { waiverId: auditWaiver.id, activityKey: "audit-da1", at: auditWaiver.at, via: "browser", account: "alex" } }] };
  const audit: PhaseView = {
    id: "audit-da1", activityId: "da1", kind: "delivery_audit", title: "Delivery audit", file: "Round 1", round: 1, continuationIndex: 1, state: "done", doneAt: auditWaiver.at, finishedByPerson: false,
    audit: { checks: [reportCheck], criteria: [], repositories: [], blockers: [], pendingActions: [] },
    waivedChecks: 1, waivedCompletion: { checks: [reportCheck], counts: { passed: 0, waived: 1, failed: 0 } }, waivers: [auditWaiver],
    warnings: [{ kind: "no_audit_report", text: "no audit report: Kiln couldn’t tell what this audit found" }],
  };
  snapshot.activities = [...snapshot.phases.filter(row => row.id !== "4"), audit, { id: "audit-ta1", activityId: "ta1", kind: "test_audit", title: "Test audit", file: "Round 1", round: 1, continuationIndex: 1, state: "implementing", finishedByPerson: false }];
  snapshot.waivers = [WAIVER, auditWaiver];
  return snapshot;
}

/** Complete after final delivery was marked complete (waivers mockup state 9). */
export function completeWaivedSnapshot(): Snapshot {
  const snapshot = completeSnapshot();
  const prWaiver: WaiverView = { ...WAIVER, id: "waiver-pr", activityKey: "pr", activity: "Final delivery", at: "2026-10-17T18:55:00Z" };
  snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, waivedChecks: 1, waivers: [WAIVER] } : row.id === "pr" ? { ...row, waivedChecks: 1, waivers: [prWaiver] } : row);
  snapshot.waivers = [WAIVER, prWaiver];
  return snapshot;
}

/** The Folder missing mockup's clock: Nov 6, 8:35 AM EST, when Kiln checked (missing worktree recovery mockup). */
export const FOLDER_MISSING_NOW = Date.parse("2026-11-06T13:35:00Z");
export type FolderMissingCase = "merged" | "unmerged" | "gone" | "elsewhere" | "occupied" | "multi" | "unknown";

/**
 * Folder missing, with the mockup's sample data for each of its page cases
 * (docs/changes/kiln-missing-worktree-recovery/mockups/kiln-missing-worktree-recovery.html).
 */
export function folderMissingSnapshot(which: FolderMissingCase): Snapshot {
  type View = NonNullable<Snapshot["folderMissing"]>;
  type Repo = View["repositories"][number];
  const BR = "feature/invoice-evidence-collection";
  const SAVED = "~/devel/.worktrees/invoice-evidence-collection/harbor-ledger";
  const PORTAL = "~/devel/.worktrees/invoice-evidence-collection/harbor-portal";
  const OCT23 = "2026-10-23T14:10:00Z"; const OCT24 = "2026-10-24T13:12:00Z";
  const at = (sha: string) => ({ sha: sha.padEnd(40, "0"), date: OCT24 });
  const repo = (overrides: Partial<Repo>): Repo => ({ name: "harbor-ledger", savedFolder: SAVED, branch: BR, setUpAt: OCT23, state: "missing", gitRecord: "listed", featureBranch: {}, unknown: [], ...overrides });
  const developMerged = { source: "origin" as const, branch: "develop", sha: "0a3d75d".padEnd(40, "0"), total: 13, closed: 9, next: { id: "10", title: "Duplicate invoice guard" } };
  const develop = { source: "origin" as const, branch: "develop", sha: "7e21b90".padEnd(40, "0"), total: 5, closed: 3, next: { id: "4", title: "Run reports and alerts" } };
  const merged = { local: at("4c80c80"), origin: at("4c80c80"), relation: "same" as const, inBase: true };
  const unmergedBranch = { local: at("bec1115"), origin: at("bec1115"), relation: "same" as const, inBase: false, notInBaseCount: 3 };
  const restore = (path: string, repository = "harbor-ledger") => [`git -C ~/devel/${repository} worktree add -f ${path} ${BR}`];
  const cases: Record<FolderMissingCase, Omit<View, "checkedAt" | "factsId">> = {
    merged: { repositories: [repo({ featureBranch: merged, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: true } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "out_of_date", comparedWith: "base" }, base: developMerged }, restoreCommands: restore(SAVED) },
    unmerged: { repositories: [repo({ featureBranch: unmergedBranch, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: false } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "matches_branch", comparedWith: "branch" }, base: develop, branchOnly: ["4"] }, restoreCommands: restore(SAVED) },
    gone: { repositories: [repo({ gitRecord: "none", featureBranch: { gone: true }, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: false, inBase: false } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "ahead", aheadPhases: ["4"], comparedWith: "base" }, base: develop }, restoreCommands: [] },
    elsewhere: { repositories: [repo({ gitRecord: "none", featureBranch: { ...merged, elsewhere: "~/devel/ledger-scratch" }, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: true } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "out_of_date", comparedWith: "base" }, base: developMerged }, restoreCommands: [] },
    occupied: { repositories: [repo({ state: "holds_something_else", holds: "a plain folder, not a git worktree", gitRecord: "none", featureBranch: { origin: at("bec1115"), inBase: false, notInBaseCount: 3 }, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: false } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "matches_branch", comparedWith: "branch" }, base: develop, branchOnly: ["4"] }, restoreCommands: [] },
    multi: { repositories: [
      repo({ state: "in_place", gitRecord: "listed", featureBranch: unmergedBranch, lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: false } }),
      repo({ name: "harbor-portal", savedFolder: PORTAL, featureBranch: { local: at("91c4e02"), origin: at("91c4e02"), relation: "same", inBase: false, notInBaseCount: 2 }, lastPushed: { sha: "91c4e02".padEnd(40, "0"), phaseId: "4", onOrigin: true, inBase: false } }),
    ], plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "matches_branch", comparedWith: "branch" }, base: develop, branchOnly: ["4"] }, restoreCommands: restore(PORTAL, "harbor-portal") },
    unknown: { repositories: [repo({ featureBranch: { local: at("4c80c80"), inBase: true }, unknown: [`${BR} on origin`], lastPushed: { sha: "bec1115".padEnd(40, "0"), phaseId: "4", inBase: true } })],
      plans: { saved: { total: 5, done: 4, readAt: OCT24, label: "not_compared" }, base: { ...developMerged, source: "local" } }, restoreCommands: [], restoreUnknown: true },
  };
  const multi = which === "multi";
  return underway({
    feature: { name: "Invoice evidence collection", repositoryName: "harbor-ledger", multiRepository: multi, prdFolder: "docs/prds/invoice-evidence-collection/", state: "folder_missing", phasesDone: 4, phasesTotal: 5, startedAt: OCT23 },
    phases: ["1", "2", "3", "4"].map(id => ({ id, title: `Phase ${id} work`, file: `phase-${id}.md`, state: "done" as const, doneAt: OCT24, finishedByPerson: false })),
    folderMissing: { checkedAt: new Date(FOLDER_MISSING_NOW).toISOString(), factsId: "f".repeat(64), ...cases[which] },
  });
}
