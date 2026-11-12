/** Unsent text and action feedback live for this page visit, never on disk or in a snapshot. */
export interface PhaseRecoveryPage {
  key: string;
  attemptKey?: string | undefined;
  draft: string;
  choice: boolean;
  unsent: boolean;
  pending?: "reply" | "resume" | "verify" | "advance" | "mark" | "carry" | "start" | "reopen";
  feedback?: string;
  /** The Mark complete offer pressed, kept while its rerun runs (waivers AC-WAIVE-06). */
  markOffer?: Extract<import("../../../src/engine/waivers.js").MarkCompleteOffer, { offered: true }>;
  /** What a refused Mark complete reported as changed (AC-WAIVE-04). */
  markChanges?: import("../../../src/engine/waivers.js").ItemChange[];
  markError?: string;
  /** A Check again on this page reported the activity still unfinished. */
  rechecked?: boolean;
}
