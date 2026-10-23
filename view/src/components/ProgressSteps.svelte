<script lang="ts">
  // Phase detail's Progress panel (PRD AC-WATCH-04): the six steps down the page, each started
  // step with the time it started and what Kiln saw (assumptions UI-010 item 11), each unreached
  // step with what starts it. The current step keeps its spinner only while the session runs
  // (UI-010 item 2).
  import { stepTime } from "../lib/time.js";
  import Icon from "./Icon.svelte";

  type Step = { name: string; state: "finished" | "current" | "unreached" | "observed" | "unobserved"; startedAt?: string };
  let { steps, live, reviewerWorking = false, now }: { steps: Step[]; live: boolean; reviewerWorking?: boolean; now: number } = $props();

  const STARTED: Record<string, { line: string; seen: string }> = {
    Build: { line: "implement-from-requirements skill started", seen: "skill call" },
    "Deliverable review": { line: "deliverable-review skill started", seen: "skill call" },
    "Test hardening": { line: "test-hardening skill started", seen: "skill call" },
    Commit: { line: "first git commit seen", seen: "Bash call" },
    "Refactor pass": { line: "refactor-pass skill started", seen: "skill call" },
    Push: { line: "git push seen", seen: "Bash call" },
  };
  const WAITING: Record<string, string> = {
    Build: "Starts when the session calls the implement-from-requirements skill",
    "Deliverable review": "Starts when the session calls the deliverable-review skill",
    "Test hardening": "Starts when the session calls the test-hardening skill",
    Commit: "Kiln sees the session’s first git commit",
    "Refactor pass": "Starts when the session calls the refactor-pass skill. It commits its own change, if it makes one; most often it makes none.",
    Push: "Kiln sees the session’s git push, which sends the feature commit and any refactor commit",
  };

  function lineOf(step: Step): string {
    if (step.state === "unobserved") return "Unobserved — no reliable activity evidence";
    if (step.state === "observed") return "Activity observed; completion unobserved";
    if (step.state === "unreached") return WAITING[step.name] ?? "";
    const line = STARTED[step.name]?.line ?? "";
    return step.name === "Deliverable review" && step.state === "current" && reviewerWorking && live ? `${line}; its reviewer subagent is working` : line;
  }
</script>

<section class="card progress">
  <div class="head"><span class="eyebrow">Progress</span><span class="source">Read from the session’s tool calls and Git</span></div>
  <ol>
    {#each steps as step, index (step.name)}
      <li class={step.state}>
        <span class="rail">
          <span class="dot">{#if step.state === "finished"}<Icon name="check" strokeWidth={2.1} />{:else if step.state === "current" && live}<Icon name="spinner" size={14} spin />{/if}</span>
          {#if index < steps.length - 1}<span class="rule"></span>{/if}
        </span>
        <span class="words"><span class="name">{step.name}</span><span class="line">{lineOf(step)}</span></span>
        <span class="when mono">{#if step.startedAt}{stepTime(step.startedAt, new Date(now))}<span>{STARTED[step.name]?.seen}</span>{/if}</span>
      </li>
    {/each}
  </ol>
  <p class="note">{steps.some(step => step.state === "observed" || step.state === "unobserved") ? "Codex activity does not prove a step finished. Unobserved steps stay unobserved when later work appears. Completion still depends on Kiln’s checks." : "Kiln can see a skill start but not when it ends, so a step counts as finished once the next one starts. No skill writes status for Kiln."}</p>
</section>

<style>
  .progress { gap: 18px; }
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px 16px; }
  .source { font-size: 13px; color: var(--dim); white-space: nowrap; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 0 14px; align-items: stretch; }
  .rail { display: flex; flex-direction: column; align-items: center; }
  .dot { width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
  .finished .dot { background: var(--deep); border: 1px solid var(--line-stronger); color: var(--muted); }
  .current .dot { background: var(--red); color: var(--bg); }
  .unreached .dot { border: 1px dashed var(--line-stronger); }
  .rule { flex: 1 1 auto; width: 1px; background: var(--line-stronger); margin-top: 4px; }
  .words { display: flex; flex-direction: column; gap: 3px; padding: 3px 0 22px; }
  .name { font-size: 15px; font-weight: 500; color: var(--text); }
  .current .name { font-weight: 600; color: var(--red); }
  .unreached .name { color: var(--dim); }
  .line { font-size: 13.5px; color: var(--muted); overflow-wrap: anywhere; }
  .unreached .line { color: var(--dim); }
  .when { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding-top: 4px; font-size: 12px; color: var(--dim); white-space: nowrap; }
  .note { margin: 0; font-size: 12.5px; color: var(--dim); line-height: 1.6; text-wrap: pretty; }
</style>
