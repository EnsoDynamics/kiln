<script lang="ts">
  // The phase plan: every phase in plan order, all at one level, with its number, file name,
  // title word for word and state, and a Details section for each phase that has run (PRD
  // AC-WATCH-01, AC-LOOK-03). The pull-request session is its last row once every leaf is
  // closed (AC-PR-05). An audit row that is a loop says which (loop 2 of 4), with no mark for the
  // last loop; phase rows and sessions of test fixes carry none (Kiln Deliver When Audit Loops Run
  // Out AC-STOP-05). For a multi-repository PRD a Done row counts the repositories it pushed to,
  // its Details list them, and the pull-request row counts the pull requests (multi-repo AC-PRS-03).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { detailRows, openedLabel, preflightPill, rowFacts, rowPill, rowState, withPlannedPreflight, type RowState } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  import DetailsList from "./DetailsList.svelte";
  import NeedsYouThere from "./NeedsYouThere.svelte";
  import WaivedStatus from "./WaivedStatus.svelte";
  import type { IconName } from "./Icon.svelte";
  import PhaseCircle, { type CircleTone } from "./PhaseCircle.svelte";
  import Pill, { type PillTone } from "./Pill.svelte";
  import TierTag from "./TierTag.svelte";
  import RowModel from "./RowModel.svelte";

  let { snapshot, connected, now }: { snapshot: Snapshot; connected: boolean; now: number } = $props();
  const opened = $derived(openedLabel(snapshot));
  // The Preflight row (build preflight AC-PREFLIGHT-08): planned before it is allocated, then an activity row.
  const rows = $derived(withPlannedPreflight(snapshot.activities ?? snapshot.phases, snapshot));
  const circleId = (row: (typeof rows)[number]) => row.kind === "delivery_audit" ? "DA" : row.kind === "test_audit" ? (row.fixing ? "FT" : "TA") : row.kind === "preflight" ? "PF" : row.kind === "final_delivery" && row.plannedActivity ? "PR" : row.kind === "merge" ? "M" : row.kind === "plan_push" ? "P" : row.id;
  // Every row says what it will run on, runs on or ran on (Kiln Phase Model Tiers AC-PICK-02).
  const underway = $derived(snapshot.feature.state !== "not_started");
  const { config, router } = viewContext();
  // What a row's Change changes: a phase its own choice, a Delivery audit or Test audit row this PRD's Audits choice (AC-PICK-03, AC-OTHER-01).
  const modelTarget = (row: (typeof rows)[number]): { phase: string } | "audits" | undefined => row.kind === "delivery_audit" || row.kind === "test_audit" ? "audits" : (row.kind === undefined || row.kind === "implementation") && !row.plannedActivity ? { phase: row.id } : undefined;

  const LOOKS: Record<RowState, { circle: CircleTone; pill: PillTone; icon?: IconName }> = {
    done: { circle: "done", pill: "green-tint", icon: "check" },
    split: { circle: "split", pill: "outline" },
    implementing: { circle: "implementing", pill: "red", icon: "spinner" },
    interrupted: { circle: "amber", pill: "amber-outline" },
    needs_you: { circle: "amber", pill: "amber", icon: "warning" },
    // Paused by Pause now (Kiln Pause Now AC-PAUSE-05): the neutral outline, as mockup frame 3 draws it.
    paused: { circle: "next", pill: "strong-outline" },
    waiting: { circle: "next", pill: "strong-outline", icon: "clock" },
    next: { circle: "next", pill: "strong-outline" },
    planned: { circle: "planned", pill: "dashed" },
  };
</script>

