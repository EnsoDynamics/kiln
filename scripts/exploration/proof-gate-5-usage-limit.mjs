// Exploration script — not part of the main program.
// Records proof gate 5 of the Kiln usage-limit recovery technical design
// (docs/changes/kiln-usage-limit-recovery/technical-design.md, "Testing Approach"):
//   (1) a headless request refused by a usage limit, saved whole, and whether its transcript exists;
//   (2) straight after, `claude auth status --json` and `/usage` as Kiln runs them;
//   (3) a session started under one account resumed under another (two CLAUDE_CONFIG_DIRs).
// `/usage` and `auth status` are answered locally and spend no usage; item 1 sends one "Say hi".
//
// Usage:
//   node scripts/exploration/proof-gate-5-usage-limit.mjs --capture
//        Items 1 and 2 now, into test/fixtures/proof-gate-5/.
//   node scripts/exploration/proof-gate-5-usage-limit.mjs --watch [--every-min 5] [--until <ISO time>]
//        Reads /usage every few minutes; the first time any row reads 100%, runs --capture and exits.
//        Without --until, gives up at the 5-hour row's reset.
//   node scripts/exploration/proof-gate-5-usage-limit.mjs --switch-account --config-a <dir> --config-b <dir>
//        Item 3. Sign each directory in to a different account first:
//        CLAUDE_CONFIG_DIR=<dir> claude auth login
//
// Account emails and organization IDs are saved as short hashes, so the fixtures can be committed
// and two readings of one account still compare equal.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const fixtures = resolve(import.meta.dirname, "../../test/fixtures/proof-gate-5");

// A person's own terminal has none of the variables a parent Claude Code session sets.
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key === "CLAUDE_PID" || key === "CLAUDE_EFFORT" || key === "AI_AGENT") delete env[key];
  }
  return { ...env, ...extra };
}

/** Runs claude, recording every stdout line with the time it arrived. */
function run(claudeArgs, { cwd, env }) {
  return new Promise((done) => {
    const startedAt = new Date().toISOString();
    const child = spawn("claude", claudeArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    let stderr = "";
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) lines.push({ at: new Date().toISOString(), line });
      }
    });
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("close", (exitCode, signal) => {
      if (buffer.trim()) lines.push({ at: new Date().toISOString(), line: buffer });
      done({ command: ["claude", ...claudeArgs], cwd, startedAt, endedAt: new Date().toISOString(), exitCode, signal, lines, stderr });
    });
  });
}

const hash = (value) => (typeof value === "string" ? `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}` : value);

function redactAuth(stdout) {
  try {
    const status = JSON.parse(stdout);
    for (const key of ["email", "orgId", "orgName"]) if (key in status) status[key] = hash(status[key]);
    return JSON.stringify(status, null, 2) + "\n";
  } catch {
    return stdout;
  }
}

function save(dir, name, result) {
  writeFileSync(join(dir, `${name}.jsonl`), result.lines.map(({ at, line }) => {
    let event;
    try { event = JSON.parse(line); } catch { event = { unparsed: line }; }
    return JSON.stringify({ at, event });
  }).join("\n") + "\n");
  const { stderr, ...meta } = result;
  delete meta.lines;
  writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
  if (stderr) writeFileSync(join(dir, `${name}.stderr`), stderr);
}

