<script lang="ts">
  // Exit Kiln on a finished run (Kiln After Delivery AC-EXIT-01, mockup states 1 to 4): offered whenever
  // no session is running or being started, otherwise disabled with Kiln's reason. Pressing it ends Kiln
  // in its terminal; the page then hears `exited` and shows Kiln has exited (AC-EXIT-02).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { exitKiln } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, connected, main = false, line }: { snapshot: Snapshot; connected: boolean; main?: boolean; line?: string } = $props();
  const { config } = viewContext();
  const exit = $derived(snapshot.exit);
  const several = $derived((snapshot.pullRequests?.length ?? 0) > 1 || snapshot.repositories.length > 1);
  const said = $derived(line ?? (several ? "Stops Kiln in its terminal. The pull requests and the worktrees stay." : "Stops Kiln in its terminal. The pull request and the worktree stay."));
  let pressing = $state(false);
  let problem = $state<string>();
  async function press() {
    if (pressing || !exit?.available) return;
    pressing = true; problem = undefined;
    try { const answer = await exitKiln(config); if (!answer.ok) problem = answer.reason; }
    finally { pressing = false; }
  }
</script>

{#if exit}
  <div class="exit-kiln">
    <button class="button" class:solid={main} type="button" disabled={!connected || pressing || !exit.available} onclick={press}>{pressing ? "Exiting…" : "Exit Kiln"}</button>
    <p class="note">{exit.available ? said : exit.reason}</p>
    {#if problem}<p class="note problem" role="alert">{problem}</p>{/if}
  </div>
{/if}

<style>
  .exit-kiln { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .note { margin: 0; font-size: 13px; color: var(--dim); text-wrap: pretty; }
  .problem { color: var(--amber); flex-basis: 100%; }
</style>
