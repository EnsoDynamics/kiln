// Whether a stopped phase's latest conversation can be reopened, and why not (run restart
// technical design, "Whether the conversation can be reopened"). The check reports the cause as
// data; the page and the command line word it. Browser-safe: no Node imports.

export type ReopenReason = "missing" | "unsafe" | "not_a_file" | "no_messages" | "unreadable" | "reopen_failed" | "codex";
export type ReopenDefect = "writable_by_others" | "link" | "other_owner";

/**
 *   { state: "available" }
 *   { state: "unavailable", reason: "unsafe", path: "/home/dev/.claude/projects/-home-dev-work", defects: ["writable_by_others"], fixCommand: "chmod o-w /home/dev/.claude/projects/-home-dev-work" }
 *   { state: "safety", problems: ["Codex cleanup unresolved: …"] }
 */
export interface ReopenCheck {
  state: "available" | "unavailable" | "safety";
  reason?: ReopenReason;
  /** `unsafe`, `not_a_file`. */
  path?: string;
  /** `unsafe`. */
  defects?: ReopenDefect[];
  /** `unsafe`, only when `defects` is exactly `writable_by_others`. */
  fixCommand?: string;
  /** `codex`: the wording of the first Codex cause that applies. */
  detail?: string;
  /** `safety`: the recorded sentences of the phase's Codex safety problems. */
  problems?: string[];
}

const DEFECT_WORDS: Record<ReopenDefect, string> = {
  writable_by_others: "can be changed by other accounts on this computer",
  link: "is a link",
  other_owner: "belongs to another account",
};

/** "can be changed by other accounts on this computer and is a link". */
export function defectWords(defects: readonly ReopenDefect[]): string {
  const words = defects.map(defect => DEFECT_WORDS[defect]);
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The card's sentence for an unavailable check (AC-CARRY-02's table), as plain text. */
export function reopenSentence(check: ReopenCheck): string {
  switch (check.reason) {
    case "missing": return "Claude Code has no saved conversation for this session.";
    case "unsafe": return `Kiln won't hand the saved conversation back to an agent to act on unattended, because ${check.path} ${defectWords(check.defects ?? [])}.${check.fixCommand ? " To remove their access, run this, then check again:" : ""}`;
    case "not_a_file": return `The saved conversation isn't an ordinary file: ${check.path}.`;
    case "no_messages": return "The saved conversation has no messages Kiln can reopen.";
    case "unreadable": return "Kiln couldn't read the saved conversation.";
    case "reopen_failed": return "Kiln tried to reopen the conversation, and the agent stopped before it began.";
    case "codex": return check.detail ?? "Kiln couldn't open the saved Codex conversation.";
    default: return "";
  }
}

/** A path as one shell word: bare when it holds only safe characters, else single-quoted. */
export function shellWord(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`;
}

/** `chmod o-w <folder>` or `chmod go-w <file>`, given only when removing others' write access would clear it. */
export function fixCommandFor(path: string, defects: readonly ReopenDefect[], folder: boolean): string | undefined {
  if (defects.length !== 1 || defects[0] !== "writable_by_others") return undefined;
  return `chmod ${folder ? "o-w" : "go-w"} ${shellWord(path)}`;
}
