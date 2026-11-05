<script lang="ts">
  // The top bar every screen carries (PRD AC-LOOK-05): the Kiln mark on the left, leading back to
  // the progress view; on the right, whether the view is connected to the running Kiln, and when
  // it last saw Kiln once it isn't (AC-VIEW-04, AC-VIEW-07), and the Enso Method mark.
  import ensoMark from "../assets/enso-method-mark.svg";
  import { routedClick, type Router } from "../lib/router.svelte.js";
  import { clockTime } from "../lib/time.js";

  let { connected, lastEventAt, now, home, router }: { connected: boolean; lastEventAt: number | undefined; now: number; home?: string; router?: Router } = $props();
  const ago = $derived(lastEventAt === undefined ? undefined : Math.max(0, Math.round((now - lastEventAt) / 1000)));
</script>

<header class="top">
  <div class="left">
    <a class="kiln" href={home ?? "#"} onclick={(event) => home !== undefined && routedClick(event, router, home)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20.5V11a7 7 0 0 1 14 0v9.5" stroke="#ede8dd" stroke-width="1.6"></path><path d="M2.5 20.5h19" stroke="#ede8dd" stroke-width="1.6" stroke-linecap="round"></path><path d="M12 18c-1.8 0-2.8-1.2-2.8-2.6 0-1.7 1.5-2.5 1.9-4.1 1 .7 3.6 2.1 3.6 4.2 0 1.4-1 2.5-2.7 2.5z" fill="#e2694f"></path></svg>
      <span class="word">kiln</span>
    </a>
  </div>
  <div class="right">
    {#if lastEventAt !== undefined}
      <span class="status" data-testid="connection">
        <span class="dot" class:connected></span>{#if connected}Connected to Kiln{#if ago !== undefined}<span class="dim">· updated {ago}s ago</span>{/if}{:else}<span class="lost">Disconnected from Kiln</span><span class="dim">· last seen {clockTime(new Date(lastEventAt).toISOString(), new Date(now), { afterWord: true })}</span>{/if}
      </span>
      <span class="divider" aria-hidden="true"></span>
    {/if}
    <a class="enso" href="https://ensomethod.org"><img src={ensoMark} alt="" width="22" height="22" />The Enso Method</a>
  </div>
</header>

<style>
  .top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 14px clamp(16px, 4vw, 32px); border-bottom: 1px solid var(--line); }
  .left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .kiln { display: inline-flex; align-items: center; gap: 9px; color: var(--text); text-decoration: none; }
  .kiln:hover { color: var(--text); }
  .word { font-family: var(--serif); font-size: 28px; line-height: 1; }
  .right { display: flex; align-items: center; gap: 16px; }
  .status { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--amber); }
  .dot.connected { background: var(--green); }
  .lost { color: var(--amber); font-weight: 600; }
  .dim { color: var(--dim); }
  .divider { width: 1px; height: 22px; background: var(--line-strong); }
  .enso { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); text-decoration: none; font-size: 13px; }
  .enso img { display: block; }
</style>
