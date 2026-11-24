<script lang="ts">
  // The pause panel (Kiln Pause Now AC-PAUSE-01 to 04; mockup frames 1, 2 and 2b): headed Pause,
  // with Now and After {activity} as peers, Now first. While Pause now is pausing it says what
  // Kiln is waiting for and offers Cancel until the stop; once paused it shows only a pending
  // end-of-activity pause with its cancel. A separately requested end-of-activity pause stays
  // visible under the pausing wording.
  import { activityKeyKind } from "../../../src/state/activity-keys.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { COMMAND_FOLLOW, LID_SENTENCE, pausingRow } from "../../../src/live/pause-now.js";
  import { cancelTakeOver, keepGoing, pause, takeOver } from "../lib/api.js";
  import { capitalized, nextActivity, phaseName, rowAuditName } from "../lib/progress.js";
  import { liveDraft } from "../lib/live-drafts.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  let { snapshot, connected = true }: { snapshot: Snapshot; connected?: boolean } = $props();
  const { config } = viewContext();
  const pauseNow = $derived(snapshot.liveControl?.pauseNow);
  // The leaf the running header names, not the launched key a split phase started as (AC-PAUSE-01, AC-PAUSE-03).
  const id = $derived(pauseNow?.activityKey ?? snapshot.current?.phaseId ?? snapshot.liveControl?.target.activityKey ?? snapshot.needsYou?.phaseId ?? "");
  const audit = $derived(activityKeyKind(id) === "audit");
  // The panel names a phase by its number and an audit by its name and loop (AC-PAUSE-01, Kiln After Delivery AC-AUDIT-01):
  // "delivery audit loop 2", from the audit row when there is no live target (a Codex audit, or a Claude audit between sessions).
  const auditRow = $derived(audit ? (snapshot.activities ?? snapshot.phases).find(one => one.id === id) : undefined);
  const name = $derived(audit && snapshot.liveControl?.label ? snapshot.liveControl.label.toLowerCase() : auditRow && (auditRow.kind === "delivery_audit" || auditRow.kind === "test_audit") ? rowAuditName(auditRow).sentence : phaseName(id, snapshot));
  // The pending end-of-activity pause's sentence keeps its existing words ("Will pause after Phase 2b finishes.").
  const activity = $derived(audit && snapshot.liveControl?.label ? snapshot.liveControl.label : capitalized(name));
  const submitting = $derived(snapshot.liveControl && (liveDraft(snapshot.liveControl.target).submitting || !!liveDraft(snapshot.liveControl.target).instructionId || snapshot.liveControl.messages?.some(m => m.delivery === "submitting")));
  const held = $derived(snapshot.liveControl?.takeover);
  const row = $derived(pauseNow?.phase === "pausing" ? pausingRow(pauseNow) : undefined);
  const cancelLabel = $derived(audit ? "Cancel end-of-audit pause" : "Cancel end-of-phase pause");
  let pressing = $state(false);
  let reason = $state<string | undefined>();
  async function press(action: "now" | "after" | "cancel") {
    if (pressing || !connected) return;
    const live = snapshot.liveControl;
    pressing = true;
    const answer = await (action === "now" ? takeOver(config, live!.target)
      : action === "cancel" ? cancelTakeOver(config, live!.target, live!.takeover!.instructionId)
      : snapshot.pause.pending ? keepGoing(config) : pause(config));
    pressing = false; reason = answer.ok ? undefined : answer.reason;
  }
