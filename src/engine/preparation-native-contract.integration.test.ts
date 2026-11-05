import { afterEach, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "./engine.js";
import { readPrdRecord } from "../state/records.js";
import { COMET_DIRECTORY, cometPhase, createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";

// AC-CONTINUE-07: real native invocations in fictional disposable repositories.
// Deterministic provider peers establish scheduling only, not actual-provider behavior.
const nativeIt = it.skipIf(process.platform !== "darwin");
let h: Harness;
afterEach(async () => {
  if (h) writeFileSync(join(h.sandbox.root, "release-native-contract"), "release for cleanup");
  await h?.engine.stop("sigint");
  await h?.cleanup();
});

async function fixture(mode: "default" | "explicit" | "escape" | "ordered" | "signal") {
  const f = await createCometContinuation(); h = f.h;
  const marker = join(h.sandbox.root, "native-order.txt");
  const outside = join(h.sandbox.root, "outside-checks"); mkdirSync(outside);
  const script = (directory: string, name: string, body: string) => {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, name);
    writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`); chmodSync(path, 0o755);
  };
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  const directory = mode === "explicit" ? "checks/catalog" : mode === "escape" ? "checks/escape" : ".";
  if (mode === "escape") {
    script(outside, "validate", "printf 'ESCAPED\\n'");
    script(join(h.repository, directory), "validate", "pwd -P");
  } else if (mode === "ordered") {
    // Output is retained by the runner. An external, fixture-owned marker avoids
    // changing checkpoint source and proves first completion before second start.
    script(h.repository, "validate", `test ! -e '${marker}'\nprintf 'first-start\\n'\nsleep 0.1\nprintf 'first-complete\\n' > '${marker}'\nprintf 'first-complete\\n'`);
    script(h.repository, "validate-second", `test "$(cat '${marker}')" = first-complete\nprintf 'second-start-after-first-complete\\n'\nprintf 'second-complete\\n' >> '${marker}'`);
  } else script(join(h.repository, directory), "validate", mode === "signal" ? "printf 'before-signal\\n'\nkill -TERM $$\nprintf 'AFTER-SIGNAL\\n'" : "pwd -P");
  // Stage only generated fixture files, including nested scripts or the symlink.
  git(h.sandbox, h.repository, "add", ...(mode === "explicit" || mode === "escape" ? ["checks"] : mode === "ordered" ? ["validate", "validate-second"] : ["validate"]));
  git(h.sandbox, h.repository, "commit", "-qm", "test: native preparation scripts");
  const sha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  const check = `Verify before building: run \`./validate\`${directory === "." ? "" : ` in \`${directory}\``} with timeout \`10\` seconds.`;
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${sha}\` into this phase's branch before building.\n\n${check}\n${mode === "ordered" ? "\nVerify before building: run `./validate-second` with timeout `10` seconds.\n" : ""}`);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: assign native check contract"); f.publish();
  h.engine.close();
  const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  h.engine = make(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const release = join(h.sandbox.root, "release-native-contract");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { result: "Prepared source submitted; native checks belong to the engine." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase remains unfinished." }, { exit: 0 }] }] }));
  const checkResult = await h.engine.checkCompletedPlan();
  expect(checkResult.result!.proposal!.readiness, JSON.stringify(checkResult)).toBe("ready");
  expect(await h.engine.continuationCommand("accept", { proposalId: checkResult.result!.proposal!.id, executionId: h.engine.record.executionId!, commandId: "accept-native-contract", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.pid && h.claudeCalls().length === 1);
  const sessionId = h.engine.latestSession("9")!.sessionId;
  const submit = async () => {
    git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", sha);
    if (mode === "escape") {
      // The accepted source is valid. A preparation edit introduces an actual
      // physical escape, so the native checkpoint must reject it independently.
      renameSync(join(h.engine.worktreePath, directory), join(h.engine.worktreePath, "checks/original"));
      symlinkSync(outside, join(h.engine.worktreePath, directory));
      git(h.sandbox, h.engine.worktreePath, "add", "checks/escape", "checks/original");
      git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: introduce physical directory escape");
    }
    const binding = h.engine.record.preparation!.bindings[0]!;
    expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: "comet-library", commit: sha }] })).toMatchObject({ ok: true, disposition: "submitted" });
    expect(h.engine.record.preparation!.attempts).toEqual([]);
    expect(h.claudeCalls()).toHaveLength(1);
    writeFileSync(release, "release"); await h.engine.settled();
  };
  return { make, submit, marker, directory, sessionId };
}

