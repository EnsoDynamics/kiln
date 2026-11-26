<script lang="ts">
  // Model defaults, a page of its own for every PRD on this computer (Kiln Phase Model Tiers
  // AC-DEFAULT-02, AC-DEFAULT-03, AC-FALLBACK-01; mockup 4): the four rows with their first choice
  // and fallback, a Change on each side, Done saving every side opened in that row in one request
  // so a row can move to the other agent, Restore Kiln's defaults, and the fallback switch with its
  // threshold. A refused save keeps the editors open with the reason; a file that can't be read
  // shows its reason in place of the table, with Restore when Kiln can rewrite it.
  import type { DefaultsSideView, ModelDefaultsView } from "../../../src/models/model-defaults-edit.js";
  import type { DefaultsRow } from "../../../src/models/model-defaults.js";
  import ModelEditor from "../components/ModelEditor.svelte";
  import { changeModelDefaults, modelDefaults } from "../lib/api.js";
  import { effortWord, type EditorAgent } from "../lib/models.js";
  import { routedClick } from "../lib/router.svelte.js";
  import { viewContext } from "../lib/view-context.js";

  // `changed` is the Model defaults file's revision, from the snapshot: when it changes, the file is read again.
  let { featureName, connected, changed }: { featureName: string; connected: boolean; changed: string } = $props();
  const { config, router } = viewContext();

  type Side = "first" | "fallback";
  type Draft = { agentId: string; value: string; effort?: string };
  const ROWS: { row: DefaultsRow; name: string; help: string }[] = [
    { row: "demanding", name: "Demanding", help: "Hard to get right, and costly if wrong." },
    { row: "standard", name: "Standard", help: "Most phases, and any phase with no tier." },
    { row: "mechanical", name: "Mechanical", help: "Repeats something already built, with nothing left to decide." },
    { row: "audits", name: "Audits", help: "The delivery audit and the test audit. The preflight and the pull request session use it too. Not a tier: they check the whole PRD." },
  ];

  let view = $state<ModelDefaultsView | undefined>(undefined);
  let unreadable = $state<{ reason: string; canRestore: boolean } | undefined>(undefined);
  let drafts = $state<Partial<Record<DefaultsRow, Partial<Record<Side, Draft>>>>>({});
  let reasons = $state<Partial<Record<DefaultsRow | "fallback" | "restore", string>>>({});
  let notice = $state<string | undefined>(undefined);
  let busy = $state(false);
  // A typed threshold stays as typed until it is saved.
  let thresholdDraft = $state<string | undefined>(undefined);
  const threshold = $derived(thresholdDraft ?? String(view?.fallback.threshold ?? ""));

  async function load() {
    const answer = await modelDefaults(config);
    if (answer.ok) { view = answer.view; unreadable = undefined; }
    else { view = undefined; unreadable = answer; }
  }
  // On opening, and whenever the file is written, from this page, a terminal or another Kiln: each running Kiln watches it.
  $effect(() => { void changed; void load(); });

  const familyAgents = $derived<EditorAgent[]>((view?.agents ?? []).map(agent => ({ agentId: agent.agentId, agent: agent.agent, options: agent.families.map(one => ({ value: one.family, name: `${one.familyName}, latest (${one.modelName})`, efforts: one.efforts, defaultEffort: one.defaultEffort })), ...(agent.families.length ? {} : { problem: agent.modelListError ?? `${agent.agent} offers no model families Kiln can read.` }) })));
  const sideLine = (side: DefaultsSideView) => [side.agent, side.familyName, side.effort ? effortWord(side.effort) : undefined].filter(Boolean).join(" · ");
  const fallbackAgent = $derived.by(() => {
    const agents = new Set(ROWS.map(one => view?.rows[one.row].fallback.agentId));
    return agents.size === 1 ? view?.agents.find(agent => agents.has(agent.agentId)) ?? { agent: view?.rows.standard.fallback.agent ?? "", readinessKnown: true, readinessErrors: ["It isn't installed."], families: [] } : undefined;
  });

  function open(row: DefaultsRow, side: Side) {
    const shown = view!.rows[row][side];
    drafts[row] = { ...drafts[row], [side]: { agentId: shown.agentId, value: shown.family, ...(shown.effort ? { effort: shown.effort } : {}) } };
    reasons[row] = undefined;
  }
  function close(row: DefaultsRow) { delete drafts[row]; reasons[row] = undefined; }

  async function done(row: DefaultsRow) {
    const sides = drafts[row]!;
    const choice = (draft: Draft) => ({ agentId: draft.agentId as "claude_code" | "codex", family: draft.value, ...(draft.effort ? { effort: draft.effort } : {}) });
    busy = true;
    const answer = await changeModelDefaults(config, { set: { row, ...(sides.first ? { first: choice(sides.first) } : {}), ...(sides.fallback ? { fallback: choice(sides.fallback) } : {}) } });
    busy = false;
    if (answer.ok) { close(row); await load(); } else reasons[row] = answer.reason;
  }

  async function setFallback(change: { enabled?: boolean; threshold?: number }) {
    busy = true;
    const answer = await changeModelDefaults(config, { fallback: change });
    busy = false;
    reasons.fallback = answer.ok ? undefined : answer.reason;
    await load();
  }

  async function committedThreshold() {
    if (!view || thresholdDraft === undefined) return;
    if (thresholdDraft === String(view.fallback.threshold)) { thresholdDraft = undefined; return; }
    if (!/^\d+$/.test(thresholdDraft.trim())) { reasons.fallback = "The threshold is a whole-number percent from 1 to 100."; return; }
    await setFallback({ threshold: Number(thresholdDraft.trim()) });
    if (!reasons.fallback) thresholdDraft = undefined;
  }

  async function restore() {
    busy = true;
    const answer = await changeModelDefaults(config, { restore: true });
    busy = false;
    reasons.restore = answer.ok ? undefined : answer.reason;
    notice = answer.ok && typeof answer.notice === "string" ? answer.notice : undefined;
    drafts = {};
    await load();
  }
