// Preparation execution: Kiln settles a prepared phase, verifies its committed checkpoint with the
// project's own native check, and admits implementation once. The shared fixture is
// src/test-support/preparation-execution-fixture.ts.
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPrdRecord } from "../state/records.js";
import { COMET_DIRECTORY } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { waitFor } from "../test-support/engine-harness.js";
import { cleanUpPreparation, fixture, h, nativeIt } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

nativeIt("settles preparation, verifies its committed checkpoint and implements in the same conversation once", async () => {
  const f = await fixture(); const oldId = h.engine.record.executionId; const body = await f.accept();
  const sessionId = h.engine.latestSession("9")!.sessionId;
  const resultBody = await f.submit();
  expect(await h.engine.submitPreparation(resultBody)).toMatchObject({ ok: true, disposition: "verified" });
  expect(h.engine.record.preparation, JSON.stringify(h.engine.record.preparation)).toMatchObject({ stage: "implementation", attempts: [{ outcome: "succeeded", exitCode: 0 }] });
  expect(h.engine.latestSession("9")!.sessionId).toBe(sessionId);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
  expect(h.claudeCalls()[0]!.prompt).toContain("preparation only"); expect(h.claudeCalls()[1]!.prompt).toContain("independently verified");
  expect(h.engine.historicalExecution(oldId!)?.record.completedAt).toBe("2026-10-01T12:00:00Z");
  expect((await h.engine.continuationCommand("accept", body)).ok).toBe(true);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
  expect(readFileSync(h.engine.record.preparation!.attempts[0]!.output, "utf8")).toBe("");
}, 120_000);

nativeIt.each([["exit 3", "failed"], ["sleep 3", "failed"]])("holds dependent implementation when engine check %s", async (command, outcome) => {
  const f = await fixture(command, "this phase's branch", 1); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.attempts[0]?.outcome).toBe(outcome);
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
});

nativeIt("refuses a forged check claim without independently integrated source", async () => {
  const f = await fixture(); await f.accept(); await f.submit(false);
  expect(h.engine.record.preparation!.reason).toContain("Integrate the pinned");
  expect(h.engine.record.preparation!.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
});

nativeIt("invalidates a zero-exit check that mutates source/configuration", async () => {
  const f = await fixture("printf 'changed\\n' >> catalog.txt"); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.attempts[0]).toMatchObject({ outcome: "failed", exitCode: 0 });
  expect(h.engine.record.preparation!.reason).toMatch(/prepared source|changed/i); expect(h.claudeCalls()).toHaveLength(1);
  expect(readFileSync(join(h.engine.worktreePath, "catalog.txt"), "utf8")).toContain("changed");
});

nativeIt("holds unacknowledged verification intent on restart instead of blindly repeating a check", async () => {
  const f = await fixture("printf 'checked\\n' >> .gitignore"); await f.accept();
  const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata;
  let injected = false;
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    original(path, value);
    const record = value as { preparation?: { attempts?: { outcome: string; pid?: number }[] } };
    if (!injected && path.endsWith("prd.json") && record.preparation?.attempts?.at(-1)?.outcome === "running" && !record.preparation.attempts.at(-1)?.pid) { injected = true; throw new Error("Lost verifier launch-intent acknowledgement"); }
  });
  try { await f.submit(); } catch { /* The existing metadata fault retains mutation ownership. */ }
  probe.mockRestore();
  expect(injected).toBe(true); expect(h.engine.commands.fault).toBeTruthy();
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.record.preparation!.stage).not.toBe("implementation"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.engine.record.preparation!.reason).toMatch(/ownership|unresolved/i);
});

nativeIt("names the repository by its label when a preparation source must be restored (find repositories anywhere AC-FOLDER-02)", async () => {
  await fixture();
  const file = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("`wt/catalog-accessibility`", "`unavailable-source`"));
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: unavailable preparation source"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  // A recorded repository sharing the PRD's short name, so the PRD's repository is labelled by its address path.
  h.engine.record.repositories.push({ name: "other+comet-library", shortName: "comet-library", kind: "added", mainCheckoutPath: join(h.sandbox.root, "other", "comet-library"), github: "other/comet-library", baseBranch: "develop", worktreePath: join(h.sandbox.root, "other-worktree") });
  const check = await h.engine.checkCompletedPlan();
  expect(check.result?.proposal?.problems.join(" ")).toMatch(/restore source unavailable-source at [0-9a-f]{40} in fictional\/comet-library; the branch/);
});

nativeIt("honors existing Claude tool restrictions before any native project check", async () => {
  const f = await fixture("printf 'should not run\\n' > check-ran.txt");
  const { mkdirSync, existsSync } = await import("node:fs"); const root = h.env.CLAUDE_CONFIG_DIR!; mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "settings.json"), JSON.stringify({ permissions: { deny: ["Bash(./validate)"] } }));
  await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.reason).toContain("Existing Claude tool controls require");
  expect(h.engine.record.preparation!.attempts).toHaveLength(0); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(existsSync(join(h.engine.worktreePath, "check-ran.txt"))).toBe(false);
});

nativeIt("requires successful checks for both prepared repositories at one checkpoint", async () => {
  const f = await fixture("exit 0", "this phase's branch", 10, "exit 5"); await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.bindings.map(row => row.repository)).toEqual(["comet-library", "lending-api"]);
  expect(h.engine.record.preparation!.attempts.map(row => [row.outcome, row.exitCode])).toEqual([["succeeded", 0], ["failed", 5]]);
  expect(new Set(h.engine.record.preparation!.attempts.map(row => row.checkpointId)).size).toBe(1);
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});

