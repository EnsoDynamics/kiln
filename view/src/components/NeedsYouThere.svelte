<script lang="ts">
  // The Needs you there marker beside a phase planned as needing a person (build preflight
  // AC-ATTEND-01, mockup states 1 and 3): pointing at it or focusing it shows the phase document's
  // Attended line, and a press toggles that text, so it works without a pointer. A heads-up only.
  let { text }: { text: string } = $props();
  let open = $state(false);
  const uid = $props.id();
  const id = `attended-${uid}`;
</script>

<span class="marker" class:open>
  <button type="button" class="needs-you-there" aria-expanded={open} aria-describedby={id} onclick={() => (open = !open)}>Needs you there</button>
  <span {id} role="tooltip" class="attended-text">{text}<span class="source">From the phase document's Attended line</span></span>
</span>

<style>
  .marker { position: relative; display: inline-flex; flex: none; }
  .needs-you-there { padding: 3px 10px; border-radius: 999px; background: transparent; border: 1px solid var(--amber-border); color: var(--amber); font: 600 12px/1.4 var(--sans); cursor: pointer; white-space: nowrap; }
  .needs-you-there:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  .attended-text { display: none; position: absolute; left: 0; top: calc(100% + 6px); z-index: 5; width: 320px; max-width: 80vw; box-sizing: border-box; background: #26241e; border: 1px solid var(--amber-border); border-radius: 10px; padding: 10px 12px; font-size: 13px; font-weight: 400; line-height: 1.5; color: var(--text); white-space: normal; text-align: left; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
  .source { display: block; margin-top: 4px; font-size: 12px; color: var(--dim); }
  .marker:hover .attended-text, .marker:focus-within .attended-text, .marker.open .attended-text { display: block; }
</style>
