<script lang="ts">
  // The Models block (Kiln Model Modes AC-PRD-01, AC-PRD-02; mockups 5, 6 and 7, states C and D):
  // the two ways to pick models for this PRD, Recommended model for each phase, with one line
  // saying when the fallback is used and a link to Model defaults, and One model for this PRD,
  // with its agent, model and effort while selected. A choice made here applies to this PRD alone
  // at once (`choose`), and the PRD follows the defaults again when its settings match them. When
  // the PRD has its own settings the block says so and offers Use my defaults here (AC-SAVE-05).
  // Documents found and the run's settings offer the controls; the Models card on Needs you, the
  // stopped-phase and waiting pages, and the Folder missing setup panel show the choice in force
  // without them (`controls` false). The Audits line shows while the recommended choice is in
  // force, or the audits' choice is changed for this PRD (Kiln Model Modes, "Snapshot").
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { ModelDefaultsView } from "../../../src/models/model-defaults-edit.js";
  import { chooseModels, modelDefaults, useModelDefaults } from "../lib/api.js";
  import { modelDefaultsPath, routedClick } from "../lib/router.svelte.js";
  import { familyEditorAgents, oneModelLine, recommendedLine, type EditorAgent } from "../lib/models.js";
  import { viewContext } from "../lib/view-context.js";
  import ModelEditor from "./ModelEditor.svelte";
  import RowModel from "./RowModel.svelte";

  // `readOnly` (the Folder missing panel) also drops the Audits Change: nothing runs, or changes, until the run is set up again.
  // `settings` draws the labels as the run's settings draw theirs; otherwise as Documents found's fields.
  let { snapshot, connected, controls = false, readOnly = false, settings = false }: { snapshot: Snapshot; connected: boolean; controls?: boolean; readOnly?: boolean; settings?: boolean } = $props();
  const { config, router } = viewContext();
  const models = $derived(snapshot.settings.models);
  const defaults = $derived(modelDefaultsPath(config.base));
  const oneModel = $derived(models.mode === "one_model");
  const own = $derived(models.source === "prd");
  const audits = $derived(models.audits);
  const auditsShown = $derived(!oneModel || audits.changedByYou);
  const EVERYTHING = "Every phase, both audits, the preflight, and the pull request, merge and push sessions.";

  let busy = $state(false);
  let reason = $state<string | undefined>(undefined);
  // Re-draws the radios after a refused choice, so they show the choice still in force.
  let drawn = $state(0);

  // The one model's editor offers each agent's families, which only `GET /api/model-defaults` reads; fetched again when the settings change.
  let families = $state<ModelDefaultsView["agents"] | undefined>(undefined);
  $effect(() => {
    void models.revision;
    if (!controls || !oneModel) return;
    let current = true;
    void modelDefaults(config).then(answer => { if (current && answer.ok) families = answer.view.agents; });
    return () => { current = false; };
  });
  const editorAgents = $derived<EditorAgent[]>(familyEditorAgents(families ?? []));
  // A refusal says why the last choice wasn't applied; it goes once the settings change.
  $effect(() => { void models.revision; reason = undefined; });

  async function send(request: () => ReturnType<typeof chooseModels>) {
    busy = true;
    const answer = await request();
    busy = false;
    reason = answer.ok ? undefined : answer.reason;
    if (!answer.ok) drawn += 1;
  }
  /** A person's own action on one of the block's controls; never sent on render or a republished snapshot (Kiln Model Modes, "HTTP"). */
  const choose = (mode: "recommended" | "one_model") => send(() => chooseModels(config, { mode }));
  const pickOneModel = (picked: { agentId: string; value: string; effort?: string }) => send(() => chooseModels(config, { oneModel: { agentId: picked.agentId as "claude_code" | "codex", family: picked.value, ...(picked.effort ? { effort: picked.effort } : {}) } }));
  const useDefaults = () => send(() => useModelDefaults(config));
  const disabled = $derived(!connected || busy);
</script>

