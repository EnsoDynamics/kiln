<script lang="ts">
  // Needs you (docs/design/mockups/kiln-screen-needs-you-ended-with-message.html and
  // kiln-screen-needs-you-crashed.html): how the session ended, word for word (PRD AC-STOP-02),
  // the command that reopens it (AC-STOP-05) or a fresh-session prompt (AC-STOP-06), each check
  // with the fact behind it (AC-STOP-03), Check again (AC-STOP-07), and a link to the full
  // output (AC-WATCH-10). The stops nobody drew reuse this layout with UI-007's lines. Kiln
  // never gives a reason of its own (AC-STOP-04). It is the screen alone: no plan, settings or
  // account (UI-006).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import CodeText from "../components/CodeText.svelte";
  import CopyButton from "../components/CopyButton.svelte";
  import Icon from "../components/Icon.svelte";
  import OutputRow from "../components/OutputRow.svelte";
  import StateHeader from "../components/StateHeader.svelte";
  import { checkAgain } from "../lib/api.js";
  import { finalMessageHtml } from "../lib/markdown.js";
  import { endingFact, needsYouCopy, PR_ID } from "../lib/progress.js";
  import { phasePath, routedClick } from "../lib/router.svelte.js";
  import { clockTime, earlier } from "../lib/time.js";
  import { viewContext } from "../lib/view-context.js";

  let { snapshot, now }: { snapshot: Snapshot; now: number } = $props();
  const { config, router } = viewContext();
  const stop = $derived(snapshot.needsYou!);
  const nowDate = $derived(new Date(now));
  const copy = $derived(needsYouCopy(stop, snapshot.settings, nowDate));
  const ending = $derived(endingFact(stop));
  const file = $derived(snapshot.phases.find((phase) => phase.id === stop.phaseId)?.file);
  const outputLink = $derived(phasePath(config.base, stop.phaseId));
  const steps = $derived([...(copy.firstStep === "none" ? [] : ["first"]), "finish", "again"]);
  let showPrompt = $state(false);
  let pressing = $state(false);
  let reason = $state<string | undefined>(undefined);

  async function copyFreshPrompt() {
    showPrompt = true;
    await navigator.clipboard.writeText(stop.freshSessionPrompt);
  }

  async function pressCheckAgain() {
    pressing = true;
    const answer = await checkAgain(config);
    pressing = false;
    reason = answer.ok ? undefined : answer.reason;
  }
</script>

