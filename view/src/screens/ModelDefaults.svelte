<script lang="ts">
  // Model defaults (Kiln Model Modes AC-MODE-01, AC-WHEN-01, AC-SAVE-01 to AC-SAVE-05; mockups 1 to
  // 4 and 7 state A): the settings in force for the PRD the page was opened from. Its own, titled
  // for the PRD with Use my defaults here, when it has them; otherwise Model defaults, for every PRD
  // on this computer. Two ways to pick models, each showing its settings only while selected: the
  // tier table with the three fallback settings, or one agent, model and effort. Every change,
  // Restore included, waits in a draft until Save, for every PRD or for this PRD only, and the
  // button back, the Kiln mark and Use my defaults here refuse to drop unsaved changes. A settings
  // file that can't be read shows its reason with the one write allowed over it.
  import { onDestroy } from "svelte";
  import type { DefaultsSideView, ModelDefaultsView, SettingsValuesView } from "../../../src/models/model-defaults-edit.js";
  import type { DefaultsRow, FallbackUse, FamilyChoice, ModelMode } from "../../../src/models/model-defaults.js";
  import { differing, draftState, sameChoice, type SaveTarget, type SettingsValues } from "../../../src/models/settings-change.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import ModelEditor from "../components/ModelEditor.svelte";
  import { modelDefaults, saveModelDefaults, useModelDefaults, type ModelDefaultsAnswer } from "../lib/api.js";
  import { modelDefaultsDraft as draft } from "../lib/model-defaults-draft.svelte.js";
  import { effortWord, oneModelAccountLine, type EditorAgent } from "../lib/models.js";
  import { routedClick } from "../lib/router.svelte.js";
  import { viewContext } from "../lib/view-context.js";

  // `changed` is both settings files' revision, from the snapshot: when it changes, they are read again.
  let { featureName, connected, changed, agents = [] }: { featureName: string; connected: boolean; changed: string; agents?: Snapshot["agents"] } = $props();
  const { config, router } = viewContext();

  type Side = "first" | "fallback";
  type Editing = { agentId: string; value: string; effort?: string };
  const ROWS: { row: DefaultsRow; name: string; help: string }[] = [
    { row: "demanding", name: "Demanding", help: "Hard to get right, and costly if wrong." },
    { row: "standard", name: "Standard", help: "Most phases, and any phase with no tier." },
    { row: "mechanical", name: "Mechanical", help: "Repeats something already built, with nothing left to decide." },
    { row: "audits", name: "Audits", help: "The delivery audit and the test audit. Not a tier: they check the whole PRD." },
    { row: "preflight_pr", name: "Preflight and pull request", help: "The check before the first phase, the pull request session at the end, and the merge and push sessions after it." },
  ];
  const TARGETS: { target: SaveTarget; name: string; saved: string }[] = [
    { target: "every_prd", name: "Every PRD on this computer", saved: "Saved for every PRD on this computer." },
    { target: "this_prd", name: "This PRD only", saved: "Saved for this PRD only." },
  ];
  const USES: { use: FallbackUse; name: string }[] = [{ use: "never", name: "Never" }, { use: "threshold", name: "When the first choice's usage reaches" }, { use: "everything", name: "For everything, until you change this" }];

  let view = $state<ModelDefaultsView | undefined>(undefined);
  let unreadable = $state<{ reason: string; source?: "defaults" | "prd"; canRestore: boolean } | undefined>(undefined);
  let editing = $state<Partial<Record<DefaultsRow, Partial<Record<Side, Editing>>>>>({});
  let reasons = $state<Partial<Record<DefaultsRow | "threshold" | "save" | "page", string>>>({});
  let notice = $state<string | undefined>(undefined);
  let busy = $state(false);
  // Where the last save went, shown until the next change.
  let savedFor = $state<SaveTarget | undefined>(undefined);
  // What the person was refused with unsaved changes, shown in the save bar until they save, discard or change something.
  let refused = $state<string | undefined>(undefined);
  // A typed threshold stays as typed while it isn't a whole-number percent from 1 to 100.
  let thresholdText = $state<string | undefined>(undefined);

  const choiceOf = (side: DefaultsSideView): FamilyChoice => ({ agentId: side.agentId, family: side.family, ...(side.effort ? { effort: side.effort } : {}) });
  const valuesOf = (settings: SettingsValuesView): SettingsValues => ({
    mode: settings.mode, oneModel: choiceOf(settings.oneModel),
    rows: Object.fromEntries(ROWS.map(one => [one.row, { first: choiceOf(settings.rows[one.row].first), fallback: choiceOf(settings.rows[one.row].fallback) }])) as SettingsValues["rows"],
    fallback: { use: settings.fallback.use, threshold: settings.fallback.threshold },
  });
  const base = $derived(view ? { loaded: valuesOf(view), kilnChoices: valuesOf(view.kilnChoices), holdsSettings: view.holdsSettings } : undefined);
  const drafted = $derived(base ? draftState({ restore: draft.restore, edits: draft.edits }, base) : undefined);
  const shown = $derived(drafted?.shown);
  const dirty = $derived(drafted?.dirty ?? false);
  $effect(() => { draft.pending = dirty; if (!dirty) refused = undefined; });

  function read(answer: ModelDefaultsAnswer) {
    if (!answer.ok) { if (answer.unreadable) { view = undefined; unreadable = answer; } else reasons.page = answer.reason; return; }
    view = answer.view; unreadable = undefined; reasons.page = undefined;
    // The draft holds only what the person changed: an edit that now equals what was read is no longer one.
    draft.edits = differing(valuesOf(draft.restore ? answer.view.kilnChoices : answer.view), draft.edits);
    // The selected target follows the PRD's settings only while there is no draft; with one it stays as the person last saw it.
    const pending = draft.restore && answer.view.holdsSettings || Object.keys(draft.edits).length > 0;
    if (!pending) draft.target = answer.view.source === "prd" ? "this_prd" : "every_prd";
  }
  // On opening, and whenever either settings file is written, from this page, a terminal or another Kiln: each running Kiln reads their revision.
  $effect(() => { void changed; void modelDefaults(config).then(read); });

  // The button back and the Kiln mark stay on the page while there are unsaved changes, and the save bar says why (AC-SAVE-02).
  if (router) router.refusesLeaving = () => { if (!dirty) return false; refused = "Save or discard your changes before going back."; return true; };
  onDestroy(() => { if (router) router.refusesLeaving = undefined; });

  const own = $derived(view ? view.source === "prd" : unreadable?.source === "prd");
  const prd = $derived(view?.prd ?? featureName);
  const familyAgents = $derived<EditorAgent[]>((view?.agents ?? []).map(agent => ({ agentId: agent.agentId, agent: agent.agent, options: agent.families.map(one => ({ value: one.family, name: `${one.familyName}, latest (${one.modelName})`, efforts: one.efforts, defaultEffort: one.defaultEffort })), ...(agent.families.length ? {} : { problem: agent.modelListError ?? `${agent.agent} offers no model families Kiln can read.` }) })));
  // Every choice the page can name: the sides as read, Kiln's own, and each family an agent offers.
  const named = $derived.by(() => {
    const sides: DefaultsSideView[] = view ? [view, view.kilnChoices].flatMap(one => [one.oneModel, ...ROWS.flatMap(row => [one.rows[row.row].first, one.rows[row.row].fallback])]) : [];
    return { agents: new Map<string, string>([...sides.map(side => [side.agentId, side.agent] as const), ...(view?.agents ?? []).map(agent => [agent.agentId, agent.agent] as const)]), families: new Map<string, string>([...sides.map(side => [`${side.agentId}:${side.family}`, side.familyName] as const), ...(view?.agents ?? []).flatMap(agent => agent.families.map(one => [`${agent.agentId}:${one.family}`, one.familyName] as const))]) };
  });
  const choiceLine = (choice: FamilyChoice) => [named.agents.get(choice.agentId) ?? choice.agentId, named.families.get(`${choice.agentId}:${choice.family}`) ?? choice.family, choice.effort ? effortWord(choice.effort) : undefined].filter(Boolean).join(" · ");
  /** A side's problem as read, while the page still shows that side as read. */
  const problemOf = (choice: FamilyChoice, read: DefaultsSideView | undefined) => read && sameChoice(choice, choiceOf(read)) ? read.problem : undefined;
  // The page shows the fallback used for everything: the columns say which side each row will launch on (AC-WHEN-03).
  const forEverything = $derived(shown?.mode === "recommended" && shown.fallback.use === "everything");
  const threshold = $derived(thresholdText ?? String(shown?.fallback.threshold ?? ""));
  const oneModelAccount = $derived(shown ? oneModelAccountLine(named.agents.get(shown.oneModel.agentId) ?? shown.oneModel.agentId, agents.find(agent => agent.agentId === shown.oneModel.agentId)?.account) : "");

  /** The person changed something: the page no longer says where the last save went, or what it refused. */
  function edited() { savedFor = undefined; refused = undefined; reasons.save = undefined; notice = undefined; }
  function setMode(mode: ModelMode) { draft.edits = { ...draft.edits, mode }; edited(); }
  function setOneModel(choice: Editing) { draft.edits = { ...draft.edits, oneModel: { agentId: choice.agentId as FamilyChoice["agentId"], family: choice.value, ...(choice.effort ? { effort: choice.effort } : {}) } }; edited(); }
  function setUse(use: FallbackUse) { draft.edits = { ...draft.edits, fallback: { ...draft.edits.fallback, use } }; edited(); }
  function typedThreshold(text: string) {
    if (!/^\d+$/.test(text.trim()) || Number(text.trim()) < 1 || Number(text.trim()) > 100) { thresholdText = text; reasons.threshold = "The threshold is a whole-number percent from 1 to 100."; return; }
    thresholdText = undefined; reasons.threshold = undefined;
    draft.edits = { ...draft.edits, fallback: { ...draft.edits.fallback, threshold: Number(text.trim()) } };
    edited();
  }

  function open(row: DefaultsRow, side: Side) {
    const choice = shown!.rows[row][side];
    editing[row] = { ...editing[row], [side]: { agentId: choice.agentId, value: choice.family, ...(choice.effort ? { effort: choice.effort } : {}) } };
    reasons[row] = undefined;
  }
  function close(row: DefaultsRow) { delete editing[row]; reasons[row] = undefined; }
  /** Done puts every side opened in the row into the draft together, so a row can move to the other agent. */
  function done(row: DefaultsRow) {
    const sides = editing[row]!;
    const choice = (one: Editing): FamilyChoice => ({ agentId: one.agentId as FamilyChoice["agentId"], family: one.value, ...(one.effort ? { effort: one.effort } : {}) });
    const next = { first: sides.first ? choice(sides.first) : shown!.rows[row].first, fallback: sides.fallback ? choice(sides.fallback) : shown!.rows[row].fallback };
    if (next.first.agentId === next.fallback.agentId) { const agent = named.agents.get(next.first.agentId) ?? next.first.agentId; reasons[row] = `The ${ROWS.find(one => one.row === row)!.name} row's first choice and fallback would both be on ${agent}. To move the row to ${agent}, change both sides before Done.`; return; }
    draft.edits = { ...draft.edits, rows: { ...draft.edits.rows, [row]: { ...draft.edits.rows?.[row], ...(sides.first ? { first: next.first } : {}), ...(sides.fallback ? { fallback: next.fallback } : {}) } } };
    close(row); edited();
  }

  /** Restore Kiln's defaults is a change like any other: it waits for Save, and what was changed before it is dropped. */
  function restore() { draft.restore = true; draft.edits = {}; editing = {}; thresholdText = undefined; reasons = {}; edited(); }
  /** Discard returns the page to what was last saved, the save target included. */
  function discard() { draft.discard(); if (view) draft.target = view.source === "prd" ? "this_prd" : "every_prd"; editing = {}; thresholdText = undefined; reasons = {}; savedFor = undefined; refused = undefined; notice = undefined; }

  async function save() {
    if (!drafted?.dirty) return;
    const target = draft.target;
    busy = true;
    const answer = await saveModelDefaults(config, target, drafted.changes);
    busy = false;
    // A refused save keeps the draft: with the reason, or under the file's own reason when it can no longer be read.
    if (!answer.ok) { if (answer.unreadable) read(answer); else reasons.save = answer.reason; return; }
    draft.discard(); editing = {}; thresholdText = undefined; reasons = {};
    read(answer);
    savedFor = target; notice = answer.notice;
  }

  /** The one write allowed over a file that can't be read, made at once: Restore over Model defaults, Use my defaults here over this PRD's own settings. */
  async function repair() {
    busy = true;
    const answer = unreadable?.source === "prd" ? await useModelDefaults(config) : await saveModelDefaults(config, "every_prd", { restore: true });
    busy = false;
    if (!answer.ok && !answer.unreadable) { reasons.page = answer.reason; return; }
    read(answer);
    if (answer.ok) notice = answer.notice;
  }

  async function useDefaults() {
    if (dirty) { refused = "Save or discard your changes before using your defaults here."; return; }
    busy = true;
    const answer = await useModelDefaults(config);
    busy = false;
    if (!answer.ok && !answer.unreadable) { reasons.page = answer.reason; return; }
    savedFor = undefined;
    read(answer);
  }