{#snippet link()}<a class="link" href={defaults} onclick={(event) => routedClick(event, router, defaults)}>{own ? "Models for this PRD" : "Model defaults"}</a>{/snippet}

<div class="lines" class:settings data-models-block>
  <div class="line">
    <span class="label" id="models-block-l">Models</span>
    {#if controls}
      {#key drawn}
      <div class="choices" role="radiogroup" aria-labelledby="models-block-l" data-models-mode={models.mode}>
        <div class="choice" class:selected={!oneModel}>
          <label class="pick"><input type="radio" name="prd-mode" value="recommended" checked={!oneModel} {disabled} onchange={() => choose("recommended")} /><span class="words"><span class="name">Recommended model for each phase</span><span class="help">{recommendedLine(models.fallback)}</span></span></label>
          <span class="under">{@render link()}</span>
        </div>
        <div class="choice" class:selected={oneModel}>
          <label class="pick"><input type="radio" name="prd-mode" value="one_model" checked={oneModel} {disabled} onchange={() => choose("one_model")} /><span class="words"><span class="name">One model for this PRD</span><span class="help">{EVERYTHING}</span></span></label>
          {#if oneModel}
            <div class="under">
              {#if families}
                <ModelEditor agents={editorAgents} agentId={models.oneModel.agentId} value={models.oneModel.family} effort={models.oneModel.effort} label="One model for this PRD" {disabled} onchange={() => {}} onpick={pickOneModel} />
              {:else}<span class="help">{oneModelLine(models.oneModel)}</span>{/if}
              {#if models.oneModel.problem}<span class="help problem">{models.oneModel.problem}</span>{/if}
              <span class="help">At a usage limit this PRD waits and picks up again.</span>
            </div>
          {/if}
        </div>
      </div>
      {/key}
      {#if own}<div class="own" data-own-settings><span class="help">This PRD has its own settings.</span><button type="button" class="button" {disabled} onclick={useDefaults}>Use my defaults here</button></div>{/if}
      {#if reason}<span class="help problem" role="alert">{reason}</span>{/if}
    {:else}
      <span class="value" data-models-mode={models.mode}>{oneModel ? "One model for this PRD" : "Recommended model for each phase"}</span>
      {#if oneModel}
        <span class="help">{oneModelLine(models.oneModel)}. At a usage limit this PRD waits and picks up again.</span>
        {#if models.oneModel.problem}<span class="help problem">{models.oneModel.problem}</span>{/if}
      {:else}<span class="help">{recommendedLine(models.fallback)}</span>{/if}
      <span class="help">{#if own}<span data-own-settings>This PRD has its own settings.</span>{" "}{/if}{@render link()}</span>
    {/if}
  </div>
  {#if auditsShown}
  <div class="line">
    <span class="label">Audits</span>
    <RowModel model={{ state: "will_run_on", ...(audits.choice ? { choice: audits.choice } : {}), ...(audits.claudeCodeMissing ? { claudeCodeMissing: true } : {}), ...(audits.problem ? { problem: audits.problem } : {}), ...(audits.fallback ? { fallback: audits.fallback } : {}), ...(audits.noFallback ? { noFallback: true } : {}), from: audits.changedByYou ? "changed" : "model_defaults", ...(readOnly ? {} : { change: audits.change, ...(audits.useDefault ? { useDefault: true } : {}) }) }} underway={false} target="audits" agents={snapshot.agents} {connected} label="Audits model" />
    <span class="help">The delivery audit and the test audit. Not a tier: they check the whole PRD.</span>
  </div>
  {/if}
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
  .choices { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
  .choice { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--line-strong); }
  .choice.selected { border: 2px solid var(--text); padding: 13px 15px; }
  .pick { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
  .pick input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--accent, #e2694f); flex: none; }
  .words { display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 15px; font-weight: 600; color: var(--text); }
  .under { display: flex; flex-direction: column; gap: 6px; padding-left: 30px; }
  .own { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px; margin-top: 6px; }
  .button { min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; color: var(--text); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .button:disabled { opacity: 0.5; cursor: default; }
  a { color: var(--text); text-underline-offset: 3px; }
  .link { align-self: flex-start; font-size: 13.5px; }
</style>
