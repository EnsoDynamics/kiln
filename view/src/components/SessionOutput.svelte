<script lang="ts">
  // A session's output on Phase detail (PRD AC-WATCH-05, AC-WATCH-10): every line timestamped
  // with its source, the latest ones first loaded and earlier ones on request. While the session
  // works, new lines arrive on the event stream and Claude's text shows as it is written,
  // replaced by its finished line.
  import { onDestroy, onMount } from "svelte";
  import type { OutputLine } from "../../../src/session/session-output.js";
  import { outputPage } from "../lib/api.js";
  import type { PartialEvent } from "../lib/connection.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  import OutputRow from "./OutputRow.svelte";

  let { sessionId, live, connected, total, now, initialLines = [] }: { sessionId: string | undefined; live: boolean; connected: boolean; total: number; now: number; initialLines?: OutputLine[] } = $props();
  const { config, connection } = viewContext();

  // svelte-ignore state_referenced_locally
  let lines = $state<OutputLine[]>(initialLines);
  /** Live text by source, so a reviewer's and Claude's text written at once stay apart. */
  let partials = $state<PartialEvent[]>([]);
  let loadError = $state<string | undefined>(undefined);
  let loading = $state(false);
  const offs: (() => void)[] = [];
  const shownTotal = $derived(Math.max(total, lines.at(-1)?.line ?? 0));
  const earliest = $derived(lines[0]?.line);

  function add(more: OutputLine[]) {
    const known = new Set(lines.map((line) => line.line));
    lines = [...lines, ...more.filter((line) => !known.has(line.line))].sort((a, b) => a.line - b.line);
  }

  async function load(before?: number) {
    if (!sessionId || loading) return;
    loading = true;
    try {
      const page = await outputPage(config, sessionId, before);
      add(page.lines);
      loadError = undefined;
    } catch (error) {
      loadError = (error as Error).message;
    } finally {
      loading = false;
    }
  }

  /**
   * After the event stream comes back, the lines sent while it was down: pages from the latest
   * back to the last line already shown, so no gap is left that Load earlier can't reach.
   */
  async function catchUp() {
    const lastShown = lines.at(-1)?.line;
    if (!sessionId || lastShown === undefined) return load();
    let before: number | undefined;
    try {
      for (;;) {
        const page = await outputPage(config, sessionId, before);
        add(page.lines);
        const first = page.lines[0]?.line;
        if (first === undefined || first <= lastShown + 1) break;
        before = first;
      }
      loadError = undefined;
    } catch (error) {
      loadError = (error as Error).message;
    }
  }

  let wasConnected = connection?.connected ?? false;
  $effect(() => {
    const now = connection?.connected ?? false;
    if (now && !wasConnected) {
      partials = [];
      void catchUp();
    }
    wasConnected = now;
  });

  onMount(() => {
    void load();
    if (!connection) return;
    offs.push(
      connection.onOutput((event) => {
        if (event.sessionId !== sessionId) return;
        add(event.lines);
        const finished = new Set(event.lines.map((line) => line.source));
        partials = partials.filter((partial) => !finished.has(partial.source));
      }),
      connection.onPartial((event) => {
        if (event.sessionId !== sessionId) return;
        const same = partials.find((partial) => partial.source === event.source);
        partials = same ? partials.map((partial) => (partial === same ? { ...partial, text: partial.text + event.text } : partial)) : [...partials, event];
      }),
    );
  });
  onDestroy(() => offs.forEach((off) => off()));
</script>

<section class="output">
  <div class="bar">
    <span class="title"><span class="eyebrow">Session output</span>{#if live}<span class="live"><span class="pulse"></span>LIVE</span>{/if}</span>
    <span class="count">Latest of {shownTotal.toLocaleString("en-US")} lines{#if connected && earliest !== undefined && earliest > 1}<button type="button" class="earlier" disabled={loading} onclick={() => load(earliest)}>Load earlier</button>{/if}</span>
  </div>
  <div class="lines mono">
    {#each lines as line (line.line)}<OutputRow {line} now={new Date(now)} />{/each}
    {#if live}{#each partials as partial (partial.source)}<OutputRow line={{ at: new Date(now).toISOString(), source: partial.source, text: partial.text }} now={new Date(now)} live />{/each}{/if}
    {#if loadError}<span class="error">{loadError}</span>{/if}
  </div>
</section>

<style>
  .output { background: var(--deep); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
  .bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .title { display: inline-flex; align-items: center; gap: 14px; }
  .live { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--green); }
  .pulse { width: 7px; height: 7px; border-radius: 999px; background: var(--green); animation: kpulse 1.6s ease-in-out infinite; }
  @keyframes kpulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .count { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 13px; color: var(--dim); }
  .earlier { font: inherit; font-size: 13px; font-weight: 600; color: var(--red); background: none; border: 0; padding: 0; cursor: pointer; }
  .earlier:disabled { opacity: 0.6; cursor: default; }
  .lines { padding: 16px 20px 20px; font-size: 12.5px; line-height: 1.75; display: grid; grid-template-columns: minmax(70px, max-content) 66px minmax(0, 1fr); gap: 2px 12px; }
  .error { grid-column: 1 / -1; color: var(--amber); }
</style>
