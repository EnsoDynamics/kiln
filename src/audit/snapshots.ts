import { readFileSync, realpathSync, lstatSync, readdirSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { runGit, type GitContext } from "../engine/git-reads.js";
import { readPlanAt } from "../engine/plan-reading.js";
import { markdownLines } from "../plan/markdown-sections.js";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { AuditRefusal, requireAudit, type AuditActivity, type CriterionSource, type EvidenceEntry, type FileReference, type RequirementManifest, type TestPath, type WorkSnapshot } from "./contracts.js";
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

export interface SnapshotContext { record: PrdRecord; activity: AuditActivity; git: GitContext; evidence: EvidenceEntry[]; now: string; retainedClassification?: boolean }

export function fileInSnapshot(snapshot: WorkSnapshot, reference: FileReference): boolean {
  return !!reference && snapshot.repositories.find(r => r.repository === reference.repository)?.files[reference.path]?.blob === reference.blob;
}

export async function captureSnapshot(context: SnapshotContext, testPaths: TestPath[], evidencePaths: FileReference[]): Promise<WorkSnapshot> {
  const { record, activity, git } = context;
  requireAudit(record.executionId, "Execution identity is missing.");
  const prdRepo = repositoryFor(record, record.repository.name);
  const folder = assignedPathDirectory(prdRepo, record.prdDirectory);
  const prds = readdirSync(folder).filter(name => name.endsWith("-prd.md"));
  requireAudit(prds.length === 1, `Expected exactly one governing PRD in ${record.prdDirectory}.`);
  const prdPath = `${record.prdDirectory}/${prds[0]!}`;
  const plan = readPlanAt(prdRepo.worktreePath, record.prdDirectory);
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
  const snapshot: WorkSnapshot = { id: "", executionId: record.executionId, activityId: activity.activityId, createdAt: context.now, requirements, documents: [], plan: normalizedPlan, repositories, testPaths, evidencePaths, deliveryFingerprint: "", testFingerprint: "" };
  const required = new Set([prdPath, ...normalizedPlan.map(p => p.file)]);
  for (const name of readdirSync(folder)) if (/assumptions|technical-design/.test(name) && name.endsWith(".md")) required.add(`${record.prdDirectory}/${name}`);
  requireAudit([...required].some(p => /technical-design/.test(p)), "The governing technical design is missing.", "missing_evidence");
  // Only explicitly declared provenance edges are optional. Every other local document
  // and every replacement pointer remains required, including outside the PRD folder.
  const parents = new Map<string, string>();
  const chain = (path: string): string => {
    const paths = [path];
    while (parents.has(paths[0]!)) paths.unshift(parents.get(paths[0]!)!);
    return paths.join(" -> ");
  };
  const addRequired = (source: string, target: string) => {
    if (required.has(target)) return;
    parents.set(target, source);
    try {
      assignedPath(prdRepo, target);
      requireAudit(repositories.find(r => r.repository === prdRepo.name)!.files[target], `Missing required document ${target}`, "missing_evidence");
    } catch (error) {
      if (!(error instanceof AuditRefusal)) throw error;
      throw new AuditRefusal(error.code, `${error.message}. Required document chain: ${chain(target)}`, error.status, error.criteria);
    }
    required.add(target);
  };
  for (const path of required) {
    const file = repositories.find(r => r.repository === prdRepo.name)!.files[path]; requireAudit(file, `Missing required document ${path}`, "missing_evidence");
    snapshot.documents.push({ repository: prdRepo.name, path, blob: file.blob });
    const content = readFileSync(assignedPath(prdRepo, path), "utf8");
    for (const link of content.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g)) {
      const linePrefix = content.slice(content.lastIndexOf("\n", link.index) + 1, link.index);
      const replacementPointer = /(?:Superseded(?: in part)? by|Replaces(?: in part)?):/.test(linePrefix);
      if (link[2] === "kiln:reference" && !replacementPointer) continue;
      const href = link[1]!.split(/[?#]/)[0]!;
      if (!href || /^[a-z]+:/i.test(href) || !href.endsWith(".md")) continue;
      const target = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(href)));
      addRequired(path, target);
    }
    for (const pointer of content.matchAll(/(?:Superseded(?: in part)? by|Replaces(?: in part)?):[^\n]*?`([^`]+\.md)`/g)) {
      addRequired(path, pointer[1]!);
    }
  }
  requireAudit(Array.isArray(testPaths) && Array.isArray(evidencePaths), "Snapshot declarations must be arrays.");
  const declared = new Set<string>();
  for (const test of testPaths) {
    if (context.retainedClassification) { declared.add(`${test.repository}:${test.path}`); continue; }
    requireAudit(fileInSnapshot(snapshot, test), `Test path blob is not current: ${test.path}`);
    const key = `${test.repository}:${test.path}`; requireAudit(!declared.has(key), `Duplicate test path ${key}`); declared.add(key);
    requireAudit(!snapshot.documents.some(d => d.repository === test.repository && d.path === test.path) && !/(?:^|\/)(?:package(?:-lock)?\.json|[^/]*config\.[^/]+|[^/]*lock[^/]*|pyproject\.toml|requirements[^/]*\.txt)$/.test(test.path), `Configuration and requirements cannot be test-only: ${test.path}`);
    requireAudit(typeof test.shared === "boolean" && test.selectors?.length && test.configuration?.length && test.runEvidenceIds?.length, `Test classification needs selectors, configuration and observed runs: ${test.path}`);
    requireAudit(test.configuration.every(f => fileInSnapshot(snapshot, f)), `Changed test configuration: ${test.path}`);
    const assessment = context.evidence.find(e => e.evidenceId === test.assessmentEvidenceId);
    requireAudit(assessment?.kind === "assessment" && assessment.assessment?.purpose === "test_classification" && test.configuration.every(config => assessment.assessment!.configurationFiles?.some(f => hashValue(f) === hashValue(config))) && assessment.assessment.testPaths.some(f => hashValue(f) === hashValue({ repository: test.repository, path: test.path, blob: test.blob })), `Missing independent test-only assessment: ${test.path}`, "missing_evidence");
    for (const id of test.runEvidenceIds) requireAudit(context.evidence.some(e => e.evidenceId === id && e.command?.outcome === "success" && insideRepository(repositoryFor(record, test.repository), e.command.cwd) && assessment.assessment?.verificationEvidenceIds?.includes(id) && [test, ...test.configuration].every(ref => Date.parse(e.command!.startedAt) >= snapshot.repositories.find(r => r.repository === ref.repository)!.files[ref.path]!.changedAtMs) && test.selectors.some(selector => e.command!.invocation.includes(selector) || e.command!.output.includes(selector))), `Missing observed collection/run for ${test.path}`, "missing_evidence");
  }
  for (const path of evidencePaths) requireAudit(fileInSnapshot(snapshot, path) && path.path.endsWith(".md"), `Invalid method evidence document ${path.path}`);
  const records = new Set((record.completionAudits?.activities ?? []).map(a => `${prdRepo.name}:${a.reportPath}`));
  records.add(`${prdRepo.name}:${record.prdDirectory}/test-audit.md`);
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

export function compareSnapshots(checked: WorkSnapshot, current: WorkSnapshot): { deliveryCurrent: boolean; testsCurrent: boolean } {
  const deliveryCurrent = checked.deliveryFingerprint === current.deliveryFingerprint && checked.requirements.id === current.requirements.id;
  return { deliveryCurrent, testsCurrent: deliveryCurrent && checked.testFingerprint === current.testFingerprint };
}
