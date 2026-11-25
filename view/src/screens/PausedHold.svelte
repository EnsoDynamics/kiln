<script lang="ts">
  // The held screen for Pause now (Kiln Pause Now AC-PAUSE-03, 05, 06; technical design "The
  // Paused Page"; mockup frame 3). Below a planned-for-you card, in order of precedence: uncertain
  // messages to acknowledge; while pausing, the pausing panel only; when the conversation can't be
  // reopened, the carry-on and fresh-terminal cards; otherwise the activity's card with Resume and
  // the terminal command side by side. No checks, Check again or Mark complete here: when Resume
  // finds the work already complete, the existing recovery page takes over with its advance choice.
  import { sameRecoveryTarget } from "../../../src/engine/phase-recovery.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { pausedSentence } from "../../../src/live/pause-now.js";
  import { activityKeyKind } from "../../../src/state/activity-keys.js";
  import AttendedCard from "../components/AttendedCard.svelte";
  import BillingPanels from "../components/BillingPanels.svelte";
  import { activityAgent, billingHolds, shortAgentName } from "../lib/agents.js";
  import BusyStatus from "../components/BusyStatus.svelte";
  import CarryOnCard from "../components/CarryOnCard.svelte";
  import CopyButton from "../components/CopyButton.svelte";
  import DevelopmentDelivery from "../components/DevelopmentDelivery.svelte";
  import FreshTerminalCard from "../components/FreshTerminalCard.svelte";
  import LiveMessages from "../components/LiveMessages.svelte";
  import PhasePlan from "../components/PhasePlan.svelte";
  import PausePanel from "../components/PausePanel.svelte";
  import PhaseCircle from "../components/PhaseCircle.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { carryOn, reopenCheckAgain, resumePhase } from "../lib/api.js";
  import type { PhaseRecoveryPage } from "../lib/phase-recovery-page.js";
  import { capitalized, phaseName, rowAuditName, shortQuote } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, now, page }: { snapshot: Snapshot; now: number; page: PhaseRecoveryPage } = $props();
  const { config, router, connection } = viewContext();
  const stop = $derived(snapshot.needsYou!);
  const recovery = $derived(stop.phaseRecovery!);
  const live = $derived(snapshot.liveControl!);
  const pauseNow = $derived(live.pauseNow!);
  const id = $derived(pauseNow.activityKey);
  const name = $derived(phaseName(id, snapshot));
  // The carry-on and fresh-terminal cards keep today's labels ("Send reply & continue Phase 1"), as on the takeover page.
  const cardName = $derived(/^Phase /.test(live.label) ? live.label : live.label.charAt(0).toLowerCase() + live.label.slice(1));
  const row = $derived((snapshot.activities ?? snapshot.phases).find(one => one.id === id));
  const isAudit = $derived(activityKeyKind(id) === "audit");
  // The session that ran, else the activity's own agent; Resume launches on the activity's (Kiln Phase Model Tiers AC-AGENTS-04).
  const nextAgent = $derived(activityAgent(snapshot, stop.phaseId));
  const agent = $derived(stop.agent ?? nextAgent.agent);
  // A session that never got a response is replaced by a new one on the activity's agent, so the note and status name that agent.
  const noteAgent = $derived(shortAgentName(stop.newSession ? nextAgent.agent : agent));
  const resumeStatus = $derived(stop.newSession ? `Checking the work, then starting a new ${nextAgent.agent} session.` : `Checking the work, then reopening the ${agent} conversation.`);
  const connected = $derived(connection?.connected ?? false);
  const reviewing = $derived(!!stop.sessionId && !!live.reviewRequired?.length);
  const heldCarryOn = $derived(!!live.takeover?.history && !!stop.carryOn && !!stop.reopen);
  // Which of the precedence list applies (technical design "The Paused Page"), each replacing what follows it.
  const shown = $derived(reviewing ? "review" : pauseNow.phase === "pausing" ? "pausing" : heldCarryOn ? "carry" : "card");
  const busy = $derived(!!page.pending || !!stop.checking || !connected || !!live.reviewRequired?.length);
  const resumeBlocked = $derived(busy || billingHolds(snapshot, nextAgent.agentId));
  const eyebrow = $derived(isAudit ? `Paused partway · ${row && (row.kind === "delivery_audit" || row.kind === "test_audit") ? rowAuditName(row).sentence : name}` : `Paused partway · phase ${id} of ${snapshot.feature.phasesTotal}`);
  const circle = $derived(row?.kind === "delivery_audit" ? "DA" : row?.kind === "test_audit" ? "TA" : id);
  const terminalInUse = $derived(pauseNow.obstacle?.code === "terminal_in_use");
  const outputLink = $derived(phasePath(config.base, id));

  /** Resume {activity}: today's takeover hand-back, with the note as its reply when it has text (PAUSE-007). */
  async function resume() {
    if (resumeBlocked) return;
    const target = recovery.target;
    const state = page;
    state.pending = page.draft.trim() ? "reply" : "resume"; state.feedback = undefined;
    const answer = await resumePhase(config, target, page.draft.trim() ? page.draft : undefined);
    state.pending = undefined;
    if (!sameRecoveryTarget(connection?.snapshot?.needsYou?.phaseRecovery?.target, target)) return;
    if (!answer.ok) { state.feedback = answer.reason; state.unsent = !!state.draft; return; }
    if (answer.outcome === "already_complete") { state.choice = true; state.unsent = !!state.draft; }
    else if (answer.outcome === "resume_requested") state.feedback = "Resume requested. Kiln is checking launch readiness; reply delivery is not yet confirmed.";
  }

  /** The carry-on card's Send reply & continue and Check again (run restart AC-CARRY-06). */
  async function restartAction(action: "carry" | "reopen") {
    if (page.pending || !connected) return;
    const target = recovery.target;
    const state = page;
    state.pending = action; state.feedback = undefined;
    const answer = action === "carry" ? await carryOn(config, { ...(state.draft.trim() ? { note: state.draft } : {}), target: target.live ?? target }) : await reopenCheckAgain(config);
    state.pending = undefined;
    if (!sameRecoveryTarget(connection?.snapshot?.needsYou?.phaseRecovery?.target, target)) return;
    if (!answer.ok) { state.feedback = answer.reason; state.unsent = !!state.draft; return; }
    if (answer.outcome === "already_complete") { state.choice = true; state.unsent = !!state.draft; }
  }
