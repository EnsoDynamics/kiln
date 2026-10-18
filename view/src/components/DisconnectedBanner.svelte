<script lang="ts">
  // Above the main panel while the view has lost Kiln (PRD AC-VIEW-07; technical design,
  // "Connection"): nothing is running, what the page shows is what Kiln last saw, and this PRD's
  // `kiln run` picks up where it left off.
  import { clockTime } from "../lib/time.js";
  import CopyButton from "./CopyButton.svelte";
  import Icon from "./Icon.svelte";

  let { lastSeenAt, phaseClause, workKept, prdFolder, now }: { lastSeenAt: number; phaseClause?: string; workKept: boolean; prdFolder: string; now: number } = $props();
  const command = $derived(`kiln run ${prdFolder}`);
</script>

<section class="banner" aria-labelledby="disc-h">
  <div class="head"><span class="warn"><Icon name="warning" size={18} /></span><h2 id="disc-h">Kiln isn’t running</h2></div>
  <p>Nothing is being worked on. This page shows what Kiln last saw, at {clockTime(new Date(lastSeenAt).toISOString(), new Date(now), { afterWord: true })}{phaseClause ? `, in ${phaseClause}` : ""}.{workKept ? " Its work is kept." : ""} To pick up where it left off, run this in a terminal:</p>
  <div class="run"><code>{command}</code><CopyButton text={command} compact /></div>
</section>

<style>
  .banner { padding: 22px 26px; border-radius: 18px; background: rgba(230, 180, 80, 0.08); border: 1px solid var(--amber-border); display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 10px; }
  .warn { color: var(--amber); display: inline-flex; }
  h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--text); }
  /* The mockup's 70ch, as Inter's "0" measures it (see NeedsYou's message). */
  p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; max-width: 44.2em; }
  .run { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
  code { font-family: var(--mono); font-size: 13px; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
</style>
