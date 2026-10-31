import { expect, it } from "vitest";
import { ClaudeBackgroundWork } from "./claude-background-work.js";

// Pure lifecycle reduction of the real Claude 2.1.316 task event contract.
it("uses complete membership rather than out-of-order task bookends", () => {
  const work = new ClaudeBackgroundWork();
  work.observe({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "review", run_id: "one" }] });
  work.observe({ type: "system", subtype: "task_notification", task_id: "review", run_id: "one", status: "completed" });
  expect(work.pending).toBe(true);
  work.observe({ type: "system", subtype: "background_tasks_changed", tasks: [] });
  work.observe({ type: "system", subtype: "task_started", task_id: "review", run_id: "one" });
  expect(work.pending).toBe(false);
});

it.each(["completed", "failed", "stopped"])("drains older streams only after every task is terminal (%s)", status => {
  const work = new ClaudeBackgroundWork();
  for (const task_id of ["review", "tests"]) work.observe({ type: "system", subtype: "task_started", task_id, run_id: "one" });
  work.observe({ type: "result", result: "Waiting for review" });
  work.observe({ type: "system", subtype: "task_progress", task_id: "review", run_id: "one" });
  work.observe({ type: "system", subtype: "task_notification", task_id: "tests", run_id: "one", status });
  expect(work.pending).toBe(true);
  work.observe({ type: "system", subtype: "task_notification", task_id: "review", run_id: "one", status });
  expect(work.pending).toBe(false);
});

it("does not let an old task run settle its resumed run", () => {
  const work = new ClaudeBackgroundWork();
  work.observe({ type: "system", subtype: "task_notification", task_id: "review", run_id: "one", status: "completed" });
  work.observe({ type: "system", subtype: "task_started", task_id: "review", run_id: "one" });
  expect(work.pending).toBe(false);
  work.observe({ type: "system", subtype: "task_started", task_id: "review", run_id: "two" });
  work.observe({ type: "system", subtype: "task_notification", task_id: "review", run_id: "one", status: "completed" });
  expect(work.pending).toBe(true);
});

it("fails visibly on malformed complete membership", () => {
  const work = new ClaudeBackgroundWork();
  expect(() => work.observe({ type: "system", subtype: "background_tasks_changed", tasks: null })).toThrow("membership");
});

it("ignores housekeeping while following a watcher's ambient-to-active transitions", () => {
  const work = new ClaudeBackgroundWork();
  work.observe({ type: "system", subtype: "task_started", task_id: "watch", run_id: "one", ambient: true });
  expect(work.pending).toBe(false);
  work.observe({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "watch", run_id: "one", ambient: true }] });
  expect(work.pending).toBe(false);
  work.observe({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "watch", run_id: "one", ambient: false }] });
  expect(work.pending).toBe(true);
  work.observe({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "watch", run_id: "one", ambient: true }] });
  expect(work.pending).toBe(false);
});
