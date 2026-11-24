<script lang="ts">
  // Complete (docs/design/mockups/kiln-screen-complete.html): the progress screen, finished
  // (PRD AC-PR-04): the pull request with its branches, commit count and lines changed, the plan
  // with every phase Done and the pull-request session's row, the agent, and the worktree Kiln
  // keeps until the person removes it (AC-GIT-04). Rendered from the record alone. A
  // multi-repository PRD (docs/changes/kiln-multi-repo-delivery/mockups/
  // kiln-screen-complete-repositories.html) lists every pull request with its repository, and
  // the workspace folder Kiln keeps with its worktrees (multi-repo AC-PRS-03, AC-SPACE-05).
  import { onMount } from "svelte";
  import CompletedPlanCheck from "../components/CompletedPlanCheck.svelte";
  import { awaitingMergeText, checkNowLead } from "../../../src/engine/awaiting-merge.js";
  import { addedHeading } from "../../../src/engine/new-phases-wording.js";
  import { checkForNewPhases, merge as pressMerge, start } from "../lib/api.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  import { MERGE_LIVE_REASON, PLAN_PUSH_LIVE_REASON } from "../../../src/engine/merge-wording.js";
  import { clockTime } from "../lib/time.js";
  import DevelopmentDelivery from "../components/DevelopmentDelivery.svelte";
  import ForYou from "../components/ForYou.svelte";
  import ClosingAudits from "../components/ClosingAudits.svelte";
  import type { DeliveryEvent, PullRequestFacts } from "../../../src/state/records.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import Icon from "../components/Icon.svelte";
  import KilnPanel from "../components/KilnPanel.svelte";
  import ExitKiln from "../components/ExitKiln.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { deliveryGroups, deliveryTime } from "../lib/delivery-history.js";
  import { addedLabel, folderShown, repositoriesLine } from "../lib/progress.js";

  let { snapshot, connected, now, lastSeenAt, config }: { snapshot: Snapshot; connected: boolean; now: number; lastSeenAt: number | undefined; config?: import("../lib/api.js").PageConfig } = $props();
  const multi = $derived(snapshot.feature.multiRepository);
  const pullRequests = $derived(snapshot.pullRequests ?? []);
  const pr = $derived(pullRequests[0]);
  const mergedBranches = $derived(snapshot.mergedBranches ?? []);
  // A critical finding moves For you directly below the state header (AC-ITEM-03, mockup screen 3b).
  const criticalFirst = $derived(!!snapshot.delivered?.forYou.items.some(item => item.kind === "critical_next_step" || item.kind === "critical"));
  const histories = $derived(snapshot.deliveryHistory?.repositories.map(history => ({ ...history, ...deliveryGroups(history.events) })) ?? []);
  let expanded = $state<Record<string, boolean>>({});
  const folder = $derived(folderShown(snapshot.settings.workspaceFolder));
  const number = (value: number) => value.toLocaleString("en-US");
  const commitCount = (pullRequest: PullRequestFacts) => `${pullRequest.commits >= 100 ? "100+" : number(pullRequest.commits)} ${pullRequest.commits === 1 ? "commit" : "commits"}`;
  // While the delivery waits to merge (Kiln After Delivery AC-WAIT-02): no check panel, one line in the pull request card.
  // The HTTP answer is applied at once; the event stream may bring the same check later (the newer one wins).
  let answered = $state<import("../../../src/engine/completed-plan-discovery.js").CompletedPlanCheck>();
  const check = $derived.by(() => {
    const streamed = snapshot.continuation?.check;
    if (!answered || !streamed) return streamed ?? answered;
    const later = Date.parse(answered.attemptedAt) - Date.parse(streamed.attemptedAt);
    return later > 0 || later === 0 && streamed.status === "checking" ? answered : streamed;
  });
  const awaiting = $derived(check?.status === "awaiting_merge" ? check.awaitingMerge : undefined);
  const panelShown = $derived(!!snapshot.continuation?.acceptance || !!check && !awaiting && !snapshot.afterDelivery?.waiting && !(check.status === "checking" && !snapshot.afterDelivery && pullRequests.length > 0));
  let checking = $state(false);
  let checkProblem = $state<string>();
  async function checkNow(press: boolean) {
    if (!config || !connected || checking) return;
    checking = true; checkProblem = undefined;
    try { const answer = await checkForNewPhases(config, press); if (answer.check) answered = answer.check; else checkProblem = answer.reason ?? "Could not check for new phases. Try again."; }
    catch (failure) { checkProblem = (failure as Error).message; }
    finally { checking = false; }
  }
  // After delivery (Kiln After Delivery AC-MERGE-01, AC-MERGE-04, AC-MERGE-07): each pull request as GitHub last showed it, the offer and the merge activity.
  const after = $derived(snapshot.afterDelivery);
  const mergeActivity = $derived(after?.merge);
  const mergeOpen = $derived(!!mergeActivity && mergeActivity.state !== "done");
  const allMerged = $derived(!!after && pullRequests.length > 0 && pullRequests.every(pull => readingOf(pull)?.state === "merged"));
  // Merged: Exit Kiln is the pull request card's main button (Kiln After Delivery AC-EXIT-01, mockup state 3).
  const exitInCard = $derived(allMerged && !!snapshot.exit);
  // Once merged, the check's answer shows in the card beside Exit Kiln, not in a panel of its own (AC-WAIT-03, mockup state 3).
  // Phases found keep their prominent panel above the earlier delivery (Kiln Continue Added Phases AC-OFFER-01), and the card names them in one line.
  const phasesFound = $derived((check?.result ?? check?.earlierResult)?.added.length ?? 0);
  const checkInCard = $derived(allMerged && !mergeOpen && !phasesFound && !snapshot.continuation?.acceptance);
  const readingOf = (pull: { repository: string; number: number }) => after?.pullRequests.find(row => row.repository === pull.repository && row.number === pull.number);
  const ordinal = (n: number) => ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}th`;
  const mergeRow = $derived((snapshot.activities ?? snapshot.phases).find(row => row.kind === "merge"));
  // Continue's push of the plan (Kiln After Delivery AC-BACK-05, mockup state 5): its session runs on the finished page.
  const planPush = $derived(after?.planPush && after.planPush.state !== "done" ? after.planPush : undefined);
  const pushRow = $derived(planPush ? (snapshot.activities ?? snapshot.phases).find(row => row.id === planPush.key) : undefined);
  const pushLink = $derived(config && planPush ? phasePath(config.base, planPush.key) : undefined);
  const mergeLink = $derived(config ? phasePath(config.base, "merge") : undefined);
  const { router } = viewContext();
  let merging = $state(false);
  let mergeProblem = $state<string>();
  async function pressMergeButton() {
    if (!config || !connected || merging) return;
    merging = true; mergeProblem = undefined;
    try { const answer = await pressMerge(config); if (!answer.ok) mergeProblem = answer.reason; }
    finally { merging = false; }
  }
  // Resume for a merge session held at the restart review (Kiln After Delivery, "Ctrl+C and restart"): the review's Resume.
  let resuming = $state(false);
  let resumeProblem = $state<string>();
  async function pressResume() {
    if (!config || !connected || resuming) return;
    resuming = true; resumeProblem = undefined;
    try { const answer = await start(config, false); if (!answer.ok) resumeProblem = answer.reason; }
    finally { resuming = false; }
  }
  // The page's one request when it loads, which reads GitHub first; an event-stream reconnect makes none.
  onMount(() => { void checkNow(false); });
  const tagFor = (repository: string) => {
    if (repository === snapshot.feature.repositoryName) return "PRD’s repository";
    const added = snapshot.repositories.find((row) => row.name === repository)?.addedInPhase;
    return added === undefined ? undefined : addedLabel(added);
  };
</script>

{#snippet pullFacts(pullRequest: PullRequestFacts)}
  {@const reading = readingOf(pullRequest)}
  {#if reading?.state === "merged"}<span>Merged into {pullRequest.base}{reading.mergedAt ? ` at ${clockTime(reading.mergedAt, new Date(now), { afterWord: true })}` : ""}{reading.mergeCommit ? ` · merge ${reading.mergeCommit.slice(0, 7)}` : ""}</span>
  {:else if reading?.state === "closed"}<span class="warn">Closed without merging</span>
  {:else if reading?.conflicts}<span class="warn">Conflicts with {pullRequest.base}</span>{/if}
{/snippet}

{#snippet mergePart(url?: string)}
  {#if mergeOpen && mergeActivity}
    <div class="merge-session">
      <p class="merge-line"><span class="eyebrow">Merge session</span> {snapshot.settings.agent}{mergeRow?.details?.model ? ` · ${mergeRow.details.model}` : ""}</p>
      {#if mergeActivity.startedAt}<p class="note">Started {clockTime(mergeActivity.startedAt, new Date(now), { afterWord: true })} in <span class="mono">{mergeActivity.folder}</span></p>{/if}
      {#if mergeActivity.state === "interrupted"}
        <div class="open"><button class="button solid" type="button" disabled={!connected || !config || resuming} onclick={pressResume}>{resuming ? "Resuming…" : "Resume"}</button></div>
        <p class="note">{snapshot.restartReview?.action === "wait" ? "Kiln was stopped while the merge session waited for usage. Resume reads GitHub first; if a pull request is still to merge, it waits for usage again, then picks up the same session." : "Kiln was stopped while the merge session ran. Resume reads GitHub first; if a pull request is still to merge, it picks up the same session where it stopped."}</p>
        {#if resumeProblem}<p class="history-gap" role="alert">{resumeProblem}</p>{/if}
      {:else}
      <div class="open">{#if mergeLink && mergeRow?.details}<a class="button solid" href={mergeLink} onclick={(event) => routedClick(event, router, mergeLink)}>Watch the session</a>{/if}</div>
      {/if}
      <p class="note">{MERGE_LIVE_REASON} It waits for the required checks before each merge. If it stops before merging, Kiln shows Needs you with its last message. Kiln shows Merged once GitHub shows {pullRequests.length > 1 ? "every pull request" : `#${pullRequests[0]?.number}`} merged.</p>
    </div>
  {:else if allMerged}
    {#if mergeActivity?.summary}
      <div class="merge-summary"><h3 class="eyebrow">The merge session’s summary</h3><p class="summary-text">{mergeActivity.summary}</p></div>
    {/if}
    <div class="open"><ExitKiln {snapshot} {connected} main line={`Nothing is left for Kiln to do on this PRD. Exiting stops Kiln in its terminal; the ${pullRequests.length > 1 ? "worktrees stay" : "worktree stays"} until you remove ${pullRequests.length > 1 ? "them" : "it"}.`} />{#if url}<a class="button" href={url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a>{/if}</div>
    {#if panelShown && !planPush && phasesFound}<p class="note">{addedHeading(phasesFound)}. Continue is at the top of this page.</p>{/if}
    {#if panelShown && !planPush && checkInCard}<CompletedPlanCheck inCard {now} loading={checking} acceptance={snapshot.continuation?.acceptance} {check} {config} {connected} prdDirectory={snapshot.feature.prdFolder.replace(/\/$/, "")} />{/if}
  {:else if after?.offer.note}
    <div class="open">
      <button class="button solid" type="button" disabled={!connected || !config || merging || !after.offer.available} title={after.offer.available ? undefined : after.offer.reason} onclick={pressMergeButton}>{merging ? "Starting…" : `Merge with ${snapshot.settings.agent}`}</button>
      {#if url}<a class="button" href={url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a>{/if}
    </div>
    <p class="note">{after.offer.note}</p>
    {#if !after.offer.available && after.offer.reason}<p class="note">{after.offer.reason}</p>{/if}
    {#if mergeProblem}<p class="history-gap" role="alert">{mergeProblem}</p>{/if}
  {:else if after?.offer.line}
    <p class="history-gap">{after.offer.line}</p>
  {/if}
{/snippet}

{#snippet waitingLine()}
  {#if awaiting && !mergeOpen}
    <p class="note new-phases">{awaitingMergeText(awaiting)}{checkNowLead(awaiting) ? ` ${checkNowLead(awaiting)}` : ""} <button class="link" type="button" disabled={!connected || !config || checking || check?.status === "checking"} onclick={() => checkNow(true)}>{checking || check?.status === "checking" ? "Checking…" : "Check now"}</button></p>
    {#if checkProblem}<p class="history-gap" role="alert">{checkProblem}</p>{/if}
  {/if}
{/snippet}

{#snippet historyRow(event: DeliveryEvent)}
  {@const time = deliveryTime(event.occurredAt, now)}
  <li>
    <div class="what">
      <a class="pr-title" href={event.url} target="_blank" rel="noopener noreferrer">{event.kind === "pull_request" ? `PR #${event.number}: ` : ""}{event.title}</a>
      <span class="pr-line">{event.kind === "pull_request" ? `Into ${event.target}` : `In ${event.target} history`} · {event.workCommits.length} recorded {event.workCommits.length === 1 ? "commit" : "commits"}{event.broader ? " · Also contains other commits" : ""}</span>
      {#if time}<time datetime={event.occurredAt} class="event-time">{event.kind === "pull_request" ? "Merged " : "Commit time: "}{time.relative}<span class="exact-time"> · {time.exact}</span></time>{:else}<span class="event-time">Date unavailable</span>{/if}
    </div>
  </li>
{/snippet}

<main class="page-main roomy">
  <StateHeader {snapshot} {connected} {now} />
  {#if criticalFirst}<ForYou {snapshot} />{/if}
  {#if planPush}
    <section class="pr" aria-label="Push the plan">
      <h2>Push the plan</h2>
      {#if pushRow?.file}<p class="note">{pushRow.file}</p>{/if}
      {#if planPush.state === "interrupted"}
        <div class="open"><button class="button solid" type="button" disabled={!connected || !config || resuming} onclick={pressResume}>Resume</button></div>
        <p class="note">Kiln was stopped while the push session ran. Resume reads origin first; if the plan is still to push, it picks up the same session where it stopped.</p>
        {#if resumeProblem}<p class="history-gap" role="alert">{resumeProblem}</p>{/if}
      {:else if planPush.state === "accepting"}
        <p class="note">The plan is pushed. Kiln is checking for new phases again, and starts the build when the same phases are still ready.</p>
      {:else}
        <div class="open">{#if pushLink && pushRow?.details}<a class="button solid" href={pushLink} onclick={(event) => routedClick(event, router, pushLink)}>Watch the session</a>{/if}</div>
        <p class="note">{PLAN_PUSH_LIVE_REASON} Once {snapshot.settings.baseBranch} holds the documents, the build starts. If the push session stops, Kiln shows Needs you with its last message.</p>
      {/if}
    </section>
  {/if}
  {#if panelShown && !planPush && !checkInCard}<CompletedPlanCheck loading={checking} acceptance={snapshot.continuation?.acceptance} {check} {config} {connected} prdDirectory={snapshot.feature.prdFolder.replace(/\/$/, "")} />{/if}
  <DevelopmentDelivery {snapshot} {connected} {config} />
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} {now} />{/if}
  {#if multi && pullRequests.length > 0}
    <section class="pr">
      <div class="which"><Icon name="pull-request" size={20} strokeWidth={1.6} /><span class="mono number">{pullRequests.length} {pullRequests.length === 1 ? "pull request" : "pull requests"}</span><span class="dot" aria-hidden="true">·</span><span class="mono branches">{snapshot.settings.featureBranch}</span></div>
      <h2>{snapshot.developmentDelivery?.authorization.enabled ? "Remaining work ready for review" : mergedBranches.length ? "Pull requests still ready for review" : "One in each repository that changed"}</h2>
      <ul class="prs">
        {#each pullRequests as pullRequest (pullRequest.repository)}
          {@const tag = tagFor(pullRequest.repository)}
          <li>
            <div class="repo"><span class="mono repo-name">{pullRequest.repository}</span><span class="repo-sub"><span class="mono repo-number">#{pullRequest.number}</span>{#if readingOf(pullRequest)?.order}<span class="tag">merges {ordinal(readingOf(pullRequest)!.order!.position)}</span>{/if}{#if tag}<span class="tag">{tag}</span>{/if}</span></div>
            <div class="what">
              <span class="pr-title">{pullRequest.title}</span>
              <span class="pr-line"><span class="mono pr-branches">{pullRequest.head} → {pullRequest.base}</span><span class="sep" aria-hidden="true">·</span><span>{commitCount(pullRequest)}</span><span class="sep" aria-hidden="true">·</span><span>+{number(pullRequest.additions)} −{number(pullRequest.deletions)}</span>{#if readingOf(pullRequest)?.state === "merged" || readingOf(pullRequest)?.state === "closed" || readingOf(pullRequest)?.conflicts}<span class="sep" aria-hidden="true">·</span>{@render pullFacts(pullRequest)}{/if}</span>
            </div>
            <a class="button small open-one" href={pullRequest.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} strokeWidth={1.8} />Open on GitHub</a>
          </li>
        {/each}
      </ul>
      {#if after}{@render mergePart()}{:else}<p class="note">Human review is next. The pull requests say which to merge first. Kiln stops at “PR ready” and doesn’t merge.</p>{/if}
      {@render waitingLine()}
    </section>
  {:else if pr}
    <section class="pr">
      <div class="which"><Icon name="pull-request" size={20} strokeWidth={1.6} /><span class="mono number">Pull request #{pr.number}</span><span class="dot" aria-hidden="true">·</span><span class="mono branches">{pr.head} → {pr.base}</span></div>
      <h2>{pr.title}</h2>
      <div class="size"><span>{commitCount(pr)}</span><span class="dot" aria-hidden="true">·</span><span>+{number(pr.additions)} −{number(pr.deletions)}</span>{#if readingOf(pr)?.state === "merged" || readingOf(pr)?.state === "closed" || readingOf(pr)?.conflicts}<span class="dot" aria-hidden="true">·</span>{@render pullFacts(pr)}{/if}</div>
      {#if after}
        {@render mergePart(pr.url)}
        {#if (!after.offer.note || mergeOpen) && !exitInCard}<div class="open"><a class="button" class:solid={!mergeOpen} href={pr.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a></div>{/if}
      {:else}
        <div class="open">
          <a class="button solid" href={pr.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={15} />Open on GitHub</a>
          <span class="note">{snapshot.developmentDelivery?.authorization.enabled ? "This remaining work awaits human review. Earlier development deliveries are recorded above." : "Human review is next. Kiln stops at “PR ready” and doesn’t merge."}</span>
        </div>
      {/if}
      {@render waitingLine()}
    </section>
  {/if}
  {#if mergedBranches.length}
    <section class="pr" aria-label="Already merged repositories">
      <h2>{pullRequests.length ? "Some work is already merged" : "The work is already merged"}</h2>
      <ul class="prs">
        {#each mergedBranches as branch (branch.repository)}
          <li>
            <div class="repo"><span class="mono repo-name">{branch.repository}</span></div>
            <div class="what"><span class="pr-title">Already merged into {branch.base}</span><span class="mono pr-branches">{branch.head}</span></div>
          </li>
        {/each}
      </ul>
      <p class="note">Kiln confirmed that the feature commits are already in their intended base branches. No additional pull request is needed for these repositories.</p>
    </section>
  {/if}
  <ClosingAudits {snapshot} />
  {#if !criticalFirst}<ForYou {snapshot} />{/if}
  {#if mergedBranches.length || snapshot.deliveryHistory || snapshot.deliveryHistoryPending || snapshot.deliveryHistoryError}
  <section class="pr" id="delivery-history" aria-label="PRD delivery history">
    <h2>Delivery history</h2>
    <p class="note">Verified PRs, with merge links where no PR represents the work. Some releases also include other work.</p>
    {#if snapshot.deliveryHistoryPending}<p class="note">Reading delivery history…</p>{/if}
    {#if snapshot.deliveryHistoryError}<p class="history-gap">{snapshot.deliveryHistoryError}</p>{/if}
    {#if snapshot.deliveryHistory}
      {#each histories as history (history.repository)}
        <div class="history-repo">
          <div class="history-heading"><h3 class="mono repo-name">{history.repository}</h3><span class="sub">{history.primary.length} {history.primary.length === 1 ? "delivery" : "deliveries"} · Newest first</span></div>
          <ul class="prs primary-deliveries" id={`deliveries-${history.repository}`}>
            {#each history.primary.slice(0, expanded[history.repository] ? undefined : 3) as event (`${event.kind}:${event.number ?? event.commit}`)}
              {@render historyRow(event)}
            {/each}
          </ul>
          {#if history.primary.length > 3}
            <button class="history-toggle" type="button" aria-expanded={expanded[history.repository] === true} aria-controls={`deliveries-${history.repository}`} onclick={() => expanded[history.repository] = !expanded[history.repository]}>{expanded[history.repository] ? "Show fewer deliveries" : `Show all ${history.primary.length} deliveries`}</button>
          {/if}
          {#if history.other.length}
            <details class="other-merges">
              <summary><span class="merge-chevron"><Icon name="chevron" size={12} /></span>Other verified merges ({history.other.length})</summary>
              <p class="note">These merges carried work already represented by the PRs in this history.</p>
              <ul class="prs">{#each history.other as event (event.commit)}{@render historyRow(event)}{/each}</ul>
            </details>
          {/if}
          {#if history.events.length === 0}<p class="note">No delivery PR or merge could be reliably attributed from the available history.</p>{/if}
          {#if history.unattributedCommitCount}<p class="history-gap">{history.unattributedCommitCount} recorded {history.unattributedCommitCount === 1 ? "commit has" : "commits have"} no verified PR or merge link.</p>{/if}
          {#each history.problems as problem}<p class="history-gap">{problem}</p>{/each}
        </div>
      {/each}
    {:else if !snapshot.deliveryHistoryPending && !snapshot.deliveryHistoryError}
      <p class="note">Delivery history is not available yet.</p>
    {/if}
  </section>
  {/if}
  <div class="columns-main">
    <div class="column-wide">{#if snapshot.auditHistoryUnavailable}<p class="note">Automatic audit history is unavailable for this historical completion.</p>{/if}
      <PhasePlan {snapshot} {connected} {now} /></div>
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
      <KilnPanel {connected} text={snapshot.developmentDelivery?.authorization.enabled || mergedBranches.length ? "Every phase is done. Ctrl+C in the terminal closes Kiln; the workspace and recorded delivery results stay." : multi ? "Every phase is done. Ctrl+C in the terminal closes Kiln; the pull requests and workspace stay." : "Every phase is done. Ctrl+C in the terminal closes Kiln; the pull request and worktree stay."}>
        <!-- Once Merged, Exit Kiln is the pull request card's main button instead (Kiln After Delivery AC-EXIT-01). -->
        {#if exitInCard}<p class="note">Exit Kiln is in the merge card. Ctrl+C in the terminal does the same.</p>{:else}<ExitKiln {snapshot} {connected} />{/if}
      </KilnPanel>
    </div>
  </div>
</main>

<style>
  .history-repo .pr-title { overflow-wrap: anywhere; }
  .warn { color: var(--amber); }
  .merge-session, .merge-summary { display: flex; flex-direction: column; gap: 8px; }
  .merge-line { margin: 0; font-size: 14px; color: var(--muted); }
  .summary-text { margin: 0; font-size: 14.5px; color: var(--text); white-space: pre-wrap; }
  h3.eyebrow { margin: 0; }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--green); text-decoration: underline; cursor: pointer; }
  .link:disabled { color: var(--dim); cursor: default; }
  .history-repo h3 { margin: 0; }
  .history-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-bottom: 8px; }
  .event-time { font-size: 12.5px; color: var(--dim); }
  .exact-time { white-space: normal; }
  .history-toggle { background: transparent; border: 1px solid var(--line); border-radius: 20px; padding: 8px 14px; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; margin-top: 8px; }
  .other-merges { margin-top: 16px; }
  .other-merges summary { display: flex; align-items: center; gap: 7px; color: var(--muted); padding: 4px 0; }
  .merge-chevron { display: inline-flex; }
  .other-merges[open] .merge-chevron { transform: rotate(90deg); }
  .other-merges[open] { display: flex; flex-direction: column; gap: 12px; }
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
