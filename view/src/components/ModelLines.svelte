<script lang="ts">
  // The model lines in Documents found's delivery panel, the run's settings and the Folder missing
  // setup panel (Kiln Phase Model Tiers AC-DEFAULT-02, AC-OTHER-01, AC-FALLBACK-01; mockups 1 and
  // 2): models are chosen for each phase, with a Model defaults link; this PRD's Audits choice, with
  // Change and, once changed, Use the default; and whether the fallback is on, at which threshold.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { modelDefaultsPath, routedClick } from "../lib/router.svelte.js";
  import { fallbackLine } from "../lib/models.js";
  import { viewContext } from "../lib/view-context.js";
  import RowModel from "./RowModel.svelte";

  // The Folder missing panel shows the lines without Change: nothing runs, or changes, until the run is set up again.
  // `settings` draws the labels as the run's settings draw theirs; otherwise as Documents found's fields.
  let { snapshot, connected, counts, readOnly = false, settings = false }: { snapshot: Snapshot; connected: boolean; counts?: string | undefined; readOnly?: boolean; settings?: boolean } = $props();
  const { config, router } = viewContext();
  const models = $derived(snapshot.settings.models);
  const defaults = $derived(modelDefaultsPath(config.base));
  const fallback = $derived(fallbackLine(models.fallback));
  const underway = $derived(snapshot.feature.state !== "not_started");
</script>

{#snippet link()}<a href={defaults} onclick={(event) => routedClick(event, router, defaults)}>Model defaults</a>{/snippet}

<div class="lines" class:settings>
  <div class="line">
    <span class="label">Models</span>
    <span class="value">Chosen for each phase</span>
    {#if counts}<span class="help">{counts}</span>{/if}
    <span class="help">{#if !readOnly}Change any phase {underway ? "that hasn't started, " : ""}in the phase plan.{" "}{/if}{@render link()}</span>
  </div>
  <div class="line">
    <span class="label">Audits</span>
    <RowModel model={{ state: "will_run_on", ...(models.audits.choice ? { choice: models.audits.choice } : {}), ...(models.audits.claudeCodeMissing ? { claudeCodeMissing: true } : {}), ...(models.audits.problem ? { problem: models.audits.problem } : {}), from: models.audits.changedByYou ? "changed" : "model_defaults", ...(readOnly ? {} : { change: models.audits.change, ...(models.audits.useDefault ? { useDefault: true } : {}) }) }} underway={false} target="audits" agents={snapshot.agents} {connected} label="Audits model" />
    <span class="help">The preflight and the pull request session use it too.</span>
  </div>
  <div class="line">
    <span class="label">If usage is nearly out</span>
    <span class="value">{fallback.value}</span>
    <span class="help">{#if fallback.help}{fallback.help} {@render link()}.{:else}{@render link()}{/if}</span>
  </div>
</div>

<style>
  .lines { display: flex; flex-direction: column; gap: 14px; }
  .line { display: flex; flex-direction: column; gap: 3px; }
  .label { font-size: 13px; font-weight: 500; color: var(--muted); }
  .settings .label { font-size: 12.5px; font-weight: 400; color: var(--dim); }
  .value { font-size: 14.5px; color: var(--text); }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.55; }
  .settings .help { line-height: 1.5; }
  a { color: var(--text); text-underline-offset: 3px; }
</style>
