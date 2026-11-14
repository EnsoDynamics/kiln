/** Phase 7: real saved/Git, CLI/HTTP and browser regression boundaries. */
import { EventEmitter } from "node:events";
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Engine } from "./engine.js";
import * as repositoryReads from "./repositories.js";
import { documentsDigest } from "./development-delivery.js";
import * as gitReads from "./git-reads.js";
import * as durable from "../control/durable-file.js";
import { buildSnapshot } from "./snapshot.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { COMET_DIRECTORY, cometPhase, createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { launchChrome } from "../test-support/headless-chrome.js";
import { runKilnCommand } from "../kiln-command.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { readPendingAuthority } from "./continuation-authority.js";
let h: Harness; let server: LocalServer | undefined;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); server = undefined; await h?.cleanup(); });
const cliEnv = () => ({ ...h.env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports });
let ports = "";
beforeEach(async () => { ports = await reservePortRange(); });
const request = (proposalId: string, commandId: string) => ({ proposalId, commandId, executionId: h.engine.record.executionId!, statusToken: h.engine.controlView().token });
async function httpCheck() {
  server ??= await startLocalServer({ engine: h.engine, port: 0, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  return fetch(`${new URL(server.address).origin}/api/continuation/check`, { method: "POST", headers: { Origin: new URL(server.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: "{}" });
}

it("reopens the assigned plan without comparing an explicitly supplied other worktree", async () => {
  h = await createHarness({ sessions: [{ actions: [{ result: "Awaiting review." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const directory = "docs/prds/customer-returns";
  const known = join(h.sandbox.root, "explicit-comet-source");
  git(h.sandbox, h.repository, "worktree", "add", "-qb", "known/comet", known, h.engine.record.settings.featureBranch);
  writeFileSync(join(known, directory, "phase-4-lending.md"), "# Phase 4: Lending\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n3.\n");
  h.engine.close(); const signals = new EventEmitter(); let address = ""; let stdout = "";
  const done = runKilnCommand(["run", join(known, directory)], { cwd: h.repository, env: cliEnv(), stdout: { write: text => { stdout += text; } }, stderr: { write: text => { stdout += text; } }, signals, onServing: value => { address = value; } });
  try {
    await waitFor(() => !!address, 40_000);
    const saved = readPrdRecord(h.stateDirectory)!;
    expect(stdout).toContain("needs you");
    expect(saved.planReconciliation?.check).toMatchObject({ status: "accepted" });
    expect(saved.plan?.some(row => row.id === "4")).toBe(false);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(saved.repositories[0]!.worktreePath).toBe(h.engine.worktreePath);
    expect(readFileSync(join(known, directory, "phase-4-lending.md"), "utf8")).toContain("Lending");
  } finally { signals.emit("SIGINT"); await done; }
});

it.each([false, true])("keeps completed history with removed old artifacts through CLI/page/button discovery (delivery enabled %s)", async enabled => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const original = structuredClone(h.engine.record);
  if (enabled) {
    h.engine.record.developmentAuthorization = { enabled: true, revision: 1, grants: [{ target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, confirmedAt: "2026-10-01T10:00:00Z", source: "start" }] };
    h.engine.record.developmentDelivery!.assessments.push({ phaseId: "8", documentsDigest: documentsDigest({ prdWorktree: h.repository, prdDirectory: COMET_DIRECTORY }, "8"), required: false, criteria: ["AC-COMET-01"], reason: "Integrated catalog needs no deployment checkpoint.", checkpointIds: [] });
  }
  h.engine.record.developmentDelivery!.currentComplete = true;
  writePrdRecord(h.stateDirectory, h.engine.record); h.engine.close();
  const signals = new EventEmitter(); let address = ""; let stdout = "";
  const done = runKilnCommand(["run", COMET_DIRECTORY], { cwd: h.repository, env: cliEnv(), stdout: { write: text => { stdout += text; } }, stderr: { write: text => { stdout += text; } }, signals, onServing: value => { address = value; } });
  const chrome = await launchChrome();
  try {
    await waitFor(() => !!address && stdout.includes("7 new unfinished phases"), 40_000);
    const before = () => stdout.split("7 new unfinished phases").length;
    let count = before();
    const page = await chrome.open(address);
    try {
      await page.waitFor("document.body.innerText.includes('Readiness: Ready') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check for new phases') && !b.disabled)");
      await waitFor(() => before() > count); count = before();
      await page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Check for new phases')).click()");
      await waitFor(() => before() > count);
      expect(stdout).toContain("First phase to run: Phase 9");
      expect(stdout).toContain("Phases: 9 · Catalog capability 9; 10 · Catalog capability 10");
      expect(stdout).toContain(`Review ${address}`);
      expect(await page.evaluate("document.body.innerText")).toContain("Earlier catalog delivery");
      // The terminal reports the check before the page has its new snapshot, and the button stays
      // disabled until then; wait for the page to catch up rather than read it at once.
      await page.waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Continue with 7') && !b.disabled)");
      const saved = readPrdRecord(h.stateDirectory)!;
      expect(saved.completedAt).toBe(original.completedAt); expect(saved.pullRequests).toEqual(original.pullRequests);
      expect(saved.developmentDelivery!.currentComplete).toBe(true); expect(h.claudeCalls()).toEqual([]);
    } finally { await page.close(); }
  } finally { await chrome.close(); signals.emit("SIGINT"); await done; }
});

it.each(["checkout", "origin", "parent", "absent"])("distinguishes new-repository %s failures from positive absence over HTTP", async boundary => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const earlier = await h.engine.checkCompletedPlan();
  const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api");
  const repo = createRepository(h.sandbox, "lending-api", origin.url); git(h.sandbox, repo, "push", "-q", "origin", "develop");
  f.write("phase-9-catalog.md", cometPhase(9).replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered") + "\n## Phase dependencies\n8.\n");
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: name new repository"); f.publish();
  const original = gitReads.runGit;
  if (boundary === "parent") {
    // Narrow I/O fault beside real Git/HTTP; successful lookup is covered without it.
    vi.spyOn(repositoryReads, "repositoriesParent").mockReturnValue(join(h.sandbox.root, "unreadable-parent"));
  } else if (boundary === "absent") {
    f.write("phase-9-catalog.md", cometPhase(9).replace("## Acceptance criteria covered", "**Repositories:** missing-lending-api\n\n## Acceptance criteria covered") + "\n## Phase dependencies\n8.\n");
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: name absent repository"); f.publish();
  } else vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => args[1] === repo && args[2][0] === (boundary === "checkout" ? "rev-parse" : "remote") ? { exitCode: null, stdout: "", stderr: "", failure: "Injected Git helper unavailable" } : original(...args));
  const response = await httpCheck(); const body = await response.json() as { check: import("./completed-plan-discovery.js").CompletedPlanCheck };
  if (boundary === "absent") { expect(response.status).toBe(200); expect(body.check.status).toBe("blocked"); expect(body.check.result!.problems.join(" ")).toContain("missing-lending-api"); }
  else { expect(response.status).toBe(503); expect(body.check).toMatchObject({ status: "failed", lastSuccessfulAt: earlier.lastSuccessfulAt, earlierResult: earlier.result }); expect(body.check.result).toBeUndefined(); }
  expect(h.claudeCalls()).toEqual([]);
});

it.each([false, true])("projects uncertain completed-check publication as failed everywhere (post-write %s)", async afterWrite => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const earlier = await h.engine.checkCompletedPlan();
  f.write("phase-16-catalog.md", cometPhase(16)); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: append after earlier check"); f.publish();
  const events: import("./engine.js").TerminalEvent[] = [];
  h.engine.close(); h.engine = new Engine({ paths: h.engine.paths, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, onTerminal: event => events.push(event) });
  const original = durable.writeDurableMetadata;
  const spy = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    if (path === join(h.stateDirectory, "prd.json") && (value as { completedPlanCheck?: { status: string } }).completedPlanCheck?.status === "available") { if (afterWrite) original(path, value); throw new Error("Unacknowledged plan-check write"); }
    original(path, value);
  });
  const response = await httpCheck(); expect(response.ok).toBe(false);
  const check = buildSnapshot(h.engine).continuation!.check!;
  expect(check).toMatchObject({ status: "failed", lastSuccessfulAt: earlier.lastSuccessfulAt, earlierResult: earlier.result }); expect(check.result).toBeUndefined();
  expect(events.at(-1)).toMatchObject({ kind: "completed_plan_checked", check: { status: "failed" } });
  expect(h.engine.commands.fault).toContain("Restart Kiln");
  await expect(h.engine.checkCompletedPlan()).rejects.toThrow("Restart Kiln");
  spy.mockRestore(); await server!.close(); server = undefined;
  const again = h.reopenFromDisk(); await again.prepare(); expect(again.record.completedPlanCheck?.result?.added).toHaveLength(8);
});

it.each([1200, 390])("holds stale offers after browser-local failures and recovers on successful retry at width %s", async width => {
  const f = await createCometContinuation(); h = f.h; f.integrate(); await httpCheck();
  const chrome = await launchChrome(); const page = await chrome.open(server!.address, { width, height: 1000 });
  try {
    await page.waitFor("document.body.innerText.includes('Readiness: Ready') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check for new phases') && !b.disabled)");
    await page.evaluate("window.realFetch = window.fetch");
    for (const failure of ["transport", "json", "503", "409", "failed-check"]) {
      const replacement = failure === "transport" ? "Promise.reject(new Error('Network unavailable'))" : failure === "json" ? "Promise.resolve(new Response('invalid-json',{status:200}))" : failure === "failed-check" ? "Promise.resolve(new Response(JSON.stringify({check:{status:'failed',attemptedAt:new Date().toISOString(),sources:[],errors:['Required source unavailable']}}),{status:503,headers:{'Content-Type':'application/json'}}))" : `Promise.resolve(new Response(JSON.stringify({reason:'Read unavailable ${failure}'}),{status:${failure},headers:{'Content-Type':'application/json'}}))`;
      await page.evaluate(`window.fetch = (...args)=>String(args[0]).includes('/api/continuation/check') ? ${replacement} : window.realFetch(...args); [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Check for new phases')).click()`);
      await page.waitFor("document.body.innerText.includes('Could not check for new phases') && !document.body.innerText.includes('Checking for new phases')");
      expect(await page.evaluate("document.body.innerText")).toContain("Showing earlier results. The current phase count is unknown.");
      expect(await page.evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('Continue with')).every(b=>b.disabled)")).toBe(true);
      expect(await page.evaluate("document.body.innerText")).not.toContain("No new phases found");
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      writeFileSync(join(tmpdir(), `kiln-ph7-browser-failure-${width}.png`), await page.screenshot());
      await page.evaluate("window.fetch = window.realFetch; [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Check for new phases')).click()");
      await page.waitFor("!document.body.innerText.includes('Showing earlier results.') && ![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Continue with 7')).disabled");
    }
  } finally { await page.close(); await chrome.close(); }
});

it.skipIf(process.platform !== "darwin")("retains the exact target grant across equivalent saved/base bytes, recheck, restart and Continue", async () => {
  const f = await createCometContinuation(); h = f.h;
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  writeFileSync(join(h.repository, "validate"), "#!/bin/sh\nexit 0\n"); chmodSync(join(h.repository, "validate"), 0o755);
  git(h.sandbox, h.repository, "add", "validate"); git(h.sandbox, h.repository, "commit", "-qm", "test: source check");
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge branch \`wt/catalog-accessibility\` at \`${revision}\` into branch \`develop\` before building.\n\nVerify before building: run \`./validate\`.\n`);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: target preparation"); f.publish();
  const path = join(h.repository, COMET_DIRECTORY, "phase-10-catalog.md"); writeFileSync(path, readFileSync(path, "utf8").replace("Catalog capability", "**Catalog** capability"));
  const blocked = await h.engine.checkCompletedPlan(); expect(blocked.result!.proposal!.grantEligible).toBe(true);
  expect(blocked.result!.source.kind).toBe("delivery_base"); expect(blocked.sources[0]!.digest).not.toBe(blocked.sources[1]!.digest);
  const grant = { ...request(blocked.result!.proposal!.id, "equivalent-source-grant"), authorizationRevision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" } };
  expect(await h.engine.authorizeContinuationTarget(grant)).toMatchObject({ ok: true });
  const authority = readPendingAuthority(h.stateDirectory, h.engine.record)!; expect(authority.state).toBe("pending"); expect(h.claudeCalls()).toEqual([]);
  expect((await h.engine.checkCompletedPlan()).result!.proposal!.readiness).toBe("ready");
  for (const retained of [join(h.stateDirectory, "continuation-authority", `${authority.id}.json`), join(h.stateDirectory, "continuation-proposals", `${authority.proposalId}.json`)]) {
    const prior = h.engine.record.completedPlanCheck!;
    renameSync(retained, retained + ".unavailable");
    try {
      const response = await httpCheck(); expect(response.ok).toBe(false);
      expect(buildSnapshot(h.engine).continuation!.check).toMatchObject({ status: "failed", lastSuccessfulAt: prior.lastSuccessfulAt, earlierResult: prior.result });
      expect(buildSnapshot(h.engine).continuation!.check!.result).toBeUndefined();
      expect(h.events.at(-1)).toMatchObject({ kind: "completed_plan_checked", check: { status: "failed" } });
      expect(h.claudeCalls()).toEqual([]);
    } finally { renameSync(retained + ".unavailable", retained); }
    expect((await h.engine.checkCompletedPlan()).result!.proposal!.readiness).toBe("ready");
    expect(readPendingAuthority(h.stateDirectory, h.engine.record)!.state).toBe("pending");
  }
  await server?.close(); server = undefined;
  const again = h.reopenFromDisk(); h.engine = again; await again.prepare();
  expect(readPendingAuthority(h.stateDirectory, again.record)!.executionId).toBe(authority.executionId);
  expect(await again.authorizeContinuationTarget(grant)).toMatchObject({ ok: true });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ result: "Preparation awaits review." }, { exit: 0 }] }] }));
  const proposal = again.record.completedPlanCheck!.result!.proposal!;
  expect(await again.continuationCommand("accept", request(proposal.id, "equivalent-source-continue"))).toMatchObject({ ok: true }); await again.settled();
  expect(again.record.executionId).toBe(authority.executionId); expect(readPendingAuthority(h.stateDirectory, again.record)!.state).toBe("adopted"); expect(h.claudeCalls()).toHaveLength(1);
});

