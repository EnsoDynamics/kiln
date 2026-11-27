<script lang="ts">
  // The model lines in Documents found's delivery panel, the run's settings and the Folder missing
  // setup panel (Kiln Phase Model Tiers AC-DEFAULT-02, AC-OTHER-01, AC-FALLBACK-01; mockups 1 and
  // 2): how models are picked, for each phase or one model for everything, with a Model defaults
  // link; this PRD's Audits choice, with Change and, once changed, Use the default; and what the
  // settings in force do when usage is nearly out (Kiln Model Modes AC-MODE-02, AC-MODE-03,
  // AC-WHEN-02, AC-WHEN-03). The Audits line shows while the recommended model for each phase is
  // in force, or the audits' choice is changed for this PRD (Kiln Model Modes, "Snapshot").
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { modelDefaultsPath, routedClick } from "../lib/router.svelte.js";
  import { fallbackLine, modelsLine } from "../lib/models.js";
  import { viewContext } from "../lib/view-context.js";
  import RowModel from "./RowModel.svelte";

  // The Folder missing panel shows the lines without Change: nothing runs, or changes, until the run is set up again.
  // `settings` draws the labels as the run's settings draw theirs; otherwise as Documents found's fields.
  let { snapshot, connected, counts, readOnly = false, settings = false }: { snapshot: Snapshot; connected: boolean; counts?: string | undefined; readOnly?: boolean; settings?: boolean } = $props();
  const { config, router } = viewContext();
  const models = $derived(snapshot.settings.models);
  const defaults = $derived(modelDefaultsPath(config.base));
  const fallback = $derived(fallbackLine(models));
  const oneModel = $derived(models.mode === "one_model");
  const auditsShown = $derived(!oneModel || models.audits.changedByYou);
  const audits = $derived(models.audits);
  const underway = $derived(snapshot.feature.state !== "not_started");
</script>

{#snippet link()}<a href={defaults} onclick={(event) => routedClick(event, router, defaults)}>Model defaults</a>{/snippet}

<div class="lines" class:settings>
  <div class="line">
    <span class="label">Models</span>
    <span class="value" data-models-mode={models.mode}>{modelsLine(models)}</span>
    {#if oneModel}<span class="help">Every phase, both audits, the preflight, and the pull request, merge and push sessions.</span>{:else if counts}<span class="help">{counts}</span>{/if}
    {#if models.oneModel.problem && oneModel}<span class="help problem">{models.oneModel.problem}</span>{/if}
    {#if models.source === "prd"}<span class="help" data-own-settings>This PRD has its own settings.</span>{/if}
    <span class="help">{#if !readOnly}Change any phase {underway ? "that hasn't started, " : ""}in the phase plan.{" "}{/if}{@render link()}</span>
  </div>
  {#if auditsShown}
  <div class="line">
    <span class="label">Audits</span>
    <RowModel model={{ state: "will_run_on", ...(audits.choice ? { choice: audits.choice } : {}), ...(audits.claudeCodeMissing ? { claudeCodeMissing: true } : {}), ...(audits.problem ? { problem: audits.problem } : {}), ...(audits.fallback ? { fallback: audits.fallback } : {}), ...(audits.noFallback ? { noFallback: true } : {}), from: audits.changedByYou ? "changed" : "model_defaults", ...(readOnly ? {} : { change: audits.change, ...(audits.useDefault ? { useDefault: true } : {}) }) }} underway={false} target="audits" agents={snapshot.agents} {connected} label="Audits model" />
    <span class="help">The delivery audit and the test audit. Not a tier: they check the whole PRD.</span>
  </div>
  {/if}
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
  .problem { color: var(--amber); }
  a { color: var(--text); text-underline-offset: 3px; }
</style>
