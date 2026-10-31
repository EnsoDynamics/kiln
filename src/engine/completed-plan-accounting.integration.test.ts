import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createCometContinuation, COMET_DIRECTORY, COMET_PRD, cometPhase } from "../test-support/comet-continuation-fixture.js";
import { git, createBareOrigin, createRepository } from "../test-support/git-repositories.js";
import type { Harness } from "../test-support/engine-harness.js";
import { readCompletionAccounting } from "./completed-plan-accounting.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { startLocalServer } from "../server/local-server.js";
import { launchChrome } from "../test-support/headless-chrome.js";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { SCHEMA_VERSION, writeSessionRecord } from "../state/records.js";
import { documentsDigest } from "./development-delivery.js";
import { emptyDevelopmentLedger } from "../state/development-delivery.js";
let h: Harness;
afterEach(async () => { await h?.cleanup(); });
const publishDocuments = () => { git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): amend plan"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop"); };

it("accounts for seven new leaves and unintegrated external work, then independently verifies integration without launching or rewriting history", async () => {
  const f = await createCometContinuation(); h = f.h;
  const baseline = h.engine.record.planReconciliation!.baselineId;
  const blocked = await h.engine.checkCompletedPlan();
  expect(blocked.status).toBe("blocked");
  expect(blocked.result?.added.map(p => p.id)).toEqual(["9", "10", "11", "12", "13", "14", "15"]);
  expect(blocked.result?.leaves?.filter(p => p.classification === "carried_completed")).toHaveLength(7);
  expect(blocked.result?.leaves?.find(p => p.id === "8")).toMatchObject({ classification: "externally_unverified", provenance: "not_applicable", repositories: [{ revision: f.externalRevision, integration: "blocked" }] });
  expect(blocked.result?.problems.join(" ")).toContain("not verified in origin/develop");
  const output = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}));
  expect(output).toContain("7 new unfinished phases found"); expect(output).toContain("Phase 8 · Catalog capability 8 (completion evidence unresolved)");
  f.integrate(); writeFileSync(join(h.repository, "unrelated-notes.txt"), "Unrelated local work must survive.\n");
  const passed = await h.engine.checkCompletedPlan();
  expect(passed.status).toBe("available");
  const external = passed.result!.leaves!.find(p => p.id === "8")!;
  expect(external.classification).toBe("externally_verified"); expect(external.verifiedAt).toBe(passed.attemptedAt); expect(external.completedAt).toBeUndefined();
  expect(readCompletionAccounting(h.stateDirectory, passed.result!.accountingId!).leaves).toEqual(passed.result!.leaves);
  expect(h.reopenFromDisk().record.completedPlanCheck?.result?.accountingId).toBe(passed.result!.accountingId);
  expect(h.engine.record.planReconciliation!.baselineId).toBe(baseline);
  expect(h.engine.record.plan).toHaveLength(7); expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z");
  expect(h.claudeCalls()).toEqual([]);
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|worktree add|merge |push)\b/.test(call))).toBe(false);
  expect(readFileSync(join(h.repository, "unrelated-notes.txt"), "utf8")).toContain("must survive");
});

it("does not accept Closed-only, mismatched scope, conflicting references or a missing Kiln provenance receipt", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  f.write("library-catalog-prd.md", COMET_PRD); publishDocuments();
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
  f.write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8: repository \`comet-library\` at commit \`${f.externalRevision}\`.\n`);
  f.write("phase-8-catalog.md", cometPhase(8, true) + "\nMaterially different behavior.\n"); publishDocuments();
  expect((await h.engine.checkCompletedPlan()).result?.problems.join(" ")).toContain("unchanged Closed scope");
  f.write("phase-8-catalog.md", cometPhase(8, true));
  f.write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8: repository \`comet-library\` at commit \`${f.externalRevision}\`.\n\nPhase 8: repository \`comet-library\` at commit \`${git(h.sandbox, h.repository, "rev-parse", "HEAD").trim()}\`.\n`); publishDocuments();
  expect((await h.engine.checkCompletedPlan()).result?.problems.join(" ")).toContain("one unambiguous");
  h.engine.record.phases["8"] = { sessionIds: ["lost-kiln-session"], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
  expect((await h.engine.checkCompletedPlan()).result?.problems.join(" ")).toContain("cannot be treated as work with no provider owner");
});

