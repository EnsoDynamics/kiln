<script lang="ts">
  // A row's model line (Kiln Phase Model Tiers AC-PICK-02): what the activity will run on, runs
  // on or ran on, with the note that Claude Code isn't installed (AC-DEFAULT-04) and a choice
  // that can't be used (AC-PICK-06). Where the row offers it, Change opens the agent, model and
  // effort choices, and a choice Changed by you offers Use the default (AC-PICK-03); a Delivery
  // audit or Test audit row's change is this PRD's Audits choice (AC-OTHER-01).
  import type { ModelView } from "../../../src/engine/activity-models.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { changeModel } from "../lib/api.js";
  import { CLAUDE_CODE_MISSING_NOTE, rowEditorAgents, rowModelLine } from "../lib/models.js";
  import { viewContext } from "../lib/view-context.js";
  import ModelEditor from "./ModelEditor.svelte";

  let { model, underway, target, agents = [], connected = true, label = "Model" }: {
    model: ModelView; underway: boolean; target?: { phase: string } | "audits" | undefined; agents?: Snapshot["agents"]; connected?: boolean; label?: string;
  } = $props();
  const { config } = viewContext();
  const line = $derived(rowModelLine(model, underway));
  const offered = $derived(target !== undefined && model.change !== undefined);
  let open = $state(false);
  let busy = $state(false);
  let reason = $state<string | undefined>(undefined);
  let draft = $state<{ agentId: string; value: string; effort?: string }>({ agentId: "", value: "" });

  function start() {
    draft = { agentId: model.choice?.agentId ?? "claude_code", value: model.choice?.model ?? "", ...(model.choice?.effort ? { effort: model.choice.effort } : {}) };
    reason = undefined;
    open = true;
  }

  async function save(choice: Parameters<typeof changeModel>[2]) {
    if (!target) return;
    // Done with nothing changed leaves a row that follows Model defaults following them.
    const current = model.choice;
    if (choice !== "default" && model.from !== "changed" && current && choice.agentId === current.agentId && choice.model === current.model && choice.effort === current.effort) { open = false; reason = undefined; return; }
    busy = true;
    const answer = await changeModel(config, target, choice);
    busy = false;
    if (answer.ok) { open = false; reason = undefined; } else reason = answer.reason;
  }
</script>

{#if line || model.problem || offered}
  <span class="model-line">
    {#if line}<span class="model" data-model-state={model.state}>{line}</span>{/if}
    {#if model.claudeCodeMissing}<span class="note">{CLAUDE_CODE_MISSING_NOTE}</span>{/if}
    {#if offered && model.from === "changed"}<span class="changed">Changed by you{#if model.useDefault}{" · "}<button type="button" class="link" disabled={!connected || busy} onclick={() => save("default")}>Use the default</button>{/if}</span>{/if}
    {#if offered && !open}<button type="button" class="link" disabled={!connected || busy || !model.change!.available} onclick={start}>Change</button>{/if}
    {#if offered && open}<button type="button" class="link" disabled={!connected || busy} onclick={() => save({ agentId: draft.agentId, model: draft.value, ...(draft.effort ? { effort: draft.effort } : {}) })}>Done</button><button type="button" class="link quiet" disabled={busy} onclick={() => { open = false; reason = undefined; }}>Cancel</button>{/if}
    {#if offered && model.change && !model.change.available && model.change.reason}<span class="note">{model.change.reason}</span>{/if}
    {#if model.problem}<span class="problem">{model.problem}</span>{/if}
    {#if open}<span class="full"><ModelEditor agents={rowEditorAgents(agents)} agentId={draft.agentId} value={draft.value} effort={draft.effort} {label} disabled={!connected || busy} onchange={(choice) => (draft = choice)} /></span>{/if}
    {#if reason}<span class="problem">{reason}</span>{/if}
  </span>
{/if}

<style>
  .model-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; margin-top: 4px; }
  .model { font-size: 13.5px; color: var(--muted); }
  .note, .changed { font-size: 12.5px; color: var(--dim); }
  .problem, .full { flex-basis: 100%; }
  .problem { font-size: 12.5px; color: var(--amber); line-height: 1.5; }
  .link { padding: 0; border: 0; background: none; font: inherit; font-size: 13px; color: var(--text); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .changed .link { font-size: 12.5px; }
  .link.quiet { color: var(--dim); }
  .link:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
