/** Competing real Node processes exercise the file lock and atomic compare-and-swap. */
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHelper } from "../platform/helper-process.js";
import { preferenceGroup, readDevelopmentPreference } from "./development-preferences.js";
let root: string | undefined;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });
it("allows exactly one simultaneous remembered-choice save and preserves the winning targets", async () => {
  root = mkdtempSync(join(tmpdir(), "kiln-preference-concurrent-"));
  const path = join(root, "private", "development-deployment-preferences.json"); const group = preferenceGroup("acme/product", root);
  const module = new URL("../../dist/state/development-preferences.js", import.meta.url).href;
  const script = `import { saveDevelopmentPreference } from ${JSON.stringify(module)}; const [path, group, environment] = process.argv.slice(1); try { console.log(JSON.stringify(saveDevelopmentPreference(path, {group:JSON.parse(group),revision:0,enabled:true,targets:[{repository:'github.com/acme/api',baseBranch:'develop',environment}]},0))); } catch(error) { console.log(JSON.stringify({conflict:error.message})); process.exitCode=1; }`;
  const results = await Promise.all(["api-dev-one", "api-dev-two"].map(environment => runHelper(process.execPath, ["--input-type=module", "-e", script, path, JSON.stringify(group), environment], { cwd: root!, env: process.env, timeoutMs: 10_000 })));
  expect(results.map(one => one.exitCode).sort()).toEqual([0, 1]);
  const winner = JSON.parse(results.find(one => one.exitCode === 0)!.stdout);
  expect(readDevelopmentPreference(path, group)).toEqual(winner);
  expect(winner.revision).toBe(1); expect(winner.targets[0].environment).toMatch(/^api-dev-(one|two)$/);
  expect(JSON.parse(results.find(one => one.exitCode === 1)!.stdout).conflict).toMatch(/another window|Another window/);
});
