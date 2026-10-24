<script lang="ts">
  // Complete (docs/design/mockups/kiln-screen-complete.html): the progress screen, finished
  // (PRD AC-PR-04): the pull request with its branches, commit count and lines changed, the plan
  // with every phase Done and the pull-request session's row, the agent, and the worktree Kiln
  // keeps until the person removes it (AC-GIT-04). Rendered from the record alone. A
  // multi-repository PRD (docs/changes/kiln-multi-repo-delivery/mockups/
  // kiln-screen-complete-repositories.html) lists every pull request with its repository, and
  // the workspace folder Kiln keeps with its worktrees (multi-repo AC-PRS-03, AC-SPACE-05).
  import type { PullRequestFacts } from "../../../src/state/records.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import Icon from "../components/Icon.svelte";
  import KilnPanel from "../components/KilnPanel.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { addedLabel, folderShown, repositoriesLine } from "../lib/progress.js";

  let { snapshot, connected, now, lastSeenAt }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const multi = $derived(snapshot.feature.multiRepository);
  const pullRequests = $derived(snapshot.pullRequests ?? []);
  const pr = $derived(pullRequests[0]);
  const mergedBranches = $derived(snapshot.mergedBranches ?? []);
  const folder = $derived(folderShown(snapshot.settings.workspaceFolder));
  const number = (value: number) => value.toLocaleString("en-US");
  const commitCount = (pullRequest: PullRequestFacts) => `${pullRequest.commits >= 100 ? "100+" : number(pullRequest.commits)} ${pullRequest.commits === 1 ? "commit" : "commits"}`;
  const tagFor = (repository: string) => {
    if (repository === snapshot.feature.repositoryName) return "PRD’s repository";
    const added = snapshot.repositories.find((row) => row.name === repository)?.addedInPhase;
    return added === undefined ? undefined : addedLabel(added);
  };
</script>

