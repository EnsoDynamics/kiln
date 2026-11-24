// Kiln After Delivery, Phase 2a (the merge press, the merge session and Merged) with real Git, a
// local bare origin, scripted provider sessions, the gh stand-in replaying GitHub's recorded
// answers and the control journal. No paid model calls. A merge session "merges" by pushing the
// feature head to the base on the origin and marking the pull request merged in the gh stand-in's
// state, as `gh pr merge` would; Kiln decides Merged only from its own reading of GitHub.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { CODEX_CHOICE } from "../test-support/model-choices.js";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { createBareOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { buildSnapshot } from "./snapshot.js";
import { statusProjection } from "../control/projection.js";
import { afterDeliveryText } from "../control/delivered-facts.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import { MERGE_KEY } from "../state/activity-keys.js";
import type { Receipt } from "../control/commands.js";
import { startLocalServer } from "../server/local-server.js";
import { FOLDER } from "../test-support/fixture-documents.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const MARK_MERGED = fileURLToPath(new URL("../../test/stand-ins/gh-mark-merged.mjs", import.meta.url));
const KEY = "acme/acme-shop#218";
const SUMMARY = "Brought develop into the branch; no conflicts. Unit tests pass. Pushed and merged #218.";
/** The merge session's scripted merge: the feature head pushed to develop on the origin, then GitHub shows #218 merged at it. */
const mergeStep = { bash: `git push -q origin HEAD:develop && node "${MARK_MERGED}" ${KEY} "$(git rev-parse HEAD)"` };
const merging = (extra: Record<string, unknown>[] = []): ScenarioSession => ({ actions: [...extra, mergeStep, { result: SUMMARY }, { exit: 0 }] });
const stopping = (message: string): ScenarioSession => ({ actions: [{ result: message }, { exit: 0 }] });

