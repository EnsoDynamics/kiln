/** Read-only owner-controlled state access. Never invokes migration-writing readers. */
import { lstatSync, readFileSync, readdirSync, realpathSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep, basename } from "node:path";
import { migrateRecord, SCHEMA_VERSION, type PrdRecord } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
import { findExecutable } from "../platform/helper-process.js";
import { resolvePrdPath } from "../prd-location.js";
import { ControlFailure, errorFact, type ControlError } from "./result.js";

export function deadlineCheck(deadline: number): void {
  if (Date.now() > deadline) throw new ControlFailure("state_unavailable", "The saved-state read deadline expired; inventory may be incomplete.");
}
export function checkedPath(root: string, path: string): void {
  const part = relative(resolve(root), resolve(path));
  if (part === ".." || part.startsWith(`..${sep}`) || resolve(root, part) !== resolve(path)) throw new ControlFailure("ownership_mismatch", "State path escapes the Kiln context.", 3);
  let current = resolve(root);
  for (const segment of ["", ...part.split(sep).filter(Boolean)]) {
    if (segment) current = join(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== "win32" && ((stat.mode & 0o022) !== 0 || (stat.mode & 0o400) === 0 || (stat.isDirectory() && (stat.mode & 0o100) === 0)))) {
      throw new ControlFailure("ownership_mismatch", "Kiln state must be readable, owner controlled and free of symlinks or shared write permissions.", 3);
    }
  }
}
export function privateJson<T>(root: string, path: string): T {
  checkedPath(root, path);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
export function privateNames(root: string, path: string): string[] {
  checkedPath(root, path);
  return readdirSync(path).sort();
}
export interface SavedWork { root: string; directory: string; record: PrdRecord; canonical: string; observedAt: string }
export function readWork(root: string, directory: string): SavedWork {
  const raw = privateJson<PrdRecord>(root, join(directory, "prd.json"));
  if (!raw || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion > SCHEMA_VERSION || raw.schemaVersion < 1) throw new ControlFailure("instance_incompatible", "Saved state has an unsupported schema; update Kiln.");
  if (!raw.executionId) {
    const evidence = privateJson<{ executionId: string }>(root, join(directory, "audit-migration.json"));
    if (!evidence.executionId) throw new ControlFailure("state_unavailable", "Saved execution identity is unavailable; run kiln run to upgrade under its exclusive lock.");
    raw.executionId = evidence.executionId;
  }
  if (!raw.repository || typeof raw.repository.mainCheckoutPath !== "string" || !/^docs\/(prds|changes)\/[^/\\]+$/.test(raw.prdDirectory) || typeof raw.token !== "string" || !/^[a-f0-9]{64}$/.test(raw.token)) throw new ControlFailure("state_unavailable", "Invalid saved PRD identity.");
  const record = migrateRecord(structuredClone(raw));
  if (!record.phases || !record.pause || !Array.isArray(record.repositories) || !Object.values(record.phases).every(f => Array.isArray(f.sessionIds))) throw new ControlFailure("state_unavailable", "Invalid saved phase inventory.");
  return { root, directory, record, canonical: resolve(record.repository.mainCheckoutPath, record.prdDirectory), observedAt: statSync(join(directory, "prd.json")).mtime.toISOString() };
}
export function enumerateWork(env: NodeJS.ProcessEnv, deadline = Date.now() + 5000): { work: SavedWork[]; errors: ControlError[] } {
  const root = stateRoot(env); const work: SavedWork[] = []; const errors: ControlError[] = [];
  try {
    if (!existsSync(root)) return { work, errors };
    for (const repository of privateNames(root, root)) {
      deadlineCheck(deadline);
      const repo = join(root, repository);
      if (!lstatSync(repo).isDirectory() && !lstatSync(repo).isSymbolicLink()) continue;
      try {
        for (const name of privateNames(root, repo)) {
          deadlineCheck(deadline);
          const directory = join(repo, name);
          if (!lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink()) continue;
          try { work.push(readWork(root, directory)); }
          catch (e) { errors.push(errorFact(e instanceof ControlFailure ? e.code : "state_unavailable", `Cannot inspect saved work ${repository}/${name}.`)); }
        }
      } catch { errors.push(errorFact("state_unavailable", `Cannot enumerate saved repository ${repository}.`)); }
    }
  } catch { errors.push(errorFact("state_unavailable", "Cannot enumerate the Kiln state root within its read deadline.")); }
  return { work, errors };
}
function normalizedRetained(path: string): string {
  let ancestor = resolve(path); const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor); if (parent === ancestor) break;
    suffix.unshift(basename(ancestor)); ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}
export async function targetWork(input: string, cwd: string, env: NodeJS.ProcessEnv, deadline = Date.now() + 5000): Promise<SavedWork> {
  let target = normalizedRetained(resolve(cwd, input));
  const git = findExecutable("git", env);
  if (git && existsSync(target)) {
    const resolution = await resolvePrdPath(target, cwd, git, env, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())), timeoutMs: Math.max(1, deadline - Date.now()) });
    deadlineCheck(deadline);
    if ("location" in resolution) target = resolve(resolution.location.mainCheckoutPath, resolution.location.prdDirectoryFromRoot);
  }
  const found = enumerateWork(env, deadline);
  const matching = found.work.filter(w => target === w.canonical || target === join(w.canonical, `${basename(w.canonical)}-prd.md`) || retainedAliases(w).includes(target));
  if (matching.length > 1) throw new ControlFailure("ambiguous_target", "More than one saved execution matches the exact PRD path.", 2);
  if (!matching.length) {
    if (found.errors.length) throw new ControlFailure("state_unavailable", "Some saved records could not be read; the target cannot be resolved completely.");
    throw new ControlFailure("target_not_found", "No saved work matches this PRD file or directory. Use kiln status --json.", 2);
  }
  return matching[0]!;
}
export const safeSelector = (s: string): boolean => /^[a-zA-Z0-9_.-]{1,200}$/.test(s) && s !== "." && s !== "..";

export interface AliasRecord { version: 1; execution_id: string; canonical: string; aliases: { path: string; provenance: "git_resolved_at_controller_start" }[] }
export function retainedAliases(work: SavedWork): string[] {
  const path = join(work.directory, "inspection-aliases.json");
  if (!existsSync(path)) return [];
  const saved = privateJson<AliasRecord>(work.root, path);
  if (saved.version !== 1 || saved.execution_id !== work.record.executionId || saved.canonical !== work.canonical || !Array.isArray(saved.aliases) || !saved.aliases.every(a => a.provenance === "git_resolved_at_controller_start" && typeof a.path === "string" && resolve(a.path) === a.path)) throw new ControlFailure("state_unavailable", "Saved PRD alias provenance is unavailable.");
  return saved.aliases.flatMap(a => [a.path, join(a.path, `${basename(a.path)}-prd.md`)]);
}
