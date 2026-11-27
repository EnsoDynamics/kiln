import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runKilnCommand } from "../kiln-command.js";
import { enumerateWork } from "../control/private-state.js";
import { createSandbox, createGithubOrigin, createRepository, commitFiles, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { waitFor } from "../test-support/engine-harness.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { inspectSource } from "./source.js";

let sandbox: Sandbox;
afterEach(async () => { await sandbox?.cleanup(); });

function repository() {
  sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "shop");
  const path = createRepository(sandbox, "shop", origin.url);
  git(sandbox, path, "push", "-qu", "origin", "develop");
  return path;
}

it("selects committed intake and planned rows and explains missing, dirty and consumed material", async () => {
  const repo = repository();
  const source = "source-material/boxes";
  const initiative = "docs/initiatives/shifts";
  const list = "shifts-initiative-prds.md";
  const row = "| 1 | [Count boxes](contracts.md#count-boxes) | none | planned |";
  const inspect = (path: string) => inspectSource({ git: "git", env: sandbox.env }, repo, path);
  expect(await inspect(source)).toMatchObject({ problem: expect.stringContaining("boxes-brief.md") });
  commitFiles(sandbox, repo, source, { "boxes-requirements-intake.md": "# Requirements intake: Boxes\n" });
  expect(await inspect(source)).toMatchObject({ origin: { title: "Boxes", kind: "intake", files: [source + "/boxes-requirements-intake.md"] } });
  commitFiles(sandbox, repo, initiative, { [list]: "# Shifts Initiative PRDs\n" + row, "contracts.md": "## Count boxes\n**PRD directory, when written:** `docs/prds/box-count`\n" });
  expect(await inspect(initiative)).toMatchObject({ problem: expect.stringContaining("box-count") });
  expect(await inspect(initiative + "/box-count")).toMatchObject({ origin: { kind: "planned_prd", files: [initiative + "/" + list, initiative + "/contracts.md"] } });
  writeFileSync(join(repo, initiative, list), row + "\n| 2 | new-prd | none | planned |\n");
  expect(await inspect(initiative + "/new-prd")).toMatchObject({ problem: expect.stringContaining(list) });
  commitFiles(sandbox, repo, "docs/prds/boxes", { "boxes-prd.md": "# Boxes" });
  expect(await inspect(source)).toMatchObject({ problem: expect.stringContaining("docs/prds/boxes was written") });
});

it("opens a committed brief through kiln run and reports its identity through kiln status before Start", async () => {
  const repo = repository();
  const source = "source-material/boxes";
  commitFiles(sandbox, repo, source, { "boxes-brief.md": "# Brief: Shift counter\n", "prototype.html": "<h1>Count</h1>" });
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  const env = { ...sandbox.env, PATH: bin + delimiter + (sandbox.env.PATH ?? ""), KILN_PORT_RANGE: await reservePortRange() };
  const signals = new EventEmitter();
  let output = "", address = "", code: number | undefined;
  const context = { cwd: repo, env, stdout: { write: (s: string) => output += s }, stderr: { write: (s: string) => output += s }, signals };
  const run = runKilnCommand(["run", source], { ...context, openBrowser: async url => { address = url; return { kind: "opened" }; } }).then(result => code = result);
  try {
    await waitFor(() => !!address || code !== undefined);
    expect(address, output).toMatch(/\/boxes\/?$/);
    const [work] = enumerateWork(env).work;
    expect(work?.record.origin).toMatchObject({ title: "Shift counter", files: [source + "/boxes-brief.md", source + "/prototype.html"], commit: git(sandbox, repo, "rev-parse", "develop").trim() });
    expect(work?.record.prdDirectory).toBeUndefined();
    expect(git(sandbox, repo, "branch", "--list", "feature/boxes")).toBe("");
    output = "";
    expect(await runKilnCommand(["status", source, "--json"], context)).toBe(0);
    expect(JSON.parse(output)).toMatchObject({ execution_id: work!.record.executionId, requirements: { origin: { kind: "brief" } } });
  } finally { if (code === undefined) signals.emit("SIGINT"); await run; }
});
