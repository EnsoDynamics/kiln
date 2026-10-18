<script lang="ts" module>
  /** Each source's label color, as the mockups draw them (PRD AC-LOOK-04; UI-010 item 1: subagent like tool). */
  export const SOURCE_TONE: Record<string, string> = { claude: "red", tool: "dim", subagent: "dim", out: "green", skill: "bright", reviewer: "amber", stderr: "amber", exit: "bright" };
</script>

<script lang="ts">
  // One line of session output: its time, its source and its text, which keeps its line breaks.
  // Its three cells sit in the grid of the list around it, so a time with its day widens the
  // time column for every line alike.
  import type { OutputLine } from "../../../src/session/session-output.js";
  import { outputTime } from "../lib/time.js";

  let { line, now, live = false }: { line: Pick<OutputLine, "at" | "source" | "text">; now: Date; live?: boolean } = $props();
</script>

<div class="row"><span class="time">{outputTime(line.at, now)}</span><span class="source {SOURCE_TONE[line.source] ?? 'dim'}">{line.source}</span><span class="text">{line.text}{#if live}<span class="cursor" aria-hidden="true"></span>{/if}</span></div>

<style>
  .row { display: contents; }
  .time { color: var(--dim); white-space: nowrap; }
  .text { color: var(--muted); overflow-wrap: anywhere; white-space: pre-wrap; }
  .red { color: var(--red); }
  .dim { color: var(--dim); }
  .green { color: var(--green); }
  .bright { color: var(--text); }
  .amber { color: var(--amber); }
  .cursor { display: inline-block; width: 7px; height: 14px; vertical-align: -2px; background: var(--muted); animation: kblink 1s steps(1) infinite; }
  @keyframes kblink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
