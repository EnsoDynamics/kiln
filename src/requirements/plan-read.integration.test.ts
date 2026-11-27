// The plan read on Codex (Kiln Requirements Stages, "Reading it"; the Codex support design's
// Selection and readiness and Unattended execution profile): the plan directory is the launch
// directory and only writable root, no repositories are assigned, the build-skill check is not
// made, and the plan block is read from the final answer. Codex app-server is the stand-in peer;
// the real agent is proved by scripts/proof-run/requirements-plan-proof.mjs.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { runPlanRead } from "./plan-read.js";
import { readSessionRecord } from "../state/records.js";

const fixtures: ReturnType<typeof codexWorkFixture>[] = [];
afterEach(() => { for (const one of fixtures.splice(0)) one.sandbox.cleanup?.(); });

it("reads the plan on Codex from an empty plan directory with no repositories and no build-skill check", async () => {
  const fixture = codexWorkFixture(); fixtures.push(fixture);
  const plan = { kilnPlan: 1, stages: [{ skill: "prd-writing-standards", title: "Write the PRD", reaches: [] }, { skill: "phase-split", title: "Plan the phases", reaches: ["requirements_finished"] }], reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } };
  const root = join(fixture.sandbox.root, "kiln-state");
  fixture.set({ finalText: "The stages:\n```kiln-plan\n" + JSON.stringify(plan) + "\n```", recordsUnder: join(root, "requirements-plan") });
  const result = await runPlanRead({ agentId: "codex", choice: { model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "high" }, claude: "claude", codex: fixture.options.executable, env: fixture.options.env, root, skillPath: "/method/skills/using-the-enso-method/SKILL.md", methodFolder: "/method/skills", signal: new AbortController().signal });
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true, stages: plan.stages, reviewSkill: plan.reviewSkill });
  const record = readSessionRecord(root, "requirements-plan", result.sessionId!)!;
  const directory = realpathSync(join(root, "requirements-plan", result.sessionId!, "work"));
  expect(record.codex?.launchIntent).toMatchObject({ cwd: directory, writableRoots: [directory], repositories: [] });
  const started = fixture.calls().find(call => call.method === "thread/start");
  expect(started?.params).toMatchObject({ cwd: directory });
});
