<script lang="ts">
  // The account panel for each agent the run can use (Kiln Phase Model Tiers AC-AGENTS-03): the
  // in-use agent's first, marked as in use beside another's.
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { accountsShown } from "../lib/agents.js";
  import { thresholdInForce } from "../lib/models.js";
  import AccountPanel from "./AccountPanel.svelte";

  let { snapshot, paused, notStarted = false, pullRequest = false, only, now }: { snapshot: Snapshot; paused: boolean; notStarted?: boolean; pullRequest?: boolean; only?: (agentId: string) => boolean; now: number } = $props();
  const shown = $derived(accountsShown(snapshot).filter(({ agent }) => !only || only(agent.agentId)));
</script>

{#each shown as { agent, account } (agent.agentId)}
  <AccountPanel {account} agent={agent.agent} {paused} {notStarted} {pullRequest} markInUse={accountsShown(snapshot).length > 1} threshold={thresholdInForce(snapshot.settings.models)} {now} />
{/each}
