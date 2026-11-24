<script lang="ts">
  // Changing models on a page that shows no phase plan: Needs you, the stopped-phase page and the
  // waiting page (Kiln Phase Model Tiers AC-PICK-03, AC-OTHER-01, AC-FALLBACK-01; mockup 5, state
  // E). Every row that hasn't started offers its Change here, the stopped or waiting activity's
  // first, then the model lines with the Audits choice and the Model defaults link.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import ModelLines from "./ModelLines.svelte";
  import RowModel from "./RowModel.svelte";
  import TierTag from "./TierTag.svelte";

  let { snapshot, phaseId, connected }: { snapshot: Snapshot; phaseId: string | undefined; connected: boolean } = $props();
  type Row = Snapshot["phases"][number];
  const targetOf = (row: Row): { phase: string } | "audits" | undefined => row.kind === "delivery_audit" || row.kind === "test_audit" ? "audits" : (row.kind === undefined || row.kind === "implementation") && !row.plannedActivity ? { phase: row.id } : undefined;
  const rows = $derived.by(() => {
    const all = (snapshot.activities ?? snapshot.phases).filter(row => row.model?.change && targetOf(row));
    return [...all.filter(row => row.id === phaseId), ...all.filter(row => row.id !== phaseId)];
  });
  const circle = (row: Row) => row.kind === "delivery_audit" ? "DA" : row.kind === "test_audit" ? "TA" : row.id;
</script>

{#if !snapshot.feature.completedAt}
<section class="card model-changes" aria-labelledby="model-changes-h">
  <h2 id="model-changes-h" class="eyebrow">Models</h2>
  {#if rows.length}
    <ul>
      {#each rows as row (row.id)}
        <li data-phase={row.id}>
          <span class="title-line"><span class="circle mono">{circle(row)}</span><span class="title">{row.title}</span>{#if row.tier}<TierTag tier={row.tier} />{/if}</span>
          <RowModel model={row.model!} underway={true} target={targetOf(row)} agents={snapshot.agents} {connected} label={`${row.title} model`} />
        </li>
      {/each}
    </ul>
  {/if}
  <ModelLines {snapshot} {connected} />
</section>
{/if}

<style>
  .model-changes { display: flex; flex-direction: column; gap: 14px; }
  .eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 14px; }
  li { display: flex; flex-direction: column; gap: 2px; }
  .title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .circle { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--line-strong); font-size: 12.5px; color: var(--muted); box-sizing: border-box; }
  .title { font-size: 15px; color: var(--text); }
</style>