/** A finished run: three phases and pull request #218 opened, GitHub showing it open at the feature head. */
async function finished(after: ScenarioSession[], view: "open" | "conflicting" = "open"): Promise<Harness> {
  h = await createHarness({ sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218), ...after] });
  h.useGithubOrigin();
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeDefined();
  show(view);
  // The page's load reads GitHub before the card offers anything (AC-MERGE-07).
  expect((await h.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
  return h;
}
const featureHead = () => git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "HEAD").trim();
const show = (state: "open" | "conflicting" | "closed" | "merged", mergeCommit?: string) => h!.setPullRequestViews({ [KEY]: recordedPullRequest(state, { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), ...(mergeCommit ? { mergeCommit } : {}) }) });
let commands = 0;
async function control(action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `merge-${++commands}`;
  const answer = h!.engine.commands.submit({ command_id, execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await h!.engine.commands.settled(); await h!.engine.settled();
  return h!.engine.commands.lookup(command_id).operation as Receipt;
}
const status = () => statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { state: string; after_delivery: Parameters<typeof afterDeliveryText>[0] & Record<string, unknown>; controls: { name: string; available: boolean; reason: string | null }[] };
/** Every file under a folder, recursively. */
const listFiles = (folder: string): string[] => existsSync(folder) ? readdirSync(folder).flatMap(name => { const path = join(folder, name); return statSync(path).isDirectory() ? listFiles(path) : [path]; }) : [];
const controlOf = (name: string) => h!.engine.controlView().controls.find(one => one.name === name)!;
const mergeCalls = () => h!.claudeCalls().filter(call => call.prompt.includes("You are merging the finished work"));
/** Merges #218 outside Kiln, as a person would on GitHub. */
function mergeByHand(): void {
  git(h!.sandbox, h!.engine.worktreePath, "push", "-q", "origin", "HEAD:develop");
  show("merged", featureHead());
}

describe("Merge with the agent (Kiln After Delivery AC-MERGE-01 to AC-MERGE-04, AC-MERGE-07, AC-WAIT-03, AC-BOT-01, AC-BOT-02)", () => {
  it("offers the merge from GitHub's reading, merges with one press, shows Merged with the session's summary and checks for new phases unasked", async () => {
    await finished([merging()]);
    const authorization = structuredClone(h!.engine.record.developmentAuthorization);
    const page = buildSnapshot(h!.engine);
    expect(page.feature.state).toBe("complete");
    expect(page.afterDelivery?.offer).toEqual({ kind: "offered", available: true, note: "Merge with Claude Code starts one more session in this PRD’s worktree. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges #218 into develop. Merging into develop may start its CI or deployment. To review it yourself first, open it on GitHub." });
    // kiln status lists the control and says what the card says (AC-BOT-01, AC-BOT-02).
    expect(status().controls.find(one => one.name === "merge")).toMatchObject({ available: true, reason: null });
    expect(afterDeliveryText(status().after_delivery, false)).toMatch(/^Merge with the agent: Merge with Claude Code starts one more session/);
    const phasesDone = page.feature.phasesDone;
    // The run's effort changed after the build: the merge session takes the run's model and effort as they are now (AC-MERGE-05).
    // It runs on the Audits choice (Kiln Phase Model Tiers AC-OTHER-01), changed here the way the page changes it.
    const choice = h!.engine.launchChoice(MERGE_KEY);
    const effort = h!.engine.modelEntry(choice.model)!.supportedEffortLevels.find(level => level !== choice.effort)!;
    h!.engine.record.settings.modelChoices.audits = { agentId: choice.agentId, model: choice.model, effort }; h!.engine.modelChoicesChanged();

    const receipt = await control("merge", { via: "command_line" });
    expect(receipt).toMatchObject({ state: "completed", outcome: "merge_started" });
    await h!.engine.settled();
    // One session, with the run's agent and model, given the pull request and the rules (AC-MERGE-02, AC-MERGE-03).
    expect(mergeCalls()).toHaveLength(1);
    const prompt = mergeCalls()[0]!.prompt;
    expect(prompt).toContain("1. `acme-shop` #218 (`acme/acme-shop`): `feature/customer-returns` into `develop`");
    expect(prompt).toContain("Rewrite a feature branch's history or force-push.");
    expect(prompt).toContain("`git pull --ff-only origin <feature branch>`");
    expect(prompt).toContain("--match-head-commit");
    expect(prompt).toContain("for at most 30 minutes after your last push");
    expect(prompt).toContain("Never use `--admin`, and never delete the branch.");
    // Both columns of AC-MERGE-03's table, as written, and the rule for a pull request it cannot merge.
    for (const line of ["Merge the base branch into each feature branch and resolve the conflicts.", "Run the project's own checks, push the feature branches and wait for each pull request's required checks.", "Fix failures caused by the merge or by the delivery's own work, and push again.", "Merge the delivery's pull requests listed above, by a merge method the repository allows.", "Rewrite a feature branch's history or force-push.", "Push to any branch but the delivery's feature branches.", "Merge while a required review or check has not passed, wait without end on a required check, or go around branch protection by an override or a change to the branch protection settings.", "Merge any other pull request, delete a branch or worktree, or deploy.", "If you cannot merge a pull request, end without merging the ones after it. Your last message names what is outstanding: a conflict to decide, a missing required review, a required check failing or never reported, or a pull request closed on GitHub.", "Merge them in that order. Read each description before you merge it and follow any merge order it states", "Never reopen, recreate or replace a pull request.", "abort the unfinished merge (`git merge --abort`)"]) expect(prompt).toContain(line);
    expect(mergeCalls()[0]!.cwd).toBe(h!.engine.worktreePath);
    expect(h!.engine.latestSession(MERGE_KEY)).toMatchObject({ kind: "merge", model: h!.engine.latestSession("1")!.model, effort });
    const launch = mergeCalls()[0]!.args;
    expect(launch.slice(launch.indexOf("--model"), launch.indexOf("--model") + 4)).toEqual(["--model", choice.model, "--effort", effort]);

    // Merged only from GitHub, with the merge commit and the final message word for word (AC-MERGE-04).
    const merge = h!.engine.record.afterDelivery!.merge!;
    expect(merge).toMatchObject({ via: "command_line", pullRequests: [{ repository: "acme-shop", number: 218 }], summary: SUMMARY });
    expect(merge.closedAt).toBe(merge.doneAt);
    expect(h!.engine.record.afterDelivery!.pullRequests[0]).toMatchObject({ state: "merged", mergeCommit: featureHead() });
    expect(h!.engine.currentlyComplete).toBe(true);
    // The check for new phases ran unasked once the merge was confirmed (AC-WAIT-03).
    await waitFor(() => h!.engine.record.completedPlanCheck?.status === "unchanged");
    const done = buildSnapshot(h!.engine);
    expect(done.afterDelivery?.merge).toMatchObject({ state: "done", summary: SUMMARY });
    expect(done.phases.at(-1)).toMatchObject({ id: MERGE_KEY, kind: "merge", title: "Merge", state: "done" });
    expect(done.phases.at(-1)!.file).toMatch(/^Claude Code · .+ · merged #218 into develop$/);
    expect(done.feature.phasesDone).toBe(phasesDone);
    expect(h!.events.some(event => event.kind === "merge" && event.event === "merged")).toBe(true);
    // Once per delivery: the press is never offered again, and a second command starts nothing (AC-MERGE-02).
    expect(controlOf("merge")).toMatchObject({ available: false, reason: "A merge session was already started for this delivery." });
    // kiln status says Merged in text and JSON, with the merge time and commit GitHub shows, and the summary (AC-BOT-02).
    const mergedAt = h!.engine.record.afterDelivery!.pullRequests[0]!.mergedAt!;
    expect(afterDeliveryText(status().after_delivery, false)).toBe(`Merged: #218 at ${mergedAt} (merge ${featureHead().slice(0, 7)})\nThe merge session's summary: ${SUMMARY}`);
    expect(status().after_delivery).toMatchObject({ waiting: false, pullRequests: [{ repository: "acme-shop", number: 218, state: "merged", mergedAt, mergeCommit: featureHead() }], merge: { state: "done", summary: SUMMARY } });
    // Nothing is remembered as a setting or a grant.
    expect(JSON.stringify(h!.engine.record.settings)).not.toContain("merge");
    expect(h!.engine.record.developmentAuthorization).toEqual(authorization);
  });

  it("keeps a page reading from closing the activity while the session runs, with no live controls, and closes it at the session's end", async () => {
    // The session's own signal files, in its folder (the worktree), written after the press checked it.
    await finished([merging([{ touch: "merge-started" }, { waitForFile: "go-merge" }])]);
    const started = join(h!.engine.worktreePath, "merge-started"); const go = join(h!.engine.worktreePath, "go-merge");
    // The receipt settles once the activity opens; the session then waits on this test.
    expect(h!.engine.commands.submit({ command_id: "merge-running", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "merge", inputs: {} }).ok).toBe(true);
    await h!.engine.commands.settled();
    await waitFor(() => existsSync(started));
    const running = buildSnapshot(h!.engine);
    expect(running.feature.state).toBe("complete");
    expect(running.afterDelivery?.merge?.state).toBe("running");
    expect(running.phases.at(-1)).toMatchObject({ id: MERGE_KEY, state: "implementing" });
    // The Merge row names the running session, so the card's Watch the session opens its live output (AC-MERGE-05).
    expect(running.phases.at(-1)!.details?.sessionId).toBe(h!.engine.latestSession(MERGE_KEY)!.sessionId);
    expect(running.afterDelivery?.merge?.sessionId).toBe(h!.engine.latestSession(MERGE_KEY)!.sessionId);
    expect(status().after_delivery).toMatchObject({ merge: { state: "running" } });
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Merging: the merge session is running.");
    // No message box, pause or takeover, and the reason says so (AC-MERGE-05's part for a running session).
    for (const name of ["take-over", "message", "request-pause"]) expect(controlOf(name)).toMatchObject({ available: false, reason: "Like the pull request session, the merge session can’t be messaged, paused or taken over while it runs." });
    expect(h!.engine.liveView()).toBeUndefined();
    // GitHub shows it merged while the session still runs: a page reading saves that, and only the session's end closes the activity.
    mergeByHand();
    await expect(h!.engine.checkCompletedPlan()).rejects.toThrow("Kiln checks for new phases once it confirms the merge.");
    expect(h!.engine.record.afterDelivery!.pullRequests[0]!.state).toBe("merged");
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeUndefined();
    writeFileSync(go, "");
    await waitFor(() => !!h!.engine.record.afterDelivery!.merge!.closedAt);
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBe(SUMMARY);
  });

  it("stops at Needs you with the last message when the session ends without merging; Check again reads GitHub and a hand merge shows Merged with no summary (AC-MERGE-06)", async () => {
    const message = "The conflict in src/returns/refund-router.ts needs a decision from you. I aborted the merge and did not push.";
    await finished([stopping(message)], "conflicting");
    expect(buildSnapshot(h!.engine).afterDelivery?.pullRequests[0]).toMatchObject({ state: "open", conflicts: true });
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    const stop = buildSnapshot(h!.engine).needsYou!;
    expect(stop).toMatchObject({ phaseId: MERGE_KEY, kind: "merge_check", finalMessage: message, resumeOffered: true, markComplete: { offered: false } });
    expect(stop.carryOn).toBeUndefined(); expect(stop.startAgain).toBeUndefined();
    expect(stop.checks).toEqual([expect.objectContaining({ name: "acme-shop #218", passed: false, facts: ["Open on GitHub and not merged into develop. GitHub shows it conflicts with develop."] })]);
    expect(buildSnapshot(h!.engine).afterDelivery?.merge?.state).toBe("stopped");
    expect(controlOf("carry-on").available).toBe(false); expect(controlOf("start-again").available).toBe(false);
    expect(controlOf("merge")).toMatchObject({ available: false, reason: "A merge session was already started for this delivery." });
    // kiln status says the merge session stopped, in text and JSON (AC-BOT-02).
    expect(status().after_delivery).toMatchObject({ merge: { state: "stopped" } });
    expect(afterDeliveryText(status().after_delivery, false)).toBe("Merging: the merge session stopped before merging; it needs you.");
    // Check again while it is still open keeps the stop.
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "completion_checks_failed" });
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    // Merged by hand on GitHub, and a phase planned on develop since: Check again shows Merged with no summary, and the check finds it (AC-WAIT-03).
    mergeByHand();
    git(h!.sandbox, h!.repository, "pull", "-q", "--ff-only", "origin", "develop");
    writeFileSync(join(h!.repository, "docs/prds/customer-returns/phase-5-gift-receipts.md"), "# Phase 5: Gift receipts\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n3.\n");
    git(h!.sandbox, h!.repository, "add", "docs/prds/customer-returns"); git(h!.sandbox, h!.repository, "commit", "-qm", "docs: plan gift receipts"); git(h!.sandbox, h!.repository, "push", "-q", "origin", "develop");
    expect(await control("check-again")).toMatchObject({ state: "completed", outcome: "already_done" });
    expect(h!.engine.stoppedPhaseKey()).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge).toMatchObject({ closedAt: expect.any(String) });
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBeUndefined();
    await waitFor(() => h!.engine.record.completedPlanCheck?.status !== "checking" && h!.engine.record.completedPlanCheck?.status !== undefined && h!.engine.record.completedPlanCheck?.attemptedAt !== undefined && !!h!.engine.record.afterDelivery!.merge!.closedAt && h!.engine.record.completedPlanCheck!.attemptedAt >= h!.engine.record.afterDelivery!.merge!.closedAt!);
    expect(h!.engine.record.completedPlanCheck?.result?.added.map(phase => phase.id)).toEqual(["5"]);
    expect(buildSnapshot(h!.engine).afterDelivery?.merge?.state).toBe("done");
    expect(mergeCalls()).toHaveLength(1);
  });

  it("kiln status, the built command, says in text and JSON that a stopped merge session needs you, with no Kiln running (AC-BOT-02)", async () => {
    await finished([stopping("A required review is missing on #218.")]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    await h!.engine.stop("sigterm");
    const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "cli.js");
    const env = { ...h!.env, PATH: [join(h!.sandbox.root, "bin"), h!.env.PATH ?? ""].join(delimiter) };
    const run = (json: boolean) => { const child = spawnSync(process.execPath, [cli, "status", join(h!.repository, "docs/prds", FOLDER), ...(json ? ["--json"] : [])], { cwd: h!.sandbox.root, env, encoding: "utf8" }); expect(child.stdout, `${child.status} ${child.stderr}`).not.toBe(""); return child.stdout; };
    expect(run(false).split("\n")).toContain("Merging: the merge session stopped before merging; it needs you.");
    expect(JSON.parse(run(true)).after_delivery).toMatchObject({ waiting: true, pullRequests: [{ number: 218, state: "open" }], merge: { state: "stopped", pullRequests: [{ repository: "acme-shop", number: 218 }] } });
  });

  it("resumes the same session with the reply after reading GitHub, and saves the resumed run's summary, not the stop's message (AC-MERGE-06, AC-MERGE-04)", async () => {
    await finished([stopping("A required check is failing: unit-tests. Should I skip the flaky test?"), merging()]);
    await control("merge");
    const stopped = h!.engine.latestSession(MERGE_KEY)!;
    expect(await control("reply", { message: "Fix the flaky test instead of skipping it." })).toMatchObject({ state: "completed" });
    await h!.engine.settled();
    const resumed = h!.claudeCalls().at(-1)!;
    expect(resumed.args).toContain("--resume"); expect(resumed.args).toContain(stopped.sessionId);
    expect(resumed.prompt).toContain("Fix the flaky test instead of skipping it.");
    expect(resumed.prompt).toContain("Carry on merging the delivery's pull requests from where you stopped.");
    expect(resumed.prompt).toContain("1. `acme-shop` #218 (`acme/acme-shop`): `feature/customer-returns` into `develop`, worktree");
    expect(h!.engine.record.afterDelivery!.merge).toMatchObject({ summary: SUMMARY, closedAt: expect.any(String) });
  });

  it("Resume with no reply resumes the same merge session once, which merges, and shows Merged (AC-MERGE-06)", async () => {
    await finished([stopping("Waiting on a review."), merging()]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    const stopped = h!.engine.latestSession(MERGE_KEY)!;
    expect(await control("resume")).toMatchObject({ state: "completed", outcome: "session_resumed" });
    await h!.engine.settled();
    const resumes = h!.claudeCalls().filter(call => call.args.includes("--resume"));
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.args).toContain(stopped.sessionId);
    expect(resumes[0]!.prompt).toContain("Carry on merging the delivery's pull requests from where you stopped.");
    expect(mergeCalls()).toHaveLength(1);
    expect(h!.engine.record.afterDelivery!.merge).toMatchObject({ summary: SUMMARY, closedAt: expect.any(String) });
  });

  it("closes the activity without resuming when Resume finds every pull request merged, and refuses Resume when GitHub can't be read", async () => {
    await finished([stopping("Waiting on a review.")]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    h!.setPullRequestViews({ [KEY]: { error: "HTTP 502: Bad Gateway" } });
    const refused = h!.engine.commands.submit({ command_id: "resume-unreadable", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "resume", inputs: {} });
    expect(refused.ok).toBe(true);
    await h!.engine.commands.settled();
    expect(h!.engine.commands.lookup("resume-unreadable").operation).toMatchObject({ state: "failed", reason: expect.stringContaining("HTTP 502: Bad Gateway") });
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);
    mergeByHand();
    expect(await control("resume")).toMatchObject({ state: "completed", outcome: "already_done" });
    expect(h!.engine.stoppedPhaseKey()).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(h!.claudeCalls().filter(call => call.args.includes("--resume"))).toEqual([]);
  });
});

