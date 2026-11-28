// The requirements plan (Kiln Requirements Stages, technical design "The Requirements Plan"): one
// file for the computer, holding each agent's plan by the fingerprint of the installed method it
// was read from. The plan is for showing; nothing that runs depends on it except which model a
// stage starts on. Kiln holds no list of the method's stages: every entry comes from a plan read.

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeSync } from "node:fs";
import { dirname, join, relative, isAbsolute, sep } from "node:path";
import { readJson, writeJsonAtomically, ensurePrivateDirectory } from "../state/state-files.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { claudeConfigFolder } from "../session/transcripts.js";
import { MILESTONES, type MilestoneName, type Skill } from "./stages.js";

export const PLAN_FILE = "requirements-plan.json";
export const PLAN_LOCK = "requirements-plan.lock";
/** A plan read's limit (technical design, "Reading it"). */
export const PLAN_READ_LIMIT_MS = 10 * 60_000;
const UNUSED_MS = 30 * 24 * 60 * 60_000;

export interface PlanStage extends Skill { reaches: MilestoneName[] }
export interface RequirementsPlan { methodUpdatedAt: string; readAt: string; usedAt: string; stages: PlanStage[]; reviewSkill: Skill }
export interface PlanFile {
  schemaVersion: 1;
  plans: Record<string, Record<string, RequirementsPlan>>;
  reading?: { agentId: string; fingerprint: string; startedAt: string; pid: number; processStartTime: string };
  failures: Record<string, Record<string, { reason: string; at: string }>>;
}

export const planPath = (root: string) => join(root, PLAN_FILE);

/** The plan file as it now stands; a missing or unreadable one is empty (it is Kiln's own cache). */
export function readPlanFile(root: string): PlanFile {
  let raw: unknown;
  try { raw = readJson<unknown>(planPath(root)); } catch { raw = undefined; }
  const file = raw as Partial<PlanFile> | undefined;
  if (!file || file.schemaVersion !== 1 || typeof file.plans !== "object" || !file.plans) return { schemaVersion: 1, plans: {}, failures: {} };
  return { schemaVersion: 1, plans: file.plans, failures: file.failures ?? {}, ...(file.reading ? { reading: file.reading } : {}) };
}

/** Changes the plan file: a plan not used for 30 days is dropped on every write. */
export function updatePlanFile(root: string, change: (file: PlanFile) => void, now = new Date()): PlanFile {
  const file = readPlanFile(root);
  change(file);
  for (const plans of Object.values(file.plans)) {
    for (const [fingerprint, plan] of Object.entries(plans)) if (now.getTime() - Date.parse(plan.usedAt) > UNUSED_MS) delete plans[fingerprint];
  }
  writeJsonAtomically(planPath(root), file);
  return file;
}

export function findPlan(file: PlanFile, agentId: string, fingerprint: string): RequirementsPlan | undefined { return file.plans[agentId]?.[fingerprint]; }
/** The agent's plan read most recently before the one for `fingerprint`: the method as it stood before (AC-MODEL-04). */
export function earlierPlan(file: PlanFile, agentId: string, fingerprint: string): RequirementsPlan | undefined {
  const plans = file.plans[agentId] ?? {};
  const now = plans[fingerprint];
  return Object.entries(plans).filter(([one, plan]) => one !== fingerprint && (!now || plan.readAt < now.readAt)).map(([, plan]) => plan).sort((a, b) => b.readAt.localeCompare(a.readAt))[0];
}
export function findFailure(file: PlanFile, agentId: string, fingerprint: string): { reason: string; at: string } | undefined { return file.failures[agentId]?.[fingerprint]; }

/**
 * The installed method a plan is read from (technical design, "Reading it"): the skills folder
 * the entry skill's `SKILL.md` resolves into, a hash of the name and bytes of every
 * `<skill>/SKILL.md` in it, and when it was last updated: the plugin registry's `lastUpdated`
 * when the copy is the registry's install path, otherwise the newest of those files' times.
 *
 *   methodOf("/…/enso-method/skills/using-the-enso-method/SKILL.md", process.env)
 *   // { folder: "/…/enso-method/skills", fingerprint: "9f2c…", updatedAt: "2026-11-19T…" }
 */
export function methodOf(skillPath: string, env: NodeJS.ProcessEnv): { folder: string; fingerprint: string; updatedAt: string } {
  const folder = dirname(dirname(realpathSync(skillPath)));
  const hash = createHash("sha256");
  let newest = 0;
  for (const name of readdirSync(folder).sort()) {
    const file = join(folder, name, "SKILL.md");
    let stat;
    try { stat = statSync(file); } catch { continue; }
    if (!stat.isFile()) continue;
    hash.update(`${name}\0${stat.size}\0`).update(readFileSync(file)).update("\0");
    newest = Math.max(newest, stat.mtimeMs);
  }
  return { folder, fingerprint: hash.digest("hex"), updatedAt: registryUpdated(folder, env) ?? new Date(newest).toISOString() };
}

function registryUpdated(folder: string, env: NodeJS.ProcessEnv): string | undefined {
  try {
    const registry = JSON.parse(readFileSync(join(claudeConfigFolder(env), "plugins", "installed_plugins.json"), "utf8")) as { plugins?: Record<string, { installPath?: string; lastUpdated?: string }[]> };
    for (const entries of Object.values(registry.plugins ?? {})) for (const entry of entries) {
      if (!entry.installPath || !entry.lastUpdated || !existsSync(entry.installPath)) continue;
      const from = relative(realpathSync(entry.installPath), folder);
      if (!isAbsolute(from) && from !== ".." && !from.startsWith(`..${sep}`)) return entry.lastUpdated;
    }
  } catch { /* No registry, or one Kiln can't read: the files' own times. */ }
  return undefined;
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * The plan read's answer: the last `kiln-plan` block of its final message (technical design,
 * "Interfaces"). A block that doesn't read is no plan, and the reason says why.
 */
