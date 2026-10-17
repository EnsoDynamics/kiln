// The Documents found mockup's sample data as a Snapshot (fictional), for the view's tests.

import type { Snapshot } from "../../../src/engine/snapshot.js";

export function documentsFoundSnapshot(overrides: { settings?: Partial<Snapshot["settings"]>; documents?: Partial<NonNullable<Snapshot["documents"]>> } & Partial<Omit<Snapshot, "settings" | "documents">> = {}): Snapshot {
  const { settings, documents, ...rest } = overrides;
  return {
    feature: { name: "Customer returns", repositoryName: "acme-shop", prdFolder: "docs/prds/customer-returns/", state: "not_started", phasesDone: 0, phasesTotal: 5 },
    documents: {
      prd: { file: "customer-returns-prd.md", criteriaCount: 14, firstLabel: "AC-RET-01", lastLabel: "AC-RET-14" },
      design: { file: "technical-design.md", criteriaCited: 14 },
      assumptions: { file: "assumptions.md", total: 11, notYetConfirmed: 2 },
      plan: {
        phaseDocCount: 6,
        leafCount: 5,
        closedCount: 0,
        phases: [
          { id: "1", title: "Return intake", closed: false },
          { id: "2", title: "Refund routing", splitInto: ["2a", "2b"], closed: false },
          { id: "2a", title: "Card refunds", closed: false },
          { id: "2b", title: "Store credit", closed: false },
          { id: "3", title: "Returns dashboard", closed: false },
          { id: "4", title: "Restock check-in", closed: false },
        ],
      },
      checks: [
        { name: "Every phase cites its criteria", passed: true },
        { name: "Dependencies point backward", passed: true },
        { name: "Working tree is clean", passed: true },
      ],
      ...documents,
    },
    settings: {
      agent: "Claude Code",
      model: { value: "opus", displayName: "Opus 5.5" },
      effort: "high",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
      keepAwake: true,
      worktreePath: "~/devel/acme-shop-kiln/customer-returns",
      featureBranch: "feature/customer-returns",
      baseBranch: "develop",
      baseBranches: ["develop", "main"],
      baseCheck: "ok",
      fixed: false,
      fieldErrors: {},
      ...settings,
    },
    models: [
      { value: "opus", displayName: "Opus 5.5" },
      { value: "fable", displayName: "Fable 5.1" },
      { value: "sonnet", displayName: "Sonnet 5.5" },
    ],
    phases: [],
    pause: { pending: false, active: false },
    account: {
      email: "alex@acme-shop.dev",
      plan: "Max plan",
      updatedAt: "2026-10-17T13:15:00Z",
      limits: [
        { label: "5-hour window", shortLabel: "5-hour", percent: 13, nearLimit: false },
        { label: "Weekly", shortLabel: "weekly", percent: 22, nearLimit: false },
        { label: "Weekly · Fable", shortLabel: "Fable", percent: 0, nearLimit: false },
      ],
    },
    ...rest,
  };
}
