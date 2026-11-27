// AC-HOME-13's rows that depend on Kiln's own records and on Git alone (Kiln Requirements Stages
// AC-HOME-02 to 05, 12, 13): a real repository, real records, and each run's Kiln as the probe
// reports it. The probe's reading of a live Kiln is `runStateOf`, tested below; its HTTP side is
// the one `kiln status` uses.

import { afterEach, expect, it } from "vitest";
import { runStateOf } from "../control/client.js";
import type { SavedWork } from "../control/private-state.js";
import { defaultSettings } from "../engine/worktree-setup.js";
import { newRequirements } from "../requirements/stages.js";
import { newPrdRecord } from "../state/new-record.js";
import { commitFiles, createBareOrigin, createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { scanRepository } from "./scan.js";
import type { PrdRecord } from "../state/records.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

function record(repo: string, path: string, change: (one: PrdRecord) => void): SavedWork {
  const one = newPrdRecord({ mainCheckoutPath: repo, repositoryName: "shop", github: "acme/shop", prdDirectoryFromRoot: path, featureName: path.split("/").at(-1)!, settings: defaultSettings({ mainCheckoutPath: repo, repositoryName: "shop", folderName: path.split("/").at(-1)!, prdDirectoryFromRoot: path }, undefined) });
  change(one);
  return { root: "/state", directory: `/state/${path}`, record: one, canonical: path, observedAt: new Date().toISOString() };
}

it("places recorded runs, material Kiln or a PRD was started from, origin-only material, files in progress and the folded order (AC-HOME-13)", async () => {
  sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "shop");
  const repo = createRepository(sandbox, "shop", origin);
  git(sandbox, repo, "push", "-qu", "origin", "develop");
  // Committed only on origin's develop: the step left is bringing the local develop up to date (AC-HOME-03).
  commitFiles(sandbox, repo, "source-material/origin-only", { "origin-only-brief.md": "# Brief: Origin only\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~1");
  git(sandbox, repo, "fetch", "-q", "origin");
  // Material Kiln started a PRD from, material with an initiative of its name, and material whose PRD is only on another branch: none listed.
  commitFiles(sandbox, repo, "source-material/boxes", { "boxes-brief.md": "# Brief: Boxes\n" });
  commitFiles(sandbox, repo, "source-material/loyalty", { "loyalty-brief.md": "# Brief: Loyalty\n" });
  commitFiles(sandbox, repo, "docs/initiatives/loyalty", { "loyalty-initiative-prds.md": "# Loyalty Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Points](c.md#points) | None | in production 2026-11-01 |\n| 2 | [Redeem](c.md#redeem) | Points | planned |\n", "c.md": "## Points\n\n**PRD directory, when written:** `docs/prds/points`\n\n## Redeem\n\n**PRD directory, when written:** `docs/prds/redeem`\n" });
  commitFiles(sandbox, repo, "source-material/labels", { "labels-brief.md": "# Brief: Labels\n" });
  git(sandbox, repo, "switch", "-q", "-c", "elsewhere");
  commitFiles(sandbox, repo, "docs/changes/labels", { "labels-prd.md": "# PRD: Labels\n" });
  git(sandbox, repo, "push", "-q", "origin", "elsewhere");
  git(sandbox, repo, "switch", "-q", "develop");
  // A design refinement in progress, committed, puts an otherwise quiet PRD Under way.
  commitFiles(sandbox, repo, "docs/prds/drafted", { "drafted-prd.md": "# PRD: Drafted\n", "drafted-design-refinement-state.md": "round 2\n" });
  // Two quiet PRDs, folded newest change first.
  sandbox.env.GIT_COMMITTER_DATE = "2026-09-14T12:00:00Z";
  commitFiles(sandbox, repo, "docs/changes/older", { "older-prd.md": "# PRD: Older\n" });
  sandbox.env.GIT_COMMITTER_DATE = "2026-11-18T12:00:00Z";
  commitFiles(sandbox, repo, "docs/changes/newer", { "newer-prd.md": "# PRD: Newer\n" });
  delete sandbox.env.GIT_COMMITTER_DATE;
  commitFiles(sandbox, repo, "docs/prds/returns", { "returns-prd.md": "# PRD: Returns\n" });

  const fromSource = record(repo, "source-material/boxes", one => {
    delete one.prdDirectory;
    one.origin = { kind: "brief", path: "source-material/boxes", title: "Boxes", files: [], commit: "a".repeat(40), committedAt: "2026-11-27T00:00:00Z" };
    one.startedAt = "2026-11-27T01:00:00Z";
    one.requirements = { ...newRequirements(), stages: [{ activityId: "s1", key: "kiln:next", task: "stage", expected: { skill: "prd-writing-standards", title: "Write the PRD" }, ran: [], reaches: [], startedAt: "2026-11-27T01:00:00Z" }] };
  });
  const building = record(repo, "docs/prds/returns", one => {
    one.startedAt = "2026-11-26T01:00:00Z";
    one.plan = [{ id: "1", title: "One" }, { id: "2", title: "Two" }] as NonNullable<PrdRecord["plan"]>;
    one.phases = { "1": { sessionIds: [], doneAt: "2026-11-26T02:00:00Z" } } as unknown as PrdRecord["phases"];
  });
  const states = new Map([[fromSource, { state: "waiting_for_you" as const, address: "http://127.0.0.1:4701/boxes", feature: "early_review" }], [building, { state: "unreadable" as const, address: "http://127.0.0.1:4702/returns" }]]);
  const scan = await scanRepository({ git: { git: "git", env: sandbox.env }, repository: { name: "shop", path: repo }, works: [fromSource, building], probe: async work => states.get(work) ?? { state: "not_running" } });

  expect(scan.sharedBranch).toBe("develop");
  expect(scan.ready.map(item => item.title)).toEqual(["Loyalty: Redeem"]);
  // Its dependency is marked in production, so its build waits for nothing (AC-HOME-02).
  expect(scan.ready[0]!.buildWaitsFor).toBeUndefined();
  expect(scan.notReady.map(item => [item.title, item.line])).toEqual([["Origin only", "Committed on origin's develop only. Bring your local develop up to date and it moves up."]]);
  // Waiting for the person comes first; a run's own line comes from its record, and an unreadable Kiln gives its address (AC-HOME-04, AC-HOME-05).
  expect(scan.underWay[0]!.title).toBe("Boxes");
  // Labels' PRD is only on a branch that hasn't merged, which puts it Under way too.
  expect(scan.underWay.map(item => [item.title, item.state]).sort()).toEqual([["Boxes", "waiting_for_you"], ["Drafted", "not_running"], ["Labels", "not_running"], ["returns", "unreadable"]]);
  expect(scan.underWay.find(item => item.title === "Labels")).toMatchObject({ branch: "elsewhere", path: "docs/changes/labels" });
  expect(scan.underWay[0]).toMatchObject({ path: "source-material/boxes", line: "Requirements. Write the PRD.", waitsForYou: true });
  expect(scan.underWay.find(item => item.title === "returns")!.line).toBe("Build. 1 of 2 phases done. Kiln couldn't read its state. Its Kiln is at http://127.0.0.1:4702/returns.");
  expect(scan.underWay.find(item => item.title === "Drafted")).toMatchObject({ startedByHand: true, line: "Started by hand. PRD written, no technical design yet. Kiln continues from there, with the early review once the PRD is refined." });
  expect(scan.folded.map(item => item.title)).toEqual(["Newer", "Older"]);
  expect(scan.folded[0]!.line).toBe("PRD written, no technical design yet. Last changed Nov 18.");
});

it("reads a live Kiln's feature state as its home line's state (AC-HOME-05)", () => {
  expect(["implementing", "waiting"].map(runStateOf)).toEqual(["working", "working"]);
  expect(runStateOf("paused")).toBe("paused");
  expect(["needs_you", "early_review", "final_review", "not_started"].map(runStateOf)).toEqual(Array(4).fill("waiting_for_you"));
});
