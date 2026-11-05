/** Fictional complete 1–15 plan; all work revisions are generated in disposable Git. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness } from "./engine-harness.js";
import { git } from "./git-repositories.js";
import { observePlan, retainBaseline } from "../engine/plan-reconciliation.js";
import { recordedPlan } from "../engine/plan-reading.js";
import { writePrdRecord } from "../state/records.js";

export const COMET_DIRECTORY = "docs/prds/library-catalog";
export const cometPhase = (id: number | string, closed = false) => `# Phase ${id}: Catalog capability ${id}\n\n${closed ? "**Closed:** 2026-10-01\n\n" : ""}## Acceptance criteria covered\nAC-COMET-01\n`;
export const COMET_PRD = "# PRD: Comet Library\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Catalog and lending.\n";
export async function createCometContinuation() {
  const h = await createHarness({ folder: "library-catalog", auditCycles: true, sessions: [], logGit: true, files: {
    "library-catalog-prd.md": COMET_PRD, "library-catalog-technical-design.md": "# Technical Design\nLibrary catalog.\n",
    ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`phase-${i + 1}-catalog.md`, cometPhase(i + 1, true)])),
  } });
  const commit = () => { git(h.sandbox, h.repository, "add", COMET_DIRECTORY, "catalog.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): record catalog work"); return git(h.sandbox, h.repository, "rev-parse", "HEAD").trim(); };
  const publish = () => { git(h.sandbox, h.repository, "push", "-q", "origin", "develop"); };
  const write = (name: string, text: string) => writeFileSync(join(h.repository, COMET_DIRECTORY, name), text);
  const initial = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const source = observePlan(h.repository, COMET_DIRECTORY);
  const record = h.engine.record;
  record.repository.name = "comet-library"; record.repository.github = "fictional/comet-library";
  record.repositories = [{ name: "comet-library", kind: "prd", mainCheckoutPath: h.repository, github: "fictional/comet-library", baseBranch: "develop", worktreePath: join(h.sandbox.root, "removed-old-workspace"), baseCommit: initial, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  const url = "https://github.com/fictional/comet-library.git";
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, url);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", url);
  record.startedAt = record.setupCompletedAt = "2026-10-01T10:00:00Z";
  record.completedAt = "2026-10-01T12:00:00Z";
  record.plan = recordedPlan(source.plan);
  record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: COMET_DIRECTORY, active: source, sources: [], completions: Object.fromEntries(source.plan.phases.map(phase => [phase.id, { kind: "external", revision: initial, doneAt: "2026-10-01T11:00:00Z" }])) }).id };
  record.phases.pr = { doneAt: record.completedAt, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "comet-library": { startCommit: initial, pushedSha: initial } } };
  record.pullRequests = [{ repository: "comet-library", number: 12, title: "Earlier catalog delivery", url: "https://github.com/fictional/comet-library/pull/12", head: "feature/library-catalog", base: "develop", commits: 7, additions: 70, deletions: 0 }];
  git(h.sandbox, h.repository, "checkout", "-qb", "wt/catalog-accessibility");
  write("phase-8-catalog.md", cometPhase(8, true));
  writeFileSync(join(h.repository, "catalog.txt"), "Accessible catalog work\n");
  const externalRevision = commit();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  write("phase-8-catalog.md", cometPhase(8, true));
  for (let id = 9; id <= 15; id++) write(`phase-${id}-catalog.md`, cometPhase(id) + `\n## Phase dependencies\n${id - 1}.\n`);
  write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8: repository \`comet-library\` at commit \`${externalRevision}\`.\n`);
  // Commit document-only changes; the independent source remains local and unintegrated.
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY);
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): publish revised plan"); publish();
  writePrdRecord(h.stateDirectory, record);
  return { h, externalRevision, write, publish, integrate: () => { git(h.sandbox, h.repository, "merge", "--no-edit", "wt/catalog-accessibility"); publish(); } };
}
