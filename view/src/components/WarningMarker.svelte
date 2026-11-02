<script lang="ts">
  // A waiver's warning marker beside a waived label (AC-WAIVE-04, AC-WAIVE-12): the short label,
  // "no audit report", with its full sentence as the title.
  let { text, full = false }: { text: string; full?: boolean } = $props();
  const short = $derived(text.split(":")[0] ?? text);
</script>

<span class="warn" title={text}><span class="icon" aria-hidden="true">!</span>{full ? text : short}</span>

<style>
  .warn { display: inline-flex; align-items: center; gap: 6px; color: var(--amber); font-weight: 600; font-size: 12.5px; }
  .icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; background: var(--amber); color: var(--bg); font: 700 11px/1 var(--sans); flex: none; }
</style>
