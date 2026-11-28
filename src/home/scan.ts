// What the home screen lists (Kiln Requirements Stages AC-HOME-02 to 04, AC-HOME-10, 12, 13;
// technical design "What it lists"). One scan per repository reads Kiln's own records, the
// checkout and its worktrees, and Git on every local branch and every branch of origin as last
// fetched, never the wording of commit subjects, and places each item by the first row of
// AC-HOME-13's table that fits. Reads are cached by the commit they read.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, posix, resolve } from "node:path";
import { listWorktrees, runGit, type GitContext } from "../engine/git-reads.js";
import { expandHome } from "../engine/worktree-setup.js";
import { featureNameFor } from "../prd-location.js";
import { readPhasePlan, leavesOf } from "../plan/phase-plan.js";
import { readRepositoryName, sameAddressPath } from "../plan/repository-names.js";
import { recordedName } from "../engine/plan-repositories.js";
import { parseGithubOrigin } from "../github-origin.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { documentsStand, holdingByDirectory, partWayFiles, readBranchRefs, roundsNotCommitted, standsWithRound, type HoldingBranch } from "../requirements/branches.js";
import { briefName, initiativeRows, MissingContractsFile, type InitiativeRow } from "../requirements/source.js";
import type { SavedWork } from "../control/private-state.js";
import { startedBranches } from "../engine/start-from.js";
import type { RunState } from "../control/client.js";
import type { PrdRecord } from "../state/records.js";

export type HomeKind = "brief" | "intake" | "planned_prd";

export interface HomeItem {
  /** Stable across scans: the repository and the item's start path. */
  id: string;
  repository: string;
  /** The repository's main checkout, where `kiln run` for this item runs. */
  checkout: string;
  title: string;
  /** The start path `kiln run` takes for it. */
  path: string;
  /** Where the item is, shown on its line: a file, or a folder ending in `/`. */
  where: string;
  kind?: HomeKind;
  line: string;
  state?: RunState;
  address?: string;
  startedByHand?: true;
  /** The branch a PRD started by hand is read from and started on (`kiln run --branch`). */
  branch?: string;
  alsoChanges: string[];
  buildWaitsFor?: string[];
  lastChanged?: string;
  /** A review or Needs you: listed first (AC-HOME-04). */
  waitsForYou?: true;
}

export interface RepositoryScan {
  name: string;
  path: string;
  sharedBranch?: string;
  underWay: HomeItem[];
  ready: HomeItem[];
  notReady: HomeItem[];
  folded: HomeItem[];
}

export interface ScanInput {
  git: GitContext;
  repository: { name: string; path: string };
  /** Kiln's records for this repository. */
  works: SavedWork[];
  /** Each recorded run's Kiln, probed as `kiln status` probes it. */
  probe: (work: SavedWork) => Promise<{ state: RunState; address?: string; feature?: string }>;
  /** Every record under the state root, whichever repository holds its PRD: a started run's branches are no candidate for another PRD here, as `kiln run` reads them. Defaults to `works`. */
  allWorks?: SavedWork[];
}

/** Newest first, by the instant: `%cI` strings keep each committer's UTC offset, so they don't sort as text (AC-HOME-12). */
export const newestFirst = (a: { lastChanged?: string }, b: { lastChanged?: string }) => (b.lastChanged ? Date.parse(b.lastChanged) : 0) - (a.lastChanged ? Date.parse(a.lastChanged) : 0);

const cache = new Map<string, unknown>();
async function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const value = await read();
  if (cache.size > 5000) cache.clear();
  cache.set(key, value);
  return value;
}

async function text(git: GitContext, cwd: string, args: string[]): Promise<string | undefined> {
  const result = await runGit(git, cwd, args);
  return result.exitCode === 0 ? result.stdout : undefined;
}