nativeIt("keeps a damaged successful-check output unresolved rather than reusing or blindly repeating it", async () => {
  const f = await fixture(); await f.accept(); h.engine.pause(); await f.submit();
  writeFileSync(h.engine.record.preparation!.attempts[0]!.output, "tampered output");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("unresolved"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});

nativeIt("cleans up a live verifier launcher after an uncertain process-identity publication", async () => {
  const f = await fixture(); await f.accept();
  const durable = await import("../control/durable-file.js"); const original = durable.writeDurableMetadata; let injected = false;
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => { original(path, value); const attempt = (value as { preparation?: { attempts?: { processStartTime?: string }[] } }).preparation?.attempts?.at(-1); if (!injected && path.endsWith("prd.json") && attempt?.processStartTime) { injected = true; throw new Error("Lost process identity acknowledgement"); } });
  try { await f.submit(); } catch { /* Mutation fault is retained until restart. */ } probe.mockRestore();
  expect(injected).toBe(true); expect(h.engine.commands.fault).toBeTruthy(); const attempt = readPrdRecord(h.stateDirectory)!.preparation!.attempts[0]!;
  const { requireExited } = await import("../live/ownership.js"); await requireExited({ pid: attempt.pid!, processStartTime: attempt.processStartTime! });
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
});

it.skipIf(process.platform === "darwin")("reports an unavailable native verifier before accepting or launching preparation", async () => {
  await fixture(); const execution = h.engine.record.executionId;
  const check = await h.engine.checkCompletedPlan(); expect(check.status).toBe("blocked"); expect(check.result?.proposal?.problems.join(" ")).toContain("required native preparation verifier sandbox is unavailable");
  expect(h.engine.record.executionId).toBe(execution); expect(h.claudeCalls()).toHaveLength(0);
});

nativeIt("prevents native validation from writing outside assigned worktrees and temporary roots", async () => {
  const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
  const outside = mkdtempSync(join(process.cwd(), ".preparation-canary-")); const canary = join(outside, "must-not-exist");
  try {
    const f = await fixture(`printf 'outside write' > '${canary}'`); await f.accept(); await f.submit();
    expect(existsSync(canary)).toBe(false); expect(h.engine.record.preparation!.attempts[0]?.outcome).toBe("failed"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  } finally { rmSync(outside, { recursive: true }); }
});

nativeIt("uses Claude's effective project validation environment without retaining its values", async () => {
  const f = await fixture('test "$KILN_VALIDATION_TARGET" = "synthetic-sandbox"\ntest "$CLAUDE_PROJECT_DIR" = "synthetic-configured-root"');
  const { mkdirSync } = await import("node:fs"); mkdirSync(h.env.CLAUDE_CONFIG_DIR!, { recursive: true });
  writeFileSync(join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ env: { KILN_VALIDATION_TARGET: "synthetic-sandbox", CLAUDE_PROJECT_DIR: "synthetic-configured-root" } })); h.env.KILN_VALIDATION_TARGET = "wrong-controller-target";
  await f.accept(); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("implementation"); expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("succeeded");
  expect(JSON.stringify(h.engine.record.preparation)).not.toContain("wrong-controller-target"); expect(JSON.stringify(h.engine.record.preparation)).not.toContain("synthetic-sandbox");
});

nativeIt.each(["deny", "malformed", "rewrite", "timeout"] as const)("enforces Claude's %s hook on the actual native invocation", async mode => {
  const f = await fixture("printf 'must not run\\n' > check-ran.txt"); const { mkdirSync, existsSync } = await import("node:fs");
  mkdirSync(h.env.CLAUDE_CONFIG_DIR!, { recursive: true }); const counter = join(h.sandbox.root, "hook-invocations"); const hook = join(h.sandbox.root, "controlled-hook.mjs");
  writeFileSync(counter, "1"); h.env.KILN_HOOK_COUNTER = counter;
  const output = mode === "deny" ? "{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'one-use permission consumed'}}" : mode === "malformed" ? "{decision:'deny'}" : mode === "rewrite" ? "{hookSpecificOutput:{hookEventName:'PreToolUse',updatedInput:null}}" : "{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow'}}";
  writeFileSync(hook, `import fs from 'node:fs'; const path=process.env.KILN_HOOK_COUNTER; fs.writeFileSync(path,String(Number(fs.readFileSync(path,'utf8'))+1)); ${mode === "timeout" ? "await new Promise(resolve=>setTimeout(resolve,3000));" : ""} process.stdout.write(JSON.stringify(${output}));\n`);
  writeFileSync(join(h.env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: process.execPath, args: [hook], timeout: 1, onFailure: "block" }] }] } }));
  await f.accept(); await f.submit();
  expect(readFileSync(counter, "utf8")).toBe("2"); expect(existsSync(join(h.engine.worktreePath, "check-ran.txt"))).toBe(false);
  expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("failed"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(readFileSync(h.engine.record.preparation!.attempts[0]!.output, "utf8")).toContain(mode === "deny" ? "one-use permission consumed" : mode === "malformed" ? "unsupported control result" : mode === "rewrite" ? "holds or changes" : "configured timeout");
});
