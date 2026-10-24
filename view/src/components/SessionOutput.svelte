<script lang="ts">
  // The live viewer keeps a bounded tail; stopped sessions retain paged full-output access.
  import { onDestroy, onMount, tick } from "svelte";
  import type { OutputLine } from "../../../src/session/session-output.js";
  import { outputPage } from "../lib/api.js";
  import type { PartialEvent } from "../lib/connection.svelte.js";
  import { LIVE_ENTRY_LIMIT, mergeOutput } from "../lib/session-view.js";
  import { viewContext } from "../lib/view-context.js";
  import TerminalOutputRow from "./TerminalOutputRow.svelte";

  let { sessionId, live, connected, total, now, recent = true, initialLines = [] }: { sessionId: string | undefined; live: boolean; connected: boolean; total: number; now: number; recent?: boolean; initialLines?: OutputLine[] } = $props();
  const { config, connection } = viewContext();
  // svelte-ignore state_referenced_locally
  let lines = $state<OutputLine[]>(mergeOutput([], initialLines, recent));
  let partials = $state<PartialEvent[]>([]);
  let loadError = $state<string | undefined>(undefined);
  let loading = $state(false);
  let pageTotal = $state(0);
  let timestamps = $state(false);
  let following = $state(true);
  let readingExpanded = false;
  let viewport: HTMLDivElement | undefined = $state();
  let content: HTMLDivElement | undefined = $state();
  const offs: (() => void)[] = [];
  const shownTotal = $derived(Math.max(total, pageTotal, lines.at(-1)?.line ?? 0));
  const earliest = $derived(lines[0]?.line);

  function add(more: OutputLine[]) {
    lines = mergeOutput(lines, more, recent);
  }

  async function load(before?: number) {
    if (!sessionId || loading) return;
    loading = true;
    try {
      const page = await outputPage(config, sessionId, before, recent ? LIVE_ENTRY_LIMIT : 200);
      add(page.lines);
      pageTotal = page.total;
      loadError = undefined;
    } catch (error) {
      loadError = (error as Error).message;
    } finally {
      loading = false;
    }
  }

  /** Only the current tail matters live; full-output views bridge every missed page. */
  async function catchUp() {
    if (recent || lines.length === 0) return load();
    const lastShown = lines.at(-1)!.line;
    let before: number | undefined;
    try {
      for (;;) {
        const page = await outputPage(config, sessionId!, before);
        add(page.lines);
        pageTotal = page.total;
        const first = page.lines[0]?.line;
        if (first === undefined || first <= lastShown + 1) break;
        before = first;
      }
      loadError = undefined;
    } catch (error) {
      loadError = (error as Error).message;
    }
  }

  function jumpToLatest() {
    readingExpanded = false;
    following = true;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }
  function pauseFollowing() {
    readingExpanded = true;
    following = false;
  }
  function onScroll() {
    if (viewport && !readingExpanded) following = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 16;
  }
  function scrollIntent() { readingExpanded = false; }

  // Preserve the first visible entry when the bounded tail drops older entries. Browser
  // scroll anchoring is disabled so it cannot compete with this adjustment or following.
  $effect.pre(() => {
    void lines;
    void partials.map(partial => partial.text);
    if (!viewport || !content) return;
    const pane = viewport;
    const top = pane.getBoundingClientRect().top;
    const anchor = [...content.children].find(child => child.getBoundingClientRect().bottom > top) as HTMLElement | undefined;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const previousTop = pane.scrollTop;
    const wasFollowing = following;
    void tick().then(() => {
      if (wasFollowing && following) pane.scrollTop = pane.scrollHeight;
      else if (anchor?.isConnected && anchorTop !== undefined) pane.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
      else pane.scrollTop = Math.min(previousTop, pane.scrollHeight - pane.clientHeight);
    });
  });

  let wasConnected = connection?.connected ?? false;
  $effect(() => {
    const connectedNow = connection?.connected ?? false;
    if (connectedNow && !wasConnected) {
      partials = [];
      void catchUp();
    }
    wasConnected = connectedNow;
  });

  onMount(() => {
    void load();
    const resize = new ResizeObserver(() => {
      if (following && viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    if (viewport) resize.observe(viewport);
    if (content) resize.observe(content);
    offs.push(() => resize.disconnect());
    if (!connection) return;
    offs.push(
      connection.onOutput((event) => {
        if (event.sessionId !== sessionId) return;
        add(event.lines);
        partials = partials.filter(partial => !event.lines.some(line => line.source === partial.source && (!partial.itemId || line.itemId === partial.itemId) && (!partial.threadId || line.threadId === partial.threadId)));
      }),
      connection.onPartial((event) => {
        if (event.sessionId !== sessionId) return;
        const same = partials.find(partial => partial.source === event.source && partial.threadId === event.threadId && partial.itemId === event.itemId);
        partials = same ? partials.map(partial => partial === same ? { ...partial, text: partial.text + event.text } : partial) : [...partials, event].slice(-LIVE_ENTRY_LIMIT);
      }),
    );
  });
  onDestroy(() => offs.forEach(off => off()));
</script>

<section class="output" aria-label="Session output">
  <div class="bar">
    <span class="title"><span>Session output</span>{#if live}<span class="live"><span class="pulse"></span>LIVE</span>{/if}</span>
    <div class="options">
      <label><input type="checkbox" bind:checked={timestamps} /> Timestamps</label>
      <span class="count">Showing {recent ? "latest " : ""}{lines.length.toLocaleString("en-US")} of {shownTotal.toLocaleString("en-US")} entries</span>
      {#if !recent && connected && earliest !== undefined && earliest > 1}<button type="button" class="earlier" disabled={loading} onclick={() => { pauseFollowing(); void load(earliest); }}>Load earlier</button>{/if}
    </div>
  </div>
  <!-- A named scrolling region must be focusable so keyboard users can browse its output. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="viewport" bind:this={viewport} role="region" aria-label="Scrollable session output" tabindex="0" onscroll={onScroll} onwheel={scrollIntent} ontouchstart={scrollIntent} onkeydown={scrollIntent}>
    <div class="lines mono" bind:this={content}>
      {#each lines as line (line.line)}<div data-output-entry={line.line} class:result={line.source === "out"}><TerminalOutputRow {line} {timestamps} now={new Date(now)} onexpand={pauseFollowing} /></div>{/each}
      {#if live}{#each partials as partial (`${partial.source}:${partial.threadId}:${partial.itemId}`)}<div data-output-partial><TerminalOutputRow line={{ at: new Date(now).toISOString(), source: partial.source, text: partial.text, threadId: partial.threadId }} {timestamps} now={new Date(now)} live onexpand={pauseFollowing} /></div>{/each}{/if}
      {#if loading && lines.length === 0}<p class="empty">Loading session output…</p>{:else if lines.length === 0 && partials.length === 0 && !loadError}<p class="empty">No session output yet.</p>{/if}
      {#if loadError}<p class="error" role="alert">{loadError}</p>{/if}
    </div>
  </div>
  <div class="foot">
    <span>{following ? live ? "↓ Following latest" : "↓ Latest saved output" : live ? "Scroll paused · Live updates continue" : "Scroll paused"}</span>
    {#if !following}<button type="button" class="jump" onclick={jumpToLatest}>Jump to latest ↓</button>{/if}
    <span class="read-only">Read-only session output</span>
  </div>
</section>

<style>
  .output { background: var(--deep); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 12px; }
  .title { display: inline-flex; align-items: center; gap: 14px; }
  .live { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: var(--green); }
  .pulse { width: 6px; height: 6px; border-radius: 999px; background: var(--green); }
  .options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  label { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 11px; cursor: pointer; }
  input { accent-color: var(--red); margin: 0; }
  .count { font-size: 11px; color: var(--dim); }
  .earlier { font: inherit; color: var(--red); background: none; border: 0; padding: 0; cursor: pointer; }
  .earlier:disabled { opacity: 0.6; cursor: default; }
  .viewport { height: 60dvh; min-height: 220px; max-height: 700px; overflow-y: auto; overflow-anchor: none; overscroll-behavior: contain; scrollbar-color: var(--line-stronger) var(--deep); }
  .lines { padding: 14px 18px; }
  .lines > div + div { margin-top: 10px; }
  .lines > div.result { margin-top: 0; }
  .error { color: var(--amber); font-size: 12px; }
  .empty { color: var(--dim); font-size: 12px; }
  .foot { min-height: 36px; padding: 6px 14px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; color: var(--dim); }
  .jump { border: 0; border-radius: 4px; padding: 4px 10px; font: inherit; color: var(--deep); background: var(--red); cursor: pointer; }
  @media (max-width: 560px) { .lines { padding: 12px; } .read-only { display: none; } }
</style>
