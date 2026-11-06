// The Folder missing page's words (missing worktree recovery mockup, "kiln-missing-worktree-recovery.html"),
// built from the snapshot's `folderMissing` block so the screen only lays them out.

import type { FolderMissingSnapshot } from "../../../src/engine/snapshot.js";

type Repository = FolderMissingSnapshot["repositories"][number];
export type Tone = "pass" | "fail" | "unknown" | "code";
export interface Part { text: string; tone?: Tone }
export interface FactRow { label: Part[]; value: Part[] }

const short = (sha: string) => sha.slice(0, 7);
/** "Oct 24": the day only, as the mockup's facts give it. */
export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const failing = (view: FolderMissingSnapshot) => view.repositories.filter(repository => repository.state !== "in_place");

export function heading(view: FolderMissingSnapshot): string {
  const bad = failing(view);
  if (view.repositories.length > 1) return bad.length === 1 ? (bad[0]!.state === "missing" ? "One of this run’s folders is gone." : bad[0]!.state === "holds_something_else" ? "One of this run’s folders now holds something else." : "Kiln couldn’t check one of this run’s folders.") : "Some of this run’s folders aren’t in place.";
  const state = bad[0]?.state;
  return state === "holds_something_else" ? "This run’s folder now holds something else." : state === "unknown" ? "Kiln couldn’t check this run’s folder." : "This run’s folder is gone.";
}

export function intro(view: FolderMissingSnapshot): string {
  const bad = failing(view);
  const setUp = view.repositories.map(repository => repository.setUpAt).filter((at): at is string => !!at).sort()[0];
  const when = setUp ? ` on ${day(setUp)}` : "";
  if (view.repositories.length > 1) {
    const names = bad.map(repository => repository.name).join(" and ");
    return `Kiln set this run up${when} in one workspace, and ${names}’s folder in it ${bad.every(repository => repository.state === "missing") ? "no longer exists" : "isn’t the run’s worktree"}. Kiln won’t report progress from a folder it can’t read. Below is what it can still find.`;
  }
  const state = bad[0]?.state;
  if (state === "holds_something_else") return `Kiln set this run up${when} in its own folder, and that path now holds ${bad[0]!.holds?.replace(/, not a git worktree$/, "") ?? "something else"} instead of the run’s worktree. Kiln won’t report progress from a folder that isn’t the run’s. Below is what it can still find.`;
  if (state === "unknown") return `Kiln set this run up${when} in its own folder, and couldn’t check that it is still the run’s worktree. Kiln won’t report progress from a folder it can’t read. Below is what it can still find.`;
  return `Kiln set this run up${when} in its own folder, and that folder no longer exists. Kiln won’t report progress from a folder it can’t read. Below is what it can still find.`;
}

export function folderState(repository: Repository): { text: string; tone: Tone } {
  return repository.state === "missing" ? { text: "Missing", tone: "fail" } : repository.state === "holds_something_else" ? { text: "Holds something else", tone: "fail" } : repository.state === "unknown" ? { text: "Couldn’t check", tone: "unknown" } : { text: "In place", tone: "pass" };
}

/** The line under a saved folder: its branch, when it was set up, and what the path holds now. */
export function folderLine(repository: Repository): Part[] {
  const holds = repository.state === "holds_something_else" && repository.holds ? ` · Now ${repository.holds}` : "";
  return [{ text: "on branch " }, { text: repository.branch, tone: "code" }, { text: `${repository.setUpAt ? ` · set up ${day(repository.setUpAt)}` : ""}${holds}` }];
}

export const SAVED_TAGS: Record<FolderMissingSnapshot["plans"]["saved"]["label"], Tone | "warn" | "ok"> = { out_of_date: "warn", matches_branch: "ok", matches_base: "ok", ahead: "warn", not_compared: "unknown" };

/** The saved plan's tag (AC-FACTS-02): "Out of date", "Matches the branch", "Ahead of develop". */
export function savedTag(view: FolderMissingSnapshot): string {
  const saved = view.plans.saved; const base = view.plans.base.branch;
  switch (saved.label) {
    case "out_of_date": return "Out of date";
    case "matches_branch": return "Matches the branch";
    case "matches_base": return `Matches ${base}`;
    case "ahead": return `Ahead of ${saved.comparedWith === "branch" ? "the branch" : base}`;
    case "not_compared": return "Not compared";
  }
}

