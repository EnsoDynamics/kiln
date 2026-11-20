<script lang="ts">
  // The Audit loops section (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01, AC-CHOICE-02;
  // mockup screen 1): Max delivery audit loops and Max test audit loops, each a whole number of 1
  // or more with help text worked out from the values shown. Documents found saves each change
  // into its draft; the run's settings panel changes the run's settings, as keep-awake does, with
  // each field's minimum at the runs of that audit already made (the snapshot's floor) and, once
  // the pull request session has started, a line saying a change applies to a continuation. A
  // value out of range is a field error, the server's own when it refuses; nothing is clamped.
  import type { AuditLoopsView } from "../../../src/engine/loop-view.js";
  import type { AuditLoopSettings } from "../../../src/state/audit-loops.js";
  import { changeSettings, type PageConfig } from "../lib/api.js";
  import { FROZEN_LINE, LIMIT_ERROR, loopSettingsHelp, parsedLimit, refusalShown } from "../lib/audit-loops.js";

  let { settings, config, view, disabled = false, short = false }: { settings: AuditLoopSettings; config: PageConfig; view?: AuditLoopsView; disabled?: boolean; short?: boolean } = $props();

  type Limit = "deliveryLimit" | "testLimit";
  // A typed limit stays as typed until it is saved or found out of range.
  let drafts = $state<Partial<Record<Limit, string>>>({});
  let fieldErrors = $state<Partial<Record<Limit, string>>>({});
  let reason = $state<string | undefined>(undefined);
  const shown = (field: Limit) => drafts[field] ?? String(settings[field]);
  const floor = (field: Limit) => (field === "deliveryLimit" ? view?.delivery.floor : view?.test.floor) ?? 1;
  // The help reads the numbers in the fields, so it follows what the person types.
  const help = $derived(loopSettingsHelp({ deliveryLimit: parsedLimit(shown("deliveryLimit")) ?? settings.deliveryLimit, testLimit: parsedLimit(shown("testLimit")) ?? settings.testLimit }, short));

  async function save(change: Partial<AuditLoopSettings>): Promise<boolean> {
    reason = undefined;
    const answer = await changeSettings(config, { auditLoops: change as AuditLoopSettings });
    if (answer.ok) return true;
    const shownRefusal = refusalShown(answer);
    fieldErrors = { ...fieldErrors, ...shownRefusal.fields };
    reason = shownRefusal.reason;
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
    // Below the floor the server refuses with its own words, which the field shows.
    if (await save({ [field]: value })) delete drafts[field];
  }
</script>

<fieldset class="loops" class:short aria-describedby="loops-intro">
  <legend class="eyebrow">Audit loops</legend>
  <span id="loops-intro" class="help">{help.intro}</span>

  {@render limit("deliveryLimit", "Max delivery audit loops", help.delivery)}
  {@render limit("testLimit", "Max test audit loops", help.test)}

  {#if reason}<span class="message">{reason}</span>{/if}
  {#if view?.frozen}<span class="help">{FROZEN_LINE}</span>{:else}<span class="help">{help.changeable}</span>{/if}
</fieldset>

{#snippet limit(field: Limit, label: string, text: string)}
  <div class="field">
    <label for={`loops-${field}`}>{label}</label>
    <input id={`loops-${field}`} type="number" min={floor(field)} step="1" inputmode="numeric" value={shown(field)} {disabled} aria-invalid={fieldErrors[field] ? "true" : undefined}
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
  label { font-size: 13px; font-weight: 500; color: var(--muted); }
  input[type="number"] { height: 44px; width: 96px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--field, var(--deep)); color: var(--text); font-size: 14px; box-sizing: border-box; }
  input:disabled { opacity: 0.6; }
  .help { font-size: 12.5px; font-weight: 400; color: var(--dim); line-height: 1.55; }
  .message { font-size: 12.5px; font-weight: 400; color: var(--amber); line-height: 1.55; }
</style>
