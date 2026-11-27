// Feedback at any time (Kiln Requirements Stages, Phase 2): the draft note, feedback sent while a
// stage runs and applied by a fresh session before the stop, Send feedback at both reviews with
// Stop here again and What changed, the wait turned off, and the routes that refuse. Real engine,
// HTTP and disposable Git; the scripted stand-in plays each session.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { DESIGN, PHASES, PRD } from "../test-support/fixture-documents.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { createGithubOrigin, git } from "../test-support/git-repositories.js";

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });

const folder = "count-boxes";
const dir = `docs/prds/${folder}`;
const prd = `${dir}/${folder}-prd.md`;
const review = `${dir}/${folder}-stakeholder-review.html`;
const assumptions = `${dir}/${folder}-assumptions.md`;
const design = `${dir}/technical-design.md`;
const phase = "phase-1-return-intake.md";

type Report = { ran?: string[]; next: string; reaches?: string[]; milestones: string[]; messages?: [string, "worked_in" | "not_worked_in"][]; changes?: string[]; draft?: { statements: string[]; leftOut: string[] } };
const report = (r: Report) => ({ result: "```kiln-report\n" + JSON.stringify({
  kilnReport: 1, ran: (r.ran ?? []).map(skill => ({ skill, title: skill })), finished: true,
  next: { kind: r.next === "build" ? "build" : "requirements", skill: r.next, title: r.next, reaches: r.reaches ?? [] },
  milestones: r.milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir,
  ...(r.messages ? { messages: r.messages.map(([id, outcome]) => ({ id, outcome })) } : {}),
  ...(r.changes ? { changes: r.changes } : {}), ...(r.draft ? { draft: r.draft } : {}),
}) + "\n```" });
const reviewSession = (content: string) => ({ actions: [{ write: { path: review, content } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] });

async function serve() {
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: folder, token: h.engine.record.token });
  const origin = `http://127.0.0.1:${boundPort(server.address)}`;
  return async (path: string, body: unknown) => {
    const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
}
const rows = () => buildSnapshot(h.engine).requirements!.rows;
const feedback = () => h.engine.record.requirements!.feedback;

