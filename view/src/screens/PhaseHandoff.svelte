<script lang="ts">
  import { tick } from "svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { sameRecoveryTarget } from "../../../src/engine/phase-recovery.js";
  import type { PhaseRecoveryPage } from "../lib/phase-recovery-page.js";
  import { markComplete, resumePhase, verifyPhase } from "../lib/api.js";
  import type { ItemChange } from "../../../src/engine/waivers.js";
  import { checksWord, countsOf, passedOf, secondsTime, verdict } from "../lib/waivers.js";
  import CheckFacts from "../components/CheckFacts.svelte";
  import MarkComplete from "../components/MarkComplete.svelte";
  import { viewContext } from "../lib/view-context.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { endingFact } from "../lib/progress.js";
  import { clockTime, earlier } from "../lib/time.js";
  import { finalMessageHtml } from "../lib/markdown.js";
  import { atLimitLine, limitStopCopy } from "../lib/usage-limit.js";
  import LiveMessages from "../components/LiveMessages.svelte";
  import PausePanel from "../components/PausePanel.svelte";
  import BillingPanel from "../components/BillingPanel.svelte";
  import CodexSessionFacts from "../components/CodexSessionFacts.svelte";
  import CopyButton from "../components/CopyButton.svelte";
  import DevelopmentDelivery from "../components/DevelopmentDelivery.svelte";
  import LimitAccount from "../components/LimitAccount.svelte";
  import OutputRow from "../components/OutputRow.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import SwitchAccountCommand from "../components/SwitchAccountCommand.svelte";

  let { snapshot, now, page }: { snapshot: Snapshot; now: number; page: PhaseRecoveryPage } = $props();
  const { config, router, connection } = viewContext();
  const stop = $derived(snapshot.needsYou!);
  const recovery = $derived(stop.phaseRecovery!);
  const activity = $derived(snapshot.liveControl?.label ?? `Phase ${stop.phaseId}`);
  // Mid-sentence the activity reads as the mockup writes it: "Phase 3" keeps its capital, "delivery audit" and "final delivery" do not.
  const inSentence = $derived(/^Phase /.test(activity) ? activity : activity.charAt(0).toLowerCase() + activity.slice(1));
  const pendingTakeover = $derived(snapshot.liveControl?.takeover?.state === "pending");
  const savedUnsent = $derived(snapshot.unsentReplies ?? []);
  const agent = $derived(stop.agent ?? snapshot.settings.agent);
  const connected = $derived(connection?.connected ?? false);
  const busy = $derived(!!page.pending || !!stop.checking || !connected || pendingTakeover || !!snapshot.liveControl?.reviewRequired?.length);
  const resumeBlocked = $derived(busy || !!snapshot.billing && !snapshot.billing.canLaunch);
  const nowDate = $derived(new Date(now));
  const outputLink = $derived(phasePath(config.base, stop.phaseId));
  const ending = $derived(endingFact(stop));
  const limit = $derived(stop.limit ? limitStopCopy(stop.phaseId, stop.limit, stop.resumeOffered, nowDate, agent) : undefined);
  // Checking has its own section (AC-NEXT-02): when the checks ran, how many fail after a recheck,
  // and Mark complete, usable once a recheck still fails and shown unusable before one (AC-WAIVE-02). A pressed offer stays shown,
  // reading Checking…, while its rerun runs (AC-WAIVE-06).
  const counts = $derived(stop.counts ?? countsOf(stop.checks));
  const rechecked = $derived(stop.checkRun ? stop.checkRun.origin === "recheck" && stop.checkRun.finished : !!page.rechecked);
  // A recheck that could not finish keeps the earlier rows and their time, so it never reads Checked again.
  const checkedLine = $derived(`${stop.checkedAt ? rechecked ? `Checked again ${secondsTime(stop.checkedAt)}` : stop.checkRun?.origin === "recheck" ? `Checked ${secondsTime(stop.checkedAt)}` : `Checked when Kiln stopped, ${secondsTime(stop.checkedAt)}` : "Not yet checked"} · ${passedOf(counts)}`);
  const stillFailing = $derived(rechecked && counts.failed > 0 && !page.markChanges?.length && !stop.checking && !page.pending);
  const offer = $derived(stop.markComplete?.offered ? stop.markComplete : page.pending === "mark" ? page.markOffer : undefined);
  // Before a recheck the button shows, unusable, saying to check again first.
  const waiting = $derived(!offer && stop.markComplete && !stop.markComplete.offered ? stop.markComplete.awaitingRecheck : undefined);
  const VERDICT = { passed: "Passed", waived: "Waived", failed: "Not yet" } as const;
  let choiceHeading: HTMLHeadingElement | undefined = $state();
  let replyField: HTMLTextAreaElement | undefined = $state();
  let resumeButton: HTMLButtonElement | undefined = $state();
  let lastAction: "reply" | "resume" = $state("resume");

  async function act(action: "reply" | "resume" | "verify" | "advance") {
    if (busy || (action === "reply" || action === "resume") && resumeBlocked) return;
    const target = recovery.target;
    const state = page;
    state.pending = action;
    state.feedback = undefined;
    if (action === "reply" || action === "resume") lastAction = action;
    if (action === "verify") { state.markChanges = undefined; state.markError = undefined; }
    const answer = action === "reply" || action === "resume"
      ? await resumePhase(config, target, action === "reply" ? state.draft : undefined)
      : await verifyPhase(config, target, action);
    state.pending = undefined;
    if (answer.ok && answer.outcome === "advanced" && connection && connection.snapshot?.billing?.executionId === target.executionId) {
      return;
    }
    // An old response cannot put a choice or draft onto another stopped session.
    if (!sameRecoveryTarget(connection?.snapshot?.needsYou?.phaseRecovery?.target, target)) return;
    if (!answer.ok) { state.feedback = answer.reason; state.unsent = !!state.draft; return; }
    if (answer.outcome === "already_complete") {
      state.choice = true;
      state.unsent = !!state.draft;
      await tick(); choiceHeading?.focus();
    } else if (answer.outcome === "still_stopped") {
      state.choice = false;
      state.rechecked = true;
    } else if (answer.outcome === "resume_requested") {
      state.feedback = "Resume requested. Kiln is checking launch readiness; reply delivery is not yet confirmed.";
    }
  }

  /** Mark complete (AC-WAIVE-03, AC-WAIVE-04): one click, on the check run it was offered on. */
  async function mark() {
    const current = stop.markComplete;
    if (busy || !current?.offered) return;
    const target = recovery.target;
    const state = page;
    state.pending = "mark"; state.markOffer = current;
    state.markChanges = undefined; state.markError = undefined; state.feedback = undefined;
    const answer = await markComplete(config, { checkRunId: current.checkRunId, ...(target.live ? { target: target.live } : {}), ...(savedUnsent.length ? { withoutSendingReply: true as const } : {}) });
    state.pending = undefined; state.markOffer = undefined;
    if (!sameRecoveryTarget(connection?.snapshot?.needsYou?.phaseRecovery?.target, target)) return;
    if (!answer.ok) { state.markError = answer.reason; return; }
    if (answer.outcome === "check_results_changed") state.markChanges = (answer.changes as ItemChange[] | undefined) ?? [];
    else if (answer.outcome === "check_unavailable") state.markError = String(answer.reason ?? "The checks could not finish. Nothing was marked complete.");
  }

  async function back() {
    page.choice = false; page.unsent = !!page.draft;
    await tick();
    if (lastAction === "reply") replyField?.focus(); else resumeButton?.focus();
  }
