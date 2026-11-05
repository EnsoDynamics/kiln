<script lang="ts">
  // A check's fact lines (AC-WAIVE-10, AC-WAIVE-11): each failing item on its own line; an item a
  // waiver covers carries its own Waived tag with the activity, time and source of its waiver,
  // also within a check that still fails; after a refused Mark complete, a changed item is marked
  // New or Changed.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { ItemChange } from "../../../src/engine/waivers.js";
  import type { CheckResult } from "../../../src/state/records.js";
  import { factLines, itemName, waiverTag } from "../lib/waivers.js";

  let { snapshot, check, changes = [] }: { snapshot: Snapshot; check: CheckResult; changes?: readonly ItemChange[] } = $props();
  const lines = $derived(factLines(check, changes));
</script>

{#each lines as line, index (index)}
  <span class="fact" class:highlight={line.change !== undefined}>
    {#if line.item?.waiver}<span class="waived">Waived</span> {itemName(line.item)} · {waiverTag(snapshot, line.item.waiver)}
    {:else}{#if line.change === "new"}<span class="new">New</span> {:else if line.change === "changed"}<span class="new">Changed</span> {/if}{line.text}{/if}
  </span>
{/each}

<style>
  .fact { display: block; font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .waived { color: var(--amber); font-weight: 600; }
  .new { color: var(--red); font-weight: 600; }
  .highlight { color: var(--muted); }
</style>
