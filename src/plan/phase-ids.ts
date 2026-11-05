// Phase ids as phase-split writes them: alternating digit and letter runs, `2`, `2a`, `2a1`.

const PHASE_ID = /^\d+(?:[a-z]+\d+)*[a-z]*$/;

/** True when the text is a phase id such as `2`, `2a` or `2a1`. */
export function isPhaseId(text: string): boolean {
  return PHASE_ID.test(text);
}

/**
 * The id part of a phase document's file name: the text between `phase-` and the next `-`.
 * Returns undefined for a name that isn't `phase-*.md` at all, and the raw text (which may
 * not parse as an id) otherwise.
 *
 *   idTextFromFileName("phase-2a1-store-credit.md")  // "2a1"
 *   idTextFromFileName("phase-notes.md")             // "notes" (not a valid id)
 */
export function idTextFromFileName(fileName: string): string | undefined {
  const match = /^phase-([^-]*?)(?:-.*)?\.md$/.exec(fileName);
  return match ? match[1] : undefined;
}

/** True for a file name the plan reader looks at: `phase-*.md`. */
export function isPhaseFileName(fileName: string): boolean {
  return /^phase-.*\.md$/.test(fileName);
}

function runs(id: string): string[] {
  return id.match(/\d+|[a-z]+/g) ?? [];
}

/** The id of the split record a phase belongs to, or undefined for a top-level phase. */
export function parentId(id: string): string | undefined {
  const parts = runs(id);
  return parts.length > 1 ? parts.slice(0, -1).join("") : undefined;
}

/** True when `ancestor` is `id`'s parent, grandparent and so on (not `id` itself). */
export function isAncestorOf(ancestor: string, id: string): boolean {
  const ancestorRuns = runs(ancestor);
  const idRuns = runs(id);
  return ancestorRuns.length < idRuns.length && ancestorRuns.every((part, index) => idRuns[index] === part);
}
