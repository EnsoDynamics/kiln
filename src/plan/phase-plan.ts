// The phase plan: every phase document in plan order, with the structural checks that make a
// plan read and the start checks run on it (technical design, "The Plan Reader";
// PRD AC-START-02). Wording of each problem: assumptions UI-010 item 10.

import { readPhaseDocument, type PhaseDocument } from "./phase-document.js";
import { firstLink, linkedFileName } from "./markdown-sections.js";
import { idTextFromFileName, isAncestorOf, isPhaseFileName, isPhaseId, parentId } from "./phase-ids.js";

export interface PlannedPhase {
  id: string;
  fileName: string;
  title: string;
  closed: boolean;
  /** The repositories its `**Repositories:**` line names (multi-repo AC-REPO-01). */
  repositories: string[];
  /** Child ids in `## Split into` order, for a split record; undefined for a leaf. */
  splitInto: string[] | undefined;
  citedCriteria: string[];
  dependenciesText: string | undefined;
}

export interface PhasePlan {
  /** Every readable phase in plan order: a split record, then its children in its slot. */
  phases: PlannedPhase[];
  /** Problems that stop the plan from reading (unparseable or duplicate ids, unlisted or missing children). */
  problems: string[];
}

export interface PhaseFile {
  fileName: string;
  markdown: string;
}

/**
 * Reads the plan from the PRD directory's `phase-*.md` files.
 *
 *   const plan = readPhasePlan([{ fileName: "phase-1-intake.md", markdown }]);
 *   plan.phases.filter((phase) => !phase.splitInto)  // the leaves, in plan order
 */
export function readPhasePlan(files: PhaseFile[]): PhasePlan {
  const problems: string[] = [];
  const documents = files
    .filter((file) => isPhaseFileName(file.fileName))
    .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
    .map((file) => readPhaseDocument(file.fileName, file.markdown));

  const byId = new Map<string, PhaseDocument>();
  for (const document of documents) {
    if (!isPhaseId(document.idText)) {
      problems.push(`${document.fileName} has a phase id Kiln can't read: "${document.idText}".`);
      continue;
    }
    const existing = byId.get(document.idText);
    if (existing) {
      problems.push(`${existing.fileName} and ${document.fileName} both have phase id ${document.idText}.`);
      continue;
    }
    byId.set(document.idText, document);
    if (document.repositoriesProblem !== undefined) problems.push(document.repositoriesProblem);
  }

  for (const document of byId.values()) {
    for (const row of document.splitInto ?? []) {
      if (parentId(row.id) !== document.idText) {
        problems.push(`${document.fileName} lists ${row.id}, which isn't one of its child phases.`);
      } else if (!byId.has(row.id)) {
        problems.push(`${document.fileName} lists ${row.id}, which has no file.`);
      }
    }
    const parent = parentId(document.idText);
    if (parent === undefined) continue;
    const parentDocument = byId.get(parent);
    if (!parentDocument) {
      problems.push(`${document.fileName} is phase ${document.idText}, but there is no phase ${parent} document to list it.`);
    } else if (!parentDocument.splitInto?.some((row) => row.id === document.idText)) {
      problems.push(`${document.fileName} is phase ${document.idText}, but ${parentDocument.fileName} doesn't list it under ## Split into.`);
    }
  }

  const phases: PlannedPhase[] = [];
  const visit = (document: PhaseDocument) => {
    phases.push(toPlannedPhase(document));
    for (const row of document.splitInto ?? []) {
      const child = byId.get(row.id);
      if (child && parentId(row.id) === document.idText && !phases.some((phase) => phase.id === row.id)) visit(child);
    }
  };
  const topLevel = [...byId.values()]
    .filter((document) => parentId(document.idText) === undefined)
    .sort((a, b) => Number.parseInt(a.idText, 10) - Number.parseInt(b.idText, 10));
  topLevel.forEach(visit);

  return { phases, problems };
}

function toPlannedPhase(document: PhaseDocument): PlannedPhase {
  return {
    id: document.idText,
    fileName: document.fileName,
    title: document.title,
    closed: document.closed,
    repositories: document.repositories,
    splitInto: document.splitInto?.map((row) => row.id),
    citedCriteria: document.citedCriteria,
    dependenciesText: document.dependenciesText,
  };
}

