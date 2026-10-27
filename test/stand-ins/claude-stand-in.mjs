// A stand-in for the `claude` executable in Kiln's tests, not part of the main program. It
// reads the launch prompt from stdin the way Claude Code does with --input-format stream-json,
// writes stream-json events, and does real work in the worktree (Closed lines, commits, pushes,
// splits, pull requests) as its scenario says, so the engine's checks run against real Git.
//
// KILN_STANDIN_SCENARIO names a JSON file: { "sessions": [ { "actions": [ … ] }, … ] }; each
// launch takes the next session. Every launch is logged, with its arguments and prompt, to
// <scenario>.calls.jsonl, with its PATH. Actions:
//   { "skill": "enso-method:implement-from-requirements" }   a top-level Skill call
//   { "text": "Building phase 1." }                           an assistant text block
//   { "partial": "Buil" }                                     a partial-message delta (stream_event)
//   { "close": true }                                         Closed line on the prompt's phase doc
//   { "write": { "path": "src/a.txt", "content": "…" } }      a file in the worktree, relative to it; an absolute path is used as is
//   { "stage": "src/a.txt" }                                  a Bash call running git add on that path, without committing
//   { "commit": "feat: x" }                                   a Bash call running git add -A and git commit
//   { "push": true }                                          a Bash call running git push -u origin <branch>
//   { "split": [ { "id": "2a", "slug": "first", "title": "First" }, … ] }   splits the launched phase
//   { "openPullRequest": { "number": 7, "isDraft": false } }  adds a pull request to the gh stand-in's state; with
//                                                             "repository": "<name>", in that repository, its
//                                                             owner/name and base read from the prompt's list
//   { "addRepository": "<name>" }                             a Bash call running `kiln add-repository <name>`; its exit
//                                                             status and output go to <scenario>.add-repository.jsonl
// write, stage, commit and push take "repository": "<name>": they run in that repository's worktree,
// the folder of that name in the session's folder (a workspace), or else beside it.
//   { "bash": "<command>" }                                   a Bash call running the command with sh in the session's folder
//   { "powershell": "<command>" }                             a PowerShell tool call, run nowhere
//   { "stderr": "text" }                                      a line on stderr
//   { "waitForFile": "<path>" }                               blocks until the file exists
//   { "result": "final message" }                             the result event; then waits for stdin to close
//   { "exit": 0 }                                             the exit code (default 0)
//   { "work": "<command>" }                                   a foreground Bash call that runs until interrupted;
//                                                             with "ctrlCFile": "<path>", that file appearing is a Ctrl+C
//   { "touch": "<path>" }                                     creates the file, so a test knows the session got here
//   { "sleepFor": 300 }                                       waits that many milliseconds
//   { "replay": "proof-gate-1/<recording>.jsonl" }            every event a real session wrote, from test/fixtures/, but its init
//   { "refuse": { "rateLimitType": "five_hour", "resetsAt": <Unix seconds> } }
//                                                             a request refused by a usage limit, as the Agent SDK types it:
//                                                             the rejected rate_limit_event, the synthetic assistant message
//                                                             with error "rate_limit", and an error result; a null field is left out
// A session may also say { "noInit": true }: a resume whose transcript is gone, as proof gate 1
// recorded it (no init, one error result, the same line on stderr, exit 1), and
// { "ignoreInterrupt": true }: the interrupt request and SIGINT are ignored, so only a forced
// end stops it, and { "noTranscript": true }: no transcript is kept, as with Claude Code's
// CLAUDE_CODE_SKIP_PROMPT_HISTORY.
//
// Like Claude Code, a session keeps its transcript in <CLAUDE_CONFIG_DIR>/projects/<folder>/<id>.jsonl:
// each tool call an assistant record and its result a user record, with timestamp, cwd and
// sessionId. A resumed session appends to the file it already has. Replayed events aren't added.
//
// The interrupt control request on stdin, or SIGINT, ends the turn the way proof gate 1 recorded
// it: the running tool's result "The user doesn't want to proceed with this tool use", the text
// "[Request interrupted by user for tool use]", a result with subtype error_during_execution,
// and exit code 1 for the request, 0 for SIGINT.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
// Billing contract qualification is passive and never consumes a scenario.
if (args[0] === "--version") { while (process.env.KILN_STANDIN_VERSION_WAIT && !existsSync(process.env.KILN_STANDIN_VERSION_WAIT)) await new Promise(resolve => setTimeout(resolve, 25)); process.stdout.write(`${process.env.KILN_STANDIN_VERSION ?? "2.1.299-stand-in"}\n`); process.exit(0); }
const scenarioPath = process.env.KILN_STANDIN_SCENARIO;
// The session's git calls are the session's, not Kiln's: they stay out of the harness's log of Kiln's.
delete process.env.GIT_TRACE2_EVENT;