export function savedNote(view: FolderMissingSnapshot): string {
  const at = view.plans.saved.readAt;
  return at ? `Read ${day(at)} in the run’s saved folder.` : "Read date not recorded.";
}

/** The base branch's plan card: its tag, count and the line under it. */
export function baseCard(view: FolderMissingSnapshot): { title: string; tag: string; count?: { big: string; rest: string }; note: string } {
  const base = view.plans.base;
  if ("error" in base) return { title: `Plan on ${base.branch}`, tag: "Couldn’t read", note: base.error };
  const where = base.source === "origin" ? `origin/${base.branch}` : `your checkout’s ${base.branch}`;
  const only = view.plans.branchOnly;
  const next = only?.length ? `${only.length === 1 ? `Phase ${only[0]}’s` : `Phases ${only.slice(0, -1).join(", ")} and ${only.at(-1)}’s`} work is only on the feature branch` : view.plans.saved.comparedWith === "branch" ? "this run’s latest work is only on the feature branch" : base.next ? `next is Phase ${base.next.id}, ${base.next.title}` : "every phase is closed";
  // The PRD's repository comes first; a multi-repository run's plan is read there.
  const prd = view.repositories.length > 1 ? `${view.repositories[0]!.name}’s ` : "";
  return {
    title: `Plan on ${base.branch}`,
    tag: base.source === "origin" ? `origin/${base.branch}` : `Your checkout’s ${base.branch}`,
    count: { big: String(base.closed), rest: `of ${base.total} phases done` },
    note: `${base.source === "local" ? "Couldn’t reach origin · " : ""}${prd}${where} at ${short(base.sha)} · ${next}`,
  };
}

function commit(sha: string, date: string | undefined): string {
  return `${short(sha)}${date ? `, ${day(date)}` : ""}`;
}

