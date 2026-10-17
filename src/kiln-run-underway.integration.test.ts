// The built `kiln run` on a feature already underway, as a person runs it: it re-checks a stop
// and carries on, says a PRD is already running, and shows a completed feature from its record.

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, type Harness } from "./test-support/engine-harness.js";
import { git } from "./test-support/git-repositories.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

function kilnEnv(h: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(h.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? h.env.Path ?? ""].join(delimiter) };
}

function kilnRun(h: Harness) {
  const result = spawnSync(process.execPath, [cli, "run", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), encoding: "utf8", timeout: 50_000 });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

const time = String.raw`[ \d]\d:\d\d`;

describe("kiln run on a feature underway", () => {
  it("checks a stopped phase again, and carries on with the next phase once the person has finished it", async () => {
    harness = await createHarness({
      sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }, landingSession("src/b.txt"), { actions: [{ result: "I need a decision on the dashboard's columns." }] }],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toBeDefined();

    // Nothing changed yet: it still needs the person, and nothing starts (AC-STOP-08).
    const still = kilnRun(h);
    expect(still.stdout.split("\n").slice(0, 2)).toEqual(["Customer returns  ·  2 of 4 phases done  ·  phase 1 needs you", "● Phase 1 still needs you."]);
    expect(h.claudeCalls()).toHaveLength(1);

    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    const result = kilnRun(h);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe("Customer returns  ·  2 of 4 phases done  ·  phase 1 needs you");
    expect(lines[1]).toBe("● Phase 1 is done, finished by you. Starting phase 2b, Store credit.");
    expect(lines[2]).toMatch(new RegExp(`^${time}  2b  Store credit       started$`));
    expect(lines[3]).toMatch(new RegExp(`^${time}  2b  Store credit       done · pushed [0-9a-f]{7}$`));
    expect(lines[4]).toMatch(new RegExp(`^${time}  3   Returns dashboard  started$`));
    expect(lines[5]).toMatch(new RegExp(`^${time}  3   Returns dashboard  stopped$`));
    expect(lines[6]).toBe("  This build of Kiln has no browser view yet, so it exits here; kiln run checks again and carries on.");
    expect(result.exitCode).toBe(0);
    expect(h.claudeCalls()).toHaveLength(3);
  });

  it("says the PRD is already running, with its address, and starts nothing, while another kiln run holds it", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ result: "unused" }] }, { actions: [{ waitForFile: release }, { result: "Stopping." }] }] }));

    const holder = spawn(process.execPath, [cli, "run", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), stdio: "ignore" });
    const exited = new Promise((resolve) => holder.once("exit", resolve));
    const deadline = Date.now() + 30_000;
    while (h.claudeCalls().length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.claudeCalls()).toHaveLength(2);

    try {
      const second = kilnRun(h);
      expect(second.stdout).toMatch(/^Customer returns is already running at http:\/\/127\.0\.0\.1:47\d\d\/customer-returns\n$/);
      expect(second.exitCode).toBe(1);
      expect(h.claudeCalls()).toHaveLength(2);
    } finally {
      writeFileSync(release, "");
      await exited;
    }
  });

  it("shows a completed feature from its record alone", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(218)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const ghCalls = h.ghCalls().length;
    const result = kilnRun(h);
    expect(result.stdout).toBe("Customer returns  ·  4 of 4 phases done  ·  complete\n● Pull request #218 is ready for review.\n");
    expect(result.exitCode).toBe(0);
    expect(h.ghCalls()).toHaveLength(ghCalls);
  });
});
