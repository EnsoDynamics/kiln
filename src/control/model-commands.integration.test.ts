// `kiln model` and `kiln model-defaults` through the built CLI (Kiln Phase Model Tiers AC-PICK-05,
// AC-DEFAULT-05): `kiln model` changes a phase that hasn't started, and the Audits choice, on a
// real controller under the status token and a command ID, listed among status's controls and
// refused for a phase Kiln doesn't build or one that has started; `kiln model-defaults` prints and
// changes Model defaults with no PRD path and no running Kiln, with the page's refusals, and with
// `--prd` reads and saves one PRD's own settings (Kiln Model Modes AC-CLI-01). Needs `dist/`
// (npm run build).
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { modelDefaultsPath, prdSettingsPath } from "../models/model-defaults.js";
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
  expect((status.controls as { name: string; available: boolean }[]).find(control => control.name === "model")).toMatchObject({ name: "model", available: true, required_inputs: ["PRD-path", "--phase | --audits | --preflight-pr", "--agent --model [--effort] | --use-default", "--only-if-status-matches", "--command-id"] });
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

  // `--preflight-pr` follows `--audits` in every respect, for this PRD's Preflight and pull request choice (Kiln Model Modes AC-ROW-01).
  expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults", row: "preflight_pr" });
  const preflightPr = await cli(["model", target(), "--preflight-pr", "--agent", "claude_code", "--model", "sonnet", "--effort", "low", "--only-if-status-matches", await token(), "--command-id", "preflight-pr-sonnet", "--json"]);
  expect(preflightPr.code, preflightPr.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.preflightPr).toEqual({ agentId: "claude_code", model: "sonnet", effort: "low" });
  // It reaches the pull request session, which hasn't started, and never the audits, which keep their own choice.
  expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "sonnet", effort: "low", from: "changed" });
  expect(h.engine.notStartedChoice("audit-planned")).toMatchObject({ model: "opus", effort: "high", from: "model_defaults" });
  expect((await cli(["model", target(), "--audits", "--preflight-pr", "--use-default", "--only-if-status-matches", "x", "--command-id", "two-targets", "--json"])).code).toBe(2);
  const preflightPrBack = await cli(["model", target(), "--preflight-pr", "--use-default", "--only-if-status-matches", await token(), "--command-id", "preflight-pr-default", "--json"]);
  expect(preflightPrBack.code, preflightPrBack.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.modelChoices.preflightPr).toBe("default");
  expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });

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
  expect(read.stdout).toMatch(/^Model defaults, for every PRD on this computer\nHow Kiln picks a model: Recommended model for each phase\nDemanding: Claude Code · Fable · high \(Fable 5\.1\), Kiln's default; fallback Codex · GPT Astra · high \(GPT-6\.2-ASTRA\), Kiln's default\n/);
  // What the page shows: how models are picked, each row, the fallback setting, and the one model kept for the other choice.
  expect(read.stdout).toContain("\nHow Kiln picks a model: Recommended model for each phase\n");
  expect(read.stdout).toContain("\nUse the fallback: never (threshold 95%)\nOne model for everything, not selected: Claude Code · Opus · high (Opus 5.5), Kiln's default\n");

  const set = await cli(["model-defaults", "set", "--row", "mechanical", "--first-agent", "claude_code", "--first-model", "haiku", "--first-effort", "medium", "--json"]);
  expect(set.code, set.stdout).toBe(0);
  expect(set.json()).toMatchObject({ path, source: "defaults" });
  expect(set.json().data).toMatchObject({ source: "defaults", rows: { mechanical: { first: { familyName: "Haiku", modelName: "Haiku 5.5", effort: "medium", set: true } } } });
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
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schemaVersion: 2, rows: { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "opus", effort: "medium" } }, mechanical: { first: { agentId: "claude_code", family: "haiku", effort: "medium" } } } });

  // The fifth row is set like the others, spelled preflight-pr on the command line (Kiln Model Modes AC-ROW-01).
  expect(read.stdout).toContain("Preflight and pull request: Claude Code · Opus · medium (Opus 5.5), Kiln's default; fallback Codex · GPT Sol · medium (GPT-6.2-SOL), Kiln's default");
  const fifth = await cli(["model-defaults", "set", "--row", "preflight-pr", "--first-agent", "claude_code", "--first-model", "sonnet", "--first-effort", "low", "--json"]);
  expect(fifth.code, fifth.stdout).toBe(0);
  expect(fifth.json().data).toMatchObject({ rows: { preflight_pr: { first: { familyName: "Sonnet", effort: "low", set: true }, fallback: { familyName: "GPT Sol", effort: "medium", set: false } } } });
  expect((JSON.parse(readFileSync(path, "utf8")) as { rows: Record<string, unknown> }).rows.preflight_pr).toEqual({ first: { agentId: "claude_code", family: "sonnet", effort: "low" } });
  const noRow = await cli(["model-defaults", "set", "--row", "tiny", "--first-agent", "claude_code", "--first-model", "sonnet", "--first-effort", "low", "--json"]);
  expect(noRow.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "--row takes demanding, standard, mechanical, audits or preflight-pr." })]);
  const rows = (JSON.parse(readFileSync(path, "utf8")) as { rows: unknown }).rows;
  const saved = () => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

  // The commands that exist today keep their meaning: on selects the threshold setting, off selects Never (AC-CLI-01).
  const on = await cli(["model-defaults", "fallback", "--on", "--threshold", "90", "--json"]);
  expect(on.code, on.stdout).toBe(0);
  expect(on.json().data).toMatchObject({ fallback: { use: "threshold", enabled: true, threshold: 90 } });
  const over = await cli(["model-defaults", "fallback", "--threshold", "101", "--json"]);
  expect(over.code).toBe(2);
  expect(over.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "The threshold is a whole-number percent from 1 to 100." })]);
  const off = await cli(["model-defaults", "fallback", "--off", "--json"]);
  expect(off.code, off.stdout).toBe(0);
  expect(off.json().data).toMatchObject({ fallback: { use: "never", enabled: false, threshold: 90 } });
  expect((await cli(["model-defaults", "fallback", "--on", "--json"])).json().data).toMatchObject({ fallback: { use: "threshold", enabled: true, threshold: 90 } });
  // Malformed commands are refused before anything is read or changed.
  const malformed = await Promise.all([["fallback", "--on", "--off"], ["fallback", "--never", "--for-everything"], ["fallback"], ["mode", "--one-model", "--agent", "codex"], ["mode", "--recommended", "--agent", "codex", "--model", "sol"], ["mode"], ["use-defaults"]].map(args => cli(["model-defaults", ...args, "--json"])));
  expect(malformed.map(one => one.code)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  expect(malformed.slice(2, 5).map(one => (one.json().errors as { message: string }[])[0]!.message)).toEqual(["Give --never, --at-threshold, --for-everything or --threshold.", "--agent and --model go together.", "--agent, --model and --effort go with --one-model."]);

  // The three settings by name. The threshold setting is saved with the threshold in force, as the page saves it.
  const everything = await cli(["model-defaults", "fallback", "--for-everything"]);
  expect(everything.code, everything.stdout).toBe(0);
  expect(everything.stdout).toContain("\nUse the fallback: for everything, until you change this (threshold 90%)\n");
  expect(saved()).toEqual({ schemaVersion: 2, rows, fallback: { use: "everything", threshold: 90 } });
  const atThreshold = await cli(["model-defaults", "fallback", "--at-threshold", "--threshold", "85"]);
  expect(atThreshold.stdout).toContain("\nUse the fallback: when the first choice's usage reaches 85% of a limit\n");
  expect(saved()).toEqual({ schemaVersion: 2, rows, fallback: { use: "threshold", threshold: 85 } });

  // One model for everything: without an agent and model it saves the one model the command would print, decided when read.
  const oneModel = await cli(["model-defaults", "mode", "--one-model"]);
  expect(oneModel.code, oneModel.stdout).toBe(0);
  expect(oneModel.stdout).toMatch(/^Model defaults, for every PRD on this computer\nHow Kiln picks a model: One model for everything\nOne model: Claude Code · Opus · high \(Opus 5\.5\)\nKept for Recommended model for each phase, and not used while one model runs everything:\nDemanding: /);
  expect(saved()).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "opus", effort: "high" }, rows, fallback: { use: "threshold", threshold: 85 } });
  const picked = await cli(["model-defaults", "mode", "--one-model", "--agent", "codex", "--model", "sol", "--effort", "low", "--json"]);
  expect(picked.json().data).toMatchObject({ mode: "one_model", oneModel: { agent: "Codex", familyName: "GPT Sol", modelName: "GPT-6.2-SOL", effort: "low", set: true } });
  // Each way of picking models keeps its settings while the other is selected (AC-MODE-01).
  expect((await cli(["model-defaults", "mode", "--recommended", "--json"])).json().data).toMatchObject({ mode: "recommended", oneModel: { agent: "Codex", effort: "low", set: true } });
  expect(saved()).toEqual({ schemaVersion: 2, mode: "recommended", oneModel: { agentId: "codex", family: "sol", effort: "low" }, rows, fallback: { use: "threshold", threshold: 85 } });

  // Restore does what the page's Restore does: the mode, the rows, the one model and the fallback setting go back to Kiln's choices (SAVE-008).
  const restored = await cli(["model-defaults", "restore", "--json"]);
  expect(restored.code, restored.stdout).toBe(0);
  expect(restored.json().data).toMatchObject({ mode: "recommended", oneModel: { agent: "Claude Code", familyName: "Opus", effort: "high", set: false }, rows: { standard: { first: { agent: "Claude Code", set: false } } }, fallback: { use: "never", enabled: false, threshold: 95 }, holdsSettings: false });
  expect(saved()).toEqual({ schemaVersion: 2 });
  expect((await cli(["model-defaults", "restore", "--help"])).stdout).toContain("Turns the fallback off");

  writeFileSync(path, "{ broken");
  const broken = await cli(["model-defaults", "--json"]);
  expect(broken.code).toBe(4);
  expect(broken.json()).toMatchObject({ path, source: "defaults", can_restore: true });
  expect(broken.json().errors).toEqual([expect.objectContaining({ code: "state_unavailable", next_argv: ["kiln", "model-defaults", "restore"] })]);
  const repaired = await cli(["model-defaults", "restore"]);
  expect(repaired.code).toBe(0);
  expect(repaired.stdout).toMatch(/^Kiln's defaults are restored, and the fallback is now off\.\nModel defaults/);
  expect(saved()).toEqual({ schemaVersion: 2 });

  // The help groups both commands under Choose models, after Message, pause or take over.
  const help = await cli(["--help"]);
  expect(help.stdout).toMatch(/Message, pause or take over\n(?: {2}.*\n)+Choose models\n {2}model, model-defaults, model-defaults set, model-defaults restore,\n {2}model-defaults fallback, model-defaults mode, model-defaults use-defaults\nLook closer/);
  expect((await cli(["model-defaults", "--help"])).stdout).toContain("Subcommand: kiln model-defaults set --help");
});