/**
 * The named repositories: every phase document's names other than the PRD's repository's own,
 * compared exactly, in first-mention plan order (multi-repo AC-REPO-01). A split record's names
 * count like any other's.
 *
 *   namedRepositories(plan, "product")  // ["returns-api", "storefront"]
 */
export function namedRepositories(phases: { repositories: string[] }[], prdRepositoryName: string): string[] {
  const names: string[] = [];
  for (const phase of phases) {
    for (const name of phase.repositories) if (name !== prdRepositoryName && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The leaves (phases with no `## Split into` table), in plan order. */
export function leavesOf(plan: PhasePlan): PlannedPhase[] {
  return plan.phases.filter((phase) => phase.splitInto === undefined);
}

/**
 * The start checks that look at the plan's content: every leaf cites at least one acceptance
 * criterion, and every dependency names an earlier phase that has a document. Only run on a
 * plan with no structural problems, since plan order is undefined otherwise.
 */
export function planStartProblems(plan: PhasePlan, prdDirectoryFromRoot: string): string[] {
  const problems: string[] = [];
  for (const leaf of leavesOf(plan)) {
    if (leaf.citedCriteria.length === 0) problems.push(`${prdDirectoryFromRoot}/${leaf.fileName} cites no acceptance criteria.`);
  }
  const position = new Map(plan.phases.map((phase, index) => [phase.id, index]));
  for (const phase of plan.phases) {
    for (const dependency of dependencyIds(phase.dependenciesText)) {
      if (dependency === phase.id || isAncestorOf(dependency, phase.id) || isAncestorOf(phase.id, dependency)) continue;
      const dependencyPosition = position.get(dependency);
      if (dependencyPosition === undefined) {
        problems.push(`${phase.fileName} depends on phase ${dependency}, which has no phase document.`);
      } else if (dependencyPosition > position.get(phase.id)!) {
        problems.push(`${phase.fileName} depends on phase ${dependency}, which comes later in the plan.`);
      }
    }
  }
  return problems;
}

/**
 * The phase ids a `## Phase dependencies` section names, in the form phase-split writes:
 * `1 (the notification records); 2a (the retry queue)`. Prose isn't read: an item counts only
 * when it is nothing but an id, optionally after `Phase`/`Phases`, optionally followed by a
 * period or by ` — ` and a description.
 *
 *   dependencyIds("None.")                                   // []
 *   dependencyIds("1 (the records); Phases 2a and 2b")       // ["1", "2a", "2b"]
 *   dependencyIds("Needs the schema from 2026-10-01.")       // []
 */
export function dependencyIds(text: string | undefined): string[] {
  if (text === undefined) return [];
  if (/^None\b/i.test(text.trim())) return [];

  // Links first, so dropping parenthesized text doesn't take their targets with it.
  let flattened = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (whole: string, linkText: string) => {
    const link = firstLink(whole);
    const fileName = link ? linkedFileName(link.href) : "";
    return isPhaseFileName(fileName) ? (idTextFromFileName(fileName) ?? linkText) : linkText;
  });
  let previous;
  do {
    previous = flattened;
    flattened = flattened.replace(/\([^()]*\)/g, "");
  } while (flattened !== previous);
  flattened = flattened.replace(/[ \t]+([.;,])/g, "$1");

  // Items break at blank lines and list bullets; a hard-wrapped line continues the one before.
  const chunks: string[] = [];
  let current: string | undefined;
  for (const line of flattened.split(/\r?\n/)) {
    if (line.trim() === "") {
      current = undefined;
    } else if (/^\s*[-*+]\s+/.test(line) || current === undefined) {
      current = line.replace(/^\s*[-*+]\s+/, "");
      chunks.push(current);
    } else {
      current = `${current} ${line.trim()}`;
      chunks[chunks.length - 1] = current;
    }
  }

  const ids: string[] = [];
  for (const chunk of chunks) {
    for (const rawItem of chunk.split(/;|,|\sand\s/)) {
      const item = rawItem.trim().replace(/^Phases?\s+/i, "");
      const match = /^(\d+(?:[a-z]+\d+)*[a-z]*)(?:\.|\s+—\s+.*)?$/.exec(item);
      if (match && !ids.includes(match[1]!)) ids.push(match[1]!);
    }
  }
  return ids;
}
