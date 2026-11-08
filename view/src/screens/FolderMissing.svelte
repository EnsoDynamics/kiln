<script lang="ts">
  // Folder missing (missing worktree recovery mockup): an unfinished run's saved folder is gone or
  // holds something else, so no phase state is shown (AC-GONE-02). The page says which folder,
  // what Kiln can still find (AC-FACTS-01 to 03), the git command that puts the folder back when
  // it can be (AC-SETUP-06), Check again, and the setup panel that sets the run up again (AC-SETUP-01 to 07).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import FeatureHeader from "../components/FeatureHeader.svelte";
  import Pill from "../components/Pill.svelte";
  import FolderSetupPanel from "../components/FolderSetupPanel.svelte";
  import { checkFolders } from "../lib/api.js";
  import { baseCard, day, factRows, folderLine, folderState, heading, intro, lostNote, restoreText, savedNote, savedTag, SAVED_TAGS, type Part } from "../lib/folder-missing.js";
  import { phaseName } from "../lib/progress.js";
  import { clockTime } from "../lib/time.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, connected, now, lastSeenAt }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const { config } = viewContext();
  const view = $derived(snapshot.folderMissing!);
  const multi = $derived(view.repositories.length > 1);
  const base = $derived(baseCard(view));
  const baseBranch = $derived(view.plans.base.branch);
  const facts = $derived(factRows(view, baseBranch));
  const history = $derived(snapshot.phases.filter(phase => phase.doneAt));
  const lastRan = $derived(history.map(phase => phase.doneAt!).sort().at(-1));
  let checking = $state(false);
  let reason = $state<string | undefined>(undefined);

  async function checkAgain() {
    checking = true;
    const answer = await checkFolders(config);
    checking = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

{#snippet parts(list: Part[])}{#each list as part, index (index)}{#if part.tone === "code"}<code>{part.text}</code>{:else if part.tone}<span class={part.tone}>{part.text}</span>{:else}{part.text}{/if}{/each}{/snippet}

<main class="page-main">
  <FeatureHeader repositoryName={snapshot.feature.repositoryName} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name} layout="progress">
    <Pill tone="amber" icon="warning" large>Folder missing</Pill>
  </FeatureHeader>
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} {now} />{/if}

  <section class="lead" aria-labelledby="missing-h">
    <div class="between"><span class="eyebrow amber-eyebrow">Stopped · nothing is running</span><span class="small muted">Checked {clockTime(view.checkedAt, new Date(now), { afterWord: true })}</span></div>
    <h2 id="missing-h">{heading(view)}</h2>
    <p class="intro">{intro(view)}</p>
  </section>

  <section class="alert" aria-label="Saved folders">
    {#each view.repositories as repository, index (repository.name)}
      {@const state = folderState(repository)}
      <div class:next={index > 0}>
        <div class="between"><span class="small muted upper">{multi ? `${repository.name} · saved folder` : "The run’s saved folder"}</span><span class="state {state.tone}">{state.text}</span></div>
        <p class="path">{repository.savedFolder}</p>
        <p class="small muted">{@render parts(folderLine(repository))}</p>
      </div>
    {/each}
  </section>

  <section aria-labelledby="found-h">
    <h2 id="found-h" class="section-title">What Kiln found</h2>
    <div class="plans">
      <div class="plan stale">
        <div class="between"><h3>Plan Kiln saved</h3><span class="tag {SAVED_TAGS[view.plans.saved.label]}">{savedTag(view)}</span></div>
        <div class="big">{view.plans.saved.done} <span>of {view.plans.saved.total} phases done</span></div>
        <p class="small muted">{savedNote(view)}</p>
      </div>
      <div class="arrow" aria-hidden="true">→</div>
      <div class="plan">
        <div class="between"><h3>{base.title}</h3><span class="tag">{base.tag}</span></div>
        {#if base.count}<div class="big">{base.count.big} <span>{base.count.rest}</span></div>{/if}
        <p class="small muted">{base.note}</p>
      </div>
    </div>
    <ul class="facts">
      {#each facts as row, index (index)}<li><span>{@render parts(row.label)}</span><span class="value">{@render parts(row.value)}</span></li>{/each}
    </ul>
    <p class="note">{lostNote(view)}</p>
  </section>

  {#if view.panel}<FolderSetupPanel {snapshot} {config} {connected} {now} />{/if}

  <div class="self">
    <div>
      {restoreText(view)}
      {#if view.restoreCommands.length}
        <details><summary>Show the command</summary><div class="command">{#each view.restoreCommands as command (command)}<code>{command}</code>{/each}</div></details>
      {/if}
      {#if reason}<p class="message">{reason}</p>{/if}
    </div>
    <button type="button" class="button" disabled={!connected || checking} onclick={checkAgain}>{checking ? "Checking…" : "Check again"}</button>
  </div>

  {#if history.length || view.stoppedResult}
    {@const stopped = view.stoppedResult}
    <details class="history">
      <summary class="small muted">This run’s history · {history.length} phase{history.length === 1 ? "" : "s"} done{stopped ? ` · ${phaseName(stopped.phaseId, snapshot)} stopped` : ""}</summary>
      <ul class="facts">
        {#each history as phase (phase.id)}<li><span>{phaseName(phase.id, snapshot)} · {phase.title}</span><span class="value muted">Done {clockTime(phase.doneAt!, new Date(now), { afterWord: true })}</span></li>{/each}
        {#if stopped}<li><span>{phaseName(stopped.phaseId, snapshot)} · {snapshot.phases.find(phase => phase.id === stopped.phaseId)?.title ?? ""}</span><span class="value muted">{stopped.failed} of {stopped.passed + stopped.failed} completion checks failed · checked {clockTime(stopped.checkedAt, new Date(now), { afterWord: true })}</span></li>{/if}
      </ul>
    </details>
  {/if}

  <footer class="footer"><span>{snapshot.settings.agent} · {lastRan ? `nothing has run since ${day(lastRan)}` : "nothing is running"}</span><span>Earlier phase results stay in this run’s history.</span></footer>
</main>

<style>
  .between { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  .lead { display: flex; flex-direction: column; gap: 8px; }
  .amber-eyebrow { color: var(--amber); }
  h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text); }
  #missing-h { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 1.2; }
  .intro { margin: 0; font-size: 16px; color: var(--muted); max-width: 780px; }
  .small { font-size: 12.5px; }
  .muted { color: var(--muted); }
  .upper { text-transform: uppercase; letter-spacing: 0.06em; }
  .alert { border-left: 3px solid var(--amber); background: var(--panel); padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
  .alert .next { border-top: 1px solid var(--line); padding-top: 12px; }
  .alert p { margin: 6px 0 0; }
  .path { font-family: var(--mono); font-size: 13px; overflow-wrap: anywhere; }
  .state { font-weight: 600; white-space: nowrap; }
  .pass { color: var(--green); }
  .fail { color: var(--red); }
  .unknown { color: var(--amber); }
  code { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
  .section-title { margin: 0 0 12px; }
  .plans { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: stretch; }
  .plan { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
  .plan.stale { background: transparent; border-style: dashed; }
  .plan h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .plan p { margin: 8px 0 0; }
  .big { font-family: var(--serif); font-size: 30px; line-height: 1.1; margin-top: 8px; }
  .big span { font-family: var(--sans); font-size: 16px; color: var(--muted); }
  .arrow { align-self: center; color: var(--muted); font-size: 22px; }
  .tag.warn { color: var(--amber); border-color: var(--amber); }
  .tag.ok { color: var(--green); border-color: var(--green); }
  .tag.unknown { color: var(--amber); border-style: dashed; }
  .facts { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .facts li { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .facts .value { text-align: right; }
  .note { font-size: 12.5px; color: var(--muted); margin: 8px 0 0; }
  .self { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
  .self details { margin-top: 6px; }
  .command { background: var(--deep); border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .message { margin: 6px 0 0; color: var(--amber); }
  .history summary { padding: 4px 0; }
  .footer { border-top: 1px solid var(--line); padding-top: 14px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; color: var(--muted); font-size: 12px; }
  @media (max-width: 720px) {
    .plans { grid-template-columns: 1fr; }
    .arrow { display: none; }
    .facts li { flex-direction: column; gap: 2px; }
    .facts .value { text-align: left; }
  }
</style>
