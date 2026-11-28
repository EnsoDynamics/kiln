// The plan read the home screen starts when it opens (Kiln Requirements Stages AC-PLAN-03): with
// no engine, it reads the installed method's plan once on a subscription route and keeps it, and
// never starts on a metered route. Stand-in Claude Code, a real method skill file, real plan file.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { methodOf, readPlanFile, updatePlanFile } from "../requirements/plan.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import { dirname } from "node:path";
import { readPlanForHome } from "./home-plan.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const plan = "```kiln-plan\n" + JSON.stringify({ kilnPlan: 1, stages: [{ skill: "prd-writing-standards", title: "Write the PRD", reaches: [] }, { skill: "phase-split", title: "Phase plan", reaches: ["requirements_finished"] }], reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } }) + "\n```";

/** A built PRD's harness, whose engine reads no plan, with the method installed for Claude Code. */
async function harness(): Promise<Harness> {
  const one = await createHarness({ planSessions: [{ actions: [{ result: plan }, { exit: 0 }] }], sessions: [] });
  const skill = join(one.sandbox.root, "claude-config", "skills", "using-the-enso-method");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: using-the-enso-method\n---\n# Test method\n");
  return one;
}

const read = (harness: Harness) => readPlanForHome({ repository: harness.repository, tools: { claude: harness.tools.claude }, env: harness.env, homeState: mkdtempSync(join(harness.sandbox.root, "home-")), signal: new AbortController().signal });

it("reads the plan once when the home screen opens, then keeps it (AC-PLAN-03)", async () => {
  h = await harness();
  expect((await read(h)).outcome).toBe("read");
  const file = readPlanFile(dirname(modelDefaultsPath(h.env)));
  expect(Object.values(file.plans.claude_code ?? {})[0]?.stages.map(stage => stage.skill)).toEqual(["prd-writing-standards", "phase-split"]);
  expect((await read(h)).outcome).toBe("known");
  expect(h.planReadCalls()).toHaveLength(1);
});

it("never starts the read on a metered route: it waits for a PRD's billing approval (AC-PLAN-03)", async () => {
  h = await harness();
  h.env.ANTHROPIC_API_KEY = "home-plan-canary";
  expect((await read(h)).outcome).toBe("metered");
  expect(h.planReadCalls()).toHaveLength(0);
  expect(readPlanFile(dirname(modelDefaultsPath(h.env))).failures.claude_code ?? {}).toEqual({});
});

it("gives the reason saved for the agent and method it read, never an older method's failure (AC-PLAN-05)", async () => {
  h = await harness();
  const root = dirname(modelDefaultsPath(h.env));
  const { fingerprint } = methodOf(join(h.sandbox.root, "claude-config", "skills", "using-the-enso-method", "SKILL.md"), h.env);
  updatePlanFile(root, file => { file.failures.claude_code = { "an-earlier-method": { reason: "The earlier method's read failed.", at: "2026-11-01T00:00:00Z" }, [fingerprint]: { reason: "This method's read failed.", at: "2026-11-27T00:00:00Z" } }; });
  expect(await read(h)).toEqual({ outcome: "failed", failure: "This method's read failed." });
  expect(h.planReadCalls()).toHaveLength(0);
});
