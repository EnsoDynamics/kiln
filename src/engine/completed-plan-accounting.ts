/** Classify observed leaves without accepting a plan or manufacturing completion receipts. */
import MarkdownIt from "markdown-it";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { parseGithubOrigin } from "../github-origin.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { leavesOf, type PlannedPhase } from "../plan/phase-plan.js";
import { deliveryOwner } from "../state/development-delivery.js";
import type { PrdRecord } from "../state/records.js";
import { requireOwnerDeliveryEvidence, validateDeliverySplits } from "./development-delivery.js";
import { gitRead, remoteBase, observeGitPlan } from "./completed-plan-sources.js";
import { runGit, gitError, type GitContext } from "./git-reads.js";
import { judgedPhase } from "./plan-reading.js";
import { PLAN_LIMIT, PlanCapacityError, completedPhaseScopeUnchanged, type PlanBaseline, type PlanSource } from "./plan-reconciliation.js";
import { expandHome } from "./worktree-setup.js";
import { findRepository, repositoriesParent } from "./repositories.js";
import type { ContinuationInputObservation } from "./continuation-authority.js";

export type LeafClassification = "carried_completed" | "new_unfinished" | "externally_verified" | "externally_unverified" | "unresolved_earlier_work";
export interface CompletionRepositoryEvidence {
  repository: string; identity: string; revision: string; baseBranch: string; baseRevision: string;
  integration: "integrated_verified" | "blocked";
  merge?: { sourceHead: string; resultSha: string; url: string };
}
export interface AccountedLeaf {
  id: string; title: string; file: string; classification: LeafClassification;
  problems: string[]; repositories: CompletionRepositoryEvidence[];
  provenance?: "not_applicable" | "retained_kiln";
  completedAt?: string; verifiedAt?: string;
}
export interface CompletionAccounting {
  formatVersion: 1; id: string; baselineId: string; candidateDigest: string;
  leaves: AccountedLeaf[];
  references: ExternalCompletionReference[];
}
export interface ExternalCompletionReference { phaseId: string; repository: string; revision: string; file: string; line: number; endLine: number }
const markdown = new MarkdownIt();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Only affirmative ordinary paragraphs in the two governing documents are evidence inputs. */
export function externalCompletionReferences(source: Pick<PlanSource, "documents">, directory: string): { references: ExternalCompletionReference[]; problems: string[] } {
  const references: ExternalCompletionReference[] = []; const problems: string[] = [];
  for (const [file, content] of Object.entries(source.documents)) {
    if (posix.dirname(file) !== directory || !/(?:-prd|technical-design)\.md$/.test(file)) continue;
    const tokens = markdown.parse(content, {}); let section = false; let quoted = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.type === "blockquote_open") quoted++;
      if (token.type === "blockquote_close") quoted--;
      if (quoted) continue;
      if (token.type === "heading_open" && ["h1", "h2"].includes(token.tag)) section = token.tag === "h2" && tokens[i + 1]?.content === "External completion evidence";
      if (!section || token.type !== "inline" || tokens[i - 1]?.type !== "paragraph_open") continue;
      const text = (token.children ?? []).map(child => child.type === "code_inline" ? `\`${child.content}\`` : ["softbreak", "hardbreak"].includes(child.type) ? " " : child.type === "text" ? child.content : "").join("").replace(/\s+/g, " ").trim();
      const match = /^Phase (\d+(?:[a-z]+\d+)*[a-z]*): repository `([^`]+)` at commit `([a-f0-9]{40}|[a-f0-9]{64})`\.$/.exec(text);
      const line = (token.map?.[0] ?? tokens[i - 1]?.map?.[0] ?? 0) + 1;
      if (!match) problems.push(`${file}:${line}: Unsupported external completion reference. Use: Phase 8: repository \`name\` at commit \`full immutable revision\`.`);
      else references.push({ phaseId: match[1]!, repository: match[2]!, revision: match[3]!, file, line, endLine: token.map?.[1] ?? tokens[i - 1]?.map?.[1] ?? line });
    }
  }
  return { references, problems };
}

