<script lang="ts">
  import BillingPanel from "../components/BillingPanel.svelte";
  // Paused (docs/design/mockups/kiln-screen-paused.html): Kiln holds between phases until Start
  // (PRD AC-VIEW-03), with the next phase named, the account to switch before it (AC-WATCH-08),
  // and the settings to change first (AC-VIEW-08). Before the pull request it says "the pull
  // request" (technical design, "Paused before the pull request").
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import AccountPanel from "../components/AccountPanel.svelte";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import Icon from "../components/Icon.svelte";
  import KilnPanel from "../components/KilnPanel.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import SettingsPanel from "../components/SettingsPanel.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { start } from "../lib/api.js";
  import { capitalized, nextPhase, pausedAfter, phaseName, PR_ID } from "../lib/progress.js";
  import { clockTime } from "../lib/time.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, connected, now, lastSeenAt }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const { config } = viewContext();
  const after = $derived(pausedAfter(snapshot));
  const next = $derived(nextPhase(snapshot));
  const nextIsPr = $derived(next?.id === PR_ID);
  const nextName = $derived(next ? phaseName(next.id, snapshot) : "");
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);

  async function pressStart() {
    pressing = true;
    const answer = await start(config, false);
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main">
  <StateHeader {snapshot} {connected} now={connected ? now : (lastSeenAt ?? now)} />
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} {now} />{/if}
  <section class="held" aria-labelledby="now-h">
    <div class="words">
      <span class="eyebrow">{after ? `Paused after ${phaseName(after.id, snapshot)}` : "Paused"}</span>
      <h2 id="now-h">{#if nextIsPr}Next: the pull request{:else if next}Next: {nextName}, {next.title}{/if}</h2>
      <p>{after ? `${capitalized(phaseName(after.id, snapshot))} finished. Paused before the next activity.` : "Paused before the next activity."}</p>
      <p>
        {#if after?.doneAt}{capitalized(phaseName(after.id, snapshot))}, {after.title}, finished with its commit and push at {clockTime(after.doneAt, new Date(now), { afterWord: true })}.{/if}
        Nothing is running. Change the model or effort first if you want; they apply to {nextIsPr ? "the pull request" : nextName}.
      </p>
      {#if reason}<span class="message">{reason}</span>{/if}
    </div>
    <button type="button" class="button solid start" disabled={!connected || pressing || snapshot.billing && !snapshot.billing.canLaunch} onclick={pressStart}><Icon name="arrow" size={15} strokeWidth={1.8} />{nextIsPr ? "Start the pull request" : `Start ${nextName}`}</button>
  </section>
  <div class="columns-main">
    <div class="column-wide"><PhasePlan {snapshot} {connected} {now} /></div>
    <div class="column-side">
      <BillingPanel {snapshot} {connected} />
      {#if connected && snapshot.account}<AccountPanel account={snapshot.account} paused {now} />{/if}
      <SettingsPanel {snapshot} {connected} />
      <KilnPanel {connected} text="Kiln is waiting in your terminal. Keep it open; Ctrl+C there closes Kiln, and kiln run picks up where it left off." />
    </div>
  </div>
</main>

<style>
  .held { padding: 24px 28px; border-radius: 18px; background: var(--deep); border: 1px solid var(--line-stronger); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px 28px; }
  .words { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 420px; }
  h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text); }
  p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.55; }
  .message { font-size: 12.5px; color: var(--amber); }
  .start { min-height: 48px; padding: 0 24px; font-size: 15px; }
</style>
