<script lang="ts">
  // A completed activity's waived completion (AC-WAIVE-08, AC-WAIVE-10, AC-WAIVE-12), as the
  // waivers mockup's "After marking complete" draws it: Complete with the waived count and any
  // warning markers, the counts, the completion's check list with Waived in place of Passed, and
  // each of its own waivers' source, time, items and what they were checked against.
  import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
  import { againstText, countsLine, coverageNote, itemName, sourceText, verdict } from "../lib/waivers.js";
  import CheckFacts from "./CheckFacts.svelte";
  import WaivedStatus from "./WaivedStatus.svelte";
  import WarningMarker from "./WarningMarker.svelte";

  let { snapshot, row }: { snapshot: Snapshot; row: PhaseView } = $props();
  const completion = $derived(row.waivedCompletion!);
  const isAudit = $derived(row.kind === "delivery_audit" || row.kind === "test_audit");
  const noReport = $derived(row.warnings?.some(warning => warning.kind === "no_audit_report") ?? false);
  const otherWarnings = $derived(row.warnings?.filter(warning => warning.kind !== "no_audit_report") ?? []);
  const own = $derived(row.waivers ?? []);
  const movedOn = $derived(row.kind === "delivery_audit" ? "moved on to the test audit" : "moved on to final delivery");
  const VERDICT = { passed: "Passed", waived: "Waived", failed: "Not yet" } as const;
  const withSeconds = (iso: string) => new Date(iso).toLocaleString();
</script>

<section class="card waived-completion" aria-label={`${row.title} result`}>
  <div class="head"><h3>{row.title}</h3><span class="status"><span class="complete">Complete</span> <WaivedStatus {row} /></span></div>
  {#if noReport}<p class="feedback"><WarningMarker text="No audit report" /><br />Kiln couldn’t tell what this audit found. It counted the audit as passed and {movedOn}.</p>{/if}
  {#each otherWarnings as warning (warning.kind)}<p class="feedback"><WarningMarker text={warning.text} full /></p>{/each}
  <p class="counts">{countsLine(completion.counts)}. {completion.counts.waived === 1 ? "The waived check was" : "The waived checks were"} not verified by Kiln.</p>
  <ul class="checks">
    {#each completion.checks as check (check.name)}
      {@const state = verdict(check)}
      <li><span class="check"><strong>{check.name}</strong>{#if state !== "passed"}<CheckFacts {snapshot} {check} />{/if}</span><span class="verdict {state}">{VERDICT[state]}</span></li>
    {/each}
  </ul>
  {#each own as waiver (waiver.id)}
    <dl class="record">
      <dt>Source</dt><dd>{sourceText(waiver.source)}</dd>
      <dt>When</dt><dd>{withSeconds(waiver.at)}</dd>
      <dt>Waived</dt><dd>{#each waiver.items as item, index (index)}<span class="item"><code>{item.kind === "development_requirement" ? itemName(item) : item.check}</code> — {item.text}</span>{/each}</dd>
      {#if !isAudit}<dt>Checked against</dt><dd>{[...new Set(waiver.items.map(item => againstText(item, item.check)))].join("; ")} · check at {new Date(waiver.checkRun.at).toLocaleTimeString()}</dd>{/if}
    </dl>
    {#if !isAudit}<p class="note">{coverageNote(waiver.items)}</p>{/if}
  {/each}
</section>

<style>
  .waived-completion { gap: 14px; }
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; }
  h3 { margin: 0; font-size: 19px; font-weight: 600; color: var(--text); }
  .status { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .complete { color: var(--green); font-weight: 600; }
  p { margin: 0; line-height: 1.6; }
  .counts { color: var(--muted); font-size: 14px; }
  .feedback { font-size: 13px; color: var(--muted); border-left: 3px solid var(--amber); padding: 8px 12px; background: var(--deep); }
  .checks { list-style: none; margin: 0; padding: 0; }
  .checks li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .check { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .verdict { white-space: nowrap; color: var(--amber); }
  .verdict.passed { color: var(--green); }
  .verdict.waived { font-weight: 600; }
  .record { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 0; font-size: 13px; }
  dt { color: var(--dim); }
  dd { margin: 0; overflow-wrap: anywhere; color: var(--text); }
  .item { display: block; }
  code { font-family: var(--mono); font-size: 12px; }
  .note { font-size: 12.5px; color: var(--dim); }
</style>
