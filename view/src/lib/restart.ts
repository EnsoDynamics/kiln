// Copy for a stopped phase's page (run restart AC-CASE-01 to 04, AC-CARRY-01 to 06), as the
// mockup docs/changes/kiln-run-restart/mockups/kiln-run-restart.html words it.

import type { Snapshot } from "../../../src/engine/snapshot.js";

type NeedsYou = NonNullable<Snapshot["needsYou"]>;
type Work = NonNullable<NeedsYou["work"]>;

/** "No commits · no uncommitted changes", "2 commits · 3 uncommitted files", or the read that failed. */
export function workLine(work: Work | undefined): string {
  if (!work) return "Reading…";
  if ("unknown" in work) return work.unknown;
  const commits = work.repositories.reduce((sum, entry) => sum + entry.commits.length, 0);
  const files = work.repositories.reduce((sum, entry) => sum + entry.uncommittedFiles, 0);
  return `${commits === 0 ? "No commits" : `${commits} ${commits === 1 ? "commit" : "commits"}`} · ${files === 0 ? "no uncommitted changes" : `${files} uncommitted ${files === 1 ? "file" : "files"}`}`;
}

/** "2 minutes", "less than a minute", "1 hour 5 minutes". */
export function ranFor(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return hours === 0 ? part(minutes, "minute") : rest === 0 ? part(hours, "hour") : `${part(hours, "hour")} ${part(rest, "minute")}`;
}

/** A stopped phase's headline and the line under it, or undefined for today's page (AC-CASE-01). */
export function caseHeadline(stop: NeedsYou, activity: string, agent: string): { headline: string; line: string } | undefined {
  if (stop.case === "could_not_start") return { headline: `Kiln couldn't start ${activity}.`, line: `${agent} never began a conversation, so there is nothing to reply to.` };
  if (stop.case === "built_nothing") return { headline: `${activity} stopped before building anything.`, line: `${agent}'s latest conversation ran for ${ranFor(stop.conversationRanMs ?? 0)}. No commits, no uncommitted changes.` };
  return undefined;
}
