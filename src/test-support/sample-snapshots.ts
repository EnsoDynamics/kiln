// The mockups' sample data as Snapshots (fictional), for the view's tests: Documents found,
// then the progress screens.

import type { PhaseView, Snapshot } from "../engine/snapshot.js";
import type { OutputLine } from "../session/session-output.js";

export function documentsFoundSnapshot(overrides: { settings?: Partial<Snapshot["settings"]>; documents?: Partial<NonNullable<Snapshot["documents"]>> } & Partial<Omit<Snapshot, "settings" | "documents">> = {}): Snapshot {
  const { settings, documents, ...rest } = overrides;
  return {
    feature: { name: "Customer returns", repositoryName: "acme-shop", prdFolder: "docs/prds/customer-returns/", state: "not_started", phasesDone: 0, phasesTotal: 5 },
    documents: {
      prd: { file: "customer-returns-prd.md", criteriaCount: 14, firstLabel: "AC-RET-01", lastLabel: "AC-RET-14" },
      design: { file: "technical-design.md", criteriaCited: 14 },
      assumptions: { file: "assumptions.md", total: 11, notYetConfirmed: 2 },
      plan: {
        phaseDocCount: 6,
        leafCount: 5,
        closedCount: 0,
        phases: [
          { id: "1", title: "Return intake", closed: false },
          { id: "2", title: "Refund routing", splitInto: ["2a", "2b"], closed: false },
          { id: "2a", title: "Card refunds", closed: false },
          { id: "2b", title: "Store credit", closed: false },
          { id: "3", title: "Returns dashboard", closed: false },
          { id: "4", title: "Restock check-in", closed: false },
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
      worktreePath: "~/devel/acme-shop-kiln/customer-returns",
      featureBranch: "feature/customer-returns",
      baseBranch: "develop",
      baseBranches: ["develop", "main"],
      baseCheck: "ok",
      fixed: false,
      fieldErrors: {},
      ...settings,
    },
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
      updatedAt: "2026-10-17T13:15:00Z",
      limits: [
        { label: "5-hour window", shortLabel: "5-hour", percent: 13, nearLimit: false },
        { label: "Weekly", shortLabel: "weekly", percent: 22, nearLimit: false },
        { label: "Weekly · Fable", shortLabel: "Fable", percent: 0, nearLimit: false },
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
  const settings: Snapshot["settings"] = { ...documentsFoundSnapshot().settings, fixed: true };
  delete settings.baseBranches;
  delete settings.baseCheck;
  return settings;
}

const ACCOUNT: NonNullable<Snapshot["account"]> = {
  email: "alex@acme-shop.dev",
  plan: "Max plan",
  updatedAt: "2026-10-17T15:45:00Z",
  limits: [
    { label: "5-hour window", shortLabel: "5-hour", percent: 82, resetsAt: "2026-10-17T16:59:00Z", nearLimit: true },
    { label: "Weekly", shortLabel: "weekly", percent: 41, resetsAt: "2026-10-21T16:00:00Z", nearLimit: false },
    { label: "Weekly · Fable", shortLabel: "Fable", percent: 6, resetsAt: "2026-10-21T16:00:00Z", nearLimit: false },
  ],
};

function underway(rest: Partial<Snapshot> & Pick<Snapshot, "feature" | "phases">): Snapshot {
  return { settings: underwaySettings(), models: documentsFoundSnapshot().models!, pause: { pending: false, active: false }, account: ACCOUNT, ...rest };
}

const FEATURE = { name: "Customer returns", repositoryName: "acme-shop", prdFolder: "docs/prds/customer-returns/", phasesTotal: 5, startedAt: "2026-10-17T13:17:00Z" };

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
      commits: [],
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
      finalMessage:
        "**Critical finding, stopping to surface:** the reviewer found that develop has since added its own migration 0042 (gift cards), so this branch’s `0042_store_credits` clashes with it. The store-credit tests pass here, but the migration won’t apply once this branch meets develop.\n\nRecommendation: rebase feature/customer-returns on develop and renumber this migration to 0043. Nothing for 2b is committed yet.",
      exitCode: 0,
      lastSkill: { name: "deliverable-review", at: "2026-10-17T15:44:00Z" },
      checks: [
        { name: "Phase doc closed", passed: false, fact: "No Closed line in phase-2b-store-credit.md" },
        { name: "Everything committed", passed: false, fact: "12 files changed, not committed" },
        { name: "Pushed", passed: true, fact: "Matches origin at 5d81b37" },
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
      commits: [],
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
      exitCode: 1,
      lastSkill: { name: "test-hardening", at: "2026-10-17T17:15:00Z" },
      lastLines: [
        { line: 2028, at: "2026-10-17T17:20:51Z", source: "claude", text: "Running the dashboard Playwright suite. It needs the dev server on 5173; starting it." },
        { line: 2029, at: "2026-10-17T17:20:52Z", source: "tool", text: "Bash npm run dev &" },
        { line: 2030, at: "2026-10-17T17:20:55Z", source: "stderr", text: "Error: listen EADDRINUSE: address already in use :::5173" },
        { line: 2031, at: "2026-10-17T17:21:03Z", source: "exit", text: "Process exited with code 1" },
      ],
      checks: [
        { name: "Phase doc closed", passed: false, fact: "No Closed line in phase-3-returns-dashboard.md" },
        { name: "Everything committed", passed: true, fact: "Latest commit a41c9e2, tree clean" },
        { name: "Pushed", passed: false, fact: "a41c9e2 isn’t on origin yet" },
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
      commits: [{ sha: "a41c9e2d0b11", subject: "feat(returns): returns dashboard (phase 3)" }],
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
    pullRequest: { number: 218, title: "Customer returns: intake, refund routing, dashboard and restock", url: "https://github.com/acme/acme-shop/pull/218", head: BRANCH, base: "develop", commits: 17, additions: 2184, deletions: 312 },
  });
}
