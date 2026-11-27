// Kiln After Delivery AC-MERGE-09 with real Git: a local bare origin standing in for GitHub, the
// person's main checkout, the run's worktree, scripted provider sessions and the gh stand-in
// replaying GitHub's answers. Once GitHub shows the delivery merged, by the merge session or by
// hand, Kiln fast-forwards the main checkout's base branch when that is safe, and otherwise
// changes nothing and says how far behind it is and the command to run.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, landingSession, pullRequestSession, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { createBareOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { buildSnapshot } from "./snapshot.js";
import { statusProjection } from "../control/projection.js";
import { afterDeliveryText } from "../control/delivered-facts.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import type { Receipt } from "../control/commands.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const MARK_MERGED = fileURLToPath(new URL("../../test/stand-ins/gh-mark-merged.mjs", import.meta.url));
const KEY = "acme/acme-shop#218";
const mergeStep = { bash: `git push -q origin HEAD:develop && node "${MARK_MERGED}" ${KEY} "$(git rev-parse HEAD)"` };

/** A finished run with pull request #218 open: three phases landed on the feature branch, none of them in the main checkout. */
async function finished(after: ScenarioSession[] = []): Promise<Harness> {
  h = await createHarness({ sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218), ...after] });
  h.useGithubOrigin();
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeDefined();
  show("open");
  expect((await h.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
  return h;
}
const main = () => h!.repository;
const run = (...args: string[]) => git(h!.sandbox, main(), ...args).trim();
const featureHead = () => git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "HEAD").trim();
const show = (state: "open" | "merged", mergeCommit?: string) => h!.setPullRequestViews({ [KEY]: recordedPullRequest(state, { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), ...(mergeCommit ? { mergeCommit } : {}) }) });
/**
 * Moves the origin's develop to `from`'s HEAD, as a merge on GitHub does, without moving any ref here.
 * The head goes to a ref no refspec maps, then develop moves inside the origin, since some Git versions
 * update origin/develop on a push to develop by the origin's address.
 */
function pushToOriginDevelop(from: string, origin: string): void {
  git(h!.sandbox, from, "push", "-q", origin, "HEAD:refs/landing/develop");
  git(h!.sandbox, origin, "update-ref", "refs/heads/develop", "refs/landing/develop");
  git(h!.sandbox, origin, "update-ref", "-d", "refs/landing/develop");
}
/** #218 merged on GitHub by the person: the origin's develop moves to the feature head and no ref here does. */
function mergeByHand(): string {
  pushToOriginDevelop(h!.engine.worktreePath, h!.origin);
  expect(run("rev-parse", "origin/develop")).not.toBe(featureHead());
  show("merged", featureHead());
  return featureHead();
}
const lines = () => buildSnapshot(h!.engine).afterDelivery?.baseBranches ?? [];
const statusText = () => afterDeliveryText((statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { after_delivery: Parameters<typeof afterDeliveryText>[0] }).after_delivery, false)!;
const sha7 = (sha: string) => sha.slice(0, 7);
/** Every ref on the origin: Kiln's step pushes nothing, so it must not change. */
const originRefs = () => git(h!.sandbox, main(), "ls-remote", h!.origin);
const behindBy = (from: string, to: string) => Number(run("rev-list", "--count", `${from}..${to}`));

