<script lang="ts">
  // What Kiln found (run restart AC-CASE-04): the latest launch never began a conversation, so the
  // first card says what Kiln ran and the error it got.
  import type { LaunchFailure } from "../../../src/engine/stopped-phase.js";
  import CodeText from "./CodeText.svelte";
  import { clockTime } from "../lib/time.js";

  let { failure, now }: { failure: LaunchFailure; now: Date } = $props();
</script>

<section class="card found" aria-label="What Kiln found">
  <span class="eyebrow">What Kiln found</span>
  <p class="sentence"><CodeText text={failure.sentence} /></p>
  <pre>{failure.error}</pre>
  <span class="facts mono">Kiln · launch failed · {clockTime(failure.at, now)} · no conversation</span>
</section>

<style>
  .found { border-left: 3px solid var(--red); gap: 12px; }
  .sentence { margin: 0; font-size: 15px; color: var(--muted); line-height: 1.6; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12.5px/1.6 var(--mono); padding: 12px 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; color: var(--text); }
  .facts { font-size: 12.5px; color: var(--dim); }
</style>