<main class="page-main roomy">
  <StateHeader {snapshot} connected {now} />
  <div class="columns-main">
    <div class="column-wide">
      <section class="card ended">
        <div class="headline">
          <h2>{copy.headline}</h2>
          <p class="line">{copy.line}</p>
        </div>
        {#if copy.showFacts && ending}
          <div class="facts mono"><span>{ending}</span><span>{clockTime(stop.stoppedAt, nowDate)}</span>{#if stop.lastSkill}<span>last skill seen: {stop.lastSkill.name}, {earlier(stop.lastSkill.at, stop.stoppedAt)}</span>{/if}</div>
        {/if}
        {#if stop.finalMessage !== undefined && stop.kind !== "not_resumable"}
          <div class="message-block">
            <span class="eyebrow">Last message from Claude Code</span>
            <div class="final">{@html finalMessageHtml(stop.finalMessage)}</div>
          </div>
        {:else if stop.lastLines && stop.lastLines.length > 0}
          <div class="lines mono">{#each stop.lastLines as line (line.line)}<OutputRow {line} now={nowDate} />{/each}</div>
        {/if}
        {#if stop.sessionId && stop.outputLineCount !== undefined}
          <a class="arrow-link" href={outputLink} onclick={(event) => routedClick(event, router, outputLink)}>Full session output · {stop.outputLineCount.toLocaleString("en-US")} {stop.outputLineCount === 1 ? "line" : "lines"}<Icon name="arrow" /></a>
        {/if}
      </section>

      <section class="card pick">
        <span class="eyebrow">Pick it up yourself</span>
        <ol>
          {#each steps as step, index (step)}
            <li>
              <span class="number">{index + 1}</span>
              <div class="step">
                {#if step === "first" && copy.firstStep === "resume" && stop.resumeCommand}
                  <span class="step-title">Open the same Claude Code session in a terminal</span>
                  <div class="block"><pre>{stop.resumeCommand}</pre><div class="actions"><CopyButton text={stop.resumeCommand} /><span class="hint">Full history, right where it stopped. Kiln stays out of it.</span></div></div>
                {:else if step === "first"}
                  <span class="step-title">Start a fresh Claude Code session in the worktree</span>
                  <div class="block">
                    <pre>{stop.freshSessionCommand}</pre>
                    <pre class="prompt">{stop.freshSessionPrompt}</pre>
                    <div class="actions"><CopyButton text={stop.freshSessionPrompt} label="Copy prompt" /><span class="hint">Points the new session at {stop.phaseId === PR_ID ? "the pull request" : file}.</span></div>
                  </div>
                {:else if step === "finish"}
                  <span class="step-title">{copy.finishTitle}</span>
                  <p><CodeText text={copy.finishText} /></p>
                {:else}
                  <span class="step-title">Come back and check again</span>
                  <p>{copy.checkAgainText}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
        {#if copy.freshLink}
          <button type="button" class="fresh-link" onclick={copyFreshPrompt}>Session can’t be opened? <span>{showPrompt ? "Prompt copied" : "Copy a prompt for a fresh session instead"}</span></button>
          {#if showPrompt}<div class="block"><pre class="prompt">{stop.freshSessionPrompt}</pre><div class="actions"><CopyButton text={stop.freshSessionPrompt} label="Copy prompt" /></div></div>{/if}
        {/if}
      </section>
    </div>

    <div class="column-side">
      <aside class="card side">
        <span class="eyebrow">{copy.sideHeading}</span>
        <ul class="checks">
          {#each stop.checks as check (check.name)}
            <li>
              <span class="mark" class:passed={check.passed}>{#if check.passed}<Icon name="check" size={11} strokeWidth={2.4} />{/if}</span>
              <span class="check"><span class="check-head">{check.name}<span class="verdict" class:passed={check.passed}>{check.passed ? "Yes" : "Not yet"}</span></span><span class="fact">{check.fact}</span></span>
            </li>
          {/each}
        </ul>
        <div class="again">
          <button type="button" class="button solid wide" disabled={pressing || stop.checking === true} onclick={pressCheckAgain}><Icon name="check-again" size={15} />Check again</button>
          <span class="checked">{stop.checking ? "Checking…" : `Checked ${clockTime(stop.checkedAt, nowDate, { afterWord: true })}.`}</span>
          {#if reason}<span class="reason">{reason}</span>{/if}
        </div>
        {#if copy.footnote}<p class="footnote">{copy.footnote}</p>{/if}
      </aside>
    </div>
  </div>
</main>

<style>
  .ended { border-color: rgba(230, 180, 80, 0.5); gap: 18px; }
  .headline { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 3.6vw, 40px); line-height: 1.1; color: var(--text); }
  .line { margin: 0; font-size: 15.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--dim); }
  .message-block { display: flex; flex-direction: column; gap: 10px; }
  /* The mockup's 72ch, as Inter's "0" measures it; with the bundled subset fonts `ch` falls back to 0.5em. */
  .final { font-size: 15px; color: var(--muted); line-height: 1.65; display: flex; flex-direction: column; gap: 10px; max-width: 45.4em; overflow-wrap: anywhere; }
  .final :global(p), .final :global(ul), .final :global(ol), .final :global(pre), .final :global(blockquote), .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { margin: 0; }
  .final :global(ul), .final :global(ol) { padding-left: 1.4em; }
  .final :global(h1), .final :global(h2), .final :global(h3), .final :global(h4) { font-size: 15px; font-weight: 600; color: var(--text); }
  .final :global(strong) { color: var(--text); font-weight: 600; }
  .final :global(code) { font-family: var(--mono); font-size: 0.88em; color: var(--text); }
  .final :global(pre) { white-space: pre-wrap; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .lines { font-size: 12.5px; line-height: 1.75; display: grid; grid-template-columns: minmax(70px, max-content) 66px minmax(0, 1fr); gap: 2px 12px; background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .arrow-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--red); text-decoration: none; align-self: flex-start; }
  .pick { gap: 18px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 26px; }
  ol > li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 0 16px; }
  .number { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line-stronger); display: inline-flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 20px; color: var(--text); box-sizing: border-box; }
  .step { display: flex; flex-direction: column; gap: 12px; padding-top: 5px; min-width: 0; }
  .step-title { font-size: 16px; font-weight: 600; color: var(--text); }
  .step p { margin: 0; font-size: 14.5px; color: var(--muted); line-height: 1.6; text-wrap: pretty; }
  .block { display: flex; flex-direction: column; gap: 10px; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; overflow-wrap: anywhere; }
  pre.prompt { font-size: 12.5px; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .hint { font-size: 13px; color: var(--dim); }
  .fresh-link { font: inherit; font-size: 13px; color: var(--dim); background: none; border: 0; padding: 0; cursor: pointer; text-align: left; align-self: flex-start; }
  .fresh-link span { color: var(--red); font-weight: 600; }
  .side { gap: 18px; }
  .checks { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .checks li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .mark { width: 20px; height: 20px; border-radius: 999px; border: 1px dashed rgba(230, 180, 80, 0.5); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; }
  .mark.passed { background: rgba(156, 196, 154, 0.09); border: 1px solid rgba(156, 196, 154, 0.45); color: var(--green); }
  .check { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .check-head { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; color: var(--text); }
  .verdict { font-size: 12px; color: var(--amber); }
  .verdict.passed { color: var(--green); }
  .fact { font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
  .again { display: flex; flex-direction: column; gap: 10px; }
  .checked { font-size: 12.5px; color: var(--dim); }
  .reason { font-size: 12.5px; color: var(--amber); }
  .footnote { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.6; text-wrap: pretty; }
</style>