it("applies feedback across every document at any moment without stopping the run, at both reviews and between them", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-feedback-"));
  const released = () => join(signals, "release");
  const refining = () => join(signals, "refining");
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    // 1. The draft, with its key statements.
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, report({ ran: ["prd-writing-standards"], next: "autonomous-prd-refinement", milestones: [],
      draft: { statements: ["A volunteer records each box's count.", "The total shows on the page."], leftOut: ["Accounts", "Export"] } }), { exit: 0 }] },
    // 2. The refinement, which runs until released: feedback is sent meanwhile.
    { actions: [{ touch: refining() }, { waitForFile: released() }, { write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report({ ran: ["autonomous-prd-refinement"], next: "technical-design-writing-standards", milestones: ["prd_refined"] }), { exit: 0 }] },
    // 3. The feedback session that applies it before the early review is made.
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\nStaff can look up a count too.\n" } }, { commit: "feedback" }, report({ next: "technical-design-writing-standards", milestones: ["prd_refined"], messages: [["m-1", "worked_in"]], changes: ["Staff can look up a count."] }), { exit: 0 }] },
    // 4. The early review.
    reviewSession("<h1>Early review</h1>"),
    // 5. Feedback at the early review, Stop here again ticked: the PRD, its assumptions and the review in one round.
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\nStaff can look up a count too.\nCounts are whole boxes.\n" } }, { write: { path: assumptions, content: "# Assumptions\n" } }, { write: { path: review, content: "<h1>Early review, refreshed</h1>" } }, { commit: "early feedback" },
      report({ next: "technical-design-writing-standards", milestones: ["prd_refined", "review_made"], messages: [["m-2", "worked_in"]], changes: ["Counts are whole boxes.", "Added an assumption on partial boxes."] }), { exit: 0 }] },
    // 6. Feedback at the early review again, not stopping: Kiln carries on to the design without waiting.
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\nStaff can look up a count too.\nCounts are whole boxes.\nShow the date.\n" } }, { write: { path: review, content: "<h1>Early review, again</h1>" } }, { commit: "second early feedback" },
      report({ next: "technical-design-writing-standards", milestones: ["prd_refined", "review_made"], messages: [["m-3", "worked_in"]], changes: ["Shows the date."] }), { exit: 0 }] },
    // 7. The design and phase plan, held while the screen is read.
    { actions: [{ touch: join(signals, "designing") }, { waitForFile: join(signals, "design-go") }, { write: { path: design, content: DESIGN } }, { write: { path: `${dir}/${phase}`, content: PHASES[phase]! } }, { commit: "design" }, report({ ran: ["technical-design-writing-standards"], next: "build", milestones: ["prd_refined", "design_ready", "requirements_finished"] }), { exit: 0 }] },
    // The design only adds files, so the early review is still current and the final review needs no session.
    // 8. Feedback at the final review reaches the design and the phase plan, and refreshes the review.
    { actions: [{ write: { path: design, content: DESIGN + "\nStaff lookup uses the same page.\n" } }, { write: { path: `${dir}/${phase}`, content: PHASES[phase]!.replace("# Phase 1: Return intake", "# Phase 1: Return intake and staff lookup") + "\nCovers the staff lookup.\n" } }, { write: { path: review, content: "<h1>Final review, refreshed</h1>" } }, { commit: "final feedback" },
      report({ next: "build", milestones: ["prd_refined", "design_ready", "requirements_finished", "review_made"], messages: [["m-4", "worked_in"]], changes: ["The design covers the staff lookup."] }), { exit: 0 }] },
  ] });
  const hosted = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  git(h.sandbox, h.origin, "push", "-q", "--mirror", hosted.bare);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", hosted.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  const post = await serve();
  // Before Start: no feedback is taken, and the wait is on by default and can be changed.
  expect((await post("feedback", { text: "Too early." })).status).toBe(409);
  expect(buildSnapshot(h.engine).settings.waitAtEarlyReview).toEqual({ value: true, canChange: true });

  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(refining()));
  // AC-NOTE-01: the draft's key statements show while the refinement runs, marked as waiting for nothing.
  expect(buildSnapshot(h.engine).requirements?.draftNote).toEqual({ statements: ["A volunteer records each box's count.", "The total shows on the page."], leftOut: ["Accounts", "Export"] });
  // AC-TALK-01, AC-TALK-03: feedback sent while a stage runs is accepted at once and holds nothing back.
  const sent = await post("feedback", { text: "Staff need to look up a count too." });
  expect(sent.status, JSON.stringify(sent.body)).toBe(202);
  expect(feedback()[0]).toMatchObject({ id: "m-1", state: "waiting" });
  expect(h.engine.record.pause.requestedAt).toBeUndefined();
  expect(h.engine.record.liveControl).toBeUndefined();
  expect((await post("feedback", { text: "x", stopAgain: true })).status).toBe(409);
  writeFileSync(released(), "go");
  await h.engine.settled();

  // AC-TALK-02: applied by a fresh session before the stop, then the review was made; the early review waits.
  expect(h.engine.reviewStop).toBe("early");
  const calls = h.claudeCalls();
  expect(calls).toHaveLength(4);
  expect(calls[2]!.prompt).toContain("Message m-1:\nStaff need to look up a count too.");
  expect(calls[2]!.prompt).toContain("every requirements document");
  const refineSha = h.engine.record.requirements!.stages[1]!.pushedSha!;
  expect(feedback()[0]).toMatchObject({ state: "applied", readAt: expect.any(String), appliedCommit: h.engine.record.requirements!.stages[2]!.pushedSha });
  // AC-TALK-04: the plan shows the commit that applied it, on the row it followed.
  const refined = rows().find(row => row.title === "autonomous-prd-refinement")!;
  expect(refined.pushedSha).toBe(refineSha);
  expect(refined.feedback).toEqual([{ sentAt: feedback()[0]!.at, appliedAt: feedback()[0]!.appliedAt, commit: feedback()[0]!.appliedCommit }]);
  expect(rows().some(row => row.title === "Applying your feedback")).toBe(false);
  // Applied on the way to the stop, so the review comes with what it changed.
  expect(buildSnapshot(h.engine).requirements!.review?.whatChanged).toEqual({ items: ["Staff can look up a count."], commit: feedback()[0]!.appliedCommit });
  // AC-NOTE-02: the early review replaces the draft note.
  expect(buildSnapshot(h.engine).requirements?.draftNote).toBeUndefined();
  // AC-EARLY-05: the refinement has finished, so the wait is fixed.
  expect(buildSnapshot(h.engine).settings.waitAtEarlyReview).toEqual({ value: true, canChange: false });
  expect((await post("settings", { waitAtEarlyReview: false })).status).toBe(409);

  // AC-EARLY-03, AC-EARLY-04: Send feedback with Stop here again: one round, then this stop again with what changed.
  const earlyAt = h.engine.record.requirements!.review!.readySince;
  expect((await post("feedback", { text: "Counts are whole boxes.", stopAgain: true })).status).toBe(202);
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  expect(h.claudeCalls()).toHaveLength(5);
  const again = buildSnapshot(h.engine).requirements!.review!;
  expect(again).toMatchObject({ kind: "early", readySince: earlyAt, refreshedAt: expect.any(String),
    whatChanged: { items: ["Counts are whole boxes.", "Added an assumption on partial boxes."], commit: h.engine.record.requirements!.stages.at(-1)!.pushedSha } });
  expect(h.engine.record.requirements!.stopAgain).toBeUndefined();
  // The stop keeps one review row, and the round's commit is listed on it.
  const earlyRows = rows().filter(row => row.title === "Stakeholder review" || row.addedByKiln === "early");
  expect(earlyRows).toHaveLength(1);
  expect(earlyRows[0]!.feedback?.map(applied => applied.commit)).toEqual([feedback()[1]!.appliedCommit]);
  expect(git(h.sandbox, h.engine.worktreePath, "show", "HEAD:" + assumptions)).toContain("Assumptions");

  // Without Stop here again, Kiln carries on to the design, then stops at the final review.
  expect((await post("feedback", { text: "Show the date." })).status).toBe(202);
  // AC-EARLY-04: while Kiln carries on, the screen shows what that round changed.
  await waitFor(() => existsSync(join(signals, "designing")), 20_000);
  expect(h.engine.reviewStop).toBeUndefined();
  expect(buildSnapshot(h.engine).requirements!.whatChanged).toEqual({ kind: "early", items: ["Shows the date."], commit: feedback()[2]!.appliedCommit });
  writeFileSync(join(signals, "design-go"), "");
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("final");
  expect(buildSnapshot(h.engine).requirements!.whatChanged).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(7);
  expect(buildSnapshot(h.engine).requirements!.review?.whatChanged).toBeUndefined();
  expect(buildSnapshot(h.engine).phases.some(row => row.title === "Return intake")).toBe(true);

  // AC-FINAL-02, AC-FINAL-03: feedback at the final review reaches the design and phase plan, and comes back here.
  expect((await post("feedback", { text: "The design must cover the staff lookup." })).status).toBe(202);
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("final");
  expect(h.claudeCalls()).toHaveLength(8);
  const final = buildSnapshot(h.engine);
  expect(final.requirements!.review).toMatchObject({ kind: "final", whatChanged: { items: ["The design covers the staff lookup."] } });
  expect(git(h.sandbox, h.engine.worktreePath, "show", `HEAD:${dir}/${phase}`)).toContain("Covers the staff lookup.");
  expect(final.phases.some(row => row.title === "Return intake and staff lookup")).toBe(true);
  expect(feedback().map(message => message.state)).toEqual(["applied", "applied", "applied", "applied"]);
  // Every push landed on origin.
  expect(git(h.sandbox, hosted.bare, "rev-parse", h.engine.record.settings.featureBranch)).toBe(git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD"));

  // Once the build starts, feedback is refused.
  const built = await h.engine.startRequirementsBuild(true);
  expect(built, JSON.stringify(built)).toMatchObject({ ok: true });
  expect((await post("feedback", { text: "Late." })).status).toBe(409);
});

