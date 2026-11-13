// Documents found with Start from (Kiln Run Restart AC-LOOK-01 for Phase 2, with AC-FROM-01 to 04
// and AC-CURRENT-01), rendered to HTML from the mockup's two Documents found states
// (docs/changes/kiln-run-restart/mockups/kiln-run-restart.html): today's screen with the drawn change.

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundRepositoriesSnapshot, documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";

const config = { token: "t", base: "/customer-returns" };
const html = (snapshot: Snapshot) => render(DocumentsFound, { props: { snapshot, config, connected: true } }).body.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SHA = "a".repeat(40);

/** Documents found on a branch someone built phases 1, 2a and 2b on, with its open pull request #48. */
function builtByHand(): Snapshot {
  const base = documentsFoundSnapshot();
  const phases = base.documents!.plan!.phases.map(phase => ["1", "2a", "2b"].includes(phase.id) ? { ...phase, closed: true } : phase);
  return documentsFoundSnapshot({
    settings: { featureBranch: "feature/receipts-by-hand" },
    documents: {
      plan: { ...base.documents!.plan!, closedCount: 3, phases },
      start: {
        from: "existing", bringUpToDate: true, previewId: "p".repeat(64),
        branches: [{ name: "feature/old-try", available: true }, { name: "feature/receipts-by-hand", available: true }, { name: "develop", available: false }],
        planSource: { kind: "branch", branch: "feature/receipts-by-hand", sha: SHA },
        repositories: [{ name: "acme-shop", hasBranch: true, pullRequest: { number: 48, url: "https://github.com/acme/acme-shop/pull/48" } }],
        closedCount: 3, startAt: { id: "3", title: "Returns dashboard" },
      },
    },
  });
}

/** Documents found on Kiln's own untouched branch, checked out in its worktree and 4 commits behind develop. */
function untouchedBehind(): Snapshot {
  return documentsFoundSnapshot({
    documents: {
      start: {
        from: "existing", bringUpToDate: true, previewId: "q".repeat(64),
        branches: [{ name: "feature/customer-returns", available: true }, { name: "feature/old-try", available: true }],
        planSource: { kind: "base_after_catch_up", branch: "develop", sha: SHA },
        repositories: [{ name: "acme-shop", hasBranch: true, worktree: { path: "~/work/.worktrees/customer-returns/acme-shop", adopted: true, uncommittedFiles: 0 } }],
        closedCount: 0, catchUp: { repositories: [{ name: "acme-shop", branch: "feature/customer-returns", base: "develop", behind: 4 }] },
      },
    },
  });
}

