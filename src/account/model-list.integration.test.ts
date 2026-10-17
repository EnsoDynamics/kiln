// The model list through the real Agent SDK, against the stand-in claude, which answers the
// SDK's initialize request the way Claude Code does (recorded in proof gate 1).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { readModelList } from "./model-list.js";

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

function setUp() {
  sandbox = createSandbox();
  const { claude } = installStandIns(join(sandbox.root, "bin"));
  const scenario = join(sandbox.root, "scenario.json");
  writeFileSync(scenario, JSON.stringify({ sessions: [] }));
  return { claude, env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario }, cwd: sandbox.root };
}

describe("reading Claude Code's model list", () => {
  it("returns the family-alias entries from the person's own claude, with no prompt sent", async () => {
    const { claude, env, cwd } = setUp();
    const result = await readModelList({ claude, env, cwd });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.models.map((model) => model.displayName)).toEqual(["Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 5.5"]);
  });

  it("gives the child's own error when the list can't be read", async () => {
    const { claude, env, cwd } = setUp();
    const failing = join(cwd, "models.json");
    writeFileSync(failing, JSON.stringify({ fail: "Error: not authorized to list models" }));
    const result = await readModelList({ claude, env: { ...env, KILN_STANDIN_MODELS: failing }, cwd, timeoutMs: 20_000 });
    expect(result).toEqual({ ok: false, error: "Error: not authorized to list models" });
  });

  it("gives up after its timeout", async () => {
    const { env, cwd } = setUp();
    const silent = join(cwd, process.platform === "win32" ? "silent.cmd" : "silent");
    writeFileSync(silent, process.platform === "win32" ? `@"${process.execPath}" -e "setTimeout(() => {}, 60000)"\r\n` : `#!/bin/sh\nexec "${process.execPath}" -e "setTimeout(() => {}, 60000)"\n`, { mode: 0o755 });
    const result = await readModelList({ claude: silent, env, cwd, timeoutMs: 1_000 });
    expect(result).toEqual({ ok: false, error: "timed out after 1 seconds" });
  });
});
