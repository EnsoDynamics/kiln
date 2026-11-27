<script lang="ts">
  // Feedback at any time (Kiln Requirements Stages AC-NOTE-01, AC-TALK-01 to 04, AC-EARLY-03, AC-FINAL-02):
  // the draft's key statements while the refinement runs, the feedback box, and each message as
  // waiting, sent, read or applied. At the early review the box offers Stop here again.
  import type { FeedbackView, Snapshot } from "../../../src/engine/snapshot.js";
  import { sendFeedback } from "../lib/api.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, connected }: { snapshot: Snapshot; connected: boolean } = $props();
  const { config } = viewContext();
  const requirements = $derived(snapshot.requirements!);
  const review = $derived(requirements.review);
  let text = $state("");
  let stopAgain = $state(false);
  let busy = $state(false);
  let reason = $state("");
  const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const stateLine = (m: FeedbackView) =>
    m.state === "applied" ? `Worked in${m.appliedAt ? ` at ${time(m.appliedAt)}` : ""}${m.appliedCommit ? `, in ${m.appliedCommit.slice(0, 7)}` : ""}`
      : m.state === "read" ? `Read by the session${m.readAt ? ` at ${time(m.readAt)}` : ""}`
      : m.state === "sent" ? "Sent to the session, not yet confirmed read"
      : "Waiting: a fresh session applies it before the next stage";
  async function send() {
    if (busy || !text.trim()) return;
    busy = true;
    try {
      const answer = await sendFeedback(config, text, review?.kind === "early" && stopAgain);
      reason = answer.ok ? "" : answer.reason;
      if (answer.ok) { text = ""; stopAgain = false; }
    } finally { busy = false; }
  }
</script>

{#if requirements.draftNote}
  <section class="card" aria-labelledby="draft-h">
    <h2 id="draft-h" class="eyebrow">From the PRD draft · Nothing is waiting on this</h2>
    <p class="help">The few statements the whole PRD hangs on, as the draft has them. If one is wrong, saying so now is cheaper than after the refinement. The early stakeholder review replaces this when it is ready.</p>
    {#if requirements.draftNote.statements.length}<ol>{#each requirements.draftNote.statements as statement}<li>{statement}</li>{/each}</ol>{/if}
    {#if requirements.draftNote.leftOut.length}<h3>Not included</h3><p>{requirements.draftNote.leftOut.join(" ")}</p>{/if}
  </section>
{/if}

{#if !review && requirements.whatChanged}
  <section class="card" aria-labelledby="carried-h">
    <h2 id="carried-h" class="eyebrow">What your feedback at the {requirements.whatChanged.kind} review changed · pushed <code>{requirements.whatChanged.commit.slice(0, 7)}</code></h2>
    {#if requirements.whatChanged.items.length}<ul>{#each requirements.whatChanged.items as item}<li>{item}</li>{/each}</ul>{:else}<p>The session reported no list of changes.</p>{/if}
  </section>
{/if}

{#if review?.whatChanged}
  <section class="card" aria-labelledby="changed-h">
    <h2 id="changed-h" class="eyebrow">What changed · as the feedback session reported it · pushed <code>{review.whatChanged.commit.slice(0, 7)}</code></h2>
    {#if review.whatChanged.items.length}<ul>{#each review.whatChanged.items as item}<li>{item}</li>{/each}</ul>{:else}<p>The session reported no list of changes.</p>{/if}
  </section>
{/if}

<section class="card" aria-labelledby="feedback-h">
  <h2 id="feedback-h" class="eyebrow">{review ? "Your feedback" : "Anything off?"}</h2>
  {#each requirements.feedback as message (message.id)}
    <div class="message-row"><p class="said"><strong>You · {time(message.at)}</strong></p><p class="text">{message.text}</p><p class="state">{stateLine(message)}</p></div>
  {/each}
  <p class="help">{review ? review.kind === "early" ? "A fresh session works it into the PRD, its assumptions and its mockups, refreshes the review, and shows you what changed." : "A fresh session works it into the PRD, the design and the phase plan, refreshes the review, and brings you back here."
    : requirements.feedbackTo === "running_session" ? "The session running now reads it at its next opportunity. Nothing stops while you write." : "No session can take it now, so Kiln applies it in a fresh session before the next stage. Nothing stops."}</p>
  <textarea bind:value={text} rows="4" aria-label="Your feedback" disabled={!connected || busy}></textarea>
  {#if review?.kind === "early"}
    <label><input type="checkbox" bind:checked={stopAgain} disabled={!connected || busy} /> Stop here again once my feedback is in. Otherwise Kiln carries on to the technical design, and you see it again as the final review.</label>
  {/if}
  <button disabled={!connected || busy || !text.trim()} onclick={send}>{review ? "Send feedback" : "Send"}</button>
  {#if reason}<p role="alert">{reason}</p>{/if}
</section>

<style>
  textarea { width: 100%; font: inherit; padding: .5rem; box-sizing: border-box; }
  .message-row { border-left: 3px solid var(--line, #ccc); padding-left: .6rem; margin: .5rem 0; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; margin: .2rem 0; }
  .state, .help { color: var(--dim); }
  label { display: block; margin: .6rem 0; }
  button { font: inherit; padding: .5rem .8rem; cursor: pointer; }
</style>
