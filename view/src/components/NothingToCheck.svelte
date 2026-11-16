<script lang="ts">
  // Nothing to check yet (run restart AC-CASE-03): a stopped phase that built nothing shows no
  // completion checks until asked; a row giving the stop's own reason still shows below.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import CheckFacts from "./CheckFacts.svelte";

  let { snapshot, activity, pending, disabled, warning, onpress }: { snapshot: Snapshot; activity: string; pending: boolean; disabled: boolean; warning?: string | undefined; onpress: () => void } = $props();
  const reasons = $derived((snapshot.needsYou?.checks ?? []).filter(check => check.reason && !check.passed));
</script>

<section class="card nothing" aria-label="Nothing to check yet">
  <div class="line">
    <span><strong>Nothing to check yet.</strong> {activity} has no commits and no uncommitted changes. Built it somewhere else? Kiln checks only this worktree, so bring the work here first. If a check still fails, you can mark {activity} complete.</span>
    <button type="button" class="button" {disabled} onclick={onpress}>{pending ? "Checking…" : `Check ${activity} anyway`}</button>
  </div>
  {#if warning}<p class="warning" role="alert">{warning}</p>{/if}
  {#if reasons.length}
    <!-- The row kept for the stop's own reason carries the same label as the checks section (AC-STOPCHECK-04). -->
    <span class="eyebrow">Why Kiln stopped</span>
    <ul class="checks" aria-label="Why Kiln stopped">
      {#each reasons as check, index (index)}<li><strong>{check.name}</strong><CheckFacts {snapshot} {check} /></li>{/each}
    </ul>
  {/if}
</section>

<style>
  .nothing { gap: 12px; }
  .line { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px 20px; font-size: 14px; color: var(--muted); line-height: 1.6; }
  .line span { flex: 1 1 420px; }
  .line strong { color: var(--text); }
  .button:disabled { opacity: .45; }
  .checks { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .checks li { padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
  .warning { margin: 0; color: var(--amber); font-size: 13px; }
</style>
