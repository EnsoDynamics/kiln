import { writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { runKilnCommand } from "../kiln-command.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { delimiter, join } from "node:path";
import { PHASES, PRD, DESIGN } from "../test-support/fixture-documents.js";
import { startLocalServer } from "../server/local-server.js";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { commitFiles, createGithubOrigin, git } from "../test-support/git-repositories.js";
import { inspectSource } from "./source.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });

it("holds at both reviews and refuses a build without phase documents, including after reopening", async () => {
  const folder = "count-boxes";
  const dir = "docs/prds/" + folder;
  const draft = dir + "/" + folder + "-prd.md";
  const review = dir + "/" + folder + "-stakeholder-review.html";
  const report = (skill: string, next: string, milestones: string[]) => ({
    result: "```kiln-report\n" + JSON.stringify({
      kilnReport: 1, ran: [{ skill, title: skill }], finished: true,
      next: { kind: next === "build" ? "build" : "requirements", skill: next, title: next, reaches: ["design_ready"] },
      milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir,
    }) + "\n```",
  });
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: draft, content: PRD } }, { commit: "draft" }, report("refine", "design", ["prd_refined"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Count boxes</h1>" } }, { commit: "review" }, report("review", "design", []), { exit: 0 }] },
    { actions: [{ write: { path: dir + "/technical-design.md", content: DESIGN } }, { write: { path: draft, content: PRD + "\nUpdated after the early review.\n" } }, { commit: "design" }, report("design", "build", ["design_ready", "requirements_finished"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Count boxes</h1><p>Revised final review</p>" } }, { commit: "refresh" }, report("review", "build", []), { exit: 0 }] },
  ] });
  const hosted = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  git(h.sandbox, h.origin, "push", "-q", "--mirror", hosted.bare);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", hosted.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  const engine = h.engine;
  expect(engine.record.prdDirectory).toBeUndefined();
  expect(await engine.startRequirementsBuild(true)).toMatchObject({ ok: false });
  expect(await engine.start()).toMatchObject({ ok: true });
  await engine.settled();
  expect(buildSnapshot(engine).requirements?.review?.kind, JSON.stringify({ facts: engine.record.phases, events: h.events, session: engine.latestSession(Object.keys(engine.record.phases)[0]!)?.runs.at(-1) })).toBe("early");
  expect(engine.record.preflight?.due).toBeUndefined();
  const earlyToken = engine.controlView().token;
  expect(engine.record.prdDirectory).toBe(dir);
  expect(h.claudeCalls()).toHaveLength(2);
  expect(await engine.resume()).toMatchObject({ ok: true });
  await engine.settled();
  expect(buildSnapshot(engine).requirements?.build).toMatchObject({ noPhasePlan: true });
  expect(h.claudeCalls()).toHaveLength(4);
  // The control's reason is the "No phase documents" fact the screen shows (AC-FINAL-06).
  expect(engine.controlView().controls.find(c => c.name === "start-build")).toMatchObject({ available: false, reason: expect.stringMatching(/^No phase documents/) });
  expect(await engine.startRequirementsBuild(true)).toMatchObject({ ok: false, reason: expect.stringMatching(/^No phase documents/) });
  expect(git(h.sandbox, hosted.bare, "rev-parse", engine.record.settings.featureBranch)).toBe(git(h.sandbox, engine.worktreePath, "rev-parse", "HEAD"));
  // The written PRD exists only on the feature branch. The source checkout still resolves its name.
  engine.close();
  const signals = new EventEmitter();
  let address = "", log = "", exit: number | undefined;
  const env = { ...h.env, PATH: join(h.sandbox.root, "bin") + delimiter + (h.env.PATH ?? ""), KILN_PORT_RANGE: await reservePortRange() };
  const context = { cwd: h.repository, env, signals, stdout: { write: (s: string) => log += s }, stderr: { write: (s: string) => log += s } };
  const controller = runKilnCommand(["run", dir], { ...context, openBrowser: async url => { address = url; return { kind: "opened" }; } }).then(code => exit = code);
  try {
    await waitFor(() => !!address || exit !== undefined);
    expect(address, log).toMatch(/\/count-boxes\/?$/);
    let statusToken = "";
    for (const target of ["source-material/" + folder, dir, draft]) {
      log = "";
      expect(await runKilnCommand(["status", target, "--json"], context)).toBe(0);
      expect(JSON.parse(log)).toMatchObject({ state: "final_review", execution_id: engine.record.executionId });
      statusToken = JSON.parse(log).status_token as string;
      expect((JSON.parse(log).controls as { name: string; reason: string | null }[]).find(c => c.name === "start-build")?.reason).toMatch(/^No phase documents/);
    }
    log = "";
    expect(await runKilnCommand(["start-build", dir, "--only-if-status-matches", statusToken, "--command-id", "no-phase-plan"], context)).not.toBe(0);
    expect(log, log).toContain("No phase documents");
  } finally { if (exit === undefined) signals.emit("SIGINT"); await controller; }
  const reopened = h.reopenFromDisk();
  await reopened.prepare();
  expect(reopened.reviewStop).toBe("final");
  expect(await reopened.startRequirementsBuild(true)).toMatchObject({ ok: false });
  const phase = "phase-1-return-intake.md";
  writeFileSync(join(reopened.worktreePath, dir, phase), PHASES[phase]!);
  expect(await reopened.resume()).toMatchObject({ ok: false });
  git(h.sandbox, reopened.worktreePath, "add", dir + "/" + phase);
  git(h.sandbox, reopened.worktreePath, "commit", "-qm", "plan the work");
  expect(await reopened.resume()).toMatchObject({ ok: true });
  expect(buildSnapshot(reopened).requirements?.build?.checksFailed).toBeUndefined();
  expect(buildSnapshot(reopened).phases[0]?.title).toBe("Return intake");
  expect(h.claudeCalls()).toHaveLength(4);
  const server = await startLocalServer({ engine: reopened, folderName: folder, featureName: folder, port: 0, token: reopened.record.token });
  try {
    const origin = new URL(server.address).origin;
    const reviewPage = await fetch(origin + "/" + folder + "/stakeholder-review");
    expect(await reviewPage.text()).toContain("Revised final review");
    const policy = reviewPage.headers.get("Content-Security-Policy");
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("allow-same-origin");
    const send = (token: string, id: string) => fetch(origin + "/api/build/start", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Kiln-Token": reopened.record.token, "X-Kiln-Status": token, "X-Kiln-Command-Id": id, Origin: origin }, body: "{}",
    });
    expect((await send(earlyToken, "old-review")).status).toBe(409);
    expect(reopened.reviewStop).toBe("final");
    const accepted = await send(reopened.controlView().token, "final-review");
    expect(accepted.ok, await accepted.text()).toBe(true);
    await reopened.settled();
    expect(reopened.record.requirements?.phase).toBe("closed");
    expect(reopened.record.planReconciliation?.baselineId, JSON.stringify({ phases: reopened.record.phases, reconcile: reopened.record.planReconciliation, preflight: reopened.record.preflight })).toBeTruthy();
    expect(h.claudeCalls()[4]?.prompt).toContain(phase);
  } finally { await server.close(); }
});

it("keeps an unfinished stage stopped across restart, then checks a hand-finished stage and honors a before-draft stop", async () => {
  const beforeDraft = { kilnReport: 1, ran: [], finished: false, next: { kind: "before_prd", skill: "initiative-breakdown", title: "Divide the initiative", reaches: [] }, milestones: [] };
  h = await createHarness({ sourceBrief: "# Brief: Broad initiative", sessions: [
    { actions: [{ result: "I could not finish this stage." }, { exit: 0 }] },
    { actions: [{ result: "```kiln-report\n" + JSON.stringify(beforeDraft) + "\n```" }, { exit: 0 }] },
  ] });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const first = h.engine.record.requirements!.stages[0]!;
  expect(h.engine.record.phases[`req-${first.activityId}`]?.stop?.kind).toBe("done_check");
  expect(h.claudeCalls()).toHaveLength(1);
  const reopened = h.reopenFromDisk();
  await reopened.prepare();
  expect((await reopened.decide()).kind).toBe("needs_you");
  expect(await reopened.checkAgain()).toMatchObject({ ok: true });
  await reopened.settled();
  expect(reopened.record.requirements?.standing).toMatchObject({ unknown: true });
  expect(reopened.record.requirements?.stages[1]?.key).toBe("kiln:next");
  expect(buildSnapshot(reopened).requirements?.beforePrd?.skill).toBe("initiative-breakdown");
  expect(reopened.controlView().controls.filter(c => c.available).map(c => c.name)).toEqual(["reset"]);
});

it("preserves the requirements conversation at a usage limit without starting preflight or a build", async () => {
  const resetsAt = Math.floor(Date.now() / 1000) + 7200;
  h = await createHarness({ sourceBrief: "# Brief: Counter", preflight: true, sessions: [
    { actions: [{ text: "Reading the brief." }, { refuse: { rateLimitType: "five_hour", resetsAt } }, { exit: 1 }] },
  ] });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const stage = h.engine.record.requirements!.stages[0]!;
  const key = `req-${stage.activityId}`;
  expect(h.engine.latestSession(key)?.runs[0]?.limitRefusal?.rateLimitType).toBe("five_hour");
  expect(h.engine.record.phases[key]?.wait?.sessionId).toBe(h.engine.latestSession(key)?.sessionId);
  expect(h.engine.record.preflight?.due).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(1);
});

it("shows the planned Preflight row just above the build on the requirements plan, and above the first phase at the final review (AC-FINAL-04)", async () => {
  const folder = "count-boxes";
  const dir = "docs/prds/" + folder;
  const report = (skill: string, next: string, milestones: string[]) => ({ result: "```kiln-report\n" + JSON.stringify({
    kilnReport: 1, ran: [{ skill, title: skill }], finished: true, next: { kind: next === "build" ? "build" : "requirements", skill: next, title: next, reaches: [] },
    milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir }) + "\n```" });
  const phase = "phase-1-return-intake.md";
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, preflight: true, sessions: [
    { actions: [{ write: { path: `${dir}/${folder}-prd.md`, content: PRD } }, { write: { path: `${dir}/technical-design.md`, content: DESIGN } }, { write: { path: `${dir}/${phase}`, content: PHASES[phase]! } }, { commit: "requirements" },
      report("phase-split", "build", ["prd_refined", "design_ready", "requirements_finished"]), { exit: 0 }] },
    { actions: [{ write: { path: `${dir}/${folder}-stakeholder-review.html`, content: "<h1>Final</h1>" } }, { commit: "review" }, report("stakeholder-review-package", "build", []), { exit: 0 }] },
  ] });
  const hosted = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  git(h.sandbox, h.origin, "push", "-q", "--mirror", hosted.bare);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", hosted.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  await h.engine.refreshAgents();
  const before = buildSnapshot(h.engine);
  expect(before.preflight?.planned).toMatchObject({ before: "build", model: { choice: { agent: "Claude Code" } } });
  expect(before.requirements!.rows.at(-1)!.key).toBe("build");
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("final");
  const final = buildSnapshot(h.engine);
  expect(final.phases[0]?.id).toBe("1");
  // AC-FINAL-02: each phase carries its model with Change, as the screen before Start shows it.
  expect(final.phases[0]!.model).toMatchObject({ state: "will_run_on", change: { available: true } });
  expect(final.preflight?.planned).toMatchObject({ before: "1", model: { choice: { agent: "Claude Code" } } });
  // The preflight still runs only at Start the build.
  expect(h.engine.record.preflight?.due).toBeUndefined();
});

