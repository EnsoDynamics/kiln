<script lang="ts">
  import { untrack } from "svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { DevelopmentSettings, DevelopmentTarget } from "../../../src/state/development-delivery.js";
  import { authorizeDevelopmentTarget, changeSettings, type PageConfig } from "../lib/api.js";
  let { snapshot, config, connected, editable = false }: { snapshot: Snapshot; config?: PageConfig | undefined; connected: boolean; editable?: boolean } = $props();
  let environments = $state<Record<string, string>>({});
  let selected = $state<Record<string, boolean>>({});
  let error = $state("");
  let grantConfirmed = $state<Record<string, boolean>>({});
  let granting = $state(false);
  let inspected = $state<Record<string, string>>({});
  async function inspect(digest: string) { if (!config) return; try { const response = await fetch(`/api/delivery/evidence/${digest}`, { headers: { "X-Kiln-Token": config.token } }); inspected[digest] = JSON.stringify(await response.json(), null, 2); } catch (failure) { inspected[digest] = (failure as Error).message; } }
  let optimistic = $state<DevelopmentSettings | undefined>();
  let saving = $state(false);
  $effect(() => { snapshot.settings.developmentDeployments; untrack(() => { if (!saving) optimistic = undefined; }); });
  const saved = $derived(optimistic ?? snapshot.settings.developmentDeployments ?? { enabled: false, targets: [] });
  const delivery = $derived(snapshot.developmentDelivery);
  const preference = $derived(snapshot.savedDevelopmentTargets);
  async function save(settings: DevelopmentSettings) {
    if (!config || saving) return;
    const choosingReuse = settings.useSavedTargetsForThisPrd === true && !saved.useSavedTargetsForThisPrd;
    optimistic = { ...saved, ...settings, rememberForPrdRepository: settings.rememberForPrdRepository ?? false, preferenceRevision: settings.preferenceRevision ?? preference?.revision };
    saving = true;
    const answer = await changeSettings(config, { developmentDeployments: optimistic });
    error = answer.ok ? "" : answer.reason ?? "Could not save development targets.";
    if (answer.ok) { optimistic = (answer.settings as Snapshot["settings"]).developmentDeployments; if (choosingReuse) { environments = {}; selected = {}; } }
    else optimistic = undefined;
    saving = false;
  }
  function target(row: Snapshot["repositories"][number]): DevelopmentTarget { return { repository: row.github ?? "", baseBranch: row.baseBranch, environment: (environments[row.name] ?? saved.targets.find(one => one.target.repository === row.github)?.target.environment ?? "").trim() }; }
  async function confirm(row: Snapshot["repositories"][number], confirmed: boolean) {
    const value = target(row); if (!value.environment) { error = "Name the actual development environment before confirming it."; return; }
    await save({ enabled: saved.enabled, targets: [...saved.targets.filter(one => one.target.repository !== row.github), { target: value, confirmedNonProduction: confirmed, ...(confirmed ? { confirmedTarget: value } : {}) }] });
  }
  async function grant(row: Snapshot["repositories"][number]) {
    if (!config || !delivery?.executionId || !grantConfirmed[row.name]) return;
    granting = true;
    const answer = await authorizeDevelopmentTarget(config, { executionId: delivery.executionId, authorizationRevision: delivery.authorization.revision, target: target(row), confirmedNonProduction: true });
    error = answer.ok ? "" : answer.reason;
    if (answer.ok) grantConfirmed[row.name] = false;
    granting = false;
  }
  function changed(row: Snapshot["repositories"][number], environment: string) {
    environments[row.name] = environment; grantConfirmed[row.name] = false;
    if (saved.targets.some(one => one.target.repository === row.github)) void save({ enabled: saved.enabled, targets: saved.targets.filter(one => one.target.repository !== row.github) });
  }
</script>

