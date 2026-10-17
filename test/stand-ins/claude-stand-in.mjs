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

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const scenarioPath = process.env.KILN_STANDIN_SCENARIO;
const sessionId = args[args.indexOf("--session-id") + 1] ?? args[args.indexOf("--resume") + 1];
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
const firstLine = new Promise((resolve) => {
  process.stdin.on("data", (chunk) => {
    stdinText += chunk.toString("utf8");
    if (stdinText.includes("\n")) resolve(stdinText.slice(0, stdinText.indexOf("\n")));
  });
  process.stdin.on("end", () => {
    stdinClosed = true;
    resolve(stdinText);
  });
});
const stdinEnd = new Promise((resolve) => process.stdin.on("end", resolve));

const message = JSON.parse((await firstLine) || "{}");
const prompt = message?.message?.content ?? "";
const counterPath = `${scenarioPath}.count`;
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
appendFileSync(`${scenarioPath}.calls.jsonl`, `${JSON.stringify({ args, cwd: process.cwd(), prompt })}\n`);
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const session = scenario.sessions[index] ?? { actions: [{ result: "No scenario for this launch." }, { exit: 1 }] };

const phaseDoc = /implement `([^`]+)`/.exec(prompt)?.[1];
const branch = /on branch `([^`]+)`/.exec(prompt)?.[1] ?? /from `([^`]+)` into/.exec(prompt)?.[1];

emit({ type: "system", subtype: "init", model: model === "opus" ? "claude-opus-5-5" : model, permissionMode: "auto", claude_code_version: "2.1.299-stand-in" });

let exitCode = 0;
let resultSent = false;
for (const action of session.actions) {
  if (action.skill) {
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
    const base = /into `([^`]+)`/.exec(prompt)?.[1];
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
process.exit(exitCode);
