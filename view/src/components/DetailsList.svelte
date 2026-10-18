<script lang="ts">
  // A phase's Details, collapsed until the person opens it (PRD AC-WATCH-01, AC-WATCH-03).
  import Icon from "./Icon.svelte";

  let { rows, indent = false }: { rows: { term: string; value: string; mono?: true }[]; indent?: boolean } = $props();
</script>

<details class:indent>
  <summary><span class="chev"><Icon name="chevron" size={12} /></span>Details</summary>
  <div class="body">
    <dl>
      {#each rows as row (row.term)}
        <dt>{row.term}</dt>
        <dd class:mono={row.mono}>{row.value}</dd>
      {/each}
    </dl>
  </div>
</details>

<style>
  details { padding: 0; }
  details.indent { padding: 0 0 0 50px; }
  summary { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--dim); padding: 2px 0; }
  .chev { display: inline-flex; transition: transform 0.15s; }
  details[open] .chev { transform: rotate(90deg); }
  .body { padding: 10px 0 4px; }
  dl { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; font-size: 13px; }
  dt { color: var(--dim); }
  dd { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
  dd.mono { font-size: 12.5px; }
</style>
