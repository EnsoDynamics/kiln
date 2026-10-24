<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { DevelopmentSettings, DevelopmentTarget } from "../../../src/state/development-delivery.js";
  import { changeSettings, type PageConfig } from "../lib/api.js";
  let { snapshot, config, connected, editable = false }: { snapshot: Snapshot; config?: PageConfig | undefined; connected: boolean; editable?: boolean } = $props();
  let environments = $state<Record<string, string>>({});
  let selected = $state<Record<string, boolean>>({});
  let error = $state("");
  let inspected = $state<Record<string, string>>({});
  async function inspect(digest: string) { if (!config) return; try { const response = await fetch(`/api/delivery/evidence/${digest}`, { headers: { "X-Kiln-Token": config.token } }); inspected[digest] = JSON.stringify(await response.json(), null, 2); } catch (failure) { inspected[digest] = (failure as Error).message; } }
  const saved = $derived(snapshot.settings.developmentDeployments ?? { enabled: false, targets: [] });
  const delivery = $derived(snapshot.developmentDelivery);
  async function save(settings: DevelopmentSettings) { if (!config) return; const answer = await changeSettings(config, { developmentDeployments: settings }); error = answer.ok ? "" : answer.reason ?? "Could not save development targets."; }
  function target(row: Snapshot["repositories"][number]): DevelopmentTarget { return { repository: row.github ?? "", baseBranch: row.baseBranch, environment: (environments[row.name] ?? saved.targets.find(one => one.target.repository === row.github)?.target.environment ?? "").trim() }; }
  async function confirm(row: Snapshot["repositories"][number], confirmed: boolean) {
    const value = target(row); if (!value.environment) { error = "Name the actual development environment before confirming it."; return; }
    await save({ enabled: saved.enabled, targets: [...saved.targets.filter(one => one.target.repository !== row.github), { target: value, confirmedNonProduction: confirmed, ...(confirmed ? { confirmedTarget: value } : {}) }] });
  }
  function changed(row: Snapshot["repositories"][number], environment: string) {
    environments[row.name] = environment;
    if (saved.targets.some(one => one.target.repository === row.github)) void save({ enabled: saved.enabled, targets: saved.targets.filter(one => one.target.repository !== row.github) });
  }
</script>

{#if (editable && snapshot.settings.developmentDeployments !== undefined) || delivery?.authorization.enabled}
<section class="delivery" aria-label="Development deployments">
  {#if editable}
    <label><input type="checkbox" checked={saved.enabled} disabled={!connected || snapshot.documents?.starting} onchange={event => save({ enabled: event.currentTarget.checked, targets: saved.targets })} /> Allow development deployments</label>
    <p>Approved changes may deploy to shared development environments before the PRD finishes. Production and destructive actions remain unauthorized. Required tests, reviews and branch protections still apply.</p>
    {#if saved.enabled}
      {#each snapshot.repositories as row (row.name)}
        {@const candidate = saved.targets.find(one => one.target.repository === row.github)}
        <fieldset disabled={!connected || snapshot.documents?.starting}>
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
