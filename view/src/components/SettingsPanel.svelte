<script lang="ts">
  import { repositoriesStatement } from "../../../src/engine/authority-statement.js";
  // The PRD's settings while Kiln works, is paused or is disconnected (PRD AC-WATCH-07,
  // AC-VIEW-08): the model lines, models chosen for each phase with the Model defaults link, the
  // Audits choice and the fallback (Kiln Phase Model Tiers AC-KEEP-01, AC-DEFAULT-02, AC-OTHER-01,
  // AC-FALLBACK-01; the plan's rows show each phase's); keep-awake, which
  // applies at once (AC-KEEP-07: closing the lid can still sleep); and the worktree, feature
  // branch and one pull request, fixed for the PRD. Without a live Kiln, Change and the checkbox
  // are disabled in place (technical design, "Connection"). A multi-repository PRD lists the
  // workspace folder and each repository's base, fixed, as Documents found draws them without
  // their help text (multi-repo AC-PRS-04, AC-SHOW-01). Under keep-awake, which covers a wait for
  // usage too, "Resume after a usage limit" applies at once, as the waiting screen draws it
  // (usage-limit recovery AC-AUTO-03, AC-AUTO-04). Last, the two audit loop limits, changeable
  // while Kiln runs and applied from its next decision whether to run that audit, each at or above
  // the runs already made (Kiln Deliver When Audit Loops Run Out AC-CHOICE-02).
  import DevelopmentDelivery from "./DevelopmentDelivery.svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Settings } from "../../../src/state/records.js";
  import { changeSettings } from "../lib/api.js";
  import { addedLabel, folderShown, repositoriesLine } from "../lib/progress.js";
  import { viewContext } from "../lib/view-context.js";
  import { mergeAgent } from "../lib/agents.js";
  import AuditLoopSettings from "./AuditLoopSettings.svelte";
  import ModelLines from "./ModelLines.svelte";
  import { shownLoopSettings } from "../lib/audit-loops.js";

  let { snapshot, connected }: { snapshot: Snapshot; connected: boolean } = $props();
  const { config } = viewContext();
  const settings = $derived(snapshot.settings);
  const folder = $derived(folderShown(settings.workspaceFolder));
  let reason = $state<string | undefined>(undefined);

  const note = $derived(connected ? "A phase that has started keeps the model it started with." : "Reconnect to Kiln before changing settings.");

  async function save(change: Partial<Settings>) {
    const answer = await changeSettings(config, change);
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<DevelopmentDelivery {snapshot} {config} {connected} />

<section class="card" aria-labelledby="set-h">
  <div class="intro"><h2 id="set-h" class="eyebrow">Settings for this PRD</h2><span class="note">{note}</span></div>
  <dl>
    <div class="setting"><ModelLines {snapshot} {connected} settings /></div>
    <div class="setting">
      <div class="words">
        <dt>Keep awake</dt><dd class="value">While a session works or Kiln waits</dd><dd class="help">Closing the lid can still put the computer to sleep.</dd>
        {#if settings.keepAwakeError}<dd class="message">{settings.keepAwakeError}</dd>{/if}
      </div>
      <label class="awake"><input type="checkbox" checked={settings.keepAwake} disabled={!connected} aria-label="Keep this computer awake" onchange={(event) => save({ keepAwake: event.currentTarget.checked })} />{settings.keepAwake ? "On" : "Off"}</label>
    </div>
    <div class="setting">
      <div class="words"><dt>Resume after a usage limit</dt><dd class="help limit-help">Switch off to finish the phase yourself; Needs you then shows how.</dd></div>
      <label class="awake"><input type="checkbox" checked={settings.resumeAfterUsageLimit} disabled={!connected} aria-label="Resume after a usage limit" onchange={(event) => save({ resumeAfterUsageLimit: event.currentTarget.checked })} />{settings.resumeAfterUsageLimit ? "On" : "Off"}</label>
    </div>
    {#if reason}<span class="message">{reason}</span>{/if}
    {#if snapshot.feature.multiRepository}
      <div class="fixed">
        <dt>Workspace folder</dt>
        <dd class="value mono path">{folder[0]}<wbr /><span class="nowrap">{folder[1]}</span></dd>
        <dd class="count">{repositoriesLine(snapshot.repositories)}</dd>
      </div>
      <div class="more">
        <dt>Feature branch</dt>
        <dd class="value mono path">{settings.featureBranch}</dd>
      </div>
      <div class="more">
        <dt class="repos-head"><span>Repositories</span><span>Branch from, and PR into</span></dt>
        <dd>
          <ul class="repos">
            {#each snapshot.repositories as row (row.name)}
              <li>
                <!-- Each row as Documents found's found row: label, address path and checkout folder, fixed (find repositories anywhere AC-SEE-04). -->
                <span class="repo-text">
                  <span class="repo"><span class="mono repo-name">{row.label}</span>{#if row.kind === "prd"}<span class="tag">PRD’s repository</span>{:else if row.addedInPhase !== undefined}<span class="tag">{addedLabel(row.addedInPhase)}</span>{/if}</span>
                  <span class="where"><span class="mono">{row.addressPath}</span>{#if row.checkoutFolder}<span class="dot">{" · "}</span><span class="mono">{row.checkoutFolder}</span>{/if}</span>
                </span>
                <span class="mono base">{row.baseBranch}</span>
              </li>
            {/each}
          </ul>
        </dd>
      </div>
      <div class="more">
        <dt>The same for every phase</dt>
        <dd>Workspace folder, feature branch, and {snapshot.developmentDelivery?.authorization.enabled ? "approved delivery targets and remaining review work" : "one PR in each repository into its base"}, set before the first phase. Each phase builds on the one before, so they can’t change.</dd>
      </div>
      <div class="more">
        <dt>In each repository</dt>
        <dd>{repositoriesStatement(mergeAgent(snapshot), !!snapshot.developmentDelivery?.authorization.enabled)}</dd>
      </div>
    {:else}
      <div class="fixed">
        <dt>The same for every phase</dt>
        <dd>{#if snapshot.developmentDelivery?.authorization.enabled}Worktree and feature branch are fixed; approved early merges and any remaining review PRs target <span class="code-inline">{settings.baseBranch}</span>.{:else}Worktree, feature branch, and one PR into <span class="code-inline">{settings.baseBranch}</span>, set before the first phase.{/if} Each phase builds on the one before, so they can’t change.</dd>
      </div>
    {/if}
  </dl>
  <AuditLoopSettings settings={shownLoopSettings(snapshot)} {config} view={snapshot.auditLoops} disabled={!connected} short />
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
  .limit-help { font-size: 13px; }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.5; }
  .awake { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; flex: 0 0 auto; }
  .awake input { width: 18px; height: 18px; margin: 0; accent-color: var(--red); }
  .fixed { display: flex; flex-direction: column; gap: 3px; padding-top: 14px; border-top: 1px solid var(--line); }
  .fixed dd, .more dd { font-size: 13.5px; color: var(--muted); line-height: 1.55; }
  .more { display: flex; flex-direction: column; gap: 3px; }
  .fixed dd.value, .more dd.value { color: var(--text); }
  .path { font-size: 13px; overflow-wrap: anywhere; }
  .fixed dd.count { font-size: 13px; }
  .repos-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; }
  .repos { list-style: none; margin: 4px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .repos li { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .repo { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
  .repo-name { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
  .repo-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .where { font-size: 12px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
  .where .mono { font-size: 12px; }
  .dot { color: var(--dim); }
  .base { font-size: 13px; color: var(--muted); }
  .nowrap { white-space: nowrap; }
</style>
