<script lang="ts">
  // The billing summary of each agent the run can use (Kiln Phase Model Tiers AC-AGENTS-02).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import { neededAgents } from "../lib/agents.js";
  import BillingPanel from "./BillingPanel.svelte";

  let { snapshot, connected = true }: { snapshot: Snapshot; connected?: boolean } = $props();
</script>

{#each neededAgents(snapshot).filter((agent) => agent.billing) as agent (agent.agentId)}
  <BillingPanel {snapshot} {agent} {connected} />
{/each}
