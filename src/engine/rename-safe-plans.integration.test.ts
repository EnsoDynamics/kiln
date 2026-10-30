/** Real saved-checkout/Git comparison for fictional Comet phase renames. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { PLAN_NORMALIZER_VERSION, completedScopeProblems, observePlan, retainBaseline, readBaseline, comparisonBaseline } from "./plan-reconciliation.js";
import { observeGitPlan } from "./completed-plan-sources.js";
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
  await expect(comparisonBaseline(h.stateDirectory, id)).rejects.toThrow("requires a newer Kiln");
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
  expect(readBaseline(h.stateDirectory, check.result!.baselineId).normalizerVersion).toBe(PLAN_NORMALIZER_VERSION);
  if (baselineFile) {
    expect(readFileSync(baselineFile, "utf8")).toBe(originalBytes);
    expect(check.result!.baselineId).not.toBe(baselineId);
    const migrated = await comparisonBaseline(h.stateDirectory, baselineId!, { repositoryName: "acme-shop", read: revision => observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, directory, revision) });
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
  expect(readBaseline(h.stateDirectory, again.record.planReconciliation!.baselineId!).normalizerVersion).toBe(PLAN_NORMALIZER_VERSION);
  expect(h.claudeCalls()).toHaveLength(2);
});


it.each([1, 2] as const)("compares governing links across saved/Git filenames after immutable v%s migration", async version => {
  await completed(true);
  const original = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
  const { id: _id, ...body } = original; void _id;
  h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, { ...body, normalizerVersion: version }).id;
  // Both sources add the same work; only saved filenames and containing-document links differ.
  write("comet-prd.md", prd + "\nRead [Catalog](../comet/%70hase-2-old.md#summary).\n");
  write("comet-technical-design.md", "# Design\nLibrary catalog.\nRead [Catalog](x/../phase-2-old.md).\n");
  write("comet-phase-plan.md", "# Plan\n[Catalog](./phase-2-old.md)\n");
  write("phase-9-lending.md", phase("9", false) + "\n## Phase dependencies\n1, 2.\n"); publish();
  renameCatalog();
  for (const file of ["comet-prd.md", "comet-technical-design.md", "comet-phase-plan.md"]) write(file, readFileSync(join(h.repository, directory, file), "utf8").replaceAll("2-old.md", "2-new.md"));
  const check = await h.engine.checkCompletedPlan();
  expect(check, JSON.stringify(check)).toMatchObject({ status: "available", result: { source: { kind: "delivery_base" }, earlierWorkChanges: [], proposal: { readiness: "ready", added: [{ id: "9" }] } } });
  expect(readBaseline(h.stateDirectory, check.result!.baselineId).normalizerVersion).toBe(PLAN_NORMALIZER_VERSION);
  expect(readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!).normalizerVersion).toBe(version);
  write("comet-technical-design.md", "# Design\nSubstantively different behavior.\nRead [Catalog](phase-2-new.md).\n");
  expect((await h.engine.checkCompletedPlan()).result?.problems.join(" ")).toContain("source_conflict");
  expect(h.claudeCalls()).toEqual([]);
});

it("blocks inherited completed repository removal/replacement while allowing parent additions for remaining children", async () => {
  await completed(true);
  const parent = (repositories: string, remaining = true) => `# Phase 8: Lending\n\n**Repositories:** ${repositories}\n\n## Split into\n| Phase | Work |\n|---|---|\n| [8a](phase-8a-lending.md) | Lending |\n${remaining ? "| [8b](phase-8b-search.md) | Search |\n" : ""}`;
  write("phase-8-parent.md", parent("comet-api", false));
  write("phase-8a-lending.md", phase("8a")); publish();
  const baseline = retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 2, prdDirectory: directory, active: observePlan(h.repository, directory), sources: [], completions: { "8a": { kind: "external", revision: git(h.sandbox, h.repository, "rev-parse", "HEAD").trim() } } });
  h.engine.record.planReconciliation!.baselineId = baseline.id;
  const { completedScopeProblems } = await import("./plan-reconciliation.js");
  write("phase-8b-search.md", phase("8b", false));
  for (const repositories of ["comet-web", "acme-shop"]) {
    write("phase-8-parent.md", parent(repositories)); publish();
    const check = await h.engine.checkCompletedPlan();
    expect(check).toMatchObject({ status: "blocked", result: { earlierWorkChanges: [expect.stringContaining("Phase 8a")] } });
    expect(check.result?.leaves?.find(row => row.id === "8a")?.classification).toBe("unresolved_earlier_work");
    expect(check.result?.leaves?.filter(row => row.classification === "new_unfinished").map(row => row.id)).toEqual(["8b"]);
  }
  write("phase-8-parent.md", parent("comet-api, comet-web")); publish();
  expect(completedScopeProblems(baseline.active, observePlan(h.repository, directory))).toEqual([]);
  const check = await h.engine.checkCompletedPlan();
  expect(check.result?.earlierWorkChanges).toEqual([]);
  expect(check.result?.leaves?.find(row => row.id === "8a")?.classification).toBe("carried_completed");
  expect(h.engine.record.planReconciliation!.baselineId).toBe(baseline.id);
  expect(h.claudeCalls()).toEqual([]);
});


it("faults the owner after a lost migration publication acknowledgement, preserving original bytes/pointer", async () => {
  await completed(true);
  const id = h.engine.record.planReconciliation!.baselineId!;
  const file = join(h.stateDirectory, "plans", `${id}.json`); const bytes = readFileSync(file, "utf8");
  const durable = await import("../control/durable-file.js"); const write = durable.writeDurableMetadata;
  let published = false;
  const spy = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    write(path, value);
    if (path.includes("/plans/") && path !== file) { published = true; throw new Error("Lost migration publication acknowledgement after rename"); }
  });
  try { await expect(h.engine.checkCompletedPlan()).rejects.toThrow("publication"); }
  finally { spy.mockRestore(); }
  expect(published).toBe(true); expect(h.engine.commands.fault).toBeTruthy();
  expect(h.engine.record.planReconciliation!.baselineId).toBe(id); expect(readFileSync(file, "utf8")).toBe(bytes);
  expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z"); expect(h.claudeCalls()).toEqual([]);
  const again = h.reopenFromDisk(); await again.prepare();
  expect(again.record.completedPlanCheck?.status).toBe("unchanged"); expect(again.commands.fault).toBeUndefined();
});

it.each([false, true])("retains original completed repository scope through parent edits and continuation, legacy after addition=%s", async legacyAfterAddition => {
  await completed(true);
  const { createGithubOrigin, createRepository } = await import("../test-support/git-repositories.js");
  const revisions: Record<string, { identity: string; revision: string }> = {};
  for (const name of ["comet-api", "comet-web"]) {
    const origin = createGithubOrigin(h.sandbox, "fictional", name); const path = createRepository(h.sandbox, name, origin.url);
    git(h.sandbox, path, "push", "-qu", "origin", "develop");
    revisions[name] = { identity: `fictional/${name}`, revision: git(h.sandbox, path, "rev-parse", "HEAD").trim() };
    h.engine.record.repositories.push({ name, kind: "named", github: `fictional/${name}`, mainCheckoutPath: path, baseBranch: "develop", worktreePath: path });
  }
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  const original = await comparisonBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!, { repositoryName: "acme-shop", read: revision => observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, directory, revision) });
  const parent = (extra = false) => `# Phase 8: Lending\n\n**Repositories:** comet-api${extra ? ", comet-web" : ""}\n\n## Split into\n| Phase | Work |\n|---|---|\n| [8a](phase-8a-lending.md) | Lending |\n${extra ? "| [8b](phase-8b-search.md) | Search |\n" : ""}`;
  write("phase-8-parent.md", parent()); write("phase-8a-lending.md", phase("8a")); const earlier = publish();
  let accepted = retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: directory, active: observePlan(h.repository, directory), sources: [], completions: { ...original.completions, "8a": { kind: "external", scopeRepositories: ["comet-api"], revision: earlier, repositories: { "acme-shop": { identity: "acme/acme-shop", revision: earlier }, "comet-api": revisions["comet-api"]! } } } });
  expect(accepted.completions["8a"]!.scopeRepositories).toEqual(["comet-api"]);
  write("phase-8-parent.md", parent(true)); write("phase-8b-search.md", phase("8b", false)); publish();
  expect(completedScopeProblems(accepted.active, observePlan(h.repository, directory), accepted.completions)).toEqual([]);
  const { id: _previousId, ...previousBody } = accepted; void _previousId;
  accepted = retainBaseline(h.stateDirectory, { ...previousBody, active: observePlan(h.repository, directory) });
  if (legacyAfterAddition) {
    const { id: _currentId, ...legacyBody } = accepted; void _currentId;
    const legacy = retainBaseline(h.stateDirectory, { ...legacyBody, normalizerVersion: 2, completions: Object.fromEntries(Object.entries(accepted.completions).map(([id, receipt]) => { const { scopeRepositories: _scope, ...old } = receipt; void _scope; return [id, old]; })) });
    const bytes = readFileSync(join(h.stateDirectory, "plans", `${legacy.id}.json`), "utf8");
    accepted = await comparisonBaseline(h.stateDirectory, legacy.id, { repositoryName: "acme-shop", read: revision => observeGitPlan({ git: h.tools.git, env: h.env }, h.repository, directory, revision) });
    expect(readFileSync(join(h.stateDirectory, "plans", `${legacy.id}.json`), "utf8")).toBe(bytes);
  }
  expect(accepted.completions["8a"]!.scopeRepositories).toEqual(["comet-api"]);
  write("phase-8-parent.md", parent(true).replace(", comet-web", "")); publish();
  expect(completedScopeProblems(accepted.active, observePlan(h.repository, directory), accepted.completions)).toEqual([]);
  write("phase-8-parent.md", parent(true)); write("phase-8b-search.md", phase("8b")); const later = publish();
  const { id: _id, ...body } = accepted; void _id;
  accepted = retainBaseline(h.stateDirectory, { ...body, active: observePlan(h.repository, directory), completions: { ...accepted.completions, "8b": { kind: "external", scopeRepositories: ["comet-api", "comet-web"], revision: later, repositories: { ...revisions, "acme-shop": { identity: "acme/acme-shop", revision: later } } } } });
  h.engine.record.planReconciliation!.baselineId = accepted.id;
  write("phase-9-lending.md", phase("9", false) + "\n## Phase dependencies\n8.\n"); publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check, JSON.stringify(check)).toMatchObject({ status: "available", result: { earlierWorkChanges: [], proposal: { readiness: "ready", firstEligiblePhase: "9" } } });
  expect(check.result?.leaves?.filter(row => row.classification === "carried_completed").map(row => row.id)).toEqual(["1", "2", "8a", "8b"]);
  expect(await h.engine.continuationCommand("accept", { proposalId: check.result!.proposal!.id, executionId: h.engine.record.executionId!, commandId: "accept-historical-repositories", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeUndefined();
  expect(readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!).completions["8a"]!.scopeRepositories).toEqual(["comet-api"]);
}, 120_000);

it("rejects completed sibling reordering without changing parent session ownership, while accepting compatible additions", async () => {
  const parent = (children: string[]) => `# Phase 2: Catalog split\n\n## Split into\n| Phase | Work |\n|---|---|\n${children.map(id => `| [${id}](phase-${id}-catalog.md) | Catalog ${id} |`).join("\n")}\n`;
  h = await createHarness({ folder: "comet", sessions: [], files: { "comet-prd.md": prd, "comet-technical-design.md": "# Design\nCatalog.\n", "phase-1-catalog.md": phase("1"), "phase-2-catalog.md": parent(["2a", "2b"]), "phase-2a-catalog.md": phase("2a"), "phase-2b-catalog.md": phase("2b") } });
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git"); git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  const old = observePlan(h.repository, directory); const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const record = h.engine.record; record.startedAt = record.setupCompletedAt = "2026-10-01T10:00:00Z"; record.completedAt = "2026-10-01T12:00:00Z"; record.plan = recordedPlan(old.plan);
  record.repositories = [{ name: "acme-shop", kind: "prd", github: "acme/acme-shop", mainCheckoutPath: h.repository, worktreePath: join(h.sandbox.root, "removed-comet-history"), baseBranch: "develop", baseCommit: revision, setupCompletedAt: record.setupCompletedAt }];
  record.phases["2"] = { doneAt: record.completedAt, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 3, prdDirectory: directory, active: old, sources: [], completions: Object.fromEntries(["1", "2a", "2b"].map(id => [id, { kind: "external" as const, scopeRepositories: [], revision }])) }).id };
  writePrdRecord(h.stateDirectory, record);
  const { judgedPhase } = await import("./plan-reading.js"); expect(judgedPhase(old.plan.phases, "2")?.id).toBe("2a");
  write("phase-2-catalog.md", parent(["2b", "2a"])); publish();
  const changed = await h.engine.checkCompletedPlan();
  expect(changed.status).toBe("blocked"); expect(changed.result!.earlierWorkChanges.join(" ")).toContain("Phase 2a");
  expect(changed.result!.leaves!.filter(row => ["2a", "2b"].includes(row.id)).map(row => row.classification)).toEqual(["unresolved_earlier_work", "unresolved_earlier_work"]);
  expect(judgedPhase(record.plan!, "2")?.id).toBe("2a"); expect(record.phases["2"]!.doneAt).toBe(record.completedAt);
  expect(readBaseline(h.stateDirectory, changed.result!.baselineId).normalizerVersion).toBe(PLAN_NORMALIZER_VERSION);
  const acceptedRecord = structuredClone(record);
  const reordered = observePlan(h.repository, directory);
  const reorderedRevision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  const { id: _originalId, ...acceptedBody } = readBaseline(h.stateDirectory, record.planReconciliation!.baselineId!); void _originalId;
  for (const version of [1, 2, 3] as const) {
    const completions = Object.fromEntries(Object.entries(acceptedBody.completions).map(([id, receipt]) => {
      if (version === 3) return [id, receipt];
      const { scopeRepositories: _scope, ...legacy } = receipt; void _scope; return [id, legacy];
    }));
    const invalid = retainBaseline(h.stateDirectory, { ...acceptedBody, normalizerVersion: version, active: reordered, completions });
    record.planReconciliation = { baselineId: invalid.id };
    const refused = await h.engine.checkCompletedPlan(); expect(refused.status).toBe("failed");
    expect(refused.errors.join(" ")).toContain("immutable completion scope"); expect(refused.result).toBeUndefined();
    expect(record.planReconciliation.baselineId).toBe(invalid.id);
  }
  // No-sidecar recovery must also compare the saved final tree with each original
  // phase receipt, rather than trusting a final tree whose split order was changed.
  delete record.planReconciliation; record.plan = recordedPlan(reordered.plan);
  const facts = structuredClone(record.phases["2"]!);
  record.phases["1"] = structuredClone(facts); record.phases["2a"] = structuredClone(facts);
  record.phases.pr = { ...structuredClone(facts), repositories: { "acme-shop": { startCommit: revision, pushedSha: reorderedRevision } } };
  const recovered = await h.engine.checkCompletedPlan(); expect(recovered.status).toBe("failed");
  expect(recovered.errors.join(" ")).toContain("differs from its original completion revision");
  Object.assign(record, acceptedRecord);
  write("phase-2-catalog.md", parent(["2a", "2b", "2c"])); write("phase-2c-catalog.md", phase("2c", false)); publish();
  const compatible = await h.engine.checkCompletedPlan(); expect(compatible.result!.earlierWorkChanges).toEqual([]); expect(compatible.result!.added.map(row => row.id)).toEqual(["2c"]);
  expect(compatible.result!.leaves!.filter(row => ["2a", "2b"].includes(row.id)).every(row => row.classification === "carried_completed")).toBe(true);
  expect(h.claudeCalls()).toEqual([]);
});
