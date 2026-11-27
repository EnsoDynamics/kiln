// Opt-in authenticated proof (Kiln Requirements Stages, Delivery: a plan read on each agent). For
// each agent named on the command line (claude_code, codex), resolves the installed Enso Method's
// entry skill in a disposable repository, fingerprints the method, and runs one real plan read in
// an empty directory under a disposable state root. Prints each plan's stages. Needs `dist/`.
//
//   node scripts/proof-run/requirements-plan-proof.mjs claude_code codex
import assert from "node:assert/strict";
/* global AbortController */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkill } from "../../dist/audit/workflow.js";
import { readCodexMetadata } from "../../dist/agents/codex-metadata.js";
import { newestOfFamily } from "../../dist/models/resolver.js";
import { methodOf } from "../../dist/requirements/plan.js";
import { runPlanRead } from "../../dist/requirements/plan-read.js";

const agents = process.argv.slice(2).length ? process.argv.slice(2) : ["claude_code", "codex"];
const root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-plan-proof-")));
const repository = join(root, "proof");
mkdirSync(repository);
execFileSync("git", ["init", "-q", "-b", "develop"], { cwd: repository });
const claude = process.env.KILN_LIVE_PROOF_CLAUDE ?? "claude";
const codex = process.env.KILN_LIVE_PROOF_CODEX ?? "codex";
const signal = new AbortController().signal;
for (const agentId of agents) {
  const found = await resolveSkill({ name: "using-the-enso-method", agent: agentId, cwd: repository, claude, codex, env: process.env, signal });
  assert.equal(found.kind, "found", found.message);
  const method = methodOf(found.skill.path, process.env);
  let choice = { model: "fable", modelName: "Fable", effort: "high" };
  if (agentId === "codex") {
    const metadata = await readCodexMetadata({ executable: codex, cwd: repository, cwds: [repository], env: process.env, signal, methodSkillsFor: [] });
    const entry = newestOfFamily({ agentId: "codex", family: "astra" }, metadata.models ?? []).entry ?? newestOfFamily({ agentId: "codex", family: "sol" }, metadata.models ?? []).entry;
    assert.ok(entry, "Codex offers neither GPT Astra nor GPT Sol.");
    choice = { model: entry.value, modelName: entry.displayName, effort: "high" };
  }
  console.log(JSON.stringify({ agentId, root, method: method.folder, fingerprint: method.fingerprint, updatedAt: method.updatedAt, model: choice.model }));
  const started = Date.now();
  const result = await runPlanRead({ agentId, choice, claude, codex, env: process.env, root: join(root, "state"), skillPath: found.skill.path, methodFolder: method.folder, signal });
  assert.ok(result.ok, result.reason);
  assert.ok(result.stages.length > 0);
  console.log(JSON.stringify({ agentId, passed: true, seconds: Math.round((Date.now() - started) / 1000), stages: result.stages, reviewSkill: result.reviewSkill }));
}
