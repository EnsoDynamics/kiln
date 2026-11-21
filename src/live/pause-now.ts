/**
 * The Pause now state (Kiln Pause Now technical design, "The Pause Now State"): the one projection
 * of a takeover hold that is not delivery recovery. The header, phase plan row, pause panel,
 * paused page, `kiln run`'s lines and `kiln status` all read it, never the hold's internals.
 * No Node imports: the browser view uses it too.
 *
 *   pausingRow({ phase: "pausing", running: [{ tool: "Bash", input: "npm test" }], stopped: false, ... })
 *   // { kind: "command", title: "Pausing — finishing the command it is running.", lines: ["Bash(npm test)"], lid: true }
 */
export interface OperationLabel { tool: string; input?: string }

export interface PauseNowView {
  phase: "pausing" | "paused";
  /** The running header's key for the activity: the leaf a split phase is working on ("2b" for launched "2"), or the audit's key. */
  activityKey: string;
  /** The running header's name for the activity at that time: "phase 2b", "delivery audit · round 2". */
  label: string;
  requestedAt: string;
  /** Present exactly when `phase` is "paused". */
  releasedAt?: string;
  /** The gate recorded the stop or the attempt ended: Cancel is withheld from here on. */
  stopped: boolean;
  /** Top-level operations still running and not backgrounded, oldest first. */
  running: OperationLabel[];
  /** Processes Claude started that the pause is still waiting on. */
  background?: { pid?: number; command?: string }[];
  /** The newest-admitted top-level operation in flight at the press and not backgrounded. */
  lastCommand?: OperationLabel;
  /** The last thing the agent said before the stop. */
  lastSaid?: string;
  /** Seconds since the last observed activity, from 30 on (AC-TAKE-05). */
  waitingSeconds?: number;
  /** Anything other than ordinary waiting for the attempt or its evidence. */
  obstacle?: { code: string; reason: string };
  cancel: { available: boolean; reason?: string };
  /** An attempt recovered from an earlier Kiln with no gate: the card says the session ended on its own. */
  gateless?: boolean;
}

export const LID_SENTENCE = "You can close the lid now: if the computer sleeps first, the pause completes when it wakes, and nothing new starts.";
export const BACKGROUND_NOTE = "Kiln won’t stop it for you; if it’s a server that keeps running, stop it and the pause completes.";
export const ALREADY_PAUSED = "Kiln had already paused. Press Resume once it’s paused to carry on.";

/** `Bash(npm test -- src/refunds)`, or the bare tool name with no input. */
export const operationText = (label: OperationLabel): string => label.input ? `${label.tool}(${label.input})` : label.tool;
/** A Bash command by its input alone, any other tool as `Tool(input)` (the paused card's sentence). */
export const commandText = (label: OperationLabel): string => label.tool === "Bash" && label.input ? label.input : operationText(label);
/** "npm run dev (process 48213)", the command alone with no pid, or "process 48213" alone with no command. */
export const backgroundText = (entry: { pid?: number; command?: string }): string => entry.command && entry.pid ? `${entry.command} (process ${entry.pid})` : entry.command ?? `process ${entry.pid}`;

export interface PausingRow {
  kind: "command" | "before_next" | "stopped" | "background" | "obstacle";
  title: string;
  /** The running commands or background processes, one per line. */
  lines: string[];
  /** Whether the lid sentence follows (never for an obstacle or a background process). */
  lid: boolean;
  /** The background row's closing sentence. */
  note?: string;
  /** Today's waiting line, shown below the row from 30 seconds after the last observed activity. */
  waiting?: string;
}

/** The pause panel's row while pausing (AC-PAUSE-03), in the design's precedence. */
export function pausingRow(view: Pick<PauseNowView, "running" | "background" | "stopped" | "waitingSeconds" | "obstacle">): PausingRow {
  const waiting = view.waitingSeconds !== undefined && view.waitingSeconds >= 30 ? { waiting: `Waiting ${view.waitingSeconds} seconds since the last observed activity.` } : {};
  if (view.obstacle) return { kind: "obstacle", title: "Pausing", lines: [], lid: false, ...waiting };
  if (view.running.length) return { kind: "command", title: "Pausing — finishing the command it is running.", lines: view.running.map(operationText), lid: true, ...waiting };
  if (view.background?.length) return { kind: "background", title: "Pausing — waiting for a process Claude started to end:", lines: view.background.map(backgroundText), lid: false, note: BACKGROUND_NOTE, ...waiting };
  if (view.stopped) return { kind: "stopped", title: "Pausing — Claude has stopped; Kiln is checking nothing is still running.", lines: [], lid: true, ...waiting };
  return { kind: "before_next", title: "Pausing — Claude isn't running a command; Kiln stops it before its next one.", lines: [], lid: true, ...waiting };
}

/** The command row's sentence after the command: "Kiln starts no more work after it." then the lid sentence. */
export const COMMAND_FOLLOW = "Kiln starts no more work after it.";

/** `kiln status`'s text while pausing: the row's title, then its lines joined with "; ", or the obstacle's reason. */
export function pausingStatusText(view: PauseNowView): string {
  if (view.obstacle) return `Pausing — ${view.obstacle.reason}`;
  const row = pausingRow(view);
  return row.lines.length ? `${row.title} ${row.lines.join("; ")}` : row.title;
}

/** The paused card's sentence (AC-PAUSE-05). */
export function pausedSentence(view: Pick<PauseNowView, "lastCommand" | "gateless">): string {
  if (view.gateless) return "The session ended on its own. Nothing is running.";
  return view.lastCommand ? `Kiln stopped after ${commandText(view.lastCommand)} finished. Nothing is running.` : "Kiln stopped before Claude's next command. Nothing is running.";
}
