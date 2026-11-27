<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import FeatureHeader from "../components/FeatureHeader.svelte";
  import BillingPanels from "../components/BillingPanels.svelte";
  import RequirementsFeedback from "../components/RequirementsFeedback.svelte";
  import RequirementsPlan from "../components/RequirementsPlan.svelte";
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
    <p><a href={config.base + "/stakeholder-review"} target="_blank" rel="noopener">Open stakeholder review</a> · Ready since {new Date(review.readySince).toLocaleString()}{#if review.refreshedAt} · refreshed at {new Date(review.refreshedAt).toLocaleString()} with your feedback{/if}</p>
    <RequirementsFeedback {snapshot} {connected} />
    {#if final}
      <p>{review.openAssumptions} unconfirmed assumptions. The build can proceed with these assumptions.</p>
      {#if requirements.build?.noPhasePlan}<p>The requirements finished without a phase plan. Kiln builds from phase documents. Write and commit the phase plan in your own session, then press Resume.</p>{/if}
    {/if}
    <details><summary>Use a session of your own</summary><pre>{review.resumeCommand ?? review.freshSessionCommand}</pre><p>Commit your changes, then resume Kiln.</p><button disabled={!connected || busy} onclick={() => act(() => resumeNow(config))}>Resume</button></details>
  {:else}
    <h2>What Kiln found</h2>
    {#if requirements.standsAt}
      <!-- A PRD started by hand (AC-BEGIN-04): where its documents stand, and Kiln continues from there. -->
      <p><strong>Started by hand · {requirements.standsAt}.</strong> Kiln continues from there{#if !requirements.standsAt.startsWith("Technical design") && !requirements.standsAt.startsWith("Phase plan")}, with the early review once the PRD is refined{/if}.</p>
      <p>PRD <code>{requirements.origin.files.find(file => file.endsWith("-prd.md"))?.split("/").at(-1)}</code> · committed <code>{requirements.origin.commit.slice(0, 7)}</code> on {requirements.start?.holds ?? settings.baseBranch}{#if requirements.start?.holds}, not merged yet{/if}.</p>
    {:else}
      <ul>{#each requirements.origin.files as file}<li><code>{file}</code></li>{/each}</ul>
      <p>Committed at <code>{requirements.origin.commit.slice(0, 8)}</code> on {settings.baseBranch}.</p>
    {/if}
    {#if requirements.start}
      <!-- Start from (AC-BEGIN-08): the branch that holds the PRD's documents is selected first. -->
      <fieldset>
        <legend>Start from</legend>
        <label><input type="radio" name="from" checked={requirements.start.from === "new"} disabled={!connected || busy} onchange={() => act(() => changeSettings(config, { start: { from: "new", bringUpToDate: true } }))} /> A new feature branch. Kiln cuts it from the base branch.</label>
        <label><input type="radio" name="from" checked={requirements.start.from === "existing"} disabled={!connected || busy} onchange={() => act(() => changeSettings(config, { start: { from: "existing", bringUpToDate: true } }))} /> A branch that already exists. Work already begun on this PRD, by you or by Kiln before a reset. Kiln carries on from it.</label>
      </fieldset>
    {/if}
    {#if requirements.start?.from === "existing"}
      <label>Feature branch <select value={settings.featureBranch} disabled={!connected || busy} onchange={e => act(() => changeSettings(config, { featureBranch: e.currentTarget.value }))}>{#each requirements.start.branches as branch}<option value={branch.name} disabled={!branch.available}>{branch.name}</option>{/each}</select></label>
      {#if requirements.start.holds === settings.featureBranch}<p>The branch that holds this PRD's documents and hasn't merged. Every stage and phase lands on it, and Kiln adds its commits and pushes them. It never rewrites, resets or force-pushes it.</p>{/if}
      {#if requirements.start.problem}<p role="alert">{requirements.start.problem}</p>{/if}
    {:else}
      <label>Feature branch <input value={settings.featureBranch} onchange={e => act(() => changeSettings(config, { featureBranch: e.currentTarget.value }))} /></label>
    {/if}
    {#if settings.waitAtEarlyReview}<label><input type="checkbox" checked={settings.waitAtEarlyReview.value} disabled={!connected || busy} onchange={e => act(() => changeSettings(config, { waitAtEarlyReview: e.currentTarget.checked }))} /> Wait for me at the early review. You can change this until the refinement finishes.</label>{/if}
    <BillingPanels {snapshot} {connected} />
  {/if}
  {#if final}
    <h2>Phase plan</h2>
    <ol>{#each snapshot.phases.filter(p => p.id !== "pr") as phase}<li>Phase {phase.id} · {phase.title} {phase.model?.choice?.modelName ?? ""}</li>{/each}</ol>
  {:else}
    <RequirementsPlan {snapshot} {connected} />
  {/if}
  {#if !review}
    <p>Kiln waits at the early review and stops at the final review. Only Start the build begins implementation.</p>
    {#if blocked}<p>{blocked}</p>{/if}
    <button disabled={!connected || !!blocked || busy || settings.baseCheck !== "ok"} onclick={() => act(() => start(config, false, requirements.start?.previewId))}>Start</button>
    {#if requirements.standsAt}<p>Continues from where the PRD stands{#if requirements.start?.from === "existing"}, on {settings.featureBranch}{/if}. Stops at the early review, and at the final review before the build.</p>{/if}
  {:else if final}
    {#if requirements.build?.refinementConfirmation === "needed"}<label><input type="checkbox" bind:checked={confirmed} /> I confirm the documents have been through requirements refinement.</label>{/if}
    {#each requirements.build?.checksFailed ?? [] as failure}<p>{failure}</p>{/each}
    <button disabled={!connected || busy || !!requirements.build?.checksFailed?.length || (requirements.build?.refinementConfirmation === "needed" && !confirmed)} onclick={() => act(() => startBuild(config, confirmed))}>Start the build</button>
  {:else}
    <p>Nothing to change, or no time to read it now? Kiln carries on, and the review comes back at the end as the final review, showing only what is still open.</p>
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
</style>
