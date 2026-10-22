<script lang="ts">
  // How to switch Claude accounts, on the waiting screen and a usage-limit Needs you (usage-limit
  // recovery AC-LIMIT-02): `claude auth login` to copy, and the form that fills in another
  // account's email as text to type, since its address is the person's to fill in.
  import CopyButton from "./CopyButton.svelte";

  const COMMAND = "claude auth login";
</script>

<div class="block">
  <pre>{COMMAND}</pre>
  <div><CopyButton text={COMMAND} /></div>
  <p class="hint">To fill in the other account’s email, add it: <span class="mono typed">claude auth login --email &lt;address&gt;</span></p>
</div>

<style>
  .block { display: flex; flex-direction: column; gap: 10px; }
  pre { margin: 0; white-space: pre-wrap; font-family: var(--mono); font-size: 13px; line-height: 1.7; color: var(--text); background: var(--deep); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; overflow-wrap: anywhere; }
  .hint { margin: 0; font-size: 13px; color: var(--dim); line-height: 1.6; }
  .typed { color: var(--muted); }
</style>
