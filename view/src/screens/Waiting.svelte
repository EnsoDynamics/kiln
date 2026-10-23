<script lang="ts">
  // Waiting for usage (docs/changes/kiln-usage-limit-recovery/mockups/kiln-screen-waiting-for-usage.html):
  // the limit the session stopped at and its reset, counting down (usage-limit recovery
  // AC-LIMIT-01), how the session ended (v1 AC-STOP-02), how to go sooner on another account with
  // Resume now (AC-LIMIT-02), the account Kiln last read (AC-LIMIT-03), and the keep-awake and
  // "Resume after a usage limit" settings (AC-AUTO-03, AC-AUTO-04). Nothing is needed from the
  // person, so it is styled as Paused is. It is the screen alone, as Needs you is: no plan or
  // Claude account panel, no Check again, terminal hand-back or pause (AC-LIMIT-04).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import type { Settings } from "../../../src/state/records.js";
  import Icon from "../components/Icon.svelte";
  import LimitAccount from "../components/LimitAccount.svelte";
  import OutputRow from "../components/OutputRow.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import SwitchAccountCommand from "../components/SwitchAccountCommand.svelte";
  import { changeSettings, resumeNow } from "../lib/api.js";
  import { finalMessageHtml } from "../lib/markdown.js";
  import { PR_ID } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { earlier, limitTime } from "../lib/time.js";
  import { atLimitLine, waitingCopy } from "../lib/usage-limit.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, now }: { snapshot: Snapshot; now: number } = $props();
  const { config, router } = viewContext();
  const waiting = $derived(snapshot.waiting!);
  const settings = $derived(snapshot.settings);
  const nowDate = $derived(new Date(now));
  // Worked out from the view's clock, so the countdown keeps counting while the screen is open (AC-LIMIT-01).
  const copy = $derived(waitingCopy(waiting.phaseId, waiting.limit, nowDate));
  const atLimit = $derived(atLimitLine(waiting.limit, nowDate));
  const ending = $derived(waiting.signal ?? (waiting.exitCode === undefined ? undefined : `exit ${waiting.exitCode}`));
  const outputLink = $derived(phasePath(config.base, waiting.phaseId));
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);
  let settingReason = $state<string | undefined>(undefined);

  async function pressResumeNow() {
    pressing = true;
    const answer = await resumeNow(config);
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }

  async function save(change: Partial<Settings>) {
    const answer = await changeSettings(config, change);
    settingReason = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main roomy">
  <StateHeader {snapshot} connected {now} />
  <div class="columns-main">
    <div class="column-wide">
      <section class="card ended">
        <div class="headline">
          <h2>{copy.headline}</h2>
          <p class="line">{copy.reported} {#if copy.reset}<strong>{copy.reset}</strong>{/if} {copy.resumes}</p>
        </div>
        {#if ending}
          <div class="facts mono"><span>{ending}</span><span>{limitTime(waiting.stoppedAt, nowDate)}</span>{#if waiting.lastSkill}<span>last skill seen: {waiting.lastSkill.name}, {earlier(waiting.lastSkill.at, waiting.stoppedAt)}</span>{/if}</div>
        {/if}
        {#if waiting.finalMessage !== undefined}
          <div class="message-block">
            <span class="eyebrow">Last message from Claude Code</span>
            <div class="final">{@html finalMessageHtml(waiting.finalMessage)}</div>
          </div>
        {:else if waiting.lastLines && waiting.lastLines.length > 0}
          <div class="lines mono">{#each waiting.lastLines as line (line.line)}<OutputRow {line} now={nowDate} />{/each}</div>
        {/if}
        {#if waiting.outputLineCount !== undefined}
          <a class="arrow-link" href={outputLink} onclick={(event) => routedClick(event, router, outputLink)}>Full session output · {waiting.outputLineCount.toLocaleString("en-US")} {waiting.outputLineCount === 1 ? "line" : "lines"}<Icon name="arrow" /></a>
        {/if}
      </section>

      <section class="card sooner">
        <span class="eyebrow">Go sooner on another account</span>
        <ol>
          <li>
            <span class="number">1</span>
            <div class="step">
              <span class="step-title">Sign in to another Claude account in a terminal</span>
              <p>Use an account that has usage left.</p>
              <SwitchAccountCommand agentId={snapshot.settings.agentId} />
            </div>
          </li>
          <li>
            <span class="number">2</span>
            <div class="step">
              <span class="step-title">Then press Resume now</span>
              <p>It resumes on whichever account is signed in, without waiting for Kiln’s next reading. Kiln checks {waiting.phaseId === PR_ID ? "GitHub" : "Git"} first, then picks up the same session. If you don’t, Kiln resumes by itself at the first reading that shows usage left.</p>
              <LimitAccount limit={waiting.limit} footnote={copy.footnote} />
              <div class="actions">
                <!-- The amber line never holds Resume now (AC-LIMIT-03); a resume or check under way does. -->
                <button type="button" class="button solid" disabled={pressing || waiting.checking === true} onclick={pressResumeNow}><Icon name="play" size={15} />Resume now</button>
                {#if atLimit}<span class="at-limit">{atLimit}</span>{/if}
              </div>
              {#if reason}<span class="reason">{reason}</span>{/if}
            </div>
          </li>
        </ol>
      </section>
    </div>

    <div class="column-side">
      <aside class="card settings">
        <span class="eyebrow">Settings for this PRD</span>
        <div class="setting">
          <div class="words">
            <span class="term">Keep awake</span><span class="value">While a session works or Kiln waits</span><span class="help">Closing the lid can still put the computer to sleep.</span>
            {#if settings.keepAwakeError}<span class="reason">{settings.keepAwakeError}</span>{/if}
          </div>
          <label class="toggle"><input type="checkbox" checked={settings.keepAwake} aria-label="Keep this computer awake" onchange={(event) => save({ keepAwake: event.currentTarget.checked })} />{settings.keepAwake ? "On" : "Off"}</label>
        </div>
        <div class="setting next">
          <div class="words"><span class="term">Resume after a usage limit</span><span class="help wide">Switch off to finish the phase yourself; Needs you then shows how.</span></div>
          <label class="toggle"><input type="checkbox" checked={settings.resumeAfterUsageLimit} aria-label="Resume after a usage limit" onchange={(event) => save({ resumeAfterUsageLimit: event.currentTarget.checked })} />{settings.resumeAfterUsageLimit ? "On" : "Off"}</label>
        </div>
        {#if settingReason}<span class="reason">{settingReason}</span>{/if}
      </aside>
    </div>
  </div>
</main>

<style>
  .ended { gap: 18px; }
  .headline { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .line { margin: 0; font-size: 15.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .line strong { color: var(--text); font-weight: 600; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--dim); }
  .message-block { display: flex; flex-direction: column; gap: 10px; }
  /* The mockup's 72ch, as Inter's "0" measures it (see NeedsYou's message). */
  .final { font-size: 15px; color: var(--muted); line-height: 1.65; display: flex; flex-direction: column; gap: 10px; max-width: 45.4em; overflow-wrap: anywhere; }
  .final :global(p), .final :global(ul), .final :global(ol), .final :global(pre), .final :global(blockquote), .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { margin: 0; }
  .final :global(ul), .final :global(ol) { padding-left: 1.4em; }
  .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { font-size: 15px; font-weight: 600; color: var(--text); }
  .final :global(strong) { color: var(--text); font-weight: 600; }
  .final :global(code) { font-family: var(--mono); font-size: 0.88em; color: var(--text); }
  .final :global(pre) { white-space: pre-wrap; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .lines { font-size: 12.5px; line-height: 1.75; display: grid; grid-template-columns: minmax(70px, max-content) 66px minmax(0, 1fr); gap: 2px 12px; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .arrow-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--red); text-decoration: none; align-self: flex-start; }
  .sooner { gap: 18px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 26px; }
  ol > li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 0 16px; }
  .number { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line-stronger); display: inline-flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 20px; color: var(--text); box-sizing: border-box; }
  .step { display: flex; flex-direction: column; gap: 12px; padding-top: 5px; min-width: 0; }
  .step-title { font-size: 16px; font-weight: 600; color: var(--text); }
  .step p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .at-limit { font-size: 13px; color: var(--amber); }
  .reason { font-size: 12.5px; color: var(--amber); line-height: 1.5; }
  .settings { gap: 18px; }
  .setting { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .setting.next { padding-top: 14px; border-top: 1px solid var(--line); }
  .words { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .term { font-size: 12.5px; color: var(--dim); }
  .value { font-size: 14.5px; color: var(--text); }
  .help { font-size: 12.5px; color: var(--dim); line-height: 1.5; }
  .help.wide { font-size: 13px; }
  .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; flex: 0 0 auto; }
  .toggle input { width: 18px; height: 18px; margin: 0; accent-color: var(--red); }
</style>
