<script lang="ts">
  // The header of every progress screen: the feature name, and under it where the PRD stands,
  // with how many phases are done, or the stopped phase and when it stopped (PRD AC-WATCH-02),
  // and under that, once the PRD has started, its PRD total line (time totals AC-TOTAL-01).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { headerState, type HeaderKind } from "../lib/progress.js";
  import FeatureHeader from "./FeatureHeader.svelte";
  import type { IconName } from "./Icon.svelte";
  import Pill, { type PillTone } from "./Pill.svelte";

  let { snapshot, connected, now }: { snapshot: Snapshot; connected: boolean; now: number } = $props();
  const state = $derived(headerState(snapshot, connected, new Date(now)));
  const LOOKS: Record<HeaderKind, { tone: PillTone; icon?: IconName }> = {
    implementing: { tone: "red", icon: "spinner" },
    interrupted: { tone: "amber-outline" },
    paused: { tone: "strong-outline", icon: "pause" },
    needs_you: { tone: "amber", icon: "warning" },
    // Nothing is needed from the person while Kiln waits, so it is styled as Paused is (usage-limit recovery AC-LIMIT-04).
    waiting: { tone: "strong-outline", icon: "clock" },
    complete: { tone: "green", icon: "pull-request" },
  };
  const look = $derived(LOOKS[state.kind]);
</script>

<FeatureHeader repositoryName={snapshot.feature.repositoryName} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name} layout="progress">
  <Pill tone={look.tone} icon={look.icon} spin={state.kind === "implementing"} large>{snapshot.continuation?.acceptance?.state === "preparing" ? "Preparing additional work" : snapshot.continuation?.acceptance?.state === "blocked" ? "Preparation needs attention" : snapshot.feature.state === "complete" && snapshot.continuation?.check && snapshot.continuation.check.status !== "unchanged" ? snapshot.continuation.check.status === "checking" ? "Checking for new phases" : snapshot.continuation.check.status === "failed" ? "Could not check for new phases" : snapshot.continuation.check.result?.added.length ? "New phases found" : "Plan needs reconciliation" : state.label}</Pill>
  {#each state.facts as fact, index (index)}{#if index > 0}<span class="dot" aria-hidden="true">·</span>{/if}<span class="fact">{fact}</span>{/each}
  {#if state.totals}
    <p class="totals"><span class="label">PRD total</span><span><b>{state.totals.running}</b> running</span><span class="dot" aria-hidden="true">·</span><span><b>{state.totals.waiting}</b> waiting</span><span class="dot" aria-hidden="true">·</span><span class="since">{state.totals.since}</span></p>
  {/if}
</FeatureHeader>

<style>
  .fact { font-size: 14px; color: var(--muted); }
  .dot { color: var(--dim); }
  /* Its own line under the state row (flex-basis 100% breaks it onto one), set apart by a hairline. */
  .totals { flex-basis: 100%; margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; padding-top: 12px; border-top: 1px solid var(--line); max-width: 640px; font-size: 14px; color: var(--muted); box-sizing: border-box; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  b { color: var(--text); font-weight: 500; }
  .since { color: var(--dim); }
</style>
