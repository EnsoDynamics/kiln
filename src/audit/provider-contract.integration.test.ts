// Recorded native provider contracts complement the retained actual-provider proofs.
// These tests drive real process pipes and files; they do not run paid inference.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, installStandIns } from "../test-support/git-repositories.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { newPrdRecord } from "../state/new-record.js";
import { SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import type { AuditActivity } from "./contracts.js";
import { hashBytes } from "./storage.js";
import { resolveAuditSkill } from "./workflow.js";
import { collectProviderEvidence } from "./provider-evidence.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(close => close())); });

describe("installed audit skill contracts (AC-RUN-04)", () => {
  it.each(["delivery_audit", "test_audit"] as const)("resolves both providers' exact %s source and refuses unavailable skills", async kind => {
    const sandbox = createSandbox(); cleanups.push(() => sandbox.cleanup());
    const name = kind === "delivery_audit" ? "delivery-audit" : "test-audit";
    const bytes = `# ${name}\nRecorded enabled audit skill.\n`;
    const folder = join(sandbox.env.CLAUDE_CONFIG_DIR!, "skills", name);
    mkdirSync(folder, { recursive: true }); const path = join(folder, "SKILL.md"); writeFileSync(path, bytes);
    const commands = join(sandbox.root, "commands.json"); writeFileSync(commands, JSON.stringify([name]));
    const tools = installStandIns(join(sandbox.root, "bin"));
    const codex = installCodexMetadataFixture(sandbox);
    codex.set({ additionalSkills: [name], skillPath: path });
    const expected = { name, path, digest: hashBytes(bytes) };
    const options = { kind, claude: tools.claude, codex: codex.executable, cwd: sandbox.root, signal: AbortSignal.timeout(15_000) };
    await expect(resolveAuditSkill({ ...options, agent: "claude_code", env: { ...sandbox.env, KILN_STANDIN_COMMANDS: commands } })).resolves.toEqual(expected);
    await expect(resolveAuditSkill({ ...options, agent: "codex", env: codex.env })).resolves.toEqual(expected);
    writeFileSync(commands, "[]");
    await expect(resolveAuditSkill({ ...options, agent: "claude_code", env: { ...sandbox.env, KILN_STANDIN_COMMANDS: commands } })).rejects.toThrow(`Enable exactly one ${name}`);
    for (const metadata of [{}, { additionalSkills: [name], disabledSkill: name }]) {
      codex.set(metadata);
      await expect(resolveAuditSkill({ ...options, agent: "codex", env: codex.env })).rejects.toThrow(`Cannot resolve one enabled installed ${name}`);
    }
    const alternative = join(sandbox.root, "other-SKILL.md"); writeFileSync(alternative, bytes);
    codex.set({ additionalSkills: [name], skillPath: path, skillEntries: [{ name, path: alternative, enabled: true }] });
    await expect(resolveAuditSkill({ ...options, agent: "codex", env: codex.env })).rejects.toThrow("found 2");
    writeFileSync(commands, JSON.stringify([name, `enso-method:${name}`]));
    await expect(resolveAuditSkill({ ...options, agent: "claude_code", env: { ...sandbox.env, KILN_STANDIN_COMMANDS: commands } })).rejects.toThrow(`Enable exactly one ${name}`);
    expect(codex.calls().some(call => /^(turn|thread)\//.test(call.method))).toBe(false);
  });
});

describe("native Codex audit catalog (AC-TEST-01, AC-RUN-04)", () => {
  it.each(["qualified", "wrong ciphertext", "wrong receiver", "missing output"])("collects only owned skill, command and delegated evidence: %s", async mode => {
    const f = historyFixture(); cleanups.push(() => f.sandbox.cleanup());
    const skillPath = join(f.root, "SKILL.md"); const skillBytes = "# test-audit\nNative fixture skill source.\n"; writeFileSync(skillPath, skillBytes);
    // The successful native command shape is independently covered by the captured
    // silent-command fixture; here its output is the actual pinned skill bytes.
    const command = `cat '${skillPath.replaceAll("'", "'\\''")}'`;
    const parent = f.addThread("parent", { command, native: ["/bin/zsh", "-lc", command] });
    Object.assign(parent.turns[0]!.items[0]!, { command, cwd: f.root, exitCode: 0, aggregatedOutput: skillBytes });
    if (mode === "missing output") delete parent.turns[0]!.items[0]!.aggregatedOutput;
    const recorded = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/codex-audit-proof/delegated-audit-assessment-0.162.1.json", import.meta.url)), "utf8")) as { parent: { type: string; payload: Record<string, unknown> }[]; child: { type: string; payload: Record<string, unknown> }[] };
    parent.turns[0]!.items.push({ type: "subAgentActivity", id: recorded.parent[0]!.payload.call_id, agentThreadId: "child", kind: "started" });
    const child = f.addThread("child", { parent: "parent" });
    const parentPath = parent.metadata.path; const childPath = child.metadata.path;
    const parentRows = readFileSync(parentPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
    const terminal = parentRows.pop()!;
    parentRows.push(...recorded.parent, terminal);
    writeFileSync(parentPath, parentRows.map(row => f.record(row.type, row.payload)).join(""));
    const childRows = readFileSync(childPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
    childRows[0]!.payload.agent_path = mode === "wrong receiver" ? "/root/unrelated" : "/root/classify_test";
    if (mode === "wrong ciphertext") {
      const content = recorded.child[0]!.payload.content as { encrypted_content?: string }[];
      content.find(block => block.encrypted_content)!.encrypted_content = "different-task";
    }
    // Child history includes the exact parent's inherited prefix, as the real reader requires.
    const inherited = parentRows.slice(1).map(row => f.record(row.type, row.payload)).join("");
    writeFileSync(childPath, f.record(childRows[0]!.type, childRows[0]!.payload) + inherited + childRows.slice(1, -1).map(row => f.record(row.type, row.payload)).join("") + recorded.child.map(row => f.record(row.type, row.payload)).join(""));
    f.save();
    const record = newPrdRecord({ mainCheckoutPath: f.root, repositoryName: "proof", github: "example/proof", prdDirectoryFromRoot: "docs/prds/proof", featureName: "Audit contract", settings: { workspaceFolder: f.sandbox.root, worktreePath: f.root, featureBranch: "develop", baseBranch: "develop", bases: {}, model: "sonnet", effort: "low", keepAwake: false, resumeAfterUsageLimit: false } });
    record.repositories = [{ name: "proof", kind: "prd", mainCheckoutPath: f.root, github: "example/proof", baseBranch: "develop", worktreePath: f.root, setupCompletedAt: "2026-10-23T14:00:00Z" }];
    const activity: AuditActivity = { activityId: "audit-contract", sequence: 1, kind: "test_audit", round: 1, continuationIndex: 1, createdAt: "2026-10-23T14:00:00Z", sessionIds: ["audit-session"], reportPath: "docs/prds/proof/kiln-audit-contract.json", skill: { name: "test-audit", path: skillPath, digest: hashBytes(skillBytes) }, snapshots: [], attempts: [] };
    const session: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "codex", sessionId: "audit-session", activityId: activity.activityId, phaseId: "", kind: "test_audit", createdAt: activity.createdAt, model: "gpt-6.1-sol", modelDisplayName: "GPT-6.1 Sol", workingDirectory: f.root, conversation: { threadId: "parent", codexHome: f.codexHome }, runs: [{ cause: "launch", startedAt: activity.createdAt }], sleeps: [], steps: [] };
    const context = { record, activity, session, stateDirectory: join(f.sandbox.root, "audit-state"), env: f.options.env!, codex: f.options.executable!, signal: AbortSignal.timeout(15_000) };
    const evidence = await collectProviderEvidence(context);
    if (mode === "missing output") {
      // An incomplete command may be omitted while the conversation is live; it must
      // never produce the required skill/command evidence that admission consumes.
      expect(evidence.filter(entry => entry.kind === "skill" || entry.kind === "command")).toEqual([]);
      return;
    }
    expect(evidence.filter(entry => entry.kind === "skill").map(entry => entry.skill)).toEqual([activity.skill]);
    expect(evidence.find(entry => entry.kind === "command")!.command).toMatchObject({ invocation: command, cwd: f.root, outcome: "success", exitCode: 0, output: skillBytes });
    const assessments = evidence.filter(entry => entry.kind === "assessment");
    expect(assessments).toHaveLength(mode === "qualified" ? 1 : 0);
    if (mode === "qualified") expect(assessments[0]).toMatchObject({ conversationId: "child", assessment: { purpose: "test_classification", partIds: ["value"], testPaths: [{ path: "value.test.mjs" }] } });
    expect(f.calls().some(call => /^(turn\/start|turn\/resume|thread\/start)$/.test(call.method))).toBe(false);
  });
});