async function ancestor(git: GitContext, path: string, from: string, to: string): Promise<boolean> {
  const result = await runGit(git, path, ["merge-base", "--is-ancestor", from, to]);
  if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(`Could not read integration coverage in ${path}: ${gitError(result)}`);
  return result.exitCode === 0;
}

/** Completion is bound to the immutable scope, never to today's Closed line alone. */
export async function accountCompletedLeaves(input: { record: PrdRecord; baseline: PlanBaseline; candidate: PlanSource; git: GitContext; shared: string; verifiedAt: string; observeInput?: (observation: ContinuationInputObservation) => void }): Promise<Omit<CompletionAccounting, "id">> {
  const { record, baseline, candidate, git, shared, verifiedAt } = input;
  const extracted = externalCompletionReferences(candidate, record.prdDirectory);
  const prdName = record.repository.name;
  const leaves: AccountedLeaf[] = [];
  const bases = new Map<string, { path: string; branch: string; revision: string }>();
  for (const phase of leavesOf(candidate.plan)) {
    const old = baseline.active.plan.phases.find(p => p.id === phase.id);
    const row: AccountedLeaf = { id: phase.id, title: phase.title, file: posix.join(record.prdDirectory, phase.fileName), classification: "new_unfinished", problems: [], repositories: [] };
    leaves.push(row);
    if (!old && leavesOf(baseline.active.plan).some(previous => previous.closed && isAncestorOf(previous.id, phase.id))) {
      row.classification = "unresolved_earlier_work";
      row.problems.push(`Phase ${phase.id}: splitting earlier completed work is not a new addition.`); continue;
    }
    if (old) {
      // A leaf completed or skipped on a waiver is carried while its scope is unchanged, Closed line or not (waivers "Continuation executions").
      const waived = !!baseline.completions[phase.id]?.waiverId;
      row.classification = (old.closed && phase.closed || waived) && !old.splitInto && completedPhaseScopeUnchanged(baseline.active, candidate, phase.id, baseline.completions[phase.id]?.scopeRepositories) ? "carried_completed" : "unresolved_earlier_work";
      if (row.classification === "unresolved_earlier_work") row.problems.push(`Phase ${phase.id}: Earlier work cannot be carried forward with this scope and closure.`);
      const completion = baseline.completions[phase.id];
      if (completion?.doneAt) row.completedAt = completion.doneAt;
      continue;
    }
    if (!phase.closed) continue;
    row.classification = "externally_unverified";
    const owners = Object.entries(record.phases).filter(([id, facts]) => facts.sessionIds.length && judgedPhase(candidate.plan.phases, id)?.id === phase.id);
    const owner = owners[0];
    const names = [...new Set([prdName, ...candidate.plan.phases.filter(p => p.id === phase.id || isAncestorOf(p.id, phase.id)).flatMap(p => p.repositories)])];
    let references = extracted.references.filter(ref => ref.phaseId === phase.id);
    if (owner) {
      row.provenance = "retained_kiln";
      if (owners.length !== 1 || !owner[1].doneAt) {
        row.problems.push(`Phase ${phase.id} has a Kiln session. Restore its scope-bound completion receipt; it cannot be treated as work with no provider owner.`); continue;
      }
      row.completedAt = owner[1].doneAt;
      references = names.flatMap(repository => {
        const revision = owner[1].repositories[repository]?.pushedSha;
        return revision ? [{ phaseId: phase.id, repository, revision, file: "retained Kiln completion receipt", line: 0, endLine: 0 }] : [];
      });
    } else {
      row.provenance = "not_applicable";
      row.problems.push(...extracted.problems);
    }
    for (const reference of references) if (!names.includes(reference.repository)) row.problems.push(`Phase ${phase.id}: evidence names unrelated repository ${reference.repository} at ${reference.file}:${reference.line}.`);
    for (const name of names) {
      const refs = references.filter(ref => ref.repository === name);
      if (!refs.length || new Set(refs.map(ref => ref.revision)).size !== 1) {
        row.problems.push(`Phase ${phase.id}: ${name} needs one unambiguous immutable work revision under External completion evidence in the PRD or design.`); continue;
      }
      let repo: { mainCheckoutPath: string; github: string; baseBranch: string } | undefined = record.repositories.find(entry => entry.name === name);
      if (!repo) {
        const found = await findRepository(git, repositoriesParent(shared), name, phase.fileName);
        if (!found.ok) { if (found.unavailable) throw new Error(`source_unavailable: ${found.problem} Restore repository access, then check again.`); row.problems.push(`Phase ${phase.id}: ${found.problem}`); continue; }
        const baseBranch = record.settings.bases[name];
        if (!baseBranch) { row.problems.push(`Phase ${phase.id}: configure the delivery base for ${name} before its completion can be verified.`); continue; }
        repo = { ...found.repository, baseBranch };
      }
      const path = name === prdName ? shared : expandHome(repo.mainCheckoutPath);
      const origin = parseGithubOrigin(await gitRead(git, path, ["config", "--get", "remote.origin.url"]));
      input.observeInput?.({ kind: "repository", repository: name, identity: origin ? `${origin.owner}/${origin.name}` : null });
      if (!origin || `${origin.owner}/${origin.name}`.toLowerCase() !== repo.github.toLowerCase()) { row.problems.push(`Phase ${phase.id}: ${name} origin no longer identifies ${repo.github}. Restore the recorded repository before checking again.`); continue; }
      let base = bases.get(name);
      if (!base) { base = { path, branch: repo.baseBranch, revision: await remoteBase(git, path, repo.baseBranch, true, revision => input.observeInput?.({ kind: "base", repository: name, branch: repo.baseBranch, revision })) }; bases.set(name, base); }
      const revision = refs[0]!.revision;
      const exists = await runGit(git, path, ["cat-file", "-t", revision]);
      if (exists.exitCode !== 0 || exists.stdout.trim() !== "commit") { row.problems.push(`Phase ${phase.id}: restore immutable commit ${revision} in ${name}, then check again.`); continue; }
      if (name === prdName) {
        const original = await observeGitPlan(git, path, record.prdDirectory, revision);
        const originalPhase = leavesOf(original.plan).find(p => p.id === phase.id);
        if (!originalPhase?.closed || !completedPhaseScopeUnchanged(original, candidate, phase.id) || JSON.stringify(original.plan.phases.filter(p => p.id === phase.id || isAncestorOf(p.id, phase.id)).flatMap(p => p.repositories).sort()) !== JSON.stringify(candidate.plan.phases.filter(p => p.id === phase.id || isAncestorOf(p.id, phase.id)).flatMap(p => p.repositories).sort())) {
          row.problems.push(`Phase ${phase.id}: ${revision} does not contain its unchanged Closed scope at ${row.file}. Restore the matching source reference.`); continue;
        }
      }
      const evidence: CompletionRepositoryEvidence = { repository: name, identity: repo.github, revision, baseBranch: repo.baseBranch, baseRevision: base.revision, integration: "blocked" };
      row.repositories.push(evidence);
      if (await ancestor(git, path, revision, base.revision)) evidence.integration = "integrated_verified";
      else {
        // Only a previously verified engine-owned GitHub pair can cover squash/rebase.
        for (const checkpoint of record.developmentDelivery?.checkpoints ?? []) {
          const merge = checkpoint.merge;
          if (!merge || checkpoint.mergeUnresolvedReason || checkpoint.supersededBy || checkpoint.target.repository !== `github.com/${repo.github}`.toLowerCase() || checkpoint.target.baseBranch !== repo.baseBranch || merge.sourceHead !== checkpoint.headSha || merge.mergedHead !== merge.sourceHead) continue;
          if (await ancestor(git, path, revision, merge.sourceHead) && await ancestor(git, path, merge.resultSha, base.revision)) {
            evidence.integration = "integrated_verified";
            evidence.merge = { sourceHead: merge.sourceHead, resultSha: merge.resultSha, url: merge.url }; break;
          }
        }
      }
      if (evidence.integration !== "integrated_verified") row.problems.push(`Phase ${phase.id}: ${name} work ${revision} is not verified in origin/${repo.baseBranch}. Supply verified integration evidence or reconcile an explicit preparation step in the dependent phase; a Closed line or closed PR is insufficient.`);
    }
    if (record.developmentAuthorization?.enabled) checkDevelopment(record, candidate, phase, row.problems);
    if (!row.problems.length) { row.classification = "externally_verified"; row.verifiedAt = verifiedAt; }
  }
  // Removed or split completed identities must remain represented in total accounting.
  for (const old of leavesOf(baseline.active.plan)) if (!leaves.some(row => row.id === old.id)) leaves.push({ id: old.id, title: old.title, file: posix.join(record.prdDirectory, old.fileName), classification: "unresolved_earlier_work", repositories: [], problems: [`Phase ${old.id}: earlier completed leaf is absent or split in the current plan.`] });
  for (const [repository, base] of bases) {
    const revision = await remoteBase(git, base.path, base.branch, false);
    input.observeInput?.({ kind: "base", repository, branch: base.branch, revision });
    if (revision !== base.revision) throw new Error(`source_changed: delivery base ${base.path} / ${base.branch} moved during external completion checks. Check again.`);
  }
  return { formatVersion: 1, baselineId: baseline.id, candidateDigest: candidate.digest, leaves, references: extracted.references };
}

