// The view's live link to Kiln: one event stream per open tab, carrying a snapshot on connect
// and on every change, and a heartbeat every 5 seconds. A stream error, or no heartbeat for 15
// seconds, is a lost connection; EventSource keeps retrying, and the first snapshot back
// restores the live view (technical design, "Connection").

import type { Snapshot } from "../../../src/engine/snapshot.js";
import type { PageConfig } from "./api.js";

const HEARTBEAT_TIMEOUT_MS = 15_000;

export class Connection {
  snapshot = $state<Snapshot | undefined>(undefined);
  connected = $state(false);
  /** When the last event arrived, for "updated <n>s ago". */
  lastEventAt = $state<number | undefined>(undefined);
  private source: EventSource | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly config: PageConfig) {}

  open(): void {
    const source = new EventSource(`/api/events?token=${encodeURIComponent(this.config.token)}`);
    this.source = source;
    source.addEventListener("snapshot", (event) => {
      this.snapshot = JSON.parse((event as MessageEvent<string>).data) as Snapshot;
      this.alive();
    });
    source.addEventListener("heartbeat", () => this.alive());
    source.addEventListener("error", () => this.lost());
  }

  close(): void {
    clearTimeout(this.watchdog);
    this.source?.close();
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
