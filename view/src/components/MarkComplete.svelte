<script lang="ts">
  // Mark complete (AC-WAIVE-02, AC-WAIVE-03): the heading, the sentence saying what Kiln waives,
  // what it does next and how the activity will show, and the button, which reads Checking…
  // while Kiln reruns the checks. A refused waiver says the results changed (AC-WAIVE-04); an
  // error shows by the button.
  import type { ItemChange, MarkCompleteOffer } from "../../../src/engine/waivers.js";
  import { changedNote } from "../lib/waivers.js";
  import WarningMarker from "./WarningMarker.svelte";

  let { offer, pending, disabled, changes = [], error, onmark }: {
    offer: Extract<MarkCompleteOffer, { offered: true }>; pending: boolean; disabled: boolean;
    changes?: readonly ItemChange[]; error?: string | undefined; onmark: () => void;
  } = $props();
  const NO_REPORT = "No audit report.";
  const paragraphs = $derived(offer.sentence.map(text => ({
    text,
    kind: offer.noReport && text.startsWith(NO_REPORT) ? "no-report" as const : /^(Mark it complete|Continue anyway)\b/.test(text) ? "main" as const : "feedback" as const,
  })));
</script>

<div class="mark-complete">
  <h3>{offer.heading}</h3>
  {#each paragraphs as paragraph, index (index)}
    {#if paragraph.kind === "no-report"}<p class="feedback"><WarningMarker text="No audit report" /><br />{paragraph.text.slice(NO_REPORT.length).trim()}</p>
    {:else if paragraph.kind === "main"}<p class="hint">{paragraph.text}</p>
    {:else}<p class="feedback">{paragraph.text}</p>{/if}
  {/each}
  <div class="actions"><button type="button" class="button" disabled={disabled || pending} onclick={onmark}>{pending ? "Checking…" : offer.label}</button></div>
  {#if error}<p class="reason" role="alert">{error}</p>{/if}
  {#if changes.length}<p class="feedback" role="status"><strong>The results changed since your last check.</strong> {changedNote(changes)}</p>{/if}
</div>

<style>
  .mark-complete { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid var(--line); }
  h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); line-height: 1.35; }
  p { margin: 0; line-height: 1.6; }
  .hint { font-size: 13.5px; color: var(--muted); }
  .feedback { font-size: 13px; color: var(--muted); border-left: 3px solid var(--amber); padding: 8px 12px; background: var(--deep); }
  .feedback strong { color: var(--text); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .button { white-space: normal; align-self: flex-start; }
  .button:disabled { opacity: .45; cursor: not-allowed; }
  .reason { font-size: 12.5px; color: var(--amber); }
</style>
