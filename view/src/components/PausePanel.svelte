<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { keepGoing, pause, takeOver } from "../lib/api.js";
  import { capitalized, phaseName } from "../lib/progress.js";
  import { liveDraft } from "../lib/live-drafts.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  let { snapshot, connected = true }: { snapshot: Snapshot; connected?: boolean } = $props();
  const { config } = viewContext();
  const id = $derived(snapshot.liveControl?.target.activityKey ?? snapshot.current?.phaseId ?? snapshot.needsYou?.phaseId ?? "");
  const activity = $derived(snapshot.liveControl?.label ?? capitalized(phaseName(id, snapshot)));
  const audit = $derived(id.startsWith("audit-"));
  const submitting = $derived(snapshot.liveControl && (liveDraft(snapshot.liveControl.target).submitting || !!liveDraft(snapshot.liveControl.target).instructionId || snapshot.liveControl.messages?.some(m => m.delivery === "submitting")));
  const held = $derived(snapshot.liveControl?.takeover);
  let pressing = $state(false);
  let reason = $state<string | undefined>();
  async function press(takeover = false) {
    if (pressing || !connected) return;
    pressing = true;
    const answer = await (takeover ? takeOver(config, snapshot.liveControl!.target) : snapshot.pause.pending ? keepGoing(config) : pause(config));
    pressing = false; reason = answer.ok ? undefined : answer.reason;
  }
</script>
<section class="card" aria-labelledby="pause-h">
  <h2 id="pause-h" class="eyebrow">When should Kiln pause?</h2>
  <div class="choices">
    <section>
      <h3>Take over this session</h3>
      <p><strong>At the next safe stopping point.</strong> Finish the current operation, then stop before starting more work. Open the same conversation in your terminal; the phase/audit can remain unfinished.</p>
      {#if held && held.kind !== "delivery_recovery"}
        <p role="status"><strong>{held.state === "released" ? "Paused for terminal takeover." : "Pausing for takeover — finishing the current operation."}</strong></p>
        <!-- A hold whose conversation can't be reopened shows the carry-on and terminal cards in place of this wait text (run restart AC-CARRY-06). -->
        {#if held.state !== "released" && !held.history}<p>Wait before opening Claude. Terminal access becomes available after Kiln releases the conversation.</p><p>{held.reason}</p>{#if held.latestActivityAt && Date.parse(held.observedAt) - Date.parse(held.latestActivityAt) >= 30000}<p>Waiting {Math.floor((Date.parse(held.observedAt) - Date.parse(held.latestActivityAt)) / 1000)} seconds since the last observed activity. There is no automatic cancellation deadline.</p>{/if}{/if}
      {:else}
        <button class="button wide" disabled={!connected || pressing || submitting || !snapshot.liveControl?.available} onclick={() => press(true)}>Pause &amp; take over</button>
        {#if submitting}<p>Wait for this message submission’s outcome before pausing.</p>{/if}
        {#if !snapshot.liveControl?.available}<p>{snapshot.liveControl?.reason ?? "Live takeover is available for running Claude phases and audits."}</p>{/if}
      {/if}
    </section>
    <section>
      <h3>Let {activity} finish first</h3>
      <p><strong>After the whole {audit ? "audit" : "phase"}.</strong> Kiln finishes its work, commits, pushes and required completion checks, then waits before starting the next activity. No terminal takeover is needed.</p>
      {#if snapshot.pause.pending}<p>Will pause after {activity} finishes. Current work continues.</p>{/if}
      <button class="button wide" disabled={!connected || pressing || held?.state === "released" && !snapshot.pause.pending} onclick={() => press()}>{snapshot.pause.pending ? (audit ? "Cancel end-of-audit pause" : "Cancel end-of-phase pause") : (audit ? "Pause after this audit" : "Pause after this phase")}</button>
      {#if held?.state === "released" && !snapshot.pause.pending}<p>This session is already stopped. Hand it back to Kiln before requesting an end-of-{audit ? "audit" : "phase"} pause.</p>{/if}
    </section>
  </div>
  {#if !connected}<p>Reconnect before acting. Last-known state.</p>{/if}
  {#if reason}<p role="alert">{reason}</p>{/if}
</section>
<style>
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 22px; }
  section { min-width: 0; } .choices > section { display: flex; flex-direction: column; gap: 14px; }
  h3 { margin: 0; font-size: 16px; } p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; } strong { color: var(--text); }
  @media(max-width: 680px) { .choices { grid-template-columns: 1fr; } }
</style>