it("keeps external-completion repository helper failures unknown rather than merely unresolved", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate(); const earlier = await h.engine.checkCompletedPlan();
  const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api"); const repo = createRepository(h.sandbox, "lending-api", origin.url);
  git(h.sandbox, repo, "push", "-q", "origin", "develop"); const revision = git(h.sandbox, repo, "rev-parse", "HEAD").trim();
  f.write("phase-8-catalog.md", cometPhase(8, true).replace("## Acceptance criteria covered", "**Repositories:** lending-api\n\n## Acceptance criteria covered"));
  const prd = join(h.repository, COMET_DIRECTORY, "library-catalog-prd.md"); writeFileSync(prd, readFileSync(prd, "utf8") + `\nPhase 8: repository \`lending-api\` at commit \`${revision}\`.\n`);
  h.engine.record.settings.bases["lending-api"] = "develop";
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: external repository read"); f.publish();
  const original = gitReads.runGit;
  vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => args[1] === repo ? { exitCode: null, stdout: "", stderr: "", failure: "External repository helper unavailable" } : original(...args));
  const response = await httpCheck(); expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ check: { status: "failed", lastSuccessfulAt: earlier.lastSuccessfulAt, earlierResult: earlier.result, errors: expect.arrayContaining([expect.stringContaining("External repository helper unavailable")]) } });
});

