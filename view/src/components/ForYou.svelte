<script lang="ts">
  // For you on the finished page (Kiln Deliver When Audit Loops Run Out AC-ITEM-03, mockup screens
  // 3 and 3b): each item still open at delivery, its kind's words bold at the start of the line
  // Kiln built, any Waived tag after it, then the actions the requirements place after delivery.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { waiverTag } from "../lib/waivers.js";

  let { snapshot }: { snapshot: Snapshot } = $props();
  const block = $derived(snapshot.delivered?.forYou);
</script>

{#if block && (block.items.length || block.afterDelivery.length)}
  <section class="card for-you" id="for-you" aria-labelledby="for-you-heading">
    <h2 id="for-you-heading">For you</h2>
    <ul>
      {#each block.items as item (item.id)}
        <li>{#if item.words}<strong>{item.words}:</strong>{item.line.slice(item.words.length + 1)}{:else}{item.line}{/if}{#if item.waiver} <span class="waived">Waived</span> <span class="tag">{waiverTag(snapshot, item.waiver)}</span>{/if}</li>
      {/each}
      {#each block.afterDelivery as action}<li>{action}</li>{/each}
    </ul>
  </section>
{/if}

<style>
  .for-you h2 { margin: 0 0 10px; }
  .for-you ul { margin: 0; padding-left: 20px; overflow-wrap: anywhere; }
  .for-you li + li { margin-top: 8px; }
  .tag { font-size: 12.5px; color: var(--dim); }
</style>
