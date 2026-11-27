<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import FeatureHeader from "../components/FeatureHeader.svelte";
  import BillingPanels from "../components/BillingPanels.svelte";
  import { changeSettings, continueReview, resumeNow, start, startBuild, type CommandAnswer, type PageConfig } from "../lib/api.js";

  let { snapshot, config, connected }: { snapshot: Snapshot; config: PageConfig; connected: boolean } = $props();
  const requirements = $derived(snapshot.requirements!);
  const review = $derived(requirements.review);
  const settings = $derived(snapshot.settings);
  const final = $derived(review?.kind === "final");
  let confirmed = $state(false);
  let reason = $state("");
  let busy = $state(false);
  const blocked = $derived(settings.models.problem || settings.startBlockedBy || Object.values(settings.fieldErrors)[0]);
  async function act(action: () => Promise<CommandAnswer>) {
    if (busy) return;
    busy = true;
    try { const result = await action(); reason = result.ok ? "" : result.reason; }
    finally { busy = false; }
  }
</script>

<main class="requirements">
  <FeatureHeader repositoryName={snapshot.feature.repositoryLabel} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name} />
  {#if review}
    <h2>{final ? "Final stakeholder review" : "Early stakeholder review"}</h2>
    <p>{final ? "The requirements are finished. Review them before starting the build." : "Review the refined PRD before the technical design. The review returns at the end."}</p>
    <p><a href={config.base + "/stakeholder-review"} target="_blank" rel="noopener">Open stakeholder review</a> · Ready since {new Date(review.readySince).toLocaleString()}</p>
    {#if final}
      <p>{review.openAssumptions} unconfirmed assumptions. The build can proceed with these assumptions.</p>
      {#if requirements.build?.noPhasePlan}<p>The requirements finished without a phase plan. Kiln builds from phase documents. Write and commit the phase plan in your own session, then press Resume.</p>{/if}
    {/if}
    <details><summary>Use a session of your own</summary><pre>{review.resumeCommand ?? review.freshSessionCommand}</pre><p>Commit your changes, then resume Kiln.</p><button disabled={!connected || busy} onclick={() => act(() => resumeNow(config))}>Resume</button></details>
  {:else}
    <h2>What Kiln found</h2>
    <ul>{#each requirements.origin.files as file}<li><code>{file}</code></li>{/each}</ul>
    <p>Committed at <code>{requirements.origin.commit.slice(0, 8)}</code> on {settings.baseBranch}.</p>
    <label>Feature branch <input value={settings.featureBranch} onchange={e => act(() => changeSettings(config, { featureBranch: e.currentTarget.value }))} /></label>
    <BillingPanels {snapshot} {connected} />
  {/if}
  <h2>{final ? "Phase plan" : "Requirements stages"}</h2>
  <ol>
    {#if final}
      {#each snapshot.phases.filter(p => p.id !== "pr") as phase}<li>Phase {phase.id} · {phase.title} {phase.model?.choice?.modelName ?? ""}</li>{/each}
    {:else}
      {#each requirements.rows as row}<li>{row.title}{#if row.otherSkills?.length} · {row.otherSkills.join(", ")}{/if} <small>{row.state} {row.model?.choice?.modelName ?? ""}</small>{#if row.pushedSha} · <code>{row.pushedSha.slice(0, 8)}</code>{/if}</li>{/each}
    {/if}
  </ol>
  {#if !review}
    <p>Kiln waits at the early review and stops at the final review. Only Start the build begins implementation.</p>
    {#if blocked}<p>{blocked}</p>{/if}
    <button disabled={!connected || !!blocked || busy || settings.baseCheck !== "ok"} onclick={() => act(() => start(config, false))}>Start</button>
  {:else if final}
    {#if requirements.build?.refinementConfirmation === "needed"}<label><input type="checkbox" bind:checked={confirmed} /> I confirm the documents have been through requirements refinement.</label>{/if}
    {#each requirements.build?.checksFailed ?? [] as failure}<p>{failure}</p>{/each}
    <button disabled={!connected || busy || !!requirements.build?.checksFailed?.length || (requirements.build?.refinementConfirmation === "needed" && !confirmed)} onclick={() => act(() => startBuild(config, confirmed))}>Start the build</button>
  {:else}
    <button disabled={!connected || busy} onclick={() => act(() => continueReview(config))}>Continue to the technical design</button>
  {/if}
  {#if reason}<p role="alert">{reason}</p>{/if}
</main>

<style>
  .requirements { max-width: 54rem; margin: auto; padding: 2rem; }
  h2 { margin-top: 2rem; }
  li { padding: .35rem 0; }
  code, pre { overflow-wrap: anywhere; white-space: pre-wrap; }
  label { display: block; margin: 1rem 0; }
  button, input { font: inherit; padding: .5rem .8rem; }
  button { cursor: pointer; }
  small { color: var(--dim); }
</style>