it("never keeps No new phases found after a browser-local failed unchanged-plan refresh", async () => {
  const f = await createCometContinuation(); h = f.h;
  for (let id = 8; id <= 15; id++) git(h.sandbox, h.repository, "rm", `${COMET_DIRECTORY}/phase-${id}-catalog.md`);
  const { COMET_PRD } = await import("../test-support/comet-continuation-fixture.js"); f.write("library-catalog-prd.md", COMET_PRD);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: unchanged original plan"); f.publish(); await httpCheck();
  const chrome = await launchChrome(); const page = await chrome.open(server!.address);
  try {
    await page.waitFor("document.body.innerText.includes('No new phases found') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check for new phases') && !b.disabled)");
    await page.evaluate("window.fetch=()=>Promise.reject(new Error('Network unavailable')); [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Check for new phases')).click()");
    await page.waitFor("document.body.innerText.includes('Could not check for new phases')");
    expect(await page.evaluate("document.body.innerText")).not.toContain("No new phases found");
    expect(await page.evaluate("document.body.innerText")).toContain("The current phase count is unknown");
    expect(await page.evaluate("document.body.innerText")).toContain("Earlier catalog delivery");
  } finally { await page.close(); await chrome.close(); }
});

it("reports actual missing Git/helper and parent reads separately from a positively absent repository", async () => {
  const f = await createCometContinuation(); h = f.h;
  const missingTool = { git: join(h.sandbox.root, "missing-git"), env: h.env };
  const { dirname, basename } = await import("node:path");
  expect(await repositoryReads.findRepository(missingTool, dirname(h.repository), basename(h.repository))).toMatchObject({ ok: false, unavailable: true, problem: expect.stringContaining("Couldn't read") });
  expect(await repositoryReads.findRepository({ git: h.tools.git, env: h.env }, join(h.sandbox.root, "missing-parent"), "lending-api")).toMatchObject({ ok: false, unavailable: true });
  const absent = await repositoryReads.findRepository({ git: h.tools.git, env: h.env }, h.sandbox.root, "missing-repo");
  expect(absent).toMatchObject({ ok: false }); expect("unavailable" in absent).toBe(false);
});

