// A paused Start on the open page (Kiln Run Restart AC-FROM-06), through a real `kiln run` and
// headless Chrome: the box that takes the Start button's place when the chosen branch moved after
// the page was drawn, the marked field, nothing started, and Start anyway going ahead.

import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { readPrdRecord } from "./state/records.js";
import { createHarness, waitFor, type Harness } from "./test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "./test-support/headless-chrome.js";
import { reservePortRange } from "./test-support/os-ports.js";
import { createGithubOrigin } from "./test-support/git-repositories.js";

const PRD = "docs/prds/customer-returns";
const BRANCH = "feature/customer-returns";
let harness: Harness | undefined;
let chrome: HeadlessChrome;
let ports = "";
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
beforeEach(async () => { ports = await reservePortRange(); });
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

function kilnEnv(h: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(h.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? h.env.Path ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
}

const text = "document.body.innerText";

it("takes the Start button's place when the chosen branch moved, starts nothing, and Start anyway goes ahead", async () => {
  harness = await createHarness({ sessions: [{ actions: [{ result: "Waiting for a decision." }] }] });
  const h = harness;
  h.engine.close();
  const run = (cwd: string, args: string[]) => { const result = spawnSync(h.tools.git, args, { cwd, env: h.sandbox.env, encoding: "utf8" }); expect(result.status, result.stderr).toBe(0); return result.stdout.trim(); };
  // A branch someone built on, pushed, with the person's checkout on develop.
  run(h.repository, ["switch", "-q", "-c", BRANCH]);
  writeFileSync(join(h.repository, "intake.txt"), "by hand\n");
  run(h.repository, ["add", "intake.txt"]);
  run(h.repository, ["commit", "-q", "-m", "feat: intake, by hand"]);
  run(h.repository, ["push", "-q", "-u", "origin", BRANCH]);
  run(h.repository, ["switch", "-q", "develop"]);
  // `kiln run`'s start checks need origin on GitHub: the same refs, reached as github.com through the SSH stand-in.
  const { url, bare } = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  run(h.origin, ["push", "-q", "--mirror", bare]);
  run(h.repository, ["remote", "set-url", "origin", url]);
  run(h.repository, ["fetch", "-q", "origin"]);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;

  let address: string | undefined; let exit: number | undefined; let output = "";
  const signals = new EventEmitter();
  const done = runKilnCommand(["run", PRD], { cwd: h.repository, env: kilnEnv(h), signals, stdout: { write: (chunk: string) => (output += chunk) }, stderr: { write: (chunk: string) => (output += chunk) }, openBrowser: async (served) => { address = served; return { kind: "opened" }; } });
  void done.then(code => { exit = code; });
  try {
    await waitFor(() => address !== undefined || exit !== undefined, 40_000);
    expect(address, output).toBeDefined();
    const page = await chrome.open(address!, { width: 1200, height: 1100 });
    try {
      // The branch that exists is chosen, and Start is ready once refinement is confirmed.
      await page.waitFor(`${text}.includes("Not started") && document.querySelector("select#branch") && document.querySelector("select#branch").value === "${BRANCH}"`, 30_000);
      await page.evaluate(`document.querySelector("#refined").click()`);
      await page.waitFor(`document.querySelector("button.start") && !document.querySelector("button.start").disabled`, 30_000);
      expect(await page.evaluate<boolean>(`!!document.querySelector(".paused")`)).toBe(false);

      // Someone commits to the branch and pushes it, after the page was drawn; the person's checkout isn't touched.
      const was = run(h.repository, ["rev-parse", BRANCH]);
      const now = run(h.repository, ["commit-tree", `${BRANCH}^{tree}`, "-p", BRANCH, "-m", "feat: more, by hand"]);
      run(h.repository, ["update-ref", `refs/heads/${BRANCH}`, now]);
      run(h.repository, ["push", "-q", "origin", BRANCH]);
      // And checks it out in a worktree of their own.
      const elsewhere = join(h.sandbox.root, "elsewhere", "acme-shop");
      mkdirSync(join(h.sandbox.root, "elsewhere"), { recursive: true });
      run(h.repository, ["worktree", "add", "-q", elsewhere, BRANCH]);

      await page.evaluate(`document.querySelector("button.start").click()`);
      await page.waitFor(`!!document.querySelector(".paused")`, 30_000);
      const box = await page.evaluate<string>(`document.querySelector(".paused").innerText`);
      expect(box.toLowerCase()).toContain("paused · nothing has started");
      expect(box).toContain("Someone may be working on this branch");
      expect(box).toContain(`${BRANCH} changed after this page loaded: it was at ${was.slice(0, 7)} and is now at ${now.slice(0, 7)}.`);
      expect(box).toContain("Only start if those commits are yours and that work is finished.");
      // The box holds the one button that goes on, and the plain Start button is gone.
      expect(await page.evaluate<string[]>(`[...document.querySelectorAll("button.start")].map(button => button.innerText.trim())`)).toEqual(["Start anyway"]);
      // It is ready once the page has the refreshed snapshot.
      await page.waitFor(`!document.querySelector("button.start.anyway").disabled`, 30_000);
      expect(box).toContain("which wasn’t this branch’s worktree when this page loaded.");
      // Both fields that changed are marked.
      expect(await page.evaluate<boolean>(`document.querySelector("select#branch").classList.contains("changed")`)).toBe(true);
      expect(await page.evaluate<boolean>(`document.querySelector("#worktree").classList.contains("changed")`)).toBe(true);
      expect(await page.evaluate<string>(`document.querySelector("#worktree").value`)).toContain("elsewhere/acme-shop");
      expect(await page.evaluate<boolean>(`!!document.querySelector(".cant-start")`)).toBe(false);
      expect(readPrdRecord(h.stateDirectory)?.startedAt).toBeUndefined();

      await page.evaluate(`document.querySelector("button.start.anyway").click()`);
      await waitFor(() => readPrdRecord(h.stateDirectory)?.startedAt !== undefined, 40_000);
      const record = readPrdRecord(h.stateDirectory)!;
      expect(record.repositories[0]).toMatchObject({ runStartCommit: now, worktreePath: elsewhere, adoptedWorktree: true });
      expect(record.startedFrom).toBe(`Started from ${BRANCH} at ${now.slice(0, 7)}.`);
      await page.waitFor(`!${text}.includes("Not started")`, 40_000);
    } finally { await page.close(); }
  } finally {
    if (exit === undefined) signals.emit("SIGINT");
    await done;
  }
}, 120_000);
