<script lang="ts">
  import BillingPanel from "../components/BillingPanel.svelte";
  // Needs you (docs/design/mockups/kiln-screen-needs-you-ended-with-message.html and
  // kiln-screen-needs-you-crashed.html): how the session ended, word for word (PRD AC-STOP-02),
  // the command that reopens it (AC-STOP-05) or a fresh-session prompt (AC-STOP-06), each check
  // with the fact behind it (AC-STOP-03), Check again (AC-STOP-07), and a link to the full
  // output (AC-WATCH-10). The stops nobody drew reuse this layout with UI-007's lines. Kiln
  // never gives a reason of its own (AC-STOP-04). It is the screen alone: no plan, settings or
  // account (UI-006). Each check's facts are one per line, each naming its repository for a
  // multi-repository PRD, with a fact for each applicable requirement (multi-repo AC-CHECK-02).
  // Where Kiln can pick the session back up, Resume and its optional note sit between how the
  // session ended and the steps, as docs/changes/kiln-usage-limit-recovery/mockups/
  // kiln-screen-needs-you-resume.html draws them (usage-limit recovery AC-RESUME-01 to 03).
  // A session stopped by a usage limit (kiln-screen-needs-you-usage-limit.html) says which limit
  // and when it resets, and Resume's card becomes the two ways to carry on, waiting for the reset
  // or switching accounts, with the account Kiln last read (AC-LIMIT-01 to 03); after Kiln's own
  // resume was refused again it says so (AC-AUTO-05). With no Resume, the limit and the account
  // stay and step 1's fresh session waits for the reset or another account (technical design, "Screens").
  // A selection stop precedes a new conversation: offer settings and sign-in repair instead
  // of session recovery (Codex support technical design, "Local API and snapshot changes").
  import DevelopmentDelivery from "../components/DevelopmentDelivery.svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Settings } from "../../../src/state/records.js";
  import CodexSessionFacts from "../components/CodexSessionFacts.svelte";
  import AccountPanel from "../components/AccountPanel.svelte";
  import ModelEffortEditor from "../components/ModelEffortEditor.svelte";
  import CodeText from "../components/CodeText.svelte";
  import CopyButton from "../components/CopyButton.svelte";
  import Icon from "../components/Icon.svelte";
  import LimitAccount from "../components/LimitAccount.svelte";
  import OutputRow from "../components/OutputRow.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import SwitchAccountCommand from "../components/SwitchAccountCommand.svelte";
  import { changeSettings, checkAgain, markComplete, refreshMetadata, resume } from "../lib/api.js";
  import type { ItemChange, MarkCompleteOffer } from "../../../src/engine/waivers.js";
  import { verdict } from "../lib/waivers.js";
  import CheckFacts from "../components/CheckFacts.svelte";
  import MarkComplete from "../components/MarkComplete.svelte";
  import { finalMessageHtml } from "../lib/markdown.js";
  import { activityInSentence, endingFact, needsYouCopy, PR_ID } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { outputTail } from "../lib/session-view.js";
  import { clockTime, earlier } from "../lib/time.js";
  import { atLimitLine, limitStopCopy } from "../lib/usage-limit.js";
  import { viewContext } from "../lib/view-context.js";
  import { carryOn, reopenCheckAgain, startAgain } from "../lib/api.js";
  import { caseHeadline } from "../lib/restart.js";
  import LaunchFound from "../components/LaunchFound.svelte";
  import StartAgainCard from "../components/StartAgainCard.svelte";
  import CarryOnCard from "../components/CarryOnCard.svelte";
  import CatchUpOffer from "../components/CatchUpOffer.svelte";
  import FreshTerminalCard from "../components/FreshTerminalCard.svelte";
  import NothingToCheck from "../components/NothingToCheck.svelte";

  let { snapshot, now }: { snapshot: Snapshot; now: number } = $props();
  const { config, router, connection } = viewContext();
  const stop = $derived(snapshot.needsYou!);
  const nowDate = $derived(new Date(now));
  const copy = $derived(needsYouCopy(stop, snapshot.settings, nowDate, snapshot.feature.multiRepository, snapshot.developmentDelivery?.authorization.enabled));
  const ending = $derived(endingFact(stop));
  const output = $derived(outputTail(stop.lastLines ?? []));
  const failure = $derived(stop.cleanupFailure ?? stop.failure);
  const accountAgent = $derived((stop.agent ?? snapshot.settings.agent) === "Codex" ? "Codex" : "Claude");
  // Worked out from the view's clock, so the countdown keeps counting while the screen is open (AC-LIMIT-01).
  const limitCopy = $derived(stop.limit ? limitStopCopy(stop.phaseId, stop.limit, stop.resumeOffered, nowDate, stop.agent ?? snapshot.settings.agent) : undefined);
  const atLimit = $derived(stop.limit ? atLimitLine(stop.limit, nowDate) : undefined);
  const file = $derived(snapshot.phases.find((phase) => phase.id === stop.phaseId)?.file);
  const outputLink = $derived(phasePath(config.base, stop.phaseId));
  const steps = $derived([...(copy.firstStep === "none" ? [] : ["first"]), "finish", "again"]);
  let showPrompt = $state(false);
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);
  let note = $state("");
  let resuming = $state(false);
  let resumeReason = $state<string | undefined>(undefined);
  // Mark complete sits below Check again, usable once a recheck still fails and shown unusable
  // before one (waivers AC-WAIVE-02); a pressed offer stays shown, reading Checking…, while its rerun runs (AC-WAIVE-06).
  let marking = $state(false);
  let markOffer = $state<Extract<MarkCompleteOffer, { offered: true }> | undefined>(undefined);
  let markChanges = $state<ItemChange[]>([]);
  let markError = $state<string | undefined>(undefined);
  const offer = $derived(stop.markComplete?.offered ? stop.markComplete : marking ? markOffer : undefined);
  // Before a recheck the button shows, unusable, saying to check again first.
  const waiting = $derived(!offer && stop.markComplete && !stop.markComplete.offered ? stop.markComplete.awaitingRecheck : undefined);
  const connected = $derived(connection ? connection.connected : true);
  // From a press of Resume, Check again or Mark complete until the session runs again or the
  // result is shown, none can be pressed (AC-RESUME-02, AC-WAIVE-06); a disconnected page submits nothing.
  const busy = $derived(pressing || resuming || marking || stop.checking === true || !connected);
  const VERDICT = { passed: "Yes", waived: "Waived", failed: "Not yet" } as const;
  // Until a check of the completion checks has run, the failing rows saved at the stop read Why Kiln stopped and any passing ones sit beneath (AC-STOPCHECK-01 to 03).
  const reasonRows = $derived(stop.rowsAreCompletionChecks ? stop.checks : stop.checks.filter(check => verdict(check) === "failed"));
  const alsoRows = $derived(stop.rowsAreCompletionChecks ? [] : stop.checks.filter(check => verdict(check) !== "failed"));
  const checkedText = $derived(stop.checking ? "Checking…" : stop.checkedAt ? `${stop.checkRun?.origin === "recheck" ? stop.checkRun.finished ? "Checked again" : "Checked" : "Checked when Kiln stopped,"} ${clockTime(stop.checkedAt, nowDate, { afterWord: true })}.` : "Not yet checked");
  const runsAll = $derived(!stop.rowsAreCompletionChecks && stop.recheckRunsAll ? `Check again runs all of ${activityInSentence(stop.phaseId, snapshot)}’s completion checks.` : undefined);
  // A stopped phase's case (run restart AC-CASE-01): its own headline, first card and way forward.
  const activity = $derived(`Phase ${stop.phaseId}`);
  const agentName = $derived(stop.agent ?? snapshot.settings.agent);
  const restart = $derived(stop.case ? caseHeadline(stop, activity, agentName) : undefined);
  let restartPending = $state<"carry" | "start" | "reopen" | undefined>(undefined);
  let restartReason = $state<string | undefined>(undefined);
  let carryDraft = $state("");
  // The catch-up offer covers every button here that starts or resumes the phase (AC-CURRENT-01).
  let catchUpTicked = $state(true);
  const bringUpToDate = $derived(!snapshot.liveControl && !!stop.catchUp && catchUpTicked);
  async function restartAction(action: "carry" | "start" | "reopen") {
    if (busy || restartPending) return;
    restartPending = action; restartReason = undefined;
    const answer = action === "carry" ? await carryOn(config, { ...(carryDraft.trim() ? { note: carryDraft } : {}), bringUpToDate }) : action === "start" ? await startAgain(config, bringUpToDate) : await reopenCheckAgain(config);
    restartPending = undefined;
    restartReason = answer.ok ? answer.outcome === "already_complete" ? `${activity} is already complete. Check it again to advance.` : undefined : answer.reason;
  }

  async function copyFreshPrompt() {
    showPrompt = true;
    await navigator.clipboard.writeText(stop.freshSessionPrompt);
  }

  async function pressResume() {
    resuming = true;
    if (connection) connection.notice = undefined;
    const answer = await resume(config, note, bringUpToDate);
    resuming = false;
    resumeReason = answer.ok ? undefined : answer.reason;
    if (answer.ok && answer.noteSkipped && connection) connection.notice = "Your reply was not sent: the work was already complete, so Kiln continued the plan.";
  }

  async function pressCheckAgain() {
    pressing = true;
    markChanges = []; markError = undefined;
    const answer = await checkAgain(config);
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
  async function pressMarkComplete() {
    const current = stop.markComplete;
    if (busy || !current?.offered) return;
    marking = true; markOffer = current; markChanges = []; markError = undefined;
    const answer = await markComplete(config, { checkRunId: current.checkRunId });
    marking = false; markOffer = undefined;
    if (!answer.ok) { markError = answer.reason; return; }
    if (answer.outcome === "check_results_changed") markChanges = (answer.changes as ItemChange[] | undefined) ?? [];
    else if (answer.outcome === "check_unavailable") markError = String(answer.reason ?? "The checks could not finish. Nothing was marked complete.");
  }
  async function saveSelection(change: Partial<Settings>) {
    const answer = await changeSettings(config, { ...change, agentId: snapshot.settings.agentId ?? "claude_code", selectionGeneration: snapshot.settings.selectionGeneration ?? 0 });
    reason = answer.ok ? undefined : answer.reason;
  }
  async function refreshSelection() {
    pressing = true;
    const answer = await refreshMetadata(config);
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main roomy">
  <StateHeader {snapshot} connected {now} />
  {#if stop.case && (restart || stop.launchFailure || stop.startAgain || stop.carryOn)}
  <div class="restart">
    <div class="headline">
      <h2>{restart?.headline ?? copy.headline}</h2>
      <p class="line">{restart?.line ?? copy.line}</p>
    </div>
    {#if stop.launchFailure}<LaunchFound failure={stop.launchFailure} now={nowDate} />{/if}
    {#if stop.catchUp && !snapshot.liveControl && (stop.startAgain || stop.carryOn)}<CatchUpOffer offer={stop.catchUp} where="stop" {activity} bind:ticked={catchUpTicked} disabled={busy || !!restartPending} />{/if}
    {#if stop.startAgain}
      <StartAgainCard {activity} work={stop.work} control={stop.startAgain} pending={restartPending === "start"} disabled={busy || !!restartPending} reason={restartReason} onpress={() => restartAction("start")} />
    {:else if stop.carryOn && stop.reopen}
      <div class="peer-choices">
        <CarryOnCard agent={agentName} {activity} work={stop.work} reopen={stop.reopen} control={stop.carryOn} bind:draft={carryDraft} pending={restartPending === "carry"} checking={restartPending === "reopen"} disabled={busy || !!restartPending} reason={restartReason} onpress={() => restartAction("carry")} oncheck={() => restartAction("reopen")} />
        <FreshTerminalCard agent={agentName} {activity} command={stop.freshSessionCommand} prompt={stop.freshSessionPrompt} held={false} />
      </div>
    {/if}
    {#if stop.nothingToCheck}
      <NothingToCheck {snapshot} {activity} pending={pressing} disabled={busy} warning={reason} onpress={pressCheckAgain} />
    {:else}
      <aside class="card side">
        <span class="eyebrow">{copy.sideHeading}</span>
        {@render checkRows(reasonRows)}
        {#if alsoRows.length}<span class="eyebrow">Also checked when Kiln stopped</span>{@render checkRows(alsoRows)}{/if}
        <div class="again">
          <button type="button" class="button solid wide" disabled={busy} onclick={pressCheckAgain}><Icon name="check-again" size={15} />Check {activity} again</button>
          <span class="checked">{checkedText}</span>
          {#if runsAll}<span class="checked">{runsAll}</span>{/if}
          {#if reason}<span class="reason">{reason}</span>{/if}
        </div>
        {#if offer}<MarkComplete {offer} pending={marking} disabled={busy} changes={markChanges} error={markError} onmark={pressMarkComplete} />{:else if waiting}<MarkComplete {waiting} />{/if}
      </aside>
    {/if}
  </div>
  {:else}
  <div class="columns-main">
    <div class="column-wide">
      <section class="card ended">
        <div class="headline">
          {#if limitCopy}
            <h2>{limitCopy.headline}</h2>
            {#if limitCopy.refusedAgain}<p class="line">{limitCopy.refusedAgain}</p>{/if}
            <p class="line">{limitCopy.reported} {#if limitCopy.reset}<strong>{limitCopy.reset}</strong>{/if}</p>
          {:else}
            <h2>{copy.headline}</h2>
            <p class="line">{copy.line}</p>
          {/if}
        </div>
        {#if failure}<p class="failure">{failure}</p>{/if}
        {#if copy.showFacts && ending}
          <div class="facts mono"><span>{ending}</span><span>{clockTime(stop.stoppedAt, nowDate)}</span>{#if stop.lastSkill}<span>last skill seen: {stop.lastSkill.name}, {earlier(stop.lastSkill.at, stop.stoppedAt)}</span>{/if}</div>
        {/if}
        {#if stop.finalMessage !== undefined && stop.kind !== "not_resumable"}
          <div class="message-block">
            <span class="eyebrow">Last message from {stop.agent ?? snapshot.settings.agent}</span>
            <div class="final">{@html finalMessageHtml(stop.finalMessage)}</div>
          </div>
        {:else if output.lines.length > 0}
          <div class="lines mono">{#each output.lines as line (line.line)}<OutputRow {line} now={nowDate} />{/each}</div>
          {#if output.hidden}<p class="excerpt-note">Excerpt shortened; full output is available below.</p>{/if}
        {/if}
        {#if stop.sessionId && stop.outputLineCount !== undefined && (stop.kind !== "billing" || stop.sessionStartedAt)}
          <a class="arrow-link" href={outputLink} onclick={(event) => routedClick(event, router, outputLink)}>Full session output · {stop.outputLineCount.toLocaleString("en-US")} {stop.outputLineCount === 1 ? "line" : "lines"}<Icon name="arrow" /></a>
        {/if}
      </section>

      <CodexSessionFacts facts={stop} />
      {#if stop.kind === "selection"}
        <section class="card">
          <h2 class="eyebrow">{snapshot.settings.agent} · Model and effort</h2>
          <ModelEffortEditor {snapshot} save={saveSelection} />
          <SwitchAccountCommand agentId={snapshot.settings.agentId} />
          <button type="button" class="button small" disabled={busy || snapshot.settings.metadataPending} onclick={refreshSelection}>Refresh agent information</button>
        </section>
        {#if snapshot.account}<AccountPanel account={snapshot.account} paused={false} notStarted {now} />{/if}
      {:else}
      {#if stop.resumeOffered && stop.catchUp && !snapshot.liveControl && !(stop.case && (restart || stop.launchFailure || stop.startAgain || stop.carryOn))}<CatchUpOffer offer={stop.catchUp} where="stop" {activity} bind:ticked={catchUpTicked} disabled={busy} />{/if}
      {#if stop.resumeOffered && stop.limit && limitCopy}
        <section class="card resume">
          <span class="eyebrow">Two ways to carry on</span>
          <ol>
            <li>
              <span class="number">1</span>
              <div class="step"><span class="step-title">{stop.limit.agentId === "codex" ? "Check Codex usage" : "Wait for the reset"}</span><p>{limitCopy.waitText}</p></div>
            </li>
            <li>
              <span class="number">2</span>
              <div class="step">
                <span class="step-title">Or switch to another {accountAgent} account now</span>
                <p>In another terminal, sign in with an account that has usage left, then press Resume. The session picks up on that account.</p>
                <SwitchAccountCommand agentId={snapshot.settings.agentId} />
              </div>
            </li>
          </ol>
          <LimitAccount limit={stop.limit} footnote={limitCopy.footnote} />
          <label class="note-field">
            <span class="note-label">Your reply to {accountAgent} <span class="optional">Optional</span></span>
            <textarea rows="3" placeholder={copy.notePlaceholder} maxlength={4000} bind:value={note}></textarea>
          </label>
          <p class="hint">Your reply goes to the same {accountAgent} session, with its full history. It continues unattended unless your reply calls for an answer before proceeding or it needs a material decision. For a longer conversation, open the session in your terminal below. Kiln checks completion first; if the work is already done, it continues without sending your reply.</p>
          <div class="actions">
            <!-- The amber line never holds Resume (AC-LIMIT-03). -->
            <button type="button" class="button solid" disabled={busy || snapshot.billing && !snapshot.billing.canLaunch} onclick={pressResume}><Icon name="play" size={15} />{note.trim() ? "Send and resume" : "Resume"}</button>
            {#if atLimit}<span class="at-limit">{atLimit}</span>{/if}
          </div>
          {#if resumeReason}<span class="reason">{resumeReason}</span>{/if}
        </section>
      {:else if stop.resumeOffered}
        <section class="card resume">
          <span class="eyebrow">Let Kiln carry on</span>
          <div class="resume-head">
            <span class="step-title">Reply and continue in Kiln</span>
            <p>{copy.resumeText}</p>
          </div>
          <label class="note-field">
            <span class="note-label">Your reply to {accountAgent} <span class="optional">Optional</span></span>
            <textarea rows="3" placeholder={copy.notePlaceholder} maxlength={4000} bind:value={note}></textarea>
          </label>
          <p class="hint">Your reply goes to the same {accountAgent} session, with its full history. It continues unattended unless your reply calls for an answer before proceeding or it needs a material decision. For a longer conversation, open the session in your terminal below. Kiln checks completion first; if the work is already done, it continues without sending your reply.</p>
          <div class="actions">
            <button type="button" class="button solid" disabled={busy || snapshot.billing && !snapshot.billing.canLaunch} onclick={pressResume}><Icon name="play" size={15} />{note.trim() ? "Send and resume" : "Resume"}</button>
            <span class="hint">Uses whichever {accountAgent} account is signed in now. Close the session first if you opened it in a terminal.</span>
          </div>
          {#if resumeReason}<span class="reason">{resumeReason}</span>{/if}
        </section>
      {/if}

      <section class="card pick">
        <span class="eyebrow">{stop.kind === "billing" ? "Continue this execution" : stop.resumeOffered ? "Or pick it up yourself" : "Pick it up yourself"}</span>
        <ol>
          {#each steps as step, index (step)}
            <li>
              <span class="number">{index + 1}</span>
              <div class="step">
                {#if step === "first" && copy.firstStep === "resume" && stop.resumeCommand}
                  <span class="step-title">Open the same {stop.agent ?? snapshot.settings.agent} session in a terminal</span>
                  <div class="block"><pre>{stop.resumeCommand}</pre><div class="actions"><CopyButton text={stop.resumeCommand} /><span class="hint">Full history, right where it stopped. Kiln stays out of it.</span></div></div>
                {:else if step === "first"}
                  <span class="step-title">Start a fresh {stop.agent ?? snapshot.settings.agent} session in the {snapshot.feature.multiRepository ? "workspace" : "worktree"}</span>
                  {#if stop.limit}<p>{stop.limit.agentId === "codex" ? "Check usage in Codex before starting, or switch accounts." : "Start it after the reset, or after switching accounts."}</p><SwitchAccountCommand agentId={snapshot.settings.agentId} />{/if}
                  <div class="block">
                    <pre>{stop.freshSessionCommand}</pre>
                    <pre class="prompt">{stop.freshSessionPrompt}</pre>
                    <div class="actions"><CopyButton text={stop.freshSessionPrompt} label="Copy prompt" /><span class="hint">Points the new session at {stop.phaseId === PR_ID ? snapshot.developmentDelivery?.authorization.enabled ? "the remaining delivery finalization work" : "the pull request" : file}.</span></div>
                  </div>
                {:else if step === "finish"}
                  <span class="step-title">{copy.finishTitle}</span>
                  <p><CodeText text={copy.finishText} /></p>
                {:else}
                  <span class="step-title">Come back and check again</span>
                  <p>{copy.checkAgainText}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
        {#if stop.limit && limitCopy && !stop.resumeOffered}
          <LimitAccount limit={stop.limit} footnote={limitCopy.footnote} />
          {#if atLimit}<span class="at-limit">{atLimit}</span>{/if}
        {/if}
        {#if copy.freshLink}
          <button type="button" class="fresh-link" onclick={copyFreshPrompt}>Session can’t be opened? <span>{showPrompt ? "Prompt copied" : "Copy a prompt for a fresh session instead"}</span></button>
          {#if showPrompt}<div class="block"><pre class="prompt">{stop.freshSessionPrompt}</pre><div class="actions"><CopyButton text={stop.freshSessionPrompt} label="Copy prompt" /></div></div>{/if}
        {/if}
      </section>
      {/if}
    </div>

    <div class="column-side">
      <aside class="card side">
        <span class="eyebrow">{copy.sideHeading}</span>
        {@render checkRows(reasonRows)}
        {#if alsoRows.length}<span class="eyebrow">Also checked when Kiln stopped</span>{@render checkRows(alsoRows)}{/if}
        <div class="again">
          <button type="button" class="button solid wide" disabled={busy} onclick={pressCheckAgain}><Icon name="check-again" size={15} />Check again</button>
          <span class="checked">{checkedText}</span>
          {#if runsAll}<span class="checked">{runsAll}</span>{/if}
          {#if reason}<span class="reason">{reason}</span>{/if}
        </div>
        {#if copy.footnote}<p class="footnote">{copy.footnote}</p>{/if}
        {#if offer}<MarkComplete {offer} pending={marking} disabled={busy} changes={markChanges} error={markError} onmark={pressMarkComplete} />{:else if waiting}<MarkComplete {waiting} />{/if}
      </aside>
    </div>
  </div>
  {/if}
  <DevelopmentDelivery {snapshot} {config} connected={connection?.connected ?? false} />
  <BillingPanel {snapshot} />
</main>

{#snippet checkRows(list: typeof stop.checks)}
  <ul class="checks">
    {#each list as check, index (index)}
      {@const state = verdict(check)}
      <li>
        <span class="mark" class:passed={state === "passed"} class:waived={state === "waived"}>{#if state === "passed"}<Icon name="check" size={11} strokeWidth={2.4} />{/if}</span>
        <span class="check"><span class="check-head">{check.name}<span class="verdict" class:passed={state === "passed"} class:waived={state === "waived"}>{VERDICT[state]}</span></span><CheckFacts {snapshot} {check} changes={markChanges} /></span>
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .restart { display: flex; flex-direction: column; gap: 20px; max-width: 1120px; }
  .peer-choices { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; }
  @media(max-width: 680px) { .peer-choices { grid-template-columns: 1fr; } }
  .ended { border-color: rgba(230, 180, 80, 0.5); gap: 18px; }
  .headline { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .line { margin: 0; font-size: 15.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .line strong { color: var(--text); font-weight: 600; }
  .failure { margin: 0; color: var(--amber); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
  .excerpt-note { margin: 0; color: var(--dim); font-size: 12.5px; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--dim); }
  .message-block { display: flex; flex-direction: column; gap: 10px; }
  /* The mockup's 72ch, as Inter's "0" measures it; with the bundled subset fonts `ch` falls back to 0.5em. */
  .final { font-size: 15px; color: var(--muted); line-height: 1.65; display: flex; flex-direction: column; gap: 10px; max-width: 45.4em; overflow-wrap: anywhere; }
  .final :global(p), .final :global(ul), .final :global(ol), .final :global(pre), .final :global(blockquote), .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { margin: 0; }
  .final :global(ul), .final :global(ol) { padding-left: 1.4em; }
  .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { font-size: 15px; font-weight: 600; color: var(--text); }
  .final :global(strong) { color: var(--text); font-weight: 600; }
  .final :global(code) { font-family: var(--mono); font-size: 0.88em; color: var(--text); }
  .final :global(pre) { white-space: pre-wrap; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .lines { font-size: 12.5px; line-height: 1.75; display: grid; grid-template-columns: minmax(70px, max-content) 66px minmax(0, 1fr); gap: 2px 12px; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .arrow-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--red); text-decoration: none; align-self: flex-start; }
  .resume { gap: 18px; }
  .resume-head { display: flex; flex-direction: column; gap: 8px; }
  .resume-head p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .note-field { display: flex; flex-direction: column; gap: 8px; }
  .note-label { font-size: 13.5px; color: var(--muted); }
  .optional { color: var(--dim); }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: var(--sans); font-size: 14.5px; line-height: 1.6; color: var(--text); background: var(--deep); border: 1px solid var(--line-stronger); border-radius: 12px; padding: 12px 14px; }
  textarea::placeholder { color: var(--dim); }
  .pick { gap: 18px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 26px; }
  ol > li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 0 16px; }
  .number { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line-stronger); display: inline-flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 20px; color: var(--text); box-sizing: border-box; }
  .step { display: flex; flex-direction: column; gap: 12px; padding-top: 5px; min-width: 0; }
  .step-title { font-size: 16px; font-weight: 600; color: var(--text); }
  .step p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .block { display: flex; flex-direction: column; gap: 10px; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; overflow-wrap: anywhere; }
  pre.prompt { font-size: 12.5px; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .hint { font-size: 13px; color: var(--dim); }
  .resume > p.hint { margin: 0; line-height: 1.6; }
  .at-limit { font-size: 13px; color: var(--amber); }
  .fresh-link { font: inherit; font-size: 13px; color: var(--dim); background: none; border: 0; padding: 0; cursor: pointer; text-align: left; align-self: flex-start; }
  .fresh-link span { color: var(--red); font-weight: 600; }
  .side { gap: 18px; }
  .checks { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .checks li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .mark { width: 20px; height: 20px; border-radius: 999px; border: 1px dashed rgba(230, 180, 80, 0.5); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; }
  .mark.passed { background: rgba(156, 196, 154, 0.09); border: 1px solid rgba(156, 196, 154, 0.45); color: var(--green); }
  .check { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .check-head { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; color: var(--text); }
  .verdict { font-size: 12px; color: var(--amber); }
  .verdict.passed { color: var(--green); }
  .verdict.waived { font-weight: 600; }
  .mark.waived { border: 1px solid var(--amber-border); }
  .again { display: flex; flex-direction: column; gap: 10px; }
  .checked { font-size: 12.5px; color: var(--dim); }
  .reason { font-size: 12.5px; color: var(--amber); }
  .footnote { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.6; text-wrap: pretty; }
</style>
