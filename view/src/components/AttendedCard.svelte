<script lang="ts">
  // The planned-as-needing-you card (build preflight AC-ATTEND-03, mockup state 4): the first card
  // of the main column on every Needs you layout when the stopped phase's document carries an
  // Attended line, giving that line's text. A heads-up only.
  let { text }: { text: string } = $props();
</script>

<section class="card attended" aria-label="Planned as needing you">
  <span class="eyebrow">This phase was planned as needing you</span>
  {#if text}<p>{text}</p>{/if}
</section>

<style>
  .attended { border-color: var(--amber-border); gap: 10px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--amber); }
  p { margin: 0; font-size: 15.5px; line-height: 1.55; color: var(--text); }
</style>
