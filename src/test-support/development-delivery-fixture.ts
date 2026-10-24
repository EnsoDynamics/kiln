// Real repositories plus the captured GitHub contract. Remote failures are injected only at the CLI boundary.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeliveryCheckpoint } from "../state/development-delivery.js";
import { createHarness, landingSession, type Harness } from "./engine-harness.js";
import { git } from "./git-repositories.js";
import { DESIGN, PRD, PHASES } from "./fixture-documents.js";
import { documentsDigest, type DeliveryContext } from "../engine/development-delivery.js";
export async function deliveryFixture(method: "merge" | "squash" | "rebase" | "none" = "squash", additionalFiles: Record<string, string> = {}) {
  const h: Harness = await createHarness({ sessions: [landingSession()], files: { "customer-returns-prd.md": PRD, "technical-design.md": DESIGN, "phase-1-return-intake.md": PHASES["phase-1-return-intake.md"]!, ...additionalFiles } });
  const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "test-development" };
  await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target, confirmedTarget: target, confirmedNonProduction: true }] } });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const repo = h.engine.record.repositories[0]!; const head = git(h.sandbox, repo.worktreePath, "rev-parse", "HEAD").trim();
  if (method === "merge") git(h.sandbox, h.repository, "merge", "--no-ff", "-m", "Merge the disposable development checkpoint", h.engine.record.settings.featureBranch);
  else if (method === "squash") { git(h.sandbox, h.repository, "merge", "--squash", h.engine.record.settings.featureBranch); git(h.sandbox, h.repository, "commit", "-m", "Squash the disposable development checkpoint"); }
  else if (method === "rebase") { h.sandbox.env.GIT_COMMITTER_DATE = new Date(Date.now() + 1000).toISOString(); git(h.sandbox,h.repository,"cherry-pick",head); delete h.sandbox.env.GIT_COMMITTER_DATE; }
  git(h.sandbox, h.repository, "push", "origin", "develop");
  const merged = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const capture = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/development-delivery/github-contract.json", import.meta.url)), "utf8")) as Record<string, unknown>;
  const provider = capture as { pull: Record<string, unknown>; deployment: Record<string, unknown>; statuses: Record<string, unknown>[]; run: Record<string, unknown>; jobs: { jobs: Record<string, unknown>[] } };
  const now = Date.now() - 120_000; const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
  const pull = { ...provider.pull, number: 1, html_url: "https://github.com/acme/acme-shop/pull/1", state: "closed", draft: false, body: "PRD: docs/prds/customer-returns/customer-returns-prd.md", merged_at: at(10) as string | null, merge_commit_sha: merged, head: { sha: head, ref: h.engine.record.settings.featureBranch, repo: { full_name: "acme/acme-shop" } }, base: { ref: "develop", repo: { full_name: "acme/acme-shop" } } };
  const deployment = { ...provider.deployment, id: 11, sha: merged, environment: target.environment, created_at: at(11) };
  const jobUrl = "https://github.com/acme/acme-shop/actions/runs/21/job/31";
  const status = { ...provider.statuses[0], state: "success", environment: target.environment, log_url: jobUrl, created_at: at(20) };
  const run = { ...provider.run, id: 21, head_sha: merged, path: ".github/workflows/deploy.yml", run_attempt: 1, status: "completed", conclusion: "success", created_at: at(10) };
  const jobs = { jobs: [ { ...provider.jobs.jobs[1], id: 31, name: "deploy", status: "completed", conclusion: "success", html_url: jobUrl, started_at: at(11), completed_at: at(20) }, { ...provider.jobs.jobs[2], id: 32, name: "verify", status: "completed", conclusion: "success", html_url: `${jobUrl}-verify`, started_at: at(21), completed_at: at(30) } ] };
  const responses: Record<string, { body?: unknown; error?: string; raw?: string }> = {
    "repos/acme/acme-shop/pulls/1": { body: pull },
    [`repos/acme/acme-shop/compare/${merged}...develop`]: { body: { status: "identical", merge_base_commit: { sha: merged } } },
    "repos/acme/acme-shop/deployments/11": { body: deployment },
    "repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1": { body: [status] },
    "repos/acme/acme-shop/actions/runs/21/attempts/1": { body: run },
    "repos/acme/acme-shop/actions/runs/21/attempts/1/jobs?per_page=100&page=1": { body: jobs },
    "repos/acme/acme-shop/deployments?environment=test-development&per_page=100&page=1": { body: [deployment] },
  };
  const statePath = join(h.sandbox.root, "delivery-responses.json"); const log = join(h.sandbox.root, "delivery-gh-calls.jsonl");
  const save = () => writeFileSync(statePath, JSON.stringify({ responses, log })); save();
  const peer = fileURLToPath(new URL("../../test/stand-ins/development-gh-stand-in.mjs", import.meta.url));
  const executable = join(h.sandbox.root, process.platform === "win32" ? "delivery-gh.cmd" : "delivery-gh");
  writeFileSync(executable, process.platform === "win32" ? `@"${process.execPath}" "${peer}" %*\r\n` : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${peer.replaceAll("'", "'\\''")}' "$@"\n`); chmodSync(executable, 0o755);
  const source = { path: "README.md", revision: head };
  const checkpoint: DeliveryCheckpoint = { id: "first-checkpoint", executionId: h.engine.record.executionId!, phaseId: "1", target, featureBranch: h.engine.record.settings.featureBranch, headSha: head, baseSha: repo.baseCommit!, criteria: ["AC-RET-01"], dependsOn: [], workflowSource: source, requirements: [{ id: "deploy", purpose: "deployment", source, match: { kind: "github_deployment" } }, { id: "verify", purpose: "verification", source, match: { kind: "github_workflow", path: ".github/workflows/deploy.yml", jobs: ["verify"], deploymentJob: "deploy", attempt: 1 } }], requiredChecks: ["required-check"], requireReview: false, createdAt: at(0), operations: [{ id: "merge-intent", kind: "merge", state: "prepared", preparedAt: at(1), references: [], pullRequest: 1 }], references: [{ requirementId: "deploy", kind: "github_deployment", id: "11" }, { requirementId: "verify", kind: "github_workflow", id: "21" }], evidence: [] };
  h.engine.record.developmentDelivery!.checkpoints.push(checkpoint);
  const context: DeliveryContext = { record: h.engine.record, stateDirectory: h.stateDirectory, prdWorktree: repo.worktreePath, prdDirectory: h.engine.paths.prdDirectoryFromRoot, git: { git: h.tools.git, env: h.env }, gh: executable, env: { ...h.env, KILN_DELIVERY_GH_RESPONSES: statePath }, phaseId: "1", commands: () => Promise.resolve([]), now: () => new Date().toISOString() };
  h.engine.record.developmentDelivery!.assessments.push({ phaseId: "1", documentsDigest: documentsDigest(context,"1"), required: true, criteria: ["AC-RET-01"], reason: "Deploy and verify the real temporary source", checkpointIds: [checkpoint.id] });
  const synchronize = () => { git(h.sandbox, repo.worktreePath, "fetch", "origin", "develop"); git(h.sandbox, repo.worktreePath, "merge", "--no-edit", "origin/develop"); git(h.sandbox, repo.worktreePath, "push", "origin", checkpoint.featureBranch); checkpoint.operations.push({ id: "sync-intent", kind: "synchronize", sourceHead: head, intendedBaseSha: merged, state: "prepared", preparedAt: at(40), references: [] }); };
  return { h, context, checkpoint, responses, save, pull, deployment, status, run, jobs, head, merged, at, synchronize };
}
