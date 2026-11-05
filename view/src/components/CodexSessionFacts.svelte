<script lang="ts">
  import type { SessionIdentityView } from "../../../src/engine/snapshot.js";
  import { modelAndEffort } from "../lib/progress.js";
  let { facts }: { facts: SessionIdentityView } = $props();
</script>

{#if facts.agentId === "codex"}
  <section class="codex-facts">
    <span class="eyebrow">Codex conversation</span>
    {#if facts.providerSessionId}<span class="mono">{facts.providerSessionId}</span>{/if}
    {#if facts.requested}<p>Requested: {modelAndEffort(facts.requested.model, facts.requested.effort)}</p>{/if}
    {#if facts.effective}<p>Effective configuration: {modelAndEffort(facts.effective.model, facts.effective.effort)}</p>{/if}
    {#each facts.observed ?? [] as turn (turn.turnId)}<p>Observed turn {turn.turnId}: {modelAndEffort(turn.model, turn.effort)}</p>{/each}
    {#each facts.recoveryObserved ?? [] as turn (turn.turnId)}<p>Observed recovery turn {turn.turnId}: {modelAndEffort(turn.model, turn.effort)}. Account and launch settings were not recorded by Kiln.</p>{/each}
    {#if facts.historyError}<p class="warning">{facts.historyError}</p>{/if}
    {#if !facts.observed?.length}<p>Execution settings unobserved.</p>{/if}
    {#if facts.originalAccount}<p>Original account: {facts.originalAccount.email ?? facts.originalAccount.accountId ?? "Unknown"}</p>{/if}
    {#if facts.attemptAccount}<p>Attempt account: {facts.attemptAccount.email ?? facts.attemptAccount.accountId ?? "Unknown"}</p>{/if}
    {#each facts.humanRequests ?? [] as request, index (index)}
      <p class="warning">Codex request: {request.method}{request.stopped ? " — needs a person" : ""}</p>
      <pre>{JSON.stringify(request.request, null, 2)}</pre>
      <p>Client decision: {JSON.stringify(request.decision)}</p>
    {/each}
    {#if facts.failure}<p class="warning">{facts.failure}</p>{/if}
    {#if facts.cleanupFailure}<p class="warning"><strong>Cleanup failed:</strong> {facts.cleanupFailure} Automatic continuation is blocked. Check again reconciles the tracked processes before rechecking the work.</p>{/if}
    {#if facts.resumeError}<p class="warning">{facts.resumeError}</p>{/if}
    {#if facts.cleanupWarning}<p class="warning">{facts.cleanupWarning}</p>{/if}
  </section>
{/if}

<style>
  .codex-facts { display: flex; flex-direction: column; gap: 8px; overflow-wrap: anywhere; font-size: 13px; color: var(--muted); }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  p { margin: 0; line-height: 1.6; }
  .warning { color: var(--amber); }
</style>
