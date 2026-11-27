// The session describes its installed method. Kiln knows only these milestones and the stops they govern.
export const MILESTONES = ["prd_refined", "design_ready", "review_made", "requirements_finished"] as const;
export type MilestoneName = (typeof MILESTONES)[number];
export interface Skill { skill: string; title: string }
export interface NextStage extends Skill { kind: "requirements" | "before_prd" | "build"; reaches: MilestoneName[] }
export interface Milestone { name: MilestoneName; by: "this_session" | "earlier" }
export interface StageReport {
  ran: Skill[];
  finished: boolean;
  next?: NextStage;
  milestones?: Milestone[];
  prdDirectory?: string;
  draft?: { statements: string[]; leftOut: string[] };
}
export interface RequirementsOrigin {
  kind: "brief" | "intake" | "planned_prd" | "prd";
  path: string;
  initiative?: { path: string; row: string };
  title: string;
  files: string[];
  commit: string;
  committedAt: string;
}
export interface RequirementsStage {
  activityId: string;
  key: string;
  task: "stage" | "review" | "feedback";
  expected?: Skill;
  ran: Skill[];
  reaches: MilestoneName[];
  report?: StageReport;
  pushedSha?: string;
  startedAt: string;
}
export interface RequirementsState {
  phase: "stages" | "early_review" | "final_review" | "closed";
  earlyReviewHeld: boolean;
  stopAgain?: true;
  refreshAsked?: true;
  standing?: { milestones: Milestone[]; next: NextStage; at: string } | { unknown: true; at: string };
  designSpan: boolean;
  cursor: number;
  planFingerprint?: string;
  stages: RequirementsStage[];
  draftNote?: StageReport["draft"];
  review?: { kind: "early" | "final"; file: string; commit: string; readySince: string };
  notice?: { at: string; changes: string[] };
  feedback: { id: string; text: string; at: string; state: "waiting" | "given" | "read" | "applied"; sessionId?: string; readAt?: string; appliedCommit?: string }[];
  reachedByKiln: MilestoneName[];
}

export function newRequirements(): RequirementsState {
  return { phase: "stages", earlyReviewHeld: false, designSpan: false, cursor: 0, stages: [], feedback: [], reachedByKiln: [] };
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);
const skill = (value: unknown): value is Skill => object(value) && nonempty(value.skill) && nonempty(value.title);
const milestone = (value: unknown): value is MilestoneName => MILESTONES.some(name => name === value);

export function readStageReport(message: string, task: RequirementsStage["task"]): StageReport | undefined {
  const blocks = [...message.matchAll(/^ {0,3}```kiln-report[^\S\r\n]*\r?\n([\s\S]*?)^ {0,3}```[^\S\r\n]*\r?$/gm)];
  const block = blocks.at(-1);
  if (!block) return undefined;
  let value: unknown;
  try { value = JSON.parse(block[1]!); } catch { return undefined; }
  if (!object(value) || value.kilnReport !== 1 || !Array.isArray(value.ran) || !value.ran.every(skill) || typeof value.finished !== "boolean") return undefined;
  const report: StageReport = { ran: value.ran.map(({ skill, title }) => ({ skill, title })), finished: value.finished };
  if (task === "review") return report;
  const next = value.next;
  if (!object(next) || !skill(next) || (next.kind !== "requirements" && next.kind !== "before_prd" && next.kind !== "build") ||
      !Array.isArray(next.reaches) || !next.reaches.every(milestone) || !Array.isArray(value.milestones)) return undefined;
  const milestones: Milestone[] = [];
  for (const entry of value.milestones) {
    if (!object(entry) || !milestone(entry.name) || (entry.by !== "earlier" && entry.by !== "this_session")) return undefined;
    milestones.push({ name: entry.name, by: entry.by });
  }
  if (next.kind === "build" && !milestones.some(m => m.name === "requirements_finished")) {
    milestones.push({ name: "requirements_finished", by: report.ran.length ? "this_session" : "earlier" });
  }
  report.next = { skill: next.skill, title: next.title, kind: next.kind, reaches: next.reaches };
  report.milestones = milestones;
  if (nonempty(value.prdDirectory)) report.prdDirectory = value.prdDirectory;
  if (object(value.draft) && strings(value.draft.statements) && strings(value.draft.leftOut)) {
    report.draft = { statements: value.draft.statements, leftOut: value.draft.leftOut };
  }
  return report;
}

export function reviewDue(milestones: Milestone[], requirements: RequirementsState, hasDesign: boolean): "early" | "final" | undefined {
  if (milestones.some(m => m.name === "requirements_finished")) return "final";
  if (milestones.some(m => m.name === "prd_refined") && !hasDesign && (!requirements.earlyReviewHeld || requirements.refreshAsked || requirements.stopAgain)) return "early";
  return undefined;
}

export function expectedStage(state: RequirementsState): NextStage | undefined {
  const standing = state.standing;
  if (!standing || "unknown" in standing || standing.next.kind !== "requirements" || standing.next.reaches.includes("review_made") && state.review) return undefined;
  return standing.next;
}

export function nextStageKey(state: RequirementsState, skill: string): string {
  const used = new Set(state.stages.map(stage => stage.key));
  let occurrence = 1;
  while (used.has(`${skill}#${occurrence}`)) occurrence++;
  return `${skill}#${occurrence}`;
}
