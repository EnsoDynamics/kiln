/**
 * The prepared Comet Library continuation the preparation-execution integration files share:
 * Phase 9 must merge Phase 8's pinned work and pass the project's own `./validate` before it is
 * implemented. `fixture` sets `h`, which each file reads, and each file registers
 * `afterEach(cleanUpPreparation)`.
 */
import { expect, it, vi } from "vitest";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "../engine/engine.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { COMET_DIRECTORY, cometPhase, createCometContinuation } from "./comet-continuation-fixture.js";
import { git } from "./git-repositories.js";
import { landingSession, waitFor, type Harness } from "./engine-harness.js";
import { writeModelDefaults } from "./model-choices.js";

/** Model defaults with every row on Codex · GPT Sol · high, for this test's computer. */
export const codexDefaults = (env: NodeJS.ProcessEnv) => { const row = { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "opus", effort: "medium" } }; writeModelDefaults(env, { demanding: row, standard: row, mechanical: row, audits: row }); };
export const nativeIt = it.skipIf(process.platform !== "darwin");
export let h: Harness;
export async function cleanUpPreparation() { vi.restoreAllMocks(); if (h) writeFileSync(join(h.sandbox.root, "release-preparation"), "release for cleanup"); await h?.engine.stop("sigint"); await h?.cleanup(); }
export async function fixture(command = "exit 0", destination = "this phase's branch", timeout = 10, secondRepositoryCheck?: string, splitPrerequisite = false, carried = false, distinctRepositoryScope = false) {
  const f = await createCometContinuation(); h = f.h;
  let api: { path: string; sha: string } | undefined;
  if (secondRepositoryCheck) {
    const { createGithubOrigin, createRepository } = await import("./git-repositories.js");
    const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api"); const path = createRepository(h.sandbox, "lending-api", origin.url);
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    git(h.sandbox, path, "push", "-q", "origin", "develop"); git(h.sandbox, path, "checkout", "-qb", "wt/api-preparation");
    writeFileSync(join(path, "validate"), `#!/bin/sh\n${secondRepositoryCheck}\n`); chmodSync(join(path, "validate"), 0o755);
    git(h.sandbox, path, "add", "validate"); git(h.sandbox, path, "commit", "-qm", "test: API preparation"); api = { path, sha: git(h.sandbox, path, "rev-parse", "HEAD").trim() }; git(h.sandbox, path, "checkout", "-q", "develop");
  }
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  if (api) f.write("phase-8-catalog.md", cometPhase(8, true) + "\n**Repositories:** lending-api\n");
  writeFileSync(join(h.repository, "validate"), `#!/bin/sh\n${command}\n`); chmodSync(join(h.repository, "validate"), 0o755);
  const prerequisiteFiles = splitPrerequisite ? {
    "phase-8-catalog.md": "# Phase 8: Catalog preparation split\n\n" + (api && !distinctRepositoryScope ? "**Repositories:** lending-api\n\n" : "") + "## Split into\n| Phase | Work |\n|---|---|\n| [8a](phase-8a-catalog.md) | First prepared leaf |\n| [8b](phase-8b-catalog.md) | Second prepared leaf |\n",
    "phase-8a-catalog.md": cometPhase("8a", true), "phase-8b-catalog.md": cometPhase("8b", true).replace("## Acceptance criteria covered", (api && distinctRepositoryScope ? "**Repositories:** lending-api\n\n" : "") + "## Acceptance criteria covered"),
  } : {};
  for (const [name, text] of Object.entries(prerequisiteFiles)) f.write(name, text);
  git(h.sandbox, h.repository, "add", "validate", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: prepared project check");
  const sha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${sha}\` into ${destination} before building.\n\nVerify before building: run \`./validate\` with timeout \`${timeout}\` seconds.\n`);
  if (api) {
    f.write("phase-8-catalog.md", cometPhase(8, true) + "\n**Repositories:** lending-api\n");
    const path = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered").replace("Merge the local branch", "In repository `comet-library`, merge the local branch") + `\nFirst step: merge Phase 8. In repository \`lending-api\`, merge branch \`wt/api-preparation\` at \`${api.sha}\` into this phase's branch before building.\n\nVerify before building: run \`./validate\`.\n`);
  }
  for (const [name, text] of Object.entries(prerequisiteFiles)) f.write(name, text);
  if (carried) {
    const { observeGitPlan } = await import("../engine/completed-plan-sources.js");
    const { readBaseline, retainBaseline, phaseRepositories } = await import("../engine/plan-reconciliation.js");
    const old = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
    const source = await observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, COMET_DIRECTORY, sha);
    const { id: _id, ...body } = old; void _id;
    body.normalizerVersion = 4; body.active = source;
    for (const [id, receipt] of Object.entries(body.completions)) receipt.scopeRepositories = phaseRepositories(old.active, id);
    for (const id of ["8a", "8b"]) body.completions[id] = { kind: "external", revision: sha, doneAt: "2026-10-01T11:00:00Z", scopeRepositories: phaseRepositories(source, id), repositories: { "comet-library": { identity: "fictional/comet-library", revision: sha }, ...(api ? { "lending-api": { identity: "fictional/lending-api", revision: api.sha } } : {}) } };
    h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, body).id;
    writePrdRecord(h.stateDirectory, h.engine.record);
  }
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: assign preparation"); f.publish();
  h.engine.close();
  const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  h.engine = make(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const release = join(h.sandbox.root, "release-preparation");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Preparation only; any claimed checks are not engine receipts." }, { waitForFile: release }, { result: "Prepared source references submitted." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase remains unfinished." }, { exit: 0 }] }] }));
  const accept = async () => {
    const check = await h.engine.checkCompletedPlan();
    const body = { proposalId: check.result!.proposal!.id, executionId: h.engine.record.executionId!, commandId: "accept-preparation", statusToken: h.engine.controlView().token };
    const answer = await h.engine.continuationCommand("accept", body); expect(answer, JSON.stringify(answer)).toMatchObject({ ok: true });
    await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.pid && h.claudeCalls().length === 1);
    return body;
  };
  const submit = async (merge = true) => {
    if (merge) { git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", sha); if (api) git(h.sandbox, h.engine.record.repositories.find(repo => repo.name === "lending-api")!.worktreePath, "merge", "--no-edit", api.sha); }
    const state = h.engine.record.preparation!;
    const body = { executionId: h.engine.record.executionId, phaseId: "9", bindingId: state.bindings[0]!.id, references: [{ kind: "git_revision", repository: "comet-library", commit: sha }] };
    expect(await h.engine.submitPreparation(body)).toMatchObject({ ok: true, disposition: "submitted" });
    expect(await h.engine.submitPreparation(body)).toMatchObject({ ok: true, disposition: "submitted" });
    if (api) {
      const binding = state.bindings.find(row => row.repository === "lending-api")!;
      expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: "lending-api", commit: api.sha }] })).toMatchObject({ ok: true });
    }
    expect(state.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
    writeFileSync(release, "release"); await h.engine.settled();
    return body;
  };
  return { ...f, sha, make, accept, submit, release };
}

export async function resumePreparation() {
  const release = join(h.sandbox.root, "release-native-recovery");
  const before = h.engine.latestSession("9")!.runs.length;
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [] }, { actions: [{ waitForFile: release }, { result: "Recovered preparation." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Later work held." }, { exit: 0 }] }] }));
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
  await waitFor(() => h.engine.latestSession("9")!.runs.length === before + 1 && !!h.engine.latestSession("9")!.runs.at(-1)?.pid);
  for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
  writeFileSync(release, "release"); await h.engine.settled();
}

/** A Start again or Carry on instruction as the browser and command line submit it, settled. */
export async function restartCommand(action: "start-again" | "carry-on", commandId: string, inputs: Record<string, unknown> = {}) {
  const answer = h.engine.commands.submit({ command_id: commandId, execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action, inputs }, "caller", true);
  expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
  await h.engine.commands.settled(); await h.engine.settled();
  return h.engine.commands.lookup(commandId).operation as import("../control/commands.js").Receipt;
}
