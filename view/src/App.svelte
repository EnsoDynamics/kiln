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
  import PhaseHandoff from "./screens/PhaseHandoff.svelte";
  import type { PhaseRecoveryPage } from "./lib/phase-recovery-page.js";
  import NeedsYou from "./screens/NeedsYou.svelte";
  import Paused from "./screens/Paused.svelte";
  import PhaseDetail from "./screens/PhaseDetail.svelte";
  import Running from "./screens/Running.svelte";
  import Waiting from "./screens/Waiting.svelte";

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

  let recoveryPage = $state<PhaseRecoveryPage>({ key: "", draft: "", choice: false, unsent: false });
  const snapshot = $derived(connection.snapshot);
  $effect(() => {
    const recovery = snapshot?.needsYou?.phaseRecovery;
    const target = recovery?.target;
    const key = target ? JSON.stringify(target) : undefined;
    const attemptKey = target && recovery?.attemptStartedAt ? JSON.stringify([target.executionId, target.phaseKey, target.sessionId, recovery.attemptStartedAt]) : undefined;
    if (key && key !== recoveryPage.key) {
      // A deferred refusal creates a new stop/hold, but did not deliver the reply or start a turn.
      // Rebind that exact attempt's draft only; another turn/session always starts empty.
      const draft = attemptKey && attemptKey === recoveryPage.attemptKey ? recoveryPage.draft : "";
      recoveryPage = { key, attemptKey, draft, choice: false, unsent: !!draft };
    }
  });
  const connected = $derived(connection.connected);
  const lastSeenAt = $derived(connection.lastEventAt);

  /**
   * The phase route renders the live Phase detail while that phase is current, and Full session
   * output while it is stopped with a session or waiting for usage (usage-limit recovery,
   * technical design "Screens"); otherwise it gives way to the progress view. While
   * disconnected, a route keeps its screen.
   */
  const phaseScreen = $derived.by(() => {
    const route = router.route;
    if (route.screen !== "phase" || !snapshot) return undefined;
    if (snapshot.activities?.some(row => row.id === route.phaseId && row.details)) return route.phaseId;
    if (snapshot.current?.phaseId === route.phaseId) return route.phaseId;
    if (snapshot.needsYou?.phaseId === route.phaseId && snapshot.needsYou.sessionId) return route.phaseId;
    if (snapshot.waiting?.phaseId === route.phaseId) return route.phaseId;
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
  {#if connection.notice}<div class="command-notice" role="status">{connection.notice}<button type="button" onclick={() => { connection.notice = undefined; }}>Dismiss</button></div>{/if}
  {#if snapshot}
    {#if phaseScreen !== undefined}
      {#key phaseScreen}<PhaseDetail {snapshot} phaseId={phaseScreen} {connected} {now} {lastSeenAt} />{/key}
    {:else if snapshot.feature.state === "not_started" && snapshot.documents}
      <DocumentsFound {snapshot} {config} {connected} {lastSeenAt} {now} />
    {:else if snapshot.feature.state === "needs_you" && connected}
      {#if snapshot.needsYou?.phaseRecovery}<PhaseHandoff {snapshot} {now} page={recoveryPage} />{:else}<NeedsYou {snapshot} {now} />{/if}
    {:else if snapshot.feature.state === "waiting" && connected}
      <Waiting {snapshot} {now} />
    {:else if snapshot.feature.state === "paused"}
      <Paused {snapshot} {connected} {now} {lastSeenAt} />
    {:else if snapshot.feature.state === "complete"}
      <Complete {snapshot} {connected} {now} {lastSeenAt} {config} />
    {:else}
      <Running {snapshot} {connected} {now} {lastSeenAt} />
    {/if}
  {/if}
</div>

<style>
  .command-notice { margin: 16px 28px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); display: flex; justify-content: space-between; gap: 16px; }
  .page { min-height: 100vh; }
</style>