it("offers a new branch for source material even when the default name's branch is left from a reset, and keeps a typed name (AC-BEGIN-06)", async () => {
  h = await createHarness({ sourceBrief: "# Brief: Count boxes\n", sessions: [{ actions: [{ result: "Waiting." }, { exit: 0 }] }] });
  // A reset before the draft leaves the branch Kiln cut, so the default name is taken.
  const taken = h.engine.record.settings.featureBranch;
  git(h.sandbox, h.repository, "branch", taken);
  await h.engine.refreshStartPreview();
  expect(h.engine.startChoice.from).toBe("new");
  expect(h.engine.startPreview?.from).toBe("new");
  const refused = await h.engine.start({});
  expect(refused).toMatchObject({ ok: false, fieldErrors: { featureBranch: expect.stringMatching(/^That branch already exists\./) } });
  // A new name stays typed, and Start cuts that branch.
  expect(await h.engine.changeSettings({ featureBranch: "feature/count-boxes-again" })).toMatchObject({ ok: true });
  await h.engine.refreshStartPreview();
  expect(h.engine.record.settings.featureBranch).toBe("feature/count-boxes-again");
  expect(h.engine.startChoice.from).toBe("new");
  expect(h.engine.fieldErrors.featureBranch).toBeUndefined();
  expect(await h.engine.changeStart({ from: "existing", bringUpToDate: true })).toMatchObject({ ok: false, reason: "Source material starts on a new feature branch." });
  expect(await h.engine.start({})).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(git(h.sandbox, h.engine.worktreePath, "branch", "--show-current").trim()).toBe("feature/count-boxes-again");
});

