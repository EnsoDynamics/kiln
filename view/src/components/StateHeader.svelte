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
    // Pause now before the release (Kiln Pause Now AC-PAUSE-03): amber outline, with the progress arc.
    pausing: { tone: "amber-outline", icon: "spinner" },
    interrupted: { tone: "amber-outline" },
    paused: { tone: "strong-outline", icon: "pause" },
    needs_you: { tone: "amber", icon: "warning" },
    // Nothing is needed from the person while Kiln waits, so it is styled as Paused is (usage-limit recovery AC-LIMIT-04).
    waiting: { tone: "strong-outline", icon: "clock" },
    complete: { tone: "green", icon: "pull-request" },
  };
  const look = $derived(LOOKS[state.kind]);
  // A finished run's check (Kiln After Delivery "Display Contract"): never "Plan needs reconciliation",
  // and while the delivery waits to merge the check never changes the header. While a pull request is
  // closed, only a check that finds new phases does: the header keeps PR ready for review (AC-MERGE-07).
  const planCheckLabel = $derived.by(() => {
    const check = snapshot.continuation?.check;
    if (snapshot.feature.state !== "complete" || !check || snapshot.afterDelivery?.waiting || check.status === "awaiting_merge" || snapshot.afterDelivery?.merge && snapshot.afterDelivery.merge.state !== "done") return undefined;
    if (snapshot.afterDelivery?.pullRequests.some(pull => pull.state === "closed")) return check.result?.added.length && check.status !== "checking" && check.status !== "failed" ? "New phases found" : undefined;
    if (check.status === "checking") return "Checking for new phases";
    if (check.status === "failed") return "Could not check for new phases";
    return check.result?.added.length ? "New phases found" : undefined;
  });
</script>

<FeatureHeader repositoryName={snapshot.feature.repositoryLabel} prdFolder={snapshot.feature.prdFolder} location={snapshot.feature.location} name={snapshot.feature.name} layout="progress">
  <Pill tone={look.tone} icon={look.icon} spin={state.kind === "implementing" || state.kind === "pausing"} large>{snapshot.continuation?.acceptance?.state === "preparing" ? "Preparing additional work" : snapshot.continuation?.acceptance?.state === "blocked" ? "Preparation needs attention" : planCheckLabel ?? state.label}</Pill>
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
