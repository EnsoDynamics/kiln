<script lang="ts">
  // The current phase's six progress steps in a row (PRD AC-WATCH-04): finished steps ticked,
  // the current one in red, unreached ones grey. Without a live Kiln the current step loses its
  // spinner, as the Disconnected mockup draws it.
  import Icon from "./Icon.svelte";

  let { steps, live }: { steps: { name: string; state: "finished" | "current" | "unreached" }[]; live: boolean } = $props();
</script>

<ol class="steps">
  {#each steps as step, index (step.name)}
    {#if index > 0}<li class="rule" aria-hidden="true"></li>{/if}
    <li class={step.state}>{#if step.state === "finished"}<Icon name="check" />{:else if step.state === "current" && live}<Icon name="spinner" spin />{/if}{step.name}</li>
  {/each}
</ol>

<style>
  .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  li { font-size: 14px; }
  .finished { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
  .current { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; color: var(--red); }
  .unreached { color: var(--dim); }
  .rule { width: 14px; height: 1px; background: var(--line-stronger); }
</style>
