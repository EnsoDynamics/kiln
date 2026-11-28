// When a pressed Start pauses (Kiln Run Restart AC-FROM-06): only settings changed elsewhere, or an
// existing branch that moved or whose worktree changed, between the preview the page showed and the one just read.

import { describe, expect, it } from "vitest";
import type { GitContext } from "./git-reads.js";
import { startedFromNote, startPause, type PreviewRepository, type StartPreview } from "./start-from.js";

const repository = (change: Partial<PreviewRepository> = {}): PreviewRepository => ({
  name: "acme-shop", kind: "prd", mainCheckoutPath: "/work/acme-shop", github: "acme/acme-shop", baseBranch: "develop",
  hasBranch: true, baseTip: "b".repeat(40), tip: "1".repeat(40), mergeBase: "a".repeat(40), qualifies: false, ...change,
});
/** A repository of the selection that doesn't have the branch. */
const withoutBranch = (change: Partial<PreviewRepository> = {}): PreviewRepository => ({ name: "acme-shop", kind: "prd", mainCheckoutPath: "/work/acme-shop", github: "acme/acme-shop", baseBranch: "develop", hasBranch: false, baseTip: "b".repeat(40), qualifies: false, ...change });
const preview = (change: Partial<StartPreview> = {}): StartPreview => ({ from: "existing", branch: "feature/returns", bringUpToDate: true, repositories: [repository()], closedCount: 0, previewId: "shown", ...change });

describe("startPause", () => {
  it("lets every difference that doesn't put the branch in use go ahead", () => {
    const shown = preview();
    const now = preview({
      previewId: "now", closedCount: 2, startAt: { id: "3", title: "Returns dashboard" }, planSource: { kind: "base_after_catch_up", branch: "develop", sha: "c".repeat(40) },
      repositories: [repository({ baseTip: "c".repeat(40), mergeBase: "c".repeat(40), behind: 3, qualifies: true, pullRequest: { number: 48, url: "https://github.com/acme/acme-shop/pull/48" } })],
    });
    expect(startPause(shown, now)).toBeUndefined();
    // An adopted worktree whose count of uncommitted files changed, or whose pull request read failed, is the same worktree.
    const adopted = (uncommittedFiles: number, pullRequest?: PreviewRepository["pullRequest"]) => preview({ repositories: [repository({ worktree: { path: "/work/kept/acme-shop", adopted: true, uncommittedFiles }, ...(pullRequest ? { pullRequest } : {}) })] });
    expect(startPause(adopted(0), adopted(3, { unknown: "gh timed out" }))).toBeUndefined();
  });

  it("never pauses a new-branch start whose settings the page showed", () => {
    const fresh = (sha: string): StartPreview => ({ from: "new", branch: "feature/returns", bringUpToDate: true, repositories: [withoutBranch()], planSource: { kind: "base", branch: "develop", sha }, closedCount: 0, previewId: sha });
    expect(startPause(fresh("b".repeat(40)), fresh("c".repeat(40)))).toBeUndefined();
  });

  it("pauses on settings the page didn't show: another start, branch, catch-up tick or set of repositories, or no preview Kiln still holds", () => {
    const outOfDate = { headline: "This page was out of date", detail: "The settings above changed after this page loaded. The page shows them as they are now.", caution: "Look them over, then start.", changed: ["settings"] };
    expect(startPause(undefined, preview())).toMatchObject(outOfDate);
    expect(startPause(preview({ from: "new" }), preview())).toMatchObject(outOfDate);
    expect(startPause(preview({ branch: "feature/other" }), preview())).toMatchObject(outOfDate);
    expect(startPause(preview({ bringUpToDate: false }), preview())).toMatchObject(outOfDate);
    expect(startPause(preview(), preview({ repositories: [repository(), repository({ name: "storefront", kind: "named" })] }))).toMatchObject(outOfDate);
  });

  it("names the repository when several share the branch, and gives both causes when both changed", () => {
    const shown = preview({ repositories: [repository(), withoutBranch({ name: "acme-labs+storefront", kind: "named" })] });
    const now = preview({ repositories: [repository({ worktree: { path: "/work/elsewhere/acme-shop", adopted: true } }), repository({ name: "acme-labs+storefront", kind: "named", tip: "2".repeat(40) })] });
    const paused = startPause(shown, now, name => (name === "acme-labs+storefront" ? "acme-labs/storefront" : name))!;
    expect(paused.headline).toBe("Someone may be working on this branch");
    expect(paused.changed).toEqual(["branch", "worktree"]);
    expect(paused.detail).toBe("feature/returns was created in acme-labs/storefront after this page loaded. Kiln would work in /work/elsewhere/acme-shop in acme-shop, which wasn’t this branch’s worktree when this page loaded.");
  });

  it("pauses when only the fixed workspace folder differs", () => {
    expect(startPause(preview({ workspaceFolder: "/work/kept" }), preview({ workspaceFolder: "/work/elsewhere" }))).toMatchObject({ headline: "This branch’s worktree changed", detail: "The folder Kiln would work in changed after this page loaded.", changed: ["worktree"] });
  });

  it("says only that the branch changed when a tip wasn't read", () => {
    const unread: PreviewRepository = { name: "acme-shop", kind: "prd", mainCheckoutPath: "/work/acme-shop", github: "acme/acme-shop", baseBranch: "develop", hasBranch: true, qualifies: false };
    expect(startPause(preview({ repositories: [unread] }), preview())).toMatchObject({ detail: "feature/returns changed after this page loaded.", changed: ["branch"] });
  });

  it("says a worktree that went means Kiln would make its own, and a branch that went is no longer there", () => {
    const kept = preview({ repositories: [repository({ worktree: { path: "/work/kept/acme-shop", adopted: true } })] });
    expect(startPause(kept, preview())).toMatchObject({ headline: "This branch’s worktree changed", detail: "The worktree at /work/kept/acme-shop is no longer this branch’s, so Kiln would make its own.", changed: ["worktree"] });
    const two = (second: PreviewRepository) => preview({ repositories: [repository(), second] });
    expect(startPause(two(repository({ name: "storefront", kind: "named" })), two(withoutBranch({ name: "storefront", kind: "named" })))).toMatchObject({ detail: "feature/returns is no longer there in storefront.", changed: ["branch"] });
  });
});