{#if (editable && snapshot.settings.developmentDeployments !== undefined) || delivery?.authorization.enabled || snapshot.needsYou}
<section class="delivery" aria-label="Development deployments">
  {#if editable}
    <label><input type="checkbox" checked={saved.enabled} disabled={!connected || saving || snapshot.documents?.starting} onchange={event => save({ enabled: event.currentTarget.checked, targets: saved.targets })} /> Allow development deployments</label>
    <p>Approved changes may deploy to shared development environments before the PRD finishes. Production and destructive actions remain unauthorized. Required tests, reviews and branch protections still apply.</p>
    {#if preference}
      <p>Saved-target storage group: <strong>{preference.group.repository}</strong> · {preference.group.mainCheckoutPath}. Sharing this requirements repository grants no authority.</p>
      {#if preference.revision > 0}
        <ul>{#each preference.targets as target}<li>{target.repository} · {target.baseBranch} · {target.environment}</li>{/each}</ul>
        {#if !preference.enabled}<p>The saved choice keeps development deployments off.</p>{/if}
        <label><input type="checkbox" checked={saved.useSavedTargetsForThisPrd === true} disabled={!connected || saving || snapshot.documents?.starting} onchange={event => save({ ...saved, useSavedTargetsForThisPrd: event.currentTarget.checked, ...(event.currentTarget.checked ? {} : { enabled: false, targets: [] }) })} /> Use these saved targets for this PRD</label>
      {/if}
      <label><input type="checkbox" checked={saved.rememberForPrdRepository === true} disabled={!connected || saving || snapshot.documents?.starting} onchange={event => save({ ...saved, rememberForPrdRepository: event.currentTarget.checked })} /> Save these targets with this requirements repository</label>
      {#if saved.useSavedTargetsForThisPrd}<p>Selected targets below were explicitly reused from {preference.group.repository}. New or changed targets require confirmation.</p>{/if}
    {/if}
    {#if saved.enabled}
      {#each snapshot.repositories as row (row.name)}
        {@const candidate = saved.targets.find(one => one.target.repository === row.github)}
        <fieldset disabled={!connected || saving || snapshot.documents?.starting}>
          <legend>{row.name} · {row.github} · {row.baseBranch}</legend>
          <label><input type="checkbox" checked={selected[row.name] ?? !!candidate} onchange={event => { selected[row.name] = event.currentTarget.checked; if (!event.currentTarget.checked) void save({ enabled: saved.enabled, targets: saved.targets.filter(one => one.target.repository !== row.github) }); }} /> Approve a target in this repository</label>
          {#if selected[row.name] ?? !!candidate}
            <label>Development environment <input type="text" aria-label={`${row.name} development environment`} value={environments[row.name] ?? candidate?.target.environment ?? ""} oninput={event => changed(row, event.currentTarget.value)} /></label>
            <label><input type="checkbox" checked={candidate?.confirmedNonProduction === true && candidate.target.baseBranch === row.baseBranch} onchange={event => confirm(row, event.currentTarget.checked)} /> This exact target is non-production</label>
          {/if}
        </fieldset>
      {/each}
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  {:else if delivery?.authorization.enabled}
    <h3>Development deployments allowed</h3>
    <p>Changes may reach these shared environments before the PRD finishes. Required tests, reviews and protections remain in force.</p>
    <ul>{#each delivery.authorization.grants as grant}<li>{grant.target.repository} · {grant.target.baseBranch} · {grant.target.environment}</li>{/each}</ul>
    {#each delivery.checkpoints as checkpoint (checkpoint.id)}
      <article>
        <h4>{checkpoint.target.repository} · {checkpoint.target.environment}</h4>
        <p>{checkpoint.merge ? "Merge confirmed" : "Merge unresolved"}{#if checkpoint.merge} · <a href={checkpoint.merge.url} target="_blank" rel="noreferrer">#{checkpoint.merge.number}</a>{/if}</p>
        <p>Source {checkpoint.headSha.slice(0, 12)}{#if checkpoint.merge} · Result {checkpoint.merge.resultSha.slice(0, 12)}{/if}</p>
        {#each checkpoint.operations as operation (operation.id)}<p>{operation.kind}: {operation.state === "prepared" ? "planned / awaiting evidence" : operation.state}{#if operation.reason} · {operation.reason}{/if}</p>{/each}
        {#each checkpoint.evidence as fact}<p>{checkpoint.requirements.find(one => one.id === fact.requirementId)?.purpose}: {fact.status} · {fact.environment} · {fact.revision.slice(0, 12)} · {new Date(fact.observedAt).toLocaleString()}</p>{#if config}<button type="button" onclick={() => inspect(fact.rawDigest)}>Inspect {fact.requirementId} evidence</button>{/if}{#if inspected[fact.rawDigest]}<pre>{inspected[fact.rawDigest]}</pre>{/if}{/each}
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
    <h3>Authorize this development target</h3>
    <p>Changes may deploy to the named shared environment before the PRD finishes. Confirm it is non-production. Required tests, reviews and protections still apply. This grant applies only to this execution and does not change saved targets or resume work.</p>
    {#each snapshot.repositories as row (row.name)}
      <fieldset disabled={!connected || snapshot.needsYou.checking || granting}>
        <legend>{row.name} · {row.github} · {row.baseBranch}</legend>
        <label>Development environment <input type="text" aria-label={`${row.name} grant environment`} value={environments[row.name] ?? ""} oninput={event => { environments[row.name] = event.currentTarget.value; grantConfirmed[row.name] = false; }} /></label>
        <label><input type="checkbox" checked={grantConfirmed[row.name] === true} onchange={event => grantConfirmed[row.name] = event.currentTarget.checked} /> This exact target is non-production</label>
        <p>{row.github} · {row.baseBranch} · {environments[row.name] || "Name the actual environment"}</p>
        <button type="button" disabled={!grantConfirmed[row.name] || !environments[row.name]?.trim()} onclick={() => grant(row)}>Authorize {row.name} development target</button>
      </fieldset>
    {/each}
    {#if delivery.activationRecovery?.some(one => !one.passed)}<p>Recovery assessments required for earlier/stopped work: {delivery.activationRecovery.filter(one => !one.passed).map(one => one.owner?.kind === "audit" ? `audit ${one.owner.activityId}` : one.phaseId).join(", ")}. Resume or manual recovery can supply them; Check again only checks evidence.</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  {/if}
</section>
{/if}

<style>
  .delivery { border-top: 1px solid var(--line); padding: 18px 0; font-size: 13px; }
  p { line-height: 1.55; color: var(--muted); overflow-wrap: anywhere; }
  label { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
  fieldset, article { min-width: 0; overflow-wrap: anywhere; border: 1px solid var(--line); padding: 12px; margin: 12px 0; }
  input[type="text"] { min-width: 0; width: 100%; }
  h3, h4 { font-size: 14px; }
  a { color: inherit; }
  legend { overflow-wrap: anywhere; }
  pre { overflow: auto; max-height: 320px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