describe("the stop's own cases (AC-MERGE-06, AC-MERGE-04, AC-MERGE-07)", () => {
  it("stops naming a pull request closed on GitHub mid-session, with the terminal command, and never reopens it", async () => {
    const closeIt = { bash: `node -e 'const fs=require("fs");const p=process.env.KILN_STANDIN_GH_STATE;const s=JSON.parse(fs.readFileSync(p));s.views["${KEY}"]={...s.views["${KEY}"],state:"CLOSED",closed:true};fs.writeFileSync(p,JSON.stringify(s))'` };
    await finished([{ actions: [closeIt, { result: "acme-shop #218 was closed on GitHub, so I stopped without merging." }, { exit: 0 }] }]);
    await control("merge");
    const stop = buildSnapshot(h!.engine).needsYou!;
    expect(stop.checks).toEqual([expect.objectContaining({ name: "acme-shop #218", passed: false, facts: ["acme-shop #218 was closed on GitHub without merging. Reopen it there, then press Resume."] })]);
    expect(stop.resumeCommand).toContain(`claude --resume ${h!.engine.latestSession(MERGE_KEY)!.sessionId}`);
    // The card's reopen line is left out once a merge activity exists.
    expect(buildSnapshot(h!.engine).afterDelivery?.offer.line).toBeUndefined();
    expect(h!.ghCalls().some(call => call[0] === "pr" && ["reopen", "create"].includes(call[1]!))).toBe(false);
    // Check again keeps the stop while it is closed.
    expect(await control("check-again")).toMatchObject({ outcome: "completion_checks_failed" });
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
  });

  it("stops, never shows Merged, when GitHub can't be read at the session's end", async () => {
    await finished([{ actions: [{ bash: `node -e 'const fs=require("fs");const p=process.env.KILN_STANDIN_GH_STATE;const s=JSON.parse(fs.readFileSync(p));s.views["${KEY}"]={error:"HTTP 502: Bad Gateway"};fs.writeFileSync(p,JSON.stringify(s))'` }, { result: "Merged #218." }, { exit: 0 }] }]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeUndefined();
    expect(buildSnapshot(h!.engine).needsYou!.checks[0]!.facts[0]).toContain("HTTP 502: Bad Gateway");
  });
});

describe("the press from the page (AC-MERGE-02)", () => {
  it("accepts the page's press with its status token, replays the same command, refuses a stale token, and keeps the token across a reading that changes nothing", async () => {
    await finished([{ actions: [{ waitForFile: "never" }] }]);
    // A reading that changes no pull request's state keeps the status token (only its time changed).
    const token = h!.engine.controlView().token;
    await h!.engine.checkCompletedPlan();
    expect(h!.engine.controlView().token).toBe(token);
    const server = await startLocalServer({ engine: h!.engine, port: 0, folderName: FOLDER, featureName: "Customer returns", token: h!.engine.record.token });
    try {
      const origin = new URL(server.address).origin;
      const press = (id: string, status: string) => fetch(`${origin}/api/merge`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h!.engine.record.token, "X-Kiln-Status": status, "X-Kiln-Command-Id": id } });
      const first = await press("page-merge", token);
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ ok: true, outcome: "merge_started" });
      expect(h!.engine.record.afterDelivery!.merge!.via).toBe("browser");
      const replay = await press("page-merge", token);
      expect(await replay.json()).toMatchObject({ ok: true, outcome: "merge_started" });
      const stale = await press("page-merge-again", token);
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ ok: false, code: "stale_status_token" });
      await waitFor(() => mergeCalls().length === 1);
      expect(mergeCalls()).toHaveLength(1);
    } finally { await h!.engine.stop("sigint"); await server.close(); }
  });

  it("with Codex chosen, the press starts one Codex merge session with the merge prompt (AC-MERGE-02)", async () => {
    await finished([]);
    const f = codexWorkFixture();
    try {
      Object.assign(h!.tools, { codex: f.options.executable });
      f.configureEnvironment(h!.env);
      f.set({ dynamicRecord: true, stateDirectory: h!.stateDirectory });
      h!.engine.record.settings.modelChoices.kept = { ...CODEX_CHOICE };
      h!.reopen(); await h!.engine.agents.refresh();
      expect(h!.engine.selectionError).toBeUndefined();
      await h!.engine.checkCompletedPlan();
      expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
      await h!.engine.settled();
      const starts = f.calls().filter(call => call.method === "turn/start");
      expect(starts).toHaveLength(1);
      const input = JSON.stringify(starts[0]!.params!.input);
      expect(input).toContain("You are merging the finished work");
      expect(input).toContain("#218 (`acme/acme-shop`): `feature/customer-returns` into `develop`");
      expect(h!.engine.latestSession(MERGE_KEY)).toMatchObject({ agentId: "codex", kind: "merge" });
      expect(mergeCalls()).toEqual([]);
    } finally { await h!.engine.stop("sigint"); await f.sandbox.cleanup(); }
  });

  it("remembers nothing for another PRD: no state outside this PRD's own changes, and the other PRD has no merge (AC-MERGE-02)", async () => {
    await finished([merging()]);
    const root = stateRoot(h!.env);
    const outside = () => listFiles(root).filter(file => !file.startsWith(h!.stateDirectory)).map(file => [file, readFileSync(file, "utf8")]);
    const before = outside();
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
    await h!.engine.settled();
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    // Every file the press and the merge wrote is in this PRD's own state.
    expect(outside()).toEqual(before);
    const other = await h!.engineFor("another-prd");
    try {
      expect(other.record.afterDelivery).toBeUndefined();
      expect(other.record.developmentAuthorization).toMatchObject({ enabled: false, grants: [] });
      expect(other.controlView().controls.find(one => one.name === "merge")!.available).toBe(false);
    } finally { other.close(); }
  });

  it("gives the session the order a description states (Merge order line)", async () => {
    await finished([]);
    h!.setPullRequestViews({ [KEY]: recordedPullRequest("open", { number: 218, base: "develop", head: featureHead(), body: "Delivers customer returns.\n\nMerge order: 1 of 1" }) });
    await h!.engine.checkCompletedPlan();
    expect(h!.engine.record.afterDelivery!.pullRequests[0]!.order).toEqual({ position: 1, of: 1 });
  });
});