describe("startedFromNote, where it reads nothing from Git", () => {
  // These cases settle before any Git read, so none is made.
  const git = undefined as unknown as GitContext;

  it("names Kiln's own earlier branch, not the base's tip, when a new-branch Start reuses it", async () => {
    const reused = (sha: string): StartPreview => ({ from: "new", branch: "feature/returns", bringUpToDate: true, repositories: [withoutBranch()], planSource: { kind: "base", branch: "develop", sha }, closedCount: 0, previewId: sha });
    // The base moved on since the page was drawn, but the branch an earlier Start left is what the run starts from.
    expect(await startedFromNote(git, reused("b".repeat(40)), reused("c".repeat(40)), "a".repeat(40))).toBe("Started from feature/returns at aaaaaaa, the branch an earlier Start cut from develop.");
  });

  it("says the closed phases changed, with the phase Kiln starts at when one is open", async () => {
    const at = (change: Partial<StartPreview>) => preview({ planSource: { kind: "branch", branch: "feature/returns", sha: "1".repeat(40) }, ...change });
    expect(await startedFromNote(git, at({ closedCount: 1, startAt: { id: "2", title: "Refunds" } }), at({ closedCount: 2, startAt: { id: "3", title: "Returns dashboard" }, previewId: "now" }), undefined))
      .toBe("Started from feature/returns at 1111111. The phases closed there changed after the page loaded, so Kiln starts at Phase 3.");
    expect(await startedFromNote(git, at({ closedCount: 4, startAt: { id: "5", title: "Restock" } }), at({ closedCount: 5, previewId: "now" }), undefined))
      .toBe("Started from feature/returns at 1111111. The phases closed there changed after the page loaded.");
    expect(await startedFromNote(git, at({}), at({ previewId: "now" }), undefined)).toBe("Started from feature/returns at 1111111.");
  });
});
