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

it("says which PRD was written from a row the method marked written, and matches a row without a directory line only through Kiln's record (AC-BEGIN-02, AC-HOME-02, AC-HOME-13)", async () => {
  const repo = repository();
  const initiative = "docs/initiatives/shifts";
  const inspect = (path: string) => inspectSource({ git: "git", env: sandbox.env }, repo, path);
  commitFiles(sandbox, repo, initiative, {
    "shifts-initiative-prds.md": "# Shifts Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Count boxes](c.md#count-boxes) | None | PRD written |\n| 2 | [Rotas](c.md#rotas) | None | planned |\n| 3 | [Swaps](c.md#swaps) | None | planned |\n| 4 | [Shifts core](c.md#shifts-core) | None | planned |\n| 5 | [Old rota](c.md#old-rota) | None | PRD written |\n",
    "c.md": "## Count boxes\n\n**PRD directory, when written:** `docs/changes/box-count`\n\n## Rotas\n\nNo directory yet.\n\n## Swaps\n\n**PRD directory, when written:** `docs/prds/swaps`\n\n## Shifts core\n\n**PRD directory, when written:** `docs/prds/shifts`\n\n## Old rota\n\n**PRD directory, when written:** `docs/prds/old-rota`\n",
  });
  commitFiles(sandbox, repo, "docs/changes/box-count", { "box-count-prd.md": "# PRD: Box count\n" });
  expect(await inspect(initiative + "/box-count")).toEqual({ problem: `docs/changes/box-count was written from ${initiative}/box-count: its row in ${initiative}/shifts-initiative-prds.md is no longer planned.` });
  // A row marked written whose PRD is on no branch is named by its directory line.
  expect(await inspect(initiative + "/old-rota")).toEqual({ problem: `docs/prds/old-rota was written from ${initiative}/old-rota: its row in ${initiative}/shifts-initiative-prds.md is no longer planned.` });
  // Its own initiative's folder, of its directory's name, doesn't make a row written from.
  expect(await inspect(initiative + "/shifts")).toMatchObject({ origin: { kind: "planned_prd", title: "Shifts: Shifts core" } });
  // A PRD of the row's derived name, written by hand, doesn't make it written from the row.
  commitFiles(sandbox, repo, "docs/prds/rotas", { "rotas-prd.md": "# PRD: Rotas\n" });
  expect(await inspect(initiative + "/rotas")).toMatchObject({ origin: { kind: "planned_prd", title: "Shifts: Rotas" } });
  // An initiative folder of the row's directory name, on any branch, is written from it.
  git(sandbox, repo, "switch", "-q", "-c", "split-swaps");
  commitFiles(sandbox, repo, "docs/initiatives/swaps", { "swaps-initiative-prds.md": "# Swaps Initiative PRDs\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  expect(await inspect(initiative + "/swaps")).toEqual({ problem: `docs/initiatives/swaps was written from ${initiative}/swaps.` });
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

it("names what to commit, or the bring-up-to-date step, for material and PRDs the checkout doesn't have (AC-BEGIN-03, AC-HOME-04)", async () => {
  const repo = repository();
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  const env = { ...sandbox.env, PATH: bin + delimiter + (sandbox.env.PATH ?? ""), KILN_PORT_RANGE: await reservePortRange(), KILN_NO_BROWSER: "1" };
  const run = async (args: string[]) => {
    let output = "";
    const code = await runKilnCommand(["run", ...args], { cwd: repo, env, stdout: { write: (s: string) => output += s }, stderr: { write: (s: string) => output += s }, signals: new EventEmitter() });
    return { code, output };
  };
  // A brief committed only on another branch, so not in the checkout.
  git(sandbox, repo, "switch", "-q", "-c", "notes");
  commitFiles(sandbox, repo, "source-material/boxes", { "boxes-brief.md": "# Brief: Boxes\n" });
  commitFiles(sandbox, repo, "docs/initiatives/shifts", { "shifts-initiative-prds.md": "# Shifts Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Rotas](c.md#rotas) | None | planned |\n", "c.md": "## Rotas\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  const brief = await run(["source-material/boxes"]);
  expect(brief.code).toBe(1);
  expect(brief.output).toContain("source-material/boxes/boxes-brief.md isn't committed on develop, only on notes. Commit it on develop.");
  expect(brief.output).not.toContain("doesn't exist");
  const planned = await run(["docs/initiatives/shifts", "--prd", "rotas"]);
  expect(planned.output).toContain("docs/initiatives/shifts/shifts-initiative-prds.md isn't committed on develop, only on notes. Commit it on develop.");
  // A brief beside received/ is ready once its intake record is written too.
  const inspect = (path: string) => inspectSource({ git: "git", env: sandbox.env }, repo, path);
  commitFiles(sandbox, repo, "source-material/mixed", { "mixed-brief.md": "# Brief: Mixed\n", "mixed-requirements-intake.md": "# Requirements intake: Mixed\n" });
  commitFiles(sandbox, repo, "source-material/mixed/received", { "notes.txt": "notes\n" });
  expect(await inspect("source-material/mixed")).toMatchObject({ origin: { kind: "brief" } });
  // A planned row the local list lacks, held by another branch's copy of the list, or by origin's (AC-BEGIN-03).
  const inspect2 = inspect;
  const list = "docs/initiatives/teams/teams-initiative-prds.md";
  const table = (rows: string) => "# Teams Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n" + rows;
  commitFiles(sandbox, repo, "docs/initiatives/teams", { "teams-initiative-prds.md": table("| 1 | [Leads](c.md#leads) | None | planned |\n"), "c.md": "## Leads\n\n## Pairs\n\n## Trios\n" });
  git(sandbox, repo, "switch", "-q", "-c", "more-teams");
  commitFiles(sandbox, repo, "docs/initiatives/teams", { "teams-initiative-prds.md": table("| 1 | [Leads](c.md#leads) | None | planned |\n| 2 | [Pairs](c.md#pairs) | None | planned |\n") });
  git(sandbox, repo, "switch", "-q", "develop");
  expect(await inspect2("docs/initiatives/teams/pairs")).toEqual({ problem: `${list} has pairs only on more-teams. Commit ${list} on develop.` });
  commitFiles(sandbox, repo, "docs/initiatives/teams", { "teams-initiative-prds.md": table("| 1 | [Leads](c.md#leads) | None | planned |\n| 3 | [Trios](c.md#trios) | None | planned |\n") });
  commitFiles(sandbox, repo, "source-material/pushed", { "pushed-brief.md": "# Brief: Pushed\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~2");
  expect(await inspect2("docs/initiatives/teams/trios")).toEqual({ problem: `${list} has trios only on origin's develop. Bring the local shared branch develop up to date.` });
  expect((await run(["source-material/pushed"])).output).toContain("source-material/pushed/pushed-brief.md is committed only on origin's develop. Bring the local shared branch develop up to date.");
  // A planned row something was written from names it before the commit step its edited list would need (AC-BEGIN-02).
  git(sandbox, repo, "switch", "-q", "-c", "feature/leads");
  commitFiles(sandbox, repo, "docs/prds/team-leads", { "team-leads-prd.md": "# PRD: Team leads\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  writeFileSync(join(repo, "docs/initiatives/teams/c.md"), "## Leads\n\n**PRD directory, when written:** `docs/prds/team-leads`\n\n## Pairs\n\n## Trios\n");
  git(sandbox, repo, "commit", "-qam", "name the leads directory");
  writeFileSync(join(repo, list), table("| 1 | [Leads](c.md#leads) | None | planned |\n| 9 | edited | None | planned |\n"));
  expect(await inspect2("docs/initiatives/teams/team-leads")).toEqual({ problem: "docs/prds/team-leads was written from docs/initiatives/teams/team-leads." });
  git(sandbox, repo, "checkout", "--", list);
  // A PRD merged on origin and not yet pulled.
  git(sandbox, repo, "merge", "-q", "--no-edit", "origin/develop");
  commitFiles(sandbox, repo, "docs/prds/merged", { "merged-prd.md": "# PRD: Merged\n" });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "reset", "-q", "--hard", "HEAD~1");
  const merged = await run(["docs/prds/merged"]);
  expect(merged.code).toBe(1);
  expect(merged.output).toContain("docs/prds/merged is committed only on origin's develop. Bring the local shared branch develop up to date.");
});