it("stops a feedback session that leaves a message unworked, and with the wait off makes the early review and carries on", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-feedback-"));
  const released = () => join(signals, "release");
  const drafting = () => join(signals, "drafting");
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ touch: drafting() }, { waitForFile: released() }, { write: { path: prd, content: PRD } }, { commit: "draft" }, report({ ran: ["prd-writing-standards"], next: "autonomous-prd-refinement", milestones: [] }), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nPartly.\n" } }, { commit: "feedback" }, report({ next: "autonomous-prd-refinement", milestones: [], messages: [["m-1", "not_worked_in"]] }), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report({ ran: ["autonomous-prd-refinement"], next: "technical-design-writing-standards", milestones: ["prd_refined"] }), { exit: 0 }] },
    reviewSession("<h1>Early review</h1>"),
    { actions: [{ write: { path: design, content: DESIGN } }, { commit: "design" }, report({ ran: ["technical-design-writing-standards"], next: "build", milestones: ["prd_refined", "design_ready", "requirements_finished"] }), { exit: 0 }] },
  ] });
  const post = await serve();
  expect((await post("settings", { waitAtEarlyReview: false })).status).toBe(200);
  expect(h.engine.record.settings.waitAtEarlyReview).toBe(false);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  // Feedback to a session that takes no live messages waits, and is applied before the next stage.
  await waitFor(() => existsSync(drafting()));
  expect((await post("feedback", { text: "Also count crates." })).status).toBe(202);
  expect(buildSnapshot(h.engine).requirements?.feedbackTo).toBe("next_session");
  writeFileSync(released(), "go");
  await h.engine.settled();
  // The feedback session left m-1 unworked: Needs you names it, and no second feedback session is run.
  const stopped = h.engine.stoppedPhaseKey()!;
  expect(h.engine.record.phases[stopped]?.stop?.checks.find(check => check.name === "Feedback worked in")?.facts[0]).toContain("m-1");
  expect(feedback()[0]).toMatchObject({ state: "read" });
  expect(h.claudeCalls()).toHaveLength(2);
  // Check again with everything committed settles it as applied; a reply given at Resume when the checks pass becomes feedback.
  expect(await h.engine.checkAgain()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(feedback()[0]).toMatchObject({ state: "applied" });
  // AC-EARLY-05: with the wait off, the early review is made and Kiln goes on to the design without stopping, then stops at the final review.
  expect(h.claudeCalls()).toHaveLength(5);
  expect(h.claudeCalls()[3]!.prompt).toContain("stakeholder review");
  expect(h.engine.record.requirements!.earlyReviewHeld).toBe(true);
  expect(h.engine.record.requirements!.stages.find(stage => stage.key === "kiln:early")?.pushedSha).toBeTruthy();
  // The design stage ran straight after the early review session: nothing waited at the early review.
  expect(h.claudeCalls()[4]!.prompt).not.toContain("stakeholder review");
  expect(h.engine.reviewStop).toBe("final");
  // AC-NOTE-01: the draft report gave no key statements, so none are shown.
  expect(h.engine.record.requirements!.draftNote).toBeUndefined();
});

