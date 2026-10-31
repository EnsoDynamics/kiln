import { rmSync, existsSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { readBaseline } from "./plan-reconciliation.js";
import { buildSnapshot } from "./snapshot.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { takeInstanceLock } from "../state/instance-lock.js";
import { writePrdRecord } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
let server: LocalServer | undefined; let releaseLock: (() => void) | undefined;
let h: Harness;
afterEach(async () => { await server?.close(); server = undefined; releaseLock?.(); releaseLock = undefined; await h?.cleanup(); });
const directory = "docs/prds/customer-returns";
const extra = "phase-4-comet-lending.md";
const extraText = "# Phase 4: Comet lending\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n3.\n";
const asking = { actions: [{ result: "Please review the lending choice." }] };
const finish = () => {
  const file = join(h.engine.worktreePath, directory, "phase-1-return-intake.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", `${directory}/phase-1-return-intake.md`, `${directory}/${extra}`);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): close intake and add lending");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
};
it("accepts an append on Verify, keeps the completed-phase choice, and automatically advances", async () => {
  h = await createHarness({ sessions: [asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.record.phases["1"]?.stop?.kind).toBe("done_check");
  writeFileSync(join(h.engine.worktreePath, directory, extra), extraText); finish();
  expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true, outcome: "already_complete" });
  expect(h.claudeCalls()).toHaveLength(1);
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: true, outcome: "advanced" });
  await h.engine.settled();
  expect(h.engine.record.phases["1"]?.doneAt).toBeTypeOf("string");
  expect(h.engine.record.phases["2b"]?.stop?.kind).toBe("done_check");
  expect(buildSnapshot(h.engine).continuation?.handback).toMatchObject({ addedPhaseIds: ["4"], remainingCount: 3, source: h.engine.worktreePath });
});
it("ignores shared-checkout additions until deliberately copied into the active workspace", async () => {
  h = await createHarness({ sessions: [asking, asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  writeFileSync(join(h.repository, directory, extra), extraText);
  const originalPrd = join(h.repository, directory, "customer-returns-prd.md");
  writeFileSync(originalPrd, readFileSync(originalPrd, "utf8") + "\nRequirements amended in the original checkout only.\n");
  expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true, outcome: "resume_requested" });
  await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2);
  expect(h.engine.record.plan?.some(p => p.id === "4")).toBe(false);
  expect(h.engine.record.planReconciliation?.check).toMatchObject({ status: "accepted" });
  expect(buildSnapshot(h.engine).continuation?.planCheck).toBeUndefined();
  expect(existsSync(join(h.engine.worktreePath, directory, extra))).toBe(false);
  copyFileSync(join(h.repository, directory, extra), join(h.engine.worktreePath, directory, extra)); finish();
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: true, outcome: "advanced" });
  await h.engine.settled();
  expect(h.engine.record.phases["1"]?.doneAt).toBeTypeOf("string");
});
it("accepts split leaves at handback, judges the first descendant and preserves a pending pause across restart", async () => {
  h = await createHarness({ sessions: [] });
  const working = join(h.sandbox.root, "comet-working"); const release = join(h.sandbox.root, "comet-release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: working }, { waitForFile: release }, ...asking.actions] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(working));
  expect(h.engine.pause()).toEqual({ ok: true }); writeFileSync(release, "return control"); await h.engine.settled();
  const worktree = h.engine.worktreePath;
  writeFileSync(join(worktree, directory, "phase-1-return-intake.md"), "# Phase 1: Return intake — split into 1a and 1b\n\n## Split into\n\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n| [1b](phase-1b-lending.md) | Lending |\n");
  writeFileSync(join(worktree, directory, "phase-1a-catalog.md"), "# Phase 1a: Catalog\n\n**Closed:** 2026-10-27\n\n## Acceptance criteria covered\nAC-RET-01\n");
  writeFileSync(join(worktree, directory, "phase-1b-lending.md"), "# Phase 1b: Lending\n\n## Acceptance criteria covered\nAC-RET-01\n");
  git(h.sandbox, worktree, "add", `${directory}/phase-1-return-intake.md`, `${directory}/phase-1a-catalog.md`, `${directory}/phase-1b-lending.md`);
  git(h.sandbox, worktree, "commit", "-qm", "test(comet): split the active intake phase"); git(h.sandbox, worktree, "push", "-qu", "origin", "feature/customer-returns");
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: true, outcome: "advanced" }); await h.engine.settled();
  expect(h.engine.record.phases["1"]?.doneAt).toBeTypeOf("string");
  expect(h.engine.record.planReconciliation?.handback).toMatchObject({ addedPhaseIds: ["1b"], remainingCount: 3 });
  expect(buildSnapshot(h.engine).feature.state, JSON.stringify(h.engine.record.phases)).toBe("paused");
  expect(h.claudeCalls()).toHaveLength(1);
  const again = h.reopenFromDisk(); await again.prepare();
  expect(await again.decide()).toMatchObject({ kind: "paused", beforePhaseKey: "1b" });
  expect(again.record.planReconciliation?.baselineId).toBe(h.engine.record.planReconciliation?.baselineId);
});
it("reconciles before accepting an old final pull request and starts the appended leaf automatically", async () => {
  h = await createHarness({ sessions: [landingSession("src/catalog.txt"), landingSession("src/refunds.txt"), landingSession("src/dashboard.txt"), asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.record.phases.pr?.stop).toBeDefined();
  const worktree = h.engine.worktreePath;
  const name = extra;
  writeFileSync(join(worktree, directory, name), extraText);
  git(h.sandbox, worktree, "add", `${directory}/${name}`); git(h.sandbox, worktree, "commit", "-qm", "test(comet): append before final acceptance"); git(h.sandbox, worktree, "push", "-qu", "origin", "feature/customer-returns");
  h.setPulls([{ number: 14, title: "Comet catalog", url: "https://github.com/fictional/comet/pull/14", isDraft: false, isCrossRepository: false, headRefName: "feature/customer-returns", baseRefName: "develop", additions: 1, deletions: 0, commits: [{}] }]);
  expect(await h.engine.resume()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.completedAt).toBeUndefined();
  expect(h.engine.record.phases["4"]?.stop?.kind).toBe("done_check");
  expect(h.claudeCalls()).toHaveLength(5);
  expect(h.claudeCalls().at(-1)?.prompt).toContain(name);
});
it("accepts additions on an unfinished restart before selecting the next activity", async () => {
  h = await createHarness({ sessions: [asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  writeFileSync(join(h.engine.worktreePath, directory, extra), extraText); finish();
  const again = h.reopenFromDisk();
  await again.prepare();
  expect(await again.decide()).toMatchObject({ kind: "start_phase", phaseId: "2b", doneFirst: { phaseId: "1", byPerson: true } });
  expect(again.record.planReconciliation?.handback).toMatchObject({ addedPhaseIds: ["4"], remainingCount: 3 });
  expect(h.claudeCalls()).toHaveLength(1);
});
it("reconciles work appended as an audit settles before selecting another audit or final delivery", async () => {
  let injected = false;
  const sessions = [landingSession("src/catalog.txt"), asking];
  const files = {
    "customer-returns-prd.md": "# PRD: Comet library\n\n## Acceptance Criteria\n\n- [ ] **AC-RET-01** Return the catalog value 42.\n",
    "technical-design.md": "# Technical design\nExport value from value.mjs; verify with node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Catalog value\n\n## Acceptance criteria covered\nAC-RET-01\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  h = await createHarness({ auditCycles: true, files, sessions, engineOptions: { onTerminal: event => {
    if (event.kind !== "audit" || event.event !== "done" || injected) return;
    injected = true;
    writeFileSync(join(h.engine.worktreePath, directory, extra), extraText.replace("3.", "1."));
    git(h.sandbox, h.engine.worktreePath, "add", `${directory}/${extra}`);
    git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): append when delivery audit settles");
    git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  } } });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): ignore transient audit requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  const lock = await takeInstanceLock(stateRoot(h.env), h.stateDirectory);
  if (!lock.taken) throw new Error("Comet audit fixture controller is unavailable.");
  releaseLock = lock.release;
  server = await startLocalServer({ engine: h.engine, port: lock.port, folderName: "customer-returns", featureName: "Comet catalog", token: h.engine.record.token });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions: [{ actions: [{ auditReport: {} }, { result: "Comet audit settled." }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(injected, JSON.stringify(h.engine.record.phases)).toBe(true);
  expect(h.engine.record.completionAudits?.activities).toHaveLength(1);
  expect(h.engine.record.completedAt).toBeUndefined();
  expect(h.engine.record.phases["4"]?.stop?.kind).toBe("done_check");
  expect(h.claudeCalls().at(-1)?.prompt).toContain(extra);
});

it.each(["changed", "removed", "reopened", "split", "unchanged"])("recovers legacy completion scope without adopting a %s historical phase", async mode => {
  const files = {
    "customer-returns-prd.md": "# PRD: Comet library\n\n## Acceptance Criteria\n\n- [ ] **AC-RET-01** Find library books.\n",
    "technical-design.md": "# Technical design\nA local catalog.\n",
    "phase-1-return-intake.md": "# Phase 1: Return intake\n\n## Acceptance criteria covered\nAC-RET-01\n",
    "phase-2-lending.md": "# Phase 2: Lending\n\n## Acceptance criteria covered\nAC-RET-01\n",
  };
  h = await createHarness({ files, sessions: [landingSession("src/catalog.txt"), asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const originalDone = h.engine.record.phases["1"]!.doneAt;
  const record = structuredClone(h.engine.record); delete record.planReconciliation; record.schemaVersion = 10;
  writePrdRecord(h.stateDirectory, record);
  const file = join(h.engine.worktreePath, directory, "phase-1-return-intake.md");
  const original = readFileSync(file, "utf8");
  if (mode === "removed") { rmSync(file); rmSync(join(h.repository, directory, "phase-1-return-intake.md")); }
  else {
    let changed = mode === "changed" ? original.replace("Return intake", "Materially different catalog scope") : mode === "reopened" ? original.replace(/^\*\*Closed:\*\*.*$/m, "") : original;
    if (mode === "split") {
      changed = "# Phase 1: Return intake — split into 1a and 1b\n\n## Split into\n\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n| [1b](phase-1b-lending.md) | Lending |\n";
      for (const [id, title] of [["1a", "catalog"], ["1b", "lending"]]) {
        const name = `phase-${id}-${title}.md`;
        writeFileSync(join(h.engine.worktreePath, directory, name), `# Phase ${id}: ${title}\n\n## Acceptance criteria covered\nAC-RET-01\n`);
        copyFileSync(join(h.engine.worktreePath, directory, name), join(h.repository, directory, name));
      }
    }
    writeFileSync(file, changed); copyFileSync(file, join(h.repository, directory, "phase-1-return-intake.md"));
  }
  if (mode !== "unchanged") {
    git(h.sandbox, h.engine.worktreePath, "add", directory); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): change legacy scope after completion"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  }
  const again = h.reopenFromDisk(); await again.prepare();
  if (mode === "unchanged") {
    const baseline = readBaseline(h.stateDirectory, again.record.planReconciliation!.baselineId!);
    expect(baseline.completions["1"]).toMatchObject({ kind: "kiln", revision: record.phases["1"]!.repositories["acme-shop"]!.pushedSha });
  } else {
    expect(again.record.planReconciliation?.baselineId).toBeUndefined();
    expect(again.record.planReconciliation?.check?.problem).toContain("baseline_unavailable: Phase 1");
  }
  expect(again.record.phases["1"]?.doneAt).toBe(originalDone);
  expect(h.claudeCalls()).toHaveLength(2);
});

it.each(["original", "worktree"] as const)("requires readable documents only in the active worktree when %s documents are missing", async checkout => {
  h = await createHarness({ sessions: [asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const previousStop = structuredClone(h.engine.record.phases["1"]!.stop);
  const previousBaseline = h.engine.record.planReconciliation!.baselineId;
  rmSync(join(checkout === "original" ? h.repository : h.engine.worktreePath, directory, "technical-design.md"));
  if (checkout === "original") {
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true, outcome: "resume_requested" });
    await h.engine.settled();
    expect(h.engine.record.planReconciliation?.check).toMatchObject({ status: "accepted" });
    expect(h.claudeCalls()).toHaveLength(2);
    return;
  }
  expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Do not dispatch this reply" })).toMatchObject({ ok: false, code: "check_unavailable" });
  expect(h.engine.record.phases["1"]!.stop).toEqual(previousStop);
  expect(h.engine.record.planReconciliation!.baselineId).toBe(previousBaseline);
  expect(h.engine.record.planReconciliation!.check!.problem).toContain("Missing technical design");
  expect(h.claudeCalls()).toHaveLength(1);
});

it("requires committed and published evidence for a newly externally Closed leaf", async () => {
  h = await createHarness({ sessions: [asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const baseline = h.engine.record.planReconciliation!.baselineId;
  const stopped = structuredClone(h.engine.record.phases["1"]);
  writeFileSync(join(h.engine.worktreePath, directory, extra), extraText.replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: false, code: "check_unavailable" });
  expect(h.engine.record.planReconciliation!.baselineId).toBe(baseline);
  expect(h.engine.record.phases["1"]).toEqual(stopped);
  const file = join(h.engine.worktreePath, directory, "phase-1-return-intake.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", `${directory}/${extra}`, `${directory}/phase-1-return-intake.md`);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): record externally finished lending");
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: false, code: "check_unavailable" });
  expect(h.engine.record.planReconciliation!.baselineId).toBe(baseline);
  expect(h.claudeCalls()).toHaveLength(1);
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: true, outcome: "advanced" }); await h.engine.settled();
  const accepted = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
  expect(accepted.completions["4"]).toMatchObject({ kind: "external", revision: expect.any(String), repositories: { "acme-shop": { identity: "acme/acme-shop", revision: accepted.completions["4"]!.revision } } });
  expect(h.engine.record.phases["4"]).toBeUndefined();
  expect(h.engine.record.phases["2b"]?.stop?.kind).toBe("done_check");
  expect(h.claudeCalls()).toHaveLength(2);
});

it.each([false, true])("refuses externally Closed work with an unchecked repository (inherited=%s)", async inherited => {
  h = await createHarness({ sessions: [asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const baseline = h.engine.record.planReconciliation!.baselineId;
  const stopped = structuredClone(h.engine.record.phases["1"]);
  const folder = join(h.engine.worktreePath, directory);
  const repos = "\n\n**Repositories:** comet-index\n";
  if (inherited) {
    writeFileSync(join(folder, extra), "# Phase 4: Lending — split into 4a" + repos + "\n## Split into\n\n| Phase | Work |\n|---|---|\n| [4a](phase-4a-index.md) | Index |\n");
    writeFileSync(join(folder, "phase-4a-index.md"), "# Phase 4a: Index\n\n**Closed:** 2026-10-29\n\n## Acceptance criteria covered\nAC-RET-01\n");
  } else writeFileSync(join(folder, extra), extraText.replace("\n", "\n\n**Closed:** 2026-10-29\n" + repos));
  git(h.sandbox, h.engine.worktreePath, "add", directory);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(comet): publish external scope naming unchecked index");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  expect(await h.engine.checkAgain(recoveryRequest(h.engine, "advance"))).toMatchObject({ ok: false, code: "check_unavailable" });
  expect(h.engine.record.planReconciliation!.check!.problem).toContain("comet-index");
  expect(h.engine.record.planReconciliation!.baselineId).toBe(baseline);
  expect(h.engine.record.phases["1"]).toEqual(stopped);
  expect(h.claudeCalls()).toHaveLength(1);
});


it("freezes the just-completed child's checked repository scope before a later parent addition", async () => {
  const child = (id: string) => `# Phase ${id}: Catalog ${id}\n\n## Acceptance criteria covered\nAC-RET-01\n`;
  const parent = "# Phase 1: Catalog\n\n**Repositories:** comet-api\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | First |\n| [1b](phase-1b-catalog.md) | Next |\n";
  h = await createHarness({ sessions: [{ actions: landingSession().actions.map(action => action.write || action.commit || action.push ? { ...action, repository: "acme-shop" } : action) }, asking], files: {
    "customer-returns-prd.md": "# PRD: Comet\n\n## Acceptance Criteria\n- [ ] **AC-RET-01** Catalog.\n", "technical-design.md": "# Design\nCatalog.\n",
    "phase-1-catalog.md": parent, "phase-1a-catalog.md": child("1a"), "phase-1b-catalog.md": child("1b"),
  } });
  const { createGithubOrigin, createRepository } = await import("../test-support/git-repositories.js");
  for (const name of ["comet-api", "comet-web"]) {
    const origin = createGithubOrigin(h.sandbox, "fictional", name); const repository = createRepository(h.sandbox, name, origin.url);
    git(h.sandbox, repository, "push", "-qu", "origin", "develop");
  }
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  const durable = await import("../control/durable-file.js"); const write = durable.writeDurableMetadata; let changed = false;
  const spy = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    write(path, value);
    if (!changed && path.endsWith("/prd.json") && (value as { phases?: Record<string, { doneAt?: string }> }).phases?.["1a"]?.doneAt) {
      changed = true;
      // This edit lands after the successful completion's durable receipt, before
      // the next readPlan. It must apply to 1b without changing 1a's earlier scope.
      writeFileSync(join(h.engine.worktreePath, directory, "phase-1-catalog.md"), parent.replace("comet-api", "comet-api, comet-web"));
      git(h.sandbox, h.engine.worktreePath, "add", `${directory}/phase-1-catalog.md`);
      git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: add repository after checked completion");
      git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
    }
  });
  try { await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); }
  finally { spy.mockRestore(); }
  expect(changed, JSON.stringify(h.engine.record.phases)).toBe(true); expect(h.engine.record.phases["1a"]?.doneAt).toBeDefined();
  const baseline = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
  expect(baseline.completions["1a"]!.scopeRepositories).toEqual(["comet-api"]);
  expect(h.engine.record.repositories.find(repo => repo.name === "comet-web")?.setupCompletedAt).toBeDefined();
  expect(h.engine.record.phases["1b"]?.stop).toBeDefined(); expect(h.claudeCalls()).toHaveLength(2);
}, 120_000);

it("ignores outside closure changes across restart and accepts deliberate worktree integration", async () => {
  h = await createHarness({ sessions: [asking, asking, asking] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const file = `${directory}/phase-1-return-intake.md`;
  const shared = join(h.repository, file);
  writeFileSync(shared, readFileSync(shared, "utf8").replace("\n", "\n\n**Closed:** 2026-10-30\n"));
  expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true, outcome: "resume_requested" });
  await h.engine.settled();
  expect(h.engine.record.planReconciliation?.check?.status).toBe("accepted"); expect(h.claudeCalls()).toHaveLength(2);
  expect(h.engine.record.plan?.find(phase => phase.id === "1")?.closed).toBe(false);
  const again = h.reopenFromDisk(); await again.prepare();
  expect(again.record.planReconciliation?.check?.status).toBe("accepted");
  copyFileSync(shared, join(again.worktreePath, file));
  git(h.sandbox, again.worktreePath, "add", file); git(h.sandbox, again.worktreePath, "commit", "-qm", "test: reconcile closed catalog"); git(h.sandbox, again.worktreePath, "push", "-qu", "origin", "feature/customer-returns");
  expect(await again.checkAgain(recoveryRequest(again, "advance"))).toMatchObject({ ok: true, outcome: "advanced" }); await again.settled();
  expect(again.record.phases["1"]?.doneAt).toBeDefined(); expect(h.claudeCalls()).toHaveLength(3);
});
