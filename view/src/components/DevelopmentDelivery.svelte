<script lang="ts">
  import { untrack } from "svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { DevelopmentSettings, MergeTarget } from "../../../src/state/development-delivery.js";
  import { authorizeDevelopmentTarget, changeSettings, type PageConfig } from "../lib/api.js";
  let { snapshot, config, connected, editable = false }: { snapshot: Snapshot; config?: PageConfig | undefined; connected: boolean; editable?: boolean } = $props();
  import EarlyMergeTarget from "./EarlyMergeTarget.svelte";
  import { shortDateTime, waivedRequirements } from "../lib/waivers.js";
  let error = $state("");
  let granting = $state(false);
  let inspected = $state<Record<string, string>>({});
  async function inspect(digest: string) { if (!config) return; try { const response = await fetch(`/api/delivery/evidence/${digest}`, { headers: { "X-Kiln-Token": config.token } }); inspected[digest] = JSON.stringify(await response.json(), null, 2); } catch (failure) { inspected[digest] = (failure as Error).message; } }
  let optimistic = $state<DevelopmentSettings | undefined>();
  let saving = $state(false);
  $effect(() => { snapshot.settings.developmentDeployments; untrack(() => { if (!saving) optimistic = undefined; }); });
  const saved = $derived(optimistic ?? snapshot.settings.developmentDeployments ?? { enabled: false, targets: [] });
  const delivery = $derived(snapshot.developmentDelivery);
  const legacyChoices = $derived(saved.targets.length > 0);
  async function save(settings: DevelopmentSettings) {
    if (!config || saving) return;
    optimistic = { ...saved, ...settings };
    saving = true;
    const answer = await changeSettings(config, { developmentDeployments: optimistic });
    error = answer.ok ? "" : answer.reason ?? "Could not save early-merge choices.";
    if (answer.ok) { optimistic = (answer.settings as Snapshot["settings"]).developmentDeployments; }
    else optimistic = undefined;
    saving = false;
  }
  function target(row: Snapshot["repositories"][number]): MergeTarget { return { repository: row.github ?? "", baseBranch: row.baseBranch }; }
  async function grant(row: Snapshot["repositories"][number]) {
    if (!config || !delivery?.executionId || granting) return;
    granting = true;
    const answer = await authorizeDevelopmentTarget(config, { executionId: delivery.executionId, authorizationRevision: delivery.authorization.revision, target: target(row) });
    error = answer.ok ? "" : answer.reason;
    granting = false;
  }
</script>

