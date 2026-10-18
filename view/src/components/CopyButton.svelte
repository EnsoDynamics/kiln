<script lang="ts">
  // Copies a command or prompt, then says so for a moment. It needs no live Kiln, so it keeps
  // working while the view is disconnected.
  import Icon from "./Icon.svelte";

  let { text, label = "Copy command", compact = false }: { text: string; label?: string; compact?: boolean } = $props();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    await navigator.clipboard.writeText(text);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 2000);
  }
</script>

<button type="button" class="button" class:compact onclick={copy}>{#if !compact}<Icon name="copy" size={15} />{/if}{copied ? "Copied" : label}</button>

<style>
  .compact { padding: 0 18px; font-size: 14px; }
</style>
