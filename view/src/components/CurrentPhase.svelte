<script lang="ts">
  // The phase being implemented, full width above the plan (PRD AC-WATCH-03): its number and
  // title, when it started, its progress steps (AC-WATCH-04), the last thing seen in the session,
  // its latest output line, a link to its live output, and its own Details. Once the view has
  // lost Kiln it is dimmed and relabelled "Last seen" (technical design, "Connection"). For a
  // multi-repository PRD the Details' Commits are grouped by repository, as Complete's Details
  // draw them (multi-repo AC-SHOW-01).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { commitsAcross, commitsByRepository, commitsLine, modelAndEffort, phaseOfTotal, PR_ID, type DetailRow } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { ago, clockTime, elapsed, outputTime } from "../lib/time.js";
  import { viewContext } from "../lib/view-context.js";
  import DetailsList from "./DetailsList.svelte";
  import Icon from "./Icon.svelte";
  import { SOURCE_TONE } from "./OutputRow.svelte";
  import PhaseCircle from "./PhaseCircle.svelte";
  import StepsRow from "./StepsRow.svelte";

  let { snapshot, connected, now }: { snapshot: Snapshot; connected: boolean; now: number } = $props();
  const { config, router } = viewContext();

  const current = $derived(snapshot.current!);
  const row = $derived(snapshot.phases.find((phase) => phase.id === current.phaseId));
  const isPr = $derived(current.phaseId === PR_ID);
  const nowDate = $derived(new Date(now));
  const link = $derived(phasePath(config.base, current.phaseId));
  const commits = $derived(current.repositories.flatMap((repository) => repository.commits));
  const details = $derived.by((): DetailRow[] => {
    const session = current.sessionId ? [{ term: "Session", value: current.sessionId, mono: true as const }] : [];
    const model = { term: "Model", value: modelAndEffort(current.model, current.effort) };
    if (snapshot.feature.multiRepository) {
      const grouped = commits.length > 0 ? { commits: commitsByRepository(snapshot, current.repositories) } : {};
      return [model, ...(isPr ? [] : [{ term: "Commits", value: commitsAcross(commits.length, current.repositories.length), ...grouped }]), ...session];
    }
    return [
      model,
      { term: "Worktree", value: snapshot.settings.worktreePath, mono: true },
      { term: "Branch", value: snapshot.settings.featureBranch, mono: true },
      ...(isPr ? [] : [{ term: "Commits", value: commitsLine(commits.length, commits[0]?.sha) }]),
      ...session,
    ];
  });
</script>

<section class="now" class:lost={!connected} aria-labelledby="now-h">
  <div class="top">
    <div class="name">
      <PhaseCircle id={current.phaseId} tone={connected ? "implementing" : "amber"} />
      <div class="words"><span class="eyebrow">{connected ? "Now implementing" : "Last seen"} · {phaseOfTotal(snapshot, current.phaseId)}</span><h2 id="now-h">{row?.title ?? ""}</h2></div>
    </div>
    <span class="meta">{current.agent ?? snapshot.settings.agent} · {modelAndEffort(current.model, current.effort)}{#if current.startedAt}<br />Started {clockTime(current.startedAt, nowDate, { afterWord: true })} · {elapsed(now - Date.parse(current.startedAt))}{/if}</span>
  </div>
  {#if !isPr}<StepsRow steps={current.steps} live={connected} />{/if}
  {#if current.seenInSession || connected}
    <div class="seen">
      {#if current.seenInSession}<span class="seen-text">Seen in the session: <strong>{current.seenInSession.text}</strong> · {ago(current.seenInSession.at, nowDate)}</span>{:else}<span></span>{/if}
      {#if connected}<a class="watch" href={link} onclick={(event) => routedClick(event, router, link)}>Watch live<Icon name="arrow" strokeWidth={1.9} /></a>{/if}
    </div>
  {/if}
  {#if current.latestLine}<div class="latest mono"><span class="time">{outputTime(current.latestLine.at, nowDate)}</span>&nbsp;&nbsp;<span class={SOURCE_TONE[current.latestLine.source] ?? "dim"}>{current.latestLine.source}</span>&nbsp;&nbsp;{current.latestLine.text}</div>{/if}
  <DetailsList rows={details} />
</section>

<style>
  .now { padding: 24px 28px; border-radius: 18px; background: var(--deep); border: 1px solid rgba(226, 105, 79, 0.45); display: flex; flex-direction: column; gap: 16px; }
  .now.lost { border-color: var(--line-strong); opacity: 0.6; }
  .top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
  .name { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .words { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text); }
  .meta { font-size: 13.5px; color: var(--dim); text-align: right; }
  .seen { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; }
  .seen-text { font-size: 14px; color: var(--muted); }
  strong { color: var(--text); font-weight: 600; }
  .watch { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--red); text-decoration: none; }
  .latest { font-size: 12.5px; line-height: 1.6; height: calc(4.8em + 13px); box-sizing: border-box; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .time, .dim { color: var(--dim); }
  .red { color: var(--red); }
  .green { color: var(--green); }
  .bright { color: var(--text); }
  .amber { color: var(--amber); }
</style>
