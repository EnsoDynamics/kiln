<script lang="ts">
  import { onMount } from "svelte";
  import type { CompletedPlanCheck } from "../../../src/engine/completed-plan-discovery.js";
  import type { PageConfig } from "../lib/api.js";
  let { check, config, connected }: { check?: CompletedPlanCheck; config?: PageConfig; connected: boolean } = $props();
  let pending = $state(false);
  let error = $state<string>();
  const earlier = $derived(check?.status === "failed" || check?.status === "checking");
  const result = $derived(earlier ? check?.earlierResult : check?.result);
  const external = $derived(result?.leaves?.filter(row => row.classification === "externally_verified" || row.classification === "externally_unverified") ?? []);
  const carried = $derived(result?.leaves?.filter(row => row.classification === "carried_completed").length ?? 0);
  const time = (value: string) => new Date(value).toLocaleString();
  async function refresh() {
    if (!config || !connected || pending) return;
    pending = true; error = undefined;
    try {
      const response = await fetch("/api/continuation/check", { method: "POST", headers: { "Content-Type": "application/json", "X-Kiln-Token": config.token }, body: "{}" });
      const answer = await response.json();
      if (!response.ok && !answer.check) error = answer.reason ?? "Could not check the current plan. Try again.";
    } catch (failure) { error = (failure as Error).message; }
    finally { pending = false; }
  }
  // One mount/reload read. SSE reconnect and the clock never request another check.
  onMount(() => { void refresh(); });
</script>

<section class="plan-check" aria-label="Current plan check" aria-live="polite">
  <h2>{check?.status === "checking" || pending ? "Checking for new phases" : check?.status === "failed" ? "Could not check for new phases" : check?.status === "unchanged" ? "No new phases found" : result?.added.length ? "New phases found" : check?.status === "blocked" ? "Plan needs reconciliation" : "Check the current plan"}</h2>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if earlier}<p>Showing earlier results. The current phase count is unknown.</p>{/if}
  {#each check?.errors ?? [] as problem}<p class="problem">{problem}</p>{/each}
  {#if result}
    {#if result.added.length}
      <p>{earlier ? "Earlier result: " : ""}{result.added.length} new unfinished {result.added.length === 1 ? "phase" : "phases"}.</p>
      <ul>{#each result.added as phase}<li>Phase {phase.id} · {phase.title}</li>{/each}</ul>
    {/if}
    {#if result.leaves}
      <p>{earlier ? "Earlier accounting: " : "Plan accounting: "}{carried} earlier completed · {result.added.length} new unfinished · {external.length} externally closed.</p>
      {#if external.length}
        <h3>Work completed outside this run</h3>
        <ul>{#each external as phase}<li>
          <strong>Phase {phase.id} · {phase.title}</strong>
          <p>{phase.classification === "externally_verified" ? "Completion and integration verified" : "Completion evidence unresolved"}.</p>
          {#each phase.repositories as repository}<p class="source">{repository.repository}: {repository.revision} · {repository.integration === "integrated_verified" ? "Verified in" : "Not verified in"} {repository.baseBranch} at {repository.baseRevision}</p>{/each}
          <p class="source">{phase.completedAt ? `Original completion: ${time(phase.completedAt)}` : "Original completion time not recorded."}{#if phase.verifiedAt} Verified: <time datetime={phase.verifiedAt}>{time(phase.verifiedAt)}</time>{/if}</p>
        </li>{/each}</ul>
      {/if}
      {#if result.leaves.some(row => row.classification === "unresolved_earlier_work")}
        <h3>Earlier work needs reconciliation</h3>
        <ul>{#each result.leaves.filter(row => row.classification === "unresolved_earlier_work") as phase}<li>Phase {phase.id} · {phase.title}</li>{/each}</ul>
      {/if}
    {/if}
    {#each result.problems as problem}<p class="problem">{problem}</p>{/each}
    <p class="source">{earlier ? "Earlier source" : "Source"}: {result.source.path}{#if result.source.revision} · Revision {result.source.revision}{/if}</p>
  {/if}
  {#each check?.sources ?? [] as source}<p class="source">{source.kind === "shared" ? "Shared checkout" : "Delivery base"}: {source.path}{#if source.revision} · {source.revision}{/if}{#if source.error} · {source.error}{/if}</p>{/each}
  {#if check?.lastSuccessfulAt}<p>Last successful check: <time datetime={check.lastSuccessfulAt}>{time(check.lastSuccessfulAt)}</time></p>{/if}
  <button class="button" type="button" onclick={refresh} disabled={!connected || !config || pending || check?.status === "checking"}>{pending || check?.status === "checking" ? "Checking…" : "Check for new phases"}</button>
  <p>Earlier delivery and session history remain below. Checking starts no implementation.</p>
</section>

<style>
  .plan-check { border: 1px solid var(--amber); border-radius: 16px; padding: 24px; margin: 24px 0; overflow-wrap: anywhere; }
  h2 { font-family: var(--serif); font-weight: 400; font-size: 34px; }
  p, li { color: var(--muted); line-height: 1.6; }
  .source { font-size: 12px; }
  .problem { border-left: 3px solid var(--amber); padding-left: 12px; color: var(--text); }
</style>