it("turns a reply given at a requirements Needs you whose checks pass into feedback", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: prd, content: PRD } }, { result: "Drafted, but I left it uncommitted." }, { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nWith crates.\n" } }, { commit: "feedback" }, report({ next: "autonomous-prd-refinement", milestones: [], messages: [["m-1", "worked_in"]], changes: ["Counts crates."] }), { exit: 0 }] },
    { actions: [{ result: "Stopping here." }, { exit: 0 }] },
  ] });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBeTruthy();
  git(h.sandbox, h.engine.worktreePath, "add", prd);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "draft by hand");
  expect(await h.engine.resume({ note: "Also count crates." })).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(feedback()[0]).toMatchObject({ id: "m-1", text: "Also count crates.", state: "applied" });
  expect(h.claudeCalls()[1]!.prompt).toContain("Message m-1:\nAlso count crates.");
});

it("lists feedback applied before any stage ran on the first row of the plan (AC-TALK-04)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [{ actions: [{ result: "Not finished." }, { exit: 0 }] }] });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  // The record as a run leaves it when feedback waiting at the first launch was applied by the first session, before any stage ran.
  const state = h.engine.record.requirements!;
  const at = new Date().toISOString();
  const commit = git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD");
  state.stages = [{ activityId: "applied-first", key: "kiln:feedback#1", task: "feedback", ran: [], reaches: [], startedAt: at, pushedSha: commit, messageIds: ["m-1"] },
    { activityId: "draft", key: "prd-writing-standards#1", task: "stage", ran: [{ skill: "prd-writing-standards", title: "Write the PRD" }], reaches: [], startedAt: at, pushedSha: commit }];
  state.feedback = [{ id: "m-1", text: "Counts are whole boxes.", at, state: "applied", appliedAt: at, appliedCommit: commit, appliedBy: "applied-first" }];
  const first = rows()[0]!;
  expect(first).toMatchObject({ key: "prd-writing-standards#1", feedback: [{ sentAt: at, appliedAt: at, commit }] });
  // With no stage after it yet, the first row of the plan carries it.
  state.stages = state.stages.slice(0, 1);
  expect(rows()[0]).toMatchObject({ key: "kiln:next", feedback: [{ sentAt: at, appliedAt: at, commit }] });
  // AC-EARLY-04: What changed shows only the round sent at the review, not feedback applied after the next stage started.
  const t = (n: number) => new Date(Date.parse(at) + n * 1000).toISOString();
  state.review = { kind: "early", file: "docs/prds/count-boxes/count-boxes-stakeholder-review.html", commit, readySince: at, feedbackSentAt: t(1) };
  state.stages = [
    { activityId: "round", key: "kiln:feedback#1", task: "feedback", ran: [], reaches: [], startedAt: t(2), pushedSha: "a".repeat(40), report: { ran: [], finished: true, changes: ["Shows the date."] } },
    { activityId: "design", key: "technical-design-writing-standards#1", task: "stage", ran: [{ skill: "technical-design-writing-standards", title: "Technical design" }], reaches: [], startedAt: t(3), pushedSha: commit },
    { activityId: "later", key: "kiln:feedback#2", task: "feedback", ran: [], reaches: [], startedAt: t(4), pushedSha: "b".repeat(40), report: { ran: [], finished: true, changes: ["Later change."] } },
  ];
  expect(buildSnapshot(h.engine).requirements!.whatChanged).toEqual({ kind: "early", items: ["Shows the date."], commit: "a".repeat(40) });
});

