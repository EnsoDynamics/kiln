// The package as npm would publish it, installed the way a person installs it (AC-INSTALL-01):
// `npm pack`, then `npm install -g` of that tarball into a temporary prefix, then the installed
// `kiln` command run against a real temporary repository. One install has to bring the command,
// the browser view with its fonts, and the prompt templates; CI runs this on macOS, Linux and
// Windows (AC-INSTALL-03).

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
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", sandbox.root], repositoryRoot)) as [{ filename: string; files: { path: string }[] }];
  packedFiles = packed[0].files.map((file) => file.path.replace(/\\/g, "/"));
  const prefix = join(sandbox.root, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", join(sandbox.root, packed[0].filename)], sandbox.root);
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
    for (const text of ["Use API billing for this PRD", "paid overflow", "per-request billing firewall", "no zero-cost guarantee", "Codex continues requiring ChatGPT sign-in"]) expect(guidance).toContain(text);
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
    expect(help.text()).toMatch(/^Usage: kiln run <PRD directory or PRD file>/);
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