it("checks external completed children's original split order before accepting their Git evidence", async () => {
  const f = await createCometContinuation(); h = f.h;
  const parent = (children: string[]) => `# Phase 8: Catalog split\n\n## Split into\n| Phase | Work |\n|---|---|\n${children.map(id => `| [${id}](phase-${id}-catalog.md) | Capability ${id} |`).join("\n")}\n`;
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  f.write("phase-8-catalog.md", parent(["8a", "8b"])); for (const id of ["8a", "8b"]) f.write(`phase-${id}-catalog.md`, cometPhase(id, true));
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: external completed split"); const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-8-catalog.md", parent(["8b", "8a"])); for (const id of ["8a", "8b"]) f.write(`phase-${id}-catalog.md`, cometPhase(id, true));
  const { COMET_PRD } = await import("../test-support/comet-continuation-fixture.js");
  f.write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8a: repository \`comet-library\` at commit \`${revision}\`.\n\nPhase 8b: repository \`comet-library\` at commit \`${revision}\`.\n`);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: reordered external split"); f.publish();
  const blocked = await h.engine.checkCompletedPlan();
  const external = blocked.result!.leaves!.filter(row => ["8a", "8b"].includes(row.id));
  expect(external.map(row => row.classification)).toEqual(["externally_unverified", "externally_unverified"]);
  expect(external.every(row => row.problems.some(problem => problem.includes("unchanged Closed scope"))), JSON.stringify(external)).toBe(true); expect(blocked.result!.added).toHaveLength(7);
  f.write("phase-8-catalog.md", parent(["8a", "8b"])); git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: reconcile external split order"); f.integrate();
  const ready = await h.engine.checkCompletedPlan(); expect(ready.status).toBe("available");
  expect(ready.result!.leaves!.filter(row => ["8a", "8b"].includes(row.id)).every(row => row.classification === "externally_verified")).toBe(true);
  expect(ready.result!.added).toHaveLength(7); expect(h.claudeCalls()).toEqual([]);
});