export function readPlanBlock(message: string): { stages: PlanStage[]; reviewSkill: Skill } | { problem: string } {
  const block = [...message.matchAll(/^ {0,3}```kiln-plan[^\S\r\n]*\r?\n([\s\S]*?)^ {0,3}```[^\S\r\n]*\r?$/gm)].at(-1);
  if (!block) return { problem: "The session reading the plan ended without returning a plan." };
  let value: unknown;
  try { value = JSON.parse(block[1]!); } catch { return { problem: "The plan the session returned isn't valid JSON." }; }
  if (!object(value) || value.kilnPlan !== 1) return { problem: "The plan the session returned isn't one Kiln reads." };
  if (!Array.isArray(value.stages) || !value.stages.length) return { problem: "The plan the session returned has no stages." };
  const stages: PlanStage[] = [];
  for (const stage of value.stages) {
    if (!object(stage) || !nonempty(stage.skill) || !nonempty(stage.title) || !Array.isArray(stage.reaches)) return { problem: "The plan the session returned has a stage Kiln can't read." };
    const unknown = stage.reaches.find(name => !MILESTONES.some(one => one === name));
    if (unknown !== undefined) return { problem: `The plan the session returned names a milestone Kiln doesn't know: ${String(unknown)}.` };
    stages.push({ skill: stage.skill, title: stage.title, reaches: stage.reaches as MilestoneName[] });
  }
  const review = value.reviewSkill;
  if (!object(review) || !nonempty(review.skill) || !nonempty(review.title)) return { problem: "The plan the session returned doesn't name the stakeholder review's skill." };
  return { stages, reviewSkill: { skill: review.skill, title: review.title } };
}

/** Each entry's stage key, `<skill>#<occurrence>`, counting that skill's earlier entries in the plan only (technical design, "Data Models"). */
export function planKeys(stages: Pick<PlanStage, "skill">[]): string[] {
  const seen = new Map<string, number>();
  return stages.map(stage => { const n = (seen.get(stage.skill) ?? 0) + 1; seen.set(stage.skill, n); return `${stage.skill}#${n}`; });
}

/**
 * What changed between the plan a PRD showed and the new one, compared by skill name (AC-PLAN-07):
 * the stages no longer in it, the new ones, and the count before and after.
 *
 *   planChanges([a, b, c], [a, bc])  // ["No longer in the plan: b, c.", "New in the plan: bc.", "The plan has 2 stages where it had 3."]
 */
export function planChanges(before: PlanStage[] | undefined, after: PlanStage[]): string[] {
  if (!before) return [`The plan has ${after.length} stage${after.length === 1 ? "" : "s"}.`];
  const had = new Set(before.map(stage => stage.skill));
  const has = new Set(after.map(stage => stage.skill));
  const gone = before.filter(stage => !has.has(stage.skill)).map(stage => stage.title);
  const added = after.filter(stage => !had.has(stage.skill)).map(stage => stage.title);
  return [
    ...(gone.length ? [`No longer in the plan: ${gone.join(", ")}.`] : []),
    ...(added.length ? [`New in the plan: ${added.join(", ")}.`] : []),
    before.length === after.length ? `The plan still has ${after.length} stages.` : `The plan has ${after.length} stages where it had ${before.length}.`,
  ];
}

/**
 * Where the cursor goes when the plan changes (technical design, "When the plan changes"): to the
 * new plan's entry with the key of the old cursor's entry; otherwise to the entry after the
 * latest entry before the old cursor whose key the new plan holds; otherwise the start.
 */
export function remapCursor(before: PlanStage[] | undefined, after: PlanStage[], cursor: number): number {
  if (!before) return 0;
  const oldKeys = planKeys(before);
  const newKeys = planKeys(after);
  const at = oldKeys[cursor];
  if (at !== undefined && newKeys.includes(at)) return newKeys.indexOf(at);
  for (let i = Math.min(cursor, oldKeys.length) - 1; i >= 0; i--) {
    const found = newKeys.indexOf(oldKeys[i]!);
    if (found >= 0) return found + 1;
  }
  return 0;
}

/**
 * The lock that lets one process read the plan at a time (technical design, "Reading it"),
 * created exclusively beside the plan file. A lock whose holder the plan file's `reading` names
 * and which is no longer alive is taken over. Returns a release, or undefined when another
 * live process holds it.
 */
export async function takePlanLock(root: string, holder: NonNullable<PlanFile["reading"]>): Promise<(() => void) | undefined> {
  ensurePrivateDirectory(root);
  const path = join(root, PLAN_LOCK);
  const attempt = (): boolean => {
    try { const fd = openSync(path, "wx", 0o600); writeSync(fd, `${holder.pid}\n`); closeSync(fd); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
  };
  if (!attempt()) {
    const reading = readPlanFile(root).reading;
    if (reading && await isProcessLive(reading.pid, reading.processStartTime)) return undefined;
    // A lock left with no live holder (a reader that died, or one that never wrote `reading`) is taken over.
    let age = 0;
    try { age = Date.now() - statSync(path).mtimeMs; } catch { /* Gone already. */ }
    if (!reading && age < 30_000) return undefined;
    rmSync(path, { force: true });
    if (!attempt()) return undefined;
  }
  updatePlanFile(root, file => { file.reading = holder; });
  return () => {
    try { updatePlanFile(root, file => { if (file.reading?.pid === holder.pid && file.reading.startedAt === holder.startedAt) delete file.reading; }); }
    finally { rmSync(path, { force: true }); }
  };
}