/** The facts list (AC-FACTS-01), one row per fact, each repository's named when the run has several. */
export function factRows(view: FolderMissingSnapshot, baseBranch: string): FactRow[] {
  const multi = view.repositories.length > 1;
  // Origin unreachable: the base branch was read in the shared checkout, so what concerns origin's is unknown.
  const localBase = "source" in view.plans.base && view.plans.base.source === "local";
  const rows: FactRow[] = [];
  const ordered = [...failing(view), ...view.repositories.filter(repository => repository.state === "in_place")];
  for (const repository of ordered) {
    const prefix = multi ? `${repository.name} · ` : "";
    const label = (text: string): Part[] => [{ text: `${prefix}${multi ? text.charAt(0).toLowerCase() + text.slice(1) : text}` }];
    const branch = repository.featureBranch;
    const originUnknown = repository.unknown.includes(`${repository.branch} on origin`);
    const value: Part[] = [];
    if (branch.local && branch.origin) {
      if (branch.local.sha === branch.origin.sha) value.push({ text: `In your checkout and on origin, both at ${commit(branch.local.sha, branch.local.date)}` });
      else value.push({ text: `In your checkout at ${commit(branch.local.sha, branch.local.date)}; on origin at ${commit(branch.origin.sha, branch.origin.date)}${branch.relation && branch.relation !== "same" ? ` · your checkout’s is ${branch.relation === "diverged" ? "diverged from" : branch.relation} origin’s` : ""}` });
    } else if (branch.local) {
      value.push({ text: `${originUnknown ? "In your checkout" : "Only in your checkout"} · last commit ${commit(branch.local.sha, branch.local.date)}` });
      if (originUnknown) value.push({ text: " · " }, { text: "on origin: couldn’t check", tone: "unknown" });
    } else if (branch.origin) value.push({ text: `Only on origin · last commit ${commit(branch.origin.sha, branch.origin.date)}` });
    else if (branch.gone) value.push({ text: "Deleted", tone: "fail" }, { text: " locally and on origin" });
    else value.push({ text: "Couldn’t check", tone: "unknown" });
    if (!localBase && branch.inBase === true) value.push({ text: " · " }, { text: `fully merged into ${baseBranch}`, tone: "pass" });
    else if (!localBase && branch.inBase === false) value.push({ text: " · " }, { text: `${branch.notInBaseCount ?? "Some"} commit${branch.notInBaseCount === 1 ? "" : "s"} not in ${baseBranch}`, tone: "unknown" });
    const featureRow: FactRow = { label: [...label("Feature branch "), { text: repository.branch, tone: "code" }], value };

    let pushedRow: FactRow | undefined;
    const last = repository.lastPushed;
    if (last && localBase) pushedRow = { label: label(`Is this run’s pushed work in origin’s ${baseBranch}?`), value: [{ text: "Couldn’t check", tone: "unknown" }] };
    else if (last) {
      const pushed: Part[] = [{ text: `${short(last.sha)} (${last.phaseId === "pr" ? "final delivery" : last.phaseId.startsWith("audit-") ? "audit" : `Phase ${last.phaseId}`}) · ` }];
      if (last.inBase === true) pushed.push({ text: `in ${baseBranch}`, tone: "pass" });
      else if (last.onOrigin === true) { pushed.push({ text: "on origin", tone: "pass" }); if (multi && last.inBase === false) pushed.push({ text: ` · not in ${baseBranch}` }); }
      else if (last.inBase === false) pushed.push({ text: `not in ${baseBranch}`, tone: "fail" });
      else pushed.push({ text: "Couldn’t check", tone: "unknown" });
      pushedRow = { label: label("Last commit this run pushed"), value: pushed };
    }
    let recordRow: FactRow | undefined;
    if (repository.state !== "in_place" && repository.gitRecord) {
      const missing = repository.state === "missing";
      recordRow = { label: label(missing ? "Git’s record of the missing folder" : "Git’s record of the saved folder"),
        value: [{ text: repository.gitRecord === "listed" ? (missing ? "Still listed · git keeps it when a folder is deleted by hand" : "Still listed") : missing ? "None" : "None · the worktree was removed with git" }] };
    }
    const elsewhereRow: FactRow | undefined = repository.gitRecord === undefined ? undefined : { label: label("Checked out in another folder?"),
      value: branch.elsewhere ? [{ text: "Yes", tone: "unknown" }, { text: ` · ${branch.elsewhere}` }] : [{ text: repository.state === "in_place" && multi ? "No · only in its saved folder" : "No" }] };
    // One repository: what it pushed comes right after its branch; several: last, after where each branch is.
    const order = multi ? [featureRow, recordRow, elsewhereRow, pushedRow] : [featureRow, pushedRow, recordRow, elsewhereRow];
    rows.push(...order.filter((row): row is FactRow => !!row));
    for (const read of repository.unknown.filter(read => read !== `${repository.branch} on origin`)) rows.push({ label: label(`${read.charAt(0).toUpperCase()}${read.slice(1)}`), value: [{ text: "Couldn’t check", tone: "unknown" }] });
  }
  return rows;
}

/** AC-FACTS-03's standing statements. */
export function lostNote(view: FolderMissingSnapshot): string {
  const bad = failing(view);
  const gone = view.repositories.some(repository => repository.featureBranch.gone);
  const where = view.repositories.length > 1
    ? bad.map(repository => repository.state === "holds_something_else" ? `in the worktree that was at ${repository.name}’s saved path` : `in ${repository.name}’s deleted folder`).join(" or ")
    : bad[0]?.state === "holds_something_else" ? "in the worktree that was at the saved path" : "in the deleted folder";
  return `Kiln can’t recover changes that were never committed ${where}${gone ? ", nor commits on the deleted branch that were never pushed" : ""}.`;
}

/** Beside Check again: the restore command, or why there is none (AC-SETUP-06). */
export function restoreText(view: FolderMissingSnapshot): string {
  if (view.restoreCommands.length) return "Moved or removed the folder on purpose? Put it back at the saved path, then check again.";
  if (view.restoreUnknown && failing(view).some(repository => repository.state === "missing")) return view.repositories.some(repository => repository.unknown.some(read => read.endsWith(" on origin"))) ? "Moved or removed the folder on purpose? Kiln can say whether it can be put back once it can reach origin." : "Moved or removed the folder on purpose? Kiln can say whether it can be put back once it can read what it needs about the branch.";
  return "This folder can’t be put back at the saved path as it was. Sort it out yourself and check again.";
}
