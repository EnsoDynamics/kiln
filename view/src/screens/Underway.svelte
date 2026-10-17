<script lang="ts">
  // The browser view for a feature already underway. Its progress screens (Running, Paused,
  // Needs you, Complete) are Phase 5 of Kiln v1; until then the shared frame names the feature
  // and the terminal reports each phase (PRD AC-START-09).
  import type { Snapshot } from "../../../src/engine/snapshot.js";
  import FeatureHeader from "../components/FeatureHeader.svelte";

  let { snapshot }: { snapshot: Snapshot } = $props();
</script>

<main>
  <FeatureHeader repositoryName={snapshot.feature.repositoryName} prdFolder={snapshot.feature.prdFolder} name={snapshot.feature.name}>
    <span class="lead">Kiln reports each phase in the terminal it runs in.</span>
  </FeatureHeader>
</main>

<style>
  main { max-width: 1160px; margin: 0 auto; padding: 48px clamp(16px, 4vw, 32px) 96px; box-sizing: border-box; display: flex; flex-direction: column; gap: 32px; }
  .lead { font-size: 14px; color: var(--muted); }
</style>
