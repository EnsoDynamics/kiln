<script lang="ts">
  // The top bar every screen carries (PRD AC-LOOK-05): the Kiln mark on the left, leading back to
  // the progress view, and the running Kiln's version beside it; on the right, whether the view is connected to the running Kiln, and when
  // it last saw Kiln once it isn't (AC-VIEW-04, AC-VIEW-07), and the Enso Method mark. When npm has a newer Kiln, a
  // pill beside the version opens the command that installs it (newer version notice, AC-NEWER-03).
  import ensoMark from "../assets/enso-method-mark.svg";
  import { routedClick, type Router } from "../lib/router.svelte.js";
  import { clockTime } from "../lib/time.js";
  import CopyButton from "./CopyButton.svelte";
  // A run keeps the view of the Kiln it started with (AC-UPG-01), so the version this view was
  // built from is the running Kiln's.
  import { version } from "../../../package.json";

  let { connected, lastEventAt, now, home, router, latest, open = false }: { connected: boolean; lastEventAt: number | undefined; now: number; home?: string; router?: Router; latest?: string; open?: boolean } = $props();
  const ago = $derived(lastEventAt === undefined ? undefined : Math.max(0, Math.round((now - lastEventAt) / 1000)));

  // Escape, or a press anywhere outside the pill and its panel, closes the panel.
  let newer = $state<HTMLElement>();
  let pill = $state<HTMLButtonElement>();
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && open) { open = false; pill?.focus(); } };
  const closeOutside = (event: PointerEvent) => { if (open && newer && !newer.contains(event.target as Node)) open = false; };
</script>

<svelte:window onkeydown={closeOnEscape} onpointerdown={closeOutside} />

<header class="top">
  <div class="left">
    <a class="kiln" href={home ?? "#"} onclick={(event) => home !== undefined && routedClick(event, router, home)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20.5V11a7 7 0 0 1 14 0v9.5" stroke="#ede8dd" stroke-width="1.6"></path><path d="M2.5 20.5h19" stroke="#ede8dd" stroke-width="1.6" stroke-linecap="round"></path><path d="M12 18c-1.8 0-2.8-1.2-2.8-2.6 0-1.7 1.5-2.5 1.9-4.1 1 .7 3.6 2.1 3.6 4.2 0 1.4-1 2.5-2.7 2.5z" fill="#e2694f"></path></svg>
      <span class="word">kiln</span>
    </a>
    <span class="version" data-testid="kiln-version">v{version}</span>
    {#if latest}
      <div class="newer" bind:this={newer}>
        <button type="button" class="pill" bind:this={pill} aria-expanded={open} aria-controls={open ? "newer-kiln" : undefined} onclick={() => (open = !open)}>v{latest} available</button>
        {#if open}
          <div class="panel" id="newer-kiln" data-testid="newer-kiln">
            <div class="title">Kiln v{latest} is out <span class="dim">· you're on v{version}</span></div>
            <div class="command"><code>npm install -g @ensodynamics/kiln</code><CopyButton text="npm install -g @ensodynamics/kiln" label="Copy" compact /></div>
            <p class="note">This Kiln stays on v{version} until you start it again. <a href="https://github.com/EnsoDynamics/kiln/releases/tag/v{latest}" target="_blank" rel="noreferrer">What changed</a></p>
          </div>
        {/if}
      </div>
    {/if}
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
  .version { font: 12px/1 var(--mono); color: var(--dim); }
  .newer { position: relative; }
  .pill { font: 12px/1 var(--sans); color: var(--amber); padding: 5px 9px; border: 1px solid var(--amber-border); border-radius: 999px; background: rgba(230, 180, 80, 0.08); cursor: pointer; }
  .panel { position: absolute; top: calc(100% + 12px); left: 0; z-index: 10; width: min(430px, calc(100vw - 32px)); box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; background: var(--panel); border: 1px solid var(--line-stronger); border-radius: 8px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
  .title { font-size: 14px; font-weight: 600; }
  .title .dim { font-weight: 400; }
  .command { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px; background: var(--deep); border: 1px solid var(--line); border-radius: 6px; }
  .command code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 13px/1.3 var(--mono); color: var(--text); }
  .command :global(.button) { min-height: 32px; padding: 0 12px; font-size: 12px; font-weight: 500; }
  .note { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dim); }
  .note a { color: var(--muted); }
  /* On a phone the panel hangs from the bar's edge, not the pill, so it stays on screen. */
  @media (max-width: 560px) {
    .top { position: relative; }
    .newer { position: static; }
    .panel { top: calc(100% + 4px); left: 16px; width: calc(100% - 32px); }
  }
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
