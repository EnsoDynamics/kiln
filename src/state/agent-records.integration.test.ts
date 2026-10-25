// State compatibility uses actual owner-only JSON/output files, without an agent executable.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { readOutputLines } from "../session/claude-session.js";
import { writeJsonAtomically } from "./state-files.js";
import { readPrdRecord, readSessionRecord, prdRecordPath, sessionDirectory, SCHEMA_VERSION } from "./records.js";
let sandbox: Sandbox;
afterEach(() => sandbox?.cleanup());
describe("agent record compatibility", () => {
  it.each([1, 2, 3])("migrates schema %s to Claude without changing saved choices, waits, paths or conversation keys", (version) => {
    sandbox = createSandbox();
    const phase = { sessionIds: ["original-conversation"], finishedByPerson: false, repositories: {}, outsideConfirmations: [{ at: "2026-10-22T00:00:00Z" }], wait: { sessionId: "original-conversation", run: 0, checks: [], checkedAt: "checked", since: "waiting" } };
    const settings = { model: "saved-retired-alias", effort: "max", workspaceFolder: "/original/workspace", worktreePath: "/original/worktree", featureBranch: "feature/original", baseBranch: "develop", bases: {}, keepAwake: false, resumeAfterUsageLimit: false };
    writeJsonAtomically(prdRecordPath(sandbox.root), { schemaVersion: version, repository: { name: "repo", mainCheckoutPath: "/original/repo", github: "fixture/repo" }, settings, phases: { "1": phase }, repositories: [], pause: {}, prdDirectory: "docs/prds/original" });
    const file = join(sessionDirectory(sandbox.root, "1", "original-conversation"), "session.json");
    writeJsonAtomically(file, { schemaVersion: version, sessionId: "original-conversation", phaseId: "1", kind: "phase", model: "saved-model", effort: "high", runs: [{ startedAt: "before", account: { email: "original@example.test" } }], steps: [] });
    const before = readFileSync(file, "utf8");
    const record = readPrdRecord(sandbox.root)!;
    expect(record.settings).toMatchObject({ agentId: "claude_code", agentChoices: { claude_code: { model: "saved-retired-alias", effort: "max" } }, worktreePath: settings.worktreePath, resumeAfterUsageLimit: false });
    expect(record.settings).not.toHaveProperty("model"); expect(record.phases["1"]!.wait).toEqual(phase.wait);
    const session = readSessionRecord(sandbox.root, "1", "original-conversation")!;
    expect(session).toMatchObject({ schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: "original-conversation", model: "saved-model", effort: "high", runs: [{ account: { email: "original@example.test" } }] });
    expect(session).not.toHaveProperty("originalAccount");
    expect(readFileSync(file, "utf8")).toBe(before); // Reading migration does not rewrite history.
  });
  it("rejects future session/output records and unknown agents before any write", () => {
    sandbox = createSandbox();
    const file = join(sessionDirectory(sandbox.root, "1", "saved"), "session.json");
    writeJsonAtomically(file, { schemaVersion: SCHEMA_VERSION + 1, sessionId: "saved", phaseId: "1", kind: "phase" });
    const before = readFileSync(file, "utf8");
    expect(() => readSessionRecord(sandbox.root, "1", "saved")).toThrow("Update Kiln");
    expect(() => readOutputLines(sandbox.root, { sessionId: "saved", phaseId: "1", kind: "phase" })).toThrow("Update Kiln");
    expect(readFileSync(file, "utf8")).toBe(before);
    writeJsonAtomically(file, { schemaVersion: 4, agentId: "unknown", sessionId: "saved" });
    expect(() => readSessionRecord(sandbox.root, "1", "saved")).toThrow("Unknown Kiln agent");
  });
});
