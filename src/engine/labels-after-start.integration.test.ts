// Labels after Start (find repositories anywhere AC-FOLDER-02, Phase 3): two repositories with
// one short name, `acme/admin` and `acme-labs/admin`, set up as `admin` and
// `acme-labs+admin`, are shown by their address paths in every done-check and pull-request
// fact, the waiver wording, the completion summary, the underway line and the Folder missing
// setup steps, never by Kiln's name; and a start from the base branch keeps their short name.
// Real Git, origins reached as github.com through an SSH stand-in, the stand-in session.

import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import type { ScenarioSession } from "../test-support/engine-harness.js";
import { PR_PHASE_KEY, readPrdRecord } from "../state/records.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { buildSnapshot } from "./snapshot.js";
import { ledger, type DeliveryContext } from "./development-delivery.js";
import type { SetupPanel } from "./folder-setup.js";
import { readStartIntent } from "./folder-setup-start.js";
import { newAcceptance } from "./continuation-setup.js";
import type { ContinuationProposal } from "./continuation-readiness.js";
import type { Receipt } from "../control/commands.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const BRANCH = "feature/customer-returns";
/** Kiln's name for either repository, which no line may show: `acme-labs+admin`, or a bare `admin` before a colon or at a word's end. */
const CLASH = /acme-labs\+admin|(^|[^/\w-])admin\b(?!\/)/;

/**
 * Phase 1 names `acme/admin` and `acme-labs/admin`, checked out at `<root>/admin` and
 * `<root>/labs/admin`; the sandbox root is the home folder, so the search finds each once. Kiln
 * names them `admin` and `acme-labs+admin`, and labels them by their address paths.
 */
async function clashingRepositories(sessions: ScenarioSession[]): Promise<Harness> {
  const files = prdDirectoryFiles();
  const [title, ...rest] = files["phase-1-return-intake.md"]!.split("\n");
  files["phase-1-return-intake.md"] = [title, "", "**Repositories:** acme/admin, acme-labs/admin", ...rest].join("\n");
  harness = await createHarness({ files, sessions });
  const h = harness;
  for (const [owner, at] of [["acme", "admin"], ["acme-labs", "labs/admin"]] as const) {
    const origin = createGithubOrigin(h.sandbox, owner, "admin");
    const checkout = createRepository(h.sandbox, at, origin.url);
    git(h.sandbox, checkout, "push", "-q", "origin", "develop");
  }
  Object.assign(h.env, h.sandbox.env, { HOME: h.sandbox.root });
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  // Added before phase 1 in plan order: the second takes the whole-path form, its short name kept.
  expect(h.engine.setUpRepositories.map((entry) => [entry.name, entry.shortName])).toEqual([["acme-shop", undefined], ["admin", undefined], ["acme-labs+admin", "admin"]]);
  return h;
}

const factsOf = (checks: { facts: string[] }[] | undefined) => (checks ?? []).flatMap((check) => check.facts);

describe("labels in the done check and the waiver wording (AC-FOLDER-02)", () => {
  it("names each repository by its label in Committed and Pushed, and in the sentence above Mark complete", async () => {
    const h = await clashingRepositories([{ actions: [{ result: "I need a decision." }] }]);
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    let facts = factsOf(h.engine.record.phases["1"]!.stop!.checks);
    expect(facts).toContain("Clean in acme-shop, acme/admin and acme-labs/admin");
    expect(facts).toEqual(expect.arrayContaining([expect.stringMatching(/^acme\/admin: /), expect.stringMatching(/^acme-labs\/admin: /)]));
    expect(facts.join(" ")).not.toMatch(CLASH);

    // Work left in one of them: its fact and the waiver wording say its label.
    writeFileSync(join(h.engine.workspaceFolder, "acme-labs+admin", "scratch.txt"), "left behind\n");
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    await h.engine.settled();
    facts = factsOf(h.engine.record.phases["1"]!.stop!.checks);
    expect(facts).toContain("acme-labs/admin: 1 file changed, not committed");
    const offer = buildSnapshot(h.engine).needsYou!.markComplete!;
    expect(offer.offered).toBe(true);
    const sentence = offer.offered ? offer.sentence.join(" ") : "";
    expect(sentence).toContain("acme-labs/admin has work that is not committed and pushed.");
    expect(`${facts.join(" ")} ${sentence}`).not.toMatch(CLASH);
  });
});

