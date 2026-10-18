// The view's live link to Kiln: one event stream per open tab, carrying a snapshot on connect
// and on every change, new output lines and live text of the working session, and a heartbeat
// every 5 seconds. A stream error, or no heartbeat for 15 seconds, is a lost connection;
// EventSource keeps retrying, and the first snapshot back restores the live view (technical
// design, "Connection").

import type { Snapshot } from "../../../src/engine/snapshot.js";
import type { OutputLine, PartialText } from "../../../src/session/session-output.js";
import type { PageConfig } from "./api.js";

const HEARTBEAT_TIMEOUT_MS = 15_000;

export type OutputEvent = { sessionId: string; lines: OutputLine[] };
export type PartialEvent = { sessionId: string } & PartialText;

export class Connection {
  snapshot = $state<Snapshot | undefined>(undefined);
  connected = $state(false);
  /** When the last event arrived, for "updated <n>s ago" and, once disconnected, "last seen". */
  lastEventAt = $state<number | undefined>(undefined);
  private source: EventSource | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private readonly outputListeners = new Set<(event: OutputEvent) => void>();
  private readonly partialListeners = new Set<(event: PartialEvent) => void>();

  constructor(private readonly config: PageConfig) {}

  open(): void {
    const source = new EventSource(`/api/events?token=${encodeURIComponent(this.config.token)}`);
    this.source = source;
    source.addEventListener("snapshot", (event) => {
      this.snapshot = JSON.parse((event as MessageEvent<string>).data) as Snapshot;
      this.alive();
    });
    source.addEventListener("output", (event) => {
      const output = JSON.parse((event as MessageEvent<string>).data) as OutputEvent;
      for (const listener of this.outputListeners) listener(output);
      this.alive();
    });
    source.addEventListener("partial", (event) => {
      const partial = JSON.parse((event as MessageEvent<string>).data) as PartialEvent;
      for (const listener of this.partialListeners) listener(partial);
      this.alive();
    });
    source.addEventListener("heartbeat", () => this.alive());
    source.addEventListener("error", () => this.lost());
  }

  close(): void {
    clearTimeout(this.watchdog);
    this.source?.close();
  }

  onOutput(listener: (event: OutputEvent) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onPartial(listener: (event: PartialEvent) => void): () => void {
    this.partialListeners.add(listener);
    return () => this.partialListeners.delete(listener);
  }

  private alive(): void {
    this.connected = true;
    this.lastEventAt = Date.now();
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.lost(), HEARTBEAT_TIMEOUT_MS);
  }

  private lost(): void {
    clearTimeout(this.watchdog);
    this.connected = false;
  }
}
