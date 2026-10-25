// Real engine, private process pipes, saved provider-shaped history, Git and browser.
// The deterministic peer covers failures beside the separate real Codex workflow proof.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { git } from "../test-support/git-repositories.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine } from "./engine.js";
import { buildSnapshot, codexResumeCommand } from "./snapshot.js";
import { readPrdRecord, readSessionRecord } from "../state/records.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import type { EngineOptions } from "./engine.js";
import { sessionFiles } from "../session/claude-session.js";
import { appendJsonLine } from "../state/state-files.js";
import { CodexOutputReader } from "../session/codex-output.js";
import type { CodexAudit } from "../session/codex-evidence.js";

let h: Harness;
let f: ReturnType<typeof codexWorkFixture>;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); chrome = undefined; await server?.close(); server = undefined; await h?.cleanup(); await f?.sandbox.cleanup(); });

async function setup(value: Record<string, unknown> = {}, engineOptions: Partial<EngineOptions> = {}) {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") });
  f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable });
  f.configureEnvironment(h.env);
  f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ...value });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] }, ...engineOptions });
  await h.engine.changeSettings({ agentId: "codex" });
  await h.engine.agents.refresh();
  expect(h.engine.selectionError).toBeUndefined();
}
const set = (value: Record<string, unknown>) => f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ...value });

it("starts with only Codex, streams/saves native output, fixes the agent, and resumes the original pair after restart", async () => {
  await setup({ deltas: true });
  const partials: string[] = [];
  h.engine.onPartial((_id, partial) => partials.push(partial.text));
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  expect(session).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", conversation: { threadId: expect.any(String) } });
  expect(session.initModel).toBeUndefined();
  expect(session.codex?.launchIntent.writableRoots).toEqual([h.engine.workspaceFolder]);
  expect(h.engine.latestStayed("1").passed).toBe(true);
  expect(buildSnapshot(h.engine).needsYou).toMatchObject({ agent: "Codex", resumeOffered: true, requested: { effort: "high" }, observed: [expect.objectContaining({ effort: "high" })], cleanupWarning: expect.stringContaining("Independently detached") });
  expect(h.engine.outputLines(session).some(line => line.source === "codex" && line.text.includes("Fixture final"))).toBe(true);
  expect(partials).toContain("Fixture streaming");
  expect(h.claudeCalls()).toEqual([]);
  expect(await h.engine.changeSettings({ agentId: "claude_code" })).toMatchObject({ ok: false });
  await h.engine.changeSettings({ agentId: "codex", selectionGeneration: h.engine.agents.state.generation, effort: "low" });
  h.reopenFromDisk(); await h.engine.agents.refresh();
  expect((await h.engine.decide()).kind).toBe("needs_you");
  expect(await h.engine.resume({ note: "Keep the saved context." })).toEqual({ ok: true }); await h.engine.settled();
  const resumed = h.engine.latestSession("1")!;
  expect(resumed.sessionId).toBe(session.sessionId);
  expect(resumed.conversation?.threadId).toBe(session.conversation?.threadId);
  expect(resumed.runs).toHaveLength(2);
  expect(resumed.runs[1]?.codex?.requested).toEqual({ model: session.model, effort: "high" });
  const dispatches = f.calls().filter(call => call.method === "turn/start");
  expect(JSON.stringify(dispatches[1]?.params?.input)).toMatch(/Keep the saved context.*carry on/is);
  expect(codexResumeCommand("/tmp/with a ' quote", resumed)).toContain("codex resume");
  expect(codexResumeCommand("C:\\with ' quote", resumed, "win32")).toContain("with '' quote");
});

it("permits explicit repair with incomplete evidence without clearing the original audit obligation", async () => {
  await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  const raw = join(f.home, "sessions", `${session.conversation!.threadId}.jsonl`);
  writeFileSync(raw, readFileSync(raw, "utf8") + "{broken}\n");
  await h.engine.checkAgain(); await h.engine.settled();
  expect(h.engine.latestStayed("1").passed).toBe(false);
  expect(buildSnapshot(h.engine).needsYou?.resumeOffered).toBe(true);
  expect(h.engine.setOutsideConfirmation(true).ok).toBe(false);
  await h.engine.resume({ note: "Repair the recorded work." }); await h.engine.settled();
  expect(h.engine.latestSession("1")?.runs).toHaveLength(2);
  expect(h.engine.latestStayed("1").passed).toBe(false);
  const input = JSON.stringify(f.calls().filter(call => call.method === "turn/start").at(-1)?.params?.input);
  expect(input.indexOf("Repair the recorded work")).toBeLessThan(input.indexOf("workspace check is inconclusive"));
  expect(input.indexOf("workspace check is inconclusive")).toBeLessThan(input.indexOf("Carry on"));
});