function checkDevelopment(record: PrdRecord, candidate: PlanSource, phase: PlannedPhase, problems: string[]): void {
  const state = record.developmentDelivery;
  const assessment = state?.assessments.find(value => { const owner = deliveryOwner(value); return owner.kind === "phase" && owner.phaseId === phase.id; });
  const mechanical = (text: string) => text.replace(/^\*\*Closed:\*\*[^\n]*\n?/gm, "").replace(/^(\s*- )\[[ xX]\](\s+)/gm, "$1[ ]$2");
  const digest = (phaseId: string) => {
    const scopedPhase = candidate.plan.phases.find(one => one.id === phaseId);
    if (!scopedPhase) throw new Error(`Phase ${phaseId} is missing.`);
    const files = Object.keys(candidate.documents).filter(file => posix.dirname(file) === record.prdDirectory && (file.endsWith("-prd.md") || /(?:^|-)technical-design\.md$/.test(file) || posix.basename(file) === scopedPhase.fileName)).sort();
    return hash(files.map(file => [posix.basename(file), mechanical(candidate.documents[file]!)]));
  };
  try {
    if (!state || !assessment || assessment.documentsDigest !== digest(phase.id) || assessment.requirementManifestDigest || state.sourceUnavailable) throw new Error("Restore a current scope-bound development-delivery assessment and its required verification evidence.");
    validateDeliverySplits(state, candidate.plan, digest);
    requireOwnerDeliveryEvidence(state, { kind: "phase", phaseId: phase.id });
  } catch (error) { problems.push(`Phase ${phase.id}: ${(error as Error).message}`); }
}

export function retainCompletionAccounting(directory: string, body: Omit<CompletionAccounting, "id">): CompletionAccounting {
  const value: CompletionAccounting = { ...body, id: hash(body) };
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "completion evidence bytes");
  const path = join(directory, "completion-accounting", `${value.id}.json`);
  if (!existsSync(path)) writeDurableMetadata(path, value);
  return value;
}
export function readCompletionAccounting(directory: string, id: string): CompletionAccounting {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid completion accounting identity.");
  const path = join(directory, "completion-accounting", `${id}.json`);
  if (statSync(path).size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "completion evidence bytes");
  const value = JSON.parse(readFileSync(path, "utf8")) as CompletionAccounting; const { id: stored, ...body } = value;
  if (value.formatVersion !== 1 || stored !== id || hash(body) !== id) throw new Error("Completion accounting is damaged or requires a newer Kiln.");
  return value;
}
