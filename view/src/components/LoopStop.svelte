<script lang="ts">
  // A loop stop's page, the main column of Needs you (Kiln Audit Loop Limits AC-STOP-01,
  // AC-STOP-02; mockup screens 2 and 3): the heading with the loops counted and the current limit,
  // each loop in the count and any audit session since, with what it did and how long it ran; the
  // latest audit's own summary and the items it listed, as it wrote them; at a test stop the
  // person's After the last test audit loop choice; then the controls. Allow N more loops is filled
  // in as 2; Accept what is left and deliver is offered at a test stop only, with its sentence;
  // Reply is not offered at a stored stop for listed items, where nothing would read it; the audit's
  // session can always be opened in a terminal. Kiln ranks nothing and judges nothing here.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { acceptAndDeliver, allowMoreLoops, resume, type PageConfig } from "../lib/api.js";
  import { LIMIT_ERROR, loopStopCopy, parsedLimit, stopLoopLine, type LoopStopView } from "../lib/audit-loops.js";
  import { shortDuration } from "../lib/time.js";
  import CopyButton from "./CopyButton.svelte";

  let { snapshot, loop, config, busy = false }: { snapshot: Snapshot; loop: LoopStopView; config: PageConfig; busy?: boolean } = $props();
  const stop = $derived(snapshot.needsYou!);
  const copy = $derived(loopStopCopy(loop, snapshot.auditLoops!, stop.kind === "loop_limit"));
  const agent = $derived(stop.agent ?? snapshot.settings.agent);
  // Only an audit that finished has nothing to read a reply: a `needs_you` report's audit has not.
  const reply = $derived(!(stop.kind === "loop_limit" && loop.reason === "items_listed") && stop.resumeOffered);

  let count = $state("2");
  let countError = $state<string | undefined>(undefined);
  let note = $state("");
  let pending = $state<"allow" | "accept" | "reply" | undefined>(undefined);
  let reason = $state<string | undefined>(undefined);
  const locked = $derived(busy || pending !== undefined);

  async function press(action: "allow" | "accept" | "reply") {
    if (locked) return;
    reason = undefined;
    let value: number | undefined;
    if (action === "allow") {
      value = parsedLimit(count);
      countError = value === undefined ? LIMIT_ERROR : undefined;
      if (value === undefined) return;
    }
    pending = action;
    const answer = action === "allow" ? await allowMoreLoops(config, value!) : action === "accept" ? await acceptAndDeliver(config) : await resume(config, note);
    pending = undefined;
    reason = answer.ok ? undefined : answer.reason;
    if (answer.ok && action === "reply") note = "";
  }
</script>

<section class="card ended loop-stop">
  <div class="headline">
    <h2>{loop.heading}</h2>
    <p class="line">{copy.line}</p>
  </div>
  {#if loop.loops.length}
    <div class="block">
      <span class="eyebrow">The loops</span>
      <ul class="loops">
        {#each loop.loops as line, index (index)}<li><span>{stopLoopLine(line)}</span><span class="duration">{shortDuration(line.durationMs)}</span></li>{/each}
      </ul>
    </div>
  {/if}
  <div class="block">
    <span class="eyebrow">{copy.foundHeading}</span>
    {#if loop.audit.summary}<blockquote class="summary">“{loop.audit.summary}”</blockquote>{/if}
    {#if loop.audit.items.length}
      <span class="eyebrow">Listed for you</span>
      <ul class="items">
        {#each loop.audit.items as item, index (index)}<li><strong>{item.name}</strong> · {item.problem} {item.action}</li>{/each}
      </ul>
    {:else}
      <p class="quiet">{copy.nothingListed}</p>
    {/if}
  </div>
</section>

<section class="card controls">
  <div class="control">
    <div class="allow">
      <label class="allow-label"><span>More loops</span><input type="number" min="1" step="1" inputmode="numeric" value={count} oninput={(event) => { count = event.currentTarget.value; countError = undefined; }} disabled={locked} aria-invalid={countError ? "true" : undefined} /></label>
      <button type="button" class="button solid" disabled={locked} onclick={() => press("allow")}>{pending === "allow" ? "Starting…" : `Allow ${parsedLimit(count) ?? count} more loops`}</button>
    </div>
    {#if countError}<span class="reason">{countError}</span>{/if}
    <p class="hint">{copy.allowText}</p>
  </div>
  {#if loop.kind === "test" && loop.acceptSentence}
    <div class="control">
      <button type="button" class="button" disabled={locked} onclick={() => press("accept")}>{pending === "accept" ? "Starting…" : "Accept what is left and deliver"}</button>
      <p class="hint">You say: “{loop.acceptSentence}” {copy.acceptText}</p>
    </div>
  {/if}
  {#if reply}
    <div class="control">
      <span class="step-title">Or reply to {copy.activityName}</span>
      <label class="note-field">
        <span class="note-label">Your reply to {agent}</span>
        <textarea rows="3" maxlength={4000} bind:value={note} disabled={locked}></textarea>
      </label>
      <p class="hint">Type your own answer. It goes to the audit’s conversation, which carries on from where it stopped. A reply is not a loop.</p>
      <div><button type="button" class="button" disabled={locked || !note.trim()} onclick={() => press("reply")}>{pending === "reply" ? "Sending…" : "Send reply to the audit"}</button></div>
    </div>
  {/if}
  {#if reason}<span class="reason">{reason}</span>{/if}
</section>

{#if stop.resumeCommand}
  <section class="card pick">
    <span class="eyebrow">Or pick it up yourself</span>
    <span class="step-title">Open {copy.activityName}’s session in a terminal</span>
    <pre>{stop.resumeCommand}</pre>
    <div class="actions"><CopyButton text={stop.resumeCommand} /><span class="hint">Full history, right where it stopped. Kiln stays out of it. Come back and press Check again when you’re done.</span></div>
  </section>
{/if}

<style>
  .ended { border-color: rgba(230, 180, 80, 0.5); gap: 20px; }
  .headline { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .line { margin: 0; font-size: 15.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .block { display: flex; flex-direction: column; gap: 10px; }
  .loops, .items { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .loops li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--text); }
  .duration { flex: 0 0 auto; font-size: 13px; color: var(--dim); }
  .items li { padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--muted); line-height: 1.55; }
  .items strong { color: var(--text); font-weight: 600; }
  .summary { margin: 0; padding: 12px 16px; border-left: 2px solid var(--line-stronger); font-size: 15px; color: var(--muted); line-height: 1.6; }
  .quiet { margin: 0; font-size: 14px; color: var(--dim); }
  .controls { gap: 22px; }
  .control { display: flex; flex-direction: column; gap: 10px; }
  .allow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .allow-label { display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; color: var(--text); }
  .allow-label input { width: 64px; height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--deep); color: var(--text); font-size: 14px; box-sizing: border-box; }
  .step-title { font-size: 16px; font-weight: 600; color: var(--text); }
  .note-field { display: flex; flex-direction: column; gap: 8px; }
  .note-label { font-size: 13.5px; color: var(--muted); }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: var(--sans); font-size: 14.5px; line-height: 1.6; color: var(--text); background: var(--deep); border: 1px solid var(--line-stronger); border-radius: 12px; padding: 12px 14px; }
  .hint { margin: 0; font-size: 13px; color: var(--dim); line-height: 1.6; }
  .reason { font-size: 12.5px; color: var(--amber); }
  .pick { gap: 12px; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
</style>
