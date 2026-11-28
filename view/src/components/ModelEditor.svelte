<script lang="ts">
  // The one editor for a model choice (Kiln Phase Model Tiers, "Command line": one editor and one
  // omitted-effort rule): the agent, then a model or model family it offers, then an effort that
  // choice takes. A row's Change, the Audits line and each side of a Model defaults row use it. An
  // agent whose list can't be read offers no choices and says why. `onchange` hears every choice the
  // editor holds, its own adjustments included; `onpick` hears only what a person picked, for a
  // caller that must not take the editor's adjustment as a change.
  import { effortWord, startingEffort, type EditorAgent } from "../lib/models.js";

  type Choice = { agentId: string; value: string; effort?: string };
  let { agents, agentId, value, effort, label, disabled = false, onchange, onpick }: {
    agents: EditorAgent[]; agentId: string; value: string | undefined; effort: string | undefined; label: string; disabled?: boolean;
    onchange: (choice: Choice) => void; onpick?: (choice: Choice) => void;
  } = $props();

  const agent = $derived(agents.find(one => one.agentId === agentId) ?? agents[0]);
  const option = $derived(agent?.options.find(one => one.value === value) ?? agent?.options[0]);
  const shownEffort = $derived(startingEffort(option, effort));

  // Whatever the editor shows is the choice it holds, so Done saves exactly what is on screen.
  $effect(() => {
    if (agent && option && (agent.agentId !== agentId || option.value !== value || shownEffort !== effort)) onchange({ agentId: agent.agentId, value: option.value, ...(shownEffort ? { effort: shownEffort } : {}) });
  });

  /** A person's own pick on one of the editor's controls. */
  function picked(choice: Choice) { onchange(choice); onpick?.(choice); }

  function pickAgent(id: string) {
    const next = agents.find(one => one.agentId === id);
    const first = next?.options[0];
    picked({ agentId: id, value: first?.value ?? "", ...(first && startingEffort(first, effort) ? { effort: startingEffort(first, effort)! } : {}) });
  }
</script>

<div class="editor" role="group" aria-label={label}>
  <div class="line">
    <span class="name">Agent</span>
    <span class="agents">
      {#each agents as one (one.agentId)}
        <label class="agent"><input type="radio" name={`${label}-agent`} value={one.agentId} checked={one.agentId === agent?.agentId} {disabled} onchange={() => pickAgent(one.agentId)} />{one.agent}</label>
      {/each}
    </span>
  </div>
  {#if agent?.problem}
    <span class="problem">{agent.problem}</span>
  {:else if agent}
    <label class="line"><span class="name">Model</span>
      <select value={option?.value} {disabled} onchange={(event) => { const next = agent.options.find(one => one.value === event.currentTarget.value); picked({ agentId: agent.agentId, value: event.currentTarget.value, ...(startingEffort(next, effort) ? { effort: startingEffort(next, effort)! } : {}) }); }}>
        {#each agent.options as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
      </select>
    </label>
    {#if option && option.efforts.length}
      <label class="line"><span class="name">Effort</span>
        <select value={shownEffort} {disabled} onchange={(event) => picked({ agentId: agent.agentId, value: option.value, effort: event.currentTarget.value })}>
          {#each option.efforts as one (one)}<option value={one}>{effortWord(one).charAt(0).toUpperCase() + effortWord(one).slice(1)}</option>{/each}
        </select>
      </label>
    {/if}
  {/if}
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; margin-top: 6px; border: 1px solid var(--line-strong); border-radius: 10px; }
  .line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .name { width: 52px; font-size: 12.5px; color: var(--dim); }
  .agents { display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .agent { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text); cursor: pointer; }
  select { height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--field, var(--deep)); color: var(--text); font-size: 13.5px; }
  .problem { font-size: 12.5px; color: var(--amber); line-height: 1.5; }
</style>