/** The files under a path at a commit, by repository path. */
const filesAt = (git: GitContext, cwd: string, commit: string, path: string) => cached(`files\0${cwd}\0${commit}\0${path}`, async () =>
  ((await text(git, cwd, ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", commit, "--", `${path}/`])) ?? "").split("\0").filter(Boolean));
const showAt = (git: GitContext, cwd: string, commit: string, file: string) => cached(`show\0${cwd}\0${commit}\0${file}`, async () => (await text(git, cwd, ["show", `${commit}:${file}`])) ?? "");
const lastChange = (git: GitContext, cwd: string, commit: string, path: string) => cached(`date\0${cwd}\0${commit}\0${path}`, async () => (await text(git, cwd, ["log", "-1", "--format=%cI", commit, "--", path]))?.trim() || undefined);

/**
 * The repository's shared branch, read without a fetch (technical design, "The shared branch, read
 * without a fetch"): `develop` when origin has it as last fetched, else the branch origin's HEAD
 * points to. Undefined when neither is there. A recorded run's own line reads its record, never this.
 */
export async function sharedBranchOf(git: GitContext, cwd: string, remote: Set<string>): Promise<string | undefined> {
  if (remote.has("develop")) return "develop";
  const head = (await text(git, cwd, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]))?.trim();
  return head?.startsWith("refs/remotes/origin/") ? head.slice(20) : undefined;
}

const titleOf = (markdown: string, label: RegExp) => markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(label, "").trim();
const day = (iso: string | undefined) => iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : undefined;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const kindWords: Record<HomeKind, string> = { brief: "A brief", intake: "An intake record", planned_prd: "A planned PRD" };

/** A recorded run's stage, in the home line's words (AC-HOME-04). */
function recordLine(record: PrdRecord): string {
  const requirements = record.requirements;
  if (!record.startedAt) return "Not started. Review what Kiln will run, then start.";
  if (requirements && requirements.phase !== "closed") {
    const ready = requirements.review?.readySince;
    if (requirements.phase === "early_review") return `Requirements. The early stakeholder review has been ready since ${ready ? time(ready) : "the stop"}.`;
    if (requirements.phase === "final_review") return `Requirements done. The final stakeholder review has been ready since ${ready ? time(ready) : "the stop"}.`;
    // The stage running; else, between stages, the last one finished and the one the method puts next; else where the PRD stood at Start.
    // A stage finished by hand with no report and no expected stage has no title: the one before it names the stage reached.
    const lastTitle = requirements.stages.filter(stage => stage.task === "stage" && stage.pushedSha).map(stage => stage.ran.at(-1)?.title ?? stage.expected?.title).findLast(title => !!title);
    const known = requirements.standing && !("unknown" in requirements.standing) ? requirements.standing : undefined;
    const next = known?.next.title;
    const current = requirements.stages.findLast(stage => !stage.pushedSha);
    if (current) {
      const title = current.ran[0]?.title ?? current.expected?.title;
      if (title) return `Requirements. ${title}.`;
      // A session with no title of its own says the stage the PRD reached before it (AC-HOME-04).
      const reached = lastTitle ? ` Last finished: ${lastTitle}.` : requirements.standsAt ? ` ${requirements.standsAt}.` : "";
      if (current.task === "feedback") return `Requirements.${reached} Applying stakeholder feedback${next ? ` before ${next}` : ""}.`;
      if (current.task === "review") {
        const final = current.key === "kiln:final" || (current.key !== "kiln:early" && !!known?.milestones.some(one => one.name === "requirements_finished"));
        return final ? `Requirements done.${reached} Making the final stakeholder review.` : `Requirements.${reached} Making the early stakeholder review.`;
      }
      // Only the session before the first report has where the PRD stood at Start; a later one follows a stage finished by hand or a lost cursor.
      if (requirements.standsAt) return `Requirements. ${requirements.standsAt}; the first session finds the next stage.`;
      if (lastTitle) return `Requirements. Last finished: ${lastTitle}. A session finds the next stage.`;
      return requirements.stages.length > 1 ? "Requirements. A session finds the next stage." : "Requirements. The first session finds the next stage.";
    }
    if (lastTitle && next) return `Requirements. Last finished: ${lastTitle}. Next: ${next}.`;
    if (next) return `Requirements. Next: ${next}.`;
    if (lastTitle) return `Requirements. Last finished: ${lastTitle}.`;
    return requirements.standsAt ? `Requirements. ${requirements.standsAt}.` : "Requirements. The first stage hasn't begun.";
  }
  const leaves = (record.plan ?? []).filter(phase => !("splitInto" in phase) || phase.splitInto === undefined);
  const done = leaves.filter(phase => record.phases[phase.id]?.doneAt).length;
  return leaves.length ? `Build. ${done} of ${leaves.length} phases done.` : "Build.";
}

/** What an Under way line adds when its Kiln is running and its state couldn't be read (AC-HOME-05). */
const unreadable = (probe: { state: RunState; address?: string }) => probe.state === "unreadable" ? ` Kiln couldn't read its state. Its Kiln is at ${probe.address ?? "an address it didn't give"}.` : "";

/** Scans one repository (technical design, "One scan function per repository"). */
export async function scanRepository(input: ScanInput): Promise<RepositoryScan> {
  const { git, works } = input;
  const cwd = input.repository.path;
  const name = input.repository.name;
  const scan: RepositoryScan = { name, path: cwd, underWay: [], ready: [], notReady: [], folded: [] };
  const refs = await readBranchRefs(git, cwd);
  const shared = await sharedBranchOf(git, cwd, new Set(refs.remote.keys()));
  if (shared) scan.sharedBranch = shared;
  const sharedLocal = shared ? refs.local.get(shared)?.tip : undefined;
  const sharedRemote = shared ? refs.remote.get(shared)?.tip : undefined;
  const sharedRead = sharedLocal ?? sharedRemote;
  // Origin's copy is read for what the local one lacks only when origin is ahead: when it is an ancestor, pulling would bring nothing (AC-HOME-03).
  const remoteAhead = !!sharedRemote && sharedRemote !== sharedLocal && !(sharedLocal && (await runGit(git, cwd, ["merge-base", "--is-ancestor", sharedRemote, sharedLocal])).exitCode === 0);
  // The repository's own address path, to drop it from the others a PRD changes when its phase documents name it that way (AC-HOME-10).
  const originUrl = (await text(git, cwd, ["config", "--get", "remote.origin.url"]))?.trim();
  const ownGithub = originUrl ? parseGithubOrigin(originUrl) : undefined;
  const ownAddress = ownGithub ? `${ownGithub.owner}/${ownGithub.name}` : undefined;
  const item = (path: string, fields: Omit<HomeItem, "id" | "repository" | "checkout" | "path" | "alsoChanges"> & { alsoChanges?: string[] }): HomeItem => ({ id: `${name}:${path}`, repository: name, checkout: cwd, path, alsoChanges: [], ...fields });

  // The names written on any branch: a PRD or initiative folder of the material's name hides it (AC-HOME-13, first row).
  const tips = [...new Set([...refs.local.values(), ...refs.remote.values()].map(ref => ref.tip))];
  // Each folder, with the first tip it was found on: with no shared branch known, that is the copy a PRD is read from.
  const written = new Map<string, string>();
  for (const tip of tips) {
    const listed = await cached(`dirs\0${cwd}\0${tip}`, async () => ((await text(git, cwd, ["ls-tree", "-d", "--name-only", tip, "--", "docs/prds/", "docs/changes/", "docs/initiatives/"])) ?? "").split("\n").filter(Boolean));
    for (const path of listed) if (!written.has(path)) written.set(path, tip);
  }
  const writtenName = (folder: string) => written.has(`docs/prds/${folder}`) || written.has(`docs/changes/${folder}`) || written.has(`docs/initiatives/${folder}`);
  const startedFrom = (path: string) => works.some(work => work.record.origin?.path === path && (work.record.startedAt !== undefined || !!work.record.prdDirectory));

  // Ready only when the checkout's copy of the folder is the local shared branch's commit, as the requirements start checks require (AC-HOME-03).
  const uncommitted = async (path: string): Promise<string | undefined> => {
    const dirty = await text(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", path]);
    if (dirty) return `Changes under ${path}/ aren't committed on ${shared}. Commit them there and it moves up.`;
    const differs = await text(git, cwd, ["--literal-pathspecs", "diff", "--name-only", sharedLocal!, "--", path]);
    return differs ? `The checkout's copy of ${path}/ differs from ${shared}'s. Commit the source material on ${shared} and it moves up.` : undefined;
  };

  // ---- Source material under source-material/ ------------------------------------------
  const sourceFolders = new Map<string, { local: string[]; remote: string[]; checkout: string[] }>();
  const add = (folder: string, where: "local" | "remote" | "checkout", file: string) => {
    const entry = sourceFolders.get(folder) ?? { local: [], remote: [], checkout: [] };
    entry[where].push(file);
    sourceFolders.set(folder, entry);
  };
  for (const [where, tip] of [["local", sharedLocal], ["remote", remoteAhead ? sharedRemote : undefined]] as const) {
    if (!tip) continue;
    for (const file of await filesAt(git, cwd, tip, "source-material")) {
      const parts = file.split("/");
      if (parts.length >= 3) add(parts[1]!, where, parts.slice(2).join("/"));
    }
  }
  // The checkout and its worktrees, for files not yet committed; every other branch, for material committed off the shared branch.
  const listedWorktrees = await listWorktrees(git, cwd);
  const onDisk = new Set<string>();
  for (const worktree of listedWorktrees.ok ? listedWorktrees.worktrees.map(one => one.path) : [cwd]) {
    const sourceRoot = join(worktree, "source-material");
    if (existsSync(sourceRoot)) for (const folder of readdirSync(sourceRoot)) {
      const path = join(sourceRoot, folder);
      try { if (!statSync(path).isDirectory()) continue; } catch { continue; }
      for (const file of readdirSync(path)) add(folder, "checkout", file);
      onDisk.add(folder);
    }
  }
  const elsewhere = new Map<string, string>();
  for (const ref of [...refs.local.values(), ...refs.remote.values()]) {
    if (ref.name === shared || ref.tip === sharedLocal || ref.tip === sharedRemote) continue;
    const first = new Map<string, string>();
    for (const file of await filesAt(git, cwd, ref.tip, "source-material")) {
      const parts = file.split("/");
      if (parts.length < 3 || elsewhere.has(parts[1]!) && elsewhere.get(parts[1]!) !== ref.name) continue;
      add(parts[1]!, "checkout", parts.slice(2).join("/"));
      first.set(parts[1]!, ref.name);
    }
    for (const [folder, branch] of first) if (!elsewhere.has(folder)) elsewhere.set(folder, branch);
  }
  for (const [folder, found] of sourceFolders) {
    const path = `source-material/${folder}`;
    if (startedFrom(path) || writtenName(folder)) continue;
    const brief = briefName(folder);
    const intake = `${folder}-requirements-intake.md`;
    const named = (files: string[]) => files.includes(brief) ? brief : files.includes(intake) ? intake : undefined;
    const received = [...found.local, ...found.remote, ...found.checkout].some(file => file === "received" || file.startsWith("received/"));
    const local = named(found.local);
    const remote = named(found.remote);
    const checkout = named(found.checkout);
    // Any other folder under source-material/ is not listed (AC-HOME-13).
    if (!local && !remote && !checkout && !received) continue;
    const words = featureNameFor(folder);
    if (!shared) { scan.notReady.push(item(path, { title: words, where: `${path}/`, line: "Kiln can't tell the shared branch. Run git remote set-head origin --auto, and this is placed." })); continue; }
    // A folder holding received/ with no intake record on the local shared branch is an intake not finished, even beside a brief: the first row that fits is Not ready yet, with the one step left (HOME-004, AC-HOME-03).
    if (received && !found.local.includes(intake)) {
      const record = `${path}/${intake}`;
      const onBranch = async () => { for (const ref of [...refs.local.values(), ...refs.remote.values()]) if (ref.name !== shared && ref.tip !== sharedLocal && ref.tip !== sharedRemote && (await filesAt(git, cwd, ref.tip, "source-material")).includes(record)) return ref.name; return undefined; };
      const inWorktree = worktreePathsOf(listedWorktrees, cwd).some(worktree => existsSync(join(worktree, record)));
      const branchHolding = await onBranch();
      const line = found.remote.includes(intake) ? `Its intake record is committed on origin's ${shared} only. Bring your local ${shared} up to date and it moves up.`
        : inWorktree || branchHolding ? `Its intake record isn't committed on ${shared}${branchHolding ? `, only on ${branchHolding}` : ""}. Commit ${record} there and it moves up.`
        : `Material brought in under received/${found.local.length || found.remote.length || onDisk.has(folder) || !elsewhere.has(folder) ? "" : `, only on ${elsewhere.get(folder)}`}, and its intake record isn't written yet. When it is, this moves up.`;
      scan.notReady.push(item(path, { title: words, where: `${path}/`, line }));
      continue;
    }
    if (local && sharedLocal) {
      const kind: HomeKind = local === brief ? "brief" : "intake";
      const step = await uncommitted(path);
      if (step) { scan.notReady.push(item(path, { title: words, where: `${path}/`, kind, line: step })); continue; }
      const markdown = await showAt(git, cwd, sharedLocal, `${path}/${local}`);
      scan.ready.push(item(path, { title: titleOf(markdown, /^(?:brief|requirements intake):\s*/i) ?? words, where: `${path}/${local}`, kind, line: "" }));
      continue;
    }
    if (remote) scan.notReady.push(item(path, { title: words, where: `${path}/`, kind: remote === brief ? "brief" : "intake", line: `Committed on origin's ${shared} only. Bring your local ${shared} up to date and it moves up.` }));
    else if (checkout) scan.notReady.push(item(path, { title: words, where: `${path}/`, kind: checkout === brief ? "brief" : "intake", line: `${checkout === brief ? kindWords.brief : kindWords.intake} not yet committed on ${shared}${elsewhere.has(folder) && !onDisk.has(folder) ? `, only on ${elsewhere.get(folder)}` : ""}. Commit it there and it moves up.` }));
  }

  // ---- Planned PRDs, read from the shared branch only -----------------------------------
  // Each initiative's PRD list at a tip, its rows or the reason they can't be read.
  const initiativesAt = async (tip: string) => {
    const found: { initiative: string; folder: string; list: string; heading: string; rows?: InitiativeRow[]; problem?: string; contract?: string }[] = [];
    const names = new Set((await filesAt(git, cwd, tip, "docs/initiatives")).map(file => file.split("/")[2]).filter((one): one is string => !!one));
    for (const initiative of names) {
      const folder = `docs/initiatives/${initiative}`;
      const list = `${folder}/${initiative}-initiative-prds.md`;
      const markdown = await showAt(git, cwd, tip, list);
      if (!markdown) continue;
      const heading = titleOf(markdown, /(?:\s+[—–-]\s+|\s+)Initiative PRDs$/i) ?? featureNameFor(initiative);
      try { found.push({ initiative, folder, list, heading, rows: await cached(`rows\0${cwd}\0${tip}\0${list}`, () => initiativeRows(git, cwd, tip, folder, markdown)) }); }
      catch (error) { found.push({ initiative, folder, list, heading, problem: (error as Error).message, ...(error instanceof MissingContractsFile ? { contract: error.contract } : {}) }); }
    }
    return found;
  };
  // A planned PRD with a PRD written from it: Kiln started it, or the folder its row names, or an initiative of that name other than its own, is on a branch (AC-HOME-13).
  const plannedWritten = (row: InitiativeRow, initiative: string, path: string) => startedFrom(path)
    || row.fromLine && (written.has(`docs/prds/${row.directory}`) || written.has(`docs/changes/${row.directory}`) || row.directory !== initiative && written.has(`docs/initiatives/${row.directory}`));
  const behind = `Committed on origin's ${shared} only. Bring your local ${shared} up to date and it moves up.`;
  const readLocal = sharedLocal ? await initiativesAt(sharedLocal) : [];
  // Read from the local shared branch, as `kiln run` reads it; what only origin's copy holds is one step from ready (AC-HOME-03).
  const readRemote = remoteAhead ? await initiativesAt(sharedRemote!) : [];
  // Every row the local list holds, whatever its status: the local list is the one `kiln run` reads.
  const listed = new Set<string>(readLocal.flatMap(one => (one.rows ?? []).filter(row => row.status !== "planned").map(row => `${one.folder}/${row.directory}`)));
  // A contracts file the local list links and only origin's copy holds: origin's clean read places the rows, one pull from ready (AC-HOME-03).
  const pulledContract = (folder: string) => readLocal.some(other => other.folder === folder && other.contract) && readRemote.some(other => other.folder === folder && other.rows);
  for (const [found, local] of [[readLocal, true], [readRemote, false]] as const) {
    for (const one of found) {
      if (local && one.contract && pulledContract(one.folder)) continue;
      if (!local && one.problem && readLocal.some(other => other.folder === one.folder)) continue;
      if (!local && !pulledContract(one.folder) && readLocal.some(other => other.folder === one.folder && other.problem)) continue;
      if (one.problem) {
        if (!listed.has(one.folder)) scan.notReady.push(item(one.folder, { title: one.heading, where: one.list, line: local ? `${one.problem} Its planned PRDs appear once it is.` : behind }));
        listed.add(one.folder);
        continue;
      }
      const rows = one.rows!;
      const step = local ? await uncommitted(one.folder) : undefined;
      for (const row of rows.filter(entry => entry.status === "planned")) {
        const path = `${one.folder}/${row.directory}`;
        if (listed.has(path) || plannedWritten(row, one.initiative, path)) continue;
        listed.add(path);
        const title = `${one.heading}: ${row.name}`;
        if (!local || step) { scan.notReady.push(item(path, { title, where: one.list, kind: "planned_prd", line: step ?? behind })); continue; }
        // Its build waits for each PRD it depends on that the initiative doesn't mark in production (AC-HOME-02).
        const waits = row.dependsOn.filter(dependency => !rows.find(other => other.name.toLowerCase() === dependency.toLowerCase())?.status.startsWith("in production"));
        scan.ready.push(item(path, { title, where: one.list, kind: "planned_prd", line: waits.length ? `Its build waits for ${waits.join(", ")}.` : "", ...(waits.length ? { buildWaitsFor: waits } : {}) }));
      }
    }
  }
  // An initiative list only in the checkout or a worktree, or committed only on another branch: each planned row it adds is one commit from ready (AC-HOME-03, AC-HOME-13 row 2).
  if (shared) {
    const copies: { list: string; folder: string; initiative: string; markdown: string; ref: string; on?: string }[] = [];
    for (const worktree of worktreePathsOf(listedWorktrees, cwd)) {
      const root = join(worktree, "docs", "initiatives");
      if (!existsSync(root)) continue;
      for (const initiative of readdirSync(root)) {
        const list = `docs/initiatives/${initiative}/${initiative}-initiative-prds.md`;
        const file = join(worktree, list);
        if (existsSync(file)) copies.push({ list, folder: posix.dirname(list), initiative, markdown: readFileSync(file, "utf8"), ref: sharedLocal ?? sharedRemote ?? "HEAD" });
      }
    }
    for (const ref of [...refs.local.values(), ...refs.remote.values()]) {
      if (ref.name === shared || ref.tip === sharedLocal || ref.tip === sharedRemote) continue;
      for (const file of await filesAt(git, cwd, ref.tip, "docs/initiatives")) {
        const [, , initiative, fileName] = file.split("/");
        if (!initiative || fileName !== `${initiative}-initiative-prds.md`) continue;
        copies.push({ list: file, folder: posix.dirname(file), initiative, markdown: await showAt(git, cwd, ref.tip, file), ref: ref.tip, on: ref.name });
      }
    }
    for (const copy of copies) {
      const committed = [...readLocal, ...readRemote].find(one => one.folder === copy.folder);
      if (committed?.problem) continue;
      const heading = titleOf(copy.markdown, /(?:\s+[—–-]\s+|\s+)Initiative PRDs$/i) ?? featureNameFor(copy.initiative);
      const step = `Its initiative's PRD list isn't committed on ${shared}${copy.on ? `, only on ${copy.on}` : ""}. Commit ${copy.list} there and it moves up.`;
      let rows: InitiativeRow[];
      try { rows = await cached(`rows\0${cwd}\0${copy.ref}\0${copy.list}\0${copy.markdown}`, () => initiativeRows(git, cwd, copy.ref, copy.folder, copy.markdown)); }
      catch {
        // Its rows can't be read until what it links is committed too: the list is one line, one step from ready.
        if (!committed && !listed.has(copy.folder)) { listed.add(copy.folder); scan.notReady.push(item(copy.folder, { title: heading, where: copy.list, line: step })); }
        continue;
      }
      for (const row of rows.filter(entry => entry.status === "planned")) {
        const path = `${copy.folder}/${row.directory}`;
        if (listed.has(path) || committed?.rows?.some(other => other.directory === row.directory) || plannedWritten(row, copy.initiative, path)) continue;
        listed.add(path);
        scan.notReady.push(item(path, { title: `${heading}: ${row.name}`, where: copy.list, kind: "planned_prd", line: step }));
      }
    }
  }

  // ---- PRDs -----------------------------------------------------------------------------
  // A run Kiln started and hasn't finished. A record never started, which `kiln run` writes before Start, or one whose run completed, places nothing: the files do (technical design, "Kiln started a PRD from it").
  const running = (record: PrdRecord) => record.startedAt !== undefined && !record.completedAt;
  // A started run's branches are no candidate for another PRD, as `kiln run` reads them: completed runs, branch stems and earlier executions included (AC-HOME-13).
  // Matched as `kiln run` matches them (its startContext), so both exclude the same branches.
  const here = resolve(cwd);
  const runBranches = (input.allWorks ?? works).flatMap(work => (work.record.repositories.some(entry => resolve(expandHome(entry.mainCheckoutPath)) === here) ? startedBranches(work.record) : []).map(branch => ({ branch, work })));
  const heldAll = shared ? await holdingByDirectory(git, cwd, shared, new Set(), refs) : new Map<string, HoldingBranch[]>();
  const ownWork = (directory: string) => works.find(one => one.record.prdDirectory === directory || one.record.origin?.path === directory);
  const holding = new Map([...heldAll].map(([directory, list]) => [directory, list.filter(one => !runBranches.some(other => other.branch === one.name && other.work !== ownWork(directory)))] as const));
  const dirsAt = async (tip: string | undefined) => new Set(tip ? ((await text(git, cwd, ["ls-tree", "-d", "--name-only", tip, "--", "docs/prds/", "docs/changes/"])) ?? "").split("\n").filter(Boolean) : []);
  const onShared = await dirsAt(sharedRead);
  // A PRD only origin's copy of the shared branch holds, the local one being behind: placed from origin's copy, with the step `kiln run` needs (AC-HOME-04, AC-HOME-12).
  const onOrigin = remoteAhead ? await dirsAt(sharedRemote) : new Set<string>();
  // With no shared branch known, every PRD folder on any branch is found, to say why it isn't placed (AC-HOME-04).
  const unplaced = shared ? [] : [...written.keys()].filter(path => /^docs\/(?:prds|changes)\/[^/]+$/.test(path));
  const directories = new Set<string>([...onShared, ...onOrigin, ...holding.keys(), ...unplaced, ...works.map(work => work.record.prdDirectory).filter((one): one is string => !!one)]);
  const worktreePaths = worktreePathsOf(listedWorktrees, cwd);
  for (const directory of directories) {
    const folder = posix.basename(directory);
    const work = ownWork(directory);
    const record = work?.record;
    const started = record && running(record) ? record : undefined;
    const branches = holding.get(directory) ?? [];
    const branch = !started ? branches[0] : undefined;
    // Which copy is read: the run's worktree, else the newest branch that holds it, else the shared branch.
    const saved = started?.repositories.find(entry => entry.kind === "prd")?.worktreePath ?? started?.settings.worktreePath;
    const worktree = saved ? expandHome(saved) : undefined;
    const fromWorktree = !!started && !!worktree && existsSync(join(worktree, directory));
    const behindOnly = !started && !branch && !onShared.has(directory) && onOrigin.has(directory);
    const commit = branch?.tip ?? (behindOnly ? sharedRemote : sharedRead) ?? written.get(directory);
    const pull = behindOnly ? ` Committed on origin's ${shared} only. Bring your local ${shared} up to date to open it.` : "";
    const listAt = async (tip: string) => (await filesAt(git, cwd, tip, directory)).filter(file => posix.dirname(file) === directory).map(file => posix.basename(file));
    const names = fromWorktree ? readdirSync(join(worktree!, directory)) : commit ? await listAt(commit) : [];
    if (!names.includes(`${folder}-prd.md`) && !started) continue;
    const read = (fileName: string) => fromWorktree ? (existsSync(join(worktree!, directory, fileName)) ? readFileSync(join(worktree!, directory, fileName), "utf8") : "") : commit ? showAt(git, cwd, commit, `${directory}/${fileName}`) : "";
    const title = titleOf(await read(`${folder}-prd.md`), /^PRD:\s*/i) ?? featureNameFor(folder);
    const byHand = record?.completedAt ? {} : { startedByHand: true as const };
    const phaseNames = names.filter(isPhaseFileName);
    let open = false;
    let built: string | undefined;
    let repositories: string[] = [];
    if (phaseNames.length && (fromWorktree || commit)) {
      const plan = readPhasePlan(await Promise.all(phaseNames.map(async fileName => ({ fileName, markdown: await read(fileName) }))));
      const leaves = leavesOf(plan);
      open = leaves.some(leaf => !leaf.closed);
      built = `Phase plan of ${leaves.length}, ${leaves.filter(leaf => leaf.closed).length} built`;
      // Every phase document's **Repositories:** line, split records included (AC-HOME-10).
      repositories = plan.phases.flatMap(phase => phase.repositories);
    }
    // Each name as Kiln names the repository, as the engine does, so the PRD's own and a repository written two ways drop out (AC-HOME-10).
    const kilnName = (written: string) => {
      if (started) return recordedName(started, written);
      const read = readRepositoryName(written);
      if (read.kind !== "path") return written;
      return ownAddress && sameAddressPath(read.addressPath, ownAddress) ? name : read.addressPath.toLowerCase();
    };
    const own = new Set([name, ...(started ? [started.repository.name] : [])]);
    const alsoChanges = [...new Set([...(started ? started.repositories.filter(entry => entry.kind !== "prd").map(entry => entry.name) : []), ...repositories.map(kilnName)])].filter(one => !own.has(one));
    if (!shared && !started) {
      scan.notReady.push(item(directory, { title, where: `${directory}/`, line: "Kiln can't tell the shared branch. Run git remote set-head origin --auto, and this is placed.", ...byHand, alsoChanges }));
      continue;
    }
    // The method's files for a refinement in progress or feedback not yet applied, in any worktree or committed.
    const present = (file: string) => names.includes(file) || worktreePaths.some(path => existsSync(join(path, directory, file)));
    const inProgress = partWayFiles(folder).some(([file]) => present(file));
    // Documents only on a branch that hasn't merged: the PRD itself, or a later document the shared branch doesn't have yet (AC-HOME-13).
    const sharedNames = new Set(sharedRead && onShared.has(directory) ? await listAt(sharedRead) : []);
    const onlyOnBranch = !!branch && (!onShared.has(directory) || names.some(file => !sharedNames.has(file)));
    // Every phase built, with nothing under way: not listed. Under way's row comes first (AC-HOME-13).
    if (phaseNames.length && !open && !started && !inProgress && !onlyOnBranch) continue;
    const lastChanged = commit ? await lastChange(git, cwd, commit, directory) : undefined;
    if (started) {
      const probe = await input.probe(work!);
      const waitsForYou = probe.state === "waiting_for_you" || !probe.feature && (started.requirements?.phase === "early_review" || started.requirements?.phase === "final_review" || Object.values(started.phases).some(facts => !!facts.stop));
      scan.underWay.push(item(started.origin?.path ?? directory, { title: started.featureName, where: `${directory}/`, line: recordLine(started) + unreadable(probe), state: probe.state, ...(probe.address ? { address: probe.address } : {}), alsoChanges, ...(lastChanged ? { lastChanged } : {}), ...(waitsForYou ? { waitsForYou: true } : {}) }));
      continue;
    }
    // The round part-way through is named; with its work not committed, `kiln run` refuses the start until it finishes or stops (AC-HOME-04, AC-BEGIN-04).
    // With work not committed, the round named is the one that holds the start back.
    const notCommitted = inProgress ? new Set((await roundsNotCommitted(git, cwd, directory)).map(one => one.file)) : new Set<string>();
    const held = notCommitted.size > 0;
    const stands = standsWithRound(built ?? documentsStand(names, folder), held ? file => notCommitted.has(file) : present, folder);
    const live = work ? await input.probe(work) : undefined;
    if (open || inProgress || onlyOnBranch) {
      const on = branch ? `, on the branch ${branch.name}, not merged yet` : "";
      const next = held ? " Its work isn't committed: finish that round or stop it, and Kiln continues from there." : built ? "" : stands.startsWith("PRD written") ? " Kiln continues from there, with the early review once the PRD is refined." : " Kiln continues from there.";
      scan.underWay.push(item(directory, { title, where: `${directory}/`, line: `${record?.completedAt ? "Kiln's run finished" : "Started by hand"}${on}. ${stands}.${next}${pull}${live ? unreadable(live) : ""}`, state: live?.state ?? "not_running", ...(live?.address ? { address: live.address } : {}), ...byHand, ...(branch ? { branch: branch.name } : {}), alsoChanges, ...(lastChanged ? { lastChanged } : {}), ...(live?.state === "waiting_for_you" ? { waitsForYou: true as const } : {}) }));
      continue;
    }
    scan.folded.push(item(directory, { title, where: `${directory}/`, line: `${stands}.${lastChanged ? ` Last changed ${day(lastChanged)}.` : ""}${pull}`, ...byHand, alsoChanges, ...(lastChanged ? { lastChanged } : {}) }));
  }

  // A run from source material whose PRD isn't written yet is an Under way line of its own.
  for (const work of works) {
    const record = work.record;
    if (!record.origin || record.prdDirectory || record.startedAt === undefined || record.completedAt) continue;
    const probe = await input.probe(work);
    scan.underWay.push(item(record.origin.path, { title: record.origin.title, where: `${record.origin.path}/`, line: recordLine(record) + unreadable(probe), state: probe.state, ...(probe.address ? { address: probe.address } : {}), ...(probe.state === "waiting_for_you" || Object.values(record.phases).some(facts => !!facts.stop) ? { waitsForYou: true } : {}) }));
  }
  scan.underWay.sort((a, b) => Number(!!b.waitsForYou) - Number(!!a.waitsForYou) || newestFirst(a, b));
  scan.folded.sort(newestFirst);
  return scan;
}

const worktreePathsOf = (listed: Awaited<ReturnType<typeof listWorktrees>>, cwd: string) => listed.ok ? listed.worktrees.map(one => one.path) : [cwd];

/** The repositories a scope covers: the one it was run in, or each repository directly inside a folder that isn't one (AC-HOME-08, AC-HOME-09). */
export function repositoriesIn(folder: string): { name: string; path: string }[] {
  const found: { name: string; path: string }[] = [];
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    try { if (statSync(path).isDirectory() && existsSync(join(path, ".git"))) found.push({ name: basename(path), path }); } catch { /* Unreadable: skipped. */ }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