{#if (editable && snapshot.settings.developmentDeployments !== undefined) || delivery?.authorization.enabled || snapshot.needsYou}
<section class="delivery" aria-label="Early merges">
  {#if editable}
    <label><input type="checkbox" checked={saved.enabled} disabled={!connected || saving || snapshot.documents?.starting} onchange={event => save({ enabled: event.currentTarget.checked, targets: [] })} /> <span>Allow early merges</span></label>
    <p>Kiln normally keeps work on its feature branch for a review PR. Allow early merges when a PRD criterion needs deployment or verification. Required checks and reviews still apply; the repository’s existing CI/CD may run before the PRD finishes.</p>
    <p>Applies to this PRD only. Each new PRD starts with early merges off.</p>
    {#if saved.enabled}
      {#if legacyChoices}<p>This existing setup keeps its earlier branch permissions. Turn early merges off and back on to cover all participating repositories.</p>
      {:else}<p>All repository branches listed below are covered. Repositories added after Start need separate approval.</p>{/if}
    {/if}
    {#if saved.enabled}
      <div class="merge-targets">
        {#each snapshot.repositories as row (row.name)}
          {@const candidate = saved.targets.find(one => one.target.repository === row.github && one.target.baseBranch === row.baseBranch)}
          {#if !legacyChoices || candidate}
            <EarlyMergeTarget name={row.name} repository={row.github} branch={row.baseBranch} mode="summary" disabled={!connected || saving || !!snapshot.documents?.starting} legacyEnvironment={saved.targets.filter(one => one.target.repository === row.github && one.target.baseBranch === row.baseBranch).map(one => one.target.environment).filter(Boolean).join(", ") || undefined} />
          {/if}
        {/each}
      </div>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  {:else if delivery?.authorization.enabled}
    <h3>Early merges allowed</h3>
    <p>Required checks and reviews still apply; the repository’s existing CI/CD may run before the PRD finishes.</p>
    <ul>{#each delivery.authorization.grants as grant}<li>{grant.target.repository} · {grant.target.baseBranch}{#if grant.target.environment}{" · "}Existing scope: {grant.target.environment}{/if}</li>{/each}</ul>
    {#each delivery.checkpoints as checkpoint (checkpoint.id)}
      {@const waived = waivedRequirements(snapshot, checkpoint.id)}
      <article>
        <h4>{checkpoint.target.repository} · {checkpoint.target.environment}</h4>
        <p>{checkpoint.merge ? "Merge confirmed" : "Merge unresolved"}{#if checkpoint.merge} · <a href={checkpoint.merge.url} target="_blank" rel="noreferrer">#{checkpoint.merge.number}</a>{/if}</p>
        <p>Source {checkpoint.headSha.slice(0, 12)}{#if checkpoint.merge} · Result {checkpoint.merge.resultSha.slice(0, 12)}{/if}</p>
        {#each checkpoint.operations as operation (operation.id)}<p>{operation.kind}: {operation.state === "prepared" ? "planned / awaiting evidence" : operation.state}{#if operation.reason} · {operation.reason}{/if}</p>{/each}
        {#each checkpoint.evidence.filter(fact => fact.status === "success" || !waived.has(fact.requirementId)) as fact}<p>{checkpoint.requirements.find(one => one.id === fact.requirementId)?.purpose}: {fact.status} · {fact.environment} · {fact.revision.slice(0, 12)} · {new Date(fact.observedAt).toLocaleString()}</p>{#if config}<button type="button" onclick={() => inspect(fact.rawDigest)}>Inspect {fact.requirementId} evidence</button>{/if}{#if inspected[fact.rawDigest]}<pre>{inspected[fact.rawDigest]}</pre>{/if}{/each}
        {#each [...waived] as [requirementId, waiver] (requirementId)}
          {#if !checkpoint.evidence.some(fact => fact.requirementId === requirementId && fact.status === "success")}<p>{checkpoint.requirements.find(one => one.id === requirementId)?.purpose ?? (requirementId === "requiredMerge" ? "merge" : "requirement")} (<code>{requirementId}</code>): <span class="waived">waived</span> · {shortDateTime(waiver.at)}</p>{/if}
        {/each}
        {#if checkpoint.evidenceHistory?.length}
          <details><summary>Earlier confirmed evidence ({checkpoint.evidenceHistory.length})</summary>
            {#each checkpoint.evidenceHistory as fact}<p>{fact.requirementId} · {fact.revision.slice(0, 12)} · {new Date(fact.occurredAt).toLocaleString()}</p>{#if config}<button type="button" onclick={() => inspect(fact.rawDigest)}>Inspect earlier {fact.requirementId} evidence</button>{/if}{#if inspected[fact.rawDigest]}<pre>{inspected[fact.rawDigest]}</pre>{/if}{/each}
          </details>
        {/if}
        {#if checkpoint.unresolvedReason}<p role="alert">{checkpoint.unresolvedReason}</p>{/if}
      </article>
    {/each}
    {#each delivery.repositoryResults as result}<p><strong>{result.repository}: {result.state}</strong>{#if result.reviewPullRequest} · <a href={result.reviewPullRequest.url} target="_blank" rel="noreferrer">Review #{result.reviewPullRequest.number}</a>{/if}{#each result.reasons as reason}<span> · {reason}</span>{/each}</p>{/each}
    {#if delivery.checkedAt}<p>Last checked {new Date(delivery.checkedAt).toLocaleString()}</p>{/if}
  {/if}
  {#if !editable && snapshot.needsYou && delivery?.executionId}
    <h3>Allow early merges</h3>
    <p>Allow merging into a selected branch when a PRD criterion needs deployment or verification. Required checks and reviews still apply; the repository’s existing CI/CD may run before the PRD finishes.</p>
    <p class="scope-note">Applies to this run only. Authorizing does not resume work.</p>
    <div class="merge-targets">
      {#each snapshot.repositories as row (row.name)}
        {@const grants = delivery.authorization.grants.filter(one => one.target.repository === row.github && one.target.baseBranch === row.baseBranch)}
        {@const authorized = grants.some(one => one.target.environment === undefined)}
        <EarlyMergeTarget name={row.name} repository={row.github} branch={row.baseBranch} mode="grant" disabled={!connected || !!snapshot.needsYou.checking || granting} {authorized} legacyEnvironment={authorized ? undefined : grants.map(one => one.target.environment).join(", ") || undefined} onauthorize={() => grant(row)} />
      {/each}
    </div>
    {#if delivery.activationRecovery?.some(one => !one.passed)}<p>Recovery assessments required for earlier/stopped work: {delivery.activationRecovery.filter(one => !one.passed).map(one => one.owner?.kind === "audit" ? `audit ${one.owner.activityId}` : one.phaseId).join(", ")}. Resume or manual recovery can supply them; Check again only checks evidence.</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  {/if}
</section>
{/if}

<style>
  .delivery { border-top: 1px solid var(--line); padding: 18px 0; font-size: 13px; }
  p { line-height: 1.55; color: var(--muted); overflow-wrap: anywhere; }
  label { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; margin: 10px 0; font-size: 14.5px; line-height: 1.5; cursor: pointer; }
  input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  article { min-width: 0; overflow-wrap: anywhere; border: 1px solid var(--line); padding: 12px; margin: 12px 0; }
  .merge-targets { display: grid; gap: 10px; margin: 16px 0; }
  .scope-note { font-size: 12px; }
  h3, h4 { font-size: 14px; }
  a { color: inherit; }
  .waived { color: var(--amber); font-weight: 600; }
  pre { overflow: auto; max-height: 320px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
