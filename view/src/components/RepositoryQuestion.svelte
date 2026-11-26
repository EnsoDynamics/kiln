<script lang="ts">
  // The question Kiln asks when it can't tell where a repository's checkout is
  // (docs/changes/kiln-find-repositories-anywhere/mockups/kiln-find-repositories-anywhere.html,
  // states 2 and 3; find repositories anywhere AC-ASK-01 to AC-ASK-03, AC-FIND-03): where it is,
  // with any checkout found that Kiln can't deliver to listed and not pickable, or which of the
  // checkouts found to use, or another folder. The answer's failed check shows beside the field.
  import type { QuestionView } from "../../../src/engine/snapshot.js";
  import { countWord } from "../lib/progress.js";

  let { question, disabled = false, onanswer }: { question: QuestionView; disabled?: boolean; onanswer: (folder: string) => Promise<{ ok: boolean; reason?: string }> } = $props();

  const ANOTHER = "\u0000another";
  // The field and the choice belong to the view; a refused answer leaves them as they were.
  // svelte-ignore state_referenced_locally
  let typed = $state(question.field ?? "");
  let choice = $state<string | undefined>(undefined);
  let other = $state("");
  let sending = $state(false);
  let refused = $state<string | undefined>(undefined);

  const shownError = $derived(refused ?? question.fieldError);
  const answer = $derived(question.kind === "where" ? typed.trim() : choice === ANOTHER ? other.trim() : choice ?? "");
  const ready = $derived(!disabled && !sending && answer !== "");

  async function send() {
    if (!ready) return;
    sending = true;
    refused = undefined;
    const result = await onanswer(answer);
    sending = false;
    if (!result.ok) refused = result.reason;
  }
</script>

<div class="question">
  {#if question.kind === "which"}
    <span class="sentence">Kiln found {countWord(question.found)} {question.found === 1 ? "checkout" : "checkouts"} of <span class="mono code">{question.repository}</span>. Which should it use?</span>
  {:else}
    <span class="sentence">Kiln couldn’t find a checkout of <span class="mono code">{question.repository}</span>{question.checkouts.length > 0 ? " that it can deliver to" : ""}. It searched outward from <span class="mono code">{question.searchedFrom}/</span>{#if question.searchedTo === undefined}{", never above your home folder."}{:else}, as far as <span class="mono code">{question.searchedTo}/</span>.{/if}</span>
  {/if}

  {#each question.checkouts as checkout (checkout.folder)}
    {#if question.kind === "which" && checkout.pickable}
      <label class="option">
        <input type="radio" name="checkout-{question.repository}" value={checkout.folder} checked={choice === checkout.folder} disabled={disabled || sending} onchange={() => { choice = checkout.folder; refused = undefined; }} />
        <span class="where"><span class="mono folder">{checkout.folder}</span>{#if checkout.remote}<span class="mono remote">{checkout.remote}</span>{/if}{#if checkout.remembered}<span class="aside">You told Kiln where this is</span>{/if}</span>
      </label>
    {:else}
      <div class="option unpickable">
        <span></span>
        <span class="where"><span class="mono folder">{checkout.folder}</span><span class="mono remote">{checkout.remote}</span><span class="aside">Not on GitHub. Kiln delivers only to GitHub.</span></span>
      </div>
    {/if}
  {/each}

  {#if question.kind === "which"}
    <label class="option">
      <input type="radio" name="checkout-{question.repository}" value={ANOTHER} checked={choice === ANOTHER} disabled={disabled || sending} onchange={() => { choice = ANOTHER; refused = undefined; }} />
      <span class="another"><span class="another-label">Another folder</span><input type="text" class="mono small" placeholder="~/…" aria-label="Another folder" value={other} disabled={disabled || sending} oninput={(event) => { other = event.currentTarget.value; choice = ANOTHER; refused = undefined; }} onkeydown={(event) => { if (event.key === "Enter") void send(); }} /></span>
    </label>
    {#if shownError}<span class="message">{shownError}</span>{/if}
    <div class="foot"><span class="note">Kiln remembers this on this computer only. Nothing is written to any repository.</span><button type="button" class="use" class:ready disabled={!ready} onclick={send}>Use this checkout</button></div>
  {:else}
    <label class="ask" for="where-{question.repository}">Where is it on this computer?</label>
    <div class="row">
      <input id="where-{question.repository}" type="text" class="mono" value={typed} disabled={disabled || sending} oninput={(event) => { typed = event.currentTarget.value; refused = undefined; }} onkeydown={(event) => { if (event.key === "Enter") void send(); }} />
      <button type="button" class="use" class:ready disabled={!ready} onclick={send}>Use this folder</button>
    </div>
    {#if shownError}<span class="message">{shownError}</span>{/if}
    <span class="note">Kiln remembers this on this computer only. Nothing is written to any repository.</span>
  {/if}
</div>

<style>
  .question { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--amber-border); background: rgba(230, 180, 80, 0.05); }
  .sentence { font-size: 14px; color: var(--text); }
  .code { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
  .option { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 0 12px; align-items: center; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field); cursor: pointer; }
  .option.unpickable { opacity: 0.5; cursor: default; }
  .option input[type="radio"] { width: 16px; height: 16px; margin: 0; accent-color: var(--red); }
  .where { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .folder { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
  .remote { font-size: 12px; color: var(--dim); overflow-wrap: anywhere; }
  .aside { font-size: 12px; color: var(--dim); }
  .another { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; }
  .another-label { font-size: 13.5px; color: var(--muted); }
  .ask { font-size: 13px; font-weight: 500; color: var(--muted); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
  input[type="text"] { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field); color: var(--text); font-size: 13px; box-sizing: border-box; width: 100%; }
  input.small { height: 34px; padding: 0 10px; border-radius: 8px; background: transparent; }
  .use { height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; color: var(--dim); font-family: var(--sans); font-size: 14px; font-weight: 600; white-space: nowrap; cursor: not-allowed; }
  .use.ready { background: var(--red); border-color: var(--red); color: var(--bg); cursor: pointer; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .note { font-size: 12.5px; color: var(--dim); }
  .message { font-size: 12.5px; color: var(--amber); line-height: 1.55; }
</style>
