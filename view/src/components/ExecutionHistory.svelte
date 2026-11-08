<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { outputPage, type PageConfig } from "../lib/api.js";
  let { snapshot, config, connected }: { snapshot: Snapshot; config: PageConfig; connected: boolean } = $props();
  let details = $state<Record<string, { phases: { id: string; title: string; sessions: string[] }[]; sessions: { phaseKey: string; sessionId: string }[] }>>({});
  let output = $state<{ executionId: string; sessionId: string; lines: { line: number; text: string }[]; total: number }>();
  let older = $state<NonNullable<NonNullable<Snapshot["continuation"]>["executions"]>>([]);
  let noMore = $state(false);
  const executions = $derived([...(snapshot.continuation?.executions ?? []), ...older]);
  let error = $state<string>();
  async function show(executionId: string) {
    error = undefined;
    try {
      const response = await fetch(`/api/executions/${encodeURIComponent(executionId)}`, { headers: { "X-Kiln-Token": config.token } });
      if (!response.ok) throw new Error("Earlier execution details are unavailable. Retry after restoring the retained history.");
      details[executionId] = (await response.json()).execution;
    } catch (failure) { error = (failure as Error).message; }
  }
  async function showOutput(executionId: string, session: string) {
    error = undefined;
    try { const page = await outputPage(config, session, undefined, 200, executionId); output = { executionId, sessionId: session, ...page }; }
    catch (failure) { error = (failure as Error).message; }
  }
  async function earlierOutput() {
    const selected = output; if (!selected?.lines.length) return;
    try {
      const page = await outputPage(config, selected.sessionId, selected.lines[0]!.line, 200, selected.executionId);
      if (output === selected) output = { ...selected, lines: [...page.lines, ...selected.lines] };
    } catch (failure) { error = (failure as Error).message; }
  }
  async function earlierExecutions() {
    const last = executions.at(-1); if (!last) return;
    try {
      const cursor = btoa(last.executionId).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      const response = await fetch(`/api/executions?cursor=${encodeURIComponent(cursor)}`, { headers: { "X-Kiln-Token": config.token } });
      if (!response.ok) throw new Error("Earlier deliveries are unavailable. Restore retained history and retry.");
      const page = await response.json(); older = [...older, ...page.executions]; noMore = page.nextCursor === null;
    } catch (failure) { error = (failure as Error).message; }
  }
</script>
{#if snapshot.continuation?.executions?.length}
  <section class="execution-history card" aria-label="Earlier executions">
    <h2>Earlier deliveries</h2>
    {#if error}<p role="alert">{error}</p>{/if}
    {#each executions as execution}
      <article>
        {#if execution.ending === "folder_missing_setup"}
          <p>Ended <time datetime={execution.endedAt}>{new Date(execution.endedAt!).toLocaleString()}</time> · set up again · {execution.branch}</p>
        {:else}
          <p>Completed <time datetime={execution.completedAt}>{new Date(execution.completedAt!).toLocaleString()}</time> · {execution.branch}</p>
        {/if}
        {#each execution.deliveries as delivery}<p><a href={delivery.url} target="_blank" rel="noopener noreferrer">{delivery.repository} · Earlier delivery</a></p>{/each}
        <button class="button" disabled={!connected} onclick={() => show(execution.executionId)}>View earlier phases and sessions</button>
        {#if details[execution.executionId]}
          <ul>{#each details[execution.executionId]!.phases as phase}<li>Phase {phase.id} · {phase.title}
            {#each phase.sessions as session}<button class="button" disabled={!connected} onclick={() => showOutput(execution.executionId, session)}>Read earlier session</button>{/each}
          </li>{/each}</ul>
          {#each details[execution.executionId]!.sessions.filter(session => !details[execution.executionId]!.phases.some(phase => phase.sessions.includes(session.sessionId))) as session}<p>{session.phaseKey} <button class="button" disabled={!connected} onclick={() => showOutput(execution.executionId, session.sessionId)}>Read earlier session</button></p>{/each}
        {/if}
      </article>
    {/each}
    {#if !noMore && (snapshot.continuation.executions.length >= 100 || older.length)}<button class="button" disabled={!connected} onclick={earlierExecutions}>Load earlier deliveries</button>{/if}
    {#if output !== undefined}
      <p>Showing {output.lines.length} of {output.total} saved lines.</p>
      {#if output.lines.length < output.total}<button class="button" disabled={!connected} onclick={earlierOutput}>Load earlier session output</button>{/if}
      <pre aria-label="Historical session output">{output.lines.map(line => line.text).join("\n")}</pre>
    {/if}
  </section>
{/if}
<style>
  .execution-history { margin: 24px 0; padding: 24px; overflow-wrap: anywhere; }
  h2 { font-family: var(--serif); font-weight: 400; }
  article { padding: 12px 0; border-bottom: 1px solid var(--line); }
  p, li { color: var(--muted); line-height: 1.6; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
