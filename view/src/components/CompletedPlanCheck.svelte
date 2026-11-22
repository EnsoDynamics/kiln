<script lang="ts">
  // The check for new phases on a finished run, once the delivery has merged (Kiln After Delivery
  // AC-BACK-01, AC-BACK-03, AC-BACK-04; mockup state 5): one of two answers, no new phases or the
  // phases added after Kiln finished, with where they came from and Continue. While the delivery
  // waits to merge the page shows no panel; the pull request card carries the one line (AC-WAIT-02).
  import BusyStatus from "./BusyStatus.svelte";
  import type { CompletedPlanCheck } from "../../../src/engine/completed-plan-discovery.js";
  import { addedHeading, continueLine, lastCheckedLine, noNewPhasesInCardLine, notReadLine, originLine, uncommittedLine } from "../../../src/engine/new-phases-wording.js";
  import { authorizeContinuation, checkForNewPhases, continueFeature, type PageConfig } from "../lib/api.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  // inCard: once every pull request has merged, the answer sits in the pull request card beside Exit Kiln (AC-WAIT-03, mockup state 3).
  let { check, config, connected, acceptance, prdDirectory, inCard = false, now }: { check?: CompletedPlanCheck; config?: PageConfig; connected: boolean; acceptance?: NonNullable<Snapshot["continuation"]>["acceptance"]; prdDirectory: string; inCard?: boolean; now?: number } = $props();
  let pending = $state(false);
  let continuing = $state(false);
  // Continue and Retry preparation, not the early-merge tick, show the busy spinner.
  let accepting = $state(false);
  let dismissed = $state<string>();
  let error = $state<string>();
  let refreshFailure = $state<string>();
  const earlier = $derived(pending || !!refreshFailure || check?.status === "failed" || check?.status === "checking");
  const result = $derived(earlier ? check?.earlierResult ?? check?.result : check?.result);
  const external = $derived(result?.leaves?.filter(row => row.classification === "externally_verified" || row.classification === "externally_unverified") ?? []);
  // In the Merged card, no new phases is one line with its check time, as mockup state 3 shows it.
  const cardLine = $derived(inCard && !earlier && check?.status === "unchanged" && result ? noNewPhasesInCardLine(result.source.branch, check.attemptedAt, now === undefined ? undefined : new Date(now)) : undefined);
  const notes = $derived(result ? [notReadLine(result), uncommittedLine(result, prdDirectory)].filter((line): line is string => !!line) : []);
  // Check for new phases is a person's press (AC-WAIT-01).
  async function refresh() {
    if (!config || !connected || pending) return;
    pending = true; error = undefined;
    try {
      const answer = await checkForNewPhases(config, true);
      if (!answer.check || !["unchanged", "available", "blocked", "failed", "awaiting_merge"].includes(answer.check.status)) throw new Error(answer.reason ?? "Could not check the current plan. Try again.");
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
    continuing = true; accepting = true; error = undefined;
    try {
      const answer = await continueFeature(config, retry ? acceptance!.completedExecutionId : proposal!.completedExecutionId, retry ? { acceptanceId: acceptance!.id } : { proposalId: proposal!.id });
      if (!answer.ok) error = answer.reason;
    } finally { continuing = false; accepting = false; }
  }
</script>

<section class="plan-check" class:in-card={inCard} aria-label="Current plan check" aria-live="polite">
  {#if cardLine}<p class="answer">{cardLine} <button class="link" type="button" onclick={refresh} disabled={!connected || !config || pending}>Check for new phases</button></p>{:else}
  <h2>{check?.status === "checking" || pending ? "Checking for new phases" : refreshFailure || check?.status === "failed" ? "Could not check for new phases" : result?.added.length ? addedHeading(result.added.length) : check?.status === "unchanged" ? "No new phases found" : "Check for new phases"}</h2>{/if}
  {#if refreshFailure}<p role="alert">{refreshFailure}</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if earlier}<p>Showing earlier results. The current phase count is unknown.</p>{/if}
  {#each check?.errors ?? [] as problem}<p class="problem">{problem}</p>{/each}
  {#if acceptance && ["preparing", "blocked"].includes(acceptance.state)}
    <h3>{acceptance.state === "preparing" ? "Preparing additional work" : "Preparation needs attention"}</h3>
    {#if acceptance.reason}<p class="problem">{acceptance.reason}</p>{/if}
    {#each acceptance.repositories as repository}<p>{repository.name}: {repository.ready ? "Workspace ready" : "Waiting for setup"} · {repository.worktreePath}</p>{/each}
    {#if acceptance.state === "blocked"}<button class="button" class:busy={accepting} aria-busy={accepting} disabled={!connected || continuing || pending} onclick={() => accept(true)}>Retry preparation</button>{#if accepting}<BusyStatus text="Preparing the workspace for the new phases." />{/if}{/if}
    <p>The accepted plan is retained. Earlier delivery remains complete while preparation is reconciled.</p>
  {/if}
  {#if result && dismissed === result.proposal?.id}
    <p>Additional work is available when you are ready.</p>
    <button class="button" onclick={() => { dismissed = undefined; }}>Show continuation offer</button>
  {:else if result}
    {#if result.added.length}
      <ul class="added">{#each result.added as phase}<li>Phase {phase.id} · {phase.title} · <span class="planned">planned, not built</span></li>{/each}</ul>
      {#if originLine(result)}<p>{originLine(result)}</p>{/if}
    {/if}
    {#if result.proposal && result.added.length}
      <h3>{earlier ? "Earlier readiness" : "Readiness"}: {result.proposal.readiness === "ready" ? "Ready" : "Not ready"}</h3>
      {#if result.proposal.firstEligiblePhase}<p>First phase to run: Phase {result.proposal.firstEligiblePhase}{#if result.proposal.readiness !== "ready"} — after the blockers below are resolved{/if}.</p>{/if}
      {#each result.proposal.preparation as preparation}
        <p>Phase {preparation.phaseId} preparation: integrate Phase {preparation.prerequisites.join(", ")} in {preparation.repository} from {preparation.sourceRef} at {preparation.sourceRevision} into {preparation.destination === "assigned_feature" ? "the fresh phase branch" : preparation.destination}.</p>
        <p>{preparation.authorization === "phase_preparation" ? "Continue authorizes this preparation." : "Requires the existing early-merge target authorization for the fresh run."} Verify before implementation: {preparation.checks.map(check => check.command).join("; ")}.</p>
      {/each}
      {#each result.proposal.prerequisites.filter(row => row.status === "preparation_available") as prerequisite}<p>Phase {prerequisite.phaseId}: awaiting planned preparation; not yet integrated.</p>{/each}
      {#if result.proposal.authorization?.superseded}<p>{result.followsPush ? `Pushing the plan moved ${result.source.branch}, so the earlier permission for early merges no longer applies. Authorize early merges again to continue.` : "Earlier target approval was superseded because the plan or its prerequisites changed."}</p>{/if}
      {#each result.proposal.authorization?.targets ?? [] as row}
        <p>Early merges to {row.target.repository} / {row.target.baseBranch} may run its existing CI/CD before the PRD finishes.</p>
        {#if row.granted}<p>Authorized for this run: {row.target.repository} / {row.target.baseBranch}</p>
        {:else}<label><input type="checkbox" checked={false} disabled={!connected || !config || continuing || pending || earlier || !result.proposal.grantEligible} onchange={event => { event.currentTarget.checked = false; void grant(row.target); }} /> Authorize early merges to {row.target.repository} / {row.target.baseBranch}</label>{/if}
      {/each}
      {#each result.problems as problem}<p class="problem">{problem}</p>{/each}
      <div class="actions">
        <button class="button" type="button" disabled={!connected || !config || continuing || pending || earlier || result.proposal.readiness !== "ready" || acceptance?.state === "preparing"} class:busy={accepting} aria-busy={accepting} onclick={() => accept()}>Continue with {result.added.length} {result.added.length === 1 ? "phase" : "phases"}</button>
        <button class="button" type="button" disabled={!connected || continuing || pending || acceptance?.state === "preparing"} onclick={() => { dismissed = result.proposal!.id; }}>Not now</button>
      </div>
      <p>{continueLine(result.added.length, result.source.branch)}</p>
      {#if accepting && !acceptance}<BusyStatus text="Preparing the workspace for the new phases." />{/if}
      {#if result.proposal.prerequisites.some(row => row.status === "preparation_available")}<p>Prerequisite preparation has not been performed and independently verified. Dependent implementation cannot start.</p>{/if}
    {/if}
    {#if external.length}
      <h3>Closed outside Kiln</h3>
      <ul>{#each external as phase}<li>
        <strong>Phase {phase.id} · {phase.title}</strong>
        <p>{phase.classification === "externally_verified" ? "Completion and integration verified" : "Not verified"}.</p>
        {#each phase.repositories as repository}<p class="source">{repository.repository}: {repository.revision} · {repository.integration === "integrated_verified" ? "Verified in" : "Not verified in"} {repository.baseBranch} at {repository.baseRevision}</p>{/each}
      </li>{/each}</ul>
    {/if}
    {#each notes as note}<p class="note">{note}</p>{/each}
  {/if}
  {#if !cardLine}
    <button class="button" type="button" onclick={refresh} disabled={!connected || !config || pending || check?.status === "checking"}>{pending || check?.status === "checking" ? "Checking…" : "Check for new phases"}</button>
    {#if check?.lastSuccessfulAt}<p class="source">{lastCheckedLine(check.lastSuccessfulAt)}</p>{/if}
  {/if}
</section>

<style>
  .plan-check { border: 1px solid var(--amber); border-radius: 16px; padding: 24px; margin: 24px 0; overflow-wrap: anywhere; }
  h2 { font-family: var(--serif); font-weight: 400; font-size: 34px; }
  .plan-check.in-card { border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 16px 0 0; margin: 0; }
  .in-card h2 { font-size: 24px; margin: 0 0 8px; }
  .answer { margin: 0; font-size: 13.5px; }
  .link { background: none; border: 0; padding: 0 0 0 8px; font: inherit; font-weight: 600; color: var(--green); text-decoration: underline; cursor: pointer; }
  .link:disabled { color: var(--dim); cursor: default; }
  p, li { color: var(--muted); line-height: 1.6; }
  .source { font-size: 12px; }
  .problem { border-left: 3px solid var(--amber); padding-left: 12px; color: var(--text); }
  .note { border-left: 2px dashed var(--line); padding-left: 12px; }
  .added { list-style: none; padding: 0; }
  .planned { color: var(--dim); }
</style>
