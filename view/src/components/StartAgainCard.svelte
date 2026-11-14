<script lang="ts">
  // Start Phase N again (run restart AC-CASE-02): the one way to start a phase Kiln couldn't
  // launch, with the phase's work so far, and no reply box or terminal instructions.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { workLine } from "../lib/restart.js";

  type NeedsYou = NonNullable<Snapshot["needsYou"]>;
  let { activity, work, control, pending, disabled, reason, onpress }: { activity: string; work: NeedsYou["work"]; control: NonNullable<NeedsYou["startAgain"]>; pending: boolean; disabled: boolean; reason?: string | undefined; onpress: () => void } = $props();
</script>

<section class="card again" aria-label={`Start ${activity} again`}>
  <h2>Fix that, then have Kiln try again</h2>
  <p>Kiln starts {activity}'s first session again, exactly as it would have. No conversation had begun, so none is lost.</p>
  <ul class="work"><li><span>{activity}'s work so far</span><span>{workLine(work)}</span></li></ul>
  <button type="button" class="button solid" disabled={disabled || !control.available} onclick={onpress}>{pending ? "Starting…" : `Start ${activity} again`}</button>
  {#if !control.available && control.reason}<p class="reason">{control.reason}</p>{/if}
  {#if reason}<p class="reason" role="status">{reason}</p>{/if}
  <p class="hint">There is no reply box here: there is no conversation to reply to.</p>
</section>

<style>
  .again { gap: 14px; }
  h2 { margin: 0; font-size: 20px; line-height: 1.35; font-family: inherit; font-weight: 600; }
  p { margin: 0; color: var(--muted); line-height: 1.6; }
  .work { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .work li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; font-size: 13.5px; }
  .work li span:first-child { color: var(--dim); }
  .button { align-self: flex-start; } .button:disabled { opacity: .45; }
  .hint { font-size: 12.5px; color: var(--dim); }
  .reason { font-size: 12.5px; color: var(--amber); }
</style>
