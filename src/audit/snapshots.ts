import type { PlannedPhase } from "../plan/phase-plan.js";
import { readFileSync, realpathSync, lstatSync, readdirSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { runGit, type GitContext } from "../engine/git-reads.js";
import { readPlanAt } from "../engine/plan-reading.js";
import { markdownLines } from "../plan/markdown-sections.js";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { AuditRefusal, requireAudit, type AuditActivity, type CriterionSource, type FileReference, type RequirementManifest, type TestPath, type WorkSnapshot } from "./contracts.js";
import { hashBytes, hashValue } from "./storage.js";

export function assignedPath(repository: RepositoryEntry, path: string): string {
  requireAudit(typeof path === "string" && path.length && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0") && path.split("/").every(p => p !== ".." && p !== "." && p !== ""), `Invalid repository-relative path: ${path}`, "outside_execution");
  const root = realpathSync(repository.worktreePath); const target = resolve(root, path);
  let physical: string;
  try { physical = realpathSync(target); } catch (error) {
    throw new AuditRefusal((error as NodeJS.ErrnoException).code === "ENOENT" ? "missing_evidence" : "evidence_unavailable", `Cannot read ${repository.name}/${path}: ${(error as Error).message}`, (error as NodeJS.ErrnoException).code === "ENOENT" ? 422 : 503);
  }
  requireAudit(physical.startsWith(root + sep) && lstatSync(target).isFile(), `Path escapes assigned repository or is not a regular file: ${repository.name}/${path}`, "outside_execution");
  return physical;
}
export function insideRepository(repository: import("../state/records.js").RepositoryEntry, path: string): boolean {
  try { const root = realpathSync(repository.worktreePath); const actual = realpathSync(path); return actual === root || actual.startsWith(root + sep); } catch { return false; }
}
export function repositoryFor(record: PrdRecord, name: string): RepositoryEntry {
  const repository = record.repositories.find(r => r.name === name && r.setupCompletedAt);
  requireAudit(repository, `Repository ${name} is not assigned.`, "outside_execution"); return repository;
}
export async function gitText(git: GitContext, repo: RepositoryEntry, args: string[]): Promise<string> {
  const result = await runGit(git, repo.worktreePath, args);
  if (result.exitCode !== 0) throw new AuditRefusal("evidence_unavailable", `${repo.name}: ${result.failure ?? result.stderr.trim() ?? "Git read failed"}`, 503);
  return result.stdout;
}

/** Preserve nested requirements verbatim; identity belongs to a document, never a global label. */
export function requirementManifest(repository: string, path: string, blob: string, content: string): RequirementManifest {
  const lines = markdownLines(content); const criteria: CriterionSource[] = []; const keys = new Set<string>();
  let inCriteria = false; let current: { start: number; title: string; label: string } | undefined;
  const finish = (end: number) => {
    if (!current) return;
    const text = lines.slice(current.start, end).map(l => l.text).join("\n").trimEnd();
    const key = `${repository}:${path}#${current.label}`;
    requireAudit(!keys.has(key), `Duplicate criterion ${key} at line ${current.start + 1}.`); keys.add(key);
    criteria.push({ key, repository, path, blob, label: current.label, startLine: current.start + 1, endLine: end, content: text, digest: hashBytes(text.replace(/^([-*] \[)[xX ](\])/m, "$1 $2")) }); current = undefined;
  };
  lines.forEach((line, index) => {
    if (line.inCodeFence) return;
    if (/^##\s/.test(line.text)) { finish(index); inCriteria = /^##\s+Acceptance Criteria\s*$/i.test(line.text); return; }
    if (!inCriteria) return;
    if (/^#{3,6}\s/.test(line.text)) { finish(index); return; }
    const match = /^[-*] (?:\[[ xX]\] )?\*\*([^*]+)\*\*/.exec(line.text);
    if (match) {
      finish(index); const title = match[1]!.trim();
      const labels = title.match(/\bAC-[A-Z0-9]+-\d+\b/g) ?? [];
      requireAudit(labels.length <= 1 && title.length, `Ambiguous criterion at ${path}:${index + 1}`);
      current = { start: index, title, label: labels[0] ?? title };
    } else if (/^[-*] \[[ xX]\]/.test(line.text)) throw new AuditRefusal("invalid_report", `Criterion needs an unambiguous bold title at ${path}:${index + 1}`);
  }); finish(lines.length);
  requireAudit(criteria.length > 0, `No acceptance criteria found in ${path}.`);
  return { id: hashValue(criteria.map(({ key, digest }) => ({ key, digest }))), repository, path, criteria };
}

/** Only parsed phase status metadata is ignored; arbitrary body text still changes scope. */
export function phaseScope(content: string): string {
  let preamble = true;
  return markdownLines(content).filter(line => {
    if (!line.inCodeFence && /^##\s/.test(line.text)) preamble = false;
    return !(preamble && !line.inCodeFence && /^\*\*Closed:\*\*/.test(line.text));
  }).map(line => !line.inCodeFence ? line.text.replace(/^(\s*[-*] \[)[xX ](\])/, "$1 $2") : line.text).join("\n");
}

/** `retainedClassification` re-reads a version-1 snapshot's test paths without re-checking their support. */
/** `planPhases`: while a waived plan problem stops the plan from reading, the phases Normal Order uses (waivers AC-WAIVE-04). */
export interface SnapshotContext { record: PrdRecord; activity: AuditActivity; git: GitContext; now: string; retainedClassification?: boolean; planPhases?: PlannedPhase[] }

export function fileInSnapshot(snapshot: WorkSnapshot, reference: FileReference): boolean {
  return !!reference && snapshot.repositories.find(r => r.repository === reference.repository)?.files[reference.path]?.blob === reference.blob;
}

/**
 * Kiln's own read of the assigned work. New snapshots declare no test paths; a version-1 snapshot's
 * test paths are carried only to compare it on the rules it was accepted under.
 */
export async function captureSnapshot(context: SnapshotContext, testPaths: TestPath[] = []): Promise<WorkSnapshot> {
  const { record, activity, git } = context;
  requireAudit(record.executionId, "Execution identity is missing.");
  const prdRepo = repositoryFor(record, record.repository.name);
  const folder = assignedPathDirectory(prdRepo, record.prdDirectory);
  const prds = readdirSync(folder).filter(name => name.endsWith("-prd.md"));
  requireAudit(prds.length === 1, `Expected exactly one governing PRD in ${record.prdDirectory}.`);
  const prdPath = `${record.prdDirectory}/${prds[0]!}`;
  const read = readPlanAt(prdRepo.worktreePath, record.prdDirectory);
  const plan = !read.ok && !read.unavailable && context.planPhases ? { ok: true as const, plan: { phases: context.planPhases, problems: [] } } : read;
  requireAudit(plan.ok, plan.ok ? "" : plan.problem, "inconsistent_plan");
  const normalizedPlan = plan.plan.phases.map(p => ({ id: p.id, file: `${record.prdDirectory}/${p.fileName}`, closed: p.closed, content: phaseScope(readFileSync(assignedPath(prdRepo, `${record.prdDirectory}/${p.fileName}`), "utf8")), ...(p.splitInto ? { splitInto: p.splitInto } : {}) }));
  const repositories: WorkSnapshot["repositories"] = [];
  for (const repo of record.repositories) {
    requireAudit(repo.setupCompletedAt, `Repository ${repo.name} setup is incomplete.`, "outside_execution");
    const head = (await gitText(git, repo, ["rev-parse", "HEAD"])).trim();
    const branch = (await gitText(git, repo, ["branch", "--show-current"])).trim();
    requireAudit(branch === record.settings.featureBranch, `${repo.name} is not on its assigned branch.`, "outside_execution");
    const identity = (await gitText(git, repo, ["remote", "get-url", "origin"])).trim();
    const tree = await gitText(git, repo, ["ls-files", "--stage", "-z"]);
    const files: WorkSnapshot["repositories"][number]["files"] = {};
    for (const row of tree.split("\0").filter(Boolean)) {
      const match = /^(\d+) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(row);
      requireAudit(match, `${repo.name} contains an unresolved index entry.`, "stale_snapshot");
      const path = match[3]!;
      requireAudit(match[1] !== "160000", `Submodule content needs an assigned repository: ${repo.name}/${path}`, "missing_evidence");
      const bytes = readFileSync(assignedPath(repo, path));
      // Git blob identity must describe the actual worktree bytes, including uncommitted edits.
      const blob = hashGitBlob(bytes);
      const phase = repo === prdRepo ? normalizedPlan.find(p => p.file === path) : undefined;
      files[path] = { blob, digest: hashBytes(phase ? phase.content : bytes), mode: lstatSync(assignedPath(repo, path)).mode & 0o111 ? "100755" : "100644", changedAtMs: Math.floor(lstatSync(assignedPath(repo, path)).ctimeMs) };
    }
    // Unknown untracked work must not disappear from a checked snapshot.
    const untracked = await gitText(git, repo, ["ls-files", "--others", "--exclude-standard", "-z"]);
    for (const path of untracked.split("\0").filter(Boolean)) {
      const bytes = readFileSync(assignedPath(repo, path));
      const stat = lstatSync(assignedPath(repo, path));
      files[path] = { blob: hashGitBlob(bytes), digest: hashBytes(bytes), mode: stat.mode & 0o111 ? "100755" : "100644", changedAtMs: Math.floor(stat.ctimeMs) };
    }
    repositories.push({ repository: repo.name, identity, branch, head, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) });
  }
  const source = repositories.find(r => r.repository === prdRepo.name)!.files[prdPath];
  requireAudit(source, `Governing PRD is missing: ${prdPath}`);
  const requirements = requirementManifest(prdRepo.name, prdPath, source.blob, readFileSync(assignedPath(prdRepo, prdPath), "utf8"));
  const snapshot: WorkSnapshot = { id: "", executionId: record.executionId, activityId: activity.activityId, createdAt: context.now, requirements, documents: [], plan: normalizedPlan, repositories, testPaths, evidencePaths: [], deliveryFingerprint: "", testFingerprint: "" };
  // The governing documents Kiln itself reads; method documents are neither required nor traversed (AC-NEUTRAL-02).
  const required = new Set([prdPath, ...normalizedPlan.map(p => p.file)]);
  for (const name of readdirSync(folder)) if (/assumptions|technical-design/.test(name) && name.endsWith(".md")) required.add(`${record.prdDirectory}/${name}`);
  for (const path of required) {
    const file = repositories.find(r => r.repository === prdRepo.name)!.files[path]; requireAudit(file, `Missing required document ${path}`, "missing_evidence");
    snapshot.documents.push({ repository: prdRepo.name, path, blob: file.blob });
  }
  requireAudit(context.retainedClassification || !testPaths.length, "New audit snapshots declare no test paths.");
  const declared = new Set(testPaths.map(test => `${test.repository}:${test.path}`));
  const records = auditRecordPaths(record);
  const delivery: unknown[] = []; const tests: unknown[] = [];
  for (const repo of repositories) {
    delivery.push([repo.repository, repo.identity, repo.branch]); tests.push([repo.repository, repo.identity, repo.branch]);
    for (const [path, file] of Object.entries(repo.files)) {
      const key = `${repo.repository}:${path}`; if (records.has(key)) continue;
      (declared.has(key) ? tests : delivery).push([key, file.mode, file.digest]);
    }
  }
  snapshot.deliveryFingerprint = hashValue(delivery); snapshot.testFingerprint = hashValue(tests);
  snapshot.id = hashValue({ ...snapshot, id: undefined }); return snapshot;
}
import { createHash } from "node:crypto";
function hashGitBlob(bytes: Buffer): string { return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); }
function assignedPathDirectory(repo: RepositoryEntry, path: string): string {
  const root = realpathSync(repo.worktreePath); const full = realpathSync(resolve(root, path));
  requireAudit(relative(root, full) && !relative(root, full).startsWith("..") && full.startsWith(root + sep), "PRD directory escapes assigned repository.", "outside_execution"); return full;
}

/**
 * Markdown in a folder that held a PRD at the checked snapshot is current through the criteria manifest
 * and phase scope, never its bytes: audits write completion phases, plan rows, assumptions and pointers
 * there by design. A document an acceptance criterion links to is part of that criterion and stays material.
 */
export function requirementsDocumentFilter(checked: WorkSnapshot): (repository: string, path: string) => boolean {
  const folders = new Map(checked.repositories.map(repo => [repo.repository, new Set(Object.keys(repo.files).filter(path => path.endsWith("-prd.md")).map(path => posix.dirname(path)))]));
  const criterionLinks = new Set<string>();
  for (const criterion of checked.requirements.criteria) for (const link of criterion.content.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = link[1]!.split(/[?#]/)[0]!;
    if (href && !/^[a-z]+:/i.test(href)) criterionLinks.add(`${criterion.repository}:${posix.normalize(posix.join(posix.dirname(criterion.path), decodeURIComponent(href)))}`);
  }
  return (repository, path) => path.endsWith(".md") && !!folders.get(repository)?.has(posix.dirname(path)) && !criterionLinks.has(`${repository}:${path}`);
}

export interface SnapshotChange { affects: "delivery" | "tests"; description: string }

/** Computed from stored per-file digests and plans, so accepted snapshots follow the current rules. */
export function snapshotChanges(record: PrdRecord, checked: WorkSnapshot, current: WorkSnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const delivery = (description: string) => changes.push({ affects: "delivery", description });
  const ignored = auditRecordPaths(record);
  const requirementsDocument = requirementsDocumentFilter(checked);
  const tests = new Set(checked.testPaths.map(file => `${file.repository}:${file.path}`));
  const oldRepositories = new Map(checked.repositories.map(repo => [repo.repository, repo]));
  const newRepositories = new Map(current.repositories.map(repo => [repo.repository, repo]));
  for (const name of new Set([...oldRepositories.keys(), ...newRepositories.keys()])) {
    const before = oldRepositories.get(name), after = newRepositories.get(name);
    if (!before || !after) { delivery(`${before ? "Removed" : "Added"} assigned repository ${name}`); continue; }
    if (before.identity !== after.identity) delivery(`Changed repository identity: ${name}`);
    if (before.branch !== after.branch) delivery(`Changed branch: ${name} (${before.branch} → ${after.branch})`);
    for (const path of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
      const key = `${name}:${path}`;
      if (ignored.has(key) || requirementsDocument(name, path)) continue;
      const oldFile = before.files[path], newFile = after.files[path];
      if (oldFile?.digest === newFile?.digest && oldFile?.mode === newFile?.mode) continue;
      changes.push({ affects: tests.has(key) ? "tests" : "delivery", description: `${!oldFile ? "Added" : !newFile ? "Removed" : oldFile.mode !== newFile.mode ? "Changed file mode" : "Changed"}: ${name}/${path}` });
    }
  }
  if (checked.requirements.id !== current.requirements.id) delivery("Changed governing acceptance criteria");
  // Appended phases are admitted against the activity's first snapshot; existing phases must keep their scope.
  checked.plan.forEach((phase, index) => {
    const now = current.plan[index];
    if (!now || now.id !== phase.id || now.file !== phase.file) delivery(`Removed or reordered phase ${phase.id}: ${record.repository.name}/${phase.file}`);
    else if (now.content !== phase.content || hashValue(now.splitInto ?? []) !== hashValue(phase.splitInto ?? [])) delivery(`Changed phase scope: ${record.repository.name}/${phase.file}`);
  });
  return changes;
}

export function compareSnapshots(record: PrdRecord, checked: WorkSnapshot, current: WorkSnapshot): { deliveryCurrent: boolean; testsCurrent: boolean } {
  const changes = snapshotChanges(record, checked, current);
  const deliveryCurrent = !changes.some(change => change.affects === "delivery");
  return { deliveryCurrent, testsCurrent: deliveryCurrent && !changes.some(change => change.affects === "tests") };
}

function auditRecordPaths(record: PrdRecord): Set<string> {
  return new Set((record.completionAudits?.activities ?? []).map(a => `${record.repository.name}:${a.reportPath}`));
}

/** Explain the same comparison that gates audit admission. */
export function staleSnapshotReason(record: PrdRecord, checked: WorkSnapshot, current: WorkSnapshot, includeTests: boolean): string {
  const changes = snapshotChanges(record, checked, current).filter(change => includeTests || change.affects === "delivery").map(change => change.description);
  const details = changes.slice(0, 12).map(change => change.slice(0, 600));
  if (changes.length > details.length) details.push(`${changes.length - details.length} additional changes`);
  return `Acceptance criteria, phase scope, implementation or checked test content changed after the audit snapshot.${details.length ? ` ${details.join("; ")}.` : ""} Resume the assigned audit to capture a current snapshot, reassess the changed work and resubmit its report.`;
}
