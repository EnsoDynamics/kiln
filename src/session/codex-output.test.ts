import { expect, it } from "vitest";
import { CodexOutputReader } from "./codex-output.js";
import { stepStates } from "./session-output.js";
import type { SessionRecord } from "../state/records.js";
import { codexResumeCommand } from "../engine/snapshot.js";

const at = "2026-10-23T18:00:00Z";
function session(): SessionRecord {
  return { schemaVersion: 4, agentId: "codex", sessionId: "local", phaseId: "1", kind: "phase", createdAt: at, model: "gpt-6.1-sol", effort: "high", modelDisplayName: "GPT-6.1-Sol", runs: [], sleeps: [], steps: [], conversation: { threadId: "parent" }, codex: { originalAccount: { at }, launchIntent: { version: "0.162.1", cwd: "/tmp", writableRoots: ["/tmp"], repositories: [{ path: "/tmp", branch: "feature/proof" }], skills: [{ name: "enso-method:deliverable-review", path: "/skills/deliverable-review/SKILL.md" }] } } };
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
  const command = codexResumeCommand("/tmp/a ' folder", record);
  expect(command).toContain("cd '/tmp/a '\\'' folder'");
  expect(command).toContain("'model'\\''$(echo bad)'");
  expect(command).toContain("model_reasoning_effort=");
  expect(codexResumeCommand("C:\\a ' folder", record, "win32")).toContain("'model''$(echo bad)'");
  delete record.effort;
  expect(codexResumeCommand("/tmp", record)).not.toContain("model_reasoning_effort");
});
