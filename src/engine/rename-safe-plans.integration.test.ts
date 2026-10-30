/** Real saved-checkout/Git comparison for fictional Comet phase renames. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { observePlan, retainBaseline, readBaseline, comparisonBaseline } from "./plan-reconciliation.js";
import { recordedPlan } from "./plan-reading.js";
import { writePrdRecord } from "../state/records.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });
const directory = "docs/prds/comet";
const prd = "# PRD: Comet Library\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n";
const phase = (id: string, closed = true) => `# Phase ${id}: Catalog ${id}\n\n${closed ? "**Closed:** 2026-10-01\n\n" : ""}## Acceptance criteria covered\nAC-COMET-01\n`;
const link = (name: string) => `\n## Notes\nRead [Catalog](../comet/x/../%70hase-2-${name}.md?mode=read#summary).\n`;
const write = (name: string, bytes: string) => writeFileSync(join(h.repository, directory, name), bytes);
function publish() {
  git(h.sandbox, h.repository, "add", directory);
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): publish plan");
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  return git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
}
async function completed(retained: boolean) {
  h = await createHarness({ folder: "comet", sessions: [], logGit: true, files: {
    "comet-prd.md": prd, "comet-technical-design.md": "# Design\nLibrary catalog.\n",
    "phase-1-catalog.md": phase("1") + link("old"), "phase-2-old.md": phase("2"),
  } });
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git");
  git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  const source = observePlan(h.repository, directory);
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const record = h.engine.record;
  record.repositories = [{ name: "acme-shop", kind: "prd", github: "acme/acme-shop", mainCheckoutPath: h.repository, baseBranch: "develop", worktreePath: join(h.sandbox.root, "removed-history"), baseCommit: revision, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  record.startedAt = record.setupCompletedAt = "2026-10-01T10:00:00Z";
  record.completedAt = "2026-10-01T12:00:00Z";
  record.plan = recordedPlan(source.plan);
  for (const id of ["1", "2", "pr"]) record.phases[id] = { doneAt: record.completedAt, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  if (retained) {
    // A signed version-1 sidecar's old digests are intentionally unusable under v2.
    // Original source bytes, not today's checkout or those digests, prove migration.
    const old = { ...source, scopes: { "1": "old-spelling-sensitive-digest", "2": "old-phase-digest" } };
    record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: directory, active: old, sources: [old], completions: { "1": { kind: "external", revision }, "2": { kind: "external", revision } } }).id };
  }
  writePrdRecord(h.stateDirectory, record);
}
function renameCatalog() {
  renameSync(join(h.repository, directory, "phase-2-old.md"), join(h.repository, directory, "phase-2-new.md"));
  write("phase-1-catalog.md", phase("1") + link("new"));
}

it.each(["formatVersion", "normalizerVersion"])("refuses correctly hashed unknown %s without an executable proposal", async field => {
  await completed(true);
  const originalId = h.engine.record.planReconciliation!.baselineId!;
  const originalFile = join(h.stateDirectory, "plans", `${originalId}.json`);
  const originalBytes = readFileSync(originalFile, "utf8");
  const { id: _id, ...body } = readBaseline(h.stateDirectory, originalId); void _id;
  const unknown = { ...body, [field]: 99 };
  const id = createHash("sha256").update(JSON.stringify(unknown)).digest("hex");
  const file = join(h.stateDirectory, "plans", `${id}.json`);
  const bytes = JSON.stringify({ ...unknown, id });
  writeFileSync(file, bytes);
  expect(() => comparisonBaseline(h.stateDirectory, id)).toThrow("requires a newer Kiln");
  h.engine.record.planReconciliation!.baselineId = id;
  const check = await h.engine.checkCompletedPlan();
  expect(check).toMatchObject({ status: "failed", errors: [expect.stringContaining("requires a newer Kiln")] });
  expect(check.result).toBeUndefined();
  expect(h.engine.record.planReconciliation!.baselineId).toBe(id);
  expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z");
  expect(readFileSync(originalFile, "utf8")).toBe(originalBytes);
  expect(readFileSync(file, "utf8")).toBe(bytes);
  expect(h.claudeCalls()).toEqual([]);
});

it.each([true, false])("keeps continuation ready after a linked rename with retained baseline=%s, preserving history and blocking real changes", async retained => {
  await completed(retained);
  const baselineId = h.engine.record.planReconciliation?.baselineId;
  const baselineFile = baselineId && join(h.stateDirectory, "plans", `${baselineId}.json`);
  const originalBytes = baselineFile && readFileSync(baselineFile, "utf8");
  const historicalFacts = structuredClone(h.engine.record.phases);
  renameCatalog(); write("phase-9-lending.md", phase("9", false) + "\n## Phase dependencies\n1, 2.\n"); publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check, JSON.stringify(check)).toMatchObject({ status: "available", result: { added: [{ id: "9" }], earlierWorkChanges: [], proposal: { readiness: "ready", firstEligiblePhase: "9" } } });
  expect(check.result?.leaves?.filter(p => p.classification === "carried_completed").map(p => p.id)).toEqual(["1", "2"]);
  expect(readBaseline(h.stateDirectory, check.result!.baselineId).normalizerVersion).toBe(2);
  if (baselineFile) {
    expect(readFileSync(baselineFile, "utf8")).toBe(originalBytes);
    expect(check.result!.baselineId).not.toBe(baselineId);
    const migrated = comparisonBaseline(h.stateDirectory, baselineId!);
    expect(migrated.id).toBe(check.result!.baselineId);
    expect(migrated.sources[0]!.scopes).toEqual(migrated.active.scopes);
    expect(readBaseline(h.stateDirectory, baselineId!).normalizerVersion).toBe(1);
  }
  expect(h.engine.record.phases).toEqual(historicalFacts);
  expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z");
  for (const changed of [phase("1") + link("new").replace("#summary", "#different"), phase("1") + link("new").replace("mode=read", "mode=write"), phase("1").replace("Catalog 1", "Different implementation") + link("new"), phase("1", false) + link("new")]) {
    write("phase-1-catalog.md", changed); publish();
    const blocked = await h.engine.checkCompletedPlan();
    expect(blocked.status).toBe("blocked");
    expect(blocked.result?.earlierWorkChanges.join(" ")).toContain("Phase 1");
    expect(blocked.result?.proposal?.readiness).toBe("blocked");
  }
  expect(h.claudeCalls()).toEqual([]);
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|worktree add|merge |push)\b/.test(call))).toBe(false);
});

it("verifies inherited external completion against its original Git tree after a linked rename", async () => {
  await completed(true);
  write("phase-8-parent.md", "# Phase 8: Lending\n\n**Repositories:** acme-shop\n\n## Split into\n| Phase | Work |\n|---|---|\n| [8a](phase-8a-lending.md) | Lending |\n");
  write("phase-8a-lending.md", phase("8a") + link("old"));
  const external = publish();
  renameCatalog(); write("phase-8a-lending.md", phase("8a") + link("new"));
  write("comet-prd.md", prd + `\n## External completion evidence\nPhase 8a: repository \`acme-shop\` at commit \`${external}\`.\n`);
  write("phase-9-lending.md", phase("9", false) + "\n## Phase dependencies\n8a.\n"); publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check, JSON.stringify(check)).toMatchObject({ status: "available", result: { added: [{ id: "9" }], earlierWorkChanges: [] } });
  expect(check.result?.leaves?.find(p => p.id === "8a")).toMatchObject({ classification: "externally_verified", repositories: [{ revision: external, integration: "integrated_verified" }] });
  write("phase-8a-lending.md", phase("8a") + link("new") + "\nMaterially different lending behavior.\n"); publish();
  const blocked = await h.engine.checkCompletedPlan();
  expect(blocked.status).toBe("blocked");
  expect(blocked.result?.leaves?.find(p => p.id === "8a")?.classification).toBe("externally_unverified");
  expect(blocked.result?.problems.join(" ")).toContain("unchanged Closed scope");
  expect(h.claudeCalls()).toEqual([]);
});

it.each([true, false])("accepts a linked rename on active restart with retained baseline=%s", async retained => {
  const activeDirectory = "docs/prds/customer-returns";
  h = await createHarness({ sessions: [landingSession("src/catalog.txt"), { actions: [{ result: "Review lending." }] }], files: {
    "customer-returns-prd.md": prd, "technical-design.md": "# Design\nLibrary catalog.\n",
    "phase-1-return-intake.md": phase("1", false) + "\nRead [Lending](../customer-returns/x/../%70hase-2-old.md#summary).\n",
    "phase-2-old.md": phase("2", false),
  } });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const doneAt = h.engine.record.phases["1"]?.doneAt;
  expect(doneAt).toBeTypeOf("string");
  if (!retained) delete h.engine.record.planReconciliation;
  else {
    const { id: _id, ...baseline } = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!); void _id;
    h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, { ...baseline, normalizerVersion: 1, active: { ...baseline.active, scopes: { "1": "old-spelling-sensitive-digest" } } }).id;
  }
  writePrdRecord(h.stateDirectory, h.engine.record);
  for (const path of [h.repository, h.engine.worktreePath]) {
    const file = join(path, activeDirectory, "phase-1-return-intake.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("2-old.md", "2-new.md"));
    renameSync(join(path, activeDirectory, "phase-2-old.md"), join(path, activeDirectory, "phase-2-new.md"));
  }
  git(h.sandbox, h.engine.worktreePath, "add", activeDirectory);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): rename linked active phase");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  const again = h.reopenFromDisk(); await again.prepare();
  expect(again.record.planReconciliation?.check, JSON.stringify(again.record.planReconciliation)).toMatchObject({ status: "accepted" });
  expect(again.record.plan?.find(p => p.id === "2")?.file).toBe("phase-2-new.md");
  expect(again.record.phases["1"]?.doneAt).toBe(doneAt);
  expect(readBaseline(h.stateDirectory, again.record.planReconciliation!.baselineId!).normalizerVersion).toBe(2);
  expect(h.claudeCalls()).toHaveLength(2);
});
