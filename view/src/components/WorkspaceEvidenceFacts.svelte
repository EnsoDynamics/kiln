<script lang="ts">
  let { facts, uncertain = false }: { facts: string[]; uncertain?: boolean } = $props();
</script>
{#if uncertain}
  <p>Unable to verify all recorded work. This alone does not establish an outside-workspace change.</p>
  <details><summary>Workspace evidence details</summary>{#each facts as fact, index (index)}<p>{fact}</p>{/each}</details>
{:else}
  {#each facts as fact, index (index)}<p>{fact}</p>{/each}
{/if}
<style>
  p { overflow-wrap: anywhere; }
  summary { cursor: pointer; }
</style>
