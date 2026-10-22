<script lang="ts">
  // A phase's Details, collapsed until the person opens it (PRD AC-WATCH-01, AC-WATCH-03). For a
  // multi-repository PRD, Commits lists each repository under its count: its worktree, branch and
  // commits, or its commits so far (multi-repo AC-PRS-03, AC-ADD-03).
  import { addedLabel, repositoryCommitsLine, type DetailRow } from "../lib/progress.js";
  import Icon from "./Icon.svelte";

  let { rows, indent = false }: { rows: DetailRow[]; indent?: boolean } = $props();
</script>

<details class:indent>
  <summary><span class="chev"><Icon name="chevron" size={12} /></span>Details</summary>
  <div class="body">
    <dl>
      {#each rows as row (row.term)}
        <dt>{row.term}</dt>
        <dd class:mono={row.mono}
          >{row.value}{#if row.repositories}<div class="repositories">
              {#each row.repositories as repository (repository.name)}
                {@render name(repository.name, repository.addedInPhase)}
                <div class="repo-lines"><span class="mono path">{repository.worktree}</span><span><span class="mono">{repository.branch}</span> · {repositoryCommitsLine(repository.commitCount, repository.latestCommit)}</span></div>
              {/each}
            </div>{:else if row.commits}<div class="repositories">
              {#each row.commits as repository (repository.name)}
                {@render name(repository.name, repository.addedInPhase)}
                <div class="repo-lines">{#each repository.commits as commit (commit.sha)}<span><span class="mono sha">{commit.sha.slice(0, 7)}</span> {commit.subject}</span>{/each}</div>
              {/each}
            </div>{/if}</dd
        >
      {/each}
    </dl>
  </div>
</details>

{#snippet name(repository: string, addedInPhase: string | undefined)}
  <div class="name"><span class="mono">{repository}</span>{#if addedInPhase !== undefined}<span class="tag">{addedLabel(addedInPhase)}</span>{/if}</div>
{/snippet}

<style>
  details { padding: 0; }
  details.indent { padding: 0 0 0 50px; }
  summary { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--dim); padding: 2px 0; }
  .chev { display: inline-flex; transition: transform 0.15s; }
  details[open] .chev { transform: rotate(90deg); }
  .body { padding: 10px 0 4px; }
  dl { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; font-size: 13px; }
  dt { color: var(--dim); }
  dd { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
  dd.mono { font-size: 12.5px; }
  .repositories { margin-top: 8px; padding-left: 14px; border-left: 1px solid var(--line); display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px 16px; }
  .name { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .name .mono { font-size: 12.5px; color: var(--text); }
  .repo-lines { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .repo-lines .mono { font-size: 12.5px; }
  .path { overflow-wrap: anywhere; }
  .sha { color: var(--text); }
</style>