it("counts split leaves and numbering gaps, preserves renamed old scope, and does not invent work from assumptions", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  git(h.sandbox, h.repository, "mv", `${COMET_DIRECTORY}/phase-1-catalog.md`, `${COMET_DIRECTORY}/phase-1-renamed.md`);
  f.write("phase-9-catalog.md", "# Phase 9: Split\n\n## Split into\n| Phase | What |\n|---|---|\n| [9b](phase-9b-catalog.md) | First |\n| [9a](phase-9a-catalog.md) | Second |\n");
  f.write("phase-9b-catalog.md", cometPhase("9b")); f.write("phase-9a-catalog.md", cometPhase("9a"));
  git(h.sandbox, h.repository, "rm", `${COMET_DIRECTORY}/phase-15-catalog.md`);
  f.write("library-catalog-assumptions.md", "# Assumptions\nOnly wording.\n"); publishDocuments();
  const check = await h.engine.checkCompletedPlan();
  expect(check.status).toBe("available"); expect(check.result?.added.map(p => p.id)).toEqual(["9b", "9a", "10", "11", "12", "13", "14"]);
  expect(check.result?.leaves?.find(p => p.id === "1")?.classification).toBe("carried_completed");
});

it("requires every affected repository and preserves earlier results when a required origin becomes unreadable", async () => {
  const f = await createCometContinuation(); h = f.h;
  // Phase 8 is completed in two repositories; the document scope must agree at its source.
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  const phase8 = cometPhase(8, true).replace("\n\n**Closed", "\n\n**Repositories:** lending-api\n\n**Closed");
  f.write("phase-8-catalog.md", phase8); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): bind repository scope");
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop"); f.write("phase-8-catalog.md", phase8);
  const origin = createBareOrigin(h.sandbox, "lending-api"); const repo = createRepository(h.sandbox, "lending-api", origin);
  git(h.sandbox, repo, "push", "-q", "origin", "develop");
  const apiRevision = git(h.sandbox, repo, "rev-parse", "HEAD").trim();
  const url = "https://github.com/fictional/lending-api.git";
  git(h.sandbox, repo, "config", `url.${origin}.insteadOf`, url); git(h.sandbox, repo, "remote", "set-url", "origin", url);
  h.engine.record.repositories.push({ name: "lending-api", kind: "named", mainCheckoutPath: repo, github: "fictional/lending-api", baseBranch: "develop", worktreePath: repo });
  f.write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8: repository \`comet-library\` at commit \`${revision}\`.\n`); publishDocuments(); f.integrate();
  expect((await h.engine.checkCompletedPlan()).result?.problems.join(" ")).toContain("lending-api needs one unambiguous");
  f.write("library-catalog-prd.md", readFileSync(join(h.repository, COMET_DIRECTORY, "library-catalog-prd.md"), "utf8") + `\nPhase 8: repository \`lending-api\` at commit \`${apiRevision}\`.\n`); publishDocuments();
  const success = await h.engine.checkCompletedPlan(); expect(success.status).toBe("available");
  git(h.sandbox, repo, "config", "--unset", `url.${origin}.insteadOf`);
  git(h.sandbox, repo, "config", `url.${join(h.sandbox.root, "missing-origin")}.insteadOf`, url);
  const failure = await h.engine.checkCompletedPlan(); expect(failure.status).toBe("failed"); expect(failure.result).toBeUndefined(); expect(failure.earlierResult).toEqual(success.result); expect(failure.lastSuccessfulAt).toBe(success.lastSuccessfulAt);
});

