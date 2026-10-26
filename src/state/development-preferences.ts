/** Explicit before-Start choices, grouped by requirements origin AND real main checkout. */
import { closeSync, openSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeTarget, normalizeMergeTarget, authorizationTargetKey, type MergeTarget } from "./development-delivery.js";
import { ensurePrivateDirectory, readJson, writeJsonAtomically } from "./state-files.js";

export interface DevelopmentPreferenceGroup { repository: string; mainCheckoutPath: string }
export interface DevelopmentPreference { group: DevelopmentPreferenceGroup; revision: number; enabled: boolean; targets: MergeTarget[] }
export class PreferenceConflict extends Error {}
export function preferenceGroup(repository: string, mainCheckoutPath: string): DevelopmentPreferenceGroup {
  return { repository: normalizeMergeTarget({ repository: `github.com/${repository}`, baseBranch: "identity", environment: "identity" }).repository, mainCheckoutPath: realpathSync.native(mainCheckoutPath) };
}
export function preferencePath(stateDirectory: string): string { return join(dirname(stateDirectory), "development-deployment-preferences.json"); }
const key = (group: DevelopmentPreferenceGroup) => JSON.stringify([group.repository, group.mainCheckoutPath]);
function readGroups(path: string): Record<string, DevelopmentPreference> {
  try {
    const data = readJson<{ schemaVersion: number; groups: Record<string, DevelopmentPreference> }>(path);
    if (data === undefined) return {};
    if (![1, 2].includes(data.schemaVersion) || !data.groups || typeof data.groups !== "object" || Array.isArray(data.groups)) throw new Error("invalid preference schema");
    for (const [id, value] of Object.entries(data.groups)) {
      if (!value || !value.group || typeof value.group.repository !== "string" || typeof value.group.mainCheckoutPath !== "string" || key(value.group) !== id || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.enabled !== "boolean" || !Array.isArray(value.targets)) throw new Error("invalid preference group");
      for (const target of value.targets) if (JSON.stringify(data.schemaVersion === 1 ? normalizeTarget(target) : normalizeMergeTarget(target)) !== JSON.stringify(target)) throw new Error("invalid preference target");
      if (new Set(value.targets.map(authorizationTargetKey)).size !== value.targets.length || value.enabled && !value.targets.length) throw new Error("invalid saved target set");
    }
    return data.groups;
  } catch (error) { throw new Error(`Cannot read development preferences ${path}: ${(error as Error).message}`, { cause: error }); }
}
export function readDevelopmentPreference(path: string, group: DevelopmentPreferenceGroup): DevelopmentPreference {
  return readGroups(path)[key(group)] ?? { group, revision: 0, enabled: false, targets: [] };
}
/** Synchronous short critical section; atomic rename plus compare-and-swap across PRD windows. */
export function saveDevelopmentPreference(path: string, choice: DevelopmentPreference, expectedRevision: number): DevelopmentPreference {
  ensurePrivateDirectory(dirname(path));
  const lock = `${path}.lock`;
  let descriptor: number;
  try { descriptor = openSync(lock, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try { if (Date.now() - statSync(lock).mtimeMs > 30_000) unlinkSync(lock); } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== "ENOENT") throw failure; }
    throw new PreferenceConflict("Another window is saving these targets. Reload Documents found and try again.");
  }
  try {
    const groups = readGroups(path); const current = groups[key(choice.group)];
    if ((current?.revision ?? 0) !== expectedRevision) throw new PreferenceConflict("Saved targets changed in another window. Reload Documents found before saving.");
    const saved = { ...choice, revision: expectedRevision + 1 };
    groups[key(choice.group)] = saved;
    writeJsonAtomically(path, { schemaVersion: 2, groups });
    return saved;
  } finally { closeSync(descriptor); unlinkSync(lock); }
}
