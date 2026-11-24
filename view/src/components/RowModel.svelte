<script lang="ts">
  // A row's model line (Kiln Phase Model Tiers AC-PICK-02): what the activity will run on, runs
  // on or ran on, with the note that Claude Code isn't installed (AC-DEFAULT-04) and a choice
  // that can't be used (AC-PICK-06).
  import type { ModelView } from "../../../src/engine/activity-models.js";
  import { CLAUDE_CODE_MISSING_NOTE, rowModelLine } from "../lib/models.js";

  let { model, underway }: { model: ModelView; underway: boolean } = $props();
  const line = $derived(rowModelLine(model, underway));
</script>

{#if line || model.problem}
  <span class="model-line">
    {#if line}<span class="model" data-model-state={model.state}>{line}</span>{/if}
    {#if model.claudeCodeMissing}<span class="note">{CLAUDE_CODE_MISSING_NOTE}</span>{/if}
    {#if model.problem}<span class="problem">{model.problem}</span>{/if}
  </span>
{/if}

<style>
  .model-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; margin-top: 4px; }
  .model { font-size: 13.5px; color: var(--muted); }
  .note { font-size: 12.5px; color: var(--dim); }
  .problem { flex-basis: 100%; font-size: 12.5px; color: var(--amber); line-height: 1.5; }
</style>