function findTranscript(sessionId, configDir = join(homedir(), ".claude")) {
  const projects = join(configDir, "projects");
  if (!existsSync(projects)) return undefined;
  for (const folder of readdirSync(projects)) {
    const file = join(projects, folder, `${sessionId}.jsonl`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

async function readUsage(cwd, env) {
  const [auth, usage] = await Promise.all([
    run(["auth", "status", "--json"], { cwd, env }),
    run(["-p", "/usage", "--output-format", "stream-json", "--verbose", "--no-session-persistence"], { cwd, env }),
  ]);
  const report = usage.lines.map(({ line }) => { try { return JSON.parse(line); } catch { return {}; } }).find((event) => event.usage_report)?.usage_report;
  return { auth, usage, limits: report?.rate_limits?.limits ?? [] };
}

async function capture() {
  mkdirSync(fixtures, { recursive: true });
  const env = cleanEnv();
  const project = mkdtempSync(join(tmpdir(), "kiln-gate-5-"));

  // (1) The refused request.
  const sessionId = randomUUID();
  const refused = await run(["-p", "Say hi", "--session-id", sessionId, "--output-format", "stream-json", "--verbose"], { cwd: project, env });
  const transcript = findTranscript(sessionId);
  refused.transcriptFound = transcript !== undefined;
  save(fixtures, "refused-request", refused);

  // (2) Straight after: the account and the limits, as Kiln reads them.
  const reading = await readUsage(project, env);
  writeFileSync(join(fixtures, "auth-status-after-refusal.json"), redactAuth(reading.auth.lines.map(({ line }) => line).join("\n")));
  save(fixtures, "usage-after-refusal", reading.usage);

  const events = refused.lines.map(({ line }) => { try { return JSON.parse(line); } catch { return {}; } });
  const rateLimits = events.filter((event) => event.type === "rate_limit_event").map((event) => event.rate_limit_info);
  console.log(JSON.stringify({
    sessionId,
    exitCode: refused.exitCode,
    rateLimitEvents: rateLimits,
    syntheticRateLimitMessage: events.some((event) => event.type === "assistant" && event.error === "rate_limit"),
    result: events.find((event) => event.type === "result")?.subtype ?? null,
    transcriptFound: refused.transcriptFound,
    usageAfter: reading.limits.map((row) => ({ kind: row.kind, percent: row.percent, resets_at: row.resets_at })),
  }, null, 2));
}

async function watch() {
  const everyMs = Number(opt("every-min") ?? 5) * 60_000;
  const env = cleanEnv();
  const cwd = mkdtempSync(join(tmpdir(), "kiln-gate-5-watch-"));
  let until = opt("until") ? new Date(opt("until")) : undefined;
  for (;;) {
    const { limits } = await readUsage(cwd, env);
    const at100 = limits.filter((row) => typeof row.percent === "number" && row.percent >= 100);
    console.log(`${new Date().toISOString()} ${limits.map((row) => `${row.kind} ${row.percent}%`).join(", ")}`);
    if (at100.length > 0) return capture();
    if (!until) {
      const session = limits.find((row) => row.kind === "session");
      if (session?.resets_at) until = new Date(session.resets_at);
    }
    if (until && Date.now() + everyMs > until.getTime()) {
      console.log(`No limit reached before ${until.toISOString()}; nothing captured.`);
      process.exit(3);
    }
    await new Promise((wake) => setTimeout(wake, everyMs));
  }
}

async function switchAccount() {
  const configA = opt("config-a");
  const configB = opt("config-b");
  if (!configA || !configB) {
    console.error("needs --config-a and --config-b, each signed in to a different account");
    process.exit(2);
  }
  mkdirSync(fixtures, { recursive: true });
  const project = mkdtempSync(join(tmpdir(), "kiln-gate-5-switch-"));
  const envA = cleanEnv({ CLAUDE_CONFIG_DIR: configA });
  const envB = cleanEnv({ CLAUDE_CONFIG_DIR: configB });
  for (const [name, env] of [["a", envA], ["b", envB]]) {
    const auth = await run(["auth", "status", "--json"], { cwd: project, env });
    writeFileSync(join(fixtures, `switch-account-auth-${name}.json`), redactAuth(auth.lines.map(({ line }) => line).join("\n")));
  }

  const sessionId = randomUUID();
  const word = `heron-${randomUUID().slice(0, 4)}`;
  const first = await run(["-p", `Remember the word ${word}. Reply only "ok".`, "--session-id", sessionId, "--output-format", "stream-json", "--verbose"], { cwd: project, env: envA });
  save(fixtures, "switch-account-start-on-a", first);
  const from = findTranscript(sessionId, configA);
  if (!from) {
    console.error("no transcript under config A; stopping");
    process.exit(1);
  }
  const folder = join(configB, "projects", from.split("/").at(-2));
  mkdirSync(folder, { recursive: true });
  copyFileSync(from, join(folder, `${sessionId}.jsonl`));

  const resumed = await run(["-p", "What word did I ask you to remember? Reply with the word only.", "--resume", sessionId, "--output-format", "stream-json", "--verbose"], { cwd: project, env: envB });
  save(fixtures, "switch-account-resume-on-b", resumed);
  const answer = resumed.lines.map(({ line }) => { try { return JSON.parse(line); } catch { return {}; } }).find((event) => event.type === "result")?.result ?? "";
  console.log(JSON.stringify({ sessionId, word, resumedExitCode: resumed.exitCode, answer, carriedHistory: answer.includes(word) }, null, 2));
}

if (flag("watch")) await watch();
else if (flag("switch-account")) await switchAccount();
else if (flag("capture")) await capture();
else {
  console.error("needs --capture, --watch or --switch-account");
  process.exit(2);
}
