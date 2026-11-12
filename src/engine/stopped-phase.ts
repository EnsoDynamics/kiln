// A stopped phase's facts (run restart technical design, "A Stopped Phase's Facts"): whether a
// conversation ever began, which session is the latest launch and which the latest conversation,
// the phase's work, why the latest launch never began a conversation, and whether the latest
// Claude conversation can be reopened.

import { claudeHistoryAvailability } from "../session/transcripts.js";
import { readOutputLines, runReportedInit } from "../session/claude-session.js";
import type { SessionRecord, SessionRun } from "../state/records.js";
import { runGit, type GitContext } from "./git-reads.js";
import { fixCommandFor, type ReopenCheck } from "./reopen-check.js";

/** A run began a conversation: Claude's stream reported `init`; for Codex, a turn was accepted or its dispatch is ambiguous. */
export function runBegan(stateDirectory: string, session: SessionRecord, runIndex: number): boolean {
  const run = session.runs[runIndex];
  if (!run) return false;
  if (session.agentId === "codex") return !!run.codex?.turnId || run.codex?.reconciliation === "ambiguous";
  return runReportedInit(stateDirectory, session, runIndex);
}

/** Some run of the session began a conversation. */
export function conversationBegan(stateDirectory: string, session: SessionRecord): boolean {
  // Claude's init sets the session's concrete model, so a session that has one began without reading its events.
  if (session.runs.length === 0) return false;
  if (session.agentId !== "codex" && session.initModel !== undefined) return true;
  return session.runs.some((_, index) => runBegan(stateDirectory, session, index));
}

/** The session whose latest run started last; a record with no run is never the latest launch. */
export function latestLaunch(sessions: readonly SessionRecord[]): SessionRecord | undefined {
  let latest: SessionRecord | undefined;
  for (const session of sessions) {
    const started = session.runs.at(-1)?.startedAt;
    if (started === undefined) continue;
    if (!latest || started >= latest.runs.at(-1)!.startedAt) latest = session;
  }
  return latest;
}

/** The last session in the phase's list that began a conversation. */
export function latestConversation(stateDirectory: string, sessions: readonly SessionRecord[]): SessionRecord | undefined {
  return sessions.findLast(session => conversationBegan(stateDirectory, session));
}

export interface PhaseWork {
  repositories: { name: string; commits: { sha: string; subject: string }[]; uncommittedFiles: number }[];
  builtNothing: boolean;
}
export type WorkRead = PhaseWork | { unknown: string };

export interface WorkRepository { name: string; worktreePath: string; baseBranch: string; startCommit: string | undefined }

/**
 * Per set-up repository: the commits the feature branch's tip has that neither the phase's start
 * commit there nor the base's tip on origin has, and the worktree's uncommitted files. A read
 * that fails makes the work unknown, naming the read.
 *
 *   await readPhaseWork(git, [{ name: "harbor-ledger", worktreePath, baseBranch: "develop", startCommit }], "feature/x")
 *   // { repositories: [{ name: "harbor-ledger", commits: [], uncommittedFiles: 0 }], builtNothing: true }
 */