it("names the source material folder, or the initiative and planned PRD, in the header until the PRD's folder exists (AC-BEGIN-07)", async () => {
  const folder = "count-boxes";
  const dir = "docs/prds/" + folder;
  const report = { kilnReport: 1, ran: [{ skill: "refine", title: "refine" }], finished: true, next: { kind: "requirements", skill: "design", title: "design", reaches: ["design_ready"] }, milestones: [{ name: "prd_refined", by: "this_session" }], prdDirectory: dir };
  h = await createHarness({ sourceBrief: "# Brief: Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: dir + "/" + folder + "-prd.md", content: PRD } }, { commit: "draft" }, { result: "```kiln-report\n" + JSON.stringify(report) + "\n```" }, { exit: 0 }] },
  ] });
  expect(buildSnapshot(h.engine).feature.location).toEqual({ kind: "source_material", folder: "source-material/count-boxes/" });
  // A planned PRD is named by its initiative and its directory, from the origin kiln run records for one.
  const origin = h.engine.record.origin!;
  commitFiles(h.sandbox, h.repository, "docs/initiatives/shifts", { "shifts-initiative-prds.md": "# Shifts Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Rotas](c.md#rotas) | None | planned |\n", "c.md": "## Rotas\n" });
  const planned = await inspectSource({ git: h.tools.git, env: h.env }, h.repository, "docs/initiatives/shifts/rotas");
  expect(planned).toHaveProperty("origin");
  h.engine.record.origin = (planned as { origin: typeof origin }).origin;
  expect(buildSnapshot(h.engine).feature.location).toEqual({ kind: "planned_prd", initiative: "docs/initiatives/shifts/", prd: "rotas" });
  h.engine.record.origin = origin;
  // Once the draft names the PRD's folder, the header names that folder.
  expect(await h.engine.start({})).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.prdDirectory).toBe(dir);
  const snapshot = buildSnapshot(h.engine);
  expect(snapshot.feature.location).toBeUndefined();
  expect(snapshot.feature.prdFolder).toBe(dir + "/");
});
