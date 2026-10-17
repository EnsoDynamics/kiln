// What Kiln knows of Claude Code beyond a session: the signed-in account with its usage, and
// the model list. Both calls start right after the instance lock is taken and are never
// awaited; each reaches the snapshot when it returns (technical design, "Startup order").

import { readAccount, type AccountView } from "./claude-account.js";
import { modelListErrorMessage, readModelList, type ModelEntry } from "./model-list.js";

/** What the engine and the snapshot read: the account, the model list, or the list's error. */
export interface ClaudeInfoSource {
  readonly account: AccountView | undefined;
  readonly models: ModelEntry[] | undefined;
  /** The amber line beside Model when the list can't be read (UI-011 item 3). */
  readonly modelListError: string | undefined;
  onChange(listener: () => void): () => void;
}

export interface ClaudeInfoOptions {
  claude: string;
  env: NodeJS.ProcessEnv;
  /** The PRD's state directory: the calls' working directory, so no project's settings load. */
  cwd: string;
}

/**
 *   const claude = new ClaudeInfo({ claude: "/usr/local/bin/claude", env: process.env, cwd: stateDirectory });
 *   claude.start();          // not awaited
 *   claude.models            // undefined until the list returns
 */
export class ClaudeInfo implements ClaudeInfoSource {
  account: AccountView | undefined;
  models: ModelEntry[] | undefined;
  modelListError: string | undefined;
  private readonly abort = new AbortController();
  private readonly listeners = new Set<() => void>();
  private accountReading: Promise<void> | undefined;

  constructor(private readonly options: ClaudeInfoOptions) {}

  /** Starts the account, usage and model-list calls in parallel. */
  start(): void {
    void this.refreshAccount();
    void readModelList({ ...this.options, signal: this.abort.signal }).then((result) => {
      if (this.abort.signal.aborted) return;
      if (result.ok) this.models = result.models;
      else this.modelListError = modelListErrorMessage(result.error);
      this.changed();
    });
  }

  /** Reads the account and its usage again; a refresh asked for while one runs joins it. */
  refreshAccount(): Promise<void> {
    this.accountReading ??= readAccount({ ...this.options, signal: this.abort.signal })
      .then((account) => {
        if (this.abort.signal.aborted) return;
        this.account = account;
        this.changed();
      })
      .finally(() => (this.accountReading = undefined));
    return this.accountReading;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Ends any call still running; for when Kiln stops. */
  close(): void {
    this.abort.abort();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