describe("what the card offers (AC-MERGE-07) and the press's own checks", () => {
  it("offers nothing for a closed pull request and refuses the press, and offers nothing while GitHub can't be read", async () => {
    await finished([]);
    show("closed");
    await h!.engine.checkCompletedPlan({ press: true });
    const closed = buildSnapshot(h!.engine).afterDelivery!.offer;
    expect(closed).toMatchObject({ kind: "closed", available: false, line: "Pull request #218 was closed without merging, so Kiln doesn’t offer to merge it. Reopen it on GitHub and the merge comes back." });
    expect(controlOf("merge")).toMatchObject({ available: false, reason: "A pull request of this delivery was closed on GitHub without merging." });
    h!.setPullRequestViews({ [KEY]: { error: "HTTP 502: Bad Gateway" } });
    await h!.engine.checkCompletedPlan().catch(() => undefined);
    const unreadable = buildSnapshot(h!.engine).afterDelivery!.offer;
    expect(unreadable.kind).toBe("unreadable");
    expect(unreadable.line).toContain("GitHub could not be read, so Kiln doesn’t offer the merge.");
    expect(unreadable.line).toContain("HTTP 502: Bad Gateway");
    // Unreadable: the control is unavailable for that reason, and the card has no note beside it.
    expect(controlOf("merge")).toMatchObject({ available: false, reason: "GitHub could not be read for this delivery's pull requests." });
    expect(unreadable.note).toBeUndefined();
    // The press reads GitHub again: read open, then closed on GitHub before the press, it is refused and nothing opens.
    show("open"); await h!.engine.checkCompletedPlan();
    expect(controlOf("merge").available).toBe(true);
    show("closed");
    expect(await control("merge")).toMatchObject({ state: "failed", reason: expect.stringContaining("was closed without merging") });
    expect(h!.engine.record.afterDelivery!.merge).toBeUndefined();
    expect(mergeCalls()).toEqual([]);
  });

  it("refuses the press when GitHub can't be read at the press, though the page last read it open", async () => {
    await finished([merging()]);
    expect(controlOf("merge").available).toBe(true);
    h!.setPullRequestViews({ [KEY]: { error: "HTTP 502: Bad Gateway" } });
    expect(await control("merge")).toMatchObject({ state: "failed", reason: expect.stringContaining("GitHub could not be read, so Kiln doesn’t offer the merge.") });
    expect(h!.engine.record.afterDelivery!.merge).toBeUndefined();
    expect(mergeCalls()).toEqual([]);
  });

  it("says GitHub could not be read, and why, beside the closed line when one pull request is closed and another can't be read", async () => {
    await finished([]);
    // A second pull request of the delivery, in a repository Kiln has no record of, so its read fails.
    h!.engine.record.pullRequests = [...h!.engine.record.pullRequests!, { ...h!.engine.record.pullRequests![0]!, repository: "acme-api", number: 57, url: "https://github.com/acme/acme-api/pull/57" }];
    show("closed");
    await h!.engine.checkCompletedPlan({ press: true }).catch(() => undefined);
    const offer = buildSnapshot(h!.engine).afterDelivery!.offer;
    expect(offer.kind).toBe("closed");
    expect(offer.available).toBe(false);
    expect(offer.line).toContain("acme-shop #218 was closed without merging, so Kiln doesn’t offer to merge this delivery.");
    expect(offer.line).toContain("GitHub could not be read for acme-api #57.");
    // And why: Kiln has no GitHub repository recorded for it.
    expect(offer.line).toBe("acme-shop #218 was closed without merging, so Kiln doesn’t offer to merge this delivery. Reopen #218 on GitHub and the merge comes back. GitHub could not be read for acme-api #57. Kiln has no GitHub repository recorded for acme-api.");
  });

  it("completes as already merged when GitHub shows every pull request merged, with no session", async () => {
    await finished([]);
    mergeByHand();
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "already_merged" });
    expect(mergeCalls()).toEqual([]);
    // The merge time and commit are GitHub's, saved as read (AC-MERGE-04).
    expect(h!.engine.record.afterDelivery!.pullRequests[0]).toMatchObject({ state: "merged", mergeCommit: featureHead(), mergedAt: recordedPullRequest("merged", { number: 218, base: "develop" }).mergedAt });
    expect(h!.engine.record.afterDelivery!.merge).toBeUndefined();
    await waitFor(() => h!.engine.record.completedPlanCheck?.status === "unchanged");
    expect(buildSnapshot(h!.engine).afterDelivery!.offer).toMatchObject({ kind: "all_merged", available: false });
  });

  it("refuses a worktree with uncommitted work, a merge in progress, or commits on both sides, and accepts one behind GitHub's head", async () => {
    await finished([merging()]);
    const worktree = h!.engine.worktreePath;
    writeFileSync(join(worktree, "scratch.txt"), "x\n");
    expect(await control("merge")).toMatchObject({ state: "failed", reason: expect.stringContaining("it has uncommitted work") });
    git(h!.sandbox, worktree, "clean", "-fq");
    const head = featureHead();
    const gitDir = git(h!.sandbox, worktree, "rev-parse", "--absolute-git-dir").trim();
    // A merge in progress shows no uncommitted change until a file conflicts.
    writeFileSync(join(gitDir, "MERGE_HEAD"), `${head}\n`);
    expect(await control("merge")).toMatchObject({ state: "failed", reason: expect.stringContaining("a merge is in progress there") });
    git(h!.sandbox, worktree, "merge", "--abort");
    // A commit GitHub has (Update branch) and a local one: diverged.
    git(h!.sandbox, worktree, "commit", "-q", "--allow-empty", "-m", "remote: update branch");
    git(h!.sandbox, worktree, "push", "-q", "origin", "HEAD:feature/customer-returns");
    show("open");
    git(h!.sandbox, worktree, "reset", "-q", "--hard", head);
    git(h!.sandbox, worktree, "commit", "-q", "--allow-empty", "-m", "local: unpushed");
    expect(await control("merge")).toMatchObject({ state: "failed", reason: expect.stringContaining("each have commits the other lacks") });
    // Behind GitHub's head (after Update branch): accepted, recording the worktree's head.
    git(h!.sandbox, worktree, "reset", "-q", "--hard", head);
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
    expect(h!.engine.record.afterDelivery!.merge!.pressHeads).toEqual([{ repository: "acme-shop", sha: head }]);
  });
});

