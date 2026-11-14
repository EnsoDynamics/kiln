<script lang="ts">
  // Start a fresh session in your terminal (run restart AC-CARRY-01, AC-CARRY-06), beside the
  // carry-on card: the run's worktree and the recovery prompt. On a held page its copy buttons are
  // unavailable, saying why, while Claude is open on the conversation or the paused work still runs.
  import CopyButton from "./CopyButton.svelte";

  let { agent, activity, command, prompt, held, blocked }: { agent: string; activity: string; command: string; prompt: string; held: boolean; blocked?: string | undefined } = $props();
</script>

<section class="card fresh" aria-label="Start a fresh session in your terminal">
  <h2>Start a fresh session in your terminal</h2>
  <p>For a back-and-forth with {agent}. Start it in the run's worktree and give it the recovery prompt.</p>
  <pre>{command}</pre>
  {#if blocked}<p class="reason">{blocked}</p>
  {:else}<div class="actions"><CopyButton text={command} label="Copy terminal command" /><CopyButton text={prompt} label="Copy recovery prompt" /></div>{/if}
  <p class="hint"><strong>Changed the plan?</strong> Ask {agent} to record those decisions in the requirements before you exit.</p>
  {#if !held}<p>Finished {activity} there? Exit {agent}, then check it below.</p>{/if}
</section>

<style>
  .fresh { gap: 14px; min-width: 0; }
  h2 { margin: 0; font-size: 20px; line-height: 1.35; }
  p { margin: 0; color: var(--muted); line-height: 1.6; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--mono); padding: 14px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .hint { font-size: 12.5px; color: var(--dim); }
  .reason { font-size: 12.5px; color: var(--amber); }
</style>