describe("labels in final delivery (AC-FOLDER-02)", () => {
  it("names each repository by its label in the pull-request facts, the completion summary and the underway line", async () => {
    const landing = (file: string): ScenarioSession => ({ actions: [
      { write: { repository: "acme-shop", path: file, content: "work\n" } },
      { write: { repository: "admin", path: file, content: "work\n" } },
      { write: { repository: "acme-labs+admin", path: file, content: "work\n" } },
      { close: true },
      { commit: "feat: the phase", repository: "acme-shop" },
      { commit: "feat: the phase", repository: "admin" },
      { commit: "feat: the phase", repository: "acme-labs+admin" },
      { push: true, repository: "acme-shop" },
      { push: true, repository: "admin" },
      { push: true, repository: "acme-labs+admin" },
      { result: "Phase landed." },
      { exit: 0 },
    ] });
    const h = await clashingRepositories([landing("one.txt"), landing("two.txt"), landing("three.txt"), { actions: [{ result: "No pull request was opened" }] }]);
    expect(h.engine.stoppedPhaseKey()).toBe(PR_PHASE_KEY);
    const facts = factsOf(buildSnapshot(h.engine).needsYou?.checks);
    expect(facts).toEqual(expect.arrayContaining([expect.stringMatching(/^acme\/admin: No open pull request/), expect.stringMatching(/^acme-labs\/admin: No open pull request/)]));
    expect(facts.join(" ")).not.toMatch(CLASH);

    // Each repository's work merged by hand: final delivery completes, already merged. The gh
    // stand-in compares against the local bare origin, which a URL rewrite reaches.
    const admin = join(h.sandbox.root, "admin");
    const labs = join(h.sandbox.root, "labs", "admin");
    git(h.sandbox, admin, "config", `url.${join(h.sandbox.root, "github", "acme", "admin.git")}.insteadOf`, "git@github.com:acme/admin.git");
    git(h.sandbox, labs, "config", `url.${join(h.sandbox.root, "github", "acme-labs", "admin.git")}.insteadOf`, "git@github.com:acme-labs/admin.git");
    for (const main of [h.repository, admin, labs]) {
      git(h.sandbox, main, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
      git(h.sandbox, main, "push", "-q", "origin", "develop");
    }
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(h.engine.record.mergedBranches?.map((branch) => branch.repository)).toEqual(["acme-shop", "admin", "acme-labs+admin"]);
    const completed = h.events.find((event) => event.kind === "pull_request" && event.event === "completed") as { summary?: string } | undefined;
    expect(completed?.summary).toBe("acme-shop already merged into develop · acme/admin already merged into develop · acme-labs/admin already merged into develop");

    // The line `kiln run` prints for a PRD already complete.
    expect(h.engine.record.completedPlanCheck).toBeUndefined();
    const line = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({ isTTY: false }, {}));
    expect(line).toContain("Already merged: acme-shop into develop · acme/admin into develop · acme-labs/admin into develop.");
    expect(line).not.toMatch(CLASH);

    // A run that completed with a pull request in each repository says so by label.
    const pull = (repository: string, number: number) => ({ repository, number, title: "Customer returns", url: `https://github.com/x/pull/${number}`, head: BRANCH, base: "develop", commits: 1, additions: 1, deletions: 0 });
    h.engine.record.pullRequests = [pull("acme-shop", 7), pull("admin", 8), pull("acme-labs+admin", 9)];
    delete h.engine.record.mergedBranches;
    expect(formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({ isTTY: false }, {}))).toContain("Pull requests acme-shop #7 · acme/admin #8 · acme-labs/admin #9 are ready for review.");
  });
});

