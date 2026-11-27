// The Model defaults page's unsaved changes, kept in page memory (Kiln Model Modes, "Leaving with a
// draft"; AC-SAVE-02). The browser's Back and Forward can't be refused the way the button back and
// the Kiln mark are, because the address has already changed when the view hears of them, so the
// draft outlives the screen and shows again, under its save bar, when Model defaults reopens.

import type { SaveTarget, SettingsEdits } from "../../../src/models/settings-change.js";

class ModelDefaultsDraft {
  /** The person's edits, over what was last read, or over Kiln's choices while Restore is pending. */
  edits = $state<SettingsEdits>({});
  /** Restore Kiln's defaults is pending. */
  restore = $state(false);
  /** Where Save would send the changes; with a draft it stays as the person last saw it. */
  target = $state<SaveTarget>("every_prd");
  /** Whether Save would send anything, as the page last worked it out; the browser's leave-page prompt reads it from any screen. */
  pending = $state(false);

  discard(): void { this.edits = {}; this.restore = false; this.pending = false; }
}

/** One page is one PRD's view, so it has one draft. */
export const modelDefaultsDraft = new ModelDefaultsDraft();
