<script lang="ts">
  // The Folder missing page's setup panel (missing worktree recovery mockup, "Set the run up again";
  // AC-SETUP-01): Start from, What will run, Documents found's settings in its words and order,
  // with recovery's extra help lines and fixed fields, and Before you start with the Starting lets
  // Kiln list and Start. Edits go to the engine's draft and nothing is saved before Start (AC-SAFE-01).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Part, PanelFields, SetupPanel, StartKind } from "../../../src/engine/folder-setup.js";
  import type { Effort } from "../../../src/state/records.js";
  import BillingPanel from "./BillingPanel.svelte";
  import DevelopmentDelivery from "./DevelopmentDelivery.svelte";
  import { changeFolderPanel, checkFolders, startFolderSetup, type PageConfig } from "../lib/api.js";
  import CodeText from "./CodeText.svelte";
  import { accountLines, EFFORT_LABELS, EFFORTS, effortDisabled, modelOptions } from "../lib/documents-found.js";
  import { day } from "../lib/folder-missing.js";

  /** What sessions may do in a repository they add, as on Documents found (multi-repo AC-ADD-01, AC-PRS-04). */
  const SESSIONS_ADD = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";

  let { snapshot, config, connected }: { snapshot: Snapshot; config: PageConfig; connected: boolean } = $props();
  const view = $derived(snapshot.folderMissing!);
  const panel = $derived(view.panel && !("blocked" in view.panel) ? view.panel as SetupPanel : undefined);
  const blocked = $derived(view.panel && "blocked" in view.panel ? view.panel.blocked : undefined);
  const account = $derived(accountLines(snapshot.account));
  const models = $derived(modelOptions(snapshot));
  const baseName = $derived(view.plans.base.branch);
  const fixed = (field: string) => panel?.fixed.includes(field) === true;

  let drafts = $state<Partial<Record<"worktreePath" | "workspaceFolder" | "featureBranch", string>>>({});
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);
  let commandId: string | undefined;

  async function change(start: StartKind, fields: Partial<PanelFields>) {
    reason = undefined;
    const answer = await changeFolderPanel(config, { start, fields });
    if (!answer.ok) reason = answer.reason;
  }
  function typed(field: "worktreePath" | "workspaceFolder" | "featureBranch", value: string) {
    drafts[field] = value;
    clearTimeout(timers[field]);
    timers[field] = setTimeout(() => committed(field), 400);
  }
  function committed(field: "worktreePath" | "workspaceFolder" | "featureBranch") {
    clearTimeout(timers[field]);
    const value = drafts[field];
    delete drafts[field];
    if (panel && value !== undefined && value !== panel.fields[field]) void change(panel.selected, { [field]: value });
  }
  async function pressStart() {
    if (!panel || pressing) return;
    pressing = true; reason = undefined;
    commandId ??= crypto.randomUUID();
    const answer = await startFolderSetup(config, { commandId, factsId: view.factsId, previewId: panel.previewId, start: panel.selected, fields: {} });
    // A new press after a settled answer is a new Start; an uncertain one repeats the same instruction.
    if (!("uncertain" in answer && answer.uncertain)) commandId = undefined;
    pressing = false;
    if (!answer.ok) reason = answer.reason;
  }
  async function checkAgain() { pressing = true; const answer = await checkFolders(config); pressing = false; reason = answer.ok ? undefined : answer.reason; }
  const choiceTitle = (key: StartKind) => key === "base" ? baseName : "The run’s existing branch";
</script>

