<script lang="ts">
  import type { Receipt } from "../../../src/control/commands.js";
  import type { LiveView, LiveMessage } from "../../../src/live/target.js";
  import { viewContext } from "../lib/view-context.js";
  import CopyButton from "./CopyButton.svelte";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  let { sessionId, connected, view, review = false }: { sessionId: string; connected: boolean; view?: LiveView; review?: boolean } = $props();
  const { config, router } = viewContext();
  let receipts = $state<Receipt[]>([]);
  let before = $state<string>();
  let error = $state<string>();
  let reviewing = $state(false);
  const signature = $derived(JSON.stringify(view?.messages ?? []));
  const labels: Record<LiveMessage["delivery"], string> = { submitting: "Submitting", submitted: "Sent to session — not confirmed read", received: "Received by Claude", not_sent: "Not sent", uncertain: "Delivery uncertain" };
  async function load(older = false) {
    const selected = sessionId;
    try {
      const response = await fetch(`/api/live/messages?${new URLSearchParams({ sessionId: selected, ...(older && before ? { before } : {}) })}`, { headers: { "X-Kiln-Token": config.token }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Could not load message receipts. Reconnect and retry.");
      const answer = await response.json() as { receipts: Receipt[]; before?: string };
      if (sessionId !== selected) return;
      receipts = older ? [...receipts, ...(answer.receipts ?? [])] : answer.receipts ?? []; before = answer.before; error = undefined;
    } catch (e) { error = (e as Error).message; }
  }
  $effect(() => { void signature; if (connected && sessionId) void load(); });
  async function acknowledge(receipt: Receipt) {
    if (!connected || !view || reviewing) return;
    reviewing = true;
    try {
      const response = await fetch("/api/live/message-review", { method: "POST", headers: { "X-Kiln-Token": config.token, "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: crypto.randomUUID(), target: view.target, receiptIds: [receipt.id] }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Review was not confirmed. Reconnect and inspect the receipt before continuing.");
      await load();
    } catch (e) { error = (e as Error).message; }
    finally { reviewing = false; }
  }
</script>
{#if receipts.length || error}
<section class="card messages" aria-label="Live message receipts" aria-live="polite">
  <h2>{review ? "Review uncertain messages before handing back" : "Messages to this session"}</h2>
  {#each receipts as receipt (receipt.id)}
    {#if receipt.message}
      <article>
        <strong>{labels[receipt.message.delivery]}</strong><span class="hint">Submitted {new Date(receipt.accepted_at).toLocaleString()}</span>
        {#if receipt.updated_at}<span class="hint">Observed {new Date(receipt.updated_at).toLocaleString()}</span>{/if}
        <pre>{receipt.message.text}</pre><CopyButton text={receipt.message.text} label="Copy message" />
        <p>This receipt does not confirm that the requested action happened.</p>
        {#if view}<a href={phasePath(config.base, view.target.activityKey)} onclick={e => routedClick(e, router, phasePath(config.base, view!.target.activityKey))}>View session output</a>{/if}
        {#if receipt.message.delivery === "uncertain"}
          <p>Inspect and resolve this instruction in the conversation. It will not be resent automatically.</p>
          {#if receipt.message.reviewedAt}<p>Review acknowledged {new Date(receipt.message.reviewedAt).toLocaleString()}. Receipt remains uncertain. Explicit Resume or successful Verify is still required.</p>
          {:else if review}<button class="button" disabled={!connected || reviewing} onclick={() => acknowledge(receipt)}>I reviewed this message in the conversation</button>{/if}
        {/if}
      </article>
    {/if}
  {/each}
  {#if before}<button class="button" disabled={!connected} onclick={() => load(true)}>Earlier messages</button>{/if}
  {#if !connected}<p>Last-known receipts. Reconnect before reviewing or handing back.</p>{/if}
  {#if error}<p role="alert">{error}</p><button class="button" disabled={!connected} onclick={() => load()}>Retry receipts</button>{/if}
</section>
{/if}
<style>
  .messages,article { display:flex; flex-direction:column; gap:12px; min-width:0; }
  article { border-top:1px solid var(--line); padding-top:14px; } h2,p { margin:0; } h2 { font-size:20px; }
  p,.hint { color:var(--muted); line-height:1.6; } .hint { font-size:12.5px; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.6 var(--mono); padding:14px; background:var(--deep); border:1px solid var(--line); border-radius:8px; margin:0; }
  button { align-self:flex-start; }
</style>
