<script lang="ts">
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { BillingSummary } from "../../../src/billing/inspection.js";
  import { billingApproval, refreshMetadata } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  let { snapshot, connected = true }: { snapshot: Snapshot; connected?: boolean } = $props();
  const { config } = viewContext();
  const billing = $derived(snapshot.billing);
  const codex = $derived(snapshot.settings.agentId === "codex");
  const history = $derived(snapshot.feature.state !== "not_started" && billing?.lastLaunch);
  let pressing = $state(false);
  let reason = $state<string | undefined>();
  const title = (s: BillingSummary) => s.agentId === "codex" ? "ChatGPT account" : s.route === "subscription" ? "Claude subscription" : s.route === "settings" ? "Claude Code settings" : s.provider ?? "Configured provider";
  const choice = (s: BillingSummary) => s.provider === "Anthropic API" ? "Use API billing for this PRD" : s.provider ? `Use ${s.provider} billing for this PRD` : "Use the configured provider for this PRD";
  const creditFacts = (s: BillingSummary) => s.credits?.map(c => ({ bucketId: c.bucketId, accountId: c.accountId, balance: c.balance, hasCredits: c.hasCredits }));
  const nextDiffers = $derived(billing?.next && (!history || ["agentId", "route", "provider", "email", "orgId", "accountId", "plan", "sources", "approved"].some(k => JSON.stringify(billing.next![k as keyof BillingSummary]) !== JSON.stringify(history[k as keyof BillingSummary])) || JSON.stringify(billing.next.overflow?.enabled) !== JSON.stringify(history.overflow?.enabled) || JSON.stringify(creditFacts(billing.next)) !== JSON.stringify(creditFacts(history))));
  async function approve(checked: boolean) {
    const next = billing?.next;
    if (!billing || !next || !connected) return;
    pressing = true;
    const answer = await billingApproval(config, checked ? "approval" : "clear", { executionId: billing.executionId, selectionGeneration: billing.selectionGeneration, readingId: next.readingId, ...(checked ? { approved: true as const } : {}) });
    reason = answer.ok ? undefined : answer.reason; pressing = false;
  }
  async function recheck() {
    pressing = true; const answer = await refreshMetadata(config);
    reason = answer.ok ? undefined : answer.reason; pressing = false;
  }
</script>

{#snippet summary(s: BillingSummary)}
  <strong class="billing-title">{title(s)}</strong>
  {#if s.agentId === "codex" || s.route === "subscription"}<span class="identity">{s.email ?? "Account identity unavailable"}</span>{:else if s.route === "metered"}<span class="identity">API payer identity unavailable</span>{:else if s.email}<span class="identity">{s.email}</span>{/if}
  {#if s.agentId === "claude_code" && s.route !== "metered" && s.orgId}<span class="identity">Organization: {s.orgId}</span>{/if}
  {#if s.agentId === "codex"}
    <p class="source">Plan: {s.plan ?? "Plan unavailable"}</p>
    <p>Billing follows your ChatGPT account settings.</p>
    {#each s.credits ?? [] as credit}
      <p class="credit">{connected ? "Available workspace credits" : "Last known workspace credits"} [{credit.bucketId}]: {credit.balance ?? (credit.hasCredits ? "Available" : "None reported")}<br /><span class="source">Workspace account: {credit.accountId} · observed {new Date(credit.observedAt).toLocaleString()}</span></p>
    {/each}
    {#if s.credits?.length}<p class="source">Your account's spending settings apply.</p>{/if}
    <p><a href="https://chatgpt.com/codex/settings/usage" target="_blank" rel="noreferrer">Open ChatGPT usage settings ↗</a></p>
  {:else}
  <p>{s.route === "subscription" ? "Billing follows your Claude account settings." : s.route === "settings" ? "Billing follows your Claude Code settings." : s.provider === "Anthropic API" ? "Charged separately from Claude subscription usage. Anthropic billing settings apply." : "This provider may bill separately from your Claude subscription."}</p>
  {#if s.sources.length}<p class="source">Source: {s.sources.join("; ")}</p>{/if}
  {#if s.overflow?.enabled}<p class="overflow">Paid usage is enabled in your Claude account. Your account's spending limits apply.<br /><a href="https://claude.ai/settings/usage" target="_blank" rel="noreferrer">Open Claude usage settings ↗</a></p>{/if}
  {#if s.route === "metered"}<p class="source">{s.approved ? "Billing approved for this PRD execution." : "Approval needed before AI work can start."}</p>{/if}
  {#if s.diagnostics.length}<details><summary>Billing details</summary><p>Additional billing details are unavailable. Detected overrides still need approval. Diagnostic: {s.diagnostics.join(", ")}</p></details>{/if}
  {/if}
{/snippet}

{#if billing}
  <section class="card billing" aria-label={codex ? "Codex billing" : "Claude billing"} class:held={billing.hold || billing.next?.route === "metered" && !billing.next.approved}>
    {#if history}
      <h2 class="eyebrow">{connected ? "Billing used to launch this session" : "Last known billing for this session"}</h2>
      {@render summary(history)}
      <p class="source">Observed {new Date(history.observedAt).toLocaleString()}. Settings are checked before the next launch.</p>
    {:else if snapshot.feature.state !== "not_started"}<p class="source">{connected ? "Billing for the previous run is unavailable." : "Last known billing · previous run unavailable."}</p>{/if}
    {#if billing.pending}<p role="status">Checking {codex ? "Codex information" : "Claude settings"}…</p>{/if}
    {#if billing.next && (nextDiffers || !history)}
      <h2 class="eyebrow">{connected ? "Billing for the next run" : "Last known billing for the next run"}</h2>
      {@render summary(billing.next)}
    {/if}
    {#if connected && billing.next}
      {#if billing.next.readinessError}<p class="error">{billing.next.readinessError}</p>{/if}
      {#if billing.next.route === "metered" && (billing.next.canApprove || billing.next.canClear)}
        <p class="source">To use your subscription instead, change the detected source and recheck. For inherited environment overrides, restart Kiln from the corrected environment.</p>
        <label class="choice"><input type="checkbox" checked={billing.next.approved} disabled={pressing || billing.pending || (!billing.next.approved && !billing.next.canApprove) || (billing.next.approved && !billing.next.canClear)} onchange={event => approve(event.currentTarget.checked)} />{choice(billing.next)}</label>
        <p class="source">Applies to this PRD execution, including restarts, while the billing context stays the same.</p>
      {/if}
      <button type="button" class="button small" disabled={pressing || billing.pending} onclick={recheck}>{codex ? "Refresh Codex information" : "Recheck billing"}</button>
    {/if}
    {#if !connected}<p class="source">Disconnected. Billing information is last known; reconnect to review billing or continue work.</p>{/if}
    {#if reason}<p role="status" class="error">{reason}</p>{/if}
  </section>
{/if}
<style>
  .billing { gap: 8px; margin-block: 16px; }
  .held { border-color: var(--amber); }
  .billing-title { font-size: 17px; font-weight: 600; }
  .identity { font-size: 14px; overflow-wrap: anywhere; }
  p { margin: 3px 0 9px; font-size: 13px; line-height: 1.55; }
  .source, details { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .overflow, .error { color: var(--amber); }
  .choice { display: flex; align-items: start; gap: 10px; font-size: 13px; }
  input { accent-color: var(--red); margin-top: 3px; }
  a { color: inherit; text-underline-offset: 3px; }
</style>
