<script lang="ts" module>
  export type IconName = "check" | "spinner" | "pause" | "warning" | "arrow" | "back" | "copy" | "chevron" | "check-again" | "pull-request" | "external" | "cross" | "play" | "clock";
</script>

<script lang="ts">
  // The mockups' line icons, drawn in the current color.
  let { name, size = 13, strokeWidth, spin = false }: { name: IconName; size?: number; strokeWidth?: number; spin?: boolean } = $props();
  const width = $derived(strokeWidth ?? ({ check: 2, spinner: 2, pause: 1.8, warning: 1.9, arrow: 1.9, back: 1.9, copy: 1.8, chevron: 2, "check-again": 1.8, "pull-request": 1.9, external: 1.8, cross: 2, play: 1.8, clock: 1.8 } as const)[name]);
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon" class:spin>
  {#if name === "check"}<path d="M3 8.5l3 3 7-7"></path>
  {:else if name === "spinner"}<path d="M8 2a6 6 0 1 1-6 6"></path>
  {:else if name === "pause"}<path d="M6 3.5v9M10 3.5v9"></path>
  {:else if name === "warning"}<path d="M8 2.5l6.2 11H1.8z"></path><path d="M8 6.8v3.2M8 12.1v.01"></path>
  {:else if name === "arrow"}<path d="M3 8h10M9 4l4 4-4 4"></path>
  {:else if name === "back"}<path d="M13 8H3M7 4L3 8l4 4"></path>
  {:else if name === "copy"}<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M3 10.5V3.8A1.3 1.3 0 0 1 4.3 2.5H11"></path>
  {:else if name === "chevron"}<path d="M6 4l4 4-4 4"></path>
  {:else if name === "check-again"}<circle cx="8" cy="8" r="2.4"></circle><path d="M1.5 8h4.1M10.4 8h4.1"></path>
  {:else if name === "pull-request"}<circle cx="4" cy="3.5" r="1.6"></circle><circle cx="4" cy="12.5" r="1.6"></circle><circle cx="12" cy="12.5" r="1.6"></circle><path d="M4 5.1v5.8M12 10.9V7a2 2 0 0 0-2-2H7.5"></path><path d="M9 3.5L7.5 5 9 6.5"></path>
  {:else if name === "play"}<path d="M5 3.2v9.6L12.6 8z"></path>
  {:else if name === "clock"}<circle cx="8" cy="8" r="6"></circle><path d="M8 4.8V8l2.2 1.6"></path>
  {:else if name === "external"}<path d="M6.5 3H3v10h10V9.5M9.5 3H13v3.5M13 3L7.5 8.5"></path>
  {:else}<path d="M4 4l8 8M12 4l-8 8"></path>{/if}
</svg>

<style>
  .icon { flex: 0 0 auto; display: block; }
  .spin { animation: kspin 1.1s linear infinite; }
  @keyframes kspin { to { transform: rotate(360deg); } }
</style>