export async function readPhaseWork(git: GitContext, repositories: readonly WorkRepository[], branch: string): Promise<WorkRead> {
  const readOne = async (entry: WorkRepository): Promise<PhaseWork["repositories"][number] | string> => {
    let commits: { sha: string; subject: string }[] = [];
    // A repository with no start commit for the phase has no commits of the phase.
    if (entry.startCommit) {
      const base = `refs/remotes/origin/${entry.baseBranch}`;
      const hasBase = await runGit(git, entry.worktreePath, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
      const log = await runGit(git, entry.worktreePath, ["log", "--format=%H%x09%s", `refs/heads/${branch}`, `^${entry.startCommit}`, ...(hasBase.exitCode === 0 ? [`^${base}`] : []), "--"]);
      if (log.exitCode !== 0) return `Kiln couldn't read ${entry.name}'s commits.`;
      commits = log.stdout.split(/\r?\n/).filter(line => line.includes("\t")).map(line => { const [sha, ...subject] = line.split("\t"); return { sha: sha!, subject: subject.join("\t") }; });
    }
    const status = await runGit(git, entry.worktreePath, ["status", "--porcelain", "--untracked-files=all"]);
    if (status.exitCode !== 0) return `Kiln couldn't read ${entry.name}'s uncommitted changes.`;
    const uncommittedFiles = status.stdout.split(/\r?\n/).filter(line => line.trim() !== "").length;
    return { name: entry.name, commits, uncommittedFiles };
  };
  const results = await Promise.all(repositories.map(readOne));
  const failed = results.find((result): result is string => typeof result === "string");
  if (failed) return { unknown: failed };
  const read = results as PhaseWork["repositories"];
  return { repositories: read, builtNothing: read.every(entry => entry.commits.length === 0 && entry.uncommittedFiles === 0) };
}

/** "No commits · no uncommitted changes", "2 commits · 3 uncommitted files". */
export function workSummary(work: PhaseWork): string {
  const commits = work.repositories.reduce((sum, entry) => sum + entry.commits.length, 0);
  const files = work.repositories.reduce((sum, entry) => sum + entry.uncommittedFiles, 0);
  return `${commits === 0 ? "No commits" : `${commits} ${commits === 1 ? "commit" : "commits"}`} · ${files === 0 ? "no uncommitted changes" : `${files} uncommitted ${files === 1 ? "file" : "files"}`}`;
}

export interface LaunchFailure { ran: "claude" | "codex"; folder: string; sentence: string; error: string; at: string }

const CAUSE_WORDS = { sigint: "Ctrl+C", sighup: "the terminal closed", sigterm: "Kiln was stopped", sleep: "the computer slept" } as const;

/**
 * What Kiln found when the latest launch has a run and never began a conversation (AC-CASE-04):
 * the first matching row of the design's table.
 */
/** `outputLines` reads the session's saved output, so a caller with a bounded reader (inspection) supplies it. */
export function launchFailure(stateDirectory: string, session: SessionRecord, folder: string, worktreePath: string, outputLines: (session: SessionRecord) => { text: string }[] = one => readOutputLines(stateDirectory, one)): LaunchFailure | undefined {
  const runIndex = session.runs.length - 1;
  const run = session.runs[runIndex];
  if (!run || conversationBegan(stateDirectory, session)) return undefined;
  const ran = session.agentId === "codex" ? "codex" : "claude";
  const where = folder === worktreePath ? "the worktree" : folder;
  const lastLines = () => {
    const lines = outputLines(session).slice(-10).map(line => line.text);
    return lines.length ? lines.join("\n") : "Kiln recorded no output.";
  };
  const codexFailure = (run: SessionRun) => run.codex?.failure;
  let sentence: string; let error: string;
  if (ran === "codex" && run.spawnError?.code === "CODEX_PREFLIGHT") { sentence = `Kiln ran \`codex\` in ${where}, and it couldn't start a session.`; error = run.spawnError.message; }
  else if (run.pid === undefined) { sentence = `Kiln ran \`${ran}\` in ${where}, and the computer couldn't start it.`; error = ran === "codex" ? codexFailure(run) ?? run.spawnError?.message ?? lastLines() : lastLines(); }
  else if (run.interruptedBy) { sentence = `Kiln ran \`${ran}\` in ${where}, and it was interrupted (${CAUSE_WORDS[run.interruptedBy]}) before beginning a conversation.`; error = ran === "codex" ? codexFailure(run) ?? lastLines() : lastLines(); }
  else if (ran === "claude" && (run.exitCode !== undefined || run.signal !== undefined)) { sentence = `Kiln ran \`claude\` in ${where}, and it ${run.signal !== undefined ? `was ended by ${run.signal}` : `exited with code ${run.exitCode}`} before beginning a conversation.`; error = lastLines(); }
  else if (ran === "codex" && codexFailure(run)) { sentence = `Kiln ran \`codex\` in ${where}, and it stopped before beginning a conversation.`; error = codexFailure(run)!; }
  else { sentence = `Kiln ran \`${ran}\` in ${where}, and it stopped before beginning a conversation.`; error = lastLines(); }
  return { ran, folder, sentence, error, at: run.startedAt };
}

/**
 * The Claude reopen check for a stopped phase's latest conversation: `reopen_failed` when its last
 * run is a resumed run that spawned and ended without reporting `init`; otherwise the saved file's
 * own availability. `fromHold` is a hold's check, which reads the file alone.
 */
export function claudeReopenCheck(env: NodeJS.ProcessEnv, stateDirectory: string, session: SessionRecord, fromHold = false): ReopenCheck {
  const runIndex = session.runs.length - 1;
  const run = session.runs[runIndex];
  // Only a run Kiln watched end (an exit code or signal) is known to have ended without `init`; a recovered run's observed exit is not.
  if (!fromHold && run && run.cause !== "launch" && run.pid !== undefined && run.endedAt !== undefined && (run.exitCode !== undefined || run.signal !== undefined) && !runReportedInit(stateDirectory, session, runIndex)) return { state: "unavailable", reason: "reopen_failed" };
  const history = claudeHistoryAvailability(env, session.sessionId);
  if (history.available) return { state: "available" };
  const reason = history.code ?? "unreadable";
  if (reason === "unsafe") {
    const fixCommand = history.path && history.defects ? fixCommandFor(history.path, history.defects, history.folder === true) : undefined;
    return { state: "unavailable", reason, ...(history.path ? { path: history.path } : {}), defects: history.defects ?? [], ...(fixCommand ? { fixCommand } : {}) };
  }
  return { state: "unavailable", reason, ...(reason === "not_a_file" && history.path ? { path: history.path } : {}) };
}
