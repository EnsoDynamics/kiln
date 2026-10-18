<script lang="ts">
  // The PRD's settings while Kiln works, is paused or is disconnected (PRD AC-WATCH-07,
  // AC-VIEW-08): the model and effort for the next session, with Change; keep-awake, which
  // applies at once (AC-KEEP-07: closing the lid can still sleep); and the worktree, feature
  // branch and one pull request, fixed for the PRD. Without a live Kiln, Change and the checkbox
  // are disabled in place (technical design, "Connection").
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Settings } from "../../../src/state/records.js";
  import { changeSettings } from "../lib/api.js";
  import { phaseName, PR_ID, settingsModel } from "../lib/progress.js";
  import { viewContext } from "../lib/view-context.js";
  import ModelEffortEditor from "./ModelEffortEditor.svelte";

  let { snapshot, connected }: { snapshot: Snapshot; connected: boolean } = $props();
  const { config } = viewContext();
  const settings = $derived(snapshot.settings);
  let editing = $state(false);
  let reason = $state<string | undefined>(undefined);

  const note = $derived.by(() => {
    if (!connected) return "Settings can be changed again once Kiln is running.";
    if (snapshot.feature.state === "paused") return "Model and effort changes apply from the next phase you start.";
    const current = snapshot.current?.phaseId;
    if (current === PR_ID && snapshot.current?.sessionId !== undefined) return "Model and effort changes apply from the next phase; the pull-request session keeps what it started with.";
    // Between phases the next session hasn't started, so a change still applies to it.
    if (current !== undefined && snapshot.current?.sessionId !== undefined) return `Model and effort changes apply from the next phase; ${phaseName(current)} keeps what it started with.`;
    return "Model and effort changes apply from the next phase you start.";
  });

  async function save(change: Partial<Settings>) {
    const answer = await changeSettings(config, change);
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<section class="card" aria-labelledby="set-h">
  <div class="intro"><h2 id="set-h" class="eyebrow">Settings for this PRD</h2><span class="note">{note}</span></div>
  <dl>
    <div class="setting">
      <div class="words"><dt>Model and effort</dt><dd class="value">{settingsModel(settings)}</dd><dd class="help">Claude Code</dd></div>
      <button type="button" class="button small" disabled={!connected} onclick={() => (editing = !editing)}>{editing && connected ? "Done" : "Change"}</button>
    </div>
    {#if editing && connected}<ModelEffortEditor {snapshot} {save} />{/if}
    <div class="setting">
      <div class="words">
        <dt>Keep awake</dt><dd class="value">While a session works</dd><dd class="help">Closing the lid can still put the computer to sleep.</dd>
        {#if settings.keepAwakeError}<dd class="message">{settings.keepAwakeError}</dd>{/if}
      </div>
      <label class="awake"><input type="checkbox" checked={settings.keepAwake} disabled={!connected} aria-label="Keep this computer awake" onchange={(event) => save({ keepAwake: event.currentTarget.checked })} />{settings.keepAwake ? "On" : "Off"}</label>
    </div>
    {#if reason}<span class="message">{reason}</span>{/if}
    <div class="fixed">
      <dt>The same for every phase</dt>
      <dd>Worktree, feature branch, and one PR into <span class="code-inline">{settings.baseBranch}</span>, set before the first phase. Each phase builds on the one before, so they can’t change.</dd>
    </div>
  </dl>
</section>

<style>
  .intro { display: flex; flex-direction: column; gap: 4px; }
  .note { font-size: 13px; color: var(--dim); line-height: 1.5; }
  dl { margin: 0; display: flex; flex-direction: column; gap: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .setting { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .words { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  dt { font-size: 12.5px; color: var(--dim); }
  dd { margin: 0; }
  .value { font-size: 14.5px; color: var(--text); }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.5; }
  .awake { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; flex: 0 0 auto; }
  .awake input { width: 18px; height: 18px; margin: 0; accent-color: var(--red); }
  .fixed { display: flex; flex-direction: column; gap: 3px; padding-top: 14px; border-top: 1px solid var(--line); }
  .fixed dd { font-size: 13.5px; color: var(--muted); line-height: 1.55; }
</style>
