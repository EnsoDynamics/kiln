<script lang="ts">
  // The items an audit listed for a person, at a Needs you stop on that audit or at the hold stop
  // (Kiln Deliver When Audit Loops Run Out AC-ITEM-02, mockup screens 5 and 5b): each item's kind,
  // the problem, the action and, for one that stops or holds the run, what waits on it.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { waiverTag } from "../lib/waivers.js";

  let { snapshot }: { snapshot: Snapshot } = $props();
  const items = $derived(snapshot.items ?? []);
  const EFFECT = { stops: "Stops the run", holds: "Holds the run", goes_on: "Kiln goes on" } as const;
  const kindName = (item: (typeof items)[number]) => item.words ?? (item.kind === null ? "Listed before item kinds" : "For you");
</script>

{#if items.length}
  <ul class="person-items" aria-label="Items for you">
    {#each items as item, index (item.id ?? `new-${index}`)}
      <li>
        <div class="kind"><strong>{kindName(item)}</strong> · <span class="effect">{EFFECT[item.effect]}</span>{#if item.waiver} · <span class="waived">Waived</span> <span class="tag">{waiverTag(snapshot, item.waiver)}</span>{/if}</div>
        <p class="problem">{item.problem}</p>
        <p class="action">{item.action}</p>
        {#if item.waitsOn}<p class="waits"><span class="label">What waits on it:</span> {item.waitsOn}</p>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .person-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; overflow-wrap: anywhere; }
  .person-items p { margin: 4px 0 0; }
  .effect, .tag, .label { color: var(--dim); font-size: 12.5px; }
</style>
