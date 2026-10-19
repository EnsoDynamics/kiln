<script lang="ts">
  // Complete (docs/design/mockups/kiln-screen-complete.html): the progress screen, finished
  // (PRD AC-PR-04): the pull request with its branches, commit count and lines changed, the plan
  // with every phase Done and the pull-request session's row, the agent, and the worktree Kiln
  // keeps until the person removes it (AC-GIT-04). Rendered from the record alone.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import Icon from "../components/Icon.svelte";
  import KilnPanel from "../components/KilnPanel.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import StateHeader from "../components/StateHeader.svelte";

  let { snapshot, connected, now, lastSeenAt }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const pr = $derived(snapshot.pullRequest);
  const number = (value: number) => value.toLocaleString("en-US");
</script>

<main class="page-main roomy">
  <StateHeader {snapshot} {connected} {now} />
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} workKept prdFolder={snapshot.feature.prdFolder} {now} />{/if}
  {#if pr}
    <section class="pr">
      <div class="which"><Icon name="pull-request" size={20} strokeWidth={1.6} /><span class="mono number">Pull request #{pr.number}</span><span class="dot" aria-hidden="true">·</span><span class="mono branches">{pr.head} → {pr.base}</span></div>
      <h2>{pr.title}</h2>
      <div class="size"><span>{pr.commits >= 100 ? "100+" : number(pr.commits)} {pr.commits === 1 ? "commit" : "commits"}</span><span class="dot" aria-hidden="true">·</span><span>+{number(pr.additions)} −{number(pr.deletions)}</span></div>
      <div class="open">
        <a class="button solid" href={pr.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a>
        <span class="note">Human review is next. Kiln stops at “PR ready” and doesn’t merge.</span>
      </div>
    </section>
  {/if}
  <div class="columns-main">
    <div class="column-wide"><PhasePlan {snapshot} {connected} {now} /></div>
    <div class="column-side">
      <section class="card" aria-labelledby="set-h">
        <div class="intro"><h2 id="set-h" class="eyebrow">Settings for this PRD</h2><span class="sub">Set before the first phase.</span></div>
        <dl>
          <div><dt>Agent</dt><dd class="value">Claude Code</dd><dd class="help">Each phase’s Details show the model and effort it ran with.</dd></div>
          <div><dt>Worktree</dt><dd class="value"><span class="mono path">{snapshot.settings.worktreePath}</span></dd><dd class="help">Kiln keeps it until you remove it.</dd></div>
        </dl>
      </section>
      <KilnPanel {connected} text="Every phase is done. Ctrl+C in the terminal closes Kiln; the pull request and worktree stay." />
    </div>
  </div>
</main>

<style>
  .pr { background: var(--panel); border: 1px solid rgba(156, 196, 154, 0.45); border-radius: 18px; padding: clamp(22px, 3.4vw, 36px); display: flex; flex-direction: column; gap: 18px; }
  .which { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; color: var(--green); }
  .number { font-size: 14px; }
  .branches { font-size: 13px; color: var(--muted); }
  .dot { font-size: 15px; color: var(--dim); }
  .pr h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .size { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 14px; color: var(--muted); }
  .open { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
  .note { font-size: 13.5px; color: var(--dim); }
  .intro { display: flex; flex-direction: column; gap: 4px; }
  .sub { font-size: 13px; color: var(--dim); }
  dl { margin: 0; display: flex; flex-direction: column; gap: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  dl > div { display: flex; flex-direction: column; gap: 3px; }
  dt { font-size: 12.5px; color: var(--dim); }
  dd { margin: 0; }
  .value { font-size: 14.5px; color: var(--text); }
  .path { font-size: 13px; overflow-wrap: anywhere; }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
</style>
