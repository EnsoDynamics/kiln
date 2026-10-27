<script lang="ts">
  import { tick } from "svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { sameRecoveryTarget } from "../../../src/engine/phase-recovery.js";
  import type { PhaseRecoveryPage } from "../lib/phase-recovery-page.js";
  import { confirmOutside, resumePhase, verifyPhase } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { endingFact } from "../lib/progress.js";
  import { clockTime, earlier } from "../lib/time.js";
  import { finalMessageHtml } from "../lib/markdown.js";
  import { atLimitLine, limitStopCopy } from "../lib/usage-limit.js";
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
  const pendingTakeover = $derived(snapshot.liveControl?.takeover?.state === "pending");
  const savedUnsent = $derived(snapshot.unsentReplies ?? []);
  const agent = $derived(stop.agent ?? snapshot.settings.agent);
  const connected = $derived(connection?.connected ?? false);
  const busy = $derived(!!page.pending || !!stop.checking || !connected || pendingTakeover);
  const resumeBlocked = $derived(busy || !!snapshot.billing && !snapshot.billing.canLaunch);
  const nowDate = $derived(new Date(now));
  const outputLink = $derived(phasePath(config.base, stop.phaseId));
  const ending = $derived(endingFact(stop));
  const limit = $derived(stop.limit ? limitStopCopy(stop.phaseId, stop.limit, stop.resumeOffered, nowDate, agent) : undefined);
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
    const answer = action === "reply" || action === "resume"
      ? await resumePhase(config, target, action === "reply" ? state.draft : undefined)
      : await verifyPhase(config, target, action);
    state.pending = undefined;
    if (answer.ok && answer.outcome === "advanced" && connection && connection.snapshot?.billing?.executionId === target.executionId) {
      connection.notice = `${activity} verified and accepted. Kiln follows the plan and any requested pause.`;
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
      state.feedback = `${activity} is still unfinished. Finish it in your terminal, or resume it in Kiln.`;
    } else if (answer.outcome === "resume_requested") {
      state.feedback = "Resume requested. Kiln is checking launch readiness; reply delivery is not yet confirmed.";
    }
  }

  async function back() {
    page.choice = false; page.unsent = !!page.draft;
    await tick();
    if (lastAction === "reply") replyField?.focus(); else resumeButton?.focus();
  }
  async function confirmation(event: Event) {
    if (busy) return;
    const answer = await confirmOutside(config, (event.currentTarget as HTMLInputElement).checked);
    page.feedback = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main roomy handoff">
  <StateHeader {snapshot} {connected} {now} />
  <h1>{snapshot.liveControl?.takeover ? pendingTakeover ? "Pausing for takeover — finishing the current operation." : "Paused for terminal takeover." : `${activity} needs your input.`}</h1>
  <p>Resolve it here or in your terminal. Then choose who finishes the phase.</p>
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
  <BillingPanel {snapshot} {connected} />
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
      <p>These replies were preserved because the phase was already complete. Advancing will leave them unsent.</p>
      {#each savedUnsent as reply (reply.id)}<pre>{reply.text}</pre>{/each}
      {#if !page.choice}<button class="button solid" disabled={busy} onclick={() => act("advance")}>Verify and advance without sending replies</button>{/if}
    </section>
  {/if}
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
          <p>For a straightforward answer. Your reply goes to the same {agent} conversation, and Kiln resumes {activity}.</p>
          <label for="phase-reply">Your reply to {agent}</label>
          <textarea id="phase-reply" bind:this={replyField} bind:value={page.draft} rows="4" maxlength="4000" placeholder="Your answer or instructions for the remaining work"></textarea>
          {#if page.unsent && page.draft}<p class="warning">Your reply has not been sent.</p>{/if}
          <button class="button solid" disabled={resumeBlocked || !page.draft.trim()} onclick={() => act("reply")}>Send reply &amp; resume {activity}</button>
          <p class="hint">Kiln handles the remaining work, then follows the plan. Routine work continues unattended; an explicit hold or material decision can return control to you.</p>
        {:else}
          <h2>Conversation recovery unavailable</h2>
          <p>{stop.resumeError ?? "Kiln cannot safely resume this saved conversation. Review the recovery evidence and use the terminal instructions."}</p>
        {/if}
      </section>
      <section class="card">
        {#if stop.resumeCommand}
          <h2>Open the conversation in your terminal</h2>
          <p>For a back-and-forth with {agent}, or to finish the activity yourself. The full conversation comes with you.</p>
          <pre>{stop.resumeCommand}</pre><CopyButton text={stop.resumeCommand} label="Copy resume command" />
          {#if stop.resumePrompt}<p>Send this recovery prompt before continuing. It supplies the current authority and remaining task.</p><pre>{stop.resumePrompt}</pre><CopyButton text={stop.resumePrompt} label="Copy recovery prompt" />{/if}
        {:else}
          <h2>Start a fresh session in your terminal</h2>
          <p>The saved conversation cannot be opened. Start {agent} in the recorded workspace and supply the recovery prompt.</p>
          <pre>{stop.freshSessionCommand}</pre><CopyButton text={stop.freshSessionCommand} label="Copy terminal command" />
        {/if}
        {#if stop.outside?.prompt && !stop.resumePrompt}<p>Recover the work outside the workspace:</p><pre>{stop.outside.prompt}</pre><CopyButton text={stop.outside.prompt} label="Copy workspace recovery prompt" />{/if}
        <details><summary>{stop.resumeCommand ? "Session cannot be opened? Use a fresh session" : "Fresh-session recovery prompt"}</summary><pre>{stop.freshSessionPrompt}</pre><CopyButton text={stop.freshSessionPrompt} label="Copy fresh-session prompt" /></details>
        <p class="hint"><strong>Changed the plan?</strong> Ask {agent} to record those decisions in the requirements before you exit. No special handoff phrase is needed.</p>
        <p>When you’re done, exit {agent} and use <strong>Back from your terminal?</strong> below.</p>
      </section>
    </div>
    <section class="card return">
      <h2>Back from your terminal?</h2>
      <p>Exit the {agent} session first. Choose based on how much work you finished.</p>
      <div class="peer-choices">
        <section>
          <h3>We resolved the question. Kiln can finish.</h3>
          {#if stop.resumeOffered}
            <p>Pick up the same conversation, including your terminal discussion, and finish the remaining work in {activity}. You don’t need to repeat your answer.</p>
            <button bind:this={resumeButton} class="button solid" disabled={resumeBlocked} onclick={() => act("resume")}>Resume {activity} in Kiln</button>
            <p class="hint">The phase can still be open, with uncommitted or unpushed work. Kiln finishes this phase before following the rest of the plan.</p>
          {:else}<p>Resume is unavailable. Use the terminal recovery instructions to finish the phase, then verify it.</p>{/if}
        </section>
        <section class="finished">
          <h3>I finished the entire activity myself.</h3>
          <p>Check that {activity} is complete, then move to the next step in the plan.</p>
          <p class="hint" role="status">{stop.checkedAt ? `Checked ${new Date(stop.checkedAt).toLocaleString()}` : "Not yet checked"} · {stop.checks.filter(check => check.passed).length} of {stop.checks.length} requirements passed. Results are from that check.</p>
          <ul class="checks" aria-label="Phase completion requirements" aria-busy={!!stop.checking}>
            {#each stop.checks as check (check.name)}
              <li><div><strong>{check.name}</strong><span class:passed={check.passed}>{check.passed ? "Passed" : "Not yet"}</span></div>{#each check.facts as fact, index (index)}<p>{fact}</p>{/each}</li>
            {/each}
          </ul>
          {#if stop.outside?.changes.length}<p class="hint">Kiln changed nothing in those checkouts, since they may hold other work too.</p>{/if}
          {#if stop.outside?.confirmation.offered}
            <label class="confirmation"><input type="checkbox" disabled={busy} checked={stop.outside.confirmation.ticked} onchange={confirmation} />The changes outside the workspace have been dealt with</label>
            <p class="hint">Covers changes recorded up to this confirmation. Later changes must be checked again.</p>
          {/if}
          <button class="button" disabled={busy} onclick={() => act("verify")}>{page.pending === "verify" ? "Checking…" : `Verify ${activity} & advance`}</button>
          <p class="hint">Rechecks all applicable requirements. Advances only if all pass, respecting any requested pause. This does not finish, commit or push unfinished work.</p>
          {#if recovery.checkError}<p class="warning" role="alert">Could not refresh: {recovery.checkError.reason} Earlier results keep their previous check time. Nothing advanced; use Verify to try again.</p>{/if}
        </section>
      </div>
    </section>
  {/if}
  {#if page.feedback}<p class="warning" role="status">{page.feedback}</p>{/if}
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
  .finished { border-left: 1px solid var(--line); padding-left: 24px; }
  textarea { width: 100%; box-sizing: border-box; background: var(--deep); color: var(--text); font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 12px; resize: vertical; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--mono); padding: 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; margin: 0; }
  .final { overflow-wrap: anywhere; line-height: 1.65; }
  .final :global(pre) { white-space: pre-wrap; } .final :global(p:first-child) { margin-top: 0; }
  .checks { list-style: none; padding: 0; margin: 0; }
  .checks li { padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .checks li > div { display: flex; justify-content: space-between; gap: 12px; }
  .checks p { font-size: 12px; overflow-wrap: anywhere; }
  .passed { color: var(--green); } .warning { color: var(--amber); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .button { white-space: normal; align-self: flex-start; } .button:disabled { opacity: .45; }
  .confirmation { display: flex; align-items: start; gap: 10px; font-size: 13px; }
  .lines { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); gap: 4px 10px; overflow-wrap: anywhere; font-size: 12px; }
  summary { cursor: pointer; } details pre { margin: 12px 0; }
  @media(max-width: 680px) { .peer-choices { grid-template-columns: 1fr; } .finished { border-left: 0; border-top: 1px solid var(--line); padding: 24px 0 0; } }
</style>
