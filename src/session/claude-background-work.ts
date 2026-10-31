import type { StreamEvent } from "./session-output.js";

/** Per-process provider facts, never an interpretation of the assistant's prose. */
export class ClaudeBackgroundWork {
  private membership: Set<string> | undefined;
  private runs = new Set<string>();
  private ended = new Set<string>();

  get pending(): boolean { return (this.membership ?? this.runs).size > 0; }

  observe(event: StreamEvent): void {
    if (event.type !== "system") return;
    // Newer CLIs emit complete membership. Edge ordering around this level is
    // unspecified, so once available it is the only source for the running set.
    if (event.subtype === "background_tasks_changed") {
      if (!Array.isArray(event.tasks) || event.tasks.some(task => !task || typeof task.task_id !== "string" || !task.task_id)) throw new Error("Invalid Claude background-task membership.");
      this.membership = new Set(event.tasks.filter(task => task.ambient !== true).map(task => task.task_id as string));
      return;
    }
    if (this.membership || typeof event.task_id !== "string") return;
    const key = JSON.stringify([event.task_id, event.run_id ?? null]);
    if (event.subtype === "task_started" && event.ambient !== true && !this.ended.has(key)) this.runs.add(key);
    if (event.subtype === "task_notification" && ["completed", "failed", "stopped"].includes(String(event.status))) {
      this.runs.delete(key); this.ended.add(key);
    }
  }
}