nativeIt.each(["default", "explicit"] as const)("runs a native check in its physical %s directory and retains that cwd", async mode => {
  const f = await fixture(mode); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!;
  const expected = realpathSync(join(h.engine.worktreePath, f.directory));
  expect(attempt).toMatchObject({ directory: expected, outcome: "succeeded", exitCode: 0, checkIndex: 0 });
  expect(readFileSync(attempt.output, "utf8")).toBe(`${expected}\n`);
  expect(h.engine.record.preparation!.stage).toBe("implementation");
  expect(h.engine.latestSession("9")!.sessionId).toBe(f.sessionId);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
}, 120_000);

nativeIt("refuses a check directory escaping through a real symlink without native or implementation dispatch", async () => {
  const f = await fixture("escape"); await f.submit();
  expect(h.engine.record.preparation!.reason).toContain("Preparation path escapes its assigned worktree:");
  expect(h.engine.record.preparation!.reason).toContain("checks/escape");
  expect(h.engine.record.preparation!.attempts).toEqual([]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
}, 120_000);

nativeIt("runs two checks in one preparation item in written order at the same committed checkpoint", async () => {
  const f = await fixture("ordered"); await f.submit();
  const state = h.engine.record.preparation!;
  expect(state.bindings).toHaveLength(1);
  expect(state.bindings[0]!.checks.map(check => check.command)).toEqual(["./validate", "./validate-second"]);
  expect(state.attempts.map(attempt => [attempt.bindingId, attempt.checkIndex, attempt.outcome, attempt.exitCode])).toEqual([
    [state.bindings[0]!.id, 0, "succeeded", 0], [state.bindings[0]!.id, 1, "succeeded", 0],
  ]);
  expect(state.attempts.map(attempt => readFileSync(attempt.output, "utf8"))).toEqual(["first-start\nfirst-complete\n", "second-start-after-first-complete\n"]);
  expect(readFileSync(f.marker, "utf8")).toBe("first-complete\nsecond-complete\n");
  expect(Date.parse(state.attempts[0]!.endedAt!)).toBeLessThanOrEqual(Date.parse(state.attempts[1]!.startedAt));
  expect(state.attempts.map(attempt => attempt.checkpointId)).toEqual([state.verifiedCheckpoint!.id, state.verifiedCheckpoint!.id]);
  expect(state.verifiedCheckpoint!.repositories[0]!.index).toBe("");
  expect(state.stage).toBe("implementation");
  expect(h.engine.latestSession("9")!.sessionId).toBe(f.sessionId);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
}, 120_000);

nativeIt("holds a real signalled project check and retains its incomplete output without implementation", async () => {
  const f = await fixture("signal"); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!;
  expect(attempt).toMatchObject({ outcome: "failed", exitCode: 128, reason: "Validation exited 128." });
  expect(readFileSync(attempt.output, "utf8")).toBe("before-signal\n");
  expect(h.engine.record.preparation!.stage).toBe("verification");
  expect(h.engine.record.preparation!.verifiedCheckpoint).toBeUndefined();
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.claudeCalls()).toHaveLength(1);
}, 120_000);

nativeIt("holds a missing successful output record across restart without repeating checks or implementation", async () => {
  const f = await fixture("default"); h.engine.pause(); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!;
  expect(attempt.outcome).toBe("succeeded");
  expect(existsSync(attempt.output)).toBe(true); unlinkSync(attempt.output);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1);
  expect(h.engine.record.preparation!.attempts[0]).toMatchObject({ id: attempt.id, outcome: "unresolved", reason: "The retained check output is missing or changed. Resume preparation to reconcile that check before repeating it." });
  expect(existsSync(attempt.output)).toBe(false);
  expect(h.engine.record.preparation!.verifiedCheckpoint).toBeUndefined();
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  expect(h.claudeCalls()).toHaveLength(1);
}, 120_000);
