import type { LiveTarget } from "../../../src/live/target.js";
/** Page memory survives route/screen changes, always keyed by the exact attempt. */
class LiveDraft {
  text = $state("");
  submitting = $state(false);
  instructionId = $state<string>();
  submittedText = $state<string>();
  feedback = $state<string>();
}
const drafts = new Map<string, LiveDraft>();
export function liveDraft(target: LiveTarget): LiveDraft {
  const key = JSON.stringify([target.executionId, target.activityId, target.activityKey, target.sessionId, target.providerSessionId, target.attemptId]);
  let draft = drafts.get(key);
  if (!draft) { draft = new LiveDraft(); drafts.set(key, draft); }
  return draft;
}