</script>

<main class="page-main roomy paused-hold">
  <StateHeader {snapshot} {connected} {now} />
  {#if stop.attended !== undefined}<AttendedCard text={stop.attended} />{/if}
  {#if shown === "review"}
    <section class="card" aria-label="Messages to review">
      <LiveMessages sessionId={stop.sessionId!} {connected} view={live} review />
      <p>Review each uncertain message in the conversation before resuming {name}. Acknowledgement alone keeps the execution held.</p>
    </section>
  {:else if shown === "pausing"}
    <PausePanel {snapshot} {connected} />
  {:else if shown === "carry" && stop.carryOn && stop.reopen}
    <h2>How would you like to resolve this?</h2>
    <p>Exit {agent} first if it is open on this conversation. While it is, or while work the paused session started is still running, neither choice below is available, and Kiln says why.</p>
    <div class="peer-choices">
      <CarryOnCard {agent} activity={cardName} work={stop.work} reopen={stop.reopen} control={stop.carryOn} bind:draft={page.draft} pending={page.pending === "carry"} checking={page.pending === "reopen"} disabled={!connected || !!page.pending} reason={page.feedback} onpress={() => restartAction("carry")} oncheck={() => restartAction("reopen")} />
      <FreshTerminalCard agent={nextAgent.agent} activity={cardName} command={stop.freshSessionCommand} prompt={stop.freshSessionPrompt} held blocked={live.takeover?.carryOnObstacle} />
    </div>
  {:else}
    <section class="card paused-card" aria-label="Paused partway">
      <div class="name">
        <PhaseCircle id={circle} tone="next" />
        <div class="heading"><span class="eyebrow">{eyebrow}</span><h2>{row?.title ?? capitalized(name)}</h2></div>
      </div>
      <p>{pausedSentence(pauseNow)}{#if pauseNow.lastSaid}{" "}Last thing Claude said: <em>“{shortQuote(pauseNow.lastSaid)}”</em>{/if}</p>
      {#if pauseNow.obstacle && !terminalInUse}<p class="warning" role="status">{pauseNow.obstacle.reason}</p>{/if}
      <div class="columns">
        <section aria-label="Let Kiln carry on">
          <h3>Let Kiln carry on</h3>
          <p>{#if stop.newSession}Starts a new {nextAgent.agent} session on this activity’s model, since it never got a response.{:else}Picks up in the same conversation, where it stopped.{/if} Whenever you’re ready; nothing is waiting on you.</p>
          <label for="paused-note">Note for {noteAgent} <span class="optional">(optional)</span></label>
          <textarea id="paused-note" rows="3" maxlength="4000" placeholder={`Anything to tell ${noteAgent} before it carries on`} bind:value={page.draft}></textarea>
          {#if page.unsent && page.draft}<p class="warning">Your note has not been sent.</p>{/if}
          <div class="actions">
            <button type="button" class="button solid" class:busy={page.pending === "resume" || page.pending === "reply"} aria-busy={page.pending === "resume" || page.pending === "reply"} disabled={resumeBlocked} onclick={resume}>Resume {name}</button>
            {#if page.feedback}<p class="warning" role="status">{page.feedback}</p>{/if}
          </div>
          {#if page.pending === "resume" || page.pending === "reply"}<BusyStatus text={resumeStatus} />{/if}
        </section>
        <section aria-label="Or take it over yourself">
          <h3>Or take it over yourself</h3>
          <p>Open the same conversation in your terminal. Kiln waits while you work.</p>
          {#if stop.resumeCommand}<div class="command"><pre>{stop.resumeCommand}</pre><CopyButton text={stop.resumeCommand} label="Copy" compact /></div>{/if}
          {#if terminalInUse}<p>Claude is open on this conversation; exit it, then press Resume.</p>{/if}
          <p class="hint">When you’re done, exit Claude and press <strong>Resume</strong>. If you finished {name} there, Kiln sees that and offers to move on instead.</p>
          <p class="hint">Changed the plan? Ask Claude to record those decisions in the requirements before you exit. No special handoff phrase is needed.</p>
          <details><summary>Session won’t open? Start a fresh one</summary><pre>{stop.freshSessionCommand}</pre><CopyButton text={stop.freshSessionCommand} label="Copy terminal command" /><pre class="prompt">{stop.freshSessionPrompt}</pre><CopyButton text={stop.freshSessionPrompt} label="Copy fresh-session prompt" /></details>
        </section>
      </div>
    </section>
  {/if}
  {#if shown !== "pausing"}<PausePanel {snapshot} {connected} />{/if}
  <!-- The phase plan marks the activity Paused (AC-PAUSE-05; mockup frame 3). -->
  <PhasePlan {snapshot} {connected} {now} />
  {#if stop.sessionId}<a class="output" href={outputLink} onclick={event => routedClick(event, router, outputLink)}>Full session output{#if stop.outputLineCount !== undefined}{" "}· {stop.outputLineCount} lines{/if}</a>{/if}
  <BillingPanels {snapshot} {connected} />
  <DevelopmentDelivery {snapshot} {config} {connected} />
</main>

<style>
  .paused-hold { max-width: 1120px; margin: auto; display: flex; flex-direction: column; gap: 20px; }
  h2, h3 { margin: 0; line-height: 1.35; } h2 { font-size: 20px; } h3 { font-size: 16px; }
  p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 14px; }
  em { color: var(--text); }
  strong { color: var(--muted); }
  .paused-card { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .name { display: flex; align-items: center; gap: 14px; }
  .heading { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; border-top: 1px solid var(--line); padding-top: 22px; }
  .columns > section { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .columns > section + section { border-left: 1px solid var(--line); padding-left: 32px; }
  label { font-size: 13px; color: var(--dim); } .optional { color: var(--dim); }
  textarea { width: 100%; box-sizing: border-box; background: var(--deep); color: var(--text); font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; resize: vertical; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .button { white-space: normal; } .button:disabled { opacity: .45; }
  .command { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 14px; border-radius: 10px; background: var(--deep); border: 1px solid var(--line); }
  .command pre { flex: 1 1 auto; min-width: 0; padding: 0; border: 0; background: none; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12.5px/1.6 var(--mono); padding: 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; margin: 0; color: var(--text); }
  .hint { font-size: 13.5px; color: var(--dim); }
  details { font-size: 13.5px; color: var(--muted); } summary { cursor: pointer; } details pre { margin: 12px 0; } pre.prompt { max-height: 22em; overflow-y: auto; }
  .peer-choices { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; }
  .warning { color: var(--amber); }
  .output { align-self: flex-start; }
  @media(max-width: 680px) { .columns, .peer-choices { grid-template-columns: 1fr; } .columns > section + section { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 22px; } }
</style>