describe("Documents found, starting from a branch someone built phases on (AC-FROM-01, 02, 04)", () => {
  it("asks where to start from, lists the branches, reads PR into and says Kiln never rewrites the branch", () => {
    const page = html(builtByHand());
    const words = text(page);
    expect(words).toContain("Start from A new feature branch Kiln cuts it from the base branch. What Kiln does today. A branch that already exists Work already begun on this PRD, by you or by Kiln before a reset. Kiln carries on from it.");
    const radios = page.match(/<input type="radio" name="start-from"[^>]*>/g)!;
    expect(radios).toHaveLength(2);
    expect(radios[0]).not.toMatch(/checked/);
    expect(radios[1]).toMatch(/checked/);
    // Feature branch is a list, every name by name alone; the base reads PR into.
    expect(page).toMatch(/<select id="branch"[^>]*>.*<option value="feature\/old-try"[^>]*>feature\/old-try<\/option><option value="feature\/receipts-by-hand"[^>]*>feature\/receipts-by-hand<\/option><option value="develop"/s);
    expect(page).not.toMatch(/<input id="branch"/);
    expect(words).toContain("Feature branch");
    expect(words).toMatch(/PR into develop/);
    expect(words).not.toContain("Branch from, and PR into");
    expect(words).toContain("Kiln adds its commits to this branch and pushes them. It never rewrites, resets or force-pushes it.");
    // In today's order: Start from, Worktree, Feature branch and PR into, the line, then Agent.
    const order = ["Start from", "Worktree", "Feature branch", "PR into", "never rewrites", "Agent"].map(label => words.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("reads the plan from the branch, keeps its closed marks, marks where Kiln starts, and names the open pull request", () => {
    const words = text(html(builtByHand()));
    expect(words).toContain("Phase plan 6 phase docs Read from feature/receipts-by-hand 3 of 5 phases are already closed on that branch. Kiln starts at Phase 3.");
    expect(words).toContain("1 Return intake closed");
    expect(words).toContain("3 Returns dashboard Kiln starts here");
    expect(words).toContain("Starting lets Kiln Commit and push to feature/receipts-by-hand Use its open pull request into develop , #48 , once every phase closes Never merge, deploy, or touch other branches Start at Phase 3 Phases 1, 2a and 2b are closed on the branch and won't run. Confirm refinement to start.");
  });

  it("shows today's screen for a new feature branch, with the plan read from the base branch", () => {
    const snapshot = documentsFoundSnapshot({ documents: { start: { from: "new", bringUpToDate: true, previewId: "r".repeat(64), branches: [], planSource: { kind: "base", branch: "develop", sha: SHA }, repositories: [{ name: "acme-shop", hasBranch: false }], closedCount: 0 } } });
    const page = html(snapshot);
    const words = text(page);
    expect(page).toMatch(/<input id="branch"[^>]*value="feature\/customer-returns"/);
    expect(words).toContain("Branch from, and PR into");
    expect(words).not.toContain("never rewrites");
    expect(words).toContain("Phase plan 6 phase docs Read from develop 5 phases to implement, in this order");
    expect(words).toContain("Open one pull request into develop once every phase closes Never merge, deploy, or touch other branches Start Confirm refinement to start.");
  });
});

describe("Documents found on a new feature branch with phases closed on the base (AC-FROM-02)", () => {
  it("counts them, marks where Kiln starts and labels Start with that phase", () => {
    const snapshot = builtByHand();
    snapshot.settings.featureBranch = "feature/customer-returns";
    snapshot.documents!.start = { ...snapshot.documents!.start!, from: "new", branches: [], planSource: { kind: "base", branch: "develop", sha: SHA }, repositories: [{ name: "acme-shop", hasBranch: false }] };
    const words = text(html(snapshot));
    expect(words).toContain("Read from develop 3 of 5 phases are already closed on develop. Kiln starts at Phase 3.");
    expect(words).toContain("3 Returns dashboard Kiln starts here");
    expect(words).toContain("Start at Phase 3 Phases 1, 2a and 2b are closed on develop and won't run.");
  });
});

describe("Documents found on an untouched branch behind its base (AC-FROM-03 row 6, AC-CURRENT-01)", () => {
  it("fixes the worktree it is checked out in, offers to bring it up to date, ticked, and says Start will", () => {
    const page = html(untouchedBehind());
    const words = text(page);
    expect(page).toMatch(/<input id="worktree"[^>]*value="~\/work\/\.worktrees\/customer-returns\/acme-shop"[^>]*readonly/);
    expect(words).toContain("The branch is checked out in this folder, so Kiln works here. It has no uncommitted files. The branch and PR into are set once, before the first phase; model, effort and keep-awake can be changed later.");
    expect(words).toContain("This branch is 4 commits behind develop . Bring the branch up to date with develop first Offered because the branch has no commits of its own and nothing uncommitted, so nothing can be lost or overwritten. Kiln does this when you press Start.");
    expect(page).toMatch(/<input type="checkbox" checked/);
    expect(words).toContain("Read from the latest commit on develop , because the branch is brought up to date first");
    expect(words).toContain("Starting lets Kiln Bring feature/customer-returns up to date with develop , as ticked above Commit and push to feature/customer-returns Open one pull request into develop once every phase closes");
    // The offer follows the line and comes before Agent.
    expect(words.indexOf("never rewrites")).toBeLessThan(words.indexOf("Bring the branch up to date"));
    expect(words.indexOf("Bring the branch up to date")).toBeLessThan(words.indexOf("Agent"));
  });

  it("drops the Starting lets Kiln line when the box is unticked", () => {
    const snapshot = untouchedBehind();
    snapshot.documents!.start!.bringUpToDate = false;
    snapshot.documents!.start!.planSource = { kind: "branch", branch: "feature/customer-returns", sha: SHA };
    const words = text(html(snapshot));
    expect(words).not.toContain("as ticked above");
    expect(words).toContain("Read from feature/customer-returns");
  });
});

describe("Documents found with an unavailable existing branch selected (AC-FROM-01)", () => {
  it("still reads PR into, with the branch's reason under Feature branch", () => {
    const snapshot = builtByHand();
    snapshot.settings.fieldErrors.featureBranch = "That branch is the feature branch of Other returns, which Kiln has started. Choose another branch.";
    snapshot.documents!.start!.repositories = [{ name: "acme-shop", hasBranch: false }];
    const words = text(html(snapshot));
    expect(words).toMatch(/PR into develop/);
    expect(words).not.toContain("Branch from, and PR into");
    expect(words).toContain("Other returns, which Kiln has started");
  });
});

describe("Starting lets Kiln with development deployments on (AC-FROM-04)", () => {
  it("names the branch's open pull request beside the early-merge line", () => {
    const snapshot = builtByHand();
    snapshot.settings.developmentDeployments = { enabled: true, targets: [] };
    const words = text(html(snapshot));
    expect(words).toContain("Commit and push to feature/receipts-by-hand Use its open pull request into develop , #48 , for the work that stays open Early merges may happen on approved repository branches; remaining work stays open for review");
  });

  it("names a pull request read that failed, too", () => {
    const snapshot = builtByHand();
    snapshot.settings.developmentDeployments = { enabled: true, targets: [] };
    snapshot.documents!.start!.repositories = [{ name: "acme-shop", hasBranch: true, pullRequest: { unknown: "Kiln couldn't read acme/acme-shop's pull requests: offline" } }];
    expect(text(html(snapshot))).toContain("Use its open pull request into develop , or open one, for the work that stays open. Kiln couldn't read acme/acme-shop's pull requests: offline");
  });
});

describe("one catch-up offer across repositories with different bases (AC-CURRENT-01)", () => {
  it("names each repository's own base", () => {
    const snapshot = untouchedBehind();
    snapshot.feature.multiRepository = true;
    snapshot.documents!.start!.catchUp = { repositories: [
      { name: "acme-shop", branch: "feature/customer-returns", base: "develop", behind: 4 },
      { name: "acme-api", branch: "feature/customer-returns", base: "main", behind: 2 },
    ] };
    const words = text(html(snapshot));
    expect(words).toContain("In acme-shop , the branch is 4 commits behind develop . In acme-api , the branch is 2 commits behind main . Bring the branch up to date with each repository’s base first");
  });

  it("names the one base in the box when every repository shares it", () => {
    const snapshot = untouchedBehind();
    snapshot.feature.multiRepository = true;
    snapshot.documents!.start!.catchUp = { repositories: [
      { name: "acme-shop", branch: "feature/customer-returns", base: "develop", behind: 4 },
      { name: "acme-api", branch: "feature/customer-returns", base: "develop", behind: 2 },
    ] };
    const words = text(html(snapshot));
    expect(words).toContain("In acme-api , the branch is 2 commits behind develop . Bring the branch up to date with develop first");
    expect(words).not.toContain("each repository’s base first");
  });
});

describe("Documents found with several repositories and an unavailable existing branch (AC-FROM-05)", () => {
  it("tags PR into on the row of the repository that has the branch, and not on the one that doesn't", () => {
    const snapshot = documentsFoundRepositoriesSnapshot();
    snapshot.settings.fieldErrors.featureBranch = "In returns-api: Its local copy is behind or diverged from origin's. Bring the local branch level with origin first.";
    snapshot.documents!.start = {
      from: "existing", bringUpToDate: true, previewId: "s".repeat(64), branches: [{ name: "feature/customer-returns", available: false }],
      repositories: snapshot.repositories!.map(row => ({ name: row.name, hasBranch: row.name === "returns-api" })), closedCount: 0,
    };
    const page = html(snapshot);
    const row = (name: string) => text(page.split(`<label for="base-${name}"`)[1]!.split("</span>")[0]!.replace(/^[^>]*>/, ""));
    expect(row("returns-api")).toContain("PR into");
    expect(row("product")).not.toContain("PR into");
    expect(row("product")).toContain("PRD’s repository");
  });
});
