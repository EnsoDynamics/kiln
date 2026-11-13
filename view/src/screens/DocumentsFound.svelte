<script lang="ts">
  import BillingPanel from "../components/BillingPanel.svelte";
  // Documents found (docs/design/mockups/kiln-screen-documents-found.html): what Kiln found
  // beside the PRD (PRD AC-START-04), the PRD's settings, changeable before Start and saved as
  // they are made (AC-START-06), the refinement confirmation (AC-START-05), what Kiln may and
  // may not do (AC-START-08), and Start. A multi-repository PRD (docs/changes/
  // kiln-multi-repo-delivery/mockups/kiln-screen-documents-found-repositories.html) shows each
  // phase's repositories, the workspace folder in place of the worktree, and a base per
  // repository (multi-repo AC-REPO-03, AC-SPACE-01, AC-PRS-04); a field Start already set up is
  // shown fixed. Either says sessions can add a repository (AC-ADD-01, AC-SPACE-03). Under
  // keep-awake, "Resume after a usage limit", in the waiting screen's words (usage-limit recovery
  // AC-AUTO-04).
  // Start from (run restart AC-FROM-01 to 05, AC-CURRENT-01, mockup docs/changes/kiln-run-restart/
  // mockups/kiln-run-restart.html): a new feature branch or one that already exists; on an existing
  // branch What Kiln found reads the plan where the first session starts, Feature branch is a list,
  // the base reads PR into, and an untouched branch behind its base gets the catch-up offer.
  import DevelopmentDelivery from "../components/DevelopmentDelivery.svelte";
  import CatchUpOffer from "../components/CatchUpOffer.svelte";
  import type { RepositoryRow, Snapshot } from "../../../src/engine/snapshot.js";
  import type { Effort, Settings } from "../../../src/state/records.js";
  import AccountPanel from "../components/AccountPanel.svelte";
  import CodeText from "../components/CodeText.svelte";
  import DisconnectedBanner from "../components/DisconnectedBanner.svelte";
  import FeatureHeader from "../components/FeatureHeader.svelte";
  import { changeSettings, start, type PageConfig } from "../lib/api.js";
  import {
    accountLines,
    adoptedWorktreeHelp,
    assumptionsLine,
    closedPhasesLine,
    planSourceLine,
    startCountLine,
    designLine,
    linkedDocumentsLine,
    EFFORT_LABELS,
    EFFORTS,
    effortDisabled,
    modelOptions,
    planCountLine,
    planRows,
    prdLine,
    startState,
  } from "../lib/documents-found.js";
  import { addedLabel } from "../lib/progress.js";

  /** What sessions may do in a repository they add (multi-repo AC-ADD-01, AC-PRS-04), on both Documents found screens. */
  const SESSIONS_ADD = "Sessions can add a repository they find they need. There Kiln may commit and push to the feature branch, started from develop or its default branch, and open one pull request into that base.";

  let { snapshot, config, connected, lastSeenAt, now = Date.now() }: { snapshot: Snapshot; config: PageConfig; connected: boolean; lastSeenAt?: number | undefined; now?: number } = $props();

  const documents = $derived(snapshot.documents!);
  const settings = $derived(snapshot.settings);
  const rows = $derived(documents.plan ? planRows(documents.plan.phases) : []);
  const account = $derived(accountLines(snapshot.account));
  const models = $derived(modelOptions(snapshot));
  const baseChoices = $derived(settings.baseBranches && settings.baseBranches.length > 0 ? settings.baseBranches : settings.baseBranch ? [settings.baseBranch] : []);
  const fixedLocked = $derived(!connected || documents.starting === true);
  const multi = $derived(snapshot.feature.multiRepository);
  const repositoryName = $derived(snapshot.feature.repositoryName);
  // The PRD's repository's row: its base is fixed once Start set it up.
  const prdRow = $derived(snapshot.repositories.find((row) => row.kind === "prd"));
  const startFrom = $derived(documents.start);
  const existing = $derived(startFrom?.from === "existing");
  const sourceLine = $derived(startFrom ? planSourceLine(startFrom) : undefined);
  const startRepository = (name: string) => startFrom?.repositories.find((repository) => repository.name === name);
  const prdStart = $derived(startRepository(repositoryName));
  const adopted = $derived(existing ? prdStart?.worktree : undefined);
  const pullRequest = $derived(existing ? prdStart?.pullRequest : undefined);
  const offer = $derived(existing ? startFrom?.catchUp : undefined);
  const catchUpTicked = $derived(startFrom?.bringUpToDate ?? true);
  const startLabel = $derived(startFrom?.startAt ? `Start at Phase ${startFrom.startAt.id}` : "Start");
  const closedLine = $derived(documents.plan ? closedPhasesLine(documents.plan.phases, startFrom) : undefined);
  const branchFixed = $derived(fixedLocked || settings.fixed.featureBranch);

  // The confirmation box belongs to the view: the same tab keeps it ticked, and a reload asks again.
  let refined = $state(false);
  let pressing = $state(false);
  let startReason = $state<string | undefined>(undefined);
  const startNow = $derived(startState(snapshot, refined, connected));

  // Text fields keep what the person types; the saved value comes back with the next snapshot.
  // A folder is shown with its trailing slash, as the mockup draws it; Kiln reads it either way.
  const withSlash = (folder: string) => (folder === "" || folder.endsWith("/") ? folder : `${folder}/`);
  type TextField = "workspaceFolder" | "worktreePath" | "featureBranch";
  let drafts = $state<Partial<Record<TextField, string>>>({});
  const timers: Partial<Record<TextField, ReturnType<typeof setTimeout>>> = {};

  async function save(change: Partial<Settings> & { start?: { from: "new" | "existing"; bringUpToDate: boolean } }) {
    startReason = undefined;
    const answer = await changeSettings(config, { ...change, ...((change.model !== undefined || change.effort !== undefined) ? { agentId: settings.agentId ?? "claude_code", selectionGeneration: settings.selectionGeneration ?? 0 } : {}) });
    if (!answer.ok) startReason = answer.reason;
  }

  function typed(field: TextField, value: string) {
    drafts[field] = value;
    clearTimeout(timers[field]);
    timers[field] = setTimeout(() => save({ [field]: value }), 400);
  }

  function committed(field: TextField) {
    clearTimeout(timers[field]);
    const value = drafts[field];
    if (value !== undefined && value !== settings[field]) save({ [field]: value });
    delete drafts[field];
  }

  /** The PRD's repository's base is v1's `baseBranch`; every other repository's goes under `bases`, by name (multi-repo HTTP API). */
  function chooseBase(row: RepositoryRow, base: string) {
    save(row.kind === "prd" ? { baseBranch: base } : { bases: { [row.name]: base } });
  }

  /** A row's choices: its origin's branches, or its base alone until they arrive. */
  const rowChoices = (row: RepositoryRow) => (row.baseBranches && row.baseBranches.length > 0 ? row.baseBranches : row.baseBranch ? [row.baseBranch] : []);

  /** Start from and the catch-up box are saved with the settings (run restart "The starting point"). */
  function chooseStart(from: "new" | "existing") {
    save({ start: { from, bringUpToDate: startFrom?.bringUpToDate ?? true } });
  }
  function tickCatchUp(ticked: boolean) {
    save({ start: { from: "existing", bringUpToDate: ticked } });
  }

  function chooseEffort(effort: Effort) {
    if (!effortDisabled(settings, effort)) save({ effort });
  }

  async function pressStart() {
    if (!startNow.enabled || pressing) return;
    pressing = true;
    startReason = undefined;
    const answer = await start(config, refined, startFrom?.previewId);
    pressing = false;
    // A setup failure shows as the snapshot's startError; anything else refused shows its reason.
    if (!answer.ok && !answer.fieldErrors && snapshot.documents?.startError === undefined) startReason = answer.reason;
  }
