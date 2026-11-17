<script lang="ts">
  // The preflight stop (docs/changes/kiln-build-preflight/mockups/kiln-build-preflight.html, state 2;
  // build preflight AC-PREFLIGHT-03): the report's opening line as the headline, the numbered items
  // as the session wrote them, the command that reopens the session in a terminal, then Check
  // Preflight again and Mark complete side by side under no heading, with the sentence beneath.
  // No reply field, no check rows and none of the report's stop lines.
  import BusyStatus from "./BusyStatus.svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { checkAgain, markComplete } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";
  import CodeText from "./CodeText.svelte";
  import CopyButton from "./CopyButton.svelte";
  import Icon from "./Icon.svelte";

  let { snapshot }: { snapshot: Snapshot } = $props();
  const { config, connection } = viewContext();
  const stop = $derived(snapshot.needsYou!);
  const preflight = $derived(stop.preflight!);
  const offer = $derived(stop.markComplete?.offered ? stop.markComplete : undefined);
  const connected = $derived(connection ? connection.connected : true);
  let pressing = $state<"check" | "mark" | undefined>(undefined);
  let reason = $state<string | undefined>(undefined);
  const busy = $derived(!!pressing || stop.checking === true || !connected);

  async function pressCheck() {
    if (busy) return;
    pressing = "check"; reason = undefined;
    const answer = await checkAgain(config);
    pressing = undefined;
    reason = answer.ok ? undefined : answer.reason;
  }
  async function pressMark() {
    if (busy || !offer) return;
    pressing = "mark"; reason = undefined;
    const answer = await markComplete(config, { checkRunId: offer.checkRunId });
    pressing = undefined;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<section class="card preflight" aria-labelledby="preflight-h">
  <div class="headline">
    <h2 id="preflight-h">{preflight.headline}</h2>
    <p class="line">{preflight.line}</p>
  </div>
  <div class="found">
    <span class="eyebrow">What the preflight found</span>
    <ol class="items">
      {#each preflight.items as item, index (index)}
        <li><span class="number mono">{index + 1}.</span><span class="text"><CodeText text={item} /></span></li>
      {/each}
    </ol>
  </div>
  {#if stop.resumeCommand}
    <div class="terminal">
      <p>Open the preflight session in a terminal to work through an item with it:</p>
      <div class="block"><pre>{stop.resumeCommand}</pre><div class="actions"><CopyButton text={stop.resumeCommand} /></div></div>
      <p class="hint">When you're done there, press Check Preflight again.</p>
    </div>
  {/if}
  <div class="controls">
    <button type="button" class="button solid" class:busy={pressing === "check"} aria-busy={pressing === "check"} disabled={busy} onclick={pressCheck}><Icon name="check-again" size={15} />{pressing === "check" ? "Checking…" : "Check Preflight again"}</button>
    <button type="button" class="button" class:busy={pressing === "mark"} aria-busy={pressing === "mark"} disabled={busy || !offer} onclick={pressMark}>{pressing === "mark" ? "Marking…" : "Mark complete"}</button>
  </div>
  {#if pressing === "check"}<BusyStatus text="Launching a fresh preflight session." />{/if}
  {#if offer}{#each offer.sentence as text, index (index)}<p class="hint">{text}</p>{/each}{/if}
  {#if reason}<p class="reason" role="alert">{reason}</p>{/if}
</section>

<style>
  .preflight { gap: 22px; border-color: rgba(230, 180, 80, 0.5); max-width: 1120px; }
  .headline { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .line { margin: 0; font-size: 15.5px; color: var(--muted); line-height: 1.6; }
  .found { display: flex; flex-direction: column; gap: 12px; }
  .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .items li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 0 10px; font-size: 15px; line-height: 1.6; color: var(--text); }
  .number { color: var(--amber); }
  .text { overflow-wrap: anywhere; }
  .terminal { display: flex; flex-direction: column; gap: 10px; }
  .terminal p { margin: 0; font-size: 14.5px; color: var(--muted); }
  .block { display: flex; flex-direction: column; gap: 10px; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; overflow-wrap: anywhere; }
  .actions, .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .hint { margin: 0; font-size: 13.5px; color: var(--dim); line-height: 1.6; }
  .button:disabled { opacity: .45; cursor: not-allowed; }
  .reason { margin: 0; font-size: 12.5px; color: var(--amber); }
</style>