// Kiln's helper calls, which aren't sessions and take no scenario: the account, `/usage` and
// the Agent SDK's model list. Each is logged with its working directory to
// <scenario>.helpers.jsonl. KILN_STANDIN_ACCOUNT names a JSON file to print for
// `auth status --json`; KILN_STANDIN_MODELS one holding { "models": [ … ] } or { "fail": "…" }.
// Without them, the account is signed in on a Max plan and the usage and models are proof
// gate 1's recordings.
const fixtures = fileURLToPath(new URL("../fixtures/proof-gate-1/", import.meta.url));
const logHelper = (kind) => scenarioPath && appendFileSync(`${scenarioPath}.helpers.jsonl`, `${JSON.stringify({ kind, args, cwd: process.cwd() })}\n`);
const isSession = args.includes("--session-id") || args.includes("--resume");
if (args[0] === "auth" && args[1] === "status") {
  logHelper("account");
  const account = process.env.KILN_STANDIN_ACCOUNT;
  process.stdout.write(account ? readFileSync(account, "utf8") : JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "alex@acme-shop.dev", subscriptionType: "max" }));
  process.stdout.write("", () => process.exit(0));
  await new Promise(() => {});
}
if (!isSession && args[0] === "-p" && args[1] === "/usage") {
  logHelper("usage");
  while (process.env.KILN_STANDIN_USAGE_WAIT && !existsSync(process.env.KILN_STANDIN_USAGE_WAIT)) await new Promise(resolve => setTimeout(resolve, 25));
  process.stdout.write(readFileSync(process.env.KILN_STANDIN_USAGE ?? join(fixtures, "usage-report-idle.jsonl"), "utf8"), () => process.exit(0));
  await new Promise(() => {});
}
if (!isSession && args.includes("--input-format")) {
  logHelper(args.includes("--setting-sources=user,project,local") ? "skills" : "models");
  const modelsPath = process.env.KILN_STANDIN_MODELS;
  const answer = modelsPath ? JSON.parse(readFileSync(modelsPath, "utf8")) : { models: JSON.parse(readFileSync(join(fixtures, "supported-models.json"), "utf8")).models };
  if (answer.fail) {
    process.stderr.write(`${answer.fail}\n`);
    process.stderr.write("", () => process.exit(1));
    await new Promise(() => {});
  }
  // The Agent SDK's initialize request; its answer carries the model list, as Claude Code's does.
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const message = line.trim() ? JSON.parse(line) : undefined;
      if (message?.type === "control_request" && message.request?.subtype === "initialize") {
        const supplied = process.env.KILN_STANDIN_COMMANDS ? JSON.parse(readFileSync(process.env.KILN_STANDIN_COMMANDS, "utf8")) : undefined;
        const names = supplied ? (Array.isArray(supplied) ? supplied : supplied[process.cwd()] ?? []) : readdirSync(join(process.env.CLAUDE_CONFIG_DIR, "skills"));
        const response = { commands: names.map(name => ({ name, description: "Kiln test skill", argumentHint: "" })), agents: [], output_style: "default", available_output_styles: ["default"], models: answer.models, account: {} };
        process.stdout.write(`${JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response } })}\n`);
      }
    }
  });
  process.stdin.on("end", () => process.exit(0));
  await new Promise(() => {});
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sessionId = flag("--session-id") ?? flag("--resume");
const model = args[args.indexOf("--model") + 1];
const emit = (event) => process.stdout.write(`${JSON.stringify({ session_id: sessionId, ...event })}\n`);
// The worktree an action works in: the session's folder, or a repository's worktree in or beside it.
const worktreeOf = (repository) => {
  if (!repository) return process.cwd();
  const inside = join(process.cwd(), repository);
  return existsSync(inside) ? inside : join(dirname(process.cwd()), repository);
};
const git = (...gitArgs) => gitIn(process.cwd(), ...gitArgs);
const gitIn = (cwd, ...gitArgs) => execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let toolId = 0;
const transcriptPath = () => {
  const projects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  const existing = existsSync(projects) ? readdirSync(projects).map((name) => join(projects, name, `${sessionId}.jsonl`)).find((file) => existsSync(file)) : undefined;
  return existing ?? join(projects, process.cwd().replace(/[^A-Za-z0-9]/g, "-"), `${sessionId}.jsonl`);
};
const keepRecord = (type, message) => {
  if (session?.noTranscript || !sessionId) return;
  const path = transcriptPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ type, sessionId, timestamp: new Date().toISOString(), cwd: process.cwd(), message })}\n`);
};
const toolCall = (name, input) => {
  const id = `toolu_stand_in_${process.pid}_${++toolId}`;
  const message = { model: "claude-opus-5-5", content: [{ type: "tool_use", id, name, input }] };
  keepRecord("assistant", message);
  emit({ type: "assistant", parent_tool_use_id: null, message });
  return id;
};
const toolResult = (id, content, isError = false) => {
  const message = { content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] };
  keepRecord("user", message);
  emit({ type: "user", parent_tool_use_id: null, message });
};

let stdinText = "";
let stdinClosed = false;
let interruptBy;
let onInterrupt = () => {};
// Claude Code stops the tool it was running when the turn is interrupted.
let onInterruptCleanup = () => {};
const interrupt = (by) => {
  if (interruptBy !== undefined || session?.ignoreInterrupt) return;
  interruptBy = by;
  onInterrupt();
};
let session;
// On Windows writes to a pipe are asynchronous, so exiting at once can lose the last events;
// the stand-in exits only once stdout and stderr have flushed, as Claude Code's own output does.
const exitAfterFlush = (code) =>
  new Promise(() => process.stdout.write("", () => process.stderr.write("", () => process.exit(code))));
const firstLine = new Promise((resolve) => {
  process.stdin.on("data", (chunk) => {
    stdinText += chunk.toString("utf8");
    const lines = stdinText.split("\n");
    if (lines.length > 1) resolve(lines[0]);
    for (const line of lines.slice(1, -1)) {
      if (line.includes('"control_request"') && line.includes('"interrupt"')) interrupt("request");
    }
  });
  process.stdin.on("end", () => {
    stdinClosed = true;
    resolve(stdinText);
  });
});
const stdinEnd = new Promise((resolve) => process.stdin.on("end", resolve));
process.on("SIGINT", () => interrupt("sigint"));

const inputLine = await firstLine;
if (!inputLine) process.exit(0); // Empty-stdin pre-dispatch refusal has no model turn.
const message = JSON.parse(inputLine);
const prompt = message?.message?.content ?? "";
const isAudit = /^Run (Delivery audit|Test audit) on the whole governing PRD/.test(prompt) || /Carry on with the assigned (Delivery audit|Test audit),/.test(prompt);
const counterPath = `${scenarioPath}.${isAudit ? "audit-" : ""}count`;
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
appendFileSync(`${scenarioPath}.calls.jsonl`, `${JSON.stringify({ args, cwd: process.cwd(), prompt, path: process.env.PATH ?? process.env.Path })}\n`);
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
session = (isAudit ? scenario.auditSessions?.[index] ?? { actions: [{ auditReport: {} }, { result: "Audit recorded." }, { exit: 0 }] } : scenario.sessions[index]) ?? { actions: [{ result: "No scenario for this launch." }, { exit: 1 }] };

if (session.noInit) {
  const error = `No conversation found with session ID: ${sessionId}`;
  emit({ type: "result", subtype: "error_during_execution", is_error: true, errors: [error] });
  process.stderr.write(`${error}\n`);
  await exitAfterFlush(1);
}

// A resumed session's prompt names its phase doc as "Carry on with `…`" and no branch: the
// session already knows its branch, so the stand-in reads the one checked out.
const phaseDoc = /implement `([^`]+)`/.exec(prompt)?.[1] ?? /Carry on with `([^`]+)`/.exec(prompt)?.[1];
const branch = /on branch `([^`]+)`/.exec(prompt)?.[1] ?? /from `([^`]+)` into/.exec(prompt)?.[1] ?? currentBranch();
function currentBranch() {
  try {
    return git("symbolic-ref", "--short", "HEAD").trim();
  } catch {
    // A session in a workspace folder, which isn't a checkout.
    return undefined;
  }
}

// An alias resolves to its concrete model, as in proof gate 1's model list.
const concrete = { opus: "claude-opus-5-5", fable: "claude-fable-5-1", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };
emit({ type: "system", subtype: "init", model: concrete[model] ?? model, permissionMode: "auto", claude_code_version: "2.1.299-stand-in" });
// Claude Code records the prompt as the session's first record, so every session that started has a transcript.
keepRecord("user", { role: "user", content: prompt });

let exitCode = 0;
let resultSent = false;
const endInterrupted = (toolUseId) => {
  onInterruptCleanup();
  if (toolUseId) toolResult(toolUseId, "The user doesn't want to proceed with this tool use. The tool use was rejected.", true);
  emit({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "text", text: "[Request interrupted by user for tool use]" }] } });
  emit({ type: "result", subtype: "error_during_execution", is_error: true });
  return exitAfterFlush(interruptBy === "sigint" ? 0 : 1);
};
for (const action of session.actions) {
  if (interruptBy !== undefined) await endInterrupted();
  if (action.work) {
    const id = toolCall("Bash", { command: action.work });
    // The running tool is a real child process, as Claude Code's Bash tool is; its PID is
    // written to KILN_STANDIN_TOOL_PID_FILE when set, so a test can see it is ended too.
    const tool = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    if (process.env.KILN_STANDIN_TOOL_PID_FILE) writeFileSync(process.env.KILN_STANDIN_TOOL_PID_FILE, String(tool.pid));
    onInterruptCleanup = () => tool.kill();
    await new Promise((resolve) => {
      onInterrupt = resolve;
      if (interruptBy !== undefined) resolve();
      // Gives up once the test's sandbox is gone, so a failed test leaves no process behind.
      // A ctrlCFile that appears is the console's Ctrl+C, for Windows, where Node can't send SIGINT.
      setInterval(() => {
        if (!existsSync(scenarioPath)) process.exit(1);
        if (action.ctrlCFile && existsSync(action.ctrlCFile)) interrupt("sigint");
      }, 200);
    });
    await endInterrupted(id);
  } else if (action.touch) {
    writeFileSync(action.touch, "");
  } else if (action.sleepFor) {
    await new Promise((resolve) => setTimeout(resolve, action.sleepFor));
  } else if (action.auditReport) {
    const {auditReportFixture} = await import('./audit-report-fixture.mjs');
    const auditPrompt = prompt.includes('Pinned CLI:') ? prompt : readFileSync(`${scenarioPath}.calls.jsonl`, 'utf8').trim().split('\n').map(line=>JSON.parse(line)).find(call=>call.args.includes(sessionId)&&call.prompt.includes('Pinned CLI:')).prompt;
    await auditReportFixture({prompt:auditPrompt,sessionId,transcriptPath,toolCall,toolResult,behavior:action.auditReport});
  } else if (action.skill) {
    const id = toolCall("Skill", { skill: action.skill });
    toolResult(id, `Launching skill: ${action.skill}`);
  } else if (action.partial) {
    emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: action.partial } } });
  } else if (action.text) {
    emit({ type: "assistant", parent_tool_use_id: null, message: { model: "claude-opus-5-5", content: [{ type: "text", text: action.text }] } });
  } else if (action.close) {
    const path = join(process.cwd(), phaseDoc);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.splice(1, 0, "", "**Closed:** 2026-10-17");
    writeFileSync(path, lines.join("\n"));
    toolResult(toolCall("Edit", { file_path: path }), "Edited.");
  } else if (action.write) {
    const path = isAbsolute(action.write.path) ? action.write.path : join(worktreeOf(action.write.repository), action.write.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, action.write.content);
    toolResult(toolCall("Write", { file_path: path }), "Written.");
  } else if (action.stage) {
    toolResult(toolCall("Bash", { command: `git add ${action.stage}` }), gitIn(worktreeOf(action.repository), "add", "--", action.stage));
  } else if (action.commit) {
    const cwd = worktreeOf(action.repository);
    const id = toolCall("Bash", { command: `${action.repository ? `cd ${cwd} && ` : ""}git add -A && git commit -q -F - <<'EOF'\n${action.commit}\nEOF` });
    gitIn(cwd, "add", "-A");
    gitIn(cwd, "commit", "-q", "-m", action.commit);
    toolResult(id, gitIn(cwd, "log", "--oneline", "-1"));
  } else if (action.addRepository) {
    const id = toolCall("Bash", { command: `kiln add-repository ${action.addRepository}` });
    const run = spawnSync("kiln", ["add-repository", action.addRepository], { cwd: process.cwd(), encoding: "utf8", shell: process.platform === "win32" });
    // What the session was told, for a test to read.
    appendFileSync(`${scenarioPath}.add-repository.jsonl`, `${JSON.stringify({ name: action.addRepository, status: run.status, stdout: run.stdout, stderr: run.stderr })}\n`);
    toolResult(id, `${run.stdout ?? ""}${run.stderr ?? ""}`, run.status !== 0);
  } else if (action.push) {
    const cwd = worktreeOf(action.repository);
    const id = toolCall("Bash", { command: `${action.repository ? `cd ${cwd} && ` : ""}git push -u origin ${branch} 2>&1 | tail -3` });
    let output;
    try {
      output = execFileSync("git", ["push", "-q", "-u", "origin", branch], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      output = String(error.stderr);
    }
    toolResult(id, output || "pushed");
  } else if (action.split) {
    const path = join(process.cwd(), phaseDoc);
    const directory = dirname(path);
    const original = readFileSync(path, "utf8");
    const id = /phase-([^-]+)-/.exec(phaseDoc)[1];
    const rows = action.split.map((child) => `| [${child.id}](phase-${child.id}-${child.slug}.md) | ${child.title} |`).join("\n");
    const title = /^# (.*)$/m.exec(original)[1];
    writeFileSync(path, `# ${title} — split into ${action.split.map((child) => child.id).join(" and ")}\n\n## Split into\n\n| Phase | Title |\n|---|---|\n${rows}\n\n## Phase dependencies\nNone.\n`);
    for (const child of action.split) {
      writeFileSync(
        join(directory, `phase-${child.id}-${child.slug}.md`),
        `# Phase ${child.id}: ${child.title}\n${child.closed ? "\n**Closed:** 2026-10-17\n" : ""}\n## Acceptance criteria covered\n${child.criteria ?? "AC-RET-01"}\n\n## Phase dependencies\nNone.\n`,
      );
    }
    toolResult(toolCall("Write", { file_path: path }), `Split phase ${id}.`);
  } else if (action.openPullRequest) {
    const statePath = process.env.KILN_STANDIN_GH_STATE;
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { pulls: [] };
    // A resumed session's prompt doesn't name the base; the fixture's base is develop.
    const name = action.openPullRequest.repository;
    const listed = name ? new RegExp(`- \`${name}\` \\(\`([^\`]+)\`\\), worktree \`[^\`]+\`, into \`([^\`]+)\``).exec(prompt) : undefined;
    const repo = listed?.[1] ?? "acme/acme-shop";
    const base = listed?.[2] ?? /into `([^`]+)`/.exec(prompt)?.[1] ?? action.openPullRequest.base ?? "develop";
    state.pulls.push({
      repo,
      number: action.openPullRequest.number,
      title: action.openPullRequest.title ?? "Customer returns",
      url: `https://github.com/${repo}/pull/${action.openPullRequest.number}`,
      isDraft: action.openPullRequest.isDraft ?? false,
      isCrossRepository: false,
      headRefName: branch,
      baseRefName: base,
      additions: 120,
      deletions: 4,
      commits: [{ oid: "a" }, { oid: "b" }],
    });
    writeFileSync(statePath, JSON.stringify(state));
    toolResult(toolCall("Bash", { command: `gh pr create --repo github.com/${repo} --head ${branch} --base ${base}` }), state.pulls.at(-1).url);
  } else if (action.bash) {
    const id = toolCall("Bash", { command: action.bash });
    const run = spawnSync("sh", ["-c", action.bash], { cwd: process.cwd(), encoding: "utf8" });
    toolResult(id, `${run.stdout ?? ""}${run.stderr ?? ""}`, run.status !== 0);
  } else if (action.powershell) {
    toolResult(toolCall("PowerShell", { command: action.powershell }), "");
  } else if (action.stderr) {
    process.stderr.write(`${action.stderr}\n`);
  } else if (action.waitForFile) {
    // Gives up once the test's sandbox is gone, so a failed test leaves no process behind.
    while (!existsSync(action.waitForFile)) {
      if (!existsSync(scenarioPath)) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } else if (action.replay) {
    // The recording's own init is left out: the stand-in has sent one for this launch.
    const recording = readFileSync(fileURLToPath(new URL(`../fixtures/${action.replay}`, import.meta.url)), "utf8");
    for (const { event } of recording.trim().split("\n").map((line) => JSON.parse(line))) {
      if (event.type === "system" && event.subtype === "init") continue;
      emit({ ...event, session_id: sessionId });
      if (event.type === "result") resultSent = true;
    }
  } else if (action.refuse) {
    const info = Object.fromEntries(Object.entries({ status: "rejected", ...action.refuse }).filter(([, value]) => value !== null));
    emit({ type: "rate_limit_event", rate_limit_info: info });
    emit({ type: "assistant", parent_tool_use_id: null, error: "rate_limit", message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your limit" }] } });
    emit({ type: "result", subtype: "success", is_error: true, result: "You've hit your limit" });
    resultSent = true;
  } else if (action.result !== undefined) {
    emit({ type: "result", subtype: "success", is_error: false, result: action.result });
    resultSent = true;
  } else if (action.exit !== undefined) {
    exitCode = action.exit;
  }
}
// Claude Code keeps reading its input after a result; Kiln closes stdin and then it exits.
if (resultSent && !stdinClosed) await stdinEnd;
await exitAfterFlush(exitCode);
