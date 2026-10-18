<script lang="ts">
  // Change on Running and Paused opens the Documents found Model list and Effort buttons in
  // place; each choice is saved at once, with no Save button (UI-009, UI-011). Effort always
  // shows its five buttons, the ones the chosen model doesn't take disabled.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Effort, Settings } from "../../../src/state/records.js";
  import { EFFORT_LABELS, EFFORTS, effortDisabled, modelOptions } from "../lib/documents-found.js";

  let { snapshot, save }: { snapshot: Snapshot; save: (change: Partial<Settings>) => void } = $props();
  const settings = $derived(snapshot.settings);
  const models = $derived(modelOptions(snapshot));

  function chooseEffort(effort: Effort) {
    if (!effortDisabled(settings, effort)) save({ effort });
  }
</script>

<div class="editor">
  <div class="field">
    <label for="change-model">Model</label>
    <select id="change-model" value={settings.model.value} onchange={(event) => save({ model: event.currentTarget.value })}>
      {#each models as model (model.value)}<option value={model.value}>{model.displayName}</option>{/each}
    </select>
    {#if settings.fieldErrors.model}<span class="message">{settings.fieldErrors.model}</span>{/if}
    {#if settings.modelListError}<span class="message">{settings.modelListError}</span>{/if}
  </div>
  <fieldset class="effort">
    <legend>Effort</legend>
    <div class="segments">
      {#each EFFORTS as effort (effort)}
        {@const pressed = settings.effortLevels?.length !== 0 && settings.effort === effort}
        <button type="button" aria-pressed={pressed} class:pressed disabled={effortDisabled(settings, effort)} onclick={() => chooseEffort(effort)}>{EFFORT_LABELS[effort]}</button>
      {/each}
    </div>
  </fieldset>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  label, legend { font-size: 13px; font-weight: 500; color: var(--muted); }
  select { height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field); color: var(--text); font-family: var(--sans); font-size: 14px; box-sizing: border-box; width: 100%; }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.55; }
  .effort { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  legend { padding: 0; margin-bottom: 8px; }
  .segments { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
  .segments button { min-height: 40px; padding: 0 4px; border: 0; background: transparent; color: var(--muted); font-family: var(--sans); font-size: 12.5px; font-weight: 500; cursor: pointer; }
  .segments button.pressed { background: var(--text); color: var(--bg); font-weight: 600; }
  .segments button:disabled { cursor: not-allowed; opacity: 0.4; }
  .segments button.pressed:disabled { opacity: 0.6; }
</style>