it("reads and saves one PRD's own settings with --prd on the same commands, and returns it to the defaults with use-defaults (AC-CLI-01)", async () => {
  await stopped();
  const defaults = modelDefaultsPath(h.env); const own = prdSettingsPath(h.stateDirectory);
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
  const sonnet = { agentId: "claude_code", family: "sonnet", effort: "low" };
  expect((await cli(["model-defaults", "set", "--row", "standard", "--first-agent", "claude_code", "--first-model", "sonnet", "--first-effort", "low", "--json"])).code).toBe(0);
  await waitFor(() => h.engine.notStartedChoice("3").model === "sonnet");

  // A PRD that follows the defaults prints them and says so.
  const follows = await cli(["model-defaults", "--prd", target()]);
  expect(follows.code, follows.stdout).toBe(0);
  expect(follows.stdout).toMatch(/^Models for Customer returns: it follows Model defaults, for every PRD on this computer\.\nHow Kiln picks a model: Recommended model for each phase\n/);
  expect(existsSync(own)).toBe(false);

  // A save with --prd is This PRD only: the PRD gets its own settings, starting from what Model defaults holds, and the defaults are unchanged.
  const everything = await cli(["model-defaults", "fallback", "--for-everything", "--prd", target(), "--json"]);
  expect(everything.code, everything.stdout).toBe(0);
  expect(everything.json()).toMatchObject({ path: own, source: "prd", prd_path: target() });
  expect(everything.json().data).toMatchObject({ source: "prd", prd: "Customer returns", fallback: { use: "everything", enabled: true, threshold: 95 }, rows: { standard: { first: { familyName: "Sonnet", set: true } } } });
  expect(json(own)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "everything" } });
  expect(json(defaults)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } } });
  // The running Kiln reads the PRD's own settings within a second: its phases that haven't started move to their fallbacks.
  await waitFor(() => h.engine.notStartedChoice("3").agentId === "codex");
  expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "codex", ownSettings: true });
  const printed = await cli(["model-defaults", "--prd", target()]);
  expect(printed.stdout).toMatch(/^Models for Customer returns: this PRD has its own settings\. Every other PRD keeps your defaults\.\n/);
  expect(printed.stdout).toContain("\nUse the fallback: for everything, until you change this (threshold 95%)\n");
  // Without --prd the command still reads and changes Model defaults and no PRD's own settings.
  // The threshold setting named alone is saved with the threshold the command would print, as the page saves it with the one it shows.
  expect((await cli(["model-defaults", "fallback", "--at-threshold", "--json"])).json().data).toMatchObject({ source: "defaults", fallback: { use: "threshold", threshold: 95 } });
  expect(json(defaults)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "threshold", threshold: 95 } });
  expect(json(own)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "everything" } });

  // Every saving command takes --prd, and each changes only this PRD's settings.
  expect((await cli(["model-defaults", "set", "--row", "mechanical", "--first-agent", "claude_code", "--first-model", "haiku", "--first-effort", "medium", "--prd", target(), "--json"])).code).toBe(0);
  const one = await cli(["model-defaults", "mode", "--one-model", "--prd", target(), "--json"]);
  expect(one.code, one.stdout).toBe(0);
  expect(json(own)).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "claude_code", family: "opus", effort: "high" }, rows: { standard: { first: sonnet }, mechanical: { first: { agentId: "claude_code", family: "haiku", effort: "medium" } } }, fallback: { use: "everything" } });
  await waitFor(() => h.engine.notStartedChoice("3").from === "one_model");
  expect(json(defaults)).toEqual({ schemaVersion: 2, rows: { standard: { first: sonnet } }, fallback: { use: "threshold", threshold: 95 } });
  // A save the PRD's own settings refuse names that file, and changes nothing.
  const sameAgent = await cli(["model-defaults", "set", "--row", "standard", "--fallback-agent", "claude_code", "--fallback-model", "opus", "--fallback-effort", "high", "--prd", target(), "--json"]);
  expect(sameAgent.code).toBe(2);
  expect(sameAgent.json()).toMatchObject({ path: own, prd_path: target(), errors: [expect.objectContaining({ code: "invalid_input", message: expect.stringContaining("would both be on Claude Code") })] });
  // Restore with --prd empties the PRD's own settings, which remain its own.
  const restored = await cli(["model-defaults", "restore", "--prd", target(), "--json"]);
  expect(restored.code, restored.stdout).toBe(0);
  expect(restored.json().data).toMatchObject({ source: "prd", mode: "recommended", fallback: { use: "never", threshold: 95 }, rows: { standard: { first: { familyName: "Opus", set: false } } } });
  expect(json(own)).toEqual({ schemaVersion: 2 });

  // Own settings that can't be read fail every --prd command but use-defaults, which the error names as the next step.
  writeFileSync(own, "{ broken");
  const commands = [["model-defaults"], ["model-defaults", "restore"]];
  for (const [index, refused] of (await Promise.all(commands.map(args => cli([...args, "--prd", target(), "--json"])))).entries()) {
    const args = commands[index]!;
    expect(refused.code, args.join(" ")).toBe(4);
    expect(refused.json(), args.join(" ")).toMatchObject({ path: own, source: "prd", can_restore: true });
    expect(refused.json().errors, args.join(" ")).toEqual([expect.objectContaining({ code: "state_unavailable", message: expect.stringContaining(own), next_argv: ["kiln", "model-defaults", "use-defaults", "--prd", target()] })]);
  }
  expect(readFileSync(own, "utf8")).toBe("{ broken");
  const back = await cli(["model-defaults", "use-defaults", "--prd", target()]);
  expect(back.code, back.stdout).toBe(0);
  expect(back.stdout).toMatch(/^Models for Customer returns: it follows Model defaults, for every PRD on this computer\.\n/);
  expect(existsSync(own)).toBe(false);
  await waitFor(() => h.engine.notStartedChoice("3").model === "sonnet");
  expect(h.engine.notStartedChoice("3")).toMatchObject({ agentId: "claude_code", from: "model_defaults" });

  // While Model defaults can't be read, a --prd command on a PRD with no settings of its own fails with their path and names restore.
  writeFileSync(defaults, "{ broken");
  const unread = await cli(["model-defaults", "fallback", "--for-everything", "--prd", target(), "--json"]);
  expect(unread.code).toBe(4);
  expect(unread.json()).toMatchObject({ path: defaults, source: "defaults" });
  expect(unread.json().errors).toEqual([expect.objectContaining({ code: "state_unavailable", next_argv: ["kiln", "model-defaults", "restore"] })]);
  expect(existsSync(own)).toBe(false);

  // use-defaults still removes the PRD's own settings over Model defaults that can't be read, then reports their error the same way.
  writeFileSync(own, JSON.stringify({ schemaVersion: 2, fallback: { use: "everything" } }));
  const removed = await cli(["model-defaults", "use-defaults", "--prd", target(), "--json"]);
  expect(removed.code).toBe(4);
  expect(existsSync(own)).toBe(false);
  expect(removed.json()).toMatchObject({ path: defaults, source: "defaults", errors: [expect.objectContaining({ code: "state_unavailable", next_argv: ["kiln", "model-defaults", "restore"] })] });

  // --prd needs Kiln's record of the PRD, as the page does.
  const unknown = await cli(["model-defaults", "--prd", join(h.repository, "docs/prds/never-opened"), "--json"]);
  expect(unknown.code).toBe(2);
  expect(unknown.json().errors).toEqual([expect.objectContaining({ code: "target_not_found", message: "Kiln has no record of this PRD, so it has no settings of its own to read or save. Open it once with kiln run <PRD-path>." })]);
});
