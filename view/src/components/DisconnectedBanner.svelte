<script lang="ts">
  // Transport loss does not establish that the controller or its attempt stopped (AC-LIVE-02).
  // Retain the observation time and reconnect guidance without offering a recovery command.
  import { clockTime } from "../lib/time.js";
  import Icon from "./Icon.svelte";

  let { lastSeenAt, phaseClause, now }: { lastSeenAt: number; phaseClause?: string; now: number } = $props();
</script>

<section class="banner" aria-labelledby="disc-h">
  <div class="head"><span class="warn"><Icon name="warning" size={18} /></span><h2 id="disc-h">Connection to Kiln lost</h2></div>
  <p>Last-known state, observed at {clockTime(new Date(lastSeenAt).toISOString(), new Date(now), { afterWord: true })}{phaseClause ? `, in ${phaseClause}` : ""}. Work may still be running. Reconnecting automatically; reconnect before acting or opening the conversation in your terminal.</p>
</section>

<style>
  .banner { padding: 22px 26px; border-radius: 18px; background: rgba(230, 180, 80, 0.08); border: 1px solid var(--amber-border); display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 10px; }
  .warn { color: var(--amber); display: inline-flex; }
  h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text); }
  /* The mockup's 70ch, as Inter's "0" measures it (see NeedsYou's message). */
  p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; max-width: 44.2em; }
</style>
