// A stand-in for Kiln's account and usage reader in the engine's tests (usage-limit recovery
// technical design, "Testing Approach"): each reading Kiln asks for takes the next scripted one,
// stamped with the test's clock, or waits for the test to deliver one when none is queued.

import type { AccountView, UsageLimit } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";

export type ScriptedReading = Partial<Omit<AccountView, "startedAt" | "updatedAt">>;

/** A signed-in reading of alex's Max plan with these limits. */
export const signedIn = (limits: UsageLimit[], account: ScriptedReading = {}): ScriptedReading => ({ email: "alex@acme-shop.dev", orgId: "org-alex", plan: "Max plan", limits, ...account });

/** A usage row as the reader labels it. */
export function usageRow(kind: "session" | "weekly_all", percent: number, resetsAt?: string): UsageLimit {
  const labels = kind === "session" ? { label: "5-hour window", shortLabel: "5-hour" } : { label: "Weekly", shortLabel: "weekly" };
  return { kind, ...labels, percent, nearLimit: percent >= 80, ...(resetsAt === undefined ? {} : { resetsAt }) };
}

/**
 *   const claude = new ScriptedClaude(now);
 *   claude.queue(signedIn([usageRow("session", 100)]), signedIn([usageRow("session", 12)]));
 *   claude.asked  // how many readings Kiln asked for
 */
export class ScriptedClaude implements ClaudeInfoSource {
  account: AccountView | undefined;
  readonly models = undefined;
  readonly modelListError = undefined;
  asked = 0;
  private readonly queued: ScriptedReading[] = [];
  private readonly listeners = new Set<() => void>();
  private reading: { startedAt: string; serve: (reading: ScriptedReading) => void; done: Promise<void> } | undefined;

  constructor(private readonly now: () => Date) {}

  queue(...readings: ScriptedReading[]): void {
    this.queued.push(...readings);
    if (this.reading && this.queued.length > 0) this.reading.serve(this.queued.shift()!);
  }

  /** Answers the reading Kiln is waiting on. */
  deliver(reading: ScriptedReading): void {
    if (!this.reading) throw new Error("Kiln isn't waiting for a reading.");
    this.reading.serve(reading);
  }

  get waiting(): boolean {
    return this.reading !== undefined;
  }

  refreshAccount(): Promise<void> {
    this.asked++;
    if (this.reading) return this.reading.done;
    const startedAt = this.now().toISOString();
    let serve!: (reading: ScriptedReading) => void;
    const done = new Promise<void>((resolve) => {
      serve = (reading) => {
        this.reading = undefined;
        this.account = { limits: [], ...reading, startedAt, updatedAt: this.now().toISOString() };
        for (const listener of this.listeners) listener();
        resolve();
      };
    });
    this.reading = { startedAt, serve, done };
    const next = this.queued.shift();
    if (next !== undefined) setImmediate(() => serve(next));
    return done;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