it("shows distinct external accounting above history in the actual browser at desktop and narrow widths", async () => {
  const f = await createCometContinuation(); h = f.h;
  const server = await startLocalServer({ engine: h.engine, port: 41986, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  const chrome = await launchChrome();
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(server.address, { width, height: 1000 });
      try {
        await page.waitFor("document.body.innerText.includes('7 new unfinished phases.') && document.body.innerText.includes('Completion evidence unresolved.')");
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        await page.waitFor("!document.body.innerText.includes('Showing earlier results.')");
        const text = await page.evaluate<string>("document.body.innerText");
        expect(text).toContain("7 earlier completed · 7 new unfinished · 1 externally closed");
        expect(text.indexOf("Work completed outside this run")).toBeLessThan(text.indexOf("Earlier catalog delivery"));
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        expect(await page.evaluate("[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Continue with')).map(b => b.disabled)")).toEqual([true]);
        expect(h.claudeCalls()).toEqual([]);
        writeFileSync(`/tmp/kiln-comet-accounting-${width}.png`, await page.screenshot());
      } finally { await page.close(); }
    }
  } finally { await chrome.close(); await server.close(); }
});


it("reuses a scope-bound Kiln receipt independently of old confinement history", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const history = historyFixture();
  try {
    Object.assign(h.tools, { codex: history.options.executable });
    h.env.KILN_CODEX_HISTORY_FIXTURE = history.options.env.KILN_CODEX_HISTORY_FIXTURE;
    h.engine.record.repositories[0]!.worktreePath = history.root;
    const at = "2026-10-23T15:00:00Z";
    writeSessionRecord(h.stateDirectory, { schemaVersion: SCHEMA_VERSION, sessionId: "retained-eight", phaseId: "8", kind: "phase", agentId: "codex", createdAt: at,
      model: "gpt-6.1-sol", modelDisplayName: "GPT", workingDirectory: join(history.root, "removed-worktree"), conversation: { threadId: "parent", codexHome: history.codexHome },
      runs: [{ startedAt: at, endedAt: at, cause: "launch", exitCode: 0 }], sleeps: [], steps: [] });
    h.engine.record.phases["8"] = { doneAt: at, sessionIds: ["retained-eight"], finishedByPerson: false, outsideConfirmations: [], repositories: { "comet-library": { startCommit: f.externalRevision, pushedSha: f.externalRevision } } };
    const original = structuredClone(h.engine.record.phases["8"]);
    const good = await h.engine.checkCompletedPlan();
    expect(good.result?.leaves?.find(row => row.id === "8")).toMatchObject({ classification: "externally_verified", provenance: "retained_kiln", completedAt: at });
    expect(h.engine.record.phases["8"]).toEqual(original);
    rmSync(history.state.threads.parent!.metadata.path);
    const missing = await h.engine.checkCompletedPlan();
    expect(missing.result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_verified");
    expect(h.engine.record.phases["8"]).toEqual(original);
    expect(h.claudeCalls()).toEqual([]);
  } finally { await history.sandbox.cleanup(); }
});

it("requires inherited delivery obligations even when a leaf assessment declares no new checkpoints", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  h.engine.record.developmentAuthorization = { revision: 1, enabled: true, grants: [] };
  const state = h.engine.record.developmentDelivery = emptyDevelopmentLedger();
  state.currentComplete = true;
  state.assessments.push({ phaseId: "8", documentsDigest: documentsDigest({ prdWorktree: h.repository, prdDirectory: COMET_DIRECTORY }, "8"), required: false, criteria: ["AC-COMET-01"], reason: "No new checkpoint", checkpointIds: [] });
  state.checkpoints.push({ id: "retained-audit-delivery", owner: { kind: "audit", activityId: "earlier-audit" }, executionId: h.engine.record.executionId!,
    target: { repository: "github.com/fictional/comet-library", baseBranch: "develop", environment: "dev" }, featureBranch: "wt/catalog-accessibility",
    headSha: f.externalRevision, baseSha: f.externalRevision, criteria: ["AC-COMET-01"], dependsOn: [], workflowSource: { path: "workflow", revision: f.externalRevision },
    requirements: [], requiredChecks: [], requireReview: false, createdAt: "2026-10-01T12:00:00Z", operations: [], evidence: [] });
  state.assignments = [{ checkpointId: "retained-audit-delivery", requirementId: "requiredMerge", owner: { kind: "phase", phaseId: "8" }, criteria: ["AC-COMET-01"] }];
  const check = await h.engine.checkCompletedPlan();
  expect(check.result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
  expect(check.result?.problems.join(" ")).toContain("retained-audit-delivery / requiredMerge");
  // A different leaf's obligation must not block this leaf.
  state.assignments[0]!.owner = { kind: "phase", phaseId: "9" };
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_verified");
});


