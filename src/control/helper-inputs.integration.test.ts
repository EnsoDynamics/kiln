// AC-ACT-01: preserve the installed help example's structure and bind only its
// documented status/Git/workflow values before the real delivery validator.
import { afterEach, expect, it } from "vitest";
import { commandContracts } from "./help.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { FOLDER, prdDirectoryFiles } from "../test-support/fixture-documents.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

it("admits the documented delivery checkpoint example with only real status and workflow values substituted", async () => {
  const contract = commandContracts.find(c => c.path.join(" ") === "delivery assess")!;
  const example = structuredClone(Object.values(contract.examples[1]!.files!)[0]) as Record<string, unknown>;
  type CheckpointInput = { executionId: string; owner: unknown; target: { repository: string; baseBranch: string; environment: string }; featureBranch: string; headSha: string; baseSha: string; criteria: string[]; workflowSource: { path: string; revision: string }; requirements: { source: { path: string; revision: string }; match: { invocation: string; cwd: string } }[] };
  const checkpoint = (example.checkpoints as CheckpointInput[])[0]!;
  const workflow = "development-workflow.md";
  const commands = checkpoint.requirements.map(r => r.match.invocation);
  h = await createHarness({ sessions: [{ actions: [{ result: "Stopped before completion" }] }], files: { ...prdDirectoryFiles(), [workflow]: `# Development workflow\nEnvironment: development\n${commands.join("\n")}\n` } });
  const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop" };
  await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target }] } });
  expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true }); await h.engine.settled();
  const status = h.engine.deliveryStatus(); const repo = h.engine.record.repositories[0]!;
  example.executionId = status.executionId; example.revision = status.revision;
  example.owner = status.owner; example.documentsDigest = status.documentsDigest; example.criteria = ["AC-RET-01"];
  checkpoint.executionId = status.executionId!; checkpoint.owner = status.owner;
  checkpoint.target.repository = target.repository; checkpoint.target.baseBranch = target.baseBranch;
  checkpoint.featureBranch = h.engine.record.settings.featureBranch;
  checkpoint.headSha = git(h.sandbox, repo.worktreePath, "rev-parse", "HEAD").trim(); checkpoint.baseSha = repo.baseCommit!;
  checkpoint.criteria = ["AC-RET-01"];
  checkpoint.workflowSource.path = `docs/prds/${FOLDER}/${workflow}`; checkpoint.workflowSource.revision = checkpoint.headSha;
  for (const requirement of checkpoint.requirements) {
    requirement.source.path = checkpoint.workflowSource.path; requirement.source.revision = checkpoint.headSha;
    requirement.match.cwd = repo.worktreePath;
  }
  const result = await h.engine.deliveryCommand("assessment", example);
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  const saved = h.engine.record.developmentDelivery!.checkpoints.at(-1)!;
  expect(saved.target).toEqual({ ...target, environment: "development" });
  expect(saved.requirements.map(r => r.match.kind)).toEqual(["command", "command"]);
  expect(saved.requirements.map(r => r.purpose)).toEqual(["deployment", "verification"]);
  expect(h.engine.record.developmentDelivery!.assessments.at(-1)).toMatchObject({ required: true, reason: example.reason, checkpointIds: ["leaf-1-development"] });
  expect(h.engine.record.developmentAuthorization!.grants).toHaveLength(1);
  expect(saved.operations).toEqual([]); expect(saved.evidence).toEqual([]);
});
