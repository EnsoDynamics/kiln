<script lang="ts">
  // "Signed in now" on the waiting screen and a usage-limit Needs you (usage-limit recovery
  // AC-LIMIT-03, technical design "Snapshot"): the account Kiln last read, with its percent used of
  // the stopping limit, or the account alone when the reading has no row for it. Before a reading
  // taken after the refusal it says Kiln is reading the account; when the reading couldn't read
  // one, v1's line stands in its place. The label stands alone here, as the limit's name.
  import type { LimitView } from "../../../src/engine/snapshot.js";
  import { fiveHourNotReported, FIVE_HOUR_NOT_REPORTED } from "../lib/claude-usage.js";
  import CodeText from "./CodeText.svelte";
  import { limitTime } from "../lib/time.js";

  let { limit, footnote }: { limit: LimitView; footnote: string } = $props();
  const account = $derived(limit.account);
  const who = $derived(account === undefined ? "" : limit.agentId === "codex"
    ? `${account.email ?? "Account identity unavailable"} · ${account.plan ?? "Plan unavailable"}`
    : [account.email, account.plan].filter((part) => part !== undefined).join(" · "));
</script>

<div class="account">
  <span class="eyebrow">Signed in now</span>
  {#if account === undefined}
    <span class="who">Reading the signed-in account…</span>
  {:else if account.error !== undefined}
    {#if who}<span class="who">{who}</span>{/if}
    <span class="message"><CodeText text={account.error} /></span>
  {:else}
    <span class="who">{who}{#if account.percent !== undefined}<span class="percent" class:full={account.percent >= 100}>{limit.label} {account.percent}%</span>{/if}</span>
  {/if}
  {#each limit.allowances ?? [] as allowance}
    <span class="foot" class:warning={allowance.nearLimit}>{allowance.label}: {allowance.percent === undefined ? "usage unknown" : `${allowance.percent}% used`}{allowance.resetsAt ? ` · resets ${limitTime(allowance.resetsAt, new Date())}` : " · reset unknown"}</span>
  {/each}
  {#if limit.allowancesObservation?.state === "current" && fiveHourNotReported({ agentId: limit.agentId, limits: limit.allowances ?? [], limitsObservedAt: limit.allowancesObservation.observedAt, error: account?.error })}
    <span class="foot">{FIVE_HOUR_NOT_REPORTED}</span>
  {/if}
  <span class="foot">{footnote}</span>
</div>

<style>
  .account { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; }
  .who { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: 14.5px; color: var(--text); overflow-wrap: anywhere; }
  .percent { font-weight: 600; color: var(--text); }
  .percent.full { color: var(--amber); }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.55; }
  .foot { font-size: 12.5px; color: var(--dim); }
  .warning { color: var(--amber); }
</style>
