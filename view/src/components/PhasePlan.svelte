<script lang="ts">
  // The phase plan: every phase in plan order, all at one level, with its number, file name,
  // title word for word and state, and a Details section for each phase that has run (PRD
  // AC-WATCH-01, AC-LOOK-03). The pull-request session is its last row once every leaf is
  // closed (AC-PR-05). For a multi-repository PRD a Done row counts the repositories it pushed to,
  // its Details list them, and the pull-request row counts the pull requests (multi-repo AC-PRS-03).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { detailRows, openedLabel, rowFacts, rowPill, rowState, type RowState } from "../lib/progress.js";
  import DetailsList from "./DetailsList.svelte";
  import type { IconName } from "./Icon.svelte";
  import PhaseCircle, { type CircleTone } from "./PhaseCircle.svelte";
  import Pill, { type PillTone } from "./Pill.svelte";

  let { snapshot, connected, now }: { snapshot: Snapshot; connected: boolean; now: number } = $props();
  const opened = $derived(openedLabel(snapshot));

  const LOOKS: Record<RowState, { circle: CircleTone; pill: PillTone; icon?: IconName }> = {
    done: { circle: "done", pill: "green-tint", icon: "check" },
    split: { circle: "split", pill: "outline" },
    implementing: { circle: "implementing", pill: "red", icon: "spinner" },
    interrupted: { circle: "amber", pill: "amber-outline" },
    needs_you: { circle: "amber", pill: "amber", icon: "warning" },
    waiting: { circle: "next", pill: "strong-outline", icon: "clock" },
    next: { circle: "next", pill: "strong-outline" },
    planned: { circle: "planned", pill: "dashed" },
  };
</script>

<section class="plan" aria-labelledby="plan-h">
  <div class="head"><h2 id="plan-h" class="eyebrow">Phase plan</h2><span class="count">{snapshot.feature.phasesDone} of {snapshot.feature.phasesTotal} done</span></div>
  <ol>
    {#each snapshot.phases as row (row.id)}
      {@const state = rowState(row, connected)}
      {@const look = LOOKS[state]}
      {@const facts = rowFacts(row, state, now)}
      <li data-phase={row.id}>
        <div class="row">
          <PhaseCircle id={row.id} tone={look.circle} />
          <span class="names"><span class="title" class:quiet={state === "planned"}>{row.title}</span><span class="file mono">{row.file}</span></span>
          <span class="state">
            {#if facts}<span class="facts">{facts}</span>{/if}
            <Pill tone={look.pill} icon={look.icon} spin={state === "implementing"}>{rowPill(row, state, opened)}</Pill>
          </span>
        </div>
        {#if row.details && state !== "implementing" && state !== "interrupted"}<DetailsList rows={detailRows(row.details, new Date(now))} indent />{/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .plan { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .count { font-size: 13px; color: var(--dim); }
  ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  li { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  .names { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 16px; font-weight: 500; color: var(--text); }
  .title.quiet { color: var(--dim); }
  .file { font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .state { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; }
  .facts { font-size: 13px; color: var(--dim); white-space: nowrap; }
</style>
