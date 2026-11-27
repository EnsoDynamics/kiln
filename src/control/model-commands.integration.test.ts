// `kiln model` and `kiln model-defaults` through the built CLI (Kiln Phase Model Tiers AC-PICK-05,
// AC-DEFAULT-05): `kiln model` changes a phase that hasn't started, and the Audits choice, on a
// real controller under the status token and a command ID, listed among status's controls and
// refused for a phase Kiln doesn't build or one that has started; `kiln model-defaults` prints and
// changes Model defaults with no PRD path and no running Kiln, with the page's refusals. Needs
// `dist/` (npm run build).
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const target = () => join(h.repository, `docs/prds/${FOLDER}`);

async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 30000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(watchdog));
  expect(stderr).toBe(""); return { code, stdout, json: () => JSON.parse(stdout) as Record<string, unknown> };
}

/** Phase 1 answers and stops at Needs you, so it has started; the rest of the plan hasn't. */
async function stopped() {
  h = await createHarness({ sessions: [{ actions: [{ result: "I think this is done." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port: boundPort(server.address) });
}
async function token(): Promise<string> {
  const status = await cli(["status", target(), "--json"]); expect(status.code, status.stdout).toBe(0);
  return status.json().status_token as string;
}

it("changes a phase that hasn't started and the Audits choice from a terminal, refusing the started phase and one Kiln doesn't build", async () => {
  await stopped();
  const status = (await cli(["status", target(), "--json"])).json();
  expect((status.controls as { name: string; available: boolean }[]).find(control => control.name === "model")).toMatchObject({ name: "model", available: true, required_inputs: ["PRD-path", "--phase | --audits", "--agent --model [--effort] | --use-default", "--only-if-status-matches", "--command-id"] });
  // Each activity carries its tier and model as the snapshot does, so a bot can read whether its phase can change.
  const progress = (key: string) => (status.plan_models as { id: string; model: { state: string; change?: { available: boolean; reason?: string } } | null }[]).find(row => row.id === key);
  expect(progress("2b")?.model).toMatchObject({ state: "will_run_on", change: { available: true } });
  expect(progress("1")?.model).toMatchObject({ state: "running_on" });
  expect(progress("1")?.model?.change).toBeUndefined();

  const changed = await cli(["model", target(), "--phase", "2b", "--agent", "claude_code", "--model", "haiku", "--effort", "low", "--only-if-status-matches", await token(), "--command-id", "phase-2b-haiku", "--json"]);
  expect(changed.code, changed.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.phases["2b"]).toEqual({ agentId: "claude_code", model: "haiku", effort: "low" });

  const started = await cli(["model", target(), "--phase", "1", "--agent", "claude_code", "--model", "haiku", "--effort", "low", "--only-if-status-matches", await token(), "--command-id", "phase-1-haiku", "--json"]);
  expect(started.code).toBe(3);
  expect(started.json().errors).toEqual([expect.objectContaining({ code: "control_unavailable", message: "Phase 1 has started, so it keeps the agent, model and effort it started on." })]);

  const phaseBack = await cli(["model", target(), "--phase", "2b", "--use-default", "--only-if-status-matches", await token(), "--command-id", "phase-2b-default", "--json"]);
  expect(phaseBack.code, phaseBack.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.phases["2b"]).toBe("default");

  const unknown = await cli(["model", target(), "--phase", "9", "--use-default", "--only-if-status-matches", await token(), "--command-id", "phase-9", "--json"]);
  expect(unknown.code).toBe(2);
  expect(unknown.json().errors).toEqual([expect.objectContaining({ code: "target_not_found", message: expect.stringMatching(/^9 isn't a phase Kiln builds in this plan\. Phases: /) })]);

  const noEffort = await cli(["model", target(), "--audits", "--agent", "claude_code", "--model", "sonnet", "--only-if-status-matches", await token(), "--command-id", "audits-no-effort", "--json"]);
  expect(noEffort.code).toBe(2);
  expect(noEffort.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "Choose an effort for Sonnet 5.5; no supported default was reported." })]);

  // Neither safety flag: nothing is sent.
  expect((await cli(["model", target(), "--audits", "--use-default", "--json"])).code).toBe(2);
  // One target and one choice.
  expect((await cli(["model", target(), "--phase", "2b", "--audits", "--use-default", "--only-if-status-matches", "x", "--command-id", "two", "--json"])).code).toBe(2);

  const audits = await cli(["model", target(), "--audits", "--agent", "claude_code", "--model", "sonnet", "--effort", "medium", "--only-if-status-matches", await token(), "--command-id", "audits-sonnet", "--json"]);
  expect(audits.code, audits.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.audits).toEqual({ agentId: "claude_code", model: "sonnet", effort: "medium" });
  const back = await cli(["model", target(), "--audits", "--use-default", "--only-if-status-matches", await token(), "--command-id", "audits-default", "--json"]);
  expect(back.code, back.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.audits).toBe("default");

  // kiln model-defaults reaches this run underway through its watch on the file, with nothing else told (AC-DEFAULT-03).
  const notRated = () => h.engine.notStartedChoice("3");
  expect(notRated().model).toBe("opus");
  expect((await cli(["model-defaults", "set", "--row", "standard", "--first-agent", "claude_code", "--first-model", "sonnet", "--first-effort", "low", "--json"])).code).toBe(0);
  await waitFor(() => notRated().model === "sonnet");
  expect(notRated()).toMatchObject({ model: "sonnet", effort: "low", from: "model_defaults" });
});

it("prints and changes Model defaults with no PRD path and no running Kiln, refusing what the page refuses", async () => {
  h = await createHarness({ sessions: [] });
  // The stand-in Codex comes first on PATH, so the fallback's model is named the same on every computer.
  const codex = installCodexMetadataFixture(h.sandbox);
  codex.set({ models: [["gpt-6.2-astra", ["low", "high", "xhigh"]], ["gpt-6.2-sol", ["low", "high", "xhigh"]]] });
  Object.assign(h.env, { KILN_CODEX_METADATA: codex.env.KILN_CODEX_METADATA, PATH: `${join(h.sandbox.root, "codex-bin")}${delimiter}${h.env.PATH ?? ""}` });
  const path = modelDefaultsPath(h.env);
  const read = await cli(["model-defaults"]);
  expect(read.code, read.stdout).toBe(0);
  expect(read.stdout).toMatch(/^Model defaults, for every PRD on this computer\nDemanding: Claude Code · Fable · high \(Fable 5\.1\), Kiln's default; fallback Codex · GPT Astra · high \(GPT-6\.2-ASTRA\), Kiln's default\n/);
  expect(read.stdout).toContain("Fallback when usage is nearly out: off (threshold 95%)");

  const set = await cli(["model-defaults", "set", "--row", "mechanical", "--first-agent", "claude_code", "--first-model", "haiku", "--first-effort", "medium", "--json"]);
  expect(set.code, set.stdout).toBe(0);
  expect(set.json().data).toMatchObject({ rows: { mechanical: { first: { familyName: "Haiku", modelName: "Haiku 5.5", effort: "medium", set: true } } } });
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schemaVersion: 2, rows: { mechanical: { first: { agentId: "claude_code", family: "haiku", effort: "medium" } } } });

  const sameAgent = await cli(["model-defaults", "set", "--row", "mechanical", "--fallback-agent", "claude_code", "--fallback-model", "sonnet", "--fallback-effort", "high", "--json"]);
  expect(sameAgent.code).toBe(2);
  expect(sameAgent.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: expect.stringContaining("change both sides in one save") })]);
  const noAgent = await cli(["model-defaults", "set", "--row", "mechanical", "--first-model", "haiku", "--json"]);
  expect(noAgent.code).toBe(2);
  expect(noAgent.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "--first-agent and --first-model go together." })]);
  // Both sides in one command move a row to the other agent.
  const both = await cli(["model-defaults", "set", "--row", "standard", "--first-agent", "codex", "--first-model", "sol", "--first-effort", "high", "--fallback-agent", "claude_code", "--fallback-model", "opus", "--fallback-effort", "medium", "--json"]);
  expect(both.code, both.stdout).toBe(0);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schemaVersion: 2, rows: { mechanical: { first: { agentId: "claude_code", family: "haiku", effort: "medium" } }, standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "opus", effort: "medium" } } } });

  const on = await cli(["model-defaults", "fallback", "--on", "--threshold", "90", "--json"]);
  expect(on.code, on.stdout).toBe(0);
  expect(on.json().data).toMatchObject({ fallback: { enabled: true, threshold: 90 } });
  const over = await cli(["model-defaults", "fallback", "--threshold", "101", "--json"]);
  expect(over.code).toBe(2);
  expect(over.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "The threshold is a whole-number percent from 1 to 100." })]);
  const off = await cli(["model-defaults", "fallback", "--off", "--json"]);
  expect(off.code, off.stdout).toBe(0);
  expect(off.json().data).toMatchObject({ fallback: { enabled: false, threshold: 90 } });
  expect((await cli(["model-defaults", "fallback", "--on", "--json"])).json().data).toMatchObject({ fallback: { enabled: true, threshold: 90 } });
  expect((await cli(["model-defaults", "fallback", "--on", "--off", "--json"])).code).toBe(2);

  const restored = await cli(["model-defaults", "restore", "--json"]);
  expect(restored.code, restored.stdout).toBe(0);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schemaVersion: 2, fallback: { enabled: true, threshold: 90 } });

  writeFileSync(path, "{ broken");
  const broken = await cli(["model-defaults", "--json"]);
  expect(broken.code).toBe(4);
  expect(broken.json().errors).toEqual([expect.objectContaining({ code: "state_unavailable", next_argv: ["kiln", "model-defaults", "restore"] })]);
  const repaired = await cli(["model-defaults", "restore"]);
  expect(repaired.code).toBe(0);
  expect(repaired.stdout).toMatch(/^Kiln's defaults are restored, and the fallback is now off\.\nModel defaults/);

  // The help groups both commands under Choose models, after Message, pause or take over.
  const help = await cli(["--help"]);
  expect(help.stdout).toMatch(/Message, pause or take over\n(?: {2}.*\n)+Choose models\n {2}model, model-defaults, model-defaults set, model-defaults remember,\n {2}model-defaults forget, model-defaults restore, model-defaults fallback\nLook closer/);
  expect((await cli(["model-defaults", "--help"])).stdout).toContain("Subcommand: kiln model-defaults set --help");
});
