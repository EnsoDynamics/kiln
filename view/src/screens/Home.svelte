<script lang="ts">
  // The home screen (Kiln Requirements Stages AC-HOME-01 to 13; mockups 1, 2 and 3): what Kiln
  // found where `kiln` was run, from one repository or every repository directly inside a folder.
  // Under way first, anything waiting for the person on top; then source material ready to start,
  // material one step from ready, and the PRDs with nothing showing live work, folded away. Each
  // line opens in a Kiln of its own, in a new tab. The list keeps itself current.
  import { onDestroy, onMount } from "svelte";
  import type { HomeList } from "../../../src/home/home.js";
  import type { HomeItem } from "../../../src/home/scan.js";
  import CopyButton from "../components/CopyButton.svelte";
  import TopBar from "../components/TopBar.svelte";
  import type { PageConfig } from "../lib/api.js";
  import { bringInPrompt, buttonFor, KIND_WORDS, repositoryFilters, STATE_WORDS } from "../lib/home.js";

  // `initial`: a list to show before the event stream's first, as the screen tests render it.
  let { config, initial }: { config: PageConfig; initial?: HomeList } = $props();
  // svelte-ignore state_referenced_locally
  let list = $state<HomeList | undefined>(initial);
  // svelte-ignore state_referenced_locally
  let connected = $state(!!initial);
  let filter = $state<string | undefined>();
  let reason = $state("");
  let opening = $state<string | undefined>();
  let source: EventSource | undefined;
  let lastEventAt = $state<number | undefined>();
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    source = new EventSource(`/api/home/events?token=${encodeURIComponent(config.token)}`);
    source.addEventListener("home", (event) => { list = JSON.parse((event as MessageEvent<string>).data) as HomeList; connected = true; lastEventAt = Date.now(); });
    source.addEventListener("heartbeat", () => { connected = true; lastEventAt = Date.now(); });
    source.onerror = () => { connected = false; };
    ticker = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => { source?.close(); clearInterval(ticker); });

  const folder = $derived(list?.scope.kind === "folder");
  const shown = (items: HomeItem[]) => filter ? items.filter(item => item.repository === filter) : items;
  const empty = $derived(!!list && !list.underWay.length && !list.ready.length && !list.notReady.length && !list.folded.length);
  const prompt = $derived(list ? bringInPrompt(list) : "");

  async function readAgain() {
    const response = await fetch("/api/requirements-plan/read", { method: "POST", headers: { "X-Kiln-Token": config.token } });
    if (!response.ok) reason = ((await response.json()) as { reason?: string }).reason ?? "Kiln couldn't read the plan again.";
  }

  async function open(item: HomeItem) {
    // The tab opens at once, so the browser allows it, and goes to the Kiln's address once it answers.
    const tab = window.open("about:blank", "_blank");
    opening = item.id;
    reason = "";
    try {
      const response = await fetch("/api/home/open", { method: "POST", headers: { "X-Kiln-Token": config.token, "Content-Type": "application/json" }, body: JSON.stringify({ item: item.id }) });
      const answer = await response.json() as { ok: boolean; address?: string; reason?: string };
      if (answer.ok && answer.address) { if (tab) tab.location.href = answer.address; else window.open(answer.address, "_blank"); }
      else { tab?.close(); reason = `${item.title}: ${answer.reason ?? "Kiln couldn't open it."}`; }
    } catch { tab?.close(); reason = "Kiln's home screen isn't answering. Is its terminal still open?"; }
    finally { opening = undefined; }
  }
</script>