describe("a delivery of two pull requests (AC-MERGE-01, AC-MERGE-02, AC-MERGE-04, AC-MERGE-07)", () => {
  const API_KEY = "acme/acme-api#57";
  let apiWorktree = "";
  /** A second repository of the run, acme-api, set up with its own worktree on the feature branch and pull request #57 open into develop. */
  function withApi(): void {
    const origin = createBareOrigin(h!.sandbox, "acme-api");
    const api = createRepository(h!.sandbox, "acme-api", origin);
    git(h!.sandbox, api, "push", "-q", "origin", "develop");
    // Its GitHub origin, served by the local bare origin, as useGithubOrigin gives acme-shop.
    git(h!.sandbox, api, "config", `url.${origin}.insteadOf`, "https://github.com/acme/acme-api.git");
    git(h!.sandbox, api, "remote", "set-url", "origin", "https://github.com/acme/acme-api.git");
    // Beside acme-shop's worktree, in the run's workspace.
    apiWorktree = join(dirname(h!.engine.worktreePath), "acme-api");
    git(h!.sandbox, api, "worktree", "add", "-q", "-b", "feature/customer-returns", apiWorktree);
    writeFileSync(join(apiWorktree, "returns-api.txt"), "api\n");
    git(h!.sandbox, apiWorktree, "add", "returns-api.txt"); git(h!.sandbox, apiWorktree, "commit", "-qm", "feat: returns api");
    git(h!.sandbox, apiWorktree, "push", "-q", "origin", "feature/customer-returns");
    h!.engine.record.repositories.push({ name: "acme-api", kind: "added", mainCheckoutPath: api, github: "acme/acme-api", baseBranch: "develop", worktreePath: apiWorktree, setupCompletedAt: new Date().toISOString() });
    h!.engine.record.pullRequests = [...h!.engine.record.pullRequests!, { ...h!.engine.record.pullRequests![0]!, repository: "acme-api", number: 57, url: "https://github.com/acme/acme-api/pull/57" }];
  }
  const apiHead = () => git(h!.sandbox, apiWorktree, "rev-parse", "HEAD").trim();
  const views = (shop: { state: "open" | "merged"; body?: string }, api: { state: "open" | "merged"; body?: string }) => h!.setPullRequestViews({
    [KEY]: recordedPullRequest(shop.state, { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), ...(shop.state === "merged" ? { mergeCommit: featureHead() } : {}), ...(shop.body ? { body: shop.body } : {}) }),
    [API_KEY]: recordedPullRequest(api.state, { number: 57, base: "develop", url: "https://github.com/acme/acme-api/pull/57", head: apiHead(), ...(api.state === "merged" ? { mergeCommit: apiHead() } : {}), ...(api.body ? { body: api.body } : {}) }),
  });
  // With two repositories the session runs in the workspace, the folder holding both worktrees.
  const mergeIn = (folder: string, key: string) => ({ bash: `git -C ${folder} push -q origin HEAD:develop && node "${MARK_MERGED}" ${key} "$(git -C ${folder} rev-parse HEAD)"` });
  const mergeApi = mergeIn("acme-api", API_KEY);
  const mergeShop = mergeIn("acme-shop", KEY);

  it("gives the session the open pull requests in the order their descriptions state, not the recorded order, and shows Merged only once both are merged", async () => {
    await finished([{ actions: [mergeApi, mergeShop, { result: "Merged acme-api #57, then acme-shop #218." }, { exit: 0 }] }]);
    withApi();
    // Recorded order is acme-shop then acme-api; the descriptions reverse it.
    views({ state: "open", body: "Merge order: 2 of 2" }, { state: "open", body: "Merge order: 1 of 2" });
    expect((await h!.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
    const offer = buildSnapshot(h!.engine).afterDelivery!.offer;
    // One press for the whole delivery, whose note names both in the stated order (AC-MERGE-01).
    expect(offer).toMatchObject({ kind: "offered", available: true });
    expect(offer.note).toBe("Merge with Claude Code starts one more session in this PRD’s workspace. It merges acme-api #57 first and then acme-shop #218, the order the pull requests state, bringing develop into each branch, resolving any conflicts, running the tests and waiting for the required checks before each merge. If one can’t be merged, it stops there and leaves the other open. Each merge into develop may start that repository’s CI or deployment.");
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
    await h!.engine.settled();
    expect(mergeCalls()).toHaveLength(1);
    const prompt = mergeCalls()[0]!.prompt;
    const first = prompt.indexOf("1. `acme-api` #57 (`acme/acme-api`): `feature/customer-returns` into `develop`");
    const second = prompt.indexOf("2. `acme-shop` #218 (`acme/acme-shop`): `feature/customer-returns` into `develop`");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(h!.engine.record.afterDelivery!.merge!.pullRequests).toEqual([{ repository: "acme-api", number: 57 }, { repository: "acme-shop", number: 218 }]);
    expect(h!.engine.record.afterDelivery!.merge!.pressHeads).toEqual([{ repository: "acme-api", sha: apiHead() }, { repository: "acme-shop", sha: featureHead() }]);
    // Merged from GitHub's reading of both, each with its own merge commit (AC-MERGE-04).
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(h!.engine.record.afterDelivery!.pullRequests.map(row => [row.repository, row.state, row.mergeCommit])).toEqual([["acme-shop", "merged", featureHead()], ["acme-api", "merged", apiHead()]]);
    expect(buildSnapshot(h!.engine).phases.at(-1)!.file).toMatch(/merged acme-api #57 and acme-shop #218 into develop$/);
  });

  it("stops at the first pull request the session cannot merge: the one after stays open, the last message is shown word for word, never Merged, and the resume keeps the first message's limits (AC-MERGE-03)", async () => {
    const message = "Merged acme-shop #218. acme-api #57 is not merged: its required check unit-tests is failing after my fix, so I stopped there.";
    await finished([{ actions: [mergeShop, { result: message }, { exit: 0 }] }, stopping("Still failing.")]);
    withApi();
    views({ state: "open", body: "Merge order: 1 of 2" }, { state: "open", body: "Merge order: 2 of 2" });
    expect((await h!.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
    const apiBase = git(h!.sandbox, h!.engine.record.repositories.find(row => row.name === "acme-api")!.mainCheckoutPath, "ls-remote", "origin", "refs/heads/develop").split("\t")[0];
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
    await h!.engine.settled();
    // The session merged #218 and ended at #57; GitHub still shows #57 open, so Kiln stops at Needs you.
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    const stop = buildSnapshot(h!.engine).needsYou!;
    expect(stop).toMatchObject({ phaseId: MERGE_KEY, kind: "merge_check", finalMessage: message, resumeOffered: true });
    expect(stop.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "acme-api #57", passed: false })]));
    // Never Merged on the session's word: no close, no summary, the card's merge stopped, #57 open and its base unmoved.
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeUndefined();
    expect(h!.engine.record.afterDelivery!.merge!.summary).toBeUndefined();
    const card = buildSnapshot(h!.engine).afterDelivery!;
    expect(card.merge?.state).toBe("stopped");
    expect(card.pullRequests.map(row => [row.repository, row.state])).toEqual([["acme-shop", "merged"], ["acme-api", "open"]]);
    expect(git(h!.sandbox, h!.engine.record.repositories.find(row => row.name === "acme-api")!.mainCheckoutPath, "ls-remote", "origin", "refs/heads/develop").split("\t")[0]).toBe(apiBase);
    // A reply resumes the same session, which is told again that the first message's limits still apply, with no --admin.
    expect(await control("reply", { message: "Merge #57 anyway." })).toMatchObject({ state: "completed" });
    await h!.engine.settled();
    const resumed = h!.claudeCalls().at(-1)!;
    expect(resumed.prompt).toContain("Merge #57 anyway.");
    expect(resumed.prompt).toContain("Everything in the first message still applies: the same order, what you may and may not do");
    expect(resumed.prompt).toContain("`gh pr merge --match-head-commit` with no `--admin` and no branch deleted");
    // Only #57 is left to merge in the resume's list.
    expect(resumed.prompt).toContain("`acme-api` #57");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeUndefined();
  });

  it("merges only the one still open when the other is already merged, shows the merged one beside the press, and is not Merged while one is open", async () => {
    await finished([{ actions: [mergeShop, { result: SUMMARY }, { exit: 0 }] }]);
    withApi();
    // acme-api #57 merged on GitHub by hand before the press.
    git(h!.sandbox, apiWorktree, "push", "-q", "origin", "HEAD:develop");
    views({ state: "open" }, { state: "merged" });
    expect((await h!.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
    const card = buildSnapshot(h!.engine).afterDelivery!;
    expect(card.pullRequests.find(row => row.repository === "acme-api")).toMatchObject({ number: 57, state: "merged", mergeCommit: apiHead() });
    expect(card.pullRequests.find(row => row.repository === "acme-shop")).toMatchObject({ number: 218, state: "open" });
    expect(card.offer).toMatchObject({ kind: "offered", available: true });
    expect(card.offer.note).toBe("acme-api #57 is already merged, so Merge with Claude Code merges only acme-shop #218. It starts one more session in this PRD’s workspace. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges acme-shop #218 into develop. Merging into develop may start its CI or deployment.");
    // One merged and one open is not Merged.
    expect(h!.engine.currentlyComplete).toBe(true);
    expect(card.merge).toBeUndefined();
    expect(await control("merge")).toMatchObject({ state: "completed", outcome: "merge_started" });
    await h!.engine.settled();
    // The permission covers only the open one: the activity and the prompt hold acme-shop #218 alone (AC-MERGE-02).
    expect(h!.engine.record.afterDelivery!.merge!.pullRequests).toEqual([{ repository: "acme-shop", number: 218 }]);
    expect(h!.engine.record.afterDelivery!.merge!.pressHeads).toEqual([{ repository: "acme-shop", sha: featureHead() }]);
    const prompt = mergeCalls()[0]!.prompt;
    expect(prompt).toContain("1. `acme-shop` #218 (`acme/acme-shop`)");
    expect(prompt).not.toContain("#57");
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    expect(buildSnapshot(h!.engine).afterDelivery!.merge).toMatchObject({ state: "done", pullRequests: [{ repository: "acme-shop", number: 218 }] });
  });
});
