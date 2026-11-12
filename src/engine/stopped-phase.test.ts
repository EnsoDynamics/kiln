// A stopped phase's facts and words (run restart "A Stopped Phase's Facts", "Whether the
// conversation can be reopened", "Carry on"): the latest launch and conversation, What Kiln found
// for each kind of failed launch, the reopen check's sentences and fix command, and the carry-on prompt.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendJsonLine } from "../state/state-files.js";
import { sessionFiles } from "../session/claude-session.js";
import { carryOnPrompt, CARRY_ON_MESSAGE_LIMIT } from "../session/prompts.js";
import { SCHEMA_VERSION, writeSessionRecord, type SessionRecord, type SessionRun } from "../state/records.js";
import { defectWords, fixCommandFor, reopenSentence, shellWord } from "./reopen-check.js";
import { latestConversation, latestLaunch, launchFailure, workSummary } from "./stopped-phase.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const state = () => { const directory = mkdtempSync(join(tmpdir(), "kiln-stopped-")); directories.push(directory); return directory; };
let count = 0;
function session(stateDirectory: string, runs: SessionRun[], agentId: "claude_code" | "codex" = "claude_code", init = false): SessionRecord {
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId, sessionId: `s${++count}`, phaseId: "1", kind: "phase", createdAt: "2026-11-11T21:00:00Z", model: "opus", modelDisplayName: "Opus", workingDirectory: "/w/acme-shop", runs, sleeps: [], steps: [] };
  writeSessionRecord(stateDirectory, record);
  const files = sessionFiles(stateDirectory, record);
  if (init) appendJsonLine(files.events, { at: runs[0]!.startedAt, event: { type: "system", subtype: "init" } });
  appendJsonLine(files.output, { line: 1, at: runs[0]?.startedAt ?? "", kind: "stderr", text: "No conversation found with session ID" });
  return record;
}
const run = (fields: Partial<SessionRun>): SessionRun => ({ startedAt: "2026-11-11T21:31:00Z", cause: "launch", ...fields });

describe("which session is the latest launch and which the latest conversation", () => {
  it("takes the session whose latest run started last, never a record with no run, and the last that began a conversation", () => {
    const directory = state();
    const began = session(directory, [run({ startedAt: "2026-11-11T21:00:00Z", pid: 1, exitCode: 0 })], "claude_code", true);
    const failed = session(directory, [run({ startedAt: "2026-11-11T21:40:00Z", pid: 2, exitCode: 1 })]);
    const held = session(directory, []);
    expect(latestLaunch([began, failed, held])?.sessionId).toBe(failed.sessionId);
    expect(latestConversation(directory, [began, failed, held])?.sessionId).toBe(began.sessionId);
    // A resume of the earlier conversation makes it the latest launch again.
    began.runs.push(run({ startedAt: "2026-11-11T21:50:00Z", cause: "person_resume", pid: 3 }));
    expect(latestLaunch([began, failed, held])?.sessionId).toBe(began.sessionId);
  });
});

describe("What Kiln found (AC-CASE-04)", () => {
  const found = (runs: SessionRun[], agentId: "claude_code" | "codex" = "claude_code", folder = "/w/acme-shop") => { const directory = state(); return launchFailure(directory, session(directory, runs, agentId), folder, "/w/acme-shop"); };
  it("words each kind of failed launch by the first matching row", () => {
    expect(found([run({ endedAt: "x", spawnError: { code: "CODEX_PREFLIGHT", message: "codex refused the profile" } })], "codex")).toMatchObject({ ran: "codex", sentence: "Kiln ran `codex` in the worktree, and it couldn't start a session.", error: "codex refused the profile" });
    expect(found([run({ endedAt: "x", spawnError: { code: "EAGAIN", message: "spawn claude EAGAIN" } })])).toMatchObject({ sentence: "Kiln ran `claude` in the worktree, and the computer couldn't start it.", error: "No conversation found with session ID" });
    expect(found([run({ pid: 4, interruptedBy: "sleep", interruptedAt: "y" })])!.sentence).toBe("Kiln ran `claude` in the worktree, and it was interrupted (the computer slept) before beginning a conversation.");
    expect(found([run({ pid: 4, endedAt: "y", exitCode: 1 })])!.sentence).toBe("Kiln ran `claude` in the worktree, and it exited with code 1 before beginning a conversation.");
    expect(found([run({ pid: 4, endedAt: "y", signal: "SIGKILL" })])!.sentence).toBe("Kiln ran `claude` in the worktree, and it was ended by SIGKILL before beginning a conversation.");
    expect(found([run({ pid: 4, endedAt: "y", codex: { failure: "turn/start failed" } as NonNullable<SessionRun["codex"]> })], "codex")).toMatchObject({ sentence: "Kiln ran `codex` in the worktree, and it stopped before beginning a conversation.", error: "turn/start failed" });
    expect(found([run({ pid: 4 })])!.sentence).toBe("Kiln ran `claude` in the worktree, and it stopped before beginning a conversation.");
    // A session folder other than the PRD's worktree is named.
    expect(found([run({ pid: 4, endedAt: "y", exitCode: 1 })], "claude_code", "/w/workspace")!.sentence).toContain("in /w/workspace,");
  });
  it("is absent once the session began a conversation", () => {
    const directory = state();
    expect(launchFailure(directory, session(directory, [run({ pid: 4, endedAt: "y", exitCode: 0 })], "claude_code", true), "/w/acme-shop", "/w/acme-shop")).toBeUndefined();
  });
});

