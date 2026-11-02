<script lang="ts">
  // What follows a completed activity's Complete (AC-WAIVE-10): "· 1 check waived", then any
  // warning markers (AC-WAIVE-04, AC-WAIVE-12).
  import type { PhaseView } from "../../../src/engine/snapshot.js";
  import { checksWord } from "../lib/waivers.js";
  import WarningMarker from "./WarningMarker.svelte";

  let { row }: { row: PhaseView } = $props();
</script>

{#if row.waivedChecks}<span class="waived">· {checksWord(row.waivedChecks)} waived</span>{/if}
{#each row.warnings ?? [] as warning (warning.kind)}<WarningMarker text={warning.text} />{/each}

<style>
  .waived { font-size: 13px; color: var(--dim); white-space: nowrap; }
</style>
