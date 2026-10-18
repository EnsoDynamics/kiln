<script lang="ts" module>
  /**
   * A pill's look, each with one meaning (PRD AC-LOOK-04): red is the phase in progress, amber
   * what needs the person, green done.
   */
  export type PillTone = "red" | "amber" | "amber-outline" | "green" | "green-tint" | "outline" | "strong-outline" | "dashed";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";

  let { tone, icon, spin = false, large = false, children }: { tone: PillTone; icon?: IconName; spin?: boolean; large?: boolean; children: Snippet } = $props();
</script>

<span class="pill {tone}" class:large>{#if icon}<Icon name={icon} {spin} />{/if}{@render children()}</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 1.2; white-space: nowrap; border: 1px solid transparent; }
  .large { padding: 8px 16px; font-size: 14px; }
  .red { background: var(--red); color: var(--bg); border-color: var(--red); }
  .amber { background: var(--amber); color: var(--bg); border-color: var(--amber); }
  .amber-outline { border-color: rgba(230, 180, 80, 0.6); color: var(--amber); }
  .green { background: var(--green); color: var(--bg); border-color: var(--green); }
  .green-tint { background: rgba(156, 196, 154, 0.09); color: var(--green); border-color: rgba(156, 196, 154, 0.45); }
  .outline { border-color: var(--line-stronger); color: var(--text); }
  .strong-outline { border-color: rgba(237, 232, 221, 0.4); color: var(--text); }
  .dashed { border-style: dashed; border-color: var(--line-stronger); color: var(--dim); }
</style>