describe("why the conversation can't be reopened (AC-CARRY-02)", () => {
  it("words each reason as the table does", () => {
    expect(reopenSentence({ state: "unavailable", reason: "missing" })).toBe("Claude Code has no saved conversation for this session.");
    expect(reopenSentence({ state: "unavailable", reason: "unsafe", path: "/p", defects: ["writable_by_others"], fixCommand: "chmod o-w /p" })).toBe("Kiln won't hand the saved conversation back to an agent to act on unattended, because /p can be changed by other accounts on this computer. To remove their access, run this, then check again:");
    expect(reopenSentence({ state: "unavailable", reason: "unsafe", path: "/p", defects: ["link", "other_owner"] })).toBe("Kiln won't hand the saved conversation back to an agent to act on unattended, because /p is a link and belongs to another account.");
    expect(reopenSentence({ state: "unavailable", reason: "not_a_file", path: "/p/x.jsonl" })).toBe("The saved conversation isn't an ordinary file: /p/x.jsonl.");
    expect(reopenSentence({ state: "unavailable", reason: "no_messages" })).toBe("The saved conversation has no messages Kiln can reopen.");
    expect(reopenSentence({ state: "unavailable", reason: "unreadable" })).toBe("Kiln couldn't read the saved conversation.");
    expect(reopenSentence({ state: "unavailable", reason: "reopen_failed" })).toBe("Kiln tried to reopen the conversation, and the agent stopped before it began.");
    expect(reopenSentence({ state: "unavailable", reason: "codex", detail: "Codex conversation cannot be opened: deadline" })).toBe("Codex conversation cannot be opened: deadline");
    expect(defectWords(["writable_by_others", "link", "other_owner"])).toBe("can be changed by other accounts on this computer, is a link and belongs to another account");
  });
  it("gives a fix command only when removing others' write access would clear it, quoted for the shell", () => {
    expect(fixCommandFor("/home/dev/.claude/projects/-home-dev", ["writable_by_others"], true)).toBe("chmod o-w /home/dev/.claude/projects/-home-dev");
    expect(fixCommandFor("/home/dev/x.jsonl", ["writable_by_others"], false)).toBe("chmod go-w /home/dev/x.jsonl");
    expect(fixCommandFor("/p", ["link"], true)).toBeUndefined();
    expect(fixCommandFor("/p", ["writable_by_others", "other_owner"], true)).toBeUndefined();
    expect(shellWord("/a b/it's")).toBe(`'/a b/it'\\''s'`);
  });
});

describe("the carry-on prompt (AC-CARRY-05)", () => {
  const values = { freshSession: "Use the implement-from-requirements skill to implement `docs/x/phase-1.md`.", work: [{ name: "acme-shop", commits: [{ sha: "a1b2c3d4e5f6", subject: "wip: form" }], uncommittedFiles: 2 }], multiRepository: false };
  it("is the fresh-session prompt, the reply with its policy, the last message verbatim and the work", () => {
    const prompt = carryOnPrompt({ ...values, note: " Merged now. ", lastMessage: "Blocked: `import` missing {{x}}." });
    const parts = prompt.split("\n\n");
    expect(parts[0]).toBe(values.freshSession);
    expect(prompt.indexOf("The person running Kiln says:\n\nMerged now.")).toBeGreaterThan(0);
    expect(prompt.indexOf("This session runs unattended.")).toBeGreaterThan(prompt.indexOf("Merged now."));
    expect(prompt).toContain("Blocked: `import` missing {{x}}.");
    expect(prompt).toContain("- `a1b2c3d` wip: form\n- 2 uncommitted files");
  });
  it("says when no message was recorded, leaves out an empty reply, and cuts a long message at 16,000 characters", () => {
    const none = carryOnPrompt(values);
    expect(none).toContain("No final message was recorded.");
    expect(none).not.toContain("The person running Kiln says:");
    const long = carryOnPrompt({ ...values, lastMessage: "x".repeat(CARRY_ON_MESSAGE_LIMIT + 50) });
    expect(long).toContain(`${"x".repeat(CARRY_ON_MESSAGE_LIMIT)}\n\n[Kiln cut this message at 16,000 characters.]`);
    expect(long).not.toContain("x".repeat(CARRY_ON_MESSAGE_LIMIT + 1));
  });
  it("names each repository's work when there are several", () => {
    expect(carryOnPrompt({ ...values, multiRepository: true, work: [...values.work, { name: "storefront", commits: [], uncommittedFiles: 0 }] })).toContain("- `storefront`:\n  - No commits\n  - No uncommitted files");
  });
});

describe("the work line", () => {
  it("counts commits and uncommitted files across repositories", () => {
    expect(workSummary({ repositories: [{ name: "a", commits: [], uncommittedFiles: 0 }], builtNothing: true })).toBe("No commits · no uncommitted changes");
    expect(workSummary({ repositories: [{ name: "a", commits: [{ sha: "1", subject: "" }, { sha: "2", subject: "" }], uncommittedFiles: 3 }], builtNothing: false })).toBe("2 commits · 3 uncommitted files");
  });
});