</script>

<main>
  <FeatureHeader repositoryName={snapshot.feature.repositoryName} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name}>
    <span class="pill">Not started</span>
    <span class="lead">Review what Kiln found and how it will deliver, then start.</span>
  </FeatureHeader>
  {#if !connected && lastSeenAt !== undefined}<DisconnectedBanner {lastSeenAt} {now} />{/if}

  <div class="columns">
    <section class="panel found" aria-labelledby="found-h">
      <h2 id="found-h" class="eyebrow found-eyebrow">What Kiln found</h2>
      <ul class="found-list">
        <li>
          {@render check(16)}
          <div class="item">
            <div class="item-head"><span class="item-name">PRD</span><span class="mono file">{documents.prd.file}</span></div>
            <span class="item-line">{prdLine(documents.prd)}</span>
          </div>
        </li>
        {#if documents.design}<li>
          {@render check(16)}
          <div class="item">
            <div class="item-head"><span class="item-name">Technical design</span><span class="mono file">{documents.design.file}</span></div>
            <span class="item-line">{designLine(documents.design, documents.prd.criteriaCount)}</span>
          </div>
        </li>{/if}
        <li>
          {@render check(16)}
          <div class="item">
            <div class="item-head"><span class="item-name">Assumptions</span>{#if documents.assumptions}<span class="mono file">{documents.assumptions.file}</span>{/if}</div>
            <span class="item-line">{assumptionsLine(documents.assumptions)}</span>
          </div>
        </li>
        {#if documents.plan}<li>
          {@render check(16)}
          <div class="item plan">
            <div class="item-intro">
              <div class="item-head"><span class="item-name">Phase plan</span><span class="mono file">{documents.plan!.phaseDocCount} {documents.plan!.phaseDocCount === 1 ? "phase doc" : "phase docs"}</span></div>
              {#if !sourceLine}<span class="item-line">{startCountLine(documents.plan!, startFrom)}</span>{/if}
            </div>
            {#if sourceLine}
              <!-- Where the plan was read and the count, in a box: amber when phases are closed where it was read (run restart AC-LOOK-01). -->
              <div class="source-box" class:closed-on={!!startFrom?.startAt && documents.plan!.closedCount > 0}>
                <span>{sourceLine.lead}<span class="mono code">{sourceLine.code}</span>{sourceLine.tail ?? ""}</span>
                <span>{startCountLine(documents.plan!, startFrom)}</span>
              </div>
            {/if}
            <ol class="phases">
              {#each rows as row (row.id)}
                {#if row.children.length > 0 || row.splitNote}
                  <li class="split">
                    <span class="phase"><span class="circle dashed mono">{row.id}</span><span class="title split-title">{row.title}</span><span class="note">{row.splitNote}</span>{@render repositories(row.repositories)}</span>
                    <ol class="phases">
                      {#each row.children as child (child.id)}
                        {@render phase(child)}
                      {/each}
                    </ol>
                  </li>
                {:else}
                  {@render phase(row)}
                {/if}
              {/each}
            </ol>
          </div>
        </li>{/if}
        {#if documents.unfollowedLinks?.length}
          <!-- Neither passed nor failed: Kiln starts anyway and tells the agent (Kiln Linked Documents AC-LINK-04). -->
          <li class="linked">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--dim)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" class="found-mark"><circle cx="8" cy="8" r="5.5"></circle><path d="M5.5 8h5"></path></svg>
            <div class="item">
              <div class="item-head"><span class="item-name">Linked documents</span></div>
              <span class="item-line">{linkedDocumentsLine(documents.unfollowedLinks.length)}</span>
              <ul class="links">
                {#each documents.unfollowedLinks as link (`${link.from} ${link.target}`)}
                  <li><span class="mono link-target">{link.target}</span><span class="link-from">linked from <span class="mono">{link.from}</span> · {link.reason}</span></li>
                {/each}
              </ul>
            </div>
          </li>
        {/if}
      </ul>
      <div class="checks">
        {#each documents.checks as passed (passed.name)}
          {@const named = passed.name.split(` ${repositoryName}`)}
          {#if !passed.passed}
            <!-- A start check that failed on a page a reset built, in kiln run's words (run restart AC-RESET-04). -->
            <span class="failed"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--amber)" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg>{passed.text ?? passed.name}</span>
          {:else if multi && named.length === 2 && (named[1] === "" || named[1]!.startsWith(" "))}
            <span class="passed">{@render check(12)}<span>{named[0]} <span class="mono check-name">{repositoryName}</span>{named[1]}</span></span>
          {:else}
            <span class="passed">{@render check(12)}{passed.name}</span>
          {/if}
        {/each}
      </div>
    </section>

    <section class="panel settings" aria-labelledby="settings-h">
      <h2 id="settings-h" class="eyebrow">How Kiln will deliver it</h2>

      {#if startFrom && !settings.fixed.featureBranch}
        <fieldset class="start-from">
          <legend>Start from</legend>
          <div class="choices">
            <label class="choice" class:selected={!existing}>
              <input type="radio" name="start-from" checked={!existing} disabled={fixedLocked} onchange={() => chooseStart("new")} />
              <span class="choice-text"><span class="choice-name">A new feature branch</span><span class="help">Kiln cuts it from the base branch. What Kiln does today.</span></span>
            </label>
            <label class="choice" class:selected={existing}>
              <input type="radio" name="start-from" checked={existing} disabled={fixedLocked} onchange={() => chooseStart("existing")} />
              <span class="choice-text"><span class="choice-name">A branch that already exists</span><span class="help">Work already begun on this PRD, by you or by Kiln before a reset. Kiln carries on from it.</span></span>
            </label>
          </div>
        </fieldset>
      {/if}

      {#if multi}
        <div class="field">
          <label for="workspace">Workspace folder</label>
          {#if existing && startFrom?.workspaceFolder}
            <input id="workspace" type="text" class="mono" value={withSlash(startFrom.workspaceFolder)} readonly disabled />
          {:else}
            <input id="workspace" type="text" class="mono" value={drafts.workspaceFolder ?? withSlash(settings.workspaceFolder)} disabled={fixedLocked || settings.fixed.workspaceFolder} oninput={(event) => typed("workspaceFolder", event.currentTarget.value)} onblur={() => committed("workspaceFolder")} />
          {/if}
          {#if settings.fieldErrors.workspaceFolder}<span class="message">{settings.fieldErrors.workspaceFolder}</span>{/if}
          {#if existing && startFrom?.workspaceFolder}
            <span class="help">The branch's worktrees are in this folder, so Kiln works here: {startFrom.repositories.filter((repository) => repository.worktree).map((repository) => `${repository.name} with ${repository.worktree!.uncommittedFiles === undefined ? "an unknown number of" : repository.worktree!.uncommittedFiles === 0 ? "no" : repository.worktree!.uncommittedFiles} uncommitted ${repository.worktree!.uncommittedFiles === 1 ? "file" : "files"}`).join(", ")}. These are set once, before the first phase; model, effort and keep-awake can be changed later.</span>
          {:else}
            <span class="help">Holds a worktree of each repository below, all on the feature branch. Every phase works here in turn. These are set once, before the first phase; model, effort and keep-awake can be changed later.</span>
          {/if}
        </div>

        <div class="field">
          <label for="branch">Feature branch</label>
          {@render branchField()}
          {#if settings.fieldErrors.featureBranch}<span class="message">{settings.fieldErrors.featureBranch}</span>{/if}
          <span class="help">Used in every repository.</span>
          {#if existing}<span class="help">Kiln adds its commits to this branch and pushes them. It never rewrites, resets or force-pushes it.</span>{/if}
        </div>
        {#if offer}<CatchUpOffer {offer} where="start" ticked={catchUpTicked} disabled={fixedLocked} onchange={tickCatchUp} />{/if}

        <div class="field">
          <div class="repos-head"><span id="repos-h" class="label">Repositories</span><span class="help">Branch from, and PR into</span></div>
          <ul aria-labelledby="repos-h" class="repos">
            {#each snapshot.repositories as row (row.name)}
              <li>
                <span class="repo"><label for="base-{row.name}" class="mono repo-name">{row.name}</label>{#if row.kind === "prd"}<span class="tag">PRD’s repository</span>{:else if row.addedInPhase !== undefined}<span class="tag">{addedLabel(row.addedInPhase)}</span>{/if}{#if existing && startRepository(row.name)?.hasBranch}<span class="tag">PR into</span>{/if}</span>
                <select id="base-{row.name}" class="mono" value={row.baseBranch} disabled={fixedLocked || row.fixed} onchange={(event) => chooseBase(row, event.currentTarget.value)}>
                  {#if row.baseBranch === ""}<option value=""></option>{/if}
                  {#each rowChoices(row) as base (base)}<option value={base}>{base}</option>{/each}
                </select>
                {#if row.fieldErrors.baseBranch}<span class="message row-message">{row.fieldErrors.baseBranch}</span>{/if}
              </li>
            {/each}
          </ul>
          <span class="help sessions">{SESSIONS_ADD}</span>
          <span class="help">Sessions follow each repository’s CLAUDE.md, but not its .claude/settings.json or hooks.</span>
        </div>
      {:else}
        <div class="field">
          <label for="worktree">Worktree</label>
          {#if adopted}
            <input id="worktree" type="text" class="mono" value={adopted.path} readonly disabled />
          {:else}
            <input id="worktree" type="text" class="mono" value={drafts.worktreePath ?? settings.worktreePath} disabled={fixedLocked || settings.fixed.worktreePath} oninput={(event) => typed("worktreePath", event.currentTarget.value)} onblur={() => committed("worktreePath")} />
          {/if}
          {#if settings.fieldErrors.worktreePath}<span class="message">{settings.fieldErrors.worktreePath}</span>{/if}
          <span class="help">{adopted ? adoptedWorktreeHelp(adopted.uncommittedFiles) : "One worktree and one branch for the whole PRD. Every phase works here in turn. These three are set once, before the first phase; model, effort and keep-awake can be changed later."}</span>
        </div>

        <div class="field">
          <div class="pair">
            <div class="field">
              <label for="branch">Feature branch</label>
              {@render branchField()}
              {#if settings.fieldErrors.featureBranch}<span class="message">{settings.fieldErrors.featureBranch}</span>{/if}
            </div>
            <div class="field">
              <label for="base">{existing ? "PR into" : "Branch from, and PR into"}</label>
              <select id="base" class="mono" value={settings.baseBranch} disabled={fixedLocked || prdRow?.fixed === true} onchange={(event) => save({ baseBranch: event.currentTarget.value })}>
                {#if settings.baseBranch === ""}<option value=""></option>{/if}
                {#each baseChoices as base (base)}<option value={base}>{base}</option>{/each}
              </select>
              {#if settings.fieldErrors.baseBranch}<span class="message">{settings.fieldErrors.baseBranch}</span>{/if}
            </div>
          </div>
          {#if existing}<span class="help">Kiln adds its commits to this branch and pushes them. It never rewrites, resets or force-pushes it.</span>{/if}
          {#if offer}<CatchUpOffer {offer} where="start" ticked={catchUpTicked} disabled={fixedLocked} onchange={tickCatchUp} />{/if}
          <span class="help">{SESSIONS_ADD}</span>
        </div>
      {/if}

      <div class="pair">
        <div class="field">
          <label for="agent">Agent</label>
          <select id="agent" value={settings.agentId ?? "claude_code"} disabled={fixedLocked || settings.agentFixed} onchange={(event) => save({ agentId: event.currentTarget.value as "claude_code" | "codex" })}><option value="claude_code">Claude Code</option><option value="codex">Codex</option></select>
          <span class="agent">{#if account.error}<span class="message"><CodeText text={account.error} /></span>{:else}{#if account.line}<span class="sub">{account.line}</span>{/if}{#if account.usageError}<span class="message">{account.usageError}</span>{:else if account.usage}<span class="sub">{account.usage}</span>{/if}{/if}</span>
        </div>
        <div class="field">
          <label for="model">Model</label>
          <select id="model" class="model" value={settings.model.value} disabled={!connected || documents.starting === true} onchange={(event) => save({ model: event.currentTarget.value })}>
            {#each models as model (model.value)}<option value={model.value}>{model.displayName}</option>{/each}
          </select>
          {#if settings.fieldErrors.model}<span class="message">{settings.fieldErrors.model}</span>{/if}
          {#if settings.modelListError}<span class="message">{settings.modelListError}</span>{/if}
        </div>
      </div>

      <span class="help">Listed models do not guarantee account access.</span>
      {#if settings.choiceNotice}<p class="message">{settings.choiceNotice}</p>{/if}
      {#if settings.readinessErrors?.length}<p class="message">{settings.readinessErrors.join(" ")}</p>{/if}
      <button type="button" class="button" disabled={!connected || settings.metadataPending || snapshot.billing?.pending} onclick={() => fetch("/api/metadata/refresh", { method: "POST", headers: { "X-Kiln-Token": config.token } })}>Refresh agent information</button>
      <fieldset class="effort">
        <legend>Effort</legend>
        <div class="segments">
          {#each settings.effortLevels ?? EFFORTS as effort (effort)}
            {@const pressed = settings.effortLevels?.length !== 0 && settings.effort === effort}
            <button type="button" aria-pressed={pressed} class:pressed disabled={!connected || documents.starting === true || effortDisabled(settings, effort)} onclick={() => chooseEffort(effort)}>{settings.efforts?.find((e) => e.value === effort)?.label ?? EFFORT_LABELS[effort] ?? effort}</button>
          {/each}
        </div>
        <span class="help">Applies to each phase’s session. Higher effort is slower and uses more of your plan.</span>
        {#if settings.effortLevels?.length === 0}<span class="help">This model takes no effort setting.</span>{/if}
      </fieldset>
      {#if snapshot.account && settings.agentId === "codex"}<AccountPanel account={snapshot.account} agent={settings.agent} paused={false} notStarted={true} {now} />{/if}


      <label for="awake" class="awake">
        <input id="awake" type="checkbox" checked={settings.keepAwake} disabled={!connected} onchange={(event) => save({ keepAwake: event.currentTarget.checked })} />
        <span class="awake-text"
          ><span class="awake-label">Keep this computer awake while a session works or Kiln waits</span><span class="help">Stops idle sleep only. Closing a laptop’s lid can still put it to sleep; Kiln picks up where it left off afterwards.</span
          >{#if settings.keepAwakeError}<span class="message">{settings.keepAwakeError}</span>{/if}</span
        >
      </label>

      <label for="resume-after-limit" class="awake">
        <input id="resume-after-limit" type="checkbox" checked={settings.resumeAfterUsageLimit} disabled={!connected} onchange={(event) => save({ resumeAfterUsageLimit: event.currentTarget.checked })} />
        <span class="awake-text"><span class="awake-label">Resume after a usage limit</span><span class="help">Switch off to finish the phase yourself; Needs you then shows how.</span></span>
      </label>

      <dl class="fixed">
        <dt>Pushes</dt><dd>After every phase</dd>
        <dt>Ends at</dt><dd>{settings.developmentDeployments?.enabled ? "Confirmed development deliveries and any remaining review PRs" : multi ? "One PR in each repository that changed, ready for review. Kiln won’t merge." : "One PR, ready for review. Kiln won’t merge."}</dd>
      </dl>
      <DevelopmentDelivery {snapshot} {config} {connected} editable />
      <BillingPanel {snapshot} {connected} />
    </section>
  </div>

  <section class="panel before" aria-labelledby="start-h">
    <h2 id="start-h" class="eyebrow wide">Before you start</h2>

    <div class="column">
      <span class="explain">Kiln can’t tell from the files whether these documents went through requirements refinement; that workflow deletes its working file when it finishes.</span>
      <label for="refined" class="refined">
        <input id="refined" type="checkbox" bind:checked={refined} disabled={!connected || documents.starting === true} />
        <span>These documents have been through requirements refinement</span>
      </label>
    </div>

    <div class="column">
      <span class="lets">Starting lets Kiln</span>
      <ul class="allowed">
        {#if multi}
          {#if offer && catchUpTicked}<li>{@render check(14, true)}<span>Bring <span class="mono code nowrap">{settings.featureBranch}</span> up to date with each repository’s base where offered, as ticked above</span></li>{/if}
          <li>{@render check(14, true)}<span>In each repository, commit and push to <span class="mono code nowrap">{settings.featureBranch}</span></span></li>
          {#if existing}{#each startFrom?.repositories.filter((repository) => repository.pullRequest) ?? [] as repository (repository.name)}<li>{@render check(14, true)}<span>{#if repository.pullRequest && "number" in repository.pullRequest}In <span class="mono code">{repository.name}</span>, use its open pull request <a href={repository.pullRequest.url}>#{repository.pullRequest.number}</a>{:else}In <span class="mono code">{repository.name}</span>: {repository.pullRequest && "unknown" in repository.pullRequest ? repository.pullRequest.unknown : ""}{/if}</span></li>{/each}{/if}
          <li>{@render check(14, true)}<span>{settings.developmentDeployments?.enabled ? "Early merges may happen on approved repository branches; remaining work stays open for review" : "In each repository, open one pull request into its base branch once every phase closes"}</span></li>
        {:else}
          {#if offer && catchUpTicked}<li>{@render check(14, true)}<span>Bring <span class="mono code">{settings.featureBranch}</span> up to date with <span class="mono code">{offer.repositories[0]!.base}</span>, as ticked above</span></li>{/if}
          <li>{@render check(14, true)}<span>Commit and push to <span class="mono code">{settings.featureBranch}</span></span></li>
          {#if settings.developmentDeployments?.enabled && pullRequest}<li>{@render check(14, true)}<span>{#if "number" in pullRequest}Use its open pull request into <span class="mono code">{settings.baseBranch}</span>, <a href={pullRequest.url}>#{pullRequest.number}</a>, for the work that stays open{:else}Use its open pull request into <span class="mono code">{settings.baseBranch}</span>, or open one, for the work that stays open. {pullRequest.unknown}{/if}</span></li>{/if}
          <li>{@render check(14, true)}<span>{#if settings.developmentDeployments?.enabled}Early merges may happen on approved repository branches; remaining work stays open for review{:else if pullRequest && "number" in pullRequest}Use its open pull request into <span class="mono code">{settings.baseBranch}</span>, <a href={pullRequest.url}>#{pullRequest.number}</a>, once every phase closes{:else if pullRequest}Use its open pull request into <span class="mono code">{settings.baseBranch}</span>, or open one, once every phase closes. {pullRequest.unknown}{:else}Open one pull request into <span class="mono code">{settings.baseBranch}</span> once every phase closes{/if}</span></li>
        {/if}
        <li><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#8c8577" stroke-width="2" stroke-linecap="round" aria-hidden="true" class="mark"><path d="M4 4l8 8M12 4l-8 8"></path></svg><span>{settings.developmentDeployments?.enabled ? "Early merges only into approved repository branches; no unrelated or destructive actions" : "Never merge, deploy, or touch other branches"}</span></li>
      </ul>
    </div>

    <div class="column end">
      <button type="button" class="start" class:ready={startNow.enabled && !pressing} disabled={!startNow.enabled || pressing} onclick={pressStart}>{startLabel}</button>
      {#if closedLine || startNow.note}<span class="help">{[closedLine, startNow.note].filter(Boolean).join(" ")}</span>{/if}
      {#if documents.startError}<span class="message">{documents.startError}</span>{:else if startReason}<span class="message">{startReason}</span>{/if}
    </div>
  </section>
</main>

{#snippet check(size: number, inline = false)}
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="#9cc49a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={inline ? "mark" : size === 16 ? "found-mark" : undefined}><path d="M3 8.5l3 3 7-7"></path></svg>
{/snippet}

{#snippet phase(row: { id: string; title: string; closed: boolean; repositories: string[] })}
  {@const here = startFrom?.startAt?.id === row.id}
  <li class="phase"><span class="circle mono" class:here>{row.id}</span>{#if here}<strong class="title">{row.title}</strong><span class="starts">Kiln starts here</span>{:else}<span class="title">{row.title}</span>{/if}{#if row.closed}<span class="closed">closed</span>{/if}{@render repositories(row.repositories)}</li>
{/snippet}

{#snippet branchField()}
  {#if existing && startFrom}
    <!-- Every name, available or not; an unavailable name's reason is the field's message (run restart "The branch list"). -->
    <select id="branch" class="mono" value={settings.featureBranch} disabled={branchFixed} onchange={(event) => save({ featureBranch: event.currentTarget.value })}>
      {#if !startFrom.branches.some((branch) => branch.name === settings.featureBranch)}<option value={settings.featureBranch}>{settings.featureBranch}</option>{/if}
      {#each startFrom.branches as branch (branch.name)}<option value={branch.name}>{branch.name}</option>{/each}
    </select>
  {:else}
    <input id="branch" type="text" class="mono" value={drafts.featureBranch ?? settings.featureBranch} disabled={branchFixed} oninput={(event) => typed("featureBranch", event.currentTarget.value)} onblur={() => committed("featureBranch")} />
  {/if}
{/snippet}

{#snippet repositories(names: string[])}
  {#if multi && names.length > 0}<span class="phase-repos mono">{names.join(" · ")}</span>{/if}
{/snippet}

<style>
  main { max-width: 1160px; margin: 0 auto; padding: 48px clamp(16px, 4vw, 32px) 96px; box-sizing: border-box; display: flex; flex-direction: column; gap: 32px; }
  .pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 999px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--line-stronger); color: var(--text); }
  .lead { font-size: 14px; color: var(--muted); }
  .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(460px, 100%), 1fr)); gap: 24px; align-items: start; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 28px; box-sizing: border-box; }
  .eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  .found { display: flex; flex-direction: column; gap: 6px; }
  .found-eyebrow { margin-bottom: 8px; }
  .found-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .found-list > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 0 14px; padding: 14px 0; border-top: 1px solid var(--line); }
  .found-mark { margin-top: 4px; }
  .item { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item.plan { gap: 10px; }
  .item-intro { display: flex; flex-direction: column; gap: 2px; }
  .item-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; }
  .item-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .file { font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .item-line { font-size: 14px; color: var(--muted); }
  .links { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .links li { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .link-target { font-size: 12.5px; color: var(--text); overflow-wrap: anywhere; }
  .link-from { font-size: 13px; color: var(--dim); overflow-wrap: anywhere; }
  .link-from .mono { font-size: 12.5px; }
  .phases { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .split { display: flex; flex-direction: column; gap: 8px; }
  .phase { display: flex; align-items: center; gap: 12px; }
  .circle { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 999px; border: 1px solid var(--line-stronger); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--muted); box-sizing: border-box; }
  .circle.dashed { border-style: dashed; color: var(--dim); }
  .title { font-size: 14.5px; color: var(--text); }
  .split-title { color: var(--muted); }
  .note { font-size: 12.5px; color: var(--dim); }
  .closed { font-size: 12.5px; color: var(--green); }
  .circle.here { border-color: var(--text); color: var(--text); }
  .starts { font-size: 12.5px; color: var(--amber); }
  .source-box { display: flex; flex-direction: column; gap: 4px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line-strong); font-size: 13.5px; color: var(--muted); }
  .source-box.closed-on { border-color: var(--amber-border); }
  .start-from { margin: 0; padding: 0; border: 0; min-width: 0; }
  .start-from legend { padding: 0; margin-bottom: 8px; }
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
  .choice { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; padding: 14px; border-radius: 12px; border: 1px solid var(--line-strong); cursor: pointer; }
  .choice.selected { padding: 13px; border: 2px solid var(--text); }
  .choice input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  .choice-text { display: flex; flex-direction: column; gap: 3px; }
  .choice-name { font-size: 14.5px; font-weight: 600; color: var(--text); }
  .phase-repos { margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--dim); text-align: right; }
  .checks .failed { display: inline-flex; align-items: center; gap: 6px; color: var(--amber); flex-basis: 100%; }
  .checks { display: flex; flex-wrap: wrap; gap: 6px 18px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
  .passed { display: inline-flex; align-items: center; gap: 6px; }
  .check-name { font-size: 12px; color: var(--text); }
  .settings { display: flex; flex-direction: column; gap: 20px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  label, .label, legend { font-size: 13px; font-weight: 500; color: var(--muted); }
  input[type="text"], select { height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field); color: var(--text); font-size: 13px; box-sizing: border-box; width: 100%; }
  select { padding: 0 10px; }
  select.model { font-family: var(--sans); font-size: 14px; }
  input:disabled, select:disabled { opacity: 0.6; }
  .help { font-size: 12.5px; font-weight: 400; color: var(--dim); line-height: 1.55; }
  .message { font-size: 12.5px; font-weight: 400; color: var(--amber); line-height: 1.55; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 16px; }
  .repos-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; }
  .repos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .repos li { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .repo { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
  .repo-name { font-size: 13px; font-weight: 400; color: var(--text); overflow-wrap: anywhere; }
  .repos select { height: 36px; padding: 0 8px; border-radius: 8px; }
  .row-message { grid-column: 1 / -1; }
  .sessions { padding-top: 2px; }
  .agent { min-height: 44px; display: flex; flex-direction: column; justify-content: center; font-size: 14.5px; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .effort { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  legend { padding: 0; margin-bottom: 8px; }
  .segments { display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 0; border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
  .segments button { min-height: 44px; padding: 0 6px; border: 0; background: transparent; color: var(--muted); font-family: var(--sans); font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .segments button.pressed { background: var(--text); color: var(--bg); font-weight: 600; }
  .segments button:disabled { cursor: not-allowed; opacity: 0.4; }
  .segments button.pressed:disabled { opacity: 0.6; }
  .awake { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; cursor: pointer; }
  .awake input, .refined input { width: 18px; height: 18px; margin: 2px 0 0; }
  .awake input { accent-color: var(--red); }
  .awake-text { display: flex; flex-direction: column; gap: 2px; }
  .awake-label { font-size: 14.5px; color: var(--text); font-weight: 400; }
  .fixed { margin: 0; padding-top: 16px; border-top: 1px solid var(--line); display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; font-size: 13.5px; }
  .fixed dt { color: var(--dim); }
  .fixed dd { margin: 0; color: var(--muted); }
  .before { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 24px 32px; align-items: start; }
  .wide { grid-column: 1 / -1; }
  .column { display: flex; flex-direction: column; gap: 10px; }
  .column.end { justify-content: flex-end; }
  .explain { font-size: 14px; color: var(--muted); line-height: 1.55; }
  .refined { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--amber-border); cursor: pointer; }
  .refined input { accent-color: var(--amber); }
  .refined span { font-size: 14.5px; color: var(--text); font-weight: 400; }
  .lets { font-size: 14px; font-weight: 600; color: var(--text); }
  .allowed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--muted); }
  .allowed li { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 0 10px; }
  .mark { margin-top: 4px; }
  .code { font-size: 12.5px; color: var(--text); }
  .nowrap { white-space: nowrap; }
  .start { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 24px; border-radius: 999px; font-family: var(--sans); font-size: 15.5px; font-weight: 600; box-sizing: border-box; background: transparent; color: var(--dim); border: 1px solid var(--line-strong); width: 100%; cursor: not-allowed; }
  .start.ready { background: var(--text); color: var(--bg); border-color: var(--text); cursor: pointer; }
</style>
