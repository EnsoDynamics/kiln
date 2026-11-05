<script lang="ts">
  import BillingPanel from "../components/BillingPanel.svelte";
  // Running (docs/design/mockups/kiln-screen-running.html): the current phase at the top, the
  // phase plan, the Claude account, the settings, Pause Kiln and the Kiln panel (PRD
  // AC-WATCH-01 to 08, AC-VIEW-03). Once the view has lost Kiln it becomes the Disconnected
  // screen (kiln-screen-disconnected.html), and a Needs you stop seen while disconnected shows
  // this layout with no current-phase panel (UI-006; technical design, "Connection"), as does a
  // wait for usage, its phase labeled last known (live-session control AC-LIVE-02).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import AccountPanel from "../components/AccountPanel.svelte";
  import CurrentPhase from "../components/CurrentPhase.svelte";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import KilnPanel from "../components/KilnPanel.svelte";
  import PausePanel from "../components/PausePanel.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import SettingsPanel from "../components/SettingsPanel.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { phaseName, PR_ID } from "../lib/progress.js";

  let { snapshot, connected, now, lastSeenAt }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const isPr = $derived(snapshot.current?.phaseId === PR_ID);
  const phaseInView = $derived(snapshot.needsYou?.phaseId ?? snapshot.waiting?.phaseId ?? snapshot.current?.phaseId);
  const kilnText = $derived(`Kiln is running in your terminal. Keep it open: Ctrl+C there interrupts ${isPr ? "the pull-request session" : "the current phase"}, and kiln run picks up where it left off.`);
  // While disconnected, times stop at the moment Kiln was last seen.
  const shownNow = $derived(connected ? now : (lastSeenAt ?? now));
</script>

<main class="page-main">
  <StateHeader {snapshot} {connected} now={shownNow} />
  {#if !connected && lastSeenAt !== undefined}
    <DisconnectedBanner {lastSeenAt} phaseClause={phaseInView === undefined ? undefined : phaseName(phaseInView, snapshot)} {now} />
  {/if}
  {#if snapshot.current}<CurrentPhase {snapshot} {connected} now={shownNow} />{/if}
  {#if snapshot.current && isPr}
    <section class="card"><p>Live messages and terminal takeover are unavailable during final delivery. Live controls support Claude phases and audits.</p></section>
  {/if}
  <div class="columns-main">
    <div class="column-wide"><PhasePlan {snapshot} {connected} now={shownNow} /></div>
    <div class="column-side">
      {#if connected && snapshot.account}<AccountPanel account={snapshot.account} paused={false} pullRequest={isPr} {now} />{/if}
      <SettingsPanel {snapshot} {connected} />
      {#if connected && snapshot.current && !isPr}<PausePanel {snapshot} />{/if}
      <KilnPanel {connected} text={kilnText} />
      <BillingPanel {snapshot} {connected} />
    </div>
  </div>
</main>
