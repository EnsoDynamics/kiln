<script lang="ts">
  // Text with `backticked` parts drawn as code, such as "Run `claude auth login`." (UI-010 item 7).
  let { text }: { text: string } = $props();
  const parts = $derived(text.split("`"));
</script>

{#each parts as part, index (index)}{#if index % 2 === 1}<span class="code-inline">{part}</span>{:else}{part}{/if}{/each}
