// The requirements plan's notices and stop marks, and the pushes after a review (Kiln Requirements
// Stages, Phase 10): a session at a stop that ran nothing in the plan drops the entries behind the
// work and says so, the method's own review entry carries its stop while it runs, a plan read
// another Kiln holds shows at once, and Resume and Start the build push the person's own commits.
// Real engine and disposable Git; the scripted stand-in plays each session, the plan read included.
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { DESIGN, PHASES, PRD } from "../test-support/fixture-documents.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { createGithubOrigin, git } from "../test-support/git-repositories.js";
import { processStartTime } from "../platform/process-start-time.js";
import { stateRoot } from "../state/state-files.js";
import { methodOf, updatePlanFile } from "./plan.js";
import { startLocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });

const folder = "count-boxes";
const dir = `docs/prds/${folder}`;
const prd = `${dir}/${folder}-prd.md`;
const review = `${dir}/${folder}-stakeholder-review.html`;

type Stage = [skill: string, title: string, reaches?: string[]];
const planSession = (stages: Stage[]) => ({ actions: [{ result: "The method's stages:\n```kiln-plan\n" + JSON.stringify({ kilnPlan: 1, stages: stages.map(([skill, title, reaches]) => ({ skill, title, reaches: reaches ?? [] })), reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } }) + "\n```" }, { exit: 0 }] });
const TODAY: Stage[] = [
  ["prd-writing-standards", "Write the PRD"], ["autonomous-prd-refinement", "Refine the PRD", ["prd_refined"]],
  ["technical-design-writing-standards", "Technical design"], ["autonomous-design-refinement", "Refine the design", ["design_ready"]],
  ["phase-split", "Phase plan", ["requirements_finished"]],
];
// A method whose own review entry follows the refinement, so it makes the early review.
const WITH_REVIEW: Stage[] = [TODAY[0]!, TODAY[1]!, ["stakeholder-review-package", "Stakeholder review", ["review_made"]], ...TODAY.slice(2), ["stakeholder-review-package", "Stakeholder review", ["review_made"]]];
const titleOf = (skill: string) => WITH_REVIEW.find(([one]) => one === skill)?.[1] ?? skill;
const report = (ran: string[], next: string, milestones: string[], reaches: string[] = []) => ({ result: "```kiln-report\n" + JSON.stringify({
  kilnReport: 1, ran: ran.map(skill => ({ skill, title: titleOf(skill) })), finished: true,
  next: { kind: next === "build" ? "build" : "requirements", skill: next, title: titleOf(next), reaches },
  milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir,
}) + "\n```" });
const reviewReport = { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" };
const view = () => buildSnapshot(h.engine).requirements!;
const keys = () => view().rows.map(row => row.key);

/** An origin on GitHub, as the start checks require, holding everything the harness pushed. */
function hostOnGithub(): string {
  const hosted = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  git(h.sandbox, h.origin, "push", "-q", "--mirror", hosted.bare);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", hosted.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  return hosted.bare;
}

it("at a stop where the session ran nothing in the plan, drops the entries behind the work and says what changed (AC-PLAN-06)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(TODAY)], sessions: [
    // The session writes and refines the PRD with a skill the plan doesn't have, and reaches the early stop.
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "quick PRD" }, report(["quick-prd"], "stakeholder-review-package", ["prd_refined"], ["review_made"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, reviewReport, { exit: 0 }] },
  ] });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  expect(view().notice?.changes).toEqual(["The session ran quick-prd where the plan had Write the PRD next.", "Passed Write the PRD, Refine the PRD, which the method didn't run for this PRD."]);
  // The writing and refining entries are behind the work, so they are no longer listed as stages to come.
  expect(keys()).toEqual(["quick-prd#1", "kiln:early", "kiln:next", "technical-design-writing-standards#1", "autonomous-design-refinement#1", "phase-split#1", "kiln:final", "build"]);
  expect(view().rows[0]).toMatchObject({ state: "done", stop: "early" });
});

it("marks the stop on the row before the method's own review entry while it makes the stop's review (AC-PLAN-01)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-phase-10-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(WITH_REVIEW)], sessions: [
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "stakeholder-review-package", ["prd_refined"], ["review_made"]), { exit: 0 }] },
    { actions: [{ touch: join(signals, "reviewing") }, { waitForFile: join(signals, "go") }, { write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, reviewReport, { exit: 0 }] },
  ] });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "reviewing")), 30_000);
  const marks = () => view().rows.slice(0, 3).map(row => [row.key, row.state, row.stop ?? ""]);
  expect(marks()).toEqual([["prd-writing-standards#1", "done", ""], ["autonomous-prd-refinement#1", "done", "early"], ["stakeholder-review-package#1", "running", ""]]);
  expect(keys()).not.toContain("kiln:early");
  // Every mark on the plan: the early stop before the method's first review, the final stop before its second, and none elsewhere.
  const stops = () => view().rows.filter(row => row.stop).map(row => [row.key, row.stop]);
  expect(stops()).toEqual([["autonomous-prd-refinement#1", "early"], ["phase-split#1", "final"]]);
  expect(keys()).not.toContain("kiln:final");
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  expect(marks()).toEqual([["prd-writing-standards#1", "done", ""], ["autonomous-prd-refinement#1", "done", "early"], ["stakeholder-review-package#1", "done", ""]]);
  expect(stops()).toEqual([["autonomous-prd-refinement#1", "early"], ["phase-split#1", "final"]]);
});

