<script lang="ts">
  import type { LiveView } from "../../../src/live/target.js";
  import type { Receipt } from "../../../src/control/commands.js";
  import { messageProblem } from "../../../src/live/target.js";
  import { liveDraft } from "../lib/live-drafts.svelte.js";
  import { viewContext } from "../lib/view-context.js";
  let { view, connected }: { view: LiveView; connected: boolean } = $props();
  const { config } = viewContext();
  const draft = $derived(liveDraft(view.target));
  $effect(() => {
    const receipt = view.messages?.find(m => m.instructionId === draft.instructionId);
    if (receipt && receipt.delivery !== "submitting") { draft.instructionId = undefined; draft.submittedText = undefined; }
  });
  async function submit(check = false) {
    const state = draft; const target = view.target;
    if (!connected || state.submitting || !check && (!view.input?.available || messageProblem(state.text))) return;
    state.submitting = true;
    state.instructionId ??= crypto.randomUUID();
    state.submittedText ??= state.text;
    state.feedback = "Submitting — no delivery claim yet.";
    try {
      const response = await fetch(check ? `/api/live/instructions/${encodeURIComponent(state.instructionId)}` : "/api/live/message", {
        method: check ? "GET" : "POST", headers: { "X-Kiln-Token": config.token, "Content-Type": "application/json" },
        ...(!check ? { body: JSON.stringify({ instructionId: state.instructionId, target, text: state.submittedText }) } : {}), signal: AbortSignal.timeout(5000),
      });
      const answer = await response.json() as { receipt?: Receipt; reason?: string };
      if (answer.receipt?.message) {
        state.feedback = answer.receipt.message.delivery === "submitting" ? "Submitting — delivery is still pending." : answer.receipt.message.delivery === "not_sent" ? "Not sent. Your exact text is retained." : answer.receipt.message.delivery === "uncertain" ? "Delivery uncertain. Review this message in the conversation before explicit hand-back." : "Submission recorded. Inspect the receipt below; this does not confirm the requested action happened.";
        if (answer.receipt.message.delivery !== "submitting") { state.instructionId = undefined; state.submittedText = undefined; }
      } else if (!check && response.status < 500) {
        state.feedback = `Not sent: ${answer.reason ?? "This instruction was refused."} Your text is retained.`;
        state.instructionId = undefined; state.submittedText = undefined;
      } else state.feedback = `Submission outcome unknown. Check this same instruction before sending again. ${answer.reason ?? ""}`;
    } catch { state.feedback = "Submission outcome unknown. Reconnect and check this same instruction before sending again. Your message is retained."; }
    finally { state.submitting = false; }
  }
</script>
<section class="card composer" aria-label="Message Claude">
  <h2>Message Claude</h2>
  <p>{view.label} · Claude · <span class="mono">{view.target.providerSessionId}</span></p>
  <label for="live-message">Your message</label>
  <textarea id="live-message" rows="4" bind:value={draft.text} aria-describedby="live-message-limit live-message-timing" disabled={draft.submitting || !!draft.instructionId} placeholder="Send an instruction to this running conversation"></textarea>
  <p id="live-message-limit" class="hint" aria-live="polite">{draft.text.length.toLocaleString()} / 4,000 UTF-16 code units · {draft.text.length > 4000 ? "Over the message limit — shorten before sending" : "Message limit"}</p>
  <p id="live-message-timing">Claude reads this at its next opportunity. The current tool may finish first.</p>
  <button class="button solid" disabled={!connected || !view.input?.available || draft.submitting || !!draft.instructionId || !!messageProblem(draft.text)} onclick={() => submit()}>Send message</button>
  {#if draft.instructionId && !draft.submitting}<button class="button" disabled={!connected} onclick={() => submit(true)}>Check submission</button>{/if}
  {#if !connected}<p>Disconnected. Reconnect before acting. Last observed {new Date(view.observedAt).toLocaleString()}. Your draft is retained.</p>{:else if !view.input?.available}<p>{view.input?.reason ?? "Live input is unavailable for this attempt."}</p>{/if}
  {#if draft.text && messageProblem(draft.text)}<p role="alert">{messageProblem(draft.text)}</p>{/if}
  {#if draft.feedback}<p role="status">{draft.feedback}</p>{/if}
</section>
<style>
  .composer { display:flex; flex-direction:column; gap:12px; min-width:0; }
  h2,p { margin:0; } h2 { font-size:20px; } p { color:var(--muted); overflow-wrap:anywhere; line-height:1.6; }
  textarea { width:100%; box-sizing:border-box; resize:vertical; font:inherit; color:var(--text); background:var(--deep); border:1px solid var(--line); border-radius:8px; padding:12px; }
  .hint { font-size:12.5px; } button { align-self:flex-start; }
</style>
