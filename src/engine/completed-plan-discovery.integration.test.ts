import { readFileSync, writeFileSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { observePlan, retainBaseline, BASELINE_LIMIT, PLAN_LIMIT, PHASE_LIMIT, PlanCapacityError } from "./plan-reconciliation.js";
import * as gitReads from "./git-reads.js";
import type { CompletedPlanCheck } from "./completed-plan-discovery.js";
import { recordedPlan } from "./plan-reading.js";
import { buildSnapshot } from "./snapshot.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { writePrdRecord } from "../state/records.js";
let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const folder = "comet-library"; const directory = `docs/prds/${folder}`;
const phase = "# Phase 1: Catalog\n\n**Closed:** 2026-10-01\n\n## Acceptance criteria covered\nAC-COMET-01\n";
const newPhase = "# Phase 9: Lending\n\n## Acceptance criteria covered\nAC-COMET-01\n\n## Phase dependencies\n1.\n";
async function fixture(retained = true) {
  h = await createHarness({ folder, auditCycles: true, sessions: [], logGit: true, files: { "comet-prd.md": "# PRD: Comet\n\n## Acceptance Criteria\n\n- [ ] **AC-COMET-01** Find books.\n", "comet-technical-design.md": "# Design\nCatalog.\n", "phase-1-catalog.md": phase } });
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, "https://github.com/acme/acme-shop.git");
  git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
  const source = observePlan(h.repository, directory); const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.repositories = [{ name: "acme-shop", kind: "prd", mainCheckoutPath: h.repository, github: "acme/acme-shop", baseBranch: "develop", worktreePath: join(h.sandbox.root, "old-workspace"), baseCommit: revision, setupCompletedAt: "2026-10-01T10:00:00Z" }];
  h.engine.record.setupCompletedAt = "2026-10-01T10:00:00Z";
  h.engine.record.startedAt = "2026-10-01T10:00:00Z";
  h.engine.record.completedAt = "2026-10-01T12:00:00Z";
  h.engine.record.plan = recordedPlan(source.plan);
  h.engine.record.phases["1"] = { doneAt: "2026-10-01T11:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  h.engine.record.phases.pr = { doneAt: "2026-10-01T12:00:00Z", sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { "acme-shop": { startCommit: revision, pushedSha: revision } } };
  if (retained) h.engine.record.planReconciliation = { baselineId: retainBaseline(h.stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: directory, active: source, sources: [], completions: { "1": { kind: "external", revision } } }).id };
  h.engine.record.pullRequests = [{ repository: "acme-shop", number: 12, title: "Comet catalog delivered", url: "https://github.com/acme/acme-shop/pull/12", head: "feature/comet-library", base: "develop", commits: 2, additions: 20, deletions: 0 }];
  writePrdRecord(h.stateDirectory, h.engine.record);
}
const add = () => writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase);
function publish() { git(h.sandbox, h.repository, "add", directory); git(h.sandbox, h.repository, "commit", "-qm", "test(comet): extend plan"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop"); }
it("checks restart, HTTP and repeated reads without work; persists history and joins concurrent requests", async () => {
  await fixture(); const completed = h.engine.record.completedAt; const baseline = h.engine.record.planReconciliation!.baselineId;
  expect(await h.engine.prepare()).toEqual({ ok: true });
  expect(h.engine.record.completedPlanCheck?.status).toBe("unchanged");
  add(); const first = h.engine.checkCompletedPlan(); expect(h.engine.checkCompletedPlan()).toBe(first);
  const check = await first;
  expect(check.status).toBe("blocked"); expect(check.result?.added.map(p => p.id)).toEqual(["9"]);
  expect(check.result?.unintegratedDocuments).toEqual([`${directory}/phase-9-lending.md`]);
  expect(h.engine.record.completedAt).toBe(completed); expect(h.engine.record.planReconciliation?.baselineId).toBe(baseline);
  expect(h.engine.record.plan?.map(p => p.id)).toEqual(["1"]);
  publish();
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const response = await fetch(`${new URL(server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ check: { status: "available", result: { added: [{ id: "9" }] } } });
  expect(buildSnapshot(h.engine).continuation?.check?.result?.source.revision).toBe(git(h.sandbox, h.repository, "rev-parse", "HEAD").trim());
  expect(h.claudeCalls()).toEqual([]);
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|worktree add|merge|push)(?: |$)/.test(call))).toBe(false);
  expect(h.reopenFromDisk().record.completedPlanCheck?.status).toBe("available");
});
it("retains a baseline whose three document sets exceed one candidate's limit together", async () => {
  // A large but valid plan: each document set fits PLAN_LIMIT; active plus both sources do not.
  await fixture(); add();
  writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "<!--" + "x".repeat(3 * 1024 * 1024) + "-->\n"); publish();
  const check = await h.engine.checkCompletedPlan();
  expect(check.errors).toEqual([]); expect(check.status).toBe("available"); expect(check.result?.added.map(p => p.id)).toEqual(["9"]);
  expect(statSync(join(h.stateDirectory, "plans", `${check.result!.candidateId}.json`)).size).toBeGreaterThan(PLAN_LIMIT);
});
it("selects remote additions over a baseline shared copy and detects divergent scope", async () => {
  await fixture(); const original = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim(); add(); publish();
  git(h.sandbox, h.repository, "checkout", "--detach", original);
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { source: { kind: "delivery_base" }, added: [{ id: "9" }] } });
  writeFileSync(join(h.repository, directory, "phase-10-other.md"), newPhase.replace("Phase 9: Lending", "Phase 10: Reservations"));
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "blocked", result: { problems: expect.arrayContaining([expect.stringContaining("source_conflict")]) } });
  const output = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}));
  expect(output).toContain("Plan needs reconciliation. The current phase count is unresolved.");
  expect(output).not.toContain("new unfinished phases found");
  expect(output).not.toContain("No new phases found");

});
it("preserves an earlier successful result after missing sources, invalid plans and failed origin reads", async () => {
  await fixture(); add(); publish(); const success = await h.engine.checkCompletedPlan();
  renameSync(join(h.repository, directory, "comet-technical-design.md"), join(h.repository, directory, "hidden.md"));
  const missing = await h.engine.checkCompletedPlan();
  expect(missing).toMatchObject({ status: "failed", lastSuccessfulAt: success.lastSuccessfulAt, earlierResult: { added: [{ id: "9" }] } }); expect(missing.result).toBeUndefined();
  renameSync(join(h.repository, directory, "hidden.md"), join(h.repository, directory, "comet-technical-design.md"));
  writeFileSync(join(h.repository, directory, "phase-9-duplicate.md"), newPhase);
  expect((await h.engine.checkCompletedPlan()).errors.join(" ")).toContain("both have phase id");
  rmSync(join(h.repository, directory, "phase-9-duplicate.md"));
  git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "missing-origin"));
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", earlierResult: { added: [{ id: "9" }] }, sources: expect.arrayContaining([expect.objectContaining({ kind: "delivery_base", error: expect.any(String) })]) });
});
it("rejects documents changed during an actual Git read and retains the earlier result", async () => {
  await fixture(); add(); publish();
  const success = await h.engine.checkCompletedPlan();
  const original = gitReads.runGit;
  let changed = false;
  const read = vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => {
    const result = await original(...args);
    // Deterministic scheduling only: every Git result still comes from the real repo.
    if (!changed && args[2].join(" ") === "rev-parse HEAD") {
      changed = true;
      writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "# Design\nChanged during discovery.\n");
    }
    return result;
  });
  try {
    expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", lastSuccessfulAt: success.lastSuccessfulAt, earlierResult: success.result, errors: [expect.stringContaining("source_changed")] });
    expect(h.engine.record.completedPlanCheck?.result).toBeUndefined();
    expect(changed).toBe(true);
    expect(h.claudeCalls()).toEqual([]);
  } finally { read.mockRestore(); }
});
it("rejects removed, reopened, split and changed completed identities but permits a formatting rename", async () => {
  await fixture(); const file = join(h.repository, directory, "phase-1-catalog.md");
  for (const content of [phase.replace("**Closed:** 2026-10-01", ""), phase.replace("Catalog", "Different work"), phase + "\nChanged implementation scope.\n"]) {
    writeFileSync(file, content);
    const check = await h.engine.checkCompletedPlan();
    expect(check.status).toBe("blocked");
    expect(check.result?.earlierWorkChanges.join(" ")).toContain("Phase 1");
  }
  writeFileSync(file, "# Phase 1: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n");
  writeFileSync(join(h.repository, directory, "phase-1a-catalog.md"), phase.replace("Phase 1:", "Phase 1a:"));
  const split = await h.engine.checkCompletedPlan();
  expect(split.status).toBe("blocked");
  expect(split.result?.earlierWorkChanges.join(" ")).toContain("Phase 1");
  rmSync(join(h.repository, directory, "phase-1a-catalog.md"));
  writeFileSync(file, phase.replace("Catalog", "**Catalog**"));
  renameSync(file, join(h.repository, directory, "phase-1-renamed.md")); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "unchanged", result: { added: [], earlierWorkChanges: [] } });
  rmSync(join(h.repository, directory, "phase-1-renamed.md")); add();
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase.replace("1.", "None."));
  const removed = await h.engine.checkCompletedPlan();
  expect(removed.status).toBe("blocked");
  expect(removed.result?.earlierWorkChanges.join(" ")).toContain("Phase 1");
});
it("recovers legacy scope only from recorded immutable completion and survives deletion of old workspace and branch", async () => {
  await fixture(false);
  const old = join(h.sandbox.root, "old-workspace"); git(h.sandbox, h.repository, "worktree", "add", "-b", "old-delivery", old);
  h.engine.record.settings.worktreePath = old;
  git(h.sandbox, h.repository, "worktree", "remove", old); git(h.sandbox, h.repository, "branch", "-d", "old-delivery");
  add(); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.engine.record.planReconciliation?.baselineId).toMatch(/^[a-f0-9]{64}$/);
  expect(h.claudeCalls()).toEqual([]);
});
it("recovers nested split completion using the original parent's receipt", async () => {
  await fixture(false);
  writeFileSync(join(h.repository, directory, "phase-1-catalog.md"), "# Phase 1: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a](phase-1a-catalog.md) | Catalog |\n");
  writeFileSync(join(h.repository, directory, "phase-1a-catalog.md"), "# Phase 1a: Catalog\n\n## Split into\n| Phase | Work |\n|---|---|\n| [1a1](phase-1a1-catalog.md) | Catalog |\n");
  writeFileSync(join(h.repository, directory, "phase-1a1-catalog.md"), phase.replace("Phase 1:", "Phase 1a1:"));
  publish();
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.plan = recordedPlan(observePlan(h.repository, directory).plan);
  h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha = revision;
  // The original parent session closed its first descendant at this revision.
  h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha = revision;
  add(); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { added: [{ id: "9" }] } });
  expect(h.claudeCalls()).toEqual([]);
});
it("does not establish legacy scope from today's checkout when completion evidence is missing or disagrees", async () => {
  await fixture(false); delete h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha;
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "failed", errors: expect.arrayContaining([expect.stringContaining("baseline_unavailable")]) });
  expect(h.engine.record.planReconciliation).toBeUndefined();
  h.engine.record.phases.pr!.repositories["acme-shop"]!.pushedSha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  h.engine.record.plan![0]!.title = "Another historical title";
  expect((await h.engine.checkCompletedPlan()).errors.join(" ")).toContain("does not match");
  expect(readFileSync(join(h.repository, directory, "phase-1-catalog.md"), "utf8")).toBe(phase);
});

it("checks page mount, reload and button through the real browser while preserving history and no-launch", async () => {
  await fixture(); add(); publish();
  const { launchChrome } = await import("../test-support/headless-chrome.js");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  const chrome = await launchChrome();
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(server.address, { width, height: 900 });
      try {
        await page.waitFor("document.querySelector('[aria-label=\"Current plan check\"]')?.innerText.includes('1 new unfinished phase.')");
        expect(await page.evaluate("document.body.innerText")).toContain("Phase 9 · Lending");
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        await waitFor(() => !h.engine.checking && h.engine.record.completedPlanCheck?.status === "available");
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        await page.waitFor("!document.querySelector('[aria-label=\"Current plan check\"]')?.innerText.includes('Earlier result:')");
        writeFileSync(`/tmp/kiln-completed-discovery-${width}.png`, await page.screenshot());
        const first = h.engine.record.completedPlanCheck!.attemptedAt;
        const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
        const panel = await page.evaluate<string>("document.querySelector('[aria-label=\"Current plan check\"]').innerText");
        expect(panel).toContain(h.repository);
        expect(panel).toContain(revision);
        expect(await page.evaluate("document.querySelector('[aria-label=\"Current plan check\"] time')?.dateTime")).toBe(first);
        expect(await page.evaluate("document.querySelector('a[href=\"https://github.com/acme/acme-shop/pull/12\"]')?.href")).toBe("https://github.com/acme/acme-shop/pull/12");
        await page.evaluate("location.reload()");
        await waitFor(() => h.engine.record.completedPlanCheck?.attemptedAt !== first && h.engine.record.completedPlanCheck?.status === "available", 10_000).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify(h.engine.record.completedPlanCheck)}; ${await page.evaluate("document.body.innerText")}`, { cause: error }); });
        await page.waitFor("document.querySelector('[aria-label=\"Current plan check\"]')?.innerText.includes('1 new unfinished phase.')");
        expect(h.engine.record.completedPlanCheck!.attemptedAt).not.toBe(first);
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        const lastSuccess = h.engine.record.completedPlanCheck!.lastSuccessfulAt;
        git(h.sandbox, h.repository, "remote", "set-url", "origin", join(h.sandbox.root, "missing-origin"));
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
        await page.waitFor("document.body.innerText.includes('The current phase count is unknown.') && document.body.innerText.includes('Could not check for new phases')");
        expect(await page.evaluate("document.body.innerText")).toContain("Earlier result: 1 new unfinished phase.");
        expect(await page.evaluate("document.body.innerText")).not.toContain("No new phases found");
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        expect(await page.evaluate("document.querySelector('[aria-label=\"Current plan check\"] time')?.dateTime")).toBe(lastSuccess);
        expect(await page.evaluate("document.querySelector('a[href=\"https://github.com/acme/acme-shop/pull/12\"]')?.href")).toBe("https://github.com/acme/acme-shop/pull/12");
        expect(page.problems.filter(problem => !problem.includes('503'))).toEqual([]);
        writeFileSync(`/tmp/kiln-completed-discovery-failed-${width}.png`, await page.screenshot());
        git(h.sandbox, h.repository, "remote", "set-url", "origin", "https://github.com/acme/acme-shop.git");
        const design = join(h.repository, directory, "comet-technical-design.md"); const bytes = readFileSync(design, "utf8");
        writeFileSync(design, "x".repeat(PLAN_LIMIT));
        await page.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check for new phases')).click()");
        await page.waitFor("document.body.innerText.includes('8388608 document bytes') && [...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled)");
        expect(await page.evaluate("document.body.innerText")).toContain("Earlier result: 1 new unfinished phase.");
        expect(await page.evaluate("document.querySelector('[aria-label=\"Current plan check\"] time')?.dateTime")).toBe(lastSuccess);
        expect(await page.evaluate("[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Continue with')).every(b => b.disabled)")).toBe(true);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-completed-capacity-${width}.png`, await page.screenshot());
        writeFileSync(design, bytes);
      } finally { await page.close(); }
    }
    expect(h.claudeCalls()).toEqual([]);
  } finally { await chrome.close(); }
}, 60_000);

it("kiln run checks completed work before printing a conclusion and starts no session", async () => {
  await fixture(); add(); publish(); h.engine.close();
  const { EventEmitter } = await import("node:events");
  const { delimiter } = await import("node:path");
  const { runKilnCommand } = await import("../kiln-command.js");
  const url = "https://github.com/acme/acme-shop.git";
  git(h.sandbox, h.repository, "config", `url.${h.origin}.insteadOf`, url);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", url);
  let stdout = ""; let stderr = "";
  const signals = new EventEmitter();
  const result = runKilnCommand(["run", directory], { cwd: h.repository, env: { ...h.env, PATH: `${join(h.sandbox.root, "bin")}${delimiter}${process.env.PATH}`, KILN_NO_BROWSER: "1", KILN_PORT_RANGE: await reservePortRange() }, stdout: { write: (text: string) => { stdout += text; } }, stderr: { write: (text: string) => { stderr += text; } }, signals });
  try {
    await waitFor(() => stdout.includes("http://127.0.0.1:") || !!stderr);
    expect(stderr).toBe(""); expect(stdout).toContain("1 new unfinished phase found");
    expect(stdout).not.toContain("No new phases found"); expect(h.claudeCalls()).toEqual([]);
  } finally { signals.emit("SIGINT"); await result; }
});


async function checkHttp() {
  server ??= await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: "Comet library", token: h.engine.record.token });
  return fetch(`${new URL(server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
}
it.each(["saved", "git", "baseline", "baseline publication", "accounting", "proposal", "phases"])("returns typed capacity through HTTP for %s without faulting mutation ownership or losing earlier evidence", async boundary => {
  await fixture(); add(); publish(); const success = await h.engine.checkCompletedPlan();
  let restore = () => {};
  if (boundary === "saved" || boundary === "git") {
    const file = join(h.repository, directory, "comet-technical-design.md");
    const small = readFileSync(file, "utf8");
    writeFileSync(file, "x".repeat(PLAN_LIMIT));
    if (boundary === "git") { publish(); writeFileSync(file, small); }
  } else if (boundary === "baseline") {
    writeFileSync(join(h.stateDirectory, "plans", `${h.engine.record.planReconciliation!.baselineId}.json`), " ".repeat(BASELINE_LIMIT + 1));
  } else if (boundary === "baseline publication") {
    // Candidate fits; the retained baseline carries active plus both source observations, and JSON escaping doubles each quote.
    writeFileSync(join(h.repository, directory, "comet-technical-design.md"), "<!--" + "\"".repeat(5 * 1024 * 1024) + "-->\n"); publish();
  } else if (boundary === "phases") {
    for (let id = 10; id < PHASE_LIMIT + 10; id++) writeFileSync(join(h.repository, directory, `phase-${id}-extra.md`), `# Phase ${id}: Extra\n\n## Acceptance criteria covered\nAC-COMET-01\n`);
  } else {
    // Narrow capacity fault: actual writer limits are exercised separately; this proves
    // the HTTP/publication owner does not misclassify a refusal as an uncertain write.
    if (boundary === "accounting") {
      const module = await import("./completed-plan-accounting.js");
      const spy = vi.spyOn(module, "retainCompletionAccounting").mockImplementation(() => { throw new PlanCapacityError(PLAN_LIMIT, "completion evidence bytes"); }); restore = () => spy.mockRestore();
    } else {
      const module = await import("./continuation-readiness.js");
      const spy = vi.spyOn(module, "retainContinuationProposal").mockImplementation(() => { throw new PlanCapacityError(PLAN_LIMIT, "proposal bytes"); }); restore = () => spy.mockRestore();
    }
  }
  try {
    const response = await checkHttp(); expect(response.status).toBe(413);
    const body = await response.json() as { check: CompletedPlanCheck; reason: string }; expect(body).toMatchObject({ ok: false, code: "plan_too_large", limit: boundary === "phases" ? PHASE_LIMIT : boundary.startsWith("baseline") ? BASELINE_LIMIT : PLAN_LIMIT, check: { status: "failed", earlierResult: success.result, lastSuccessfulAt: success.lastSuccessfulAt } });
    expect(body.reason).toContain("check again"); expect(body.check.result).toBeUndefined();
    expect(h.engine.commands.fault).toBeUndefined(); expect(h.engine.record.completedAt).toBe("2026-10-01T12:00:00Z"); expect(h.claudeCalls()).toEqual([]);
    expect(h.reopenFromDisk().record.completedPlanCheck).toEqual(body.check);
  } finally { restore(); }
}, 120_000);

it("reads decoded Markdown extensions from saved/Git sources, refusing missing and unsafe targets", async () => {
  await fixture(); add(); publish(); const earlier = await h.engine.checkCompletedPlan();
  const design = join(h.repository, directory, "comet-technical-design.md");
  writeFileSync(design, "# Design\n[Required](shared-requirements%2Emd)\n");
  let response = await checkHttp(); expect(response.status).toBe(503);
  expect((await response.json() as { check: CompletedPlanCheck }).check).toMatchObject({ status: "failed", earlierResult: earlier.result, lastSuccessfulAt: earlier.lastSuccessfulAt });
  writeFileSync(join(h.repository, directory, "shared-requirements.md"), "# Required shared catalog rules\n"); publish();
  expect(await h.engine.checkCompletedPlan()).toMatchObject({ status: "available", result: { proposal: { readiness: "ready" } } });
  // A remote-only required reference must fail even when the saved source stays readable.
  writeFileSync(design, "# Design\n[Required](missing%2Emd)\n"); publish();
  writeFileSync(design, "# Design\n[Required](shared-requirements%2Emd)\n");
  response = await checkHttp(); expect(response.status).toBe(503);
  expect((await response.json() as { check: CompletedPlanCheck }).check.sources.find(s => s.kind === "delivery_base")?.error).toContain("missing.md");
  for (const href of ["../../../../outside%2Emd", "%2Foutside%2Emd", "..%5Coutside%2Emd"]) {
    writeFileSync(design, `# Design\n[Required](${href})\n`);
    expect((await h.engine.checkCompletedPlan()).sources[0]!.error).toContain("escapes");
  }
  const target = join(h.repository, directory, "linked.md"); symlinkSync(join(h.repository, directory, "shared-requirements.md"), target);
  writeFileSync(design, "# Design\n[Required](linked%2Emd)\n");
  expect((await h.engine.checkCompletedPlan()).sources[0]!.error).toContain("symlink");
  publish();
  expect((await h.engine.checkCompletedPlan()).sources[1]!.error).toContain("unsafe document");
  expect(h.claudeCalls()).toEqual([]);
});

it("keeps a failed newly named repository origin read unknown through HTTP with earlier offer/history retained", async () => {
  await fixture(); add(); publish(); const earlier = await h.engine.checkCompletedPlan();
  const { createRepository, createGithubOrigin } = await import("../test-support/git-repositories.js");
  const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api");
  const repo = createRepository(h.sandbox, "lending-api", origin.url); git(h.sandbox, repo, "push", "-qu", "origin", "develop");
  writeFileSync(join(h.repository, directory, "phase-9-lending.md"), newPhase.replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered")); publish();
  const run = gitReads.runGit;
  const spy = vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => {
    if (args[1] === repo && args[2].join(" ") === "ls-remote --symref origin HEAD refs/heads/*") return { exitCode: 1, stdout: "", stderr: "Required delivery-base read unavailable." };
    return run(...args);
  });
  try {
    const response = await checkHttp(); expect(response.status).toBe(503);
    const body = await response.json() as { check: CompletedPlanCheck; reason: string }; expect(body.check).toMatchObject({ status: "failed", earlierResult: earlier.result, lastSuccessfulAt: earlier.lastSuccessfulAt });
    expect(body.check.errors.join(" ")).toContain("lending-api's delivery bases");
    expect(body.check.errors.join(" ")).toContain("check for new phases again");
    expect(body.check.result).toBeUndefined(); expect(h.claudeCalls()).toEqual([]);
  } finally { spy.mockRestore(); }
});