</script>

<main class="screen">
  <a class="back" href={config.base} onclick={(event) => routedClick(event, router, config.base)}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5"></path></svg>{featureName}</a>
  <p class="eyebrow">Kiln settings · {own ? "this PRD only" : "every PRD on this computer"}</p>
  <h1>{own ? `Models for ${prd}` : "Model defaults"}</h1>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if reasons.page}<p class="message" role="alert">{reasons.page}</p>{/if}

  {#if unreadable}
    <section class="card" aria-label={own ? "This PRD's own settings can't be read" : "Model defaults can't be read"}>
      <p class="message">{unreadable.reason}</p>
      {#if unreadable.canRestore}<button type="button" class="button small" disabled={!connected || busy} onclick={repair}>{own ? "Use my defaults here" : "Restore Kiln's defaults"}</button>{/if}
    </section>
  {:else if view && shown}
    {#if own}
      <section class="own" aria-label="This PRD's own settings" data-own-settings>
        <p><strong>This PRD has its own settings.</strong> Every other PRD keeps your defaults.</p>
        <button type="button" class="button small" disabled={!connected || busy} onclick={useDefaults}>Use my defaults here</button>
      </section>
    {/if}

    <section class="card" aria-labelledby="pick-h">
      <h2 id="pick-h">How Kiln picks a model</h2>
      <div class="modes" role="radiogroup" aria-labelledby="pick-h">
        <div class="mode" class:selected={shown.mode === "recommended"}>
          <label class="pick"><input type="radio" name="mode" value="recommended" checked={shown.mode === "recommended"} disabled={!connected || busy} onchange={() => setMode("recommended")} /><span><strong>Recommended model for each phase</strong><span class="help">Each phase document says how capable a model its build needs. Kiln fills in the model for that tier.</span></span></label>
          {#if shown.mode === "recommended"}
            <div class="table" role="table" aria-label="Models for each tier">
              <div class="head" role="row"><span role="columnheader">Tier</span><span role="columnheader" data-column="first">First choice{#if forEverything}<span class="mark" data-skipped>Skipped for now</span>{/if}</span><span role="columnheader" data-column="fallback">Fallback{#if forEverything}<span class="mark used" data-in-use>Used for everything</span>{/if}</span></div>
              {#each ROWS as one (one.row)}
                {@const open_ = editing[one.row]}
                <div class="row" role="row" data-row={one.row}>
                  <span class="tier" role="cell"><strong>{one.name}</strong><span class="help">{one.help}</span></span>
                  {#each ["first", "fallback"] as const as side (side)}
                    {@const choice = shown.rows[one.row][side]}
                    {@const problem = problemOf(choice, draft.restore ? view.kilnChoices.rows[one.row][side] : view.rows[one.row][side])}
                    <span class="side" role="cell" class:skipped={forEverything && side === "first"}>
                      <span class="choice">{choiceLine(choice)}</span>
                      {#if problem}<span class="message">{problem}</span>{/if}
                      {#if open_?.[side]}
                        <ModelEditor agents={familyAgents} agentId={open_[side]!.agentId} value={open_[side]!.value} effort={open_[side]!.effort} label={`${one.name} ${side === "first" ? "first choice" : "fallback"}`} disabled={!connected || busy} onchange={(picked) => (editing[one.row] = { ...editing[one.row], [side]: picked })} />
                      {:else}
                        <button type="button" class="link" disabled={!connected || busy} onclick={() => open(one.row, side)}>Change</button>
                      {/if}
                    </span>
                  {/each}
                </div>
                {#if open_}
                  <div class="row-actions">
                    <button type="button" class="button small solid" disabled={!connected || busy} onclick={() => done(one.row)}>Done</button>
                    <button type="button" class="button small" disabled={busy} onclick={() => close(one.row)}>Cancel</button>
                    {#if reasons[one.row]}<span class="message">{reasons[one.row]}</span>{/if}
                  </div>
                {/if}
              {/each}
            </div>
            <div class="fallback">
              <span class="group-name" id="fallback-l">Use the fallback</span>
              <div class="uses" role="radiogroup" aria-labelledby="fallback-l">
                {#each USES as one (one.use)}
                  <label class="use"><input type="radio" name="fallback" value={one.use} checked={shown.fallback.use === one.use} disabled={!connected || busy} onchange={() => setUse(one.use)} /><span class="words">{one.name}{#if one.use === "threshold"}
                    <span class="number"><input type="number" aria-label="Percent of a usage limit" min="1" max="100" step="1" inputmode="numeric" value={threshold} disabled={!connected || busy} oninput={(event) => typedThreshold(event.currentTarget.value)} />% of a limit</span>{/if}</span></label>
                {/each}
              </div>
              {#if reasons.threshold}<p class="message">{reasons.threshold}</p>{/if}
            </div>
            <p class="help">Kiln uses the newest version of each model family each time it launches a step of a run, and a step that has started keeps its version.</p>
          {/if}
        </div>
        <div class="mode" class:selected={shown.mode === "one_model"}>
          <label class="pick"><input type="radio" name="mode" value="one_model" checked={shown.mode === "one_model"} disabled={!connected || busy} onchange={() => setMode("one_model")} /><span><strong>One model for everything</strong><span class="help">Every phase, both audits, the preflight, and the pull request, merge and push sessions.</span></span></label>
          {#if shown.mode === "one_model"}
            {@const problem = problemOf(shown.oneModel, draft.restore ? view.kilnChoices.oneModel : view.oneModel)}
            <div class="one-model" data-one-model>
              <ModelEditor agents={familyAgents} agentId={shown.oneModel.agentId} value={shown.oneModel.family} effort={shown.oneModel.effort} label="One model for everything" disabled={!connected || busy} onchange={() => {}} onpick={setOneModel} />
              {#if problem}<p class="message">{problem}</p>{/if}
              <p class="help" data-one-model-account>{oneModelAccount}</p>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="save-bar" aria-label="Save changes" data-save-bar>
      {#if refused}<span class="message" role="alert">{refused}</span>{/if}
      <div class="targets" role="radiogroup" aria-labelledby="scope-l">
        <span class="group-name" id="scope-l">Save changes for</span>
        {#each TARGETS as one (one.target)}
          <label class="use"><input type="radio" name="scope" value={one.target} checked={draft.target === one.target} disabled={busy} onchange={() => (draft.target = one.target)} /><span class="words">{one.name}</span></label>
        {/each}
      </div>
      <div class="actions">
        {#if reasons.save}<span class="message" role="alert">{reasons.save}</span>{/if}
        {#if savedFor && !dirty}<span class="saved" role="status">{TARGETS.find(one => one.target === savedFor)!.saved}</span>{/if}
        {#if dirty}<button type="button" class="button small" disabled={busy} onclick={discard}>Discard</button>{/if}
        <button type="button" class="button small solid" disabled={!connected || busy || !dirty} onclick={save}>Save</button>
      </div>
    </section>

    <section class="restore">
      <button type="button" class="button small" disabled={!connected || busy || draft.restore && Object.keys(draft.edits).length === 0} onclick={restore}>Restore Kiln's defaults</button>
    </section>
  {:else}
    <p class="help">Reading Model defaults…</p>
  {/if}
</main>

<style>
  .screen { max-width: 980px; margin: 0 auto; padding: 24px 28px 48px; display: flex; flex-direction: column; gap: 16px; }
  .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px 0 10px; border: 1px solid var(--line-strong); border-radius: 999px; font-size: 13.5px; color: var(--text); text-decoration: none; }
  h1 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: 34px; color: var(--text); }
  h2 { margin: 0; font-size: 15px; color: var(--text); }
  .help { margin: 0; font-size: 13px; color: var(--dim); line-height: 1.55; }
  .notice { margin: 0; font-size: 13.5px; color: var(--text); }
  .card { border-radius: 12px; padding: 18px 20px; gap: 14px; }
  .own { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 14px 18px; border: 1px solid var(--amber-border); border-radius: 12px; }
  .own p { margin: 0; font-size: 14px; color: var(--text); }
  .modes { display: flex; flex-direction: column; gap: 12px; }
  .mode { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; }
  .mode.selected { border-color: var(--line-strong); }
  .pick { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; align-items: start; cursor: pointer; }
  .pick > span { display: flex; flex-direction: column; gap: 4px; font-size: 14.5px; color: var(--text); }
  input[type="radio"] { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  .table { display: flex; flex-direction: column; }
  .head, .row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(0, 1.3fr) minmax(0, 1.3fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .head { font-size: 12.5px; color: var(--dim); }
  .head > span { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .mark { font-size: 11.5px; color: var(--dim); }
  .mark.used { color: var(--amber); font-weight: 600; }
  .tier, .side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .tier strong { font-size: 14px; color: var(--text); font-weight: 600; }
  .choice { font-size: 14px; color: var(--text); }
  .side.skipped .choice { color: var(--dim); }
  .row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.5; margin: 0; overflow-wrap: anywhere; }
  .link { align-self: flex-start; padding: 0; border: 0; background: none; font: inherit; font-size: 13px; color: var(--text); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .link:disabled { opacity: 0.4; cursor: not-allowed; }
  .fallback { display: flex; flex-direction: column; gap: 8px; }
  .group-name { font-size: 13.5px; font-weight: 600; color: var(--text); }
  .uses { display: flex; flex-direction: column; gap: 8px; }
  /* The radio stays beside its words at any width: only the words wrap, never the radio away from them. */
  .use { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; color: var(--text); cursor: pointer; }
  .use input[type="radio"] { flex: none; margin: 1px 0 0; }
  .use .words { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
  .number { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
  .number input { height: 36px; width: 72px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field, var(--deep)); color: var(--text); font-size: 14px; }
  .one-model { display: flex; flex-direction: column; gap: 10px; }
  .save-bar { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 20px; padding: 14px 18px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: 12px; }
  .save-bar > .message { flex-basis: 100%; font-size: 13.5px; }
  .targets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-left: auto; }
  .saved { font-size: 13px; color: var(--green); }
  .restore { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  @media (max-width: 640px) { .head { display: none; } .row { grid-template-columns: minmax(0, 1fr); } }
</style>