{#if snapshot.requirements}
<section class="plan" aria-label="Requirements stages">
  <h2>Requirements stages</h2>
  <ol>{#each snapshot.requirements.rows as stage}
    <li><strong>{stage.title}</strong>{#if stage.otherSkills?.length} · {stage.otherSkills.join(", ")}{/if} · {stage.state.replaceAll("_", " ")}
      {#if stage.model?.choice} · {stage.model.choice.modelName}{/if}
      {#if stage.pushedSha} · <code>{stage.pushedSha.slice(0, 8)}</code>{/if}
      {#each stage.feedback ?? [] as applied}<br /><small>Feedback sent at {new Date(applied.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Worked in and pushed at {new Date(applied.appliedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, in <code>{applied.commit.slice(0, 7)}</code>.</small>{/each}
    </li>
  {/each}</ol>
</section>
{:else}
<section class="plan" class:restart-review={!!snapshot.restartReview} aria-labelledby="plan-h">
  <div class="head"><h2 id="plan-h" class="eyebrow">Phase plan</h2><span class="count">{snapshot.feature.phasesDone} of {snapshot.feature.phasesTotal} done</span></div>
  <ol>
    {#each rows as row (row.id)}
      {@const state = rowState(row, connected, snapshot.liveControl?.pauseNow)}
      {@const pill = preflightPill(row)}
      {@const look = pill?.warning ? { circle: "amber" as const, pill: "amber-outline" as const, icon: "warning" as const } : LOOKS[state]}
      {@const facts = rowFacts(row, state, now)}
      {@const accessible = Boolean(row.details) || snapshot.current?.phaseId === row.id || ((snapshot.needsYou?.sessionId || snapshot.waiting?.sessionId) && (snapshot.needsYou?.phaseId === row.id || snapshot.waiting?.phaseId === row.id))}
      {@const link = phasePath(config.base, row.id)}
      {@const details = row.details ? detailRows(row.details, new Date(now)) : []}
      <li data-phase={row.id}>
        {#snippet title()}{#if accessible}<a class="title phase-link" href={link} onclick={(event) => routedClick(event, router, link)}>{row.title}<span aria-hidden="true"></span></a>{:else}<span class="title" class:quiet={state === "planned"}>{row.title}</span>{/if}{/snippet}
        <div class="row">
          <PhaseCircle id={circleId(row)} tone={look.circle} />
          <span class="names">{#if row.attended !== undefined || row.tier}<span class="title-line">{@render title()}{#if row.tier}<TierTag tier={row.tier} />{/if}{#if row.attended !== undefined}<NeedsYouThere text={row.attended} />{/if}</span>{:else}{@render title()}{/if}{#if row.file}<span class="file mono">{row.file}</span>{/if}{#if row.model}<RowModel model={row.model} {underway} target={modelTarget(row)} agents={snapshot.agents} {connected} label={`${row.title} model`} />{/if}</span>
          <span class="state">
            {#if facts}<span class="facts">{facts}</span>{/if}
            <Pill tone={look.pill} icon={look.icon} spin={state === "implementing"}>{rowPill(row, state, opened)}</Pill>
            {#if row.waivedChecks || row.warnings?.length}<WaivedStatus {row} />{/if}
          </span>
        </div>
        {#if row.preflight?.found}<p class="found"><span class="term">Found</span>{row.preflight.found}</p>{/if}
        {#if row.preflight?.reason}<p class="found"><span class="term">Why</span>{row.preflight.reason}</p>{/if}
        {#if details.length && state !== "implementing" && state !== "interrupted"}<DetailsList rows={details} indent />{/if}
      </li>
    {/each}
  </ol>
</section>
{/if}

<style>
  .plan { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .count { font-size: 13px; color: var(--dim); }
  ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  li { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  .names { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 16px; font-weight: 500; color: var(--text); }
  .title.quiet { color: var(--dim); }
  .phase-link { text-decoration: none; }
  .phase-link:hover { color: var(--red); text-decoration: underline; }
  .phase-link > span::after { content: " ›"; color: var(--red); }
  .title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .file { font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .state { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; }
  .restart-review .state { max-width: 100%; }
  .restart-review .facts { white-space: normal; overflow-wrap: anywhere; }
  .facts { font-size: 13px; color: var(--dim); white-space: nowrap; }
  .found { margin: 0 0 0 44px; font-size: 13.5px; color: var(--muted); overflow-wrap: anywhere; }
  .found .term { display: inline-block; min-width: 56px; margin-right: 10px; color: var(--dim); }
</style>