it.each(["deleted_ref", "merge_deleted_ref", "rebase_deleted_ref", "clean_partial", "dirty_partial", "committed_partial", "wrong_branch_partial", "helper_partial", "remote_failure_partial", "unproved_partial", "pre_sync_source_partial", "remote_unchanged_missing_workspace", "remote_changed_missing_workspace", "remote_failure_missing_workspace", "unreadable_partial", "review_partial", "changed_review_partial"])("preserves completed recovery beside historical absence: %s", async mode => {
  const { deliveryFixture } = await import("../test-support/development-delivery-fixture.js");
  const { recoveryRequest } = await import("../test-support/phase-recovery-request.js");
  const f = await deliveryFixture(mode === "rebase_deleted_ref" ? "rebase" : mode === "merge_deleted_ref" ? "merge" : "squash"); h = f.h; f.synchronize();
  h.tools.gh = f.context.gh; Object.assign(h.env, f.context.env);
  const engine = h.reopen(); await engine.agents.refresh();
  await engine.checkAgain(recoveryRequest(engine, "verify")); await engine.settled();
  expect(engine.currentlyComplete).toBe(true);
  const active = engine.worktreePath;
  if (mode === "review_partial" || mode === "changed_review_partial") {
    writeFileSync(join(active, "review-work.txt"), "Accepted remaining review work\n");
    git(h.sandbox, active, "add", "review-work.txt"); git(h.sandbox, active, "commit", "-qm", "test: remaining review work"); git(h.sandbox, active, "push", "origin", engine.record.settings.featureBranch);
    const head = git(h.sandbox, active, "rev-parse", "HEAD").trim();
    const url = "https://github.com/acme/acme-shop/pull/2";
    const review = { ...structuredClone(f.pull), number: 2, state: "open", merged_at: null, html_url: url, body: `PRD: ${f.context.prdDirectory}\nEarlier delivery: ${f.pull.html_url}`, head: { ...structuredClone(f.pull.head), sha: head } };
    f.pull.body += `\nReview: ${url}`;
    f.responses[`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:" + engine.record.settings.featureBranch)}&base=develop&per_page=100&page=1`] = { body: [review] };
    f.responses["repos/acme/acme-shop/pulls/2"] = { body: review }; f.save();
    // The current open review already covers the exact new head, so ordinary
    // recovery may pass immediately; its ledger must accept that specific head.
    expect(await engine.decide()).toEqual({ kind: "complete" });
    expect(engine.currentlyComplete).toBe(true);
    expect(engine.record.developmentDelivery!.repositoryResults).toMatchObject([{ state: "mixed", remainingHeadSha: head, reviewPullRequest: { number: 2 } }]);
  }
  const completedAt = engine.record.completedAt; const calls = h.claudeCalls().length;
  if (mode.endsWith("deleted_ref")) git(h.sandbox, h.origin, "update-ref", "-d", `refs/heads/${engine.record.settings.featureBranch}`);
  else if (mode.endsWith("partial")) {
    const origin = createGithubOrigin(h.sandbox, "fictional", "catalog-api"); const repo = createRepository(h.sandbox, "catalog-api", origin.url);
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    engine.record.repositories.push({ name: "catalog-api", kind: "named", github: "fictional/catalog-api", mainCheckoutPath: repo, worktreePath: join(h.sandbox.root, "deleted-catalog-api-workspace"), baseBranch: "develop", baseCommit: git(h.sandbox, repo, "rev-parse", "HEAD").trim(), setupCompletedAt: completedAt! });
  }
  if (mode === "dirty_partial" || mode === "committed_partial" || mode === "remote_changed_missing_workspace" || mode === "changed_review_partial") {
    writeFileSync(join(active, "later.txt"), "Later available catalog work\n");
    if (mode === "committed_partial" || mode === "remote_changed_missing_workspace" || mode === "changed_review_partial") { git(h.sandbox, active, "add", "later.txt"); git(h.sandbox, active, "commit", "-qm", "test: later available work"); git(h.sandbox, active, "push", "origin", engine.record.settings.featureBranch); }
  }
  if (mode.endsWith("missing_workspace")) rmSync(active, { recursive: true, force: true });
  if (mode === "wrong_branch_partial") git(h.sandbox, active, "checkout", "-qb", "fictional-other-owner");
  if (mode === "unproved_partial") engine.record.developmentDelivery!.repositoryResults = [];
  if (mode === "pre_sync_source_partial") {
    // Reset-like movement in owned disposable refs only; never reset a checkout.
    git(h.sandbox, active, "update-ref", `refs/heads/${engine.record.settings.featureBranch}`, f.head);
    git(h.sandbox, h.origin, "update-ref", `refs/heads/${engine.record.settings.featureBranch}`, f.head);
  }
  const original = gitReads.runGit;
  if (mode === "helper_partial" || mode.startsWith("remote_failure")) vi.spyOn(gitReads, "runGit").mockImplementation(async (...args) => {
    const injected = mode === "helper_partial" ? args[1] === active && args[2][0] === "rev-parse" : args[2].join(" ") === `ls-remote origin refs/heads/${engine.record.settings.featureBranch}`;
    return injected ? { exitCode: null, stdout: "", stderr: "", failure: "Available historical artifact read is unknown" } : original(...args);
  });
  const { dirname } = await import("node:path"); const parent = dirname(active);
  if (mode === "unreadable_partial") chmodSync(parent, 0);
  let decision: import("./engine.js").UnderwayDecision;
  try { decision = await engine.decide(); } finally { if (mode === "unreadable_partial") chmodSync(parent, 0o755); }
  if (mode.endsWith("deleted_ref") || mode === "clean_partial" || mode === "review_partial" || mode === "remote_unchanged_missing_workspace") { expect(decision).toEqual({ kind: "complete" }); expect(engine.currentlyComplete).toBe(true); }
  else { expect(decision.kind).toBe("needs_you"); expect(engine.currentlyComplete).toBe(false); }
  expect(engine.record.completedAt).toBe(completedAt); expect(h.claudeCalls()).toHaveLength(calls);
});
