<script lang="ts">
  // Pause Kiln on Running (PRD AC-VIEW-03): the current phase finishes, with its commit and
  // push, and then no phase starts until Start. A requested pause turns the button into Keep
  // going, which cancels it until the phase is Done (UI-002).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { keepGoing, pause } from "../lib/api.js";
  import { capitalized, phaseName } from "../lib/progress.js";
  import { viewContext } from "../lib/view-context.js";
  import Icon from "./Icon.svelte";

  let { snapshot }: { snapshot: Snapshot } = $props();
  const { config } = viewContext();
  const id = $derived(snapshot.current!.phaseId);
  const title = $derived(snapshot.phases.find((phase) => phase.id === id)?.title ?? "");
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);

  async function press() {
    pressing = true;
    const answer = await (snapshot.pause.pending ? keepGoing(config) : pause(config));
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<section class="card" aria-labelledby="pause-h">
  <h2 id="pause-h" class="eyebrow">Pause Kiln</h2>
  {#if snapshot.pause.pending}
    <p>Kiln pauses once {phaseName(id)}, <span class="title">{title}</span>, is done, including its commit and push. Keep going cancels the pause.</p>
    <button type="button" class="button wide" disabled={pressing} onclick={press}><Icon name="arrow" size={15} strokeWidth={1.8} />Keep going</button>
  {:else}
    <p>{capitalized(phaseName(id))}, <span class="title">{title}</span>, finishes first, including its commit and push. Then Kiln starts no new phase until you press Start.</p>
    <button type="button" class="button wide" disabled={pressing} onclick={press}><Icon name="pause" size={15} strokeWidth={1.8} />Pause after this phase</button>
  {/if}
  {#if reason}<span class="message">{reason}</span>{/if}
</section>

<style>
  p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.55; text-wrap: pretty; }
  .title { color: var(--text); }
  .message { font-size: 12.5px; color: var(--amber); }
</style>
