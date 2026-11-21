<script lang="ts">
  // The line under a pressed button whose action takes a while (starting an agent session,
  // running the completion checks): what Kiln is doing, then, once the wait passes 8 seconds,
  // how long it has been, so a slow start never looks hung. Shown only while the press is under
  // way. The clock is hidden from screen readers: inside the live region it would be read out
  // every second.
  //   <button class="button" class:busy={pending} aria-busy={pending} ...>…</button>
  //   {#if pending}<BusyStatus text="Launching a new Claude Code session." />{/if}
  import { onMount } from "svelte";

  let { text }: { text: string } = $props();
  const SHOW_AFTER = 8;
  let seconds = $state(0);
  onMount(() => {
    const started = Date.now();
    const timer = setInterval(() => { seconds = Math.floor((Date.now() - started) / 1000); }, 1000);
    return () => clearInterval(timer);
  });
  const clock = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
</script>

<p class="busy-status" role="status">{text}{#if seconds >= SHOW_AFTER}{" "}<span class="clock" aria-hidden="true">{clock}</span>{/if}</p>

<style>
  .busy-status { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .clock { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
</style>
