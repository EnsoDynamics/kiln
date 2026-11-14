<script lang="ts">
  // Bring the branch up to date with <base> first (run restart AC-CURRENT-01): offered, ticked,
  // when a branch has no commits of its own and nothing uncommitted and is behind its base, with
  // how far behind; one offer for every repository that qualifies. On Documents found it covers
  // Start; on a stopped phase's page, every button below that starts or resumes the phase.
  import type { CatchUpOffer } from "../../../src/engine/start-from.js";

  let { offer, where, activity, ticked = $bindable(true), disabled = false, onchange }: { offer: CatchUpOffer; where: "start" | "stop"; activity?: string; ticked?: boolean; disabled?: boolean; onchange?: (ticked: boolean) => void } = $props();
  const commits = (count: number) => `${count} ${count === 1 ? "commit" : "commits"}`;
  const multi = $derived(offer.repositories.length > 1);
  // Each repository is named with its own base; the box names the base only when every repository shares it.
  const bases = $derived([...new Set(offer.repositories.map((repository) => repository.base))]);
</script>

<div class="offer" class:start={where === "start"} class:stop={where === "stop"}>
  {#if multi}
    {#each offer.repositories as repository (repository.name)}
      <span class="behind">In <span class="mono">{repository.name}</span>, the branch is {commits(repository.behind)} behind <code>{repository.base}</code>.</span>
    {/each}
  {:else}
    <span class="behind">This branch is {commits(offer.repositories[0]!.behind)} behind <code>{offer.repositories[0]!.base}</code>.</span>
  {/if}
  <label class="tick">
    <input type="checkbox" checked={ticked} {disabled} onchange={(event) => { ticked = event.currentTarget.checked; onchange?.(ticked); }} />
    <span class="text"><span>{#if bases.length === 1}Bring the branch up to date with <code>{bases[0]}</code> first{:else}Bring the branch up to date with each repository’s base first{/if}</span><span class="help">Offered because the branch has no commits of its own and nothing uncommitted, so nothing can be lost or overwritten. {where === "start" ? "Kiln does this when you press Start." : `Kiln does this when a button below starts or resumes ${activity ?? "the phase"}.`}</span></span>
  </label>
</div>

<style>
  .offer { display: flex; flex-direction: column; gap: 10px; }
  /* Each page draws the offer in its own amber box (run restart AC-LOOK-01). */
  .offer.start { border: 1px solid var(--amber-border); border-radius: 12px; padding: 14px 16px; }
  .offer.stop { border: 1px solid var(--amber-border); border-radius: 14px; padding: 16px 20px; }
  .behind { color: var(--muted); }
  .start .behind { font-size: 13px; }
  .stop .behind { font-size: 13.5px; }
  .tick { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; cursor: pointer; }
  .tick input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  .text { display: flex; flex-direction: column; gap: 2px; font-size: 14.5px; color: var(--text); }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.55; }
  code, .mono { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
</style>