describe("Kiln brings the local base branch up to date after the merge (Kiln After Delivery AC-MERGE-09)", () => {
  it("fast-forwards a clean main checkout on the base branch once the merge session's merge is confirmed, leaving untracked files", async () => {
    await finished([{ actions: [mergeStep, { result: "Merged #218." }, { exit: 0 }] }]);
    const before = run("rev-parse", "develop");
    writeFileSync(join(main(), "scratch-notes.txt"), "mine\n");
    const command_id = "merge-1";
    expect(h!.engine.commands.submit({ command_id, execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "merge", inputs: {} }).ok).toBe(true);
    await h!.engine.commands.settled(); await h!.engine.settled();
    expect(h!.engine.commands.lookup(command_id).operation as Receipt).toMatchObject({ state: "completed", outcome: "merge_started" });
    // The check for new phases that follows the confirmed merge brings develop up to date (AC-WAIT-03).
    await h!.engine.checkCompletedPlan();
    const merged = featureHead();
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(run("rev-parse", "origin/develop")).toBe(merged);
    expect(run("symbolic-ref", "--short", "HEAD")).toBe("develop");
    expect(existsSync(join(main(), "src/dashboard.txt"))).toBe(true);
    expect(readFileSync(join(main(), "scratch-notes.txt"), "utf8")).toBe("mine\n");
    const behind = Number(run("rev-list", "--count", `${before}..${merged}`));
    expect(behind).toBeGreaterThan(0);
    const line = `Kiln brought develop in ${main()} up to date with origin: ${behind} commits, to ${sha7(merged)}.`;
    expect(lines()).toEqual([{ repository: "acme-shop", line }]);
    expect(h!.engine.record.afterDelivery!.baseBranches).toEqual([expect.objectContaining({ outcome: "fast_forwarded", from: before, fetched: merged, behind, ahead: 0 })]);
    expect(statusText().split("\n").at(-1)).toBe(line);
    // The step happens once: a later check changes nothing and keeps the line.
    const saved = structuredClone(h!.engine.record.afterDelivery!.baseBranches);
    await h!.engine.checkCompletedPlan();
    expect(h!.engine.record.afterDelivery!.baseBranches).toEqual(saved);
  });

  it("moves the local base branch forward when the main checkout is on another branch, leaving that branch and its files as they are", async () => {
    await finished();
    const before = run("rev-parse", "develop");
    run("switch", "-q", "-c", "spike/returns-ui");
    const side = run("rev-parse", "HEAD");
    const merged = mergeByHand();
    const remote = originRefs();
    // A merge made on GitHub is confirmed at Kiln's next check (AC-MERGE-04).
    await h!.engine.checkCompletedPlan();
    expect(originRefs()).toBe(remote);
    expect(h!.engine.record.afterDelivery!.baseBranches).toEqual([expect.objectContaining({ outcome: "branch_moved", from: before, fetched: merged, checkoutBranch: "spike/returns-ui" })]);
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(run("symbolic-ref", "--short", "HEAD")).toBe("spike/returns-ui");
    expect(run("rev-parse", "HEAD")).toBe(side);
    expect(run("status", "--porcelain")).toBe("");
    expect(existsSync(join(main(), "src/dashboard.txt"))).toBe(false);
    expect(lines()).toEqual([{ repository: "acme-shop", line: `Kiln moved develop in ${main()} up to origin/develop (${behindBy(before, merged)} commits, to ${sha7(merged)}). The checkout stays on spike/returns-ui.` }]);
  });

  it("moves the local base branch from a detached checkout, leaving it detached where it was", async () => {
    await finished();
    run("switch", "-q", "--detach", "HEAD");
    const at = run("rev-parse", "HEAD");
    const merged = mergeByHand();
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(run("rev-parse", "HEAD")).toBe(at);
    expect(() => run("symbolic-ref", "-q", "HEAD")).toThrow();
    expect(lines()[0]!.line).toMatch(/\. The checkout stays where it is\.$/);
  });

  it("says nothing and creates no branch when the main checkout has no local base branch", async () => {
    await finished();
    run("switch", "-q", "-c", "spike/returns-ui");
    run("branch", "-q", "-D", "develop");
    mergeByHand();
    await h!.engine.checkCompletedPlan();
    expect(() => run("rev-parse", "--verify", "-q", "refs/heads/develop")).toThrow();
    expect(lines()).toEqual([]);
    expect(h!.engine.record.afterDelivery!.baseBranches).toEqual([expect.objectContaining({ outcome: "current" })]);
  });

  it("leaves a base branch with uncommitted changes as it is, says how far behind it is and the command, and fast-forwards once the changes are gone", async () => {
    await finished();
    const before = run("rev-parse", "develop");
    writeFileSync(join(main(), "README.md"), "# acme-shop\nEdited, not committed.\n");
    const merged = mergeByHand();
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(before);
    expect(readFileSync(join(main(), "README.md"), "utf8")).toBe("# acme-shop\nEdited, not committed.\n");
    expect(run("stash", "list")).toBe("");
    // origin/develop is fetched, so the person's own Git shows how far behind they are.
    expect(run("rev-parse", "origin/develop")).toBe(merged);
    const behind = Number(run("rev-list", "--count", `${before}..${merged}`));
    const command = `git -C ${main()} pull --ff-only origin develop`;
    const said = { repository: "acme-shop", line: `develop in ${main()} is ${behind} commits behind origin/develop. Kiln left it as it is because it has uncommitted changes.`, command };
    expect(lines()).toEqual([said]);
    expect(statusText().split("\n").at(-1)).toBe(`${said.line} To bring it up to date: ${command}`);
    expect((statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { after_delivery: { baseBranches: unknown } }).after_delivery.baseBranches).toEqual([said]);
    // Someone else's work lands on develop meanwhile; Kiln never fetches again, so it is not brought in.
    git(h!.sandbox, h!.engine.worktreePath, "commit", "-q", "--allow-empty", "-m", "chore: later work on develop");
    pushToOriginDevelop(h!.engine.worktreePath, h!.origin);
    // The person puts the edit away: the next check fast-forwards to the commit fetched after the merge, and no further.
    run("checkout", "--", "README.md");
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(run("rev-parse", "origin/develop")).toBe(merged);
    expect(lines()).toEqual([{ repository: "acme-shop", line: `Kiln brought develop in ${main()} up to date with origin: ${behind} commits, to ${sha7(merged)}.` }]);
  });

  it("refuses, changing nothing, when the fast-forward would overwrite an ignored local file, and fast-forwards once it is moved", async () => {
    await finished();
    const before = run("rev-parse", "develop");
    // A local file the person keeps out of Git, at a path the delivery adds.
    writeFileSync(join(main(), ".git/info/exclude"), "src/intake.txt\n");
    mkdirSync(join(main(), "src"), { recursive: true });
    writeFileSync(join(main(), "src/intake.txt"), "my local settings\n");
    const merged = mergeByHand();
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(before);
    expect(readFileSync(join(main(), "src/intake.txt"), "utf8")).toBe("my local settings\n");
    const [said] = lines();
    expect(said!.line).toMatch(new RegExp(`^develop in ${main()} is ${behindBy(before, merged)} commits behind origin/develop\\. Kiln left it as it is because Git refused: .*src/intake\\.txt.*\\.$`));
    expect(said!.command).toBe(`git -C ${main()} pull --ff-only origin develop`);
    rmSync(join(main(), "src/intake.txt"));
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(merged);
  });

  it("leaves a base branch with local commits origin lacks as it is, and drops the line once the person brings it up to date", async () => {
    await finished();
    writeFileSync(join(main(), "README.md"), "# acme-shop\nA local change.\n");
    run("commit", "-qam", "docs: local change");
    const local = run("rev-parse", "develop");
    const merged = mergeByHand();
    const remote = originRefs();
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(local);
    expect(originRefs()).toBe(remote);
    const [said] = lines();
    expect(said).toEqual({ repository: "acme-shop", line: `develop in ${main()} is ${behindBy(local, merged)} commits behind origin/develop and has 1 commit origin lacks. Kiln left it as it is because Kiln only fast-forwards.`, command: `git -C ${main()} pull origin develop` });
    // The person combines them their own way; the next check sees develop holds the merge and says nothing.
    run("rebase", "-q", "origin/develop");
    await h!.engine.checkCompletedPlan();
    expect(lines()).toEqual([]);
    expect(h!.engine.record.afterDelivery!.baseBranches).toEqual([expect.objectContaining({ outcome: "current" })]);
  });

  it("leaves the base branch alone when another worktree has it checked out, naming that worktree in the command", async () => {
    await finished();
    const before = run("rev-parse", "develop");
    run("switch", "-q", "-c", "spike/returns-ui");
    const elsewhere = join(h!.sandbox.root, "acme-shop-develop");
    run("worktree", "add", "-q", elsewhere, "develop");
    const merged = mergeByHand();
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(before);
    expect(git(h!.sandbox, elsewhere, "status", "--porcelain").trim()).toBe("");
    const listed = realpathSync(elsewhere);
    expect(lines()).toEqual([{ repository: "acme-shop", line: `develop in ${main()} is ${behindBy(before, merged)} commits behind origin/develop. Kiln left it as it is because it is checked out in ${listed}.`, command: `git -C ${listed} pull --ff-only origin develop` }]);
    // Running the command it gives brings develop up to date; the next check says nothing.
    git(h!.sandbox, elsewhere, "pull", "-q", "--ff-only", "origin", "develop");
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(lines()).toEqual([]);
  });

  it("says when the fetch fails, changes nothing, and fetches again at the next check", async () => {
    await finished();
    const before = run("rev-parse", "develop");
    const merged = mergeByHand();
    // Another Git process holds origin/develop's lock, so the fetch cannot write it.
    const lock = join(main(), ".git/refs/remotes/origin/develop.lock");
    writeFileSync(lock, "");
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(before);
    const [said] = lines();
    expect(said!.line).toMatch(new RegExp(`^Kiln could not bring develop in ${main()} up to date: Git could not fetch develop from origin: .+ Kiln tries again at the next check\\.$`));
    expect(said!.command).toBe(`git -C ${main()} pull --ff-only origin develop`);
    rmSync(lock);
    await h!.engine.checkCompletedPlan();
    expect(run("rev-parse", "develop")).toBe(merged);
    expect(lines()[0]!.line).toMatch(/^Kiln brought develop in .+ up to date with origin:/);
  });

  it("brings each repository's own checkout up to date, naming each repository, when the delivery spans several", async () => {
    await finished();
    // A second repository, acme-api, with its own checkout, origin and pull request #57 (as merge-with-agent's two-repository tests add it).
    const apiOrigin = createBareOrigin(h!.sandbox, "acme-api");
    const api = createRepository(h!.sandbox, "acme-api", apiOrigin);
    git(h!.sandbox, api, "push", "-q", "origin", "develop");
    git(h!.sandbox, api, "config", `url.${apiOrigin}.insteadOf`, "https://github.com/acme/acme-api.git");
    git(h!.sandbox, api, "remote", "set-url", "origin", "https://github.com/acme/acme-api.git");
    const apiWorktree = join(dirname(h!.engine.worktreePath), "acme-api");
    git(h!.sandbox, api, "worktree", "add", "-q", "-b", "feature/customer-returns", apiWorktree);
    writeFileSync(join(apiWorktree, "returns-api.txt"), "api\n");
    git(h!.sandbox, apiWorktree, "add", "returns-api.txt"); git(h!.sandbox, apiWorktree, "commit", "-qm", "feat: returns api");
    h!.engine.record.repositories.push({ name: "acme-api", kind: "added", mainCheckoutPath: api, github: "acme/acme-api", baseBranch: "develop", worktreePath: apiWorktree, setupCompletedAt: new Date().toISOString() });
    h!.engine.record.pullRequests = [...h!.engine.record.pullRequests!, { ...h!.engine.record.pullRequests![0]!, repository: "acme-api", number: 57, url: "https://github.com/acme/acme-api/pull/57" }];
    const apiHead = git(h!.sandbox, apiWorktree, "rev-parse", "HEAD").trim();
    const apiBefore = git(h!.sandbox, api, "rev-parse", "develop").trim();
    // acme-shop's checkout has an edit in progress; acme-api's is clean. Both merge on GitHub.
    const shopBefore = run("rev-parse", "develop");
    writeFileSync(join(main(), "README.md"), "# acme-shop\nEdited, not committed.\n");
    pushToOriginDevelop(h!.engine.worktreePath, h!.origin);
    pushToOriginDevelop(apiWorktree, apiOrigin);
    h!.setPullRequestViews({
      [KEY]: recordedPullRequest("merged", { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), mergeCommit: featureHead() }),
      "acme/acme-api#57": recordedPullRequest("merged", { number: 57, base: "develop", url: "https://github.com/acme/acme-api/pull/57", head: apiHead, mergeCommit: apiHead }),
    });
    await h!.engine.checkCompletedPlan();
    expect(git(h!.sandbox, api, "rev-parse", "develop").trim()).toBe(apiHead);
    expect(existsSync(join(api, "returns-api.txt"))).toBe(true);
    expect(run("rev-parse", "develop")).toBe(shopBefore);
    expect(existsSync(join(main(), "returns-api.txt"))).toBe(false);
    const expected = [
      { repository: "acme-shop", line: `acme-shop: develop in ${main()} is ${behindBy(shopBefore, featureHead())} commits behind origin/develop. Kiln left it as it is because it has uncommitted changes.`, command: `git -C ${main()} pull --ff-only origin develop` },
      { repository: "acme-api", line: `acme-api: Kiln brought develop in ${api} up to date with origin: 1 commit, to ${sha7(apiHead)}.` },
    ];
    expect(git(h!.sandbox, api, "rev-list", "--count", `${apiBefore}..${apiHead}`).trim()).toBe("1");
    expect(lines()).toEqual(expected);
    const status = statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { after_delivery: Parameters<typeof afterDeliveryText>[0] & { baseBranches: unknown } };
    expect(status.after_delivery.baseBranches).toEqual(expected);
    expect(afterDeliveryText(status.after_delivery, true)!.split("\n").slice(-2)).toEqual([`${expected[0]!.line} To bring it up to date: ${expected[0]!.command}`, expected[1]!.line]);
  });
});
