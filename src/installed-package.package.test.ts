// The package as npm would publish it, installed the way a person installs it (AC-INSTALL-01):
// `npm pack`, then `npm install -g` of that tarball into a temporary prefix, then the installed
// `kiln` command run against a real temporary repository. One install has to bring the command,
// the browser view with its fonts, and the prompt templates. Release CI installs the exact
// Ubuntu-built archive on macOS (AC-INSTALL-03/05); local runs pack the working source.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { waitFor } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, writeStandIn, type Sandbox } from "./test-support/git-repositories.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
let sandbox: Sandbox;
let packedFiles: string[];
let kilnCommand: string;
let installedPackage: string;
let env: NodeJS.ProcessEnv;
let repository: string;

/**
 * npm is npm.cmd on Windows, which only a shell can start. It runs with this process's own
 * environment, not the sandbox's: the sandbox moves LOCALAPPDATA, where npm keeps its cache on
 * Windows, and installing from a cold cache downloads every dependency again.
 */
function npm(args: string[], cwd: string) {
  const result = spawnSync(windows ? `npm ${args.map((arg) => `"${arg}"`).join(" ")}` : "npm", windows ? [] : args, { cwd, env: process.env, encoding: "utf8", shell: windows, timeout: 240_000 });
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** `kiln`, by name, as a person's shell runs it: found on the PATH as the shim npm installed. */
function runInstalled(args: string[], cwd: string): ChildProcess {
  return windows
    ? spawn(`kiln ${args.map((arg) => `"${arg}"`).join(" ")}`, [], { cwd, env, shell: true })
    : spawn("kiln", args, { cwd, env });
}

function collect(child: ChildProcess): { text: () => string; exit: Promise<number | null> } {
  let text = "";
  child.stdout?.on("data", (chunk) => (text += chunk.toString()));
  child.stderr?.on("data", (chunk) => (text += chunk.toString()));
  return { text: () => text, exit: new Promise((resolve) => child.once("exit", (code) => resolve(code))) };
}

/** Ends the installed kiln and, on Windows, the cmd.exe and node it runs under. */
function end(child: ChildProcess): void {
  if (windows) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGINT");
}

beforeAll(() => {
  sandbox = createSandbox();
  let archive = process.env.KILN_PACKAGE_TARBALL;
  if (archive) {
    const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8", timeout: 30_000 });
    if (listing.status !== 0) throw new Error(`Cannot inspect candidate archive: ${listing.stderr}`);
    packedFiles = listing.stdout.trim().split("\n").filter(path => !path.endsWith("/")).map(path => path.replace(/^package\//, ""));
  } else {
    const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", sandbox.root], repositoryRoot)) as [{ filename: string; files: { path: string }[] }];
    packedFiles = packed[0].files.map((file) => file.path.replace(/\\/g, "/"));
    archive = join(sandbox.root, packed[0].filename);
  }
  const prefix = join(sandbox.root, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", archive], sandbox.root);
  kilnCommand = windows ? join(prefix, "kiln.cmd") : join(prefix, "bin", "kiln");
  installedPackage = windows ? join(prefix, "node_modules", "@ensodynamics", "kiln") : join(prefix, "lib", "node_modules", "@ensodynamics", "kiln");

  repository = createRepository(sandbox, "acme-shop", createGithubOrigin(sandbox, "acme", "acme-shop").url);
  commitFiles(sandbox, repository, `docs/prds/${FOLDER}`, prdDirectoryFiles());
  const standIns = join(sandbox.root, "bin");
  writeStandIn(standIns, "gh", 0);
  writeStandIn(standIns, "claude", 0);
  const base = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  env = { ...base, PATH: [dirname(kilnCommand), standIns, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: "41140-41149" };
});
afterAll(() => sandbox?.cleanup());

describe("the installed package", () => {
  it("holds the compiled command, the built view and the prompts, and nothing else", () => {
    const source = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as { name: string; version: string };
    const installed = JSON.parse(readFileSync(join(installedPackage, "package.json"), "utf8")) as { name: string; version: string };
    expect(installed).toMatchObject({ name: source.name, version: source.version });
    const prompts = readdirSync(join(repositoryRoot, "prompts")).map((name) => `prompts/${name}`);
    expect(prompts.length).toBeGreaterThan(0);
    expect(packedFiles).toEqual(expect.arrayContaining(["package.json", "README.md", "LICENSE", "dist/cli.js", "dist/view/index.html", ...prompts]));
    for (const prompt of prompts) expect(existsSync(join(installedPackage, prompt)), prompt).toBe(true);
    expect(packedFiles.some((path) => /^dist\/view\/assets\/.+\.woff2$/.test(path))).toBe(true);
    expect(packedFiles.filter((path) => !/^(dist|prompts)\//.test(path)).sort()).toEqual(["LICENSE", "README.md", "package.json"]);
    expect(packedFiles.filter((path) => /\.test\./.test(path) || path.startsWith("dist/test-support/"))).toEqual([]);
    expect(existsSync(join(installedPackage, "dist", "cli.js"))).toBe(true);
    expect(existsSync(kilnCommand)).toBe(true);
    // AC-RUN-07: public npm users receive the billing boundary, and the passive worker ships.
    const guidance = readFileSync(join(installedPackage, "README.md"), "utf8");
    for (const text of ["Use API billing for this PRD", "paid overflow", "per-request billing firewall", "no zero-cost guarantee", "Codex requires ChatGPT sign-in", "ChatGPT account", "workspace credits", "https://chatgpt.com/codex/settings/usage", "never buys credits"]) expect(guidance).toContain(text);
    // AC-RUN-04/07: assert the meaning and provider remedies in the shipped artifact.
    for (const text of [
      "https://console.anthropic.com/settings/limits", "https://claude.ai/settings/usage",
      "When authentication works but additional billing details cannot be established and no override is detected",
      "the neutral **Claude Code settings** summary lets work continue",
      "before each model-consuming launch or resume, including recovery, audits and final delivery",
      "not a per-request billing firewall or a spending cap",
      "does not interrupt an active session over a later settings change",
      "For an inherited environment variable, stop Kiln and restart it from the corrected environment",
      "Claude billing approval never authorizes Codex API-key access",
    ]) expect(guidance).toContain(text);
    expect(packedFiles).toContain("dist/billing/settings-worker.js");
    expect(packedFiles.some(path => /(?:fixtures|agent-sessions|prd\.json|session\.json)/.test(path))).toBe(false);
    const passive = spawnSync(process.execPath, [join(installedPackage, "dist/billing/settings-worker.js")], { cwd: sandbox.root, env: sandbox.env, encoding: "utf8", timeout: 30_000 });
    expect(passive.status).toBe(0);
    expect(JSON.parse(passive.stdout)).toMatchObject({ env: {}, helpers: {} });
  });

  it("ships the production Codex decoder and its runtime parser without source checkout dependencies", async () => {
    const decoder = await import(pathToFileURL(join(installedPackage, "dist/session/codex-wrapper-decoder.mjs")).href) as { decodeWrapper(id: string, source: string): { coverage: string; operations: unknown[] } };
    const result = decoder.decodeWrapper("package-proof", 'text(await tools.exec_command({cmd:"git status",workdir:"/assigned"}));');
    expect(result).toMatchObject({ coverage: "complete", operations: [{ name: "exec_command", input: { cmd: "git status", workdir: "/assigned" } }] });
    const presentation = decoder.decodeWrapper("package-presentation-proof", 'const results = await Promise.all([tools.exec_command({cmd:"git status",workdir:"/assigned"})]); results.forEach(text);');
    expect(presentation).toMatchObject({ coverage: "complete", operations: [{ name: "exec_command", input: { cmd: "git status", workdir: "/assigned" } }] });
    const comparison = decoder.decodeWrapper("package-comparison-proof", 'const rs = await Promise.allSettled([tools.exec_command({cmd:"git status",workdir:"/assigned"})]); for(let i=0;i<rs.length;i++){text(rs[i].status==="fulfilled"?rs[i].value.output:rs[i].reason);}');
    expect(comparison).toMatchObject({ coverage: "complete", operations: [{ name: "exec_command", input: { cmd: "git status", workdir: "/assigned" } }] });
    const catalogue = decoder.decodeWrapper("package-catalogue-proof", 'text(await tools.exec_command({cmd:"git status",workdir:"/assigned"})); text(ALL_TOOLS.filter(x=>/git/.test(x.name+" "+x.description)).map(x=>({name:x.name,description:x.description.slice(0,180)})).slice(0,60));');
    expect(catalogue).toMatchObject({ coverage: "complete", operations: [{ name: "exec_command", input: { cmd: "git status", workdir: "/assigned" } }] });
    expect(packedFiles).toContain("prompts/codex-powershell-ast.ps1");
    const evidence = await import(pathToFileURL(join(installedPackage, "dist/session/codex-evidence.js")).href) as { auditCodexConversation: unknown };
    expect(typeof evidence.auditCodexConversation).toBe("function");
  });

  it("puts kiln on the PATH, which prints how to use it", async () => {
    const help = collect(runInstalled(["--help"], sandbox.root));
    expect(await help.exit).toBe(0);
    expect(help.text()).toContain("Use kiln <command> --help");
    expect(help.text()).toContain("status —");
    expect(help.text()).toContain("audit —");
  });

  it("ships inspection and complete structured help usable from an unrelated directory", async () => {
    const inventory = collect(runInstalled(["status", "--json"], sandbox.root));
    expect(await inventory.exit).toBe(0);
    expect(JSON.parse(inventory.text())).toMatchObject({ schema_version: "1", ok: true, inventory_complete: true, counts: { live_controllers: 0 }, runs: [] });
    for (const path of [["handoff"], ["message"], ["take-over"], ["reply"], ["audit", "submit"], ["delivery", "evidence"]]) {
      const help = collect(runInstalled([...path, "--help", "--json"], sandbox.root));
      expect(await help.exit).toBe(0);
      expect(JSON.parse(help.text())).toMatchObject({ schema_version: "1", command: { path } });
    }
    expect(packedFiles).toContain("prompts/kiln-command-contracts.json");
  });

  it("omits and refuses retired workspace confirmation controls in the installed CLI", async () => {
    const help = collect(runInstalled(["--help", "--json"], sandbox.root));
    expect(await help.exit).toBe(0);
    expect(JSON.parse(help.text()).commands.map((command: { path: string[] }) => command.path.join(" "))).not.toContain("outside-confirmation");
    const retired = collect(runInstalled(["outside-confirmation", "--confirm-resolved", "--json"], sandbox.root));
    expect(await retired.exit).toBe(2);
    expect(JSON.parse(retired.text())).toMatchObject({ ok: false, errors: [{ code: "command_not_found" }] });
  });

  it("documents live controls, durable outcomes and receipt errors without tools or a controller", () => {
    const help = (path: string[], json = true) => {
      const child = spawnSync(process.execPath, [join(installedPackage, "dist/cli.js"), ...path, "--help", ...(json ? ["--json"] : [])], { cwd: sandbox.root, env: { ...sandbox.env, PATH: "" }, encoding: "utf8" });
      expect(child.status, child.stderr).toBe(0); expect(child.stderr).toBe("");
      expect(child.stdout).not.toMatch(/planned controls|Null in this inspection release|All changing forms unavailable/);
      return child.stdout;
    };
    const root = JSON.parse(help([]));
    expect(root.commands.map((c: {path: string[]}) => c.path.join(" "))).toEqual(expect.arrayContaining(["message", "take-over", "reply", "resume", "verify-and-advance", "command-status", "settings"]));
    for (const c of root.commands.filter((c: {path: string[]}) => !['run', 'add-repository', 'audit', 'delivery', 'preparation'].includes(c.path[0]!))) {
      for (const code of c.errors) expect(c.error_meanings[code], `${c.path.join(' ')} ${code}`).toMatch(/^Exit [234]:/);
    }
    const status = JSON.parse(help(["status"])).command;
    expect(status.result_fields.status_token).toContain("Opaque current");
    expect(status.result_fields.controls).toContain("live controller");
    for (const name of ["message", "take-over", "reply", "resume", "verify-and-advance", "waive-and-advance", "request-pause", "cancel-pause", "continue", "check-again", "settings"]) {
      const c = JSON.parse(help([name])).command;
      const text = help([name], false);
      for (const code of ["stale_status_token", "busy", "command_id_conflict", "operation_indeterminate"]) {
        expect(c.errors, name).toContain(code); expect(c.error_meanings[code], name).toMatch(/^Exit [234]:/); expect(text).toContain(c.error_meanings[code]);
      }
      for (const field of ["command_id", "operation", "operation.state", "operation.outcome", "operation.reason", "operation.effects.reply", "operation.effects.session", "operation.effects.plan", "run_state"]) expect(c.result_fields[field], `${name} ${field}`).toBeTruthy();
      expect(c.exits['0']).toContain("accepted");
    }
    const verify = JSON.parse(help(["verify-and-advance"])).command;
    expect(verify.error_meanings.unsent_reply_acknowledgement_required).toContain("explicit operator acknowledgement");
    const receipt = JSON.parse(help(["command-status"])).command;
    expect(receipt.error_meanings.command_not_found).toContain("no saved receipt");
    expect(receipt.exits['0']).toContain("indeterminate");
    expect(receipt.result_fields['operation.effects.reply']).toContain("submitted");
    expect(receipt.result_fields['operation.effects.reply']).toContain("provider conversation evidence");
    expect(receipt.result_fields['operation.reply_text']).toContain("not_sent");
  });

  it("inventories every command in root text and supplies usable legacy syntax, context and refusals", () => {
    const help = (path: string[], json = false) => {
      const child = spawnSync(process.execPath, [join(installedPackage, "dist/cli.js"), ...path, "--help", ...(json ? ["--json"] : [])], { cwd: sandbox.root, env: { ...sandbox.env, PATH: "" }, encoding: "utf8" });
      expect(child.status, child.stderr).toBe(0); expect(child.stderr).toBe(""); return child.stdout;
    };
    const inventory = JSON.parse(help([], true)).commands as { path: string[]; purpose: string }[];
    const expected = ["status", "logs", "handoff", "account", "settings", "command-status", "message", "take-over", "reply", "resume", "verify-and-advance", "waive-and-advance", "request-pause", "cancel-pause", "continue", "check-again", "run", "add-repository", "audit", "audit status", "audit snapshot", "audit submit", "delivery", "delivery status", "delivery assess", "delivery prepare", "delivery evidence", "preparation", "preparation status", "preparation submit"];
    expect(inventory.map(c => c.path.join(" ")).sort()).toEqual([...expected].sort());
    const root = help([]);
    for (const c of inventory) {
      expect(root).toContain(`${c.path.join(" ")} — ${c.purpose}`);
      expect(help(c.path)).toContain(c.purpose);
      expect(JSON.parse(help(c.path, true)).command.path).toEqual(c.path);
    }
    for (const group of ["audit", "delivery", "preparation"]) for (const leaf of expected.filter(name => name.startsWith(`${group} `))) expect(help([group])).toContain(`Subcommand: kiln ${leaf} --help`);
    for (const [name, usage, errors] of [
      ["run", "kiln run <PRD-path> [--resume]", ["invalid_syntax", "invalid_prd_path", "start_checks_failed", "already_running", "port_unavailable", "newer_saved_schema"]],
      ["add-repository", "kiln add-repository <folder-name>", ["invalid_syntax", "outside_workspace", "ambiguous_workspace", "controller_stopped", "controller_unreachable", "addition_refused"]],
    ] as const) {
      const c = JSON.parse(help([name], true)).command; const text = help([name]);
      expect(c.usage).toBe(usage); expect(c.errors).toEqual(errors);
      if (name === "run") expect(c.flags.resume.source).toContain("already-started execution");
      for (const error of errors) { expect(c.error_meanings[error]).toMatch(/^Exit [12]:/); expect(text).toContain(c.error_meanings[error]); }
      expect(c.flags.json.source).toContain("Help only"); expect(c.examples[0].preparation).toBeTruthy();
      expect(text).not.toContain("Existing helper-specific errors"); expect(text).not.toContain("[options]");
    }
    const preparation = JSON.parse(help(["preparation", "submit"], true)).command;
    expect(Object.keys(preparation.input_contract.fields)).toEqual(["executionId", "phaseId", "bindingId", "references"]);
    for (const code of preparation.errors) expect(preparation.error_meanings[code].length).toBeGreaterThan(30);
    const sample = preparation.examples[0]; expect(sample.preparation).toContain("status");
    expect(sample.files[sample.argv.at(-1)].references).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "git_revision" }), expect.objectContaining({ kind: "command" })]));
    expect(packedFiles).toEqual(expect.arrayContaining(["prompts/preparation-session.txt", "prompts/preparation-implementation.txt", "prompts/preparation-check-runner.mjs", "prompts/preparation-environment.mjs", "dist/engine/preparation-permissions-worker.js"]));
    const run = JSON.parse(help(["run"], true)).command;
    expect(run.arguments[0].source).toContain("docs/changes"); expect(run.limits.join(" ")).toContain("foreground");
    const add = JSON.parse(help(["add-repository"], true)).command;
    expect(add.arguments[0].source).toContain("cwd selects the PRD"); expect(add.error_meanings.addition_refused).toContain("checking/resuming");
  });

  it("ships complete helper JSON file contracts, contents and refusal meanings without Git or providers", () => {
    const help = (path: string[], json: boolean) => {
      const child = spawnSync(process.execPath, [join(installedPackage, "dist/cli.js"), ...path, "--help", ...(json ? ["--json"] : [])], { cwd: sandbox.root, env: { ...sandbox.env, PATH: "" }, encoding: "utf8" });
      expect(child.status, child.stderr).toBe(0); expect(child.stderr).toBe(""); return child.stdout;
    };
    const fields: Record<string, string[]> = {
      "audit submit": ["executionId", "activityId", "revision", "reportPath"],
      "delivery assess": ["executionId", "revision", "owner", "documentsDigest", "requirementManifestDigest", "required", "criteria", "reason", "checkpoints"],
      "delivery prepare": ["executionId", "revision", "owner", "checkpointId", "operation"],
      "delivery evidence": ["executionId", "revision", "owner", "checkpointId", "operationId", "references"],
    };
    for (const [name, required] of Object.entries(fields)) {
      const path = name.split(" "); const c = JSON.parse(help(path, true)).command;
      expect(Object.keys(c.input_contract.fields)).toEqual(expect.arrayContaining(required));
      expect(c.usage).toBe(`kiln ${name} <JSON-file>`);
      const text = help(path, false);
      for (const field of required) expect(text).toContain(field);
      expect(c.examples.length).toBeGreaterThan(0);
      for (const example of c.examples) {
        expect(example.preparation).toContain("status");
        const file = example.argv.at(-1); expect(example.files[file]).toBeDefined();
        expect(text).toContain(JSON.stringify(example.files[file], null, 2));
        expect(example.files[file].revision).toEqual(expect.any(Number));
      }
      for (const error of c.errors) expect(c.error_meanings[error].length).toBeGreaterThan(30);
      expect(text).not.toContain("existing audit/delivery contract");
      expect(c.exits).toMatchObject({ "0": expect.any(String), "1": expect.stringContaining("failure"), "2": expect.stringContaining("syntax") });
    }
    const snapshot = JSON.parse(help(["audit", "snapshot"], true)).command;
    expect(snapshot.purpose).toContain("Retired"); expect(snapshot.errors).toEqual(["malformed_request"]); expect(snapshot.input_contract).toBeUndefined();
    const submit = JSON.parse(help(["audit", "submit"], true)).command;
    for (const field of ["outcome", "summary", "completionPhases", "needsYou", "changedImplementation"]) expect(submit.input_contract.types.AuditReport).toHaveProperty(field);
    expect(submit.input_contract.types).not.toHaveProperty("MethodEvidence");
    const assess = JSON.parse(help(["delivery", "assess"], true)).command;
    expect(assess.input_contract.types.Checkpoint).toHaveProperty("requirements");
    expect(assess.input_contract.types.EvidenceRequirement).toHaveProperty("match.command");
    const prepare = JSON.parse(help(["delivery", "prepare"], true)).command;
    expect(prepare.result_fields.result).toContain("operationId");
    expect(prepare.error_meanings.unresolved).toContain("no new operation");
    for (const group of ["audit", "delivery"]) {
      const root = JSON.parse(help([], true)); const nested = JSON.parse(help([group], true));
      for (const name of Object.keys(fields).filter(name => name.startsWith(`${group} `))) {
        expect(root.commands.find((c: { path: string[] }) => c.path.join(" ") === name).input_contract).toBeDefined();
        expect(nested.subcommands.find((c: { path: string[] }) => c.path.join(" ") === name).input_contract).toBeDefined();
      }
    }
  });

  it("serves the browser view, its scripts, styles and bundled fonts, from that one install", async () => {
    const child = runInstalled(["run", `docs/prds/${FOLDER}/`], repository);
    const output = collect(child);
    try {
      await waitFor(() => /http:\/\/127\.0\.0\.1:\d+\/customer-returns/.test(output.text()), 60_000);
      const address = /http:\/\/127\.0\.0\.1:\d+\/customer-returns/.exec(output.text())![0];
      const page = await (await fetch(address)).text();
      expect(page).toContain("<title>Customer returns · Kiln</title>");
      expect(page).toMatch(/<meta name="kiln-token" content="[^"_]+">/);

      const assets = [...page.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]!);
      expect(assets.filter((path) => path.endsWith(".js"))).toHaveLength(1);
      expect(assets.filter((path) => path.endsWith(".css"))).toHaveLength(1);
      const favicon = /<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/.exec(page)?.[1];
      expect(favicon).toMatch(/^\/assets\/kiln-favicon-[^/]+\.svg$/);
      expect(assets).toContain(favicon);
      const origin = new URL(address).origin;
      const bodies = await Promise.all(assets.map(async (path) => {
        const response = await fetch(`${origin}${path}`);
        expect(response.status, path).toBe(200);
        if (path === favicon) expect(response.headers.get("content-type")).toContain("image/svg+xml");
        return response.text();
      }));
      expect(bodies[assets.indexOf(favicon!)]).toContain("<svg");
      const css = bodies[assets.findIndex((path) => path.endsWith(".css"))]!;
      const fonts = [...css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)].map((match) => match[1]!);
      expect(fonts.length).toBeGreaterThan(0);
      for (const font of [fonts.find((path) => path.includes("inter"))!, fonts.find((path) => path.includes("instrument-serif"))!, fonts.find((path) => path.includes("jetbrains-mono"))!]) {
        const response = await fetch(`${origin}${font}`);
        expect(response.status, font).toBe(200);
        expect((await response.arrayBuffer()).byteLength, font).toBeGreaterThan(1000);
      }
    } finally {
      end(child);
      await output.exit;
    }
  });
});
