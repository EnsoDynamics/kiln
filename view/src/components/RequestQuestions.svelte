<script lang="ts">
  // A session's requests for a repository Kiln couldn't place, asked on any Needs you stop its
  // phase reaches (find repositories anywhere AC-ASK-07, AC-SEE-05; technical design, "Screens"):
  // the drawn question block, with "The session can ask for it again once the phase resumes." in
  // place of the plan stop's sentence about adding the repository and starting the phase.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { locateRepository } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  import RepositoryQuestion from "./RepositoryQuestion.svelte";

  let { snapshot, disabled = false }: { snapshot: Snapshot; disabled?: boolean } = $props();
  const { config } = viewContext();
  const questions = $derived((snapshot.needsYou?.locate ?? []).filter((question) => question.phaseFile === undefined));
  async function answer(repository: string, folder: string) {
    const result = await locateRepository(config, repository, folder);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  }
</script>

{#each questions as question (question.repository)}
  <section class="card asked" aria-label="Where a repository is">
    {#key question.kind + question.checkouts.length}<RepositoryQuestion {question} {disabled} onanswer={(folder) => answer(question.repository, folder)} />{/key}
    <p class="after">The session can ask for it again once the phase resumes.</p>
  </section>
{/each}

<style>
  .asked { gap: 14px; }
  .after { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; }
</style>
