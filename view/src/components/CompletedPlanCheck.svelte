<script lang="ts">
  import { onMount } from "svelte";
  import type { CompletedPlanCheck } from "../../../src/engine/completed-plan-discovery.js";
  import { authorizeContinuation, continueFeature, type PageConfig } from "../lib/api.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  let { check, config, connected, acceptance }: { check?: CompletedPlanCheck; config?: PageConfig; connected: boolean; acceptance?: NonNullable<Snapshot["continuation"]>["acceptance"] } = $props();
  let pending = $state(false);
  let continuing = $state(false);
  let dismissed = $state<string>();
  let error = $state<string>();
  let refreshFailure = $state<string>();
  const earlier = $derived(pending || !!refreshFailure || check?.status === "failed" || check?.status === "checking");
  const result = $derived(earlier ? check?.earlierResult ?? check?.result : check?.result);
  const external = $derived(result?.leaves?.filter(row => row.classification === "externally_verified" || row.classification === "externally_unverified") ?? []);
  const carried = $derived(result?.leaves?.filter(row => row.classification === "carried_completed").length ?? 0);
  const time = (value: string) => new Date(value).toLocaleString();
  async function refresh() {
    if (!config || !connected || pending) return;
    pending = true; error = undefined;
    try {
      const response = await fetch("/api/continuation/check", { method: "POST", headers: { "Content-Type": "application/json", "X-Kiln-Token": config.token }, body: "{}" });
      const answer = await response.json();
      if (!answer.check || !["unchanged", "available", "blocked", "failed"].includes(answer.check.status)) throw new Error(answer.reason ?? "Could not check the current plan. Try again.");
      // Apply the HTTP observation before releasing pending; SSE may arrive later.
      check = answer.check;
      refreshFailure = undefined;
    } catch (failure) { refreshFailure = (failure as Error).message; }
    finally { pending = false; }
  }
  async function grant(target: import("../../../src/state/development-delivery.js").MergeTarget) {
    if (!config || !connected || !result?.proposal || continuing) return;
    continuing = true; error = undefined;
    try { const answer = await authorizeContinuation(config, result.proposal.completedExecutionId, result.proposal.id, result.proposal.authorization?.revision ?? 0, target); if (!answer.ok) error = answer.reason; }
    finally { continuing = false; }
  }
  async function accept(retry = false) {
    if (!config || !connected || continuing) return;
    const proposal = result?.proposal;
    if (!retry && !proposal || retry && !acceptance) return;
    continuing = true; error = undefined;
    try {
      const answer = await continueFeature(config, retry ? acceptance!.completedExecutionId : proposal!.completedExecutionId, retry ? { acceptanceId: acceptance!.id } : { proposalId: proposal!.id });
      if (!answer.ok) error = answer.reason;
    } finally { continuing = false; }
  }
  // One mount/reload read. SSE reconnect and the clock never request another check.
  onMount(() => { void refresh(); });
</script>

<section class="plan-check" aria-label="Current plan check" aria-live="polite">
  <h2>{check?.status === "checking" || pending ? "Checking for new phases" : refreshFailure || check?.status === "failed" ? "Could not check for new phases" : check?.status === "unchanged" ? "No new phases found" : result?.added.length ? "New phases found" : check?.status === "blocked" ? "Plan needs reconciliation" : "Check the current plan"}</h2>
  {#if refreshFailure}<p role="alert">{refreshFailure}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if earlier}<p>Showing earlier results. The current phase count is unknown.</p>{/if}
  {#each check?.errors ?? [] as problem}<p class="problem">{problem}</p>{/each}
  {#if acceptance && ["preparing", "blocked"].includes(acceptance.state)}
    <h3>{acceptance.state === "preparing" ? "Preparing additional work" : "Preparation needs attention"}</h3>
    {#if acceptance.reason}<p class="problem">{acceptance.reason}</p>{/if}
    {#each acceptance.repositories as repository}<p>{repository.name}: {repository.ready ? "Workspace ready" : "Waiting for setup"} · {repository.worktreePath}</p>{/each}
    {#if acceptance.state === "blocked"}<button class="button" disabled={!connected || continuing || pending} onclick={() => accept(true)}>Retry preparation</button>{/if}
    <p>The accepted plan is retained. Earlier delivery remains complete while preparation is reconciled.</p>
  {/if}
  {#if result && dismissed === result.proposal?.id}
    <p>Additional work is available when you are ready.</p>
    <button class="button" onclick={() => { dismissed = undefined; }}>Show continuation offer</button>
  {:else if result}
    {#if result.added.length}
      <p>{earlier ? "Earlier result: " : ""}{result.added.length} new unfinished {result.added.length === 1 ? "phase" : "phases"}.</p>
      <ul>{#each result.added as phase}<li>Phase {phase.id} · {phase.title}</li>{/each}</ul>
    {/if}
    {#if result.proposal}
      <h3>{earlier ? "Earlier readiness" : "Readiness"}: {result.proposal.readiness === "ready" ? "Ready" : "Not ready"}</h3>
      {#if result.proposal.firstEligiblePhase}<p>First phase to run: Phase {result.proposal.firstEligiblePhase}{#if result.proposal.readiness !== "ready"} — after the blockers below are resolved{/if}.</p>{/if}
      {#each result.proposal.preparation as preparation}
        <p>Phase {preparation.phaseId} preparation: integrate Phase {preparation.prerequisites.join(", ")} in {preparation.repository} from {preparation.sourceRef} at {preparation.sourceRevision} into {preparation.destination === "assigned_feature" ? "the fresh phase branch" : preparation.destination}.</p>
        <p>{preparation.authorization === "phase_preparation" ? "Continue authorizes this preparation." : "Requires the existing early-merge target authorization for the fresh run."} Verify before implementation: {preparation.checks.map(check => check.command).join("; ")}.</p>
      {/each}
      {#each result.proposal.prerequisites.filter(row => row.status === "preparation_available") as prerequisite}<p>Phase {prerequisite.phaseId}: awaiting planned preparation; not yet integrated.</p>{/each}
      {#if result.proposal.authorization?.superseded}<p>Earlier target approval was superseded because the plan or its prerequisites changed.</p>{/if}
      {#each result.proposal.authorization?.targets ?? [] as row}
        <p>Early merges to {row.target.repository} / {row.target.baseBranch} may run its existing CI/CD before the PRD finishes.</p>
        {#if row.granted}<p>Authorized for this run: {row.target.repository} / {row.target.baseBranch}</p>
        {:else}<label><input type="checkbox" checked={false} disabled={!connected || !config || continuing || pending || earlier || !result.proposal.grantEligible} onchange={event => { event.currentTarget.checked = false; void grant(row.target); }} /> Authorize early merges to {row.target.repository} / {row.target.baseBranch}</label>{/if}
      {/each}
      {#if result.added.length}
        <div class="actions">
          <button class="button" type="button" disabled={!connected || !config || continuing || pending || earlier || result.proposal.readiness !== "ready" || acceptance?.state === "preparing"} onclick={() => accept()}>Continue with {result.added.length} {result.added.length === 1 ? "phase" : "phases"}</button>
          <button class="button" type="button" disabled={!connected || continuing || pending || acceptance?.state === "preparing"} onclick={() => { dismissed = result.proposal!.id; }}>Not now</button>
        </div>
        {#if result.proposal.prerequisites.some(row => row.status === "preparation_available")}<p>Prerequisite preparation has not been performed and independently verified. Dependent implementation cannot start.</p>{/if}
      {/if}
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
