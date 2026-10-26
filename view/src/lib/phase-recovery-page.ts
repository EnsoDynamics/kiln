/** Unsent text and action feedback live for this page visit, never on disk or in a snapshot. */
export interface PhaseRecoveryPage {
  key: string;
  attemptKey?: string | undefined;
  draft: string;
  choice: boolean;
  unsent: boolean;
  pending?: "reply" | "resume" | "verify" | "advance";
  feedback?: string;
}