<main class="page-main roomy">
  <StateHeader {snapshot} {connected} {now} />
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} workKept prdFolder={snapshot.feature.prdFolder} {now} />{/if}
  {#if multi && pullRequests.length > 0}
    <section class="pr">
      <div class="which"><Icon name="pull-request" size={20} strokeWidth={1.6} /><span class="mono number">{pullRequests.length} {pullRequests.length === 1 ? "pull request" : "pull requests"}</span><span class="dot" aria-hidden="true">·</span><span class="mono branches">{snapshot.settings.featureBranch}</span></div>
      <h2>{mergedBranches.length ? "Pull requests still ready for review" : "One in each repository that changed"}</h2>
      <ul class="prs">
        {#each pullRequests as pullRequest (pullRequest.repository)}
          {@const tag = tagFor(pullRequest.repository)}
          <li>
            <div class="repo"><span class="mono repo-name">{pullRequest.repository}</span><span class="repo-sub"><span class="mono repo-number">#{pullRequest.number}</span>{#if tag}<span class="tag">{tag}</span>{/if}</span></div>
            <div class="what">
              <span class="pr-title">{pullRequest.title}</span>
              <span class="pr-line"><span class="mono pr-branches">{pullRequest.head} → {pullRequest.base}</span><span class="sep" aria-hidden="true">·</span><span>{commitCount(pullRequest)}</span><span class="sep" aria-hidden="true">·</span><span>+{number(pullRequest.additions)} −{number(pullRequest.deletions)}</span></span>
            </div>
            <a class="button small open-one" href={pullRequest.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} strokeWidth={1.8} />Open on GitHub</a>
          </li>
        {/each}
      </ul>
      <p class="note">Human review is next. The pull requests say which to merge first. Kiln stops at “PR ready” and doesn’t merge.</p>
    </section>
  {:else if pr}
    <section class="pr">
      <div class="which"><Icon name="pull-request" size={20} strokeWidth={1.6} /><span class="mono number">Pull request #{pr.number}</span><span class="dot" aria-hidden="true">·</span><span class="mono branches">{pr.head} → {pr.base}</span></div>
      <h2>{pr.title}</h2>
      <div class="size"><span>{commitCount(pr)}</span><span class="dot" aria-hidden="true">·</span><span>+{number(pr.additions)} −{number(pr.deletions)}</span></div>
      <div class="open">
        <a class="button solid" href={pr.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a>
        <span class="note">Human review is next. Kiln stops at “PR ready” and doesn’t merge.</span>
      </div>
    </section>
  {/if}
  {#if mergedBranches.length}
    <section class="pr" aria-label="Already merged repositories">
      <h2>{pullRequests.length ? "Some work is already merged" : "The work is already merged"}</h2>
      <ul class="prs">
        {#each mergedBranches as branch (branch.repository)}
          <li>
            <div class="repo"><span class="mono repo-name">{branch.repository}</span></div>
            <div class="what"><span class="pr-title">Already merged into {branch.base}</span><span class="mono pr-branches">{branch.head} · {branch.featureCommit.slice(0, 7)}</span></div>
            <a class="button small open-one" href="#delivery-history">View delivery history</a>
          </li>
        {/each}
      </ul>
      <p class="note">Kiln confirmed that the feature commits are already in their intended base branches. No additional pull request is needed for these repositories.</p>
    </section>
  {/if}
  {#if mergedBranches.length || snapshot.deliveryHistory || snapshot.deliveryHistoryPending || snapshot.deliveryHistoryError}
  <section class="pr" id="delivery-history" aria-label="PRD delivery history">
    <h2>PRs and merges that delivered this work</h2>
    <p class="note">Only events that introduced recorded PRD commits are shown. A release may also include other work.</p>
    {#if snapshot.deliveryHistoryPending}<p class="note">Reading delivery history…</p>{/if}
    {#if snapshot.deliveryHistoryError}<p class="history-gap">{snapshot.deliveryHistoryError}</p>{/if}
    {#if snapshot.deliveryHistory}
      {#each snapshot.deliveryHistory.repositories as history (history.repository)}
        <div class="history-repo">
          <h3 class="mono repo-name">{history.repository}</h3>
          <ul class="prs">
            {#each history.events as event (`${event.kind}:${event.number ?? event.commit}`)}
              <li>
                <div class="what">
                  <a class="pr-title" href={event.url} target="_blank" rel="noopener noreferrer">{event.kind === "pull_request" ? `PR #${event.number}: ` : "Merge: "}{event.title}</a>
                  <span class="pr-line">{event.kind === "pull_request" ? `Into ${event.target}` : `In ${event.target} history`} · {event.workCommits.length} recorded {event.workCommits.length === 1 ? "commit" : "commits"}{event.broader ? " · Also contains other commits" : ""}</span>
                </div>
              </li>
            {/each}
          </ul>
          {#if history.events.length === 0}<p class="note">No delivery PR or merge could be reliably attributed from the available history.</p>{/if}
          {#if history.unattributedCommitCount}<p class="history-gap">{history.unattributedCommitCount} recorded {history.unattributedCommitCount === 1 ? "commit has" : "commits have"} no verified PR or merge link.</p>{/if}
          {#each history.problems as problem}<p class="history-gap">{problem}</p>{/each}
        </div>
      {/each}
    {:else if !snapshot.deliveryHistoryPending && !snapshot.deliveryHistoryError}
      <p class="note">Delivery history is not available yet.</p>
    {/if}
    {#if mergedBranches.length}
      <details><summary>Completion verification</summary><ul class="prs">
        {#each mergedBranches as branch (branch.repository)}
          <li><span class="mono">{branch.repository} · {branch.featureCommit.slice(0, 7)}</span><a href={branch.url} target="_blank" rel="noopener noreferrer">View verified final commit</a></li>
        {/each}
      </ul></details>
    {/if}
  </section>
  {/if}
  <div class="columns-main">
    <div class="column-wide"><PhasePlan {snapshot} {connected} {now} /></div>
    <div class="column-side">
      <section class="card" aria-labelledby="set-h">
        <div class="intro"><h2 id="set-h" class="eyebrow">Settings for this PRD</h2><span class="sub">Set before the first phase.</span></div>
        <dl>
          <div><dt>Agent</dt><dd class="value">{snapshot.settings.agent}</dd><dd class="help">Each phase’s Details show the model and effort it ran with.</dd></div>
          {#if multi}
            <div>
              <dt>Workspace folder</dt>
              <dd class="value"><span class="mono path">{folder[0]}<wbr /><span class="nowrap">{folder[1]}</span></span></dd>
              <dd class="count">{repositoriesLine(snapshot.repositories)}</dd>
              <dd class="help">Kiln keeps the folder and its worktrees until you remove them.</dd>
            </div>
          {:else}
            <div><dt>Worktree</dt><dd class="value"><span class="mono path">{snapshot.settings.worktreePath}</span></dd><dd class="help">Kiln keeps it until you remove it.</dd></div>
          {/if}
        </dl>
      </section>
      <KilnPanel {connected} text={mergedBranches.length ? "Every phase is done. Ctrl+C in the terminal closes Kiln; the workspace and recorded delivery results stay." : multi ? "Every phase is done. Ctrl+C in the terminal closes Kiln; the pull requests and workspace stay." : "Every phase is done. Ctrl+C in the terminal closes Kiln; the pull request and worktree stay."} />
    </div>
  </div>
</main>

<style>
  .history-repo .pr-title { overflow-wrap: anywhere; }
  .history-repo h3 { margin: 0 0 8px; }
  .history-gap { font-size: 13.5px; color: var(--amber); margin: 6px 0; }
  details { font-size: 13px; color: var(--dim); }
  summary { cursor: pointer; }
  .pr { background: var(--panel); border: 1px solid rgba(156, 196, 154, 0.45); border-radius: 18px; padding: clamp(22px, 3.4vw, 36px); display: flex; flex-direction: column; gap: 18px; }
  .which { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; color: var(--green); }
  .number { font-size: 14px; }
  .branches { font-size: 13px; color: var(--muted); }
  .dot { font-size: 15px; color: var(--dim); }
  .pr h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .size { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 14px; color: var(--muted); }
  .open { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
  .note { font-size: 13.5px; color: var(--dim); }
  p.note { margin: 0; }
  .prs { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .prs li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .prs li:last-child { border-bottom: 0; }
  .repo { flex: 0 0 190px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .repo-name { font-size: 14px; color: var(--text); }
  .repo-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .repo-number { font-size: 13px; color: var(--green); }
  .what { flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .pr-title { font-size: 15.5px; font-weight: 500; color: var(--text); }
  .pr-line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 13.5px; color: var(--muted); }
  .pr-branches { font-size: 12.5px; }
  .sep { color: var(--dim); }
  .open-one { gap: 7px; flex: 0 0 auto; }
  .intro { display: flex; flex-direction: column; gap: 4px; }
  .sub { font-size: 13px; color: var(--dim); }
  dl { margin: 0; display: flex; flex-direction: column; gap: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  dl > div { display: flex; flex-direction: column; gap: 3px; }
  dt { font-size: 12.5px; color: var(--dim); }
  dd { margin: 0; }
  .value { font-size: 14.5px; color: var(--text); }
  .path { font-size: 13px; overflow-wrap: anywhere; }
  .nowrap { white-space: nowrap; }
  .count { font-size: 13px; color: var(--muted); }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
</style>
