<script lang="ts">
  // The browser view: the shared frame, and the screen for where the feature stands, rendered
  // from the snapshot the event stream carries (technical design, "Snapshot"), at the route the
  // address names ("HTTP API", the phase route). Once the view loses Kiln, every screen keeps
  // the last snapshot and says so ("Connection").
  import { onDestroy, onMount } from "svelte";
  import TopBar from "./components/TopBar.svelte";
  import type { PageConfig } from "./lib/api.js";
  import { Connection } from "./lib/connection.svelte.js";
  import { Router } from "./lib/router.svelte.js";
  import { setViewContext } from "./lib/view-context.js";
  import Complete from "./screens/Complete.svelte";
  import DocumentsFound from "./screens/DocumentsFound.svelte";
  import NeedsYou from "./screens/NeedsYou.svelte";
  import Paused from "./screens/Paused.svelte";
  import PhaseDetail from "./screens/PhaseDetail.svelte";
  import Running from "./screens/Running.svelte";

  let { config }: { config: PageConfig } = $props();
  // The page's config never changes after load.
  // svelte-ignore state_referenced_locally
  const connection = new Connection(config);
  // svelte-ignore state_referenced_locally
  const router = new Router(config.base);
  // svelte-ignore state_referenced_locally
  setViewContext({ config, router, connection });
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;
  let stopRouting: (() => void) | undefined;

  const snapshot = $derived(connection.snapshot);
  const connected = $derived(connection.connected);
  const lastSeenAt = $derived(connection.lastEventAt);

  /**
   * The phase route renders the live Phase detail while that phase is current, and Full session
   * output while it is stopped with a session; otherwise it gives way to the progress view. While
   * disconnected, a route keeps its screen.
   */
  const phaseScreen = $derived.by(() => {
    const route = router.route;
    if (route.screen !== "phase" || !snapshot) return undefined;
    if (snapshot.current?.phaseId === route.phaseId) return route.phaseId;
    if (snapshot.needsYou?.phaseId === route.phaseId && snapshot.needsYou.sessionId) return route.phaseId;
    return undefined;
  });

  $effect(() => {
    if (router.route.screen === "phase" && snapshot && connected && phaseScreen === undefined) router.replace(config.base);
  });

  onMount(() => {
    connection.open();
    stopRouting = router.start(window.location);
    ticker = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    connection.close();
    stopRouting?.();
    clearInterval(ticker);
  });
</script>

<div class="page">
  <TopBar {connected} lastEventAt={lastSeenAt} {now} home={config.base} {router} />
  {#if snapshot}
    {#if phaseScreen !== undefined}
      {#key phaseScreen}<PhaseDetail {snapshot} phaseId={phaseScreen} {connected} {now} {lastSeenAt} />{/key}
    {:else if snapshot.feature.state === "not_started" && snapshot.documents}
      <DocumentsFound {snapshot} {config} {connected} {lastSeenAt} {now} />
    {:else if snapshot.feature.state === "needs_you" && connected}
      <NeedsYou {snapshot} {now} />
    {:else if snapshot.feature.state === "paused"}
      <Paused {snapshot} {connected} {now} {lastSeenAt} />
    {:else if snapshot.feature.state === "complete"}
      <Complete {snapshot} {connected} {now} {lastSeenAt} />
    {:else}
      <Running {snapshot} {connected} {now} {lastSeenAt} />
    {/if}
  {/if}
</div>

<style>
  .page { min-height: 100vh; }
</style>
