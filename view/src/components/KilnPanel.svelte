<script lang="ts">
  // The Kiln panel: whether the view is connected to the running Kiln, and what its terminal is
  // for (PRD AC-VIEW-07, AC-KEEP-01). Without a live Kiln it reads Disconnected, in amber.
  import Icon from "./Icon.svelte";

  let { connected, text }: { connected: boolean; text: string } = $props();
  const parts = $derived(text.split("kiln run"));
</script>

<section class="card" class:lost={!connected} aria-labelledby="kiln-h">
  <h2 id="kiln-h" class="eyebrow">Kiln</h2>
  {#if connected}
    <div class="status connected"><span class="tick"><Icon name="check" /></span>Connected</div>
    <p>{#each parts as part, index (index)}{#if index > 0}<span class="code-inline">kiln run</span>{/if}{part}{/each}</p>
  {:else}
    <div class="status"><Icon name="warning" size={18} />Disconnected</div>
    <p>The terminal running Kiln was closed or stopped. Controls come back when Kiln is running again.</p>
  {/if}
</section>

<style>
  .lost { border-color: var(--amber-border); }
  .status { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: var(--amber); }
  .status.connected { color: var(--green); }
  .tick { width: 22px; height: 22px; border-radius: 999px; background: rgba(156, 196, 154, 0.12); border: 1px solid rgba(156, 196, 154, 0.45); display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
  p { margin: 0; font-size: 13.5px; color: var(--muted); line-height: 1.55; text-wrap: pretty; }
</style>