</script>

<main class="page-main roomy handoff">
  <StateHeader {snapshot} {connected} {now} />
  <h1>{snapshot.liveControl?.takeover && snapshot.liveControl.takeover.kind !== "delivery_recovery" ? pendingTakeover ? "Pausing for takeover — finishing the current operation." : "Paused for terminal takeover." : `${activity} needs your input.`}</h1>
  <p>Answer here, or talk it through in your terminal.</p>
  <section class="card message" aria-label="Stopped session">
    {#if stop.finalMessage !== undefined}
      <span class="eyebrow">Last message from {agent}</span>
      <div class="final">{@html finalMessageHtml(stop.finalMessage)}</div>
    {:else if stop.lastLines?.length}
      <span class="eyebrow">Last output from {agent}</span>
      <div class="lines mono">{#each stop.lastLines as line (line.line)}<OutputRow {line} now={nowDate} />{/each}</div>
    {:else}<p>No final message was recorded. Review the session facts and recovery evidence below.</p>{/if}
    <div class="facts mono">{agent} · {ending ?? "Session ended"} · {clockTime(stop.stoppedAt, nowDate)}{#if stop.lastSkill} · last skill: {stop.lastSkill.name}, {earlier(stop.lastSkill.at, stop.stoppedAt)}{/if}</div>
    {#if stop.spawnError}<p class="warning">{stop.spawnError.message}</p>{/if}
    {#if stop.sessionId}<a href={outputLink} onclick={event => routedClick(event, router, outputLink)}>Full session output{#if stop.outputLineCount !== undefined} · {stop.outputLineCount} lines{/if}</a>{/if}
  </section>
  <CodexSessionFacts facts={stop} />
  {#if stop.limit && limit}
    <section class="card">
      <p>{limit.reported} {limit.reset ?? ""}</p>
      {#if limit.refusedAgain}<p>{limit.refusedAgain}</p>{/if}
      <p>{limit.waitText}</p>
      <SwitchAccountCommand agentId={stop.agentId} />
      <LimitAccount limit={stop.limit} footnote={limit.footnote} />
      <p>{atLimitLine(stop.limit, nowDate) ?? ""}</p>
    </section>
  {/if}
  {#if savedUnsent.length}
    <section class="card" aria-label="Preserved unsent replies">
      <h2>Replies that were not sent</h2>
      <p>These replies were preserved because {inSentence} was already complete. Advancing will leave them unsent.</p>
      {#each savedUnsent as reply (reply.id)}<pre>{reply.text}</pre>{/each}
      {#if !page.choice}<button class="button solid" disabled={busy} onclick={() => act("advance")}>Verify and advance without sending replies</button>{/if}
    </section>
  {/if}
  {#if (pendingTakeover || page.choice) && stop.sessionId && snapshot.liveControl}<LiveMessages sessionId={stop.sessionId} {connected} view={snapshot.liveControl} />{/if}
  {#if snapshot.liveControl?.takeover}<PausePanel {snapshot} {connected} />{/if}
  {#if pendingTakeover}<section class="card"><h2>Wait before opening Claude</h2><p>{snapshot.liveControl?.takeover?.reason}</p><p>Keep viewing the latest output. Kiln will not force the operation to stop.</p>{#if snapshot.liveControl?.takeover?.reason.includes("conversation is missing")}<h3>Saved conversation recovery</h3><p>The original conversation cannot be resumed. After resolving release and ownership checks, use this fresh-session guidance.</p><pre>{stop.freshSessionCommand}</pre><pre>{stop.freshSessionPrompt}</pre>{/if}</section>
  {:else if page.choice}
    <section class="card choice" aria-live="polite">
      <h2 tabindex="-1" bind:this={choiceHeading}>{activity} is already complete.</h2>
      <p>The completion checks passed. No conversation was resumed and the plan has not advanced. Advancing checks the evidence again.</p>
      {#if page.draft}<p class="warning">Your reply has not been sent. It is preserved when you return. Advancing proceeds without sending it.</p>{/if}
      <div class="actions">
        <button class="button solid" disabled={busy} onclick={() => act("advance")}>{page.pending === "advance" ? "Checking…" : (page.draft || savedUnsent.length) ? "Advance without sending reply" : "Advance to the next step"}</button>
        <button class="button" disabled={busy} onclick={back}>Back to recovery page</button>
      </div>
    </section>
  {:else}
    <h2>How would you like to resolve this?</h2>
    <div class="peer-choices">
      <section class="card">
        {#if stop.resumeOffered}
          <h2>Reply here and let Kiln finish</h2>
          <p>For a straightforward answer. Your reply goes to the same {agent} conversation, and Kiln resumes {inSentence}.</p>
          <label for="phase-reply">Your reply to {agent}</label>
          <textarea id="phase-reply" bind:this={replyField} bind:value={page.draft} rows="4" maxlength="4000" placeholder="Your answer or instructions for the remaining work"></textarea>
          {#if page.unsent && page.draft}<p class="warning">Your reply has not been sent.</p>{/if}
          <button class="button solid" disabled={resumeBlocked || !page.draft.trim()} onclick={() => act("reply")}>Send reply &amp; resume {inSentence}</button>
          <p class="hint">Kiln handles the remaining work, then follows the plan. Routine work continues unattended; an explicit hold or material decision can return control to you.</p>
        {:else}
          <h2>Conversation recovery unavailable</h2>
          <p>{stop.resumeError ?? "Kiln cannot safely resume this saved conversation. Review the recovery evidence and use the terminal instructions."}</p>
        {/if}
      </section>
      <section class="card">
        {#if stop.resumeCommand}
          <h2>Talk it through in your terminal</h2>
          <p>For a back-and-forth with {agent}. The full conversation comes with you.</p>
          <pre>{stop.resumeCommand}</pre><CopyButton text={stop.resumeCommand} label="Copy resume command" />
        {:else}
          <h2>Start a fresh session in your terminal</h2>
          <p>The saved conversation cannot be opened. Start {agent} in the recorded workspace and supply the recovery prompt.</p>
          <pre>{stop.freshSessionCommand}</pre><CopyButton text={stop.freshSessionCommand} label="Copy terminal command" />
        {/if}
        <details><summary>{stop.resumeCommand ? "Session cannot be opened? Use a fresh session" : "Fresh-session recovery prompt"}</summary><pre>{stop.freshSessionPrompt}</pre><CopyButton text={stop.freshSessionPrompt} label="Copy fresh-session prompt" /></details>
        <p class="hint"><strong>Changed the plan?</strong> Ask {agent} to record those decisions in the requirements before you exit. No special handoff phrase is needed.</p>
        {#if stop.resumeOffered}
          <p>Got it back on track? Exit {agent}, then:</p>
          <button bind:this={resumeButton} class="button solid" disabled={resumeBlocked} onclick={() => act("resume")}>Have Kiln resume {inSentence}</button>
          <p class="hint">Kiln picks up the same conversation, including your terminal discussion, and finishes {inSentence}.</p>
        {:else}<p>Resume is unavailable. Use the terminal recovery instructions to finish {inSentence}, then check it again below.</p>{/if}
      </section>
    </div>
    {#if stop.sessionId && snapshot.liveControl}
      <section class="card" aria-label="Messages to review">
        <LiveMessages sessionId={stop.sessionId} {connected} view={snapshot.liveControl} review />
        {#if snapshot.liveControl.reviewRequired?.length}<p>Review each uncertain message in the conversation before resuming, checking again or marking {inSentence} complete. Acknowledgement alone keeps the execution held.</p>{/if}
      </section>
    {/if}
    <section class="card return" aria-label={`Is ${inSentence} already done?`}>
      <div class="between"><h2>Is {inSentence} already done?</h2><span class="hint" role="status">{checkedLine}</span></div>
      <p>If you finished it yourself, or think Kiln got it wrong, check again. If every check passes, Kiln closes out {inSentence} and moves to the next step. Nothing is committed or pushed for you.</p>
      <ul class="checks" aria-label={`${activity} completion requirements`} aria-busy={!!stop.checking}>
        {#each stop.checks as check, index (index)}
          {@const state = verdict(check)}
          <li><div><strong>{check.name}</strong><span class={state}>{VERDICT[state]}</span></div><CheckFacts {snapshot} {check} changes={page.markChanges} /></li>
        {/each}
      </ul>
      <div class="actions"><button class="button" disabled={busy} onclick={() => act("verify")}>{page.pending === "verify" ? "Checking…" : `Check ${inSentence} again`}</button></div>
      {#if recovery.checkError}<p class="warning" role="alert">Could not refresh: {recovery.checkError.reason} Earlier results keep their previous check time. Nothing advanced; check {inSentence} again to retry.</p>{/if}
      {#if stillFailing}<p class="feedback" role="status"><strong>{activity} still has {checksWord(counts.failed).replace("check", "failing check")}.</strong>{#if stop.resumeOffered} If the work isn’t finished, have Kiln resume it above.{/if}</p>{/if}
      {#if offer}<MarkComplete {offer} pending={page.pending === "mark"} disabled={busy} changes={page.markChanges} error={page.markError} onmark={mark} />{:else if waiting}<MarkComplete {waiting} />{/if}
    </section>
  {/if}
  {#if page.feedback}<p class="warning" role="status">{page.feedback}</p>{/if}
  <BillingPanel {snapshot} {connected} />
  <DevelopmentDelivery {snapshot} {config} {connected} />
</main>

<style>
  .handoff { max-width: 1120px; margin: auto; display: flex; flex-direction: column; gap: 20px; }
  h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 4vw, 40px); margin: 0; }
  h2, h3 { margin: 0; line-height: 1.35; } h2 { font-size: 20px; } h3 { font-size: 16px; }
  p { margin: 0; color: var(--muted); line-height: 1.6; }
  .message { border-left: 3px solid var(--amber); }
  .facts, .hint { font-size: 12.5px; color: var(--dim); }
  .peer-choices { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; }
  .card, .peer-choices > section { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .between { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; }
  .feedback { font-size: 13px; border-left: 3px solid var(--amber); padding: 8px 12px; background: var(--deep); }
  .feedback strong { color: var(--text); }
  textarea { width: 100%; box-sizing: border-box; background: var(--deep); color: var(--text); font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 12px; resize: vertical; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--mono); padding: 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; margin: 0; }
  .final { overflow-wrap: anywhere; line-height: 1.65; }
  .final :global(pre) { white-space: pre-wrap; } .final :global(p:first-child) { margin-top: 0; }
  .checks { list-style: none; padding: 0; margin: 0; }
  .checks li { padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .checks li > div { display: flex; justify-content: space-between; gap: 12px; }
  .checks :global(p) { font-size: 12px; overflow-wrap: anywhere; }
  .checks li > div > span { color: var(--amber); white-space: nowrap; }
  .checks li > div > .passed { color: var(--green); } .checks li > div > .waived { font-weight: 600; } .warning { color: var(--amber); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .button { white-space: normal; align-self: flex-start; } .button:disabled { opacity: .45; }
  .lines { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); gap: 4px 10px; overflow-wrap: anywhere; font-size: 12px; }
  summary { cursor: pointer; } details pre { margin: 12px 0; }
  @media(max-width: 680px) { .peer-choices { grid-template-columns: 1fr; } }
</style>
