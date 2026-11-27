// What the home screen lists (Kiln Requirements Stages AC-HOME-02 to 04, AC-HOME-10, 12, 13;
// technical design "What it lists"). One scan per repository reads Kiln's own records, the
// checkout and its worktrees, and Git on every local branch and every branch of origin as last
// fetched, never the wording of commit subjects, and places each item by the first row of
// AC-HOME-13's table that fits. Reads are cached by the commit they read.

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, posix } from "node:path";
import { listWorktrees, runGit, type GitContext } from "../engine/git-reads.js";
import { expandHome } from "../engine/worktree-setup.js";
import { featureNameFor } from "../prd-location.js";
import { readPhasePlan, leavesOf } from "../plan/phase-plan.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { documentsStand, holdingByDirectory, readBranchRefs, type HoldingBranch } from "../requirements/branches.js";
import { briefName, initiativeRows } from "../requirements/source.js";
import type { SavedWork } from "../control/private-state.js";
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
}

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
    const current = requirements.stages.findLast(stage => !stage.pushedSha);
    const title = current?.ran[0]?.title ?? current?.expected?.title;
    return title ? `Requirements. ${title}.` : "Requirements.";
  }
  const leaves = (record.plan ?? []).filter(phase => !("splitInto" in phase) || phase.splitInto === undefined);
  const done = leaves.filter(phase => record.phases[phase.id]?.doneAt).length;
  return leaves.length ? `Build. ${done} of ${leaves.length} phases done.` : "Build.";
}

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
  const item = (path: string, fields: Omit<HomeItem, "id" | "repository" | "checkout" | "path" | "alsoChanges"> & { alsoChanges?: string[] }): HomeItem => ({ id: `${name}:${path}`, repository: name, checkout: cwd, path, alsoChanges: [], ...fields });

  // The names written on any branch: a PRD or initiative folder of the material's name hides it (AC-HOME-13, first row).
  const tips = [...new Set([...refs.local.values(), ...refs.remote.values()].map(ref => ref.tip))];
  const written = new Set<string>();
  for (const tip of tips) {
    const listed = await cached(`dirs\0${cwd}\0${tip}`, async () => ((await text(git, cwd, ["ls-tree", "-d", "--name-only", tip, "--", "docs/prds/", "docs/changes/", "docs/initiatives/"])) ?? "").split("\n").filter(Boolean));
    for (const path of listed) written.add(path);
  }
  const writtenName = (folder: string) => written.has(`docs/prds/${folder}`) || written.has(`docs/changes/${folder}`) || written.has(`docs/initiatives/${folder}`);
  const startedFrom = (path: string) => works.some(work => work.record.origin?.path === path && (work.record.startedAt !== undefined || !!work.record.prdDirectory));

  // ---- Source material under source-material/ ------------------------------------------
  const sourceFolders = new Map<string, { local: string[]; remote: string[]; checkout: string[] }>();
  const add = (folder: string, where: "local" | "remote" | "checkout", file: string) => {
    const entry = sourceFolders.get(folder) ?? { local: [], remote: [], checkout: [] };
    entry[where].push(file);
    sourceFolders.set(folder, entry);
  };
  for (const [where, tip] of [["local", sharedLocal], ["remote", sharedRemote]] as const) {
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
    for (const file of await filesAt(git, cwd, ref.tip, "source-material")) {
      const parts = file.split("/");
      if (parts.length === 3 && !elsewhere.has(parts[1]!)) { add(parts[1]!, "checkout", parts[2]!); elsewhere.set(parts[1]!, ref.name); }
    }
  }
  for (const [folder, found] of sourceFolders) {
    const path = `source-material/${folder}`;
    if (startedFrom(path) || writtenName(folder)) continue;
    const brief = briefName(folder);
    const intake = `${folder}-requirements-intake.md`;
    const named = (files: string[]) => files.includes(brief) ? brief : files.includes(intake) ? intake : undefined;
    const received = [...found.local, ...found.checkout].some(file => file === "received" || file.startsWith("received/"));
    const local = named(found.local);
    if (local && sharedLocal) {
      const markdown = await showAt(git, cwd, sharedLocal, `${path}/${local}`);
      const kind: HomeKind = local === brief ? "brief" : "intake";
      scan.ready.push(item(path, { title: titleOf(markdown, /^(?:brief|requirements intake):\s*/i) ?? featureNameFor(folder), where: `${path}/${local}`, kind, line: "" }));
      continue;
    }
    const words = featureNameFor(folder);
    if (!shared) { scan.notReady.push(item(path, { title: words, where: `${path}/`, line: "Kiln can't tell the shared branch. Run git remote set-head origin --auto, and this is placed." })); continue; }
    const remote = named(found.remote);
    const checkout = named(found.checkout);
    if (remote) scan.notReady.push(item(path, { title: words, where: `${path}/`, kind: remote === brief ? "brief" : "intake", line: `Committed on origin's ${shared} only. Bring your local ${shared} up to date and it moves up.` }));
    else if (checkout) scan.notReady.push(item(path, { title: words, where: `${path}/`, kind: checkout === brief ? "brief" : "intake", line: `${checkout === brief ? kindWords.brief : kindWords.intake} not yet committed on ${shared}${elsewhere.has(folder) && !onDisk.has(folder) ? `, only on ${elsewhere.get(folder)}` : ""}. Commit it there and it moves up.` }));
    // A folder holding the method's received/ and no intake record is an intake not finished (HOME-004).
    else if (received) scan.notReady.push(item(path, { title: words, where: `${path}/`, line: "Material brought in under received/, and its intake record isn't written yet. When it is, this moves up." }));
  }

  // ---- Planned PRDs, read from the shared branch only -----------------------------------
  if (sharedRead) {
    const initiatives = new Set((await filesAt(git, cwd, sharedRead, "docs/initiatives")).map(file => file.split("/")[2]).filter((one): one is string => !!one));
    for (const initiative of initiatives) {
      const folder = `docs/initiatives/${initiative}`;
      const list = `${folder}/${initiative}-initiative-prds.md`;
      const markdown = await showAt(git, cwd, sharedRead, list);
      if (!markdown) continue;
      let rows;
      try { rows = await cached(`rows\0${cwd}\0${sharedRead}\0${list}`, () => initiativeRows(git, cwd, sharedRead, folder, markdown)); }
      catch (error) { scan.notReady.push(item(folder, { title: featureNameFor(initiative), where: list, line: `${(error as Error).message} Its planned PRDs appear once it is.` })); continue; }
      const heading = titleOf(markdown, /(?:\s+[—–-]\s+|\s+)Initiative PRDs$/i) ?? featureNameFor(initiative);
      for (const row of rows.filter(one => one.status === "planned")) {
        const path = `${folder}/${row.directory}`;
        if (startedFrom(path) || row.fromLine && (written.has(`docs/prds/${row.directory}`) || written.has(`docs/changes/${row.directory}`))) continue;
        // Its build waits for each PRD it depends on that the initiative doesn't mark in production (AC-HOME-02).
        const waits = row.dependsOn.filter(dependency => !rows.find(other => other.name.toLowerCase() === dependency.toLowerCase())?.status.startsWith("in production"));
        scan.ready.push(item(path, { title: `${heading}: ${row.name}`, where: list, kind: "planned_prd", line: waits.length ? `Its build waits for ${waits.join(", ")}.` : "", ...(waits.length ? { buildWaitsFor: waits } : {}) }));
      }
    }
  }

  // ---- PRDs -----------------------------------------------------------------------------
  const exclude = new Set(works.filter(work => work.record.startedAt !== undefined || work.record.repositories.some(entry => entry.setupCompletedAt !== undefined)).map(work => work.record.settings.featureBranch));
  const holding = shared ? await holdingByDirectory(git, cwd, shared, exclude, refs) : new Map<string, HoldingBranch[]>();
  const onShared = new Set(sharedRead ? ((await text(git, cwd, ["ls-tree", "-d", "--name-only", sharedRead, "--", "docs/prds/", "docs/changes/"])) ?? "").split("\n").filter(Boolean) : []);
  const directories = new Set<string>([...onShared, ...holding.keys(), ...works.map(work => work.record.prdDirectory).filter((one): one is string => !!one)]);
  const worktreePaths = listedWorktrees.ok ? listedWorktrees.worktrees.map(one => one.path) : [cwd];
  for (const directory of directories) {
    const folder = posix.basename(directory);
    const work = works.find(one => one.record.prdDirectory === directory || one.record.origin?.path === directory);
    const record = work?.record;
    if (record?.completedAt) continue;
    const branches = holding.get(directory) ?? [];
    const branch = !record ? branches[0] : undefined;
    // Which copy is read: the run's worktree, else the newest branch that holds it, else the shared branch.
    const saved = record?.repositories.find(entry => entry.kind === "prd")?.worktreePath ?? record?.settings.worktreePath;
    const worktree = saved ? expandHome(saved) : undefined;
    const fromWorktree = record?.startedAt !== undefined && worktree && existsSync(join(worktree, directory));
    const commit = branch?.tip ?? sharedRead;
    const names = fromWorktree ? readdirSync(join(worktree, directory)) : commit ? (await filesAt(git, cwd, commit, directory)).filter(file => posix.dirname(file) === directory).map(file => posix.basename(file)) : [];
    if (!names.includes(`${folder}-prd.md`) && !record) continue;
    const phaseNames = names.filter(isPhaseFileName);
    let open = false;
    let built: string | undefined;
    let repositories: string[] = [];
    if (phaseNames.length && !fromWorktree && commit) {
      const plan = readPhasePlan(await Promise.all(phaseNames.map(async fileName => ({ fileName, markdown: await showAt(git, cwd, commit, `${directory}/${fileName}`) }))));
      const leaves = leavesOf(plan);
      open = leaves.some(leaf => !leaf.closed);
      built = `Phase plan of ${leaves.length}, ${leaves.filter(leaf => leaf.closed).length} built`;
      repositories = [...new Set(leaves.flatMap(leaf => leaf.repositories))].filter(one => one !== name);
    }
    // The method's files for a refinement in progress or feedback not yet applied, in any worktree or committed.
    const inProgress = [`${folder}-prd-refinement-state.md`, `${folder}-design-refinement-state.md`, `${folder}-pending-feedback-changes.md`].some(file => names.includes(file) || worktreePaths.some(path => existsSync(join(path, directory, file))));
    const onlyOnBranch = branches.length > 0 && !onShared.has(directory);
    // Every phase built, with nothing under way: not listed. Under way's row comes first (AC-HOME-13).
    if (phaseNames.length && !open && !record && !inProgress && !onlyOnBranch) continue;
    const lastChanged = commit ? await lastChange(git, cwd, commit, directory) : undefined;
    const alsoChanges = record ? record.repositories.filter(entry => entry.kind !== "prd").map(entry => entry.name) : repositories;
    // A record never started, which `kiln run` writes before Start, places nothing: the files do (technical design, "Kiln started a PRD from it").
    if (record?.startedAt !== undefined) {
      const probe = await input.probe(work!);
      const waitsForYou = probe.state === "waiting_for_you" || !probe.feature && (record.requirements?.phase === "early_review" || record.requirements?.phase === "final_review" || Object.values(record.phases).some(facts => !!facts.stop));
      const unreadable = probe.state === "unreadable" ? ` Kiln couldn't read its state. Its Kiln is at ${probe.address ?? "an address it didn't give"}.` : "";
      scan.underWay.push(item(record.origin?.path ?? directory, { title: record.featureName, where: `${directory}/`, line: recordLine(record) + unreadable, state: probe.state, ...(probe.address ? { address: probe.address } : {}), alsoChanges, ...(lastChanged ? { lastChanged } : {}), ...(waitsForYou ? { waitsForYou: true } : {}) }));
      continue;
    }
    const title = titleOf(commit ? await showAt(git, cwd, commit, `${directory}/${folder}-prd.md`) : "", /^PRD:\s*/i) ?? featureNameFor(folder);
    const stands = built ?? documentsStand(names, folder);
    const live = work ? await input.probe(work) : undefined;
    const unread = live?.state === "unreadable" ? ` Kiln couldn't read its state. Its Kiln is at ${live.address ?? "an address it didn't give"}.` : "";
    const byHand = work ? {} : { startedByHand: true as const };
    if (open || inProgress || onlyOnBranch) {
      const on = branch ? `, on the branch ${branch.name}, not merged yet` : "";
      const next = built ? "" : stands.startsWith("PRD written") ? " Kiln continues from there, with the early review once the PRD is refined." : " Kiln continues from there.";
      scan.underWay.push(item(directory, { title, where: `${directory}/`, line: `${work ? "Not started" : "Started by hand"}${on}. ${stands}.${next}${unread}`, state: live?.state ?? "not_running", ...(live?.address ? { address: live.address } : {}), ...byHand, ...(branch ? { branch: branch.name } : {}), alsoChanges, ...(lastChanged ? { lastChanged } : {}) }));
      continue;
    }
    scan.folded.push(item(directory, { title, where: `${directory}/`, line: `${stands}.${lastChanged ? ` Last changed ${day(lastChanged)}.` : ""}`, ...byHand, alsoChanges, ...(lastChanged ? { lastChanged } : {}) }));
  }

  // A run from source material whose PRD isn't written yet is an Under way line of its own.
  for (const work of works) {
    const record = work.record;
    if (!record.origin || record.prdDirectory || record.startedAt === undefined || record.completedAt) continue;
    const probe = await input.probe(work);
    scan.underWay.push(item(record.origin.path, { title: record.origin.title, where: `${record.origin.path}/`, line: recordLine(record), state: probe.state, ...(probe.address ? { address: probe.address } : {}), ...(probe.state === "waiting_for_you" || Object.values(record.phases).some(facts => !!facts.stop) ? { waitsForYou: true } : {}) }));
  }
  const newest = (a: HomeItem, b: HomeItem) => (b.lastChanged ?? "").localeCompare(a.lastChanged ?? "");
  scan.underWay.sort((a, b) => Number(!!b.waitsForYou) - Number(!!a.waitsForYou) || newest(a, b));
  scan.folded.sort(newest);
  return scan;
}

/** The repositories a scope covers: the one it was run in, or each repository directly inside a folder that isn't one (AC-HOME-08, AC-HOME-09). */
export function repositoriesIn(folder: string): { name: string; path: string }[] {
  const found: { name: string; path: string }[] = [];
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    try { if (statSync(path).isDirectory() && existsSync(join(path, ".git"))) found.push({ name: basename(path), path }); } catch { /* Unreadable: skipped. */ }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
