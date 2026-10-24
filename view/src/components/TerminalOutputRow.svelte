<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { OutputLine } from "../../../src/session/session-output.js";
  import { outputCall, outputPreview } from "../lib/session-view.js";
  import { outputTime } from "../lib/time.js";

  let { line, now, timestamps = false, live = false, onexpand }: {
    line: Pick<OutputLine, "at" | "source" | "text" | "threadId" | "timestampSource">;
    now: Date; timestamps?: boolean; live?: boolean; onexpand: () => void;
  } = $props();
  let expanded = $state(false);
  let overflowed = $state(false);
  let entryText: HTMLDivElement | undefined = $state();
  const call = $derived(outputCall(line));
  const result = $derived(line.source === "out");
  const preview = $derived(outputPreview(call?.input ?? line.text, call ? 2 : result ? 3 : 4, call ? 240 : 600));
  const label = $derived(line.source === "codex" ? "Codex" : line.source === "claude" ? "Claude" : line.source);
  function toggle() {
    expanded = !expanded;
    if (expanded) onexpand();
  }
  function measure() {
    if (!expanded && entryText) overflowed = entryText.scrollHeight > entryText.clientHeight + 1;
  }
  onMount(() => {
    const observer = new ResizeObserver(measure);
    if (entryText) observer.observe(entryText);
    measure();
    return () => observer.disconnect();
  });
  $effect(() => {
    void line.text;
    void timestamps;
    void expanded;
    void tick().then(measure);
  });
</script>

<article class="entry" data-source={line.source} aria-label={`${label} ${live ? "writing" : "entry"}`} class:result class:call={call !== undefined} class:warning={line.source === "stderr"} class:message={!call && !result}>
  <span class="glyph" aria-hidden="true">{result ? "⎿" : "●"}</span>
  <div class="body">
    <div class="entry-text" class:clamped={!expanded} style:--preview-lines={call ? 2 : result ? 3 : 4} bind:this={entryText}>
    {#if call}<span class="tool-name">{call.name}</span><span class="text">({expanded ? call.input : preview.text}{!expanded && preview.hidden ? "…" : ""})</span>{:else}<span class="text">{expanded ? line.text : preview.text}{!expanded && preview.hidden ? "…" : ""}</span>{/if}
    {#if live}<span class="cursor" aria-hidden="true"></span><span class="sr-only"> ({label} writing)</span>{/if}
    </div>
    {#if line.source === "reviewer" || line.source === "subagent" || line.source === "stderr" || line.source === "exit"}<span class="origin" class:reviewer={line.source === "reviewer"}> · {label}{#if line.threadId}{" "}[{line.threadId}]{/if}</span>{/if}
    {#if line.timestampSource === "turn"}<span class="origin"> [turn time]</span>{/if}
    {#if line.timestampSource === "recovery"}<span class="origin"> [recovered now; item time unavailable]</span>{/if}
    {#if preview.hidden || overflowed}<button type="button" class="expand" aria-expanded={expanded} onclick={toggle}>{expanded ? "Show less" : preview.extraLines > 0 ? `… +${preview.extraLines} lines (click to expand)` : "… more (click to expand)"}</button>{/if}
  </div>
  {#if timestamps}<time datetime={line.at}>{outputTime(line.at, now)}</time>{/if}
</article>

<style>
  .entry { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: baseline; gap: 8px; margin-top: 10px; font-size: 12.5px; line-height: 1.65; }
  .entry:first-child { margin-top: 0; }
  .message { margin-top: 14px; margin-bottom: 12px; }
  .result { margin-top: 0; padding-left: 20px; }
  .glyph { color: var(--muted); }
  .call .glyph { color: var(--dim); }
  .message .glyph, .tool-name { color: var(--text); }
  .entry.warning .glyph, .entry.warning .text { color: var(--amber); }
  .body { min-width: 0; }
  .clamped { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--preview-lines); line-clamp: var(--preview-lines); overflow: hidden; }
  .tool-name { font-weight: 600; }
  .text { color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
  .message .text { color: var(--text); }
  .origin { font-size: 11px; color: var(--dim); overflow-wrap: anywhere; }
  .origin.reviewer { color: var(--amber); }
  time { color: var(--dim); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .expand { display: block; padding: 0; border: 0; background: none; color: var(--dim); font: inherit; font-size: 11.5px; cursor: pointer; text-align: left; }
  .expand:hover { color: var(--text); text-decoration: underline; }
  .cursor { display: inline-block; width: 7px; height: 13px; margin-left: 3px; vertical-align: -2px; background: var(--muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (max-width: 560px) { .entry { gap: 6px; } time { font-size: 10px; } .result { padding-left: 12px; } }
</style>