</script>
{#if pauseNow?.phase === "paused"}
  {#if snapshot.pause.pending}
    <section class="card" aria-label="Pause after {name}">
      {@render pending()}
      {@render footer()}
    </section>
  {/if}
{:else}
<section class="card" aria-labelledby="pause-h">
  <h2 id="pause-h" class="eyebrow">Pause</h2>
  {#if row && pauseNow}
    <div class="pausing" role="status">
      <p class="title">{row.title}</p>
      {#if row.kind === "obstacle"}
        <p class="warning">{pauseNow.obstacle?.reason}</p>
      {:else if row.kind === "command"}
        <div class="running"><p class="label">Running now</p>{#each row.lines as line, index (index)}<p class="mono line">● {line}</p>{/each}</div>
        <p>{COMMAND_FOLLOW} {LID_SENTENCE}</p>
      {:else if row.kind === "background"}
        {#each row.lines as line, index (index)}<p class="mono line">{line}</p>{/each}
        <p>{row.note}</p>
      {:else}
        <p>{LID_SENTENCE}</p>
      {/if}
      {#if row.waiting}<p>{row.waiting}</p>{/if}
    </div>
    {#if !pauseNow.stopped || pauseNow.cancel.available}
      <div class="actions"><button type="button" class="button" disabled={!connected || pressing || !pauseNow.cancel.available} onclick={() => press("cancel")}>Cancel pause and keep going</button></div>
      {#if connected && !pauseNow.cancel.available && pauseNow.cancel.reason}<p>{pauseNow.cancel.reason}</p>{/if}
    {/if}
    {#if snapshot.pause.pending}<div class="also">{@render pending()}</div>{/if}
  {:else}
    <div class="choices">
      <section>
        <h3>Now</h3>
        <p><strong>Stops after the command it is running</strong>, usually within seconds. {capitalized(name)} stays open.</p>
        <p>Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command.</p>
        <button type="button" class="button solid wide" disabled={!connected || pressing || submitting || !snapshot.liveControl?.available} onclick={() => press("now")}>Pause now</button>
        {#if submitting}<p>Wait for this message submission’s outcome before pausing.</p>{/if}
        {#if !snapshot.liveControl?.available}<p>{snapshot.liveControl?.reason ?? "Pause now is available for running Claude phases and audits."}</p>{/if}
      </section>
      <section>
        <h3>After {name}</h3>
        <p><strong>Lets the {audit ? "audit" : "phase"} finish.</strong> Kiln commits, pushes and runs the completion checks, then waits before starting {nextActivity(snapshot, id)}.</p>
        {#if snapshot.pause.pending}<p>Will pause after {activity} finishes. Current work continues.</p>{/if}
        <button type="button" class="button wide" disabled={!connected || pressing || held?.state === "released" && !snapshot.pause.pending} onclick={() => press("after")}>{snapshot.pause.pending ? cancelLabel : `Pause after ${name}`}</button>
        {#if held?.state === "released" && !snapshot.pause.pending}<p>This session is already stopped. Hand it back to Kiln before requesting an end-of-{audit ? "audit" : "phase"} pause.</p>{/if}
      </section>
    </div>
  {/if}
  {@render footer()}
</section>
{/if}

{#snippet pending()}
  <p>Will pause after {activity} finishes.</p>
  <button type="button" class="button" disabled={!connected || pressing} onclick={() => press("after")}>{cancelLabel}</button>
{/snippet}

{#snippet footer()}
  {#if !connected}<p>Reconnect before acting. Last-known state.</p>{/if}
  {#if reason}<p role="alert" class="warning">{reason}</p>{/if}
{/snippet}

<style>
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 22px 32px; }
  section { min-width: 0; } .choices > section { display: flex; flex-direction: column; gap: 14px; }
  .choices > section + section { border-left: 1px solid var(--line); padding-left: 32px; }
  .choices > section > .button { margin-top: auto; }
  h3 { margin: 0; font-size: 16px; } p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; } strong { color: var(--text); }
  .pausing, .running, .also { display: flex; flex-direction: column; gap: 12px; }
  .running { gap: 6px; }
  .title { font-size: 17px; font-weight: 600; color: var(--text); }
  .label { font-size: 12.5px; color: var(--dim); }
  .line { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
  .also { border-top: 1px solid var(--line); padding-top: 14px; }
  .also .button, .actions .button, section > .button { align-self: flex-start; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .warning { color: var(--amber); }
  .button:disabled { opacity: .45; }
  @media(max-width: 680px) { .choices { grid-template-columns: 1fr; } .choices > section + section { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 18px; } }
</style>
