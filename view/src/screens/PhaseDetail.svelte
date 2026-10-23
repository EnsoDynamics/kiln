<script lang="ts">
  // Phase detail (docs/design/mockups/kiln-screen-phase-detail-live.html): the current phase's
  // live output, its progress steps, its session and its commits (PRD AC-WATCH-04 to 06). For a
  // stopped phase it is Full session output (AC-WATCH-10; technical design, "Full session
  // output"): the same layout without the LIVE badge, the live text or the pause, its time
  // stopped at the session's end, and a back link to Needs you (UI-010 item 2). A
  // multi-repository PRD's Commits are grouped by repository, each name with its added-in-phase
  // label (multi-repo AC-SHOW-01). A phase waiting for usage is served as a stopped one is, its
  // back link to the waiting screen and its pill styled as Paused is (usage-limit recovery,
  // technical design "Screens").
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import FeatureHeader from "../components/FeatureHeader.svelte";
  import Icon from "../components/Icon.svelte";
  import PhaseCircle from "../components/PhaseCircle.svelte";
  import Pill from "../components/Pill.svelte";
  import ProgressSteps from "../components/ProgressSteps.svelte";
  import CodexSessionFacts from "../components/CodexSessionFacts.svelte";
  import SessionOutput from "../components/SessionOutput.svelte";
  import { keepGoing, pause } from "../lib/api.js";
  import { addedLabel, capitalized, commitsByRepository, modelAndEffort, phaseName, phaseOfTotal, PR_ID } from "../lib/progress.js";
  import { routedClick } from "../lib/router.svelte.js";
  import { clockTime, elapsed } from "../lib/time.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, phaseId, connected, now, lastSeenAt }: { snapshot: Snapshot; phaseId: string; connected: boolean; now: number; lastSeenAt: number | undefined } = $props();
  const { config, router } = viewContext();

  const waiting = $derived(snapshot.waiting?.phaseId === phaseId ? snapshot.waiting : undefined);
  const stopped = $derived(snapshot.needsYou?.phaseId === phaseId ? snapshot.needsYou : waiting);
  const current = $derived(stopped ? undefined : snapshot.current);
  const isPr = $derived(phaseId === PR_ID);
  const row = $derived(snapshot.phases.find((phase) => phase.id === phaseId));
  const live = $derived(current !== undefined && connected);
  // The live phase's clock stops when the view loses Kiln; a stopped phase's at its session's end.
  const shownNow = $derived(connected ? now : (lastSeenAt ?? now));
  const identity = $derived(stopped ?? current ?? row?.details);
  const session = $derived(
    stopped
      ? { id: stopped.sessionId, model: stopped.model ?? "", effort: stopped.effort, startedAt: stopped.sessionStartedAt, endsAt: stopped.sessionEndedAt ? Date.parse(stopped.sessionEndedAt) : shownNow, steps: stopped.steps ?? [], repositories: stopped.repositories ?? [], total: stopped.outputLineCount ?? 0 }
      : { id: current?.sessionId, model: current?.model ?? "", effort: current?.effort, startedAt: current?.startedAt, endsAt: shownNow, steps: current?.steps ?? [], repositories: current?.repositories ?? [], total: current?.latestLine?.line ?? 0 },
  );
  const commits = $derived(session.repositories.flatMap((repository) => repository.commits));
  const grouped = $derived(snapshot.feature.multiRepository ? commitsByRepository(snapshot, session.repositories) : undefined);
  const sinceStart = $derived(session.startedAt ? elapsed(session.endsAt - Date.parse(session.startedAt)) : undefined);
  /** "10:58 AM · 49 min" on its own; after "Started" a day reads in lowercase (UI-010 item 8). */
  const started = (afterWord: boolean) => (session.startedAt ? `${clockTime(session.startedAt, new Date(now), { afterWord })} · ${sinceStart}` : undefined);
  const back = $derived(config.base);
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);

  async function togglePause() {
    pressing = true;
    const answer = await (snapshot.pause.pending ? keepGoing(config) : pause(config));
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main roomy">
  <FeatureHeader repositoryName={snapshot.feature.repositoryName} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name} layout="detail" />
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} phaseClause={phaseName(phaseId)} workKept prdFolder={snapshot.feature.prdFolder} {now} />{/if}
  <section class="phase">
    <a class="back" href={back} onclick={(event) => routedClick(event, router, back)}><Icon name="back" strokeWidth={1.9} />{waiting ? "Waiting for usage" : stopped ? "Needs you" : "All phases"}</a>
    <div class="name">
      <PhaseCircle id={phaseId} tone={live ? "implementing" : waiting && connected ? "next" : "amber"} />
      <h2>{row?.title ?? ""}</h2>
      {#if waiting && connected}<Pill tone="strong-outline" icon="clock">Waiting for usage</Pill>{:else if waiting}<Pill tone="amber-outline">Interrupted</Pill>{:else if stopped}<Pill tone="amber" icon="warning">Needs you</Pill>{:else if live}<Pill tone="red" icon="spinner" spin>Implementing</Pill>{:else}<Pill tone="amber-outline">Interrupted</Pill>{/if}
    </div>
    <div class="facts"><span>{capitalized(phaseOfTotal(snapshot, phaseId))}</span><span class="dot" aria-hidden="true">·</span><span>{identity?.agent ?? snapshot.settings.agent}</span>{#if session.startedAt}<span class="dot" aria-hidden="true">·</span><span>Started {started(true)}</span>{/if}</div>
  </section>
  {#key session.id}<SessionOutput sessionId={session.id} {live} {connected} total={session.total} {now} />{/key}
  <div class="columns-main">
    {#if !isPr}<div class="column-wide"><ProgressSteps steps={session.steps} {live} reviewerWorking={current?.reviewerWorking === true} {now} /></div>{/if}
    <div class="column-side">
      {#if live && !isPr}
        <div class="pause">
          <button type="button" class="button wide" disabled={pressing} onclick={togglePause}>{#if snapshot.pause.pending}<Icon name="arrow" size={15} strokeWidth={1.8} />Keep going{:else}<Icon name="pause" size={15} strokeWidth={1.8} />Pause after this phase{/if}</button>
          {#if reason}<span class="reason">{reason}</span>{/if}
          <p class="note">{snapshot.pause.pending ? `Kiln pauses once ${phaseName(phaseId)} is done, including its commit and push. Keep going cancels the pause.` : `${capitalized(phaseName(phaseId))} still finishes its commit and push. Nothing is cut off mid-step.`}</p>
        </div>
      {/if}
      <aside class="card side">
        <span class="eyebrow">Session</span>
        <dl>
          {#if session.id}<div><dt>Session ID</dt><dd class="mono id">{session.id}</dd></div>{/if}
          <div><dt>Model and effort</dt><dd>{modelAndEffort(session.model, session.effort)}</dd></div>
          {#if session.startedAt}<div><dt>Started</dt><dd>{started(false)}</dd></div>{/if}
        </dl>
        {#if identity}<CodexSessionFacts facts={identity} />{/if}
        {#if !stopped}<p class="note">If the phase stops before it’s done, Kiln hands you the command that opens this exact session.</p>{/if}
      </aside>
      {#if !isPr}
        <aside class="card side">
          <span class="eyebrow">Commits</span>
          {#if commits.length === 0}
            <p class="commits-none">{stopped ? "None for this phase." : "None for this phase yet. The feature commit comes after test hardening."}</p>
          {:else if grouped}
            <div class="groups">
              {#each grouped as repository (repository.name)}
                <div class="group">
                  <div class="repo"><span class="mono repo-name">{repository.name}</span>{#if repository.addedInPhase !== undefined}<span class="tag">{addedLabel(repository.addedInPhase)}</span>{/if}</div>
                  {@render list(repository.commits)}
                </div>
              {/each}
            </div>
          {:else}
            {@render list(commits)}
          {/if}
        </aside>
      {/if}
    </div>
  </div>
</main>

{#snippet list(commits: { sha: string; subject: string }[])}
  <ul class="commits">{#each commits as commit (commit.sha)}<li><span class="mono sha">{commit.sha.slice(0, 7)}</span><span>{commit.subject}</span></li>{/each}</ul>
{/snippet}

<style>
  .phase { display: flex; flex-direction: column; gap: 16px; padding-top: 28px; border-top: 1px solid var(--line); }
  .back { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; color: var(--muted); text-decoration: none; align-self: flex-start; }
  .name { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(32px, 4vw, 42px); line-height: 1.05; color: var(--text); }
  .facts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 14px; color: var(--muted); }
  .dot { font-size: 15px; color: var(--dim); }
  .pause { display: flex; flex-direction: column; gap: 10px; }
  .reason { font-size: 12.5px; color: var(--amber); }
  .note { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.6; text-wrap: pretty; }
  .side { gap: 18px; }
  dl { margin: 0; display: flex; flex-direction: column; gap: 14px; }
  dl > div { display: flex; flex-direction: column; gap: 3px; }
  dt { font-size: 12.5px; color: var(--dim); }
  dd { margin: 0; font-size: 14.5px; color: var(--text); overflow-wrap: anywhere; }
  dd.id { font-size: 13px; }
  .commits-none { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .commits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; color: var(--muted); }
  .commits li { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0 10px; }
  .sha { font-size: 12.5px; color: var(--text); }
  .groups { display: flex; flex-direction: column; gap: 16px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .repo { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .repo-name { font-size: 13px; color: var(--text); }
</style>
