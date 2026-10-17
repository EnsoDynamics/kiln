<script lang="ts">
  // The browser view: the shared frame, and the screen for where the feature stands, rendered
  // from the snapshot the event stream carries (technical design, "Snapshot").
  import { onDestroy, onMount } from "svelte";
  import TopBar from "./components/TopBar.svelte";
  import { Connection } from "./lib/connection.svelte.js";
  import type { PageConfig } from "./lib/api.js";
  import DocumentsFound from "./screens/DocumentsFound.svelte";
  import Underway from "./screens/Underway.svelte";

  let { config }: { config: PageConfig } = $props();
  // The page's config never changes after load.
  // svelte-ignore state_referenced_locally
  const connection = new Connection(config);
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    connection.open();
    ticker = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    connection.close();
    clearInterval(ticker);
  });
</script>

<div class="page">
  <TopBar connected={connection.connected} lastEventAt={connection.lastEventAt} {now} />
  {#if connection.snapshot}
    {#if connection.snapshot.feature.state === "not_started" && connection.snapshot.documents}
      <DocumentsFound snapshot={connection.snapshot} {config} connected={connection.connected} />
    {:else}
      <Underway snapshot={connection.snapshot} />
    {/if}
  {/if}
</div>

<style>
  .page { min-height: 100vh; }
</style>
