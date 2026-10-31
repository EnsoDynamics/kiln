<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { confirmOutside } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  let { stop, busy = false }: { stop: NonNullable<Snapshot["needsYou"]>; busy?: boolean } = $props();
  const { config, connection } = viewContext();
  let pending = $state(false);
  let reason = $state<string | undefined>();
  async function accept(event: Event) {
    pending = true;
    const answer = await confirmOutside(config, (event.currentTarget as HTMLInputElement).checked, true);
    pending = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

{#if stop.outside?.uncertainty?.offered}
  <label class="accept-uncertainty">
    <input type="checkbox" checked={stop.outside.uncertainty.ticked} disabled={busy || pending || !connection?.connected} onchange={accept} />
    <span><strong>Accept workspace uncertainty</strong><br />Kiln could not verify all recorded work. Accept this checked history, then verify and advance. Other completion checks still apply; later recorded work requires a new acknowledgment.</span>
  </label>
  {#if reason}<p role="alert">{reason}</p>{/if}
{/if}

<style>
  .accept-uncertainty { display: flex; align-items: start; gap: 12px; margin: 20px 0; font-size: 14px; line-height: 1.6; }
  input { margin-top: 5px; flex-shrink: 0; }
</style>
