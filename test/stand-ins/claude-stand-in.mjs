// A stand-in for the `claude` executable in Kiln's tests, not part of the main program. It
// reads the launch prompt from stdin the way Claude Code does with --input-format stream-json,
// writes stream-json events, and does real work in the worktree (Closed lines, commits, pushes,
// splits, pull requests) as its scenario says, so the engine's checks run against real Git.
//
// KILN_STANDIN_SCENARIO names a JSON file: { "sessions": [ { "actions": [ … ] }, … ] }; each
// launch takes the next session. Every launch is logged, with its arguments and prompt, to
// <scenario>.calls.jsonl. Actions:
//   { "skill": "enso-method:implement-from-requirements" }   a top-level Skill call
//   { "text": "Building phase 1." }                           an assistant text block
//   { "partial": "Buil" }                                     a partial-message delta (stream_event)
//   { "close": true }                                         Closed line on the prompt's phase doc
//   { "write": { "path": "src/a.txt", "content": "…" } }      a file in the worktree, relative to it
//   { "commit": "feat: x" }                                   a Bash call running git add -A and git commit
//   { "push": true }                                          a Bash call running git push -u origin <branch>
//   { "split": [ { "id": "2a", "slug": "first", "title": "First" }, … ] }   splits the launched phase
//   { "openPullRequest": { "number": 7, "isDraft": false } }  adds a pull request to the gh stand-in's state
//   { "stderr": "text" }                                      a line on stderr
//   { "waitForFile": "<path>" }                               blocks until the file exists
//   { "result": "final message" }                             the result event; then waits for stdin to close
//   { "exit": 0 }                                             the exit code (default 0)
//   { "work": "<command>" }                                   a foreground Bash call that runs until interrupted
//   { "touch": "<path>" }                                     creates the file, so a test knows the session got here
//   { "sleepFor": 300 }                                       waits that many milliseconds
// A session may also say { "noInit": true }: a resume whose transcript is gone, as proof gate 1
// recorded it (no init, one error result, the same line on stderr, exit 1), and
// { "ignoreInterrupt": true }: the interrupt request and SIGINT are ignored, so only a forced
// end stops it.
//
// The interrupt control request on stdin, or SIGINT, ends the turn the way proof gate 1 recorded
// it: the running tool's result "The user doesn't want to proceed with this tool use", the text
// "[Request interrupted by user for tool use]", a result with subtype error_during_execution,
// and exit code 1 for the request, 0 for SIGINT.

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const scenarioPath = process.env.KILN_STANDIN_SCENARIO;
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sessionId = flag("--session-id") ?? flag("--resume");
const model = args[args.indexOf("--model") + 1];
const emit = (event) => process.stdout.write(`${JSON.stringify({ session_id: sessionId, ...event })}\n`);
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let toolId = 0;
const toolCall = (name, input) => {
  const id = `toolu_stand_in_${++toolId}`;
  emit({ type: "assistant", parent_tool_use_id: null, message: { model: "claude-opus-5-5", content: [{ type: "tool_use", id, name, input }] } });
  return id;
};
const toolResult = (id, content, isError = false) =>
  emit({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } });

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

const message = JSON.parse((await firstLine) || "{}");
const prompt = message?.message?.content ?? "";
const counterPath = `${scenarioPath}.count`;
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
appendFileSync(`${scenarioPath}.calls.jsonl`, `${JSON.stringify({ args, cwd: process.cwd(), prompt })}\n`);
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
session = scenario.sessions[index] ?? { actions: [{ result: "No scenario for this launch." }, { exit: 1 }] };

if (session.noInit) {
  const error = `No conversation found with session ID: ${sessionId}`;
  emit({ type: "result", subtype: "error_during_execution", is_error: true, errors: [error] });
  process.stderr.write(`${error}\n`);
  await exitAfterFlush(1);
}

// A resumed session's prompt names its phase doc as "Carry on with `…`" and no branch: the
// session already knows its branch, so the stand-in reads the one checked out.
const phaseDoc = /implement `([^`]+)`/.exec(prompt)?.[1] ?? /Carry on with `([^`]+)`/.exec(prompt)?.[1];
const branch = /on branch `([^`]+)`/.exec(prompt)?.[1] ?? /from `([^`]+)` into/.exec(prompt)?.[1] ?? git("symbolic-ref", "--short", "HEAD").trim();

emit({ type: "system", subtype: "init", model: model === "opus" ? "claude-opus-5-5" : model, permissionMode: "auto", claude_code_version: "2.1.299-stand-in" });

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
      setInterval(() => existsSync(scenarioPath) || process.exit(1), 200);
    });
    await endInterrupted(id);
  } else if (action.touch) {
    writeFileSync(action.touch, "");
  } else if (action.sleepFor) {
    await new Promise((resolve) => setTimeout(resolve, action.sleepFor));
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
    const path = join(process.cwd(), action.write.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, action.write.content);
    toolResult(toolCall("Write", { file_path: path }), "Written.");
  } else if (action.commit) {
    const id = toolCall("Bash", { command: `git add -A && git commit -q -F - <<'EOF'\n${action.commit}\nEOF` });
    git("add", "-A");
    git("commit", "-q", "-m", action.commit);
    toolResult(id, git("log", "--oneline", "-1"));
  } else if (action.push) {
    const id = toolCall("Bash", { command: `git push -u origin ${branch} 2>&1 | tail -3` });
    let output;
    try {
      output = execFileSync("git", ["push", "-q", "-u", "origin", branch], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
        `# Phase ${child.id}: ${child.title}\n${child.closed ? "\n**Closed:** 2026-10-17\n" : ""}\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\nNone.\n`,
      );
    }
    toolResult(toolCall("Write", { file_path: path }), `Split phase ${id}.`);
  } else if (action.openPullRequest) {
    const statePath = process.env.KILN_STANDIN_GH_STATE;
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { pulls: [] };
    // A resumed session's prompt doesn't name the base; the fixture's base is develop.
    const base = /into `([^`]+)`/.exec(prompt)?.[1] ?? action.openPullRequest.base ?? "develop";
    state.pulls.push({
      number: action.openPullRequest.number,
      title: action.openPullRequest.title ?? "Customer returns",
      url: `https://github.com/acme/acme-shop/pull/${action.openPullRequest.number}`,
      isDraft: action.openPullRequest.isDraft ?? false,
      isCrossRepository: false,
      headRefName: branch,
      baseRefName: base,
      additions: 120,
      deletions: 4,
      commits: [{ oid: "a" }, { oid: "b" }],
    });
    writeFileSync(statePath, JSON.stringify(state));
    toolResult(toolCall("Bash", { command: `gh pr create --repo github.com/acme/acme-shop --head ${branch} --base ${base}` }), state.pulls.at(-1).url);
  } else if (action.stderr) {
    process.stderr.write(`${action.stderr}\n`);
  } else if (action.waitForFile) {
    // Gives up once the test's sandbox is gone, so a failed test leaves no process behind.
    while (!existsSync(action.waitForFile)) {
      if (!existsSync(scenarioPath)) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
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
