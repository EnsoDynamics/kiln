<script lang="ts">
  // The requirements plan (Kiln Requirements Stages AC-PLAN-01, AC-PLAN-03 to 05, AC-PLAN-07,
  // AC-STAGE-03, AC-MODEL-01, AC-MODEL-03, AC-MODEL-04; mockups 4, 5, 6, 7 and 11): where the plan
  // came from and when the method was last updated, with Read again; while it is read, or when it
  // can't be, what holds whatever it turns out to be; a notice of what changed; then every stage in
  // order with its skill, state, model and Change, the stops marked, and the build.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { readPlanAgain } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  import RowModel from "./RowModel.svelte";

  let { snapshot, connected, now: given }: { snapshot: Snapshot; connected: boolean; now?: number } = $props();
  // The screen before Start passes no clock: the reading time and the running stage's minutes tick here.
  let ticking = $state(Date.now());
  $effect(() => { if (given !== undefined) return; const timer = setInterval(() => (ticking = Date.now()), 1000); return () => clearInterval(timer); });
  const now = $derived(given ?? ticking);
  const { config } = viewContext();
  const requirements = $derived(snapshot.requirements!);
  const plan = $derived(requirements.plan);
  const underway = $derived(snapshot.feature.state !== "not_started");
  const waits = $derived(snapshot.settings.waitAtEarlyReview?.value !== false);
  const stages = $derived(requirements.rows.filter(row => row.key !== "build"));
  const doneCount = $derived(stages.filter(row => row.state === "done").length);
  let reason = $state("");
  let busy = $state(false);
  const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const elapsed = (iso: string) => { const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); return seconds < 60 ? `${seconds} seconds so far` : `${Math.round(seconds / 60)} min so far`; };
  const minutes = (from: string, to: string) => { const m = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000)); return m < 1 ? "under a minute" : `${m} min`; };
  const stateWords = { done: "Done", running: "Running", needs_you: "Needs you", waiting: "Waiting", next: "Next", planned: "Planned" } as const;
  async function again() {
    busy = true;
    const answer = await readPlanAgain(config);
    busy = false;
    reason = answer.ok ? "" : answer.reason;
  }
</script>

