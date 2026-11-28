<script lang="ts">
  // Above the feature name, where the screen is and whose it is (PRD AC-LOOK-05): the
  // repository's name and the PRD folder, or, until the PRD's folder exists, the source material
  // folder or the initiative and planned PRD (AC-BEGIN-07). The feature name is largest except on Phase detail,
  // where it is compact context above the phase title (AC-LOOK-02).
  import type { Snippet } from "svelte";
  import type { Snapshot } from "../../../src/engine/snapshot.js";

  let { repositoryName, prdFolder, location, name, layout = "documents", children }: { repositoryName: string; prdFolder: string; location?: Snapshot["feature"]["location"]; name: string; layout?: "documents" | "progress" | "detail"; children?: Snippet } = $props();
</script>

<div class="header {layout}">
  <div class="where"><span>Repository <span class="mono value">{repositoryName}</span></span>{#if location?.kind === "source_material"}<span>Source material <span class="mono value">{location.folder}</span></span>{:else if location?.kind === "planned_prd"}<span>Initiative <span class="mono value">{location.initiative}</span></span><span>Planned PRD <span class="mono value">{location.prd}</span></span>{:else}<span>PRD folder <span class="mono value">{prdFolder}</span></span>{/if}</div>
  <h1>{name}</h1>
  {#if children}<div class="state">{@render children()}</div>{/if}
</div>

<style>
  .header { display: flex; flex-direction: column; gap: 14px; }
  .header.progress { gap: 16px; }
  .header.detail { gap: 10px; }
  .where { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 20px; font-size: 13px; color: var(--dim); }
  .value { color: var(--muted); }
  h1 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(48px, 6.4vw, 76px); line-height: 0.98; letter-spacing: -0.01em; color: var(--text); }
  .detail { gap: 6px; }
  .detail h1 { font-family: var(--sans); font-size: 18px; line-height: 1.4; letter-spacing: 0; color: var(--muted); }
  .state { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
</style>
