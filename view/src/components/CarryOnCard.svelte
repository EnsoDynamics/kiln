<script lang="ts">
  // Reply here and let Kiln carry on (run restart AC-CARRY-01, 02, 05, 06): Kiln can't reopen the
  // earlier conversation, so it starts a new session given the person's optional reply, the
  // agent's last message and the phase's work, and says why the conversation can't be reopened.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { ReopenCheck } from "../../../src/engine/reopen-check.js";
  import { defectWords } from "../../../src/engine/reopen-check.js";
  import { workLine } from "../lib/restart.js";

  type NeedsYou = NonNullable<Snapshot["needsYou"]>;
  let { agent, activity, work, reopen, control, draft = $bindable(""), pending, checking, disabled, reason, onpress, oncheck }: {
    agent: string; activity: string; work: NeedsYou["work"]; reopen: ReopenCheck; control: NonNullable<NeedsYou["carryOn"]>;
    draft?: string; pending: boolean; checking: boolean; disabled: boolean; reason?: string | undefined; onpress: () => void; oncheck: () => void;
  } = $props();
  const ends = $derived(control.endsHold === "takeover" ? " Starting it ends the takeover pause." : control.endsHold === "message" ? " Starting it ends the hold on that message." : "");
</script>

<section class="card carry" aria-label="Reply here and let Kiln carry on">
  <h2>Reply here and let Kiln carry on</h2>
  <p>Kiln can't reopen the earlier conversation, so it starts a new {agent} session for {activity}. The new session gets your reply, {agent}'s last message and {activity}'s work so far, and picks up from there.{ends}</p>
  <ul class="work"><li><span>{activity}'s work so far</span><span>{workLine(work)}</span></li></ul>
  <label class="note-field" for="carry-reply"><span>Your reply to {agent} <span class="optional">Optional</span></span></label>
  <textarea id="carry-reply" rows="3" maxlength="4000" bind:value={draft}></textarea>
  <button type="button" class="button solid" disabled={disabled || !control.available} onclick={onpress}>{pending ? "Starting…" : `Send reply & continue ${activity}`}</button>
  {#if !control.available && control.reason}<p class="reason">{control.reason}</p>{/if}
  {#if reason}<p class="reason" role="status">{reason}</p>{/if}
  <div class="why">
    <strong>Why the earlier conversation can't be reopened</strong>
    {#if reopen.reason === "unsafe"}
      <span>Kiln won't hand the saved conversation back to an agent to act on unattended, because <code>{reopen.path}</code> {defectWords(reopen.defects ?? [])}.{#if reopen.fixCommand}{" "}To remove their access, run this, then check again:{/if}</span>
      {#if reopen.fixCommand}<code class="command">{reopen.fixCommand}</code>{/if}
    {:else if reopen.reason === "not_a_file"}<span>The saved conversation isn't an ordinary file: <code>{reopen.path}</code>.</span>
    {:else if reopen.reason === "missing"}<span>Claude Code has no saved conversation for this session.</span>
    {:else if reopen.reason === "no_messages"}<span>The saved conversation has no messages Kiln can reopen.</span>
    {:else if reopen.reason === "unreadable"}<span>Kiln couldn't read the saved conversation.</span>
    {:else if reopen.reason === "reopen_failed"}<span>Kiln tried to reopen the conversation, and the agent stopped before it began.</span>
    {:else}<span>{reopen.detail}</span>{/if}
    <button type="button" class="button small" disabled={disabled || checking} onclick={oncheck}>{checking ? "Checking…" : "Check again"}</button>
  </div>
</section>

<style>
  .carry { gap: 14px; min-width: 0; }
  h2 { margin: 0; font-size: 20px; line-height: 1.35; }
  p { margin: 0; color: var(--muted); line-height: 1.6; }
  .work { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .work li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; font-size: 13.5px; }
  .work li span:first-child { color: var(--dim); }
  .note-field { font-size: 13.5px; color: var(--muted); }
  .optional { color: var(--dim); }
  textarea { width: 100%; box-sizing: border-box; background: var(--deep); color: var(--text); font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 12px; resize: vertical; }
  .button { align-self: flex-start; white-space: normal; } .button:disabled { opacity: .45; }
  .why { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .why strong { color: var(--text); }
  .why code { font-family: var(--mono); font-size: 12px; color: var(--text); }
  .command { display: block; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .reason { font-size: 12.5px; color: var(--amber); }
</style>
