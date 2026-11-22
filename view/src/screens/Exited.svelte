<script lang="ts">
  // After Exit Kiln (Kiln After Delivery AC-EXIT-02, mockup state 7): Kiln has exited, when, that the
  // page no longer updates, and the command that opens the PRD again. Shown from the `exited` event,
  // so the page never shows the disconnected banner.
  import type { ExitNotice } from "../../../src/engine/engine.js";
  import CopyButton from "../components/CopyButton.svelte";
  import { clockTime } from "../lib/time.js";

  // `several`: more than one pull request or repository, counted as the Exit Kiln button counts them.
  let { exit, several = false, now }: { exit: ExitNotice; several?: boolean; now: number } = $props();
  const when = $derived.by(() => { const time = clockTime(exit.at, new Date(now), { afterWord: true }); return /^\d/.test(time) ? `at ${time}` : time; });
  const where = $derived(exit.via === "browser" ? "You exited Kiln from this page" : "Kiln was exited from the command line");
  const stays = $derived(several ? "The pull requests and the worktrees stay as they are" : "The pull request and the worktree stay as they are");
</script>

<main class="exited">
  <section class="card" aria-labelledby="exited-h">
    <h2 id="exited-h">Kiln has exited</h2>
    <p>{where} {when}. Nothing is running. {stays}, and this page no longer updates.</p>
    <p class="sub">To open this PRD in Kiln again:</p>
    <div class="command"><pre class="mono">{exit.command}</pre><CopyButton text={exit.command} /></div>
  </section>
</main>

<style>
  .exited { max-width: 1120px; margin: 0 auto; padding: 40px 32px; }
  .card { display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-family: var(--serif); font-size: 32px; font-weight: 400; line-height: 1.1; }
  p { margin: 0; color: var(--muted); }
  .sub { font-size: 13.5px; }
  .command { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 14px; border-radius: 12px; background: var(--deep); border: 1px solid var(--line); }
  .command pre { flex: 1 1 auto; margin: 0; font-size: 13px; color: var(--text); white-space: pre-wrap; }
</style>
