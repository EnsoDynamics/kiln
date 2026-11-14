<script lang="ts">
  // Reset Kiln for this PRD (run restart AC-RESET-01 to 03, mockup docs/changes/kiln-run-restart/
  // mockups/kiln-run-restart.html, "Reset, the confirmation"): the line at the very bottom of every
  // screen of a started PRD, and the confirmation it opens in place, which lists what Kiln forgets
  // and what stays and says the reset can't be undone. Cancel closes it and changes nothing.
  import type { ResetPreview } from "../../../src/engine/reset.js";
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { reset, resetPreview, type PageConfig } from "../lib/api.js";
  import { forgetLines, RESET_LINE, stayLines } from "../lib/reset.js";

  let { control, config, connected }: { control: NonNullable<Snapshot["reset"]>; config: PageConfig; connected: boolean } = $props();
  let open = $state(false);
  let preview = $state<ResetPreview | undefined>();
  let problem = $state<string | undefined>();
  let pressing = $state(false);

  async function toggle() {
    if (open) { close(); return; }
    open = true; preview = undefined; problem = undefined;
    const read = await resetPreview(config);
    if (!open) return;
    if ("error" in read) problem = `Kiln couldn't read what the reset would change: ${read.error}`;
    else preview = read;
  }
  function close() { open = false; preview = undefined; problem = undefined; }
  async function confirm() {
    if (pressing) return;
    pressing = true;
    const answer = await reset(config);
    pressing = false;
    // A reset that went through publishes Documents found; this footer then leaves the page.
    if (answer.ok) close(); else problem = answer.reason;
  }
</script>

<footer class="reset" aria-label="Reset Kiln for this PRD">
  <div class="line">
    <span class="text">{control.available ? RESET_LINE : control.reason}</span>
    <button type="button" class="button small open-reset" class:open aria-expanded={open} disabled={!control.available || !connected} onclick={toggle}>Reset Kiln for this PRD</button>
  </div>
  {#if open}
    <section class="confirm" aria-labelledby="reset-h">
      <div class="intro">
        <h2 id="reset-h">Reset Kiln for this PRD?</h2>
        <p>Kiln forgets everything it recorded about running this PRD and takes you back to the first screen, as if you had just run <code>kiln run</code> on it for the first time. From there you choose where to start.</p>
      </div>
      {#if preview}
        <div class="columns">
          <div class="column">
            <strong class="forgets">Kiln forgets</strong>
            <ul>{#each forgetLines(preview.forgets) as line (line)}<li>{line}</li>{/each}</ul>
          </div>
          <div class="column">
            <strong class="stays">Stays exactly as it is</strong>
            <ul>{#each stayLines(preview) as line, index (index)}<li>{#if line.code}<code>{line.code}</code>{/if}{#if line.href}<a href={line.href}>{line.text}</a>{:else}{line.text}{/if}</li>{/each}</ul>
          </div>
        </div>
      {:else if !problem}
        <p class="reading">Reading what stays…</p>
      {/if}
      {#if problem}<p class="problem" role="status">{problem}</p>{/if}
      <div class="actions">
        <span class="undo">This can't be undone.</span>
        <div class="buttons">
          <button type="button" class="button solid" onclick={close}>Cancel</button>
          <button type="button" class="button confirm-reset" disabled={!preview || pressing || !connected || !control.available} onclick={confirm}>{pressing ? "Resetting…" : "Reset Kiln for this PRD"}</button>
        </div>
      </div>
    </section>
  {/if}
</footer>

<style>
  .reset { max-width: 1120px; margin: 12px auto 0; padding: 20px 32px 64px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; }
  .line { padding-top: 20px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .text { font-size: 13px; color: var(--dim); max-width: 760px; }
  .open-reset { font-size: 13.5px; color: var(--muted); border-color: var(--line-strong); }
  .open-reset.open { color: var(--text); border-color: var(--text); }
  .confirm { background: var(--panel); border: 1px solid var(--amber-border); border-radius: 18px; padding: 28px; display: flex; flex-direction: column; gap: 18px; }
  .intro { display: flex; flex-direction: column; gap: 6px; }
  h2 { margin: 0; font-size: 22px; font-weight: 600; font-family: inherit; }
  p { margin: 0; color: var(--muted); line-height: 1.6; max-width: 780px; }
  .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .column { background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
  .forgets { color: var(--amber); } .stays { color: var(--green); }
  ul { margin: 0; padding-left: 18px; color: var(--muted); font-size: 14px; display: flex; flex-direction: column; gap: 4px; }
  .actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .buttons { display: flex; flex-wrap: wrap; gap: 12px; }
  .undo, .reading { font-size: 13px; color: var(--dim); }
  .confirm-reset { color: var(--red); border-color: var(--red); }
  .problem { font-size: 12.5px; color: var(--amber); }
  code { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
  @media (max-width: 720px) { .columns { grid-template-columns: minmax(0, 1fr); } }
</style>