{#snippet parts(list: Part[])}{#each list as part, index (index)}{#if part.date}{day(part.date)}{:else if part.tone === "code"}<code>{part.text}</code>{:else if part.tone === "strong"}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}{/snippet}

<h2 class="section-title" id="setup-h">Set the run up again</h2>
<p class="setup-lead">The same settings as when you first started this run, filled in from what Kiln found. Nothing changes until you press Start.</p>
<section class="setup" aria-labelledby="setup-h">
  {#if blocked}
    <p class="caution first">{blocked}</p>
    <div class="start-row"><span></span><button type="button" class="primary" disabled={!connected || pressing} onclick={checkAgain}>Check again</button></div>
  {:else if panel}
    <span class="label">Start from</span>
    <div class="starts">
      {#each ["base", "branch"] as const as key (key)}
        {@const option = panel.choices[key]}
        {@const off = "unavailable" in option}
        <label class="start" class:on={!off && panel.selected === key} class:off>
          <input type="radio" name="start" value={key} checked={!off && panel.selected === key} disabled={off || !connected} onchange={() => change(key, {})} />
          <span><strong>{choiceTitle(key)}{#if panel.suggested === key}<span class="tag ok">Suggested</span>{/if}</strong><span class="why">{"unavailable" in option ? option.unavailable : option.line}</span></span>
        </label>
      {/each}
    </div>

    <div class="run what">
      <div class="between"><h3>What will run</h3><span class="muted small">{panel.preview.done} · their results are kept</span></div>
      <ul class="phases">
        {#each panel.preview.run as row (row.id)}<li><span><strong>Phase {row.id}</strong> · {row.title}</span><span class="muted small">{row.note}</span></li>{/each}
      </ul>
      {#if panel.preview.caution}<p class="caution">{@render parts(panel.preview.caution)}</p>{/if}
    </div>

    <div class="run deliver">
      <span class="eyebrow">How Kiln will deliver it</span>
      {#if panel.multi}
        <div class="field">
          <label for="fm-workspace">Workspace folder</label>
          <input id="fm-workspace" type="text" class="mono" value={drafts.workspaceFolder ?? `${panel.fields.workspaceFolder.replace(/\/$/, "")}/`} disabled={!connected || fixed("workspaceFolder")} oninput={(event) => typed("workspaceFolder", event.currentTarget.value)} onblur={() => committed("workspaceFolder")} />
          {#if panel.fieldErrors.workspaceFolder}<span class="message">{panel.fieldErrors.workspaceFolder}</span>{/if}
          <span class="help">Holds a worktree of each repository below, all on the feature branch. Every phase works here in turn. These are set once, before the first phase; model, effort and keep-awake can be changed later.</span>
          {#if panel.helpLines.folder}<span class="help">{panel.helpLines.folder}</span>{/if}
        </div>
        <div class="field">
          <label for="fm-branch">Feature branch</label>
          <input id="fm-branch" type="text" class="mono" value={drafts.featureBranch ?? panel.fields.featureBranch} disabled={!connected || fixed("featureBranch")} oninput={(event) => typed("featureBranch", event.currentTarget.value)} onblur={() => committed("featureBranch")} />
          {#if panel.fieldErrors.featureBranch}<span class="message">{panel.fieldErrors.featureBranch}</span>{/if}
          <span class="help">Used in every repository.</span>
          {#if panel.helpLines.featureBranch}<span class="help">{panel.helpLines.featureBranch}</span>{/if}
        </div>
        <div class="field">
          <div class="between"><span class="label" id="fm-repos">Repositories</span><span class="help">{fixed("bases") ? "PR into" : "Branch from, and PR into"}</span></div>
          <ul class="repos" aria-labelledby="fm-repos">
            {#each panel.repositories as row (row.name)}
              <li>
                <span><code>{row.name}</code>{#if row.kind === "prd"} <span class="tag">PRD’s repository</span>{/if}</span>
                {#if row.leftOut}<span class="help">{row.problem}</span>{:else}
                  <select class="mono" value={row.baseBranch} disabled={!connected || fixed("bases") || fixed("baseBranch")} onchange={(event) => change(panel.selected, row.kind === "prd" ? { baseBranch: event.currentTarget.value } : { bases: { [row.name]: event.currentTarget.value } })}>
                    {#each row.baseChoices as base (base)}<option value={base}>{base}</option>{/each}
                  </select>
                  {#if row.problem}<span class="message wide">{row.problem}</span>{/if}
                {/if}
              </li>
            {/each}
          </ul>
          <span class="help">{SESSIONS_ADD}</span>
          <span class="help">Sessions follow each repository’s CLAUDE.md, but not its .claude/settings.json or hooks.</span>
        </div>
      {:else}
        <div class="field">
          <label for="fm-worktree">Worktree</label>
          <input id="fm-worktree" type="text" class="mono" value={drafts.worktreePath ?? panel.fields.worktreePath} disabled={!connected || fixed("worktreePath")} oninput={(event) => typed("worktreePath", event.currentTarget.value)} onblur={() => committed("worktreePath")} />
          {#if panel.fieldErrors.worktreePath}<span class="message">{panel.fieldErrors.worktreePath}</span>{/if}
          <span class="help">One worktree and one branch for the whole PRD. Every phase works here in turn. These three are set once, before the first phase; model, effort and keep-awake can be changed later.</span>
          {#if panel.helpLines.folder}<span class="help">{panel.helpLines.folder}</span>{/if}
        </div>
        <div class="pair">
          <div class="field">
            <label for="fm-branch">Feature branch</label>
            <input id="fm-branch" type="text" class="mono" value={drafts.featureBranch ?? panel.fields.featureBranch} disabled={!connected || fixed("featureBranch")} oninput={(event) => typed("featureBranch", event.currentTarget.value)} onblur={() => committed("featureBranch")} />
            {#if panel.fieldErrors.featureBranch}<span class="message">{panel.fieldErrors.featureBranch}</span>{/if}
            {#if panel.helpLines.featureBranch}<span class="help">{panel.helpLines.featureBranch}</span>{/if}
          </div>
          <div class="field">
            <label for="fm-base">{fixed("baseBranch") ? "PR into" : "Branch from, and PR into"}</label>
            <select id="fm-base" class="mono" value={panel.fields.baseBranch} disabled={!connected || fixed("baseBranch")} onchange={(event) => change(panel.selected, { baseBranch: event.currentTarget.value })}>
              {#each panel.baseChoices as base (base)}<option value={base}>{base}</option>{/each}
            </select>
          </div>
        </div>
        <span class="help">{SESSIONS_ADD}</span>
      {/if}

      <div class="pair">
        <div class="field">
          <label for="fm-agent">Agent</label>
          <select id="fm-agent" disabled><option>{snapshot.settings.agent}</option></select>
          <span class="help">{#if account.error}<span class="message"><CodeText text={account.error} /></span>{:else}{#if account.line}{account.line}{/if}{#if account.usageError}<br /><span class="message">{account.usageError}</span>{:else if account.usage}<br />{account.usage}{/if}{/if}</span>
          <span class="help">Agent fixed for this PRD.</span>
        </div>
        <div class="field">
          <label for="fm-model">Model</label>
          <select id="fm-model" value={panel.fields.model} disabled={!connected} onchange={(event) => change(panel.selected, { model: event.currentTarget.value })}>
            {#each models as model (model.value)}<option value={model.value}>{model.displayName}</option>{/each}
          </select>
          {#if panel.fieldErrors.model}<span class="message">{panel.fieldErrors.model}</span>{/if}
          {#if snapshot.settings.modelListError}<span class="message">{snapshot.settings.modelListError}</span>{/if}
        </div>
      </div>
      <span class="help">Listed models do not guarantee account access.</span>
      <button type="button" class="button" disabled={!connected} onclick={() => fetch("/api/metadata/refresh", { method: "POST", headers: { "X-Kiln-Token": config.token } })}>Refresh agent information</button>
      <fieldset class="effort">
        <legend>Effort</legend>
        <div class="segments">
          {#each panel.effortLevels ?? EFFORTS as effort (effort)}
            {@const pressed = panel.effortLevels?.length !== 0 && panel.fields.effort === effort}
            <button type="button" aria-pressed={pressed} class:pressed disabled={!connected || effortDisabled(panel, effort)} onclick={() => { if (!effortDisabled(panel, effort)) void change(panel.selected, { effort: effort as Effort }); }}>{panel.efforts?.find((e) => e.value === effort)?.label ?? EFFORT_LABELS[effort] ?? effort}</button>
          {/each}
        </div>
        <span class="help">Applies to each phase’s session. Higher effort is slower and uses more of your plan.</span>
        {#if panel.effortLevels?.length === 0}<span class="help">This model takes no effort setting.</span>{/if}
      </fieldset>
      <label class="check"><input type="checkbox" checked={panel.fields.keepAwake} disabled={!connected} onchange={(event) => change(panel.selected, { keepAwake: event.currentTarget.checked })} /> <span>Keep this computer awake while a session works or Kiln waits<span class="help block">Stops idle sleep only. Closing a laptop’s lid can still put it to sleep; Kiln picks up where it left off afterwards.</span></span></label>
      <label class="check"><input type="checkbox" checked={panel.fields.resumeAfterUsageLimit} disabled={!connected} onchange={(event) => change(panel.selected, { resumeAfterUsageLimit: event.currentTarget.checked })} /> <span>Resume after a usage limit<span class="help block">Switch off to finish the phase yourself; Needs you then shows how.</span></span></label>
      <dl class="fixed">
        <dt>Pushes</dt><dd>After every phase</dd>
        <dt>Ends at</dt><dd>{snapshot.settings.developmentDeployments?.enabled ? "Confirmed development deliveries and any remaining review PRs" : panel.multi ? "One PR in each repository that changed, ready for review. Kiln won’t merge." : "One PR, ready for review. Kiln won’t merge."}</dd>
      </dl>
      {#if snapshot.settings.developmentDeployments?.enabled}<DevelopmentDelivery {snapshot} {config} {connected} />{/if}
      <BillingPanel {snapshot} {connected} />
    </div>

    <div class="run before">
      <span class="eyebrow">Before you start</span>
      <div class="between end">
        <div><span class="muted small">Starting lets Kiln</span>
          <ul class="allowed">{#each panel.preview.lets as row, index (index)}<li class:muted={!row.allowed}>{row.allowed ? "✓" : "✕"} {@render parts(row.parts)}</li>{/each}</ul>
        </div>
        <div class="go">
          <button type="button" class="primary" disabled={!connected || pressing || !!panel.busy || Object.keys(panel.fieldErrors).length > 0} onclick={pressStart}>{panel.preview.startLabel}</button>
          {#if panel.busy}<p class="help">{panel.busy}</p>{:else}<p class="help">Earlier phases, sessions and delivery links stay in this run’s history.</p>{/if}
        </div>
      </div>
      {#if view.startProgress}
        <div class="progress" role="alert">
          <p class="message">Start stopped: {view.startProgress.error}</p>
          {#if view.startProgress.done.length}<p class="small">Done: {view.startProgress.done.join("; ")}.</p>{/if}
          {#if view.startProgress.remaining.length}<p class="small">Still to do: {view.startProgress.remaining.join("; ")}. Press Start again to do only what remains.</p>{/if}
        </div>
      {:else if reason}<p class="message">{reason}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .section-title { margin: 0; font-size: 20px; font-weight: 600; color: var(--text); }
  .setup-lead { margin: -14px 0 0; color: var(--muted); }
  .setup { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
  .label, label, legend { font-size: 13px; font-weight: 500; color: var(--muted); }
  .starts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 12px; }
  .start { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; cursor: pointer; }
  .start.on { border-color: var(--text); }
  .start.off { opacity: 0.6; cursor: not-allowed; }
  .start strong { color: var(--text); }
  .start strong .tag { margin-left: 8px; }
  .why { display: block; font-size: 12.5px; color: var(--muted); font-weight: 400; }
  .tag { font-size: 11.5px; border: 1px solid var(--line-strong); border-radius: 999px; padding: 1px 8px; font-weight: 500; }
  .tag.ok { color: var(--green); border-color: var(--green); }
  .run { border-top: 1px solid var(--line); padding-top: 14px; display: flex; flex-direction: column; gap: 12px; }
  .run h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .between { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  .between.end { align-items: flex-end; }
  .muted { color: var(--muted); }
  .small { font-size: 12.5px; }
  .phases, .repos, .allowed { list-style: none; margin: 0; padding: 0; }
  .phases li, .repos li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; flex-wrap: wrap; }
  .allowed li { font-size: 13.5px; padding: 3px 0; }
  .caution { margin: 0; color: var(--amber); font-size: 13px; }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 16px; }
  input[type="text"], select { height: 40px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--field); color: var(--text); font-size: 13px; box-sizing: border-box; width: 100%; }
  input:disabled, select:disabled { opacity: 0.6; }
  .repos select { width: 132px; height: 34px; }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.55; }
  .help.block { display: block; }
  .message { font-size: 12.5px; color: var(--amber); margin: 0; }
  .message.wide { flex-basis: 100%; }
  .effort { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px; }
  .segments { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
  .segments button { min-height: 40px; border: 0; background: transparent; color: var(--muted); font-size: 13.5px; cursor: pointer; }
  .segments button.pressed { background: var(--text); color: var(--bg); font-weight: 600; }
  .check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: var(--text); font-weight: 400; }
  .fixed { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; font-size: 13.5px; }
  .fixed dt { color: var(--dim); }
  .fixed dd { margin: 0; color: var(--muted); }
  .go { text-align: right; margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; }
  .go .help { margin: 6px 0 0; max-width: 340px; }
  .primary { min-height: 44px; padding: 0 22px; border-radius: 999px; font-size: 15px; font-weight: 600; background: var(--text); color: var(--bg); border: 1px solid var(--text); cursor: pointer; }
  .primary:disabled { background: transparent; color: var(--dim); border-color: var(--line-strong); cursor: not-allowed; }
  .start-row { display: flex; justify-content: space-between; }
  .caution.first { margin: 0; }
  .progress p { margin: 4px 0 0; }
  code, .mono { font-family: var(--mono); font-size: 12.5px; }
</style>
