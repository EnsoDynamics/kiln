// Exploration script — not part of the main program.
// Runs one headless Claude Code session the way the Kiln v1 technical design
// says Kiln will ("Starting a phase's session", "Resuming"), and records every
// stream-json event with the time it arrived. Used by hand for proof gates 1
// and 2 (docs/design/kiln-architecture-proposal.md, "Proof gates"); kept so the
// Windows run of gate 1 in Phase 6 can repeat the same steps.
//
// Usage:
//   node scripts/exploration/proof-gate-session.mjs --cwd <dir> --out <file.jsonl>
//        (--session-id <uuid> | --resume <uuid>) --prompt <text | @file>
//        [--model opus] [--effort high] [--no-effort]
//        [--interrupt-on <tool name | 'text'>] [--interrupt-after-ms <n>]
//        [--sigint-group-on <tool name> [--sigint-delay-ms <n>]] [--keep-stdin-open]
//
// --interrupt-on Bash: once a top-level tool_use block named Bash arrives, write
//   the interrupt control request to stdin and close stdin (the Kiln stop path).
// --sigint-group-on Bash: send SIGINT to the session's whole process group instead (macOS and Linux only).
// Writes <out> (one {at, event} per stdout line) and <out>.meta.json (exit code,
// signal, timings, the command line).

import { spawn } from "node:child_process";
import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const cwd = opt("cwd");
const out = opt("out");
let prompt = opt("prompt");
if (!cwd || !out || !prompt) {
  console.error("needs --cwd, --out and --prompt");
  process.exit(2);
}
if (prompt.startsWith("@")) prompt = readFileSync(prompt.slice(1), "utf8");

const sessionId = opt("session-id");
const resume = opt("resume");
const model = opt("model") ?? "opus";
const effort = opt("effort") ?? "high";

const claudeArgs = ["-p", "--input-format", "stream-json"];
if (resume) claudeArgs.push("--resume", resume);
else claudeArgs.push("--session-id", sessionId ?? randomUUID());
claudeArgs.push("--model", model);
if (!flag("no-effort")) claudeArgs.push("--effort", effort);
claudeArgs.push(
  "--output-format", "stream-json", "--verbose", "--include-partial-messages",
  "--forward-subagent-text",
  "--permission-mode", "auto", "--permission-prompts", "none",
  "--disallowedTools", "PowerShell",
);

// A person's own terminal has none of the variables a parent Claude Code session sets.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key === "CLAUDE_PID" || key === "CLAUDE_EFFORT" || key === "AI_AGENT") delete env[key];
}

const started = new Date();
// On Windows claude is claude.cmd, which Node only starts through a shell; every argument here is a plain flag.
// It isn't detached there: a detached child on Windows gets a console of its own, and the
// claude.cmd it runs never reads the prompt (technical design, "Windows").
const windows = process.platform === "win32";
const child = spawn("claude", claudeArgs, { cwd, env, detached: !windows, windowsHide: true, shell: windows, stdio: ["pipe", "pipe", "pipe"] });
const log = createWriteStream(out);
const errLog = createWriteStream(`${out}.stderr`);
const meta = { command: ["claude", ...claudeArgs], cwd, startedAt: started.toISOString(), pid: child.pid };

child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");

const interruptOn = opt("interrupt-on");
const sigintOn = opt("sigint-group-on");
const interruptAfter = opt("interrupt-after-ms");
let stopSent = false;

function sendInterrupt(reason) {
  if (stopSent) return;
  stopSent = true;
  meta.interruptSentAt = new Date().toISOString();
  meta.interruptReason = reason;
  child.stdin.write(JSON.stringify({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } }) + "\n");
  child.stdin.end();
}
function sendSigint(reason) {
  if (stopSent) return;
  stopSent = true;
  meta.sigintSentAt = new Date().toISOString();
  meta.sigintReason = reason;
  process.kill(-child.pid, "SIGINT");
}
if (interruptAfter) setTimeout(() => sendInterrupt(`after ${interruptAfter} ms`), Number(interruptAfter));

let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    const at = new Date().toISOString();
    let event;
    try { event = JSON.parse(line); } catch { event = { unparsed: line }; }
    log.write(JSON.stringify({ at, event }) + "\n");
    if (event.type === "system" && event.subtype === "init") meta.init = { at, model: event.model, session_id: event.session_id, permissionMode: event.permissionMode, claude_code_version: event.claude_code_version };
    if (event.type === "assistant" && !event.parent_tool_use_id) {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use" && interruptOn === block.name) sendInterrupt(`tool_use ${block.name}`);
        if (block.type === "tool_use" && sigintOn === block.name) setTimeout(() => sendSigint(`tool_use ${block.name}`), Number(opt("sigint-delay-ms") ?? 0));
        if (block.type === "text" && interruptOn === "text") sendInterrupt("text");
      }
    }
    if (event.type === "result") {
      meta.result = { at, subtype: event.subtype, is_error: event.is_error, result: event.result };
      if (!flag("keep-stdin-open")) child.stdin.end();
    }
  }
});
child.stderr.on("data", (chunk) => errLog.write(chunk));
child.stdin.on("error", () => {});
child.on("close", (code, signal) => {
  meta.endedAt = new Date().toISOString();
  meta.exitCode = code;
  meta.signal = signal;
  log.end();
  errLog.end();
  writeFileSync(`${out}.meta.json`, JSON.stringify(meta, null, 2) + "\n");
  console.log(JSON.stringify({ exitCode: code, signal, init: meta.init ?? null, result: meta.result?.subtype ?? null, interruptSentAt: meta.interruptSentAt, sigintSentAt: meta.sigintSentAt, startedAt: meta.startedAt, endedAt: meta.endedAt }));
});