<section class="plan" aria-label="Requirements plan">
  <div class="head">
    <h2 class="eyebrow">Requirements plan</h2>
    {#if plan.status === "read"}<span class="count">{underway ? `${doneCount} of ${stages.length} done · ` : `${stages.length} stages · `}Each stage runs on the model shown</span>{/if}
  </div>
  {#if plan.status === "read"}
    <p class="source">Read from the Enso Method installed on this computer{#if plan.methodUpdatedAt}, last updated {day(plan.methodUpdatedAt)}{/if}. Kiln keeps no list of its own, so this is whatever your copy of the method does.
      {#if plan.canReadAgain}<button type="button" class="link" disabled={!connected || busy} onclick={again}>Read again</button>{/if}</p>
  {:else if plan.status === "reading"}
    <p class="source"><strong>Reading the plan from the Enso Method installed here</strong>{#if plan.readingSince} · {elapsed(plan.readingSince)}{/if}</p>
    <p class="small">A short session reads the method's own map of what comes after source material and lists the stages, with the skill each one runs. Start doesn't wait for it: each stage's session finds the next stage itself, and the plan fills in here once it is read.</p>
  {:else if plan.status === "failed"}
    <p class="source"><strong>Kiln couldn't read the plan</strong>{#if plan.failure}. {plan.failure.reason}{/if}
      {#if plan.canReadAgain}<button type="button" class="link" disabled={!connected || busy} onclick={again}>Read again</button>{/if}</p>
    <p class="small">Start still works. Each stage's session finds the next stage itself, and the plan fills in here as stages run.</p>
  {:else}
    <p class="source">{plan.waitsForBilling ? "Kiln reads the plan once billing is approved for this PRD." : "Kiln hasn't read the plan yet."}
      {#if plan.canReadAgain}<button type="button" class="link" disabled={!connected || busy} onclick={again}>Read the plan</button>{/if}</p>
  {/if}
  {#if plan.status !== "read"}
    <div class="holds">
      <h3 class="eyebrow">What Kiln already knows</h3>
      <ul>
        <li>{waits ? "It waits for you at the early stakeholder review, once the PRD is refined, unless you turn that off." : "It has the early stakeholder review made once the PRD is refined, and carries on without waiting."}</li>
        <li>It always stops at the final stakeholder review, at the end of the requirements.</li>
        <li>It never starts the build by itself.</li>
      </ul>
    </div>
  {/if}
  {#if requirements.notice}
    <div class="notice" role="status">
      <strong>The plan changed at {time(requirements.notice.at)}</strong>
      {#if requirements.notice.methodUpdatedAt}<span>The Enso Method was updated on this computer {day(requirements.notice.methodUpdatedAt)}, {time(requirements.notice.methodUpdatedAt)}.</span>{/if}
      {#each requirements.notice.changes as change}<span>{change}</span>{/each}
      <span>Nothing already done is affected, and Kiln carries on.</span>
    </div>
  {/if}
  <ol>
    {#each requirements.rows as row, index (row.key + index)}
      {#if row.key === "build" && snapshot.preflight?.planned?.before === "build"}
        <!-- The preflight runs at Start the build, so its row sits just above the build (AC-FINAL-04). -->
        <li data-stage="preflight" data-state="planned">
          <span class="circle" aria-hidden="true">PF</span>
          <span class="names"><strong class="title quiet">Preflight</strong><span class="small">Runs at Start the build: checks access and stops, then goes straight on</span>
            {#if snapshot.preflight.planned.model}<RowModel model={snapshot.preflight.planned.model} {underway} agents={snapshot.agents} {connected} label="Preflight model" />{/if}</span>
          <span class="state">Planned</span>
        </li>
      {/if}
      <li data-stage={row.key} data-state={row.state}>
        <span class="circle" aria-hidden="true">{row.key === "build" ? "B" : `R${index + 1}`}</span>
        <span class="names">
          <strong class="title" class:quiet={row.state === "planned"}>{row.title}</strong>
          {#if row.otherSkills?.length}<span class="small">Also ran {row.otherSkills.join(", ")}</span>{/if}
          {#if row.skill}<span class="file mono">{row.skill}</span>{/if}
          {#if row.addedByKiln && row.state !== "done"}<span class="small">Added by Kiln: the method makes this review only when asked</span>{/if}
          {#if row.model}<RowModel model={row.model} {underway} target={row.state === "done" ? undefined : { stage: row.key }} agents={snapshot.agents} {connected} label={`${row.title} model`} rememberSkill={row.key === "kiln:next" ? undefined : row.skill} />{/if}
          {#if row.key === "kiln:next" && requirements.standsAt}<span class="small">The first session finds where the PRD stands and runs its next stage. When it reports, the rows before that stage drop away and Kiln says which stage it continues from.</span>{/if}
          {#if row.savedChoiceUnmatched}<span class="small">A choice saved for <code>{row.savedChoiceUnmatched.skill}</code> no longer applies, since the plan no longer runs it. This stage runs on its default.</span>{/if}
          {#if row.state === "done" && row.pushedSha}<span class="small">{#if row.startedAt && row.finishedAt && !row.noSession}Took {minutes(row.startedAt, row.finishedAt)} ·{" "}{/if}Pushed <code>{row.pushedSha.slice(0, 7)}</code></span>{/if}
          {#if row.state === "running" && row.startedAt}<span class="small">Started {time(row.startedAt)} · {minutes(row.startedAt, new Date(now).toISOString())}</span>{/if}
          {#each row.feedback ?? [] as applied}<small>Feedback sent at {time(applied.sentAt)}. Worked in and pushed at {time(applied.appliedAt)}, in <code>{applied.commit.slice(0, 7)}</code>.</small>{/each}
        </span>
        <span class="state">{stateWords[row.state]}</span>
      </li>
      {#if row.stop === "early"}<li class="stop">{waits ? "Kiln waits for you here" : "Kiln has the early review made here and carries on"}</li>{/if}
      {#if row.stop === "final"}<li class="stop">Kiln stops here, before the build</li>{/if}
    {/each}
  </ol>
  {#if reason}<p role="alert">{reason}</p>{/if}
</section>

<style>
  .plan { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; }
  .eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
  .count, .small, small { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
  .source { margin: 0; font-size: 13.5px; color: var(--muted); }
  .holds ul { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--muted); }
  .notice { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid var(--line, rgba(237,232,221,.24)); border-radius: 12px; font-size: 13.5px; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 0; border-bottom: 1px solid var(--line, rgba(237,232,221,.12)); }
  li.stop { padding: 6px 0 6px 50px; font-size: 12.5px; color: var(--accent, #e2694f); border-bottom: 0; }
  .circle { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 12.5px; border: 1px dashed rgba(237,232,221,.24); color: var(--dim); }
  [data-state="done"] .circle { border-style: solid; }
  [data-state="running"] .circle, [data-state="next"] .circle { border-style: solid; color: var(--text); }
  .names { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 16px; font-weight: 500; }
  .title.quiet { color: var(--muted); }
  .file { font-size: 12.5px; color: var(--dim); }
  .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; }
  .state { font-size: 13px; color: var(--muted); }
  .link { padding: 0; border: 0; background: none; font: inherit; font-size: 13px; color: var(--text); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .link:disabled { opacity: .4; cursor: not-allowed; }
</style>
