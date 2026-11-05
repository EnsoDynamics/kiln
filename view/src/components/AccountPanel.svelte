<script lang="ts">
  // The Claude account panel on Running and Paused (PRD AC-WATCH-08): which account is signed in,
  // when its usage was last updated, and each limit's percent used and when it resets. A limit at
  // 80% or more turns amber and suggests switching accounts (UI-001): by pausing after this phase
  // on Running, or with `claude auth login` before the next phase on Paused.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { ago, resetsIn } from "../lib/time.js";
  import { fiveHourNotReported, FIVE_HOUR_NOT_REPORTED } from "../lib/claude-usage.js";
  import CodeText from "./CodeText.svelte";

  let { account, agent = account.agentId === "codex" ? "Codex" : "Claude Code", paused, notStarted = false, pullRequest = false, now }: { account: NonNullable<Snapshot["account"]>; agent?: string; paused: boolean; notStarted?: boolean; pullRequest?: boolean; now: number } = $props();
  const nowDate = $derived(new Date(now));
  const nearNote = $derived(notStarted ? "Close to the limit. Sign in to another account before starting." : paused ? "Close to the limit. Switch accounts before you start the next phase." : pullRequest ? "Close to the limit." : "Close to the limit. Pause after this phase to switch accounts.");
  const updated = $derived(account.limitsObservedAt ? `usage updated ${ago(account.limitsObservedAt, nowDate)}` : "usage observation time unavailable");
</script>

<section class="card account" aria-labelledby="acct-h">
  <div class="who">
    <h2 id="acct-h" class="eyebrow">{agent === "Claude Code" ? "Claude" : agent} account</h2>
    {#if account.error}
      <span class="message"><CodeText text={account.error} /></span>
    {:else}
      <span class="email">{account.email ?? "Account identity unavailable"}</span>
      <span class="sub">{account.plan ? `${account.plan} · ${updated}` : `Plan unavailable · ${updated}`}</span>
    {/if}
  </div>
  {#if account.limits.length > 0 || account.limitsError || fiveHourNotReported(account)}
    <div class="limits">
      {#if account.limitsError}
        <span class="message">{account.limitsError}</span>
      {/if}
        {#each account.limits as limit (limit.id ?? `${limit.kind}:${limit.label}`)}
          <div class="limit">
            <div class="limit-head"><span class="label">{limit.label}</span><span class="percent" class:near={limit.nearLimit}>{limit.percent === undefined ? "Unknown" : `${limit.percent}%`}</span></div>
            {#if limit.percent !== undefined}<div class="meter" role="meter" aria-label="{limit.label} used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={limit.percent}><div class="fill" class:near={limit.nearLimit} style:width="{Math.min(100, Math.max(0, limit.percent))}%"></div></div>{/if}
            {#if limit.resetsAt}<span class="sub">{resetsIn(limit.resetsAt, nowDate)}{#if account.agentId === "codex"} · {new Date(limit.resetsAt).toLocaleString()}{/if}</span>{:else if account.agentId === "codex"}<span class="sub">Reset time unknown</span>{/if}
            {#if limit.nearLimit}<span class="message">{nearNote}</span>{/if}
          </div>
        {/each}
      {#if fiveHourNotReported(account)}<span class="sub">{FIVE_HOUR_NOT_REPORTED}</span>{/if}
    </div>
  {/if}
  {#if account.stale}<p class="message">Stale reading · last successful update {new Date(account.lastSuccessfulAt ?? account.updatedAt).toLocaleString()}</p>{/if}
  {#if (account.limitsStale || account.stale) && account.limitsObservedAt}<p class="message">Stale usage reading · last successful usage update {new Date(account.limitsObservedAt).toLocaleString()}</p>{/if}
  {#if account.agentId === "codex"}<p class="sub">Account allowances are shared across PRDs. Missing information is unknown. Sign in or change accounts in a terminal with <span class="code-inline">codex login</span>.</p>{/if}
  {#if paused}<p class="switch">To switch accounts, run <span class="code-inline">{account.agentId === "codex" ? "codex login" : "claude auth login"}</span> in another terminal, then press Start. The next phase uses whichever account is signed in.</p>{/if}
</section>

<style>
  .who { display: flex; flex-direction: column; gap: 4px; }
  .email { font-size: 14.5px; color: var(--text); overflow-wrap: anywhere; }
  .sub { font-size: 12.5px; color: var(--dim); }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.55; }
  .limits { display: flex; flex-direction: column; gap: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .limit { display: flex; flex-direction: column; gap: 6px; }
  .limit-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .label { font-size: 14px; color: var(--text); }
  .percent { font-size: 14px; font-weight: 600; color: var(--text); }
  .percent.near { color: var(--amber); }
  .meter { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .fill { height: 100%; border-radius: 999px; background: var(--muted); }
  .fill.near { background: var(--amber); }
  .switch { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.55; }
</style>
