import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { requireHistory } from "./ownership.js";

let sandbox: Sandbox;
afterEach(async () => { await sandbox?.cleanup(); });
it("requires usable exact-conversation messages and retains legacy/partial history and corruption rules", () => {
  sandbox = createSandbox();
  const id = randomUUID(); const directory = join(sandbox.env.CLAUDE_CONFIG_DIR!, "projects", "-disposable"); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${id}.jsonl`);
  const row = JSON.stringify({ type: "user", sessionId: id, message: { content: "Completed operation and checkpoint context" } }) + "\n";
  for (const bytes of ["{}\n", '{"type":"file-history-snapshot"}\n', '{"type":', JSON.stringify({ type: "user", sessionId: randomUUID(), message: { content: "Wrong conversation" } }) + "\n", "garbage\n", row + "garbage\n"]) {
    writeFileSync(file, bytes, { mode: 0o600 });
    expect(() => requireHistory(sandbox.env, id), bytes).toThrow(expect.objectContaining({ code: "history_unavailable" }));
  }
  for (const bytes of [row, row + '{"type":', JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Legacy checkpoint" }] } }) + '\n{"type":']) {
    writeFileSync(file, bytes);
    expect(() => requireHistory(sandbox.env, id), bytes).not.toThrow();
  }
});
