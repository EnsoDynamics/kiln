<script lang="ts">
  // A phase's Model tier tag (Kiln Phase Model Tiers AC-TIER-02, mockups 1 and 2): Demanding,
  // Standard, Mechanical or Not rated, with an information control. Pointing at it, focusing it
  // or pressing it shows the explanation; nothing of it shows otherwise.
  import type { TierView } from "../../../src/engine/activity-models.js";
  import { TIER_LABELS, tierExplanation } from "../lib/models.js";

  let { tier }: { tier: TierView } = $props();
  let open = $state(false);
  const uid = $props.id();
  const id = `tier-${uid}`;
  const explanation = $derived(tierExplanation(tier));
</script>

<span class="tier" class:open data-tier={tier.value}>
  <span class="tag" class:strong={tier.value === "demanding"} class:dashed={tier.value === "not_rated"}>{TIER_LABELS[tier.value]}<button type="button" class="info" aria-label={explanation.heading} aria-expanded={open} aria-describedby={id} onclick={() => (open = !open)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"></circle><path d="M8 7.2v4M8 4.8v.2"></path></svg></button></span>
  <span {id} role="tooltip" class="explanation"><span class="heading">{explanation.heading}</span><span class="body">{explanation.body}</span>{#if explanation.source}<span class="source">{explanation.source}</span>{/if}</span>
</span>

<style>
  .tier { position: relative; display: inline-flex; flex: none; }
  .tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 10px; border-radius: 999px; border: 1px solid var(--line-strong, rgba(237, 232, 221, 0.24)); font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .tag.strong { color: var(--text); border-color: rgba(237, 232, 221, 0.4); }
  .tag.dashed { border-style: dashed; }
  .info { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 22px; margin: -2px 0; padding: 0; border: 0; background: transparent; color: var(--dim); cursor: pointer; }
  .info:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; border-radius: 6px; }
  .explanation { display: none; position: absolute; left: 0; top: calc(100% + 6px); z-index: 5; width: 360px; max-width: 80vw; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: #0d0c0a; border: 1px solid rgba(237, 232, 221, 0.24); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); flex-direction: column; gap: 6px; white-space: normal; text-align: left; }
  .heading { font-size: 13px; font-weight: 600; color: var(--text); }
  .body { font-size: 13px; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
  .source { font-size: 12.5px; color: var(--dim); }
  .tier:hover .explanation, .tier:focus-within .explanation, .tier.open .explanation { display: flex; }
</style>