it("recognizes verified squash integration pairs and refuses unresolved or unrelated pairs", async () => {
  const f = await createCometContinuation(); h = f.h;
  const before = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "merge", "--squash", "wt/catalog-accessibility");
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): squash catalog work"); f.publish();
  const resultSha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const state = h.engine.record.developmentDelivery = emptyDevelopmentLedger();
  const checkpoint = { id: "squashed-eight", phaseId: "8", executionId: h.engine.record.executionId!,
    target: { repository: "github.com/fictional/comet-library", baseBranch: "develop", environment: "dev" }, featureBranch: "wt/catalog-accessibility",
    headSha: f.externalRevision, baseSha: before, criteria: ["AC-COMET-01"], dependsOn: [], workflowSource: { path: "workflow", revision: f.externalRevision },
    requirements: [], requiredChecks: [], requireReview: false, createdAt: "2026-10-01T12:00:00Z", operations: [], evidence: [],
    merge: { number: 21, url: "https://github.com/fictional/comet-library/pull/21", sourceHead: f.externalRevision, mergedHead: f.externalRevision, resultSha, method: "squash", mergedAt: "2026-10-01T12:00:00Z" } };
  state.checkpoints.push(checkpoint);
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")).toMatchObject({ classification: "externally_verified", repositories: [{ merge: { resultSha } }] });
  state.checkpoints[0]!.mergeUnresolvedReason = "The retained pair could not be confirmed.";
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
  delete state.checkpoints[0]!.mergeUnresolvedReason;
  checkpoint.merge.resultSha = f.externalRevision;
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
  checkpoint.merge.resultSha = resultSha; checkpoint.merge.sourceHead = before; checkpoint.merge.mergedHead = before; checkpoint.headSha = before;
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
});

it("validates retained Claude Git receipts without requiring confinement history", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const at = "2026-10-23T15:00:00Z";
  const session = { schemaVersion: SCHEMA_VERSION, sessionId: "claude-eight", phaseId: "8", kind: "phase" as const, agentId: "claude_code" as const, createdAt: at,
    model: "opus", initModel: "claude-opus", modelDisplayName: "Opus", workingDirectory: h.engine.record.repositories[0]!.worktreePath,
    runs: [{ startedAt: at, endedAt: at, cause: "launch" as const, exitCode: 0 }], sleeps: [], steps: [] };
  writeSessionRecord(h.stateDirectory, session);
  const folder = join(h.env.CLAUDE_CONFIG_DIR!, "projects", "original-workspace"); mkdirSync(folder, { recursive: true });
  const transcript = join(folder, "claude-eight.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "assistant", timestamp: at, cwd: session.workingDirectory, message: { content: [{ type: "tool_use", id: "write", name: "Write", input: { file_path: join(session.workingDirectory, "catalog.txt"), content: "Accessible catalog" } }] } }) + "\n");
  const receipt = { doneAt: at, sessionIds: [session.sessionId], finishedByPerson: false, outsideConfirmations: [], repositories: { "comet-library": { startCommit: f.externalRevision, pushedSha: f.externalRevision } } };
  h.engine.record.phases["8"] = structuredClone(receipt);
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_verified");
  rmSync(transcript);
  expect((await h.engine.checkCompletedPlan()).result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_verified");
  expect(h.engine.record.phases["8"]).toEqual(receipt);
  expect(h.engine.sessionRecord("8", session.sessionId)).toEqual(session);
  expect(h.claudeCalls()).toEqual([]);
});


it("does not rescan historical Codex conversations to account for a retained Git receipt", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const scanner = await import("../session/codex-evidence.js");
  const scan = vi.spyOn(scanner, "auditCodexConversation");
  try {
    h.engine.record.phases["8"] = { doneAt: "2026-10-23T15:00:00Z", sessionIds: ["historical-codex"], finishedByPerson: false, repositories: { "comet-library": { startCommit: f.externalRevision, pushedSha: f.externalRevision } } };
    const check = await h.engine.checkCompletedPlan();
    expect(check.result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_verified");
    expect(scan).not.toHaveBeenCalled();
    expect(h.claudeCalls()).toEqual([]);
  } finally { scan.mockRestore(); }
});
