<script lang="ts">
  // The Audit loops section (Kiln Audit Loop Limits AC-LOOP-01, AC-LOOP-05, AC-LOOP-06; mockup
  // screens 0 and 1): the two limits and the choice after the last test audit loop, each with help
  // text worked out from the values shown, and the default's sentence beside the choice that gives
  // it. Documents found saves each change into its draft; the run's settings panel changes the
  // run's settings, as keep-awake does. A value out of range is a field error; nothing is clamped.
  import type { AuditLoopSettings } from "../../../src/state/audit-loops.js";
  import { changeSettings, type PageConfig } from "../lib/api.js";
  import { AFTER_LAST_TEST_LABELS, LIMIT_ERROR, loopSettingsHelp, parsedLimit } from "../lib/audit-loops.js";
  import { clockTime } from "../lib/time.js";

  let { settings, config, disabled = false, short = false, now = Date.now() }: { settings: AuditLoopSettings; config: PageConfig; disabled?: boolean; short?: boolean; now?: number } = $props();

  type Limit = "deliveryLimit" | "testLimit";
  // A typed limit stays as typed until it is saved or found out of range.
  let drafts = $state<Partial<Record<Limit, string>>>({});
  let fieldErrors = $state<Partial<Record<Limit, string>>>({});
  let reason = $state<string | undefined>(undefined);
  const shown = (field: Limit) => drafts[field] ?? String(settings[field]);
  // The help reads the numbers in the fields, so it follows what the person types.
  const help = $derived(loopSettingsHelp({ deliveryLimit: parsedLimit(shown("deliveryLimit")) ?? settings.deliveryLimit, testLimit: parsedLimit(shown("testLimit")) ?? settings.testLimit }, short));
  const source = $derived(settings.afterLastTestSource);
  const sourceLine = $derived(
    !source ? undefined
      : source.kind === "kiln_for_earlier_run" ? "Applied by Kiln because this run began before the setting existed."
      : `Your choice, ${source.where === "documents_found" ? "on Documents found" : source.where === "run_page" ? "on the run’s page" : "with kiln settings"}, ${clockTime(source.at, new Date(now), { afterWord: true })}.`,
  );

  async function save(change: Partial<AuditLoopSettings>): Promise<boolean> {
    reason = undefined;
    const answer = await changeSettings(config, { auditLoops: change as AuditLoopSettings });
    if (answer.ok) return true;
    if (answer.fieldErrors && (answer.fieldErrors.deliveryLimit || answer.fieldErrors.testLimit)) {
      fieldErrors = { ...fieldErrors, ...(answer.fieldErrors.deliveryLimit ? { deliveryLimit: answer.fieldErrors.deliveryLimit } : {}), ...(answer.fieldErrors.testLimit ? { testLimit: answer.fieldErrors.testLimit } : {}) };
    } else reason = answer.reason;
    return false;
  }

  function typed(field: Limit, text: string) {
    drafts[field] = text;
    fieldErrors[field] = undefined;
  }

  async function committed(field: Limit) {
    const text = drafts[field];
    if (text === undefined) return;
    const value = parsedLimit(text);
    if (value === undefined) { fieldErrors[field] = LIMIT_ERROR; return; }
    if (value === settings[field]) { delete drafts[field]; return; }
    if (await save({ [field]: value })) delete drafts[field];
  }
</script>

<fieldset class="loops" class:short aria-describedby="loops-intro">
  <legend class="eyebrow">Audit loops</legend>
  <span id="loops-intro" class="help">{help.intro}</span>

  {@render limit("deliveryLimit", "Delivery audit loops, at most", help.delivery)}
  {@render limit("testLimit", "Test audit loops, at most", help.test)}

  <div class="field" role="radiogroup" aria-labelledby="after-last-h">
    <span id="after-last-h" class="label">After the last test audit loop</span>
    {#each (["deliver_unless_serious", "stop_and_ask"] as const) as choice (choice)}
      {@const selected = settings.afterLastTest === choice}
      <label class="choice" class:selected>
        <input type="radio" name="after-last-test" value={choice} checked={selected} {disabled} onchange={() => save({ afterLastTest: choice })} />
        <span class="choice-text"><span class="choice-name">{AFTER_LAST_TEST_LABELS[choice]}</span><span class="help">{choice === "deliver_unless_serious" ? help.deliver : help.ask}</span></span>
      </label>
    {/each}
    {#if short && sourceLine}<span class="help">{sourceLine}</span>{/if}
  </div>
  {#if reason}<span class="message">{reason}</span>{/if}
  {#if !short}<span class="help">{help.changeable}</span>{/if}
</fieldset>

{#snippet limit(field: Limit, label: string, text: string)}
  <div class="field">
    <label for={`loops-${field}`}>{label}</label>
    <input id={`loops-${field}`} type="number" min="1" step="1" inputmode="numeric" value={shown(field)} {disabled} aria-invalid={fieldErrors[field] ? "true" : undefined}
      oninput={(event) => typed(field, event.currentTarget.value)} onchange={() => committed(field)} />
    {#if fieldErrors[field]}<span class="message">{fieldErrors[field]}</span>{/if}
    <span class="help">{text}</span>
  </div>
{/snippet}

<style>
  .loops { margin: 0; padding: 16px 0 0; border: 0; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .loops legend { float: left; width: 100%; padding: 0; margin: 0; }
  .loops legend + * { clear: both; }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  label, .label { font-size: 13px; font-weight: 500; color: var(--muted); }
  input[type="number"] { height: 44px; width: 96px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field, var(--deep)); color: var(--text); font-size: 14px; box-sizing: border-box; }
  input:disabled { opacity: 0.6; }
  .help { font-size: 12.5px; font-weight: 400; color: var(--dim); line-height: 1.55; }
  .message { font-size: 12.5px; font-weight: 400; color: var(--amber); line-height: 1.55; }
  .choice { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 0 12px; align-items: start; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line-strong); cursor: pointer; }
  .choice.selected { padding: 11px 13px; border: 2px solid var(--text); }
  .choice input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--red); }
  .choice-text { display: flex; flex-direction: column; gap: 3px; }
  .choice-name { font-size: 14.5px; font-weight: 600; color: var(--text); }
  .short .choice-name { font-size: 14px; }
</style>