it("refuses feedback over 32 KiB and malformed feedback, and takes a pasted reply up to the limit", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  const post = await serve();
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect((await post("feedback", { text: "x".repeat(32 * 1024 + 1) })).status).toBe(413);
  expect((await post("feedback", { text: "a\0b" })).status).toBe(400);
  expect((await post("feedback", { text: "   " })).status).toBe(400);
  expect((await post("feedback", { text: "x", extra: true })).status).toBe(400);
  const pasted = "Reply\n" + "y".repeat(32 * 1024 - 6);
  const answer = await post("feedback", { text: pasted });
  expect(answer.status, JSON.stringify(answer.body)).toBe(202);
  expect(feedback()[0]).toMatchObject({ text: pasted, state: "waiting" });
});

it.skipIf(process.platform !== "darwin")("delivers a short message live to the running stage with its id line, and leaves a long one for a fresh session, with no hold", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ text: "Drafting." }, { liveMessages: 1 }, { write: { path: prd, content: PRD } }, { commit: "draft" },
      report({ ran: ["prd-writing-standards"], next: "autonomous-prd-refinement", milestones: [], messages: [["m-2", "worked_in"]] }), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nThe long reply, worked in.\n" } }, { commit: "feedback" }, report({ next: "autonomous-prd-refinement", milestones: [], messages: [["m-1", "worked_in"]], changes: ["Worked in the review reply."] }), { exit: 0 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const post = await serve();
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => h.engine.feedbackGoesLive());
  expect(buildSnapshot(h.engine).requirements?.feedbackTo).toBe("running_session");
  // Over 4,000 characters: never delivered live; it waits.
  const long = "Reply: " + "z".repeat(4100);
  expect((await post("feedback", { text: long })).status).toBe(202);
  expect(feedback()[0]).toMatchObject({ id: "m-1", state: "waiting" });
  // Message Claude aimed at the requirements session joins the same list and is delivered at once.
  const target = h.engine.liveTarget()!;
  // The browser's Message Claude takes it (AC-STAGE-04).
  expect(h.engine.liveView()!.input).toMatchObject({ available: true, reason: "Kiln sends this as feedback: this stage's session reads it at its next opportunity.", feedback: true });
  const live = await post("live/message", { instructionId: "live-1", target, text: "Boxes can be empty." });
  expect(live.status, JSON.stringify(live.body)).toBe(202);
  expect(live.body.outcome).toBe("feedback_delivered");
  await h.engine.settled();
  const inputs = readFileSync(`${h.scenarioPath}.live-inputs.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as { message: { content: string } });
  expect(inputs.map(input => input.message.content)).toEqual(["Kiln feedback m-2:\nBoxes can be empty."]);
  expect(h.engine.record.liveControl).toBeUndefined();
  const [first, second] = feedback();
  expect(second).toMatchObject({ id: "m-2", state: "applied", readAt: expect.any(String), appliedCommit: h.engine.record.requirements!.stages[0]!.pushedSha });
  // The long message was applied by a fresh session before the next stage.
  expect(first).toMatchObject({ state: "applied", appliedCommit: h.engine.record.requirements!.stages[1]!.pushedSha });
  expect(h.claudeCalls()[1]!.prompt).toContain("Message m-1:\n" + long);
  expect(h.claudeCalls()).toHaveLength(3);
});

it("takes feedback and the early review setting from the terminal, and shows the feedback in kiln status", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [{ actions: [{ result: "Not finished." }, { exit: 0 }] }] });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  await serve();
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port: boundPort(server!.address) });
  const path = join(h.repository, "source-material", folder);
  const cli = async (args: string[]) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    return { code, stdout, stderr, json: () => JSON.parse(stdout) as Record<string, unknown> };
  };
  const token = async () => (await cli(["status", path, "--json"])).json().status_token as string;
  const file = join(h.sandbox.root, "reply.txt");
  writeFileSync(file, "From the review reply: count crates as well.\n");
  const sent = await cli(["feedback", path, "--file", file, "--only-if-status-matches", await token(), "--command-id", "fb-1", "--json"]);
  expect(sent.code, sent.stdout + sent.stderr).toBe(0);
  expect(sent.json().ok).toBe(true);
  await h.engine.commands.settled();
  expect(h.engine.commands.lookup("fb-1").operation).toMatchObject({ state: "completed", outcome: "feedback_sent" });
  // The status token binds the run only, so a token from before the feedback still sends more.
  const old = await token();
  expect((await cli(["feedback", path, "--text", "And pallets.", "--only-if-status-matches", old, "--command-id", "fb-2", "--json"])).code).toBe(0);
  await h.engine.commands.settled();
  // --stop-again away from the early review is refused when the instruction is applied, and adds nothing.
  expect((await cli(["feedback", path, "--text", "x", "--stop-again", "--only-if-status-matches", old, "--command-id", "fb-3", "--json"])).code).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.commands.lookup("fb-3").operation).toMatchObject({ state: "failed", reason: "Stop here again is offered only at the early review." });
  // `kiln message` aimed at a requirements session joins the same list.
  const said = join(h.sandbox.root, "said.txt");
  writeFileSync(said, "Count bins too.");
  const message = await cli(["message", path, "--message-file", said, "--only-if-status-matches", await token(), "--command-id", "msg-1", "--json"]);
  expect(message.code, message.stdout + message.stderr).toBe(0);
  await h.engine.commands.settled();
  const status = await cli(["status", path, "--json"]);
  expect((status.json().requirements as { feedback: { text: string; state: string }[] }).feedback).toMatchObject([{ text: "From the review reply: count crates as well.\n", state: "waiting" }, { text: "And pallets.", state: "waiting" }, { text: "Count bins too.", state: "waiting" }]);
  expect((await cli(["status", path])).stdout).toContain("Feedback m-2 · waiting · And pallets.");
  const off = await cli(["settings", path, "--wait-at-early-review", "off", "--only-if-status-matches", await token(), "--command-id", "wait-off", "--json"]);
  expect(off.code, off.stdout + off.stderr).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.waitAtEarlyReview).toBe(false);
  expect((await cli(["settings", path, "--json"])).json().data).toMatchObject({ wait_at_early_review: false });
});

it("applies feedback sent while the stop's review is being made, and refreshes the review, before the stop", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-feedback-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, report({ ran: ["prd-writing-standards"], next: "autonomous-prd-refinement", milestones: [] }), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report({ ran: ["autonomous-prd-refinement"], next: "technical-design-writing-standards", milestones: ["prd_refined"] }), { exit: 0 }] },
    { actions: [{ touch: join(signals, "reviewing") }, { waitForFile: join(signals, "release") }, { write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nRefined.\nWith crates.\n" } }, { write: { path: review, content: "<h1>Early review, with crates</h1>" } }, { commit: "feedback" }, report({ next: "technical-design-writing-standards", milestones: ["prd_refined", "review_made"], messages: [["m-1", "worked_in"]], changes: ["Counts crates."] }), { exit: 0 }] },
  ] });
  const post = await serve();
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "reviewing")));
  // A review session takes no live messages: it waits.
  expect(buildSnapshot(h.engine).requirements?.feedbackTo).toBe("next_session");
  expect((await post("feedback", { text: "Count crates too." })).status).toBe(202);
  expect(feedback()[0]).toMatchObject({ state: "waiting" });
  writeFileSync(join(signals, "release"), "go");
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  expect(h.claudeCalls()).toHaveLength(4);
  expect(h.claudeCalls()[3]!.prompt).toContain("Message m-1:\nCount crates too.");
  expect(feedback()[0]).toMatchObject({ state: "applied" });
  expect(buildSnapshot(h.engine).requirements!.review).toMatchObject({ kind: "early", whatChanged: { items: ["Counts crates."] } });
  expect(git(h.sandbox, h.engine.worktreePath, "show", "HEAD:" + review)).toContain("with crates");
});

it.skipIf(process.platform !== "darwin")("sends a delivered message the session never confirmed back to waiting for a fresh session, with no hold", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    // The session ends with the message written but never confirmed read.
    { actions: [{ text: "Drafting." }, { liveMessages: 1, uncorrelated: true, exitAfter: true }] },
    { actions: [{ write: { path: prd, content: PRD + "\nWorked in.\n" } }, { commit: "feedback" }, report({ next: "prd-writing-standards", milestones: [], messages: [["m-1", "worked_in"]] }), { exit: 0 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const post = await serve();
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => h.engine.feedbackGoesLive());
  expect((await post("feedback", { text: "Boxes can be empty." })).body.outcome).toBe("feedback_delivered");
  await h.engine.settled();
  // AC-TALK-02: never shown as read, waiting again with no delivery hold, while the stage waits at Needs you.
  expect(h.engine.stoppedPhaseKey()).toBeTruthy();
  expect(h.engine.record.liveControl).toBeUndefined();
  expect(feedback()[0]).toMatchObject({ state: "waiting" });
  expect(feedback()[0]!.readAt).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(1);
  // Once the stopped stage ends, a fresh session applies it before the next stage.
  expect(await h.engine.checkAgain()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.claudeCalls()[1]!.prompt).toContain("Message m-1:\nBoxes can be empty.");
  expect(feedback()[0]).toMatchObject({ state: "applied", appliedCommit: h.engine.record.requirements!.stages[1]!.pushedSha });
});

it.skipIf(process.platform !== "darwin")("sends a message the stage read but left unworked to a fresh session", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ text: "Drafting." }, { liveMessages: 1 }, { write: { path: prd, content: PRD } }, { commit: "draft" },
      report({ ran: ["prd-writing-standards"], next: "autonomous-prd-refinement", milestones: [], messages: [["m-1", "not_worked_in"]] }), { exit: 0 }] },
    { actions: [{ write: { path: prd, content: PRD + "\nWorked in.\n" } }, { commit: "feedback" }, report({ next: "autonomous-prd-refinement", milestones: [], messages: [["m-1", "worked_in"]] }), { exit: 0 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const post = await serve();
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => h.engine.feedbackGoesLive());
  expect((await post("feedback", { text: "Count crates." })).body.outcome).toBe("feedback_delivered");
  await h.engine.settled();
  expect(h.claudeCalls()[1]!.prompt).toContain("Message m-1:\nCount crates.");
  expect(feedback()[0]).toMatchObject({ state: "applied", appliedCommit: h.engine.record.requirements!.stages[1]!.pushedSha });
});
