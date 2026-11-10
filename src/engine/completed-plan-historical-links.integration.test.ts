/** Real Git: a link that dangled at a recorded completion revision cannot block reading that completion back. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { observePlan } from "./plan-reconciliation.js";
import { observeGitPlan, readGitPlan } from "./completed-plan-sources.js";
import { recordedPlan } from "./plan-reading.js";
import { writePrdRecord } from "../state/records.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });
const directory = "docs/prds/comet";
const prd = "# PRD: Comet Library\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n";
const phase = (id: string, closed = true) => `# Phase ${id}: Catalog ${id}\n\n${closed ? "**Closed:** 2026-10-01\n\n" : ""}## Acceptance criteria covered\nAC-COMET-01\n`;
// The design links into a copied snapshot whose own link points at a file that was never copied.
const linkedDesign = "# Design\nLibrary catalog. Background: [earlier design](../../../source-material/snapshot/DESIGN.md).\n";
const write = (path: string, bytes: string) => { mkdirSync(join(h.repository, path, ".."), { recursive: true }); writeFileSync(join(h.repository, path), bytes); };
function publish() {
  git(h.sandbox, h.repository, "add", "-A");
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): publish plan");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  return git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
}
async function completedWithDanglingLink() {
  h = await createHarness({ folder: "comet", sessions: [], files: { "comet-prd.md": prd, "comet-technical-design.md": "# Design\nLibrary catalog.\n", "phase-1-catalog.md": phase("1"), "phase-2-lending.md": phase("2") } });
  // Same phase structure the original run accepted; only the design's background link differs.
  const plan = recordedPlan(observePlan(h.repository, directory).plan);
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git");
  git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  write(`${directory}/comet-technical-design.md`, linkedDesign);
  write("source-material/snapshot/DESIGN.md", "# Earlier design\n**PRD:** [PRD.md](PRD.md).\n");
  const revision = publish();
  const record = h.engine.record;
  record.repositories = [{ name: "acme-shop", kind: "prd", github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", worktreePath: join(h.sandbox.root, "removed-history"), baseCommit: revision, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  record.startedAt = record.setupCompletedAt = "2026-10-01T10:00:00Z";
  record.completedAt = "2026-10-01T12:00:00Z";
  record.plan = plan;
  for (const id of ["1", "2", "pr"]) record.phases[id] = { doneAt: record.completedAt, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  writePrdRecord(h.stateDirectory, record);
  return revision;
}
it("reads any revision past a dangling link, recording it, and finds the new phase (Kiln Linked Documents AC-LINK-01)", async () => {
  const revision = await completedWithDanglingLink();
  const context = { git: h.tools.git, env: h.env };
  const { source: historical, unfollowed } = await readGitPlan(context, h.repository, directory, revision);
  expect(unfollowed).toEqual([expect.objectContaining({ target: "source-material/snapshot/PRD.md", reason: "not in this repository" })]);
  expect(Object.keys(historical.documents)).toContain("source-material/snapshot/DESIGN.md");
  expect(Object.keys(historical.documents)).not.toContain("source-material/snapshot/PRD.md");

  // Today's plan no longer reaches the dangling link and adds an unfinished phase.
  write(`${directory}/comet-technical-design.md`, "# Design\nLibrary catalog.\n");
  write(`${directory}/phase-3-holds.md`, phase("3", false));
  publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check.errors).toEqual([]);
  expect(check.status).toBe("available");
  expect(check.result?.added.map(p => p.id)).toEqual(["3"]);
});

it("still requires a Superseded by target at a completion revision", async () => {
  const revision = await completedWithDanglingLink();
  write(`${directory}/phase-1-catalog.md`, phase("1") + "\nSuperseded in part by: `docs/prds/comet/missing-replacement.md`\n");
  const amended = publish();
  await expect(observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, directory, amended)).rejects.toThrow(`Missing or unsafe document at ${amended}:docs/prds/comet/missing-replacement.md`);
  expect(revision).not.toBe(amended);
});