it("refreshes terminal recovery messages and separate observed settings on Check again without dispatch or duplicates", async () => {
  await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  const threadId = session.conversation!.threadId!;
  const historyPath = f.file + "." + threadId + ".history";
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  history.push({ id: "manual-turn", status: "completed", startedAt: 1792780000, items: [{ id: "manual-message", type: "agentMessage", text: "Manual recovery work is saved." }] });
  writeFileSync(historyPath, JSON.stringify(history));
  const raw = (type: string, payload: unknown) => appendFileSync(join(f.home, "sessions", `${threadId}.jsonl`), JSON.stringify({ type, timestamp: "2026-10-23T18:26:40Z", payload }) + "\n");
  raw("event_msg", { type: "task_started", turn_id: "manual-turn" });
  raw("turn_context", { turn_id: "manual-turn", model: "manual-model", effort: "low", cwd: h.engine.worktreePath });
  raw("event_msg", { type: "task_complete", turn_id: "manual-turn" });
  await h.engine.checkAgain(); await h.engine.settled();
  expect(buildSnapshot(h.engine).needsYou).toMatchObject({ requested: { effort: "high" }, recoveryObserved: [{ turnId: "manual-turn", model: "manual-model", effort: "low" }] });
  expect(session.runs).toHaveLength(1);
  const recovered = h.engine.outputLines(session).filter(line => line.itemId === "manual-message");
  expect(recovered).toEqual([expect.objectContaining({ source: "codex", threadId, turnId: "manual-turn", timestampSource: "turn", text: "Manual recovery work is saved." })]);
  await h.engine.checkAgain(); await h.engine.settled();
  expect(h.engine.outputLines(session).filter(line => line.itemId === "manual-message")).toHaveLength(1);
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
  const output = h.engine.outputLines(session);
  const reader = new CodexOutputReader(session, output.length, output);
  for (const line of reader.read({ method: "item/completed", params: { threadId: "browser-child", turnId: "child-turn", item: { id: "child-message", type: "agentMessage", text: "Saved child review." } } }, "2026-10-23T18:26:40Z", "recovery").lines) appendJsonLine(sessionFiles(h.stateDirectory, session).output, line);
  h.reopenFromDisk();
  expect(h.engine.latestSession("1")?.codex?.recoveryObserved).toMatchObject([{ turnId: "manual-turn", model: "manual-model" }]);
  server = await startLocalServer({ engine: h.engine, port: 41447, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  const page = await chrome.open(server.address + "/phase/1", { width: 360 });
  await page.waitFor(`document.body.textContent.includes('Saved child review.')`);
  const text = await page.evaluate<string>(`document.body.textContent`);
  for (const expected of ["Codex conversation", "Requested:", "Effective configuration:", "Observed turn", "Observed recovery turn manual-turn", "Manual recovery work is saved.", "browser-child", "[turn time]", "[recovered now; item time unavailable]", "Unobserved — no reliable activity evidence", "Activity observed; completion unobserved", "Independently detached"]) expect(text).toContain(expected);
  expect(text).not.toContain("Last message from Claude");
  expect(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
  expect(page.problems).toEqual([]); await page.close();
});

it("shows independent work and cleanup failures in the browser and blocks continuation until cleanup is reconciled", async () => {
  await setup({ observedMismatch: true, backgroundListError: true });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const snapshot = buildSnapshot(h.engine);
  expect(snapshot.needsYou).toMatchObject({ agent: "Codex", resumeOffered: false, failure: expect.stringContaining("observed turn"), cleanupFailure: expect.stringContaining("inventory failure") });
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
  server = await startLocalServer({ engine: h.engine, port: 41447, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome();
  for (const width of [1280, 360]) {
    const page = await chrome.open(server.address, { width });
    await page.waitFor(`document.body.textContent.includes('Cleanup failed:')`);
    const text = await page.evaluate<string>(`document.body.textContent`);
    expect(text).toContain("observed turn"); expect(text).toContain("inventory failure");
    expect(text).toContain("Independently detached"); expect(text).toContain("Check background servers or jobs");
    expect(text).toContain("Last message from Codex"); expect(text).not.toContain("Claude Code session");
    expect(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
    expect(page.problems).toEqual([]); await page.close();
  }
  set({}); await h.engine.checkAgain(); await h.engine.settled();
  expect(buildSnapshot(h.engine).needsYou?.cleanupFailure).toBeUndefined();
  expect(buildSnapshot(h.engine).needsYou?.resumeOffered).toBe(true);
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
});

it("removes resume actions for unavailable conversations while retaining the fresh prompt and failed evidence", async () => {
  await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  set({ missingThread: true }); await h.engine.checkAgain(); await h.engine.settled();
  expect(buildSnapshot(h.engine).needsYou).toMatchObject({ resumeOffered: false, freshSessionCommand: expect.stringContaining("codex"), resumeError: expect.stringContaining("cannot be opened") });
  expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
  expect(h.engine.latestStayed("1").passed).toBe(false);
  expect(readPrdRecord(h.stateDirectory)!.completedAt).toBeUndefined();
});

it("interrupts a live Codex turn and checks before automatically resuming the same conversation", async () => {
  await setup({ hang: true }); await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => f.calls().some(call => call.method === "turn/start"));
  const report = await h.engine.stop("sigint"); await h.engine.settled();
  expect(report.grey).toContain("Independently detached");
  const original = h.engine.latestSession("1")!;
  expect(original.runs[0]).toMatchObject({ interruptedBy: "sigint", codex: { cleanup: "tracked_processes_stopped" } });
  set({}); h.reopenFromDisk(); await h.engine.agents.refresh();
  expect((await h.engine.decide()).kind).toBe("resume");
  await h.engine.continue();
  expect(h.engine.latestSession("1")?.conversation?.threadId).toBe(original.conversation?.threadId);
  expect(h.engine.latestSession("1")?.runs).toHaveLength(2);
});

it("treats tool-only activity after sleep as interrupted, checks, and recovers the same Codex conversation", async () => {
  let reported = false;
  await setup({ command: "pwd", toolOnlyFirst: true }, { sleepCheckMs: 3_600_000, sleepReader: { next: async () => {
    if (reported || !f?.calls().some(call => call.method === "turn/start")) return [];
    reported = true;
    return [{ at: new Date(Date.now() - 600_000).toISOString(), seconds: 600 }];
  } } });
  let auditBeforeResume: CodexAudit | undefined;
  h.engine.onChange(() => {
    const session = h.engine.latestSession("1");
    if (session?.runs.length === 2 && !session.runs[1]?.codex?.dispatch) auditBeforeResume = structuredClone(h.engine.record.phases["1"]?.codexAudits?.[session.sessionId]);
  });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  expect(session.runs).toHaveLength(2);
  expect(session.runs[0]).toMatchObject({ interruptedBy: "sleep", codex: { modelActivityAt: [], terminal: { status: "completed" } } });
  expect(session.runs[1]).toMatchObject({ cause: "resume", codex: { modelActivityAt: [expect.any(String)] } });
  expect(h.engine.outputLines(session).some(line => line.text.includes("Command completed; exit 0"))).toBe(true);
  const calls = f.calls();
  expect(auditBeforeResume).toMatchObject({ coverage: "complete", problems: [], findings: [], operationsChecked: 1 });
  expect(calls.filter(call => call.method === "thread/resume")).toEqual([expect.objectContaining({ params: expect.objectContaining({ threadId: session.conversation!.threadId }) })]);
  expect(h.engine.latestStayed("1").passed).toBe(true);
});

it("follows a phase's own split through fresh Codex conversations and the final PR session using real Git", async () => {
  await setup();
  const program = `
    const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
    const fixture=JSON.parse(fs.readFileSync(process.env.KILN_CODEX_WORK_FIXTURE,'utf8'));
    const prd=JSON.parse(fs.readFileSync(path.join(fixture.stateDirectory,'prd.json'),'utf8'));
    const [key,facts]=Object.entries(prd.phases).reverse().find(([key,facts])=>facts.sessionIds.length && !facts.doneAt);
    const dir='docs/prds/customer-returns';
    if(key==='pr') {
      fs.writeFileSync(process.env.KILN_STANDIN_GH_STATE,JSON.stringify({pulls:[{repo:'acme/acme-shop',number:219,title:'Codex workflow',url:'https://github.com/acme/acme-shop/pull/219',isDraft:false,isCrossRepository:false,headRefName:prd.settings.featureBranch,baseRefName:'develop',additions:4,deletions:0,commits:[{oid:'proof'}]}]}));
    } else {
      let files;
      if(key==='1') {
        files=['phase-1-return-intake.md','phase-1a-intake-form.md','phase-1b-intake-submit.md'];
        fs.writeFileSync(path.join(dir,files[0]),'# Phase 1: Return intake — split into 1a–1b\\n\\n## Split into\\n\\n| Phase | What it does |\\n|---|---|\\n| [1a](phase-1a-intake-form.md) | Form |\\n| [1b](phase-1b-intake-submit.md) | Submit |\\n');
        fs.writeFileSync(path.join(dir,files[1]),'# Phase 1a: Intake form\\n**Closed:** 2026-10-23\\n\\n## Acceptance criteria covered\\nAC-RET-01\\n\\n## Phase dependencies\\nNone.\\n');
        fs.writeFileSync(path.join(dir,files[2]),'# Phase 1b: Intake submit\\n\\n## Acceptance criteria covered\\nAC-RET-01\\n\\n## Phase dependencies\\n1a\\n');
      } else {
        files=[fs.readdirSync(dir).find(name=>name.startsWith('phase-'+key+'-'))];
        const name=path.join(dir,files[0]);fs.writeFileSync(name,fs.readFileSync(name,'utf8').replace(/^(#.*)\\n/,'$1\\n**Closed:** 2026-10-23\\n'));
      }
      const run=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'});
      run('add',...files.map(name=>path.join(dir,name)));run('commit','-m','feat(proof): land '+key);run('push','-u','origin',prd.settings.featureBranch);
    }
  `;
  const command = `${JSON.stringify(process.execPath)} -e '${program.replaceAll("'", "'\\''")}'`;
  set({ command, delayMs: 250 });
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await waitFor(() => f.calls().some(call => call.method === "turn/start"));
  expect(await h.engine.changeSettings({ agentId: "codex", selectionGeneration: h.engine.agents.state.generation, effort: "low" })).toEqual({ ok: true });
  await h.engine.settled();
  expect(buildSnapshot(h.engine).feature.state).toBe("complete");
  expect(h.engine.record.pullRequests?.[0]?.number).toBe(219);
  const sessions = ["1", "1b", "2b", "3", "pr"].map(key => h.engine.latestSession(key)!);
  expect(sessions.every(session => session.agentId === "codex")).toBe(true);
  expect(new Set(sessions.map(session => session.conversation?.threadId)).size).toBe(5);
  expect(sessions[0]?.effort).toBe("high");
  expect(sessions.slice(1).map(session => session.runs[0]?.codex?.requested.effort)).toEqual(["low", "low", "low", "low"]);
  expect(h.engine.record.plan?.find(phase => phase.id === "1")?.splitInto).toEqual(["1a", "1b"]);
  expect(h.engine.latestStayed("pr").passed).toBe(true);
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(5);
  expect(h.claudeCalls()).toEqual([]);
});

// AC-MODEL-01/03: schema-valid provider refusal, not an actual entitlement/quota proof.
it("shows model access refusal without substituting a model or conversation on launch and resume", async () => {
  const error = { message: "The requested model is unavailable on this account.", codexErrorInfo: "unauthorized", additionalDetails: null };
  await setup({ terminalError: error }); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const original = h.engine.latestSession("1")!;
  expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
  expect(original.runs[0]?.codex?.terminal).toEqual(expect.objectContaining({ status: "failed", error }));
  expect(h.engine.outputLines(original).some(line => line.source === "exit" && line.text.includes(error.message))).toBe(true);
  await h.engine.changeSettings({ agentId: "codex", selectionGeneration: h.engine.agents.state.generation, effort: "low" });
  h.reopenFromDisk(); await h.engine.agents.refresh();
  expect(await h.engine.resume({ note: "Keep the original requested model." })).toEqual({ ok: true }); await h.engine.settled();
  const resumed = h.engine.latestSession("1")!;
  expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
  expect(resumed.sessionId).toBe(original.sessionId);
  expect(resumed.conversation?.threadId).toBe(original.conversation?.threadId);
  expect(resumed.runs[1]?.codex?.terminal).toMatchObject({ status: "failed", error });
  expect(resumed.runs.map(run => run.codex?.requested)).toEqual([{ model: "gpt-6.1-sol", effort: "high" }, { model: "gpt-6.1-sol", effort: "high" }]);
  expect(f.calls().filter(call => call.method === "thread/start")).toHaveLength(1);
  expect(f.calls().filter(call => call.method === "turn/start").map(call => [call.params?.model, call.params?.effort])).toEqual([["gpt-6.1-sol", "high"], ["gpt-6.1-sol", "high"]]);
  expect(h.claudeCalls()).toEqual([]);
  server = await startLocalServer({ engine: h.engine, port: 41447, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome(); const page = await chrome.open(server.address);
  try { await page.waitFor(`document.body.textContent.includes(${JSON.stringify(error.message)})`); expect(page.problems).toEqual([]); }
  finally { await page.close(); }
});

// AC-WORK-03: a stopped request must be visible where the person recovers the work.
it("shows the full stopped Codex question at Needs you and keeps prior edits recoverable", async () => {
  await setup({ request: "item/tool/requestUserInput", hang: true });
  let seededBeforeDispatch = false;
  h.engine.onChange(() => {
    const attempt = h.engine.latestSession("1")?.runs[0]?.codex;
    if (!seededBeforeDispatch && attempt?.intentAt && !attempt.dispatch) {
      writeFileSync(join(h.engine.worktreePath, "prior-work.txt"), "Keep this work.\n");
      seededBeforeDispatch = true;
    }
  });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(seededBeforeDispatch).toBe(true);
  const session = h.engine.latestSession("1")!;
  expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
  expect(session.runs[0]?.codex?.humanRequests).toMatchObject([{ method: "item/tool/requestUserInput", stopped: true, request: { questions: [{ question: "Need a person" }] } }]);
  expect(readSessionRecord(h.stateDirectory, "1", session.sessionId)?.runs[0]?.codex?.humanRequests).toEqual(session.runs[0]?.codex?.humanRequests);
  expect(readFileSync(join(h.engine.worktreePath, "prior-work.txt"), "utf8")).toBe("Keep this work.\n");
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
  server = await startLocalServer({ engine: h.engine, port: 41447, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
  chrome = await launchChrome(); const page = await chrome.open(server.address, { width: 360 });
  try {
    await page.waitFor(`document.querySelector('.codex-facts pre')`);
    const request = await page.evaluate<string>(`document.querySelector('.codex-facts pre').textContent`);
    expect(JSON.parse(request)).toMatchObject({ questions: [{ question: "Need a person" }] });
    expect(await page.evaluate(`document.querySelector('.codex-facts').textContent`)).toContain("needs a person");
    expect(page.problems).toEqual([]);
  } finally { await page.close(); }
});

// AC-COMPAT-01: mixed providers overlap in separate worktrees of the same repository.
it("isolates simultaneous Claude and Codex PRDs, worktrees, settings and saved output", async () => {
  h = await createHarness({ extraFolders: ["second-prd"], sessions: [{ actions: [
    { write: { path: "claude-only.txt", content: "Claude work\n" } },
    { text: "Claude-only result" }, { waitForFile: "release-mixed-test" }, { result: "Claude-only result" },
  ] }] });
  f = codexWorkFixture(); Object.assign(h.tools, { codex: f.options.executable }); f.configureEnvironment(h.env);
  const other = await h.engineFor("second-prd");
  try {
    h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
    const program = "const fs=require('node:fs');fs.writeFileSync('codex-only.txt','Codex work\\n');setInterval(()=>{if(fs.existsSync('release-mixed-test'))process.exit(0)},20);setTimeout(()=>process.exit(2),20000)";
    set({ command: `${JSON.stringify(process.execPath)} -e '${program.replaceAll("'", "'\\''")}'` });
    await h.engine.changeSettings({ agentId: "codex" }); await h.engine.agents.refresh();
    const claudeChoices = structuredClone(other.record.settings.agentChoices);
    expect(await other.start({ refinementConfirmed: true })).toEqual({ ok: true });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await waitFor(() => existsSync(join(other.worktreePath, "claude-only.txt")) && existsSync(join(h.engine.worktreePath, "codex-only.txt")));
    expect(h.engine.current).toBeDefined(); expect(other.current).toBeDefined();
    await h.engine.changeSettings({ agentId: "codex", selectionGeneration: h.engine.agents.state.generation, effort: "low" });
    writeFileSync(join(other.worktreePath, "release-mixed-test"), "release");
    writeFileSync(join(h.engine.worktreePath, "release-mixed-test"), "release");
    await Promise.all([h.engine.settled(), other.settled()]);
    const codexSession = h.engine.latestSession("1")!, claudeSession = other.latestSession("1")!;
    expect(codexSession.agentId).toBe("codex"); expect(claudeSession.agentId).toBe("claude_code");
    expect(codexSession.sessionId).not.toBe(claudeSession.sessionId);
    expect(h.engine.worktreePath).not.toBe(other.worktreePath);
    expect(readFileSync(join(h.engine.worktreePath, "codex-only.txt"), "utf8")).toBe("Codex work\n");
    expect(readFileSync(join(other.worktreePath, "claude-only.txt"), "utf8")).toBe("Claude work\n");
    expect(existsSync(join(other.worktreePath, "codex-only.txt"))).toBe(false);
    expect(existsSync(join(h.engine.worktreePath, "claude-only.txt"))).toBe(false);
    expect(other.record.settings.agentChoices).toEqual(claudeChoices);
    expect(h.engine.record.settings.agentChoices.codex).toEqual({ model: "gpt-6.1-sol", effort: "low" });
    expect(codexSession.effort).toBe("high"); expect(claudeSession.model).toBe("opus");
    expect(h.engine.outputLines(codexSession).some(line => line.source === "codex" && line.text === "Fixture final turn-1")).toBe(true);
    expect(other.outputLines(claudeSession).some(line => line.source === "claude" && line.text === "Claude-only result")).toBe(true);
    expect(h.engine.outputLines(codexSession).some(line => line.text.includes("Claude-only result"))).toBe(false);
    expect(other.outputLines(claudeSession).some(line => line.source === "codex")).toBe(false);
    expect(buildSnapshot(h.engine).needsYou?.agent).toBe("Codex");
    expect(buildSnapshot(other).needsYou?.agent).toBe("Claude Code");
    expect(h.claudeCalls()[0]?.cwd).toBe(other.worktreePath);
    expect(readPrdRecord(h.stateDirectory)?.settings.agentId).toBe("codex");
  } finally {
    if (existsSync(other.worktreePath)) writeFileSync(join(other.worktreePath, "release-mixed-test"), "release");
    if (existsSync(h.engine.worktreePath)) writeFileSync(join(h.engine.worktreePath, "release-mixed-test"), "release");
    await Promise.all([h.engine.settled(), other.settled()]); other.close();
  }
});


it("finishes already-merged Codex work before a final conversation, but never excuses missing recorded history", async () => {
  await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const count = f.calls().filter(call => call.method === "turn/start").length;
  const dir = join(h.engine.worktreePath, h.engine.paths.prdDirectoryFromRoot);
  const files = ["phase-1-return-intake.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"];
  for (const file of files) {
    const path = join(dir, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(/^(#.*)\n/, "$1\n**Closed:** 2026-10-24\n"));
  }
  git(h.sandbox, h.engine.worktreePath, "add", ...files.map(file => join(dir, file)));
  git(h.sandbox, h.engine.worktreePath, "commit", "-q", "-m", "feat(proof): finish merged work");
  git(h.sandbox, h.engine.worktreePath, "push", "-q", "origin", h.engine.record.settings.featureBranch);
  git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "--no-edit", h.engine.record.settings.featureBranch);
  git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  expect(h.engine.latestSession("pr")).toBeUndefined();
  await h.engine.checkAgain(); await h.engine.settled();
  expect(buildSnapshot(h.engine).feature.state).toBe("complete");
  expect(h.engine.record.mergedBranches?.[0]?.repository).toBe("acme-shop");
  expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(count);
  h.engine.record.phases.pr!.sessionIds.push("missing-recorded-final-session");
  expect((await h.engine.readWorkspaceEvidence("pr")).passed).toBe(false);
  expect(h.engine.stayedInWorkspace("never-recorded-phase").passed).toBe(false);
});
