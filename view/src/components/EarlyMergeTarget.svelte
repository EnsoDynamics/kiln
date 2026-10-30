<script lang="ts">
  let { name, repository, branch, disabled, authorized = false, legacyEnvironment, mode, onauthorize }: {
    name: string; repository?: string; branch: string; disabled: boolean;
    authorized?: boolean; legacyEnvironment?: string; mode: "summary" | "grant";
    onauthorize?: () => void;
  } = $props();
</script>

<article class="merge-target" aria-label={`Early merges for ${name}`}>
  <div class="target-copy">
    <h4>{mode === "summary" ? "May merge into" : "Allow merging into"}{" "}<strong>{`${name} / ${branch || "Choose a base branch"}`}</strong></h4>
    <p class="repository">{repository ?? "Repository identity unavailable"}</p>
    {#if legacyEnvironment}<p class="legacy">Existing permission is limited to {legacyEnvironment}.</p>{/if}
  </div>
  {#if mode === "grant"}
    {#if authorized}<span class="authorized">Authorized for this run</span>
    {:else}<button type="button" disabled={disabled || !repository || !branch.trim()} onclick={() => onauthorize?.()}>Authorize early merges</button>{/if}
  {/if}
</article>

<style>
  .merge-target { display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: var(--panel); }
  .target-copy { min-width: 0; }
  h4 { margin: 0; font-size: 13px; font-weight: 400; line-height: 1.5; }
  p { margin: 5px 0 0; overflow-wrap: anywhere; line-height: 1.5; color: var(--muted); font-size: 12px; }
  strong { font-weight: 600; overflow-wrap: anywhere; }
  button { flex-shrink: 0; border: 1px solid var(--line); border-radius: 6px; padding: 9px 12px; background: transparent; color: var(--text); font: inherit; font-size: 12px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--line); }
  button:disabled { opacity: .45; cursor: default; }
  button:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
  .authorized { color: var(--muted); font-size: 12px; flex-shrink: 0; }
  @media (max-width: 640px) { .merge-target { align-items: flex-start; flex-direction: column; gap: 12px; } }
</style>
