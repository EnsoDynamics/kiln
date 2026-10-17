// Exploration script — not part of the main program.
// Proof gate 1 (docs/design/kiln-architecture-proposal.md): asks the Agent SDK
// for the model list the way the Kiln v1 technical design says Kiln will
// ("Account and Usage", Models): against the person's own `claude`, from a
// neutral working directory, with no prompt sent, spawned detached. Records
// every message the child wrote, so a reader can see no model turn happened.
//
// Usage (from a folder where @anthropic-ai/claude-agent-sdk is installed):
//   node <this file> <path to claude executable> <out.json>

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
const { query } = await import(require.resolve("@anthropic-ai/claude-agent-sdk"));

const [claudePath, out] = process.argv.slice(2);
const cwd = mkdtempSync(join(tmpdir(), "kiln-models-"));
const spawned = [];
const childLines = [];

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key === "CLAUDE_PID" || key === "CLAUDE_EFFORT" || key === "AI_AGENT") delete env[key];
}

// eslint-disable-next-line require-yield -- never yields: the query sends no prompt
async function* noPrompt() {
  await new Promise(() => {});
}

const started = Date.now();
const q = query({
  prompt: noPrompt(),
  options: {
    pathToClaudeCodeExecutable: claudePath,
    cwd,
    persistSession: false,
    env,
    spawnClaudeCodeProcess: ({ command, args, cwd: dir, env: childEnv, signal }) => {
      spawned.push({ command, args });
      const child = spawn(command, args, { cwd: dir, env: childEnv, signal, detached: true, stdio: ["pipe", "pipe", "pipe"] });
      let buffer = "";
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.trim()) childLines.push(line);
        }
      });
      return child;
    },
  },
});

let models;
let error;
try {
  models = await q.supportedModels();
} catch (e) {
  error = String(e);
}
const elapsedMs = Date.now() - started;
q.close();

const types = childLines.map((l) => {
  try { const o = JSON.parse(l); return `${o.type}${o.subtype ? ":" + o.subtype : ""}`; } catch { return "unparsed"; }
});
writeFileSync(out, JSON.stringify({ claudePath, spawned, elapsedMs, error, models, childMessageTypes: types }, null, 2) + "\n");
console.log(JSON.stringify({ elapsedMs, error, spawned: spawned.map((s) => s.command), modelCount: models?.length, childMessageTypes: [...new Set(types)] }));
process.exit(0);
