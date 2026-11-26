<script lang="ts">
  // Closing audits on the finished page (Kiln Deliver When Audit Loops Run Out AC-LEFT-02, mockup
  // screen 3): each kind's loops used and its limit in force at delivery, as each pull request's
  // description says them, each with its maximum (Kiln Planned Test Fix Batches AC-MAX-01).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { loopsUsed } from "../../../src/audit/audit-names.js";

  let { snapshot }: { snapshot: Snapshot } = $props();
  const loops = $derived(snapshot.delivered?.loops);
</script>

{#if loops}
  <section class="card closing-audits" id="closing-audits" aria-labelledby="closing-audits-heading">
    <h2 id="closing-audits-heading">Closing audits</h2>
    <dl>
      <div class="row"><dt>Delivery audit</dt><dd>{loopsUsed(loops.delivery)}</dd></div>
      <div class="row"><dt>Test audit</dt><dd>{loopsUsed(loops.test)}</dd></div>
    </dl>
  </section>
{/if}

<style>
  .closing-audits h2 { margin: 0 0 10px; }
  dl { margin: 0; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; }
  .row + .row { border-top: 1px solid var(--line); }
  dt, dd { margin: 0; }
  dd { font-variant-numeric: tabular-nums; }
</style>