describe("a start from the base branch on Folder missing (AC-FOLDER-01, AC-FOLDER-02)", () => {
  it("names the setup steps by label and keeps each repository's short name in the entries it rebuilds", async () => {
    const h = await clashingRepositories([{ actions: [{ result: "I need a decision." }] }, { actions: [{ result: "Still stuck." }] }]);
    rmSync(join(h.engine.workspaceFolder, "acme-labs+admin"), { recursive: true, force: true });
    await h.engine.folderGuard({ gather: true });
    // A branch name every repository already has: the field says so, each repository by its label.
    await h.engine.changeFolderPanel({ start: "base", fields: { featureBranch: BRANCH } });
    expect((h.engine.folderPanel as SetupPanel).fieldErrors.featureBranch).toBe("That branch already exists in acme-shop, acme/admin and acme-labs/admin. Choose a name no branch has in any repository.");
    await h.engine.changeFolderPanel({ start: "base", fields: { featureBranch: "feature/customer-returns-2" } });
    const panel = h.engine.folderPanel as SetupPanel;
    expect(JSON.stringify([panel.fieldErrors, panel.preview, panel.choices])).not.toMatch(CLASH);
    expect(panel.repositories.map((row) => [row.name, row.label])).toEqual([["acme-shop", "acme-shop"], ["admin", "acme/admin"], ["acme-labs+admin", "acme-labs/admin"]]);
    const answer = await h.engine.folderSetupStartCommand({ commandId: "start-base", factsId: h.engine.folderMissing!.factsId, previewId: panel.previewId, start: "base", fields: {} });
    expect(answer).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    const steps = readStartIntent(h.stateDirectory, "start-base")!.steps.map((step) => step.label);
    expect(steps).toEqual(expect.arrayContaining(["Create feature/customer-returns-2 and its folder in acme/admin", "Create feature/customer-returns-2 and its folder in acme-labs/admin"]));
    expect(steps.join(" ")).not.toMatch(CLASH);
    const record = readPrdRecord(h.stateDirectory)!;
    expect(record.repositories.map((entry) => [entry.name, entry.shortName])).toEqual([["acme-shop", undefined], ["admin", undefined], ["acme-labs+admin", "admin"]]);
    expect(h.engine.labelOf("admin")).toBe("acme/admin");
    expect(h.engine.labelOf("acme-labs+admin")).toBe("acme-labs/admin");
  });
});

describe("a continuation's accepted workspace (AC-FOLDER-01, AC-FOLDER-02)", () => {
  it("keeps each repository's short name in the entries the accepted workspace sets up", async () => {
    const h = await clashingRepositories([{ actions: [{ result: "I need a decision." }] }]);
    const proposal = {
      id: "a".repeat(64),
      repositories: h.engine.record.repositories.map((entry) => ({ name: entry.name, ...(entry.shortName === undefined ? {} : { shortName: entry.shortName }), identity: entry.github, path: entry.mainCheckoutPath, baseBranch: entry.baseBranch, baseRevision: "0".repeat(40) })),
    } as unknown as ContinuationProposal;
    const receipt = { id: randomUUID(), command_id: "continue" } as Receipt;
    const acceptance = newAcceptance({ ...h.engine.record, executionId: h.engine.record.executionId ?? randomUUID() }, h.stateDirectory, proposal, "c".repeat(64), receipt, new Date().toISOString());
    expect(acceptance.repositories.map((entry) => [entry.name, entry.shortName])).toEqual([["acme-shop", undefined], ["admin", undefined], ["acme-labs+admin", "admin"]]);
  });
});

describe("labels on the delivery panel and the completed-plan check (AC-FOLDER-02)", () => {
  it("gives each repository's result and each completion's evidence its label beside Kiln's name", async () => {
    const h = await clashingRepositories([{ actions: [{ result: "I need a decision." }] }]);
    ledger(h.engine.record).repositoryResults = [{ repository: "acme-labs+admin", state: "unresolved", deliveredCheckpointIds: [], reasons: [] }];
    expect(h.engine.deliveryStatus().repositoryResults.map((result) => [result.repository, result.label])).toEqual([["acme-labs+admin", "acme-labs/admin"]]);
    // Development delivery's reasons and facts take the engine's labels.
    const context = (h.engine as unknown as { deliveryContext(): DeliveryContext }).deliveryContext();
    expect(["admin", "acme-labs+admin"].map((name) => context.label!(name))).toEqual(["acme/admin", "acme-labs/admin"]);
    const evidence = { repository: "admin", identity: "acme/admin", revision: "a".repeat(40), baseBranch: "develop", baseRevision: "b".repeat(40), integration: "integrated_verified" as const };
    h.engine.record.completedPlanCheck = { status: "unchanged", attemptedAt: new Date().toISOString(), sources: [], errors: [], result: { leaves: [{ id: "1", title: "Return intake", file: "phase-1-return-intake.md", classification: "externally_verified", problems: [], repositories: [evidence] }] } } as unknown as NonNullable<typeof h.engine.record.completedPlanCheck>;
    const check = buildSnapshot(h.engine).continuation!.check!;
    expect(check.result!.leaves![0]!.repositories.map((repository) => [repository.repository, repository.label])).toEqual([["admin", "acme/admin"]]);
    // The saved record keeps Kiln's name only.
    expect(JSON.stringify(h.engine.record.completedPlanCheck)).not.toContain("\"label\"");
  });
});
