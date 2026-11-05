import { expect, it } from "vitest";
import { CodexOutputReader } from "./codex-output.js";
import { stepStates } from "./session-output.js";
import type { SessionRecord } from "../state/records.js";
import { codexResumeCommand } from "../engine/snapshot.js";
import { resolve } from "node:path";

const at = "2026-10-23T18:00:00Z";
function session(): SessionRecord {
  return { schemaVersion: 4, agentId: "codex", sessionId: "local", phaseId: "1", kind: "phase", createdAt: at, model: "gpt-6.1-sol", effort: "high", modelDisplayName: "GPT-6.1-Sol", runs: [], sleeps: [], steps: [], conversation: { threadId: "parent" }, codex: { originalAccount: { at }, launchIntent: { version: "0.162.1", cwd: "/tmp", writableRoots: ["/tmp"], repositories: [{ path: "/tmp", branch: "feature/proof" }], skills: [{ name: "enso-method:deliverable-review", path: resolve("/skills/deliverable-review/SKILL.md") }] } } };
}

it("records only literal activity and never invents completion or fills earlier steps", () => {
  const record = session(); const reader = new CodexOutputReader(record, 0);
  const read = (command: string) => reader.read({ method: "item/started", params: { threadId: "parent", turnId: "t", item: { id: command, type: "commandExecution", cwd: "/tmp", command } } }, at);
  read("echo 'cat /skills/deliverable-review/SKILL.md; git commit; git push'");
  expect(record.steps).toEqual([]);
  read("/bin/zsh -lc 'cat /skills/deliverable-review/SKILL.md; git commit -m proof; git push'");
  expect(record.steps.map(step => step.name)).toEqual(["Deliverable review", "Commit", "Push"]);
  expect(stepStates(record.steps, "codex").map(step => [step.name, step.state])).toEqual([["Build", "unobserved"], ["Deliverable review", "observed"], ["Test hardening", "unobserved"], ["Commit", "observed"], ["Refactor pass", "unobserved"], ["Push", "observed"]]);
  expect(stepStates(record.steps).find(step => step.name === "Commit")?.state).toBe("finished");
});

it("deduplicates replay by thread, turn, item and source while separating child text and timestamp provenance", () => {
  const record = session(); const reader = new CodexOutputReader(record, 0);
  const event = { method: "item/completed", params: { threadId: "child", turnId: "child-turn", item: { id: "i", type: "agentMessage", text: "Child report" } } };
  const lines = reader.read(event, at, "turn").lines;
  expect(lines).toEqual([expect.objectContaining({ source: "subagent", threadId: "child", turnId: "child-turn", itemId: "i", parentThreadId: "parent", timestampSource: "turn", text: "Child report" })]);
  expect(reader.read(event, at).lines).toEqual([]);
  expect(new CodexOutputReader(record, lines.length, lines).read(event, at).lines).toEqual([]);
  expect(reader.read({ method: "item/agentMessage/delta", params: { threadId: "child", itemId: "next", delta: "partial" } }, at).partial).toEqual({ source: "subagent", threadId: "child", itemId: "next", text: "partial" });
  expect(reader.read({ ...event, params: { ...event.params, threadId: "parent" } }, at).lines[0]?.source).toBe("codex");
});

it("quotes every saved Codex command argument for POSIX and PowerShell", () => {
  const record = session(); record.model = "model'$(echo bad)"; record.effort = "high'quoted";
  const command = codexResumeCommand("/tmp/a ' folder", record, "darwin");
  expect(command).toContain("cd '/tmp/a '\\'' folder'");
  expect(command).toContain("'model'\\''$(echo bad)'");
  expect(command).toContain("model_reasoning_effort=");
  expect(codexResumeCommand("C:\\a ' folder", record, "win32")).toContain("'model''$(echo bad)'");
  delete record.effort;
  expect(codexResumeCommand("/tmp", record)).not.toContain("model_reasoning_effort");
});

// AC-VIEW-02: exact provider output content must survive normalization, not just exist.
it("retains Codex errors, command results and timestamped final messages", () => {
  const reader = new CodexOutputReader(session(), 0);
  expect(reader.read({ method: "error", params: { error: { message: "Model access refused", codexErrorInfo: "unauthorized" }, willRetry: false } }, at).lines).toEqual([
    expect.objectContaining({ agentId: "codex", source: "stderr", at, timestampSource: "arrival", text: '{"error":{"message":"Model access refused","codexErrorInfo":"unauthorized"},"willRetry":false}' }),
  ]);
  for (const [exitCode, status, source] of [[0, "completed", "out"], [7, "failed", "stderr"]] as const) {
    const lines = reader.read({ method: "item/completed", params: { threadId: "parent", turnId: "turn", item: { id: `command-${exitCode}`, type: "commandExecution", command: "npm test", aggregatedOutput: "Expected test output", status, exitCode } } }, at).lines;
    expect(lines).toEqual([
      expect.objectContaining({ source: "tool", text: "npm test", at, threadId: "parent", turnId: "turn" }),
      expect.objectContaining({ source, text: `Expected test output\nCommand ${status}; exit ${exitCode}`, at, agentId: "codex" }),
    ]);
  }
  expect(reader.read({ method: "item/completed", params: { threadId: "parent", turnId: "turn", item: { id: "final", type: "agentMessage", phase: "final", text: "Final Codex result" } } }, at).lines).toEqual([
    expect.objectContaining({ source: "codex", text: "Final Codex result", at, agentId: "codex", threadId: "parent", turnId: "turn", itemId: "final" }),
  ]);
});

// AC-VIEW-03: every named method step must stay separate and evidence-backed.
it("observes each published method skill without claiming completion of other steps", () => {
  const record = session();
  const skills = [
    ["implement-from-requirements", "Build"], ["deliverable-review", "Deliverable review"],
    ["test-hardening", "Test hardening"], ["refactor-pass", "Refactor pass"],
  ] as const;
  record.codex!.launchIntent.skills = skills.map(([name]) => ({ name: `enso-method:${name}`, path: resolve(`/skills/${name}/SKILL.md`) }));
  const reader = new CodexOutputReader(record, 0);
  for (const [index, [name, step]] of skills.entries()) {
    reader.read({ method: "item/started", params: { threadId: "parent", turnId: "turn", item: { id: name, type: "commandExecution", cwd: "/tmp", command: `cat /skills/${name}/SKILL.md` } } }, at);
    expect(record.steps.map(s => s.name)).toEqual(skills.slice(0, index + 1).map(([, expected]) => expected));
    expect(stepStates(record.steps, "codex").find(s => s.name === step)?.state).toBe("observed");
    expect(record.steps).toEqual(skills.slice(0, index + 1).map(([, name]) => ({ name, startedAt: at })));
  }
  expect(stepStates(record.steps, "codex").filter(s => s.state === "unobserved").map(s => s.name)).toEqual(["Commit", "Push"]);
});