{#snippet line(item: HomeItem, section: "underWay" | "ready" | "notReady" | "folded")}
  {@const button = buttonFor(item, section)}
  <li class="item" data-item={item.id}>
    <div class="names">
      <strong>{item.title}</strong>
      {#if item.kind}<span class="tag">{KIND_WORDS[item.kind]}</span>{/if}
      <span class="where mono">{folder ? `${item.repository} · ` : ""}{item.where}</span>
      {#if item.line}<span class="small">{item.line}</span>{/if}
      {#if item.alsoChanges.length}<span class="small">Also changes {item.alsoChanges.join(", ")}.</span>{/if}
    </div>
    <div class="actions">
      {#if section === "underWay" && item.state}<span class="state" data-state={item.state}>{STATE_WORDS[item.state]}</span>{/if}
      {#if button}<button type="button" class="button small" disabled={!connected || opening === item.id} onclick={() => open(item)}>{opening === item.id ? "Opening…" : button}</button>{/if}
    </div>
  </li>
{/snippet}

{#snippet bringIn(lead: boolean)}
  <section class="card panel" aria-label="Bring your source material in">
    <p class="eyebrow">{lead ? "Start here" : "Not listed?"}</p>
    <h2>Bring your source material in</h2>
    {#if lead}
      <p>Source material is whatever says what you want built. Getting it into the repository is a conversation about what you have and what you meant, so it happens in your own agent session and not in Kiln.</p>
      <p>Kiln starts from a brief, an intake record or a planned PRD. Other folders in <code>source-material/</code>, such as a stakeholder's feedback, are not listed.</p>
      <ul class="kinds">
        <li><strong>A brief</strong> What you want and why, in your own words, with mockups or a prototype for anything that has a screen.</li>
        <li><strong>Raw material</strong> Meeting transcripts, long threads, a folder of documents. The session sorts out what was decided and records it.</li>
        <li><strong>Something bigger</strong> More than one PRD's worth. Cutting it into an initiative stays in your own session, and each planned PRD then appears here in its place.</li>
      </ul>
    {:else}
      <p>Kiln starts from source material committed in {folder ? "the repository its PRD will live in, even when the build ends up changing several. Pick that repository first" : "this repository"}. That is a brief in your own words, with mockups or a prototype for anything that has a screen, an intake record made from transcripts and documents, or a planned PRD in an initiative. Other folders in <code>source-material/</code>, such as a stakeholder's feedback, are not listed.</p>
      <p>Getting it there is a conversation about what you have and what you meant, so it happens in your own agent session and not in Kiln.</p>
    {/if}
    <ol class="steps">
      <li>Open Claude Code or Codex in {folder ? "the repository this work belongs to" : "this repository"}.</li>
      <li>Paste this, and say what you have and where it is.
        <pre class="prompt">{prompt}</pre>
        <CopyButton text={prompt} label="Copy prompt" />
      </li>
      <li>When the session commits it, it appears {lead ? "on this page, ready to start" : "under Ready to start"}. This page updates by itself, and Kiln takes it from the PRD on.</li>
    </ol>
    <p class="small"><strong>How much is enough</strong> Several paragraphs on what you want and why, and screens wherever there is something to look at. Everything Kiln writes afterwards is only as good as this.</p>
    <p class="small">{lead ? "Already have a PRD somewhere else?" : "Already know the folder?"} <code>{lead ? "kiln run <PRD folder>" : "kiln run source-material/<name>"}</code> {lead ? "opens it at the stage it reached." : "opens it directly."}</p>
  </section>
{/snippet}

<TopBar {connected} {lastEventAt} {now} home="/home" />
<main class="page-main home">
  {#if !connected}<p class="small" role="status">{list ? "Kiln's home screen isn't answering. Is its terminal still open?" : "Connecting to Kiln…"}</p>{/if}
  {#if list}
    <header>
      <p class="eyebrow">{#if folder}Folder <span class="mono">{list.scope.name}/</span> · {list.scope.repositories.length} {list.scope.repositories.length === 1 ? "repository" : "repositories"} directly inside it{:else}Repository <span class="mono">{list.scope.name}</span>{#if list.scope.sharedBranch} · Shared branch <span class="mono">{list.scope.sharedBranch}</span>{/if}{/if}</p>
      <h1>What are we building?</h1>
      <p>{#if empty}Kiln found no source material and no PRDs in this {folder ? "folder's repositories" : "repository"} yet. It starts from source material, so that comes first.{:else if folder}This folder is not a repository, so Kiln looked in each repository inside it. Everything is in one list, and each line says which repository holds its documents.{:else}Everything Kiln found in this repository, wherever in it you ran <code>kiln</code>, from source material waiting for a PRD to builds in progress. Pick one to see what Kiln will do before anything runs.{/if}</p>
    </header>
    {#if reason}<p role="alert">{reason}</p>{/if}
    <!-- The requirements plan the home screen reads when it opens (AC-PLAN-03). -->
    {#if list.plan.status === "reading"}<p class="small" role="status">Reading the requirements plan from the Enso Method installed here.</p>
    {:else if list.plan.status === "failed"}<p class="small">Kiln couldn't read the requirements plan{#if list.plan.failure}: {list.plan.failure}{/if}. Each PRD's stages still run. <button type="button" class="button small" disabled={!connected} onclick={readAgain}>Read again</button></p>
    {:else if list.plan.waitsForBilling}<p class="small">Kiln reads the requirements plan once billing is approved for a PRD.</p>{/if}
    {#if empty}
      <!-- Each repository is named even when nothing was found in any of them (AC-HOME-09). -->
      {#if folder && list.scope.nothingFound.length}<p class="small">Nothing found in {list.scope.nothingFound.join(" or ")}</p>{/if}
      {@render bringIn(true)}
    {:else}
      {#if folder}
        <nav class="filters" aria-label="Repositories">
          <button type="button" class="tag" aria-pressed={!filter} onclick={() => (filter = undefined)}>All repositories {[...list.underWay, ...list.ready, ...list.notReady, ...list.folded].length}</button>
          {#each repositoryFilters(list) as one}<button type="button" class="tag" aria-pressed={filter === one.name} onclick={() => (filter = one.name)}>{one.name} {one.count}</button>{/each}
          {#if list.scope.nothingFound.length}<span class="small">Nothing found in {list.scope.nothingFound.join(" or ")}</span>{/if}
        </nav>
      {/if}
      {#if shown(list.underWay).length}
        <section aria-label="Under way"><h2 class="eyebrow">Under way <span>Anything waiting for you comes first</span></h2><ul>{#each shown(list.underWay) as item (item.id)}{@render line(item, "underWay")}{/each}</ul></section>
      {/if}
      {#if shown(list.ready).length}
        <section aria-label="Ready to start"><h2 class="eyebrow">Ready to start <span>Source material on {folder ? "each repository's shared branch" : list.scope.sharedBranch ?? "the shared branch"} with no PRD or initiative yet</span></h2><ul>{#each shown(list.ready) as item (item.id)}{@render line(item, "ready")}{/each}</ul></section>
      {/if}
      {#if shown(list.notReady).length}
        <section aria-label="Not ready yet"><h2 class="eyebrow">Not ready yet <span>One step from ready to start</span></h2><ul>{#each shown(list.notReady) as item (item.id)}{@render line(item, "notReady")}{/each}</ul></section>
      {/if}
      {#if shown(list.folded).length}
        <details class="folded">
          <summary>{shown(list.folded).length} PRDs with requirements but no phase plan</summary>
          <p class="small">Kiln can't tell from the files whether these were built by hand or left unfinished. Newest change first.</p>
          <ul>{#each shown(list.folded) as item (item.id)}{@render line(item, "folded")}{/each}</ul>
        </details>
      {/if}
      {@render bringIn(false)}
    {/if}
  {/if}
</main>

<style>
  .home header h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(34px, 5vw, 48px); margin: 8px 0; }
  section > ul, details > ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .eyebrow span { text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 8px; }
  .item { display: flex; gap: 16px; justify-content: space-between; align-items: center; padding: 16px 20px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; }
  .names { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .where { color: var(--dim); font-size: 12.5px; overflow-wrap: anywhere; }
  .small { color: var(--muted); font-size: 13.5px; }
  .actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .state { font-size: 13px; color: var(--muted); }
  .state[data-state="waiting_for_you"] { color: var(--amber); }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .filters button[aria-pressed="true"] { color: var(--text); border-color: var(--text); }
  .folded summary { cursor: pointer; color: var(--muted); }
  .prompt { white-space: pre-wrap; background: var(--deep); padding: 12px 14px; border-radius: 10px; font-family: var(--mono); font-size: 13px; }
  .steps li { margin: 8px 0; }
  .kinds { padding-left: 18px; }
  .kinds li { margin: 6px 0; }
</style>