</script>

<main class="screen">
  <a class="back" href={config.base} onclick={(event) => routedClick(event, router, config.base)}>Back to {featureName}</a>
  <p class="eyebrow">Kiln settings · every PRD on this computer</p>
  <h1>Model defaults</h1>
  <p class="intro">Each phase document says how capable a model its build needs. These are the models Kiln fills in for each tier. You can still change any phase in its plan before it starts.</p>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  {#if unreadable}
    <section class="card" aria-label="Model defaults can't be read">
      <p class="message">{unreadable.reason}</p>
      {#if unreadable.canRestore}<button type="button" class="button small" disabled={!connected || busy} onclick={restore}>Restore Kiln's defaults</button>{/if}
      {#if reasons.restore}<p class="message">{reasons.restore}</p>{/if}
    </section>
  {:else if view}
    <section class="card" aria-label="Models for each tier">
      <div class="table" role="table">
        <div class="head" role="row"><span role="columnheader">Tier</span><span role="columnheader">First choice</span><span role="columnheader">Fallback</span></div>
        {#each ROWS as one (one.row)}
          {@const row = view.rows[one.row]}
          {@const editing = drafts[one.row]}
          <div class="row" role="row" data-row={one.row}>
            <span class="tier" role="cell"><strong>{one.name}</strong><span class="help">{one.help}</span></span>
            {#each ["first", "fallback"] as const as side (side)}
              <span class="side" role="cell">
                <span class="choice">{sideLine(row[side])}</span>
                {#if row[side].problem}<span class="message">{row[side].problem}</span>{/if}
                {#if editing?.[side]}
                  <ModelEditor agents={familyAgents} agentId={editing[side]!.agentId} value={editing[side]!.value} effort={editing[side]!.effort} label={`${one.name} ${side === "first" ? "first choice" : "fallback"}`} disabled={!connected || busy} onchange={(choice) => (drafts[one.row] = { ...drafts[one.row], [side]: choice })} />
                {:else}
                  <button type="button" class="link" disabled={!connected || busy} onclick={() => open(one.row, side)}>Change</button>
                {/if}
              </span>
            {/each}
          </div>
          {#if editing}
            <div class="row-actions">
              <button type="button" class="button small solid" disabled={!connected || busy} onclick={() => done(one.row)}>Done</button>
              <button type="button" class="button small" disabled={busy} onclick={() => close(one.row)}>Cancel</button>
              {#if reasons[one.row]}<span class="message">{reasons[one.row]}</span>{/if}
            </div>
          {/if}
        {/each}
      </div>
      <p class="help">Kiln uses the newest version of each model family each time it launches a step of a run, and a step that has started keeps its version.</p>
    </section>

    <section class="card" aria-labelledby="fallback-h">
      <h2 id="fallback-h">Fallback</h2>
      <label class="switch"><input type="checkbox" checked={view.fallback.enabled} disabled={!connected || busy} onchange={(event) => setFallback({ enabled: event.currentTarget.checked })} /><span><strong>Use the fallback when usage is nearly out</strong><span class="help">Applies to every PRD on this computer until you turn it off. Checked only when Kiln is about to launch a step of a run. One that has started never switches: if it hits a limit, it waits and picks up again, as it does today.</span></span><span class="state">{view.fallback.enabled ? "On" : "Off"}</span></label>
      <label class="threshold">Start on the fallback when a limit on the first choice's account is at or above
        <span class="number"><input type="number" min="1" max="100" step="1" inputmode="numeric" value={threshold} disabled={!connected || busy} oninput={(event) => (thresholdDraft = event.currentTarget.value)} onchange={committedThreshold} />%</span>
      </label>
      {#if fallbackAgent}<p class="help"><span class="label">Fallback agent</span> {fallbackAgent.agent}{#if fallbackAgent.readinessErrors?.length} · <span class="message">{fallbackAgent.readinessErrors.join(" ")}</span>{:else if fallbackAgent.readinessKnown} · ready{/if}</p>{/if}
      <p class="help">If the fallback's agent isn't ready, each PRD warns before Start, and a run waits at a limit as if the fallback were off. Each PRD shows the billing for both accounts before it starts.</p>
      {#if reasons.fallback}<p class="message">{reasons.fallback}</p>{/if}
    </section>

    <section class="restore">
      <p class="help">Changes apply to everything that hasn't started, in every PRD, except choices you changed for one PRD.</p>
      <button type="button" class="button small" disabled={!connected || busy} onclick={restore}>Restore Kiln's defaults</button>
      {#if reasons.restore}<p class="message">{reasons.restore}</p>{/if}
    </section>
  {:else}
    <p class="help">Reading Model defaults…</p>
  {/if}
</main>

<style>
  .screen { max-width: 980px; margin: 0 auto; padding: 24px 28px 48px; display: flex; flex-direction: column; gap: 16px; }
  .back { font-size: 13.5px; color: var(--muted); }
  .eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  h1 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: 34px; color: var(--text); }
  h2 { margin: 0; font-size: 15px; color: var(--text); }
  .intro, .help { margin: 0; font-size: 13px; color: var(--dim); line-height: 1.55; }
  .notice { margin: 0; font-size: 13.5px; color: var(--text); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
  .table { display: flex; flex-direction: column; }
  .head, .row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(0, 1.3fr) minmax(0, 1.3fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .head { font-size: 12.5px; color: var(--dim); }
  .tier, .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .tier strong { font-size: 14px; color: var(--text); font-weight: 600; }
  .choice { font-size: 14px; color: var(--text); }
  .row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.5; margin: 0; }
  .link { align-self: flex-start; padding: 0; border: 0; background: none; font: inherit; font-size: 13px; color: var(--text); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .link:disabled { opacity: 0.4; cursor: not-allowed; }
  .switch { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 10px; align-items: start; cursor: pointer; }
  .switch > span:nth-child(2) { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--text); }
  .switch input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  .state { font-size: 13px; color: var(--muted); }
  .threshold { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13.5px; color: var(--muted); }
  .number { display: inline-flex; align-items: center; gap: 6px; }
  .number input { height: 40px; width: 76px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field, var(--deep)); color: var(--text); font-size: 14px; }
  .label { color: var(--muted); }
  .restore { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  @media (max-width: 640px) { .head { display: none; } .row { grid-template-columns: minmax(0, 1fr); } }
</style>