it("shows a plan read another Kiln holds at once (AC-PLAN-04)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [] });
  // This Kiln's own first read fails; Read again then finds another Kiln reading the same method.
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  const method = methodOf(join(h.sandbox.root, "claude-config", "skills", "using-the-enso-method", "SKILL.md"), h.env);
  const startedAt = new Date().toISOString();
  const live = (await processStartTime(process.pid))!;
  updatePlanFile(stateRoot(h.env), file => { file.failures = {}; file.reading = { agentId: "claude_code", fingerprint: method.fingerprint, startedAt, pid: process.pid, processStartTime: live }; });
  // Each publish carries the plan as the screen would show it.
  const published: string[] = [];
  h.engine.onChange(() => published.push(buildSnapshot(h.engine).requirements!.plan.status));
  await h.engine.refreshRequirementsPlan({ force: true });
  expect(published.at(-1)).toBe("reading");
  expect(view().plan).toMatchObject({ status: "reading", readingSince: startedAt });
  expect(h.planReadCalls()).toHaveLength(1);
  h.engine.close();
});

it("pushes the person's own commits when Continue or Resume leaves a review and when the build starts, and stays at the review when Git rejects the push (AC-STAGE-02)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-phase-10-"));
  const phase = "phase-1-return-intake.md";
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "technical-design-writing-standards", ["prd_refined"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, reviewReport, { exit: 0 }] },
    { actions: [{ touch: join(signals, "designing") }, { waitForFile: join(signals, "go") }, { write: { path: `${dir}/technical-design.md`, content: DESIGN } }, { write: { path: `${dir}/${phase}`, content: PHASES[phase]! } }, { commit: "design" },
      report(["technical-design-writing-standards"], "build", ["design_ready", "requirements_finished"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Final review</h1>" } }, { commit: "refresh" }, reviewReport, { exit: 0 }] },
  ] });
  const bare = hostOnGithub();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  const branch = h.engine.record.settings.featureBranch;
  const worktree = h.engine.worktreePath;
  const ownCommit = (name: string) => {
    writeFileSync(join(worktree, name), `${name}\n`);
    git(h.sandbox, worktree, "add", name);
    git(h.sandbox, worktree, "commit", "-qm", name);
    return git(h.sandbox, worktree, "rev-parse", "HEAD").trim();
  };
  const onOrigin = () => git(h.sandbox, bare, "rev-parse", `refs/heads/${branch}`).trim();

  // The person's own session commits at the early review. Origin has moved on meanwhile, so Git rejects the push.
  const notes = ownCommit("notes.md");
  const pushedBefore = onOrigin();
  const elsewhere = git(h.sandbox, bare, "commit-tree", `${pushedBefore}^{tree}`, "-p", pushedBefore, "-m", "elsewhere").trim();
  git(h.sandbox, bare, "update-ref", `refs/heads/${branch}`, elsewhere);
  const rejected = await h.engine.resume();
  expect(rejected).toMatchObject({ ok: false, reason: expect.stringContaining("Kiln couldn't push the feature branch") });
  expect(h.engine.reviewStop).toBe("early");
  // Continue stays at the review too.
  const server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: folder, token: h.engine.record.token });
  try {
    const origin = `http://127.0.0.1:${boundPort(server.address)}`;
    const continueRun = () => fetch(`${origin}/api/review/continue`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
    const refused = await continueRun();
    expect(refused.status).not.toBe(200);
    expect(await refused.text()).toContain("Kiln couldn't push the feature branch");
    expect(h.engine.reviewStop).toBe("early");
    expect(h.claudeCalls()).toHaveLength(2);
    // Once Git takes it, Continue pushes the commit before the next stage starts.
    git(h.sandbox, bare, "update-ref", `refs/heads/${branch}`, pushedBefore);
    const continued = await continueRun();
    expect(continued.status, await continued.clone().text()).toBe(200);
    await waitFor(() => existsSync(join(signals, "designing")), 30_000);
    expect(onOrigin()).toBe(notes);
  } finally { await server.close(); }
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("final");

  // Resume at the final review with the review current comes back to it, with the person's commit pushed.
  const more = ownCommit("more-notes.md");
  expect(await h.engine.resume()).toMatchObject({ ok: true });
  expect(h.engine.reviewStop).toBe("final");
  expect(onOrigin()).toBe(more);
  // Start the build pushes the person's last commit before the build begins.
  const last = ownCommit("last-notes.md");
  // Git rejects the push: the build doesn't start and Kiln stays at the final review.
  const elsewhereAgain = git(h.sandbox, bare, "commit-tree", `${more}^{tree}`, "-p", more, "-m", "elsewhere").trim();
  git(h.sandbox, bare, "update-ref", `refs/heads/${branch}`, elsewhereAgain);
  expect(await h.engine.startRequirementsBuild(true)).toMatchObject({ ok: false, reason: expect.stringContaining("Kiln couldn't push the feature branch") });
  expect(h.engine.reviewStop).toBe("final");
  expect(h.engine.record.requirements!.phase).toBe("final_review");
  git(h.sandbox, bare, "update-ref", `refs/heads/${branch}`, more);
  const built = await h.engine.startRequirementsBuild(true);
  expect(built, JSON.stringify(built)).toMatchObject({ ok: true });
  expect(onOrigin()).toBe(last);
});
