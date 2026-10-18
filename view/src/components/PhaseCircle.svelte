<script lang="ts" module>
  export type CircleTone = "done" | "split" | "implementing" | "planned" | "next" | "amber";
</script>

<script lang="ts">
  // A phase's number in its circle, in every state (PRD AC-LOOK-03).
  let { id, tone }: { id: string; tone: CircleTone } = $props();
</script>

<span class="circle mono {tone}">{id === "pr" ? "PR" : id}</span>

<style>
  .circle { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 12.5px; box-sizing: border-box; border: 1px solid transparent; }
  .done { background: rgba(156, 196, 154, 0.09); border-color: rgba(156, 196, 154, 0.45); color: var(--green); font-weight: 600; }
  .split { border-color: var(--line-stronger); color: var(--muted); }
  .implementing { background: var(--red); border-color: var(--red); color: var(--bg); font-weight: 600; }
  .planned { border-style: dashed; border-color: var(--line-stronger); color: var(--dim); }
  .next { border-color: rgba(237, 232, 221, 0.4); color: var(--text); }
  .amber { border-color: rgba(230, 180, 80, 0.6); color: var(--amber); font-weight: 600; }
</style>
