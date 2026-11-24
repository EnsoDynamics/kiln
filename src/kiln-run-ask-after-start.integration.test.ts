// `kiln run` asking where a repository is after Start (find repositories anywhere, Phase 2): a
// session's request by address path refused with where Kiln searched and kept with its phase, the
// phase's Needs you stop asking it, the stop before a phase that names repositories Kiln can't
// place, and the answers given on the page or with `kiln locate-repository`, as `kiln status`
// shows them. Real git throughout, a temporary home folder, the stand-in session and origins
// reached as github.com through an SSH stand-in.

import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Snapshot } from "./engine/snapshot.js";
import { displayPath } from "./engine/worktree-setup.js";
import { runKilnCommand } from "./kiln-command.js";
import { terminalColors } from "./terminal-output.js";
import { readPrdRecord, type PrdRecord } from "./state/records.js";
import { readRememberedLocation } from "./state/repository-locations.js";
import { prdStateDirectory, readJsonLines, stateRoot } from "./state/state-files.js";
import { waitFor, type ScenarioSession } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, installKiln, installStandIns, type Sandbox } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";

let PORTS = "";
beforeEach(async () => { PORTS = await reservePortRange(); });

interface Feature { sandbox: Sandbox; home: string; product: string; env: NodeJS.ProcessEnv; scenarioPath: string; prdPath: string }
let feature: Feature | undefined;
afterEach(() => feature?.sandbox.cleanup());

/**
 * The PRD's repository at `~/code/acme/product`, phase 1 naming `acme/returns-api` beside it, the
 * sessions given, and each further code repository at the folder given (relative to the sandbox).
 */
function createFeature(sessions: ScenarioSession[], code: Record<string, string> = {}): Feature {
  const sandbox = createSandbox();
  const home = join(sandbox.root, "home");
  mkdirSync(home, { recursive: true });
  const productOrigin = createGithubOrigin(sandbox, "acme", "product");
  const product = createRepository(sandbox, "home/code/acme/product", productOrigin.url);
  const files = prdDirectoryFiles();
  const [title, ...rest] = files["phase-1-return-intake.md"]!.split("\n");
  files["phase-1-return-intake.md"] = [title, "", "**Repositories:** acme/returns-api", ...rest].join("\n");
  commitFiles(sandbox, product, `docs/prds/${FOLDER}`, files);
  git(sandbox, product, "push", "-q", "origin", "develop");
  for (const [addressPath, at] of Object.entries({ "acme/returns-api": "home/code/acme/returns-api", ...code })) addCheckout({ sandbox }, addressPath, at);
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  installKiln(bin);
  const scenarioPath = join(sandbox.root, "scenario.json");
  writeFileSync(scenarioPath, JSON.stringify({ sessions }));
  writeFileSync(join(sandbox.root, "gh-state.json"), JSON.stringify({ pulls: [] }));
  const base = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  const env = {
    ...base,
    HOME: home,
    PATH: [bin, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter),
    KILN_STANDIN_SCENARIO: scenarioPath,
    KILN_STANDIN_GH_STATE: join(sandbox.root, "gh-state.json"),
    KILN_PORT_RANGE: PORTS,
    KILN_NO_BROWSER: "1",
  };
  feature = { sandbox, home, product, env, scenarioPath, prdPath: join(product, "docs", "prds", FOLDER) };
  return feature;
}

/** A checkout of the address path at the folder given (relative to the sandbox), its origin on GitHub. */
function addCheckout(f: Pick<Feature, "sandbox">, addressPath: string, at: string): string {
  const [owner, name] = addressPath.split("/");
  const origin = createGithubOrigin(f.sandbox, owner!, name!);
  const checkout = createRepository(f.sandbox, at, origin.url);
  git(f.sandbox, checkout, "push", "-q", "origin", "develop");
  return checkout;
}

function startKiln(f: Feature) {
  let stdout = "";
  const signals = new EventEmitter();
  let resolveAddress!: (address: string) => void;
  const address = new Promise<string>((resolve) => (resolveAddress = resolve));
  const done = runKilnCommand(["run", `docs/prds/${FOLDER}/`], {
    cwd: f.product,
    env: f.env,
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stdout += text) },
    signals,
    openBrowser: async () => ({ kind: "opened" as const }),
    onServing: resolveAddress,
  });
  const lines = () => stdout.split("\n").filter((line) => line !== "" && !line.startsWith("✗ Can’t keep this computer awake"));
  return { done, lines, signals, address };
}

async function api(address: string, token: string, method: string, path: string, body?: unknown) {
  if (method === "POST" && path === "/api/start") {
    await waitFor(async () => ((await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot).settings.metadataPending === false);
  }
  const origin = new URL(address).origin;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "X-Kiln-Token": token, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function tokenOf(address: string): Promise<string> {
  const html = await (await fetch(address)).text();
  return /<meta name="kiln-token" content="([0-9a-f]+)">/.exec(html)![1]!;
}

/** Runs one `kiln` command in-process, from the sandbox, as a bot would. */
async function kiln(f: Feature, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runKilnCommand(args, { cwd: f.sandbox.root, env: f.env, stdout: { write: (text: string) => (stdout += text) }, stderr: { write: (text: string) => (stderr += text) } });
  return { code, stdout, stderr };
}
const statusOf = async (f: Feature) => JSON.parse((await kiln(f, ["status", f.prdPath, "--json"])).stdout) as Record<string, unknown> & { status_token: string; stop: Record<string, unknown> & { locate: Record<string, unknown>[] }; controls: { name: string; available: boolean; reason: string | null }[] };

const snapshotOf = async (address: string, token: string) => (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
const recordOf = (f: Feature): PrdRecord => readPrdRecord(prdStateDirectory(stateRoot(f.env), f.product, "product", `docs/prds/${FOLDER}`))!;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function started(f: Feature) {
  const run = startKiln(f);
  const address = await run.address;
  const token = await tokenOf(address);
  expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
  return { run, address, token };
}

describe("asking where a repository is after Start", () => {
  it("refuses a session's request it can't place, asks it at the phase's stop, and takes the answer from kiln locate-repository (AC-SESSION-01, AC-ASK-06, AC-ASK-07)", async () => {
    const f = createFeature([{ actions: [{ addRepository: "acme-labs/ledger" }, { addRepository: "Acme-Labs/Ledger" }, { result: "Partway: I need the ledger repository." }] }]);
    const { run, address, token } = await started(f);
    const searchedFrom = displayPath(join(f.home, "code", "acme"));

    // AC-SESSION-01: nothing added, the session told where Kiln searched, and the request kept with its phase once.
    await waitFor(() => recordOf(f).phases["1"]?.stop !== undefined);
    const refusal = `Kiln couldn’t find a checkout of acme-labs/ledger. It searched outward from ${searchedFrom}/, never above your home folder. Nothing was added.\n`;
    expect(readJsonLines(`${f.scenarioPath}.add-repository.jsonl`)).toEqual([
      { name: "acme-labs/ledger", status: 1, stdout: "", stderr: refusal },
      { name: "Acme-Labs/Ledger", status: 1, stdout: "", stderr: refusal.replace("acme-labs/ledger", "Acme-Labs/Ledger") },
    ]);
    expect(recordOf(f).repositories.map((entry) => entry.name)).toEqual(["product", "returns-api"]);
    expect(recordOf(f).phases["1"]!.repositoryRequests).toEqual([{ addressPath: "acme-labs/ledger", at: expect.any(String) }]);

    // AC-ASK-07: the phase's Needs you stop asks the same question, once its search finishes; the phase never stopped for the request alone.
    await waitFor(() => recordOf(f).phases["1"]!.stop!.locate !== undefined);
    expect(recordOf(f).phases["1"]!.stop!.kind).toBe("done_check");
    expect(recordOf(f).phases["1"]!.stop!.locate).toEqual([{ kind: "where", repository: "acme-labs/ledger", searchedFrom: join(f.home, "code", "acme"), checkouts: [], found: 0 }]);
    const snapshot = await snapshotOf(address, token);
    expect(snapshot.needsYou!.locate).toEqual([{ kind: "where", repository: "acme-labs/ledger", label: "ledger", searchedFrom, checkouts: [], found: 0 }]);

    // AC-ASK-06: kiln status lists the question and the command, with whether it is available.
    let status = await statusOf(f);
    expect(status.stop.locate).toEqual([{
      kind: "where", address_path: "acme-labs/ledger", label: "ledger", phase_file: null, searched_from: join(f.home, "code", "acme"), searched_to: null, checkouts: [],
      available: true, reason: null,
      next_argv: ["kiln", "locate-repository", f.prdPath, "acme-labs/ledger", "<folder>", "--only-if-status-matches", status.status_token, "--command-id", "<new-command-id>"],
      next_command: expect.stringContaining("kiln locate-repository"),
    }]);
    expect(status.controls.find((control) => control.name === "locate-repository")).toMatchObject({ available: true, reason: null });
    const text = (await kiln(f, ["status", f.prdPath])).stdout;
    expect(text).toMatch(/\n {10}A session asked for ledger: Kiln couldn’t find a checkout of acme-labs\/ledger\.\n/);
    expect(text).toContain(`\n          It searched outward from ${searchedFrom}/, never above your home folder.\n`);
    expect(text).toMatch(/\n {10}Controls: locate-repository \(available\)/);
    // On a terminal, the questions are light grey and the Controls line grey, as state 7 draws (AC-SEE-05).
    let coloured = "";
    await runKilnCommand(["status", f.prdPath], { cwd: f.sandbox.root, env: { ...f.env, NO_COLOR: "" }, stdout: { isTTY: true, write: (chunk: string) => (coloured += chunk) }, stderr: { write: () => true } });
    const colors = terminalColors({ isTTY: true }, {});
    expect(coloured).toContain(`          ${colors.lightGrey("A session asked for ledger: Kiln couldn’t find a checkout of acme-labs/ledger.")}\n`);
    expect(coloured).toContain(`          ${colors.lightGrey(`It searched outward from ${searchedFrom}/, never above your home folder.`)}\n`);
    const controls = /\n {10}(Controls: locate-repository \(available\)[^\n]*)\n/.exec(text)![1]!;
    expect(coloured).toContain(`\n          ${colors.grey(controls)}\n`);
    // The capabilities handshake names the new command.
    const capabilities = await (await fetch(`${new URL(address).origin}/api/control/v1/capabilities`, { headers: { "X-Kiln-Token": recordOf(f).token } })).json() as { protocol_minor: number; features: string[] };
    expect(capabilities.protocol_minor).toBe(3);
    expect(capabilities.features).toContain("locate_repository");

    // Refused at admission: no stop asking about that repository, or a stale token (exit 3); a missing folder is invalid input (exit 2).
    let answer = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/other", "/tmp/other", "--only-if-status-matches", status.status_token, "--command-id", "c-other", "--json"]);
    expect(answer.code).toBe(3);
    expect(JSON.parse(answer.stdout).errors[0]).toMatchObject({ code: "control_unavailable", message: "No stop is asking where acme-labs/other is." });
    answer = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", "/tmp/ledger", "--only-if-status-matches", `${recordOf(f).executionId}:stale`, "--command-id", "c-stale", "--json"]);
    expect(answer.code).toBe(3);
    expect(JSON.parse(answer.stdout).errors[0].code).toBe("stale_status_token");
    answer = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", "", "--only-if-status-matches", status.status_token, "--command-id", "c-empty", "--json"]);
    expect(answer.code).toBe(2);
    expect(JSON.parse(answer.stdout).errors[0].code).toBe("invalid_input");

    // AC-ASK-03: a folder the checks refuse settles completed, exit 0, with the failed check as its reason; nothing is remembered.
    status = await statusOf(f);
    answer = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", "work/ledger", "--only-if-status-matches", status.status_token, "--command-id", "c-relative"]);
    expect(answer.code).toBe(0);
    await waitFor(async () => (await kiln(f, ["command-status", f.prdPath, "--command-id", "c-relative"])).stdout.includes("completed."));
    expect((await kiln(f, ["command-status", f.prdPath, "--command-id", "c-relative"])).stdout).toContain("Operation ");
    expect((await kiln(f, ["command-status", f.prdPath, "--command-id", "c-relative"])).stdout.split("\n")[0]).toMatch(/^Operation \S+ completed\. Kiln didn’t accept work\/ledger: Enter a full path, starting with \/ or ~\.$/);
    expect(JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "c-relative", "--json"])).stdout).operation).toMatchObject({ state: "completed", outcome: "folder_not_accepted", reason: "Enter a full path, starting with / or ~.", effects: { plan: "not_advanced", session: "not_started" } });
    expect(readRememberedLocation(f.env, "acme-labs/ledger")).toEqual({ kind: "none" });

    // A folder whose checkout Git can't read fails as check_unavailable (exit 4); nothing is remembered and the question stays.
    const broken = join(f.sandbox.root, "volumes", "broken", "ledger");
    mkdirSync(broken, { recursive: true });
    git(f.sandbox, broken, "init", "-q");
    writeFileSync(join(broken, ".git", "config"), "[[[\n");
    status = await statusOf(f);
    const brokenArgs = ["locate-repository", f.prdPath, "acme-labs/ledger", broken, "--only-if-status-matches", status.status_token, "--command-id", "c-broken", "--json"];
    expect((await kiln(f, brokenArgs)).code).toBe(0);
    await waitFor(async () => JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "c-broken", "--json"])).stdout).operation.state === "failed");
    // Reading the receipt is a successful read; the command itself, replayed by its id, reports the failure.
    const read = await kiln(f, ["command-status", f.prdPath, "--command-id", "c-broken", "--json"]);
    expect(read.code).toBe(0);
    expect(JSON.parse(read.stdout).operation).toMatchObject({ state: "failed", outcome: "check_unavailable", reason: `Couldn't read ${broken}'s checkout: fatal: bad config line 1 in file .git/config`, effects: { plan: "not_advanced", session: "not_started" } });
    answer = await kiln(f, brokenArgs);
    expect(answer.code).toBe(4);
    expect(JSON.parse(answer.stdout).errors[0]).toMatchObject({ code: "check_unavailable", message: `Couldn't read ${broken}'s checkout: fatal: bad config line 1 in file .git/config` });
    expect(readRememberedLocation(f.env, "acme-labs/ledger")).toEqual({ kind: "none" });
    expect(recordOf(f).phases["1"]!.stop!.locate).toHaveLength(1);

    // A checkout the search doesn't reach, answered from the command line: remembered, the request dropped, the question closed.
    const ledger = addCheckout(f, "acme-labs/ledger", "volumes/work/ledger");
    status = await statusOf(f);
    const before = status.status_token;
    answer = await kiln(f, ["locate-repository", f.prdPath, "Acme-Labs/Ledger", ledger, "--only-if-status-matches", before, "--command-id", "bot-0412"]);
    expect(answer.code).toBe(0);
    expect(answer.stdout.split("\n")[0]).toMatch(/^Operation \S+ (accepted|completed)/);
    await waitFor(async () => JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-0412", "--json"])).stdout).operation.state === "completed");
    const located = await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-0412"]);
    expect(located.stdout.split("\n")[0]).toMatch(new RegExp(`^Operation \\S+ completed\\. acme-labs/ledger is at ${escaped(displayPath(ledger))}\\. Kiln will remember that on this computer\\.$`));
    expect(JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-0412", "--json"])).stdout).operation).toMatchObject({ outcome: "located", effects: { plan: "not_advanced", session: "not_started" }, located: { repository: "acme-labs/ledger", folder: ledger } });
    expect(readRememberedLocation(f.env, "acme-labs/ledger")).toMatchObject({ kind: "remembered", location: { folder: ledger } });
    expect(run.lines()).toContainEqual(expect.stringMatching(new RegExp(`Located acme-labs/ledger at ${escaped(displayPath(ledger))}\\. Kiln will remember that on this computer\\.$`)));
    expect(recordOf(f).phases["1"]!.repositoryRequests).toBeUndefined();
    expect(recordOf(f).phases["1"]!.stop!.locate).toBeUndefined();
    // The question closing changed the status token, and the stop stays.
    status = await statusOf(f);
    expect(status.status_token).not.toBe(before);
    expect(status.stop.locate).toEqual([]);
    expect(recordOf(f).phases["1"]!.stop!.kind).toBe("done_check");
    // A retry with the same command id replays its receipt: the same operation, and no second effect.
    const operationId = JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-0412", "--json"])).stdout).operation.id;
    const replay = await kiln(f, ["locate-repository", f.prdPath, "Acme-Labs/Ledger", ledger, "--only-if-status-matches", before, "--command-id", "bot-0412", "--json"]);
    expect(replay.code).toBe(0);
    expect(JSON.parse(replay.stdout).operation).toMatchObject({ id: operationId, state: "completed", outcome: "located" });
    expect(run.lines().filter((line) => line.includes("Located acme-labs/ledger"))).toHaveLength(1);
    run.signals.emit("SIGINT");
    await run.done;
    // With Kiln no longer running, the command is refused: no live controller to answer it (exit 4).
    const stopped = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", ledger, "--only-if-status-matches", before, "--command-id", "bot-after", "--json"]);
    expect(stopped.code).toBe(4);
    expect(JSON.parse(stopped.stdout).errors[0]).toMatchObject({ code: "controller_unreachable", message: "Changing work requires its matching live controller." });
  }, 120_000);

  it("lets a phase whose session asked for a repository it can't place land with no stop (AC-ASK-07, ASK-003)", async () => {
    const f = createFeature([
      { actions: [{ addRepository: "acme-labs/ledger" }, { write: { repository: "product", path: "src/intake.txt", content: "intake\n" } }, { close: true }, { commit: "feat: intake", repository: "product" }, { push: true, repository: "product" }, { result: "Phase 1 landed." }] },
      { actions: [{ result: "Phase 2b partway." }] },
    ]);
    const { run } = await started(f);
    await waitFor(() => recordOf(f).phases["1"]?.doneAt !== undefined || recordOf(f).phases["1"]?.stop !== undefined, 60_000);
    expect(readJsonLines(`${f.scenarioPath}.add-repository.jsonl`)).toMatchObject([{ name: "acme-labs/ledger", status: 1 }]);
    // Phase 1 never stopped: the refused request alone holds nothing.
    expect(recordOf(f).phases["1"]!.stop).toBeUndefined();
    expect(recordOf(f).phases["1"]!.doneAt).toEqual(expect.any(String));
    // The next phase starts.
    await waitFor(() => (recordOf(f).phases["2b"]?.sessionIds.length ?? 0) > 0, 60_000);
    run.signals.emit("SIGINT");
    await run.done;
  }, 120_000);

  it("adds the repository when the session asks again after the answer and Resume (AC-ASK-07, AC-ASK-04)", async () => {
    const f = createFeature([
      { actions: [{ addRepository: "acme-labs/ledger" }, { result: "Partway: I need the ledger repository." }] },
      { actions: [{ addRepository: "acme-labs/ledger" }, { result: "Partway again." }] },
    ]);
    const { run, address, token } = await started(f);
    await waitFor(() => recordOf(f).phases["1"]?.stop?.locate !== undefined);
    const ledger = addCheckout(f, "acme-labs/ledger", "volumes/work/ledger");
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/ledger", folder: ledger })).toMatchObject({ status: 200, body: { outcome: "located" } });
    const target = (await snapshotOf(address, token)).needsYou!.phaseRecovery!.target;
    expect(await api(address, token, "POST", "/api/resume", { target: target.live ?? target })).toMatchObject({ status: 200 });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.add-repository.jsonl`).length === 2, 60_000);
    const [, again] = readJsonLines(`${f.scenarioPath}.add-repository.jsonl`) as { status: number; stdout: string }[];
    expect(again!.status).toBe(0);
    expect(again!.stdout).toMatch(/^Added ledger at .*ledger, on feature\/\S+ from develop\.\n/);
    expect(recordOf(f).repositories.find((entry) => entry.name === "ledger")).toMatchObject({ github: "acme-labs/ledger", mainCheckoutPath: ledger, addedInPhase: "1" });
    run.signals.emit("SIGINT");
    await run.done;
  }, 120_000);

  it("asks at once on a stop already open when its session asks, and answers with the stop's sentence (technical design, \"A session's request\")", async () => {
    // Phase 1 stops; the person reopens its conversation, which asks for a repository Kiln finds two checkouts of.
    const f = createFeature([{ actions: [{ result: "Partway." }] }], { "acme-labs/ledger": "home/code/acme-labs/ledger" });
    const copy = join(f.home, "code", "archive", "ledger");
    git(f.sandbox, f.sandbox.root, "clone", "-q", join(f.home, "code", "acme-labs", "ledger"), copy);
    git(f.sandbox, copy, "remote", "set-url", "origin", "git@github.com:acme-labs/ledger.git");
    const { run, address, token } = await started(f);
    await waitFor(() => recordOf(f).phases["1"]?.stop !== undefined);
    const before = (await statusOf(f)).status_token;
    const asked = await api(address, token, "POST", "/api/repositories", { name: "acme-labs/ledger" });
    expect(asked.status).toBe(422);
    expect(asked.body.reason).toBe(`Kiln found 2 checkouts of acme-labs/ledger and needs a person to say which to use: ${displayPath(join(f.home, "code", "acme-labs", "ledger"))} and ${displayPath(copy)}. Nothing was added. The stop in Kiln now asks which checkout to use.`);
    // Saved on the open stop at once, so the page and kiln status show it, with a new status token.
    expect(recordOf(f).phases["1"]!.stop!.locate).toMatchObject([{ kind: "which", repository: "acme-labs/ledger", found: 2 }]);
    const status = await statusOf(f);
    expect(status.status_token).not.toBe(before);
    const pick = ["kiln", "locate-repository", f.prdPath, "acme-labs/ledger", copy, "--only-if-status-matches", status.status_token, "--command-id", "<new-command-id>"];
    expect(status.stop.locate[0]).toMatchObject({ kind: "which", address_path: "acme-labs/ledger", checkouts: [{ folder: join(f.home, "code", "acme-labs", "ledger"), pickable: true }, { folder: copy, pickable: true, next_argv: pick }] });
    // AC-ASK-06: a bot picks one of the checkouts found by running that checkout's command line.
    const picked = await kiln(f, [...pick.slice(1, -1), "bot-pick", "--json"]);
    expect(picked.code).toBe(0);
    await waitFor(async () => JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-pick", "--json"])).stdout).operation.state === "completed");
    expect(JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-pick", "--json"])).stdout).operation).toMatchObject({ outcome: "located", located: { repository: "acme-labs/ledger", folder: copy } });
    expect(readRememberedLocation(f.env, "acme-labs/ledger")).toMatchObject({ kind: "remembered", location: { folder: copy } });
    expect((await snapshotOf(address, token)).needsYou!.locate).toBeUndefined();
    // With no stop asking, the page's answer is refused.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/ledger", folder: copy })).toMatchObject({ status: 409 });
    run.signals.emit("SIGINT");
    await run.done;
  }, 120_000);

  it("stops before a phase that names repositories Kiln can't place, asks each, and starts the phase once both are answered (AC-ASK-07, AC-ASK-06)", async () => {
    const phase2b = prdDirectoryFiles()["phase-2b-store-credit.md"]!.split("\n");
    const named = [phase2b[0], "", "**Repositories:** acme-labs/inventory, acme-labs/ledger", ...phase2b.slice(1)].join("\n");
    const f = createFeature([
      // Phase 1 edits phase 2b to name two repositories Kiln can't find, then closes.
      { actions: [{ write: { repository: "product", path: `docs/prds/${FOLDER}/phase-2b-store-credit.md`, content: named } }, { close: true }, { commit: "docs: close phase 1", repository: "product" }, { push: true, repository: "product" }, { result: "Phase 1 landed." }] },
      { actions: [{ result: "Phase 2b started." }] },
    ]);
    const { run, address, token } = await started(f);
    await waitFor(() => recordOf(f).phases["2b"]?.stop !== undefined, 60_000);
    const stop = recordOf(f).phases["2b"]!.stop!;
    // The plan stop asks every question at once; its facts are the question facts, in plan order.
    expect(stop.kind).toBe("plan");
    expect(stop.checks).toMatchObject([{ name: "Phase plan reads", passed: false, facts: [
      "phase-2b-store-credit.md names acme-labs/inventory, and Kiln couldn’t find a checkout of it",
      "phase-2b-store-credit.md names acme-labs/ledger, and Kiln couldn’t find a checkout of it",
    ] }]);
    expect(stop.locate!.map((question) => [question.repository, question.phaseFile])).toEqual([["acme-labs/inventory", "phase-2b-store-credit.md"], ["acme-labs/ledger", "phase-2b-store-credit.md"]]);
    expect((await snapshotOf(address, token)).needsYou!.locate!.map((question) => [question.label, question.phaseFile])).toEqual([["inventory", "phase-2b-store-credit.md"], ["ledger", "phase-2b-store-credit.md"]]);
    // Mockup state 7: kiln status's text form for the plan stop.
    const text = (await kiln(f, ["status", f.prdPath])).stdout;
    expect(text).toContain("Phase plan reads: Kiln couldn’t find a checkout of acme-labs/inventory.");
    expect(text).toContain("Phase plan reads: Kiln couldn’t find a checkout of acme-labs/ledger.");
    const searchedFrom = displayPath(join(f.home, "code", "acme"));
    for (const repository of ["inventory", "ledger"]) {
      expect(text).toMatch(new RegExp(`\\n( +)Phase plan reads: Kiln couldn’t find a checkout of acme-labs/${repository}\\.\\n\\1It searched outward from ${escaped(searchedFrom)}/, never above your home folder\\.\\n`));
    }
    expect(text).toMatch(/\n {11}Controls: locate-repository \(available\) · waive-and-advance \(once a recheck still fails\)\n/);
    // On a terminal, the question lines light grey and the Controls line grey, as state 7 draws (AC-SEE-05).
    let coloured = "";
    await runKilnCommand(["status", f.prdPath], { cwd: f.sandbox.root, env: { ...f.env, NO_COLOR: "" }, stdout: { isTTY: true, write: (chunk: string) => (coloured += chunk) }, stderr: { write: () => true } });
    const colors = terminalColors({ isTTY: true }, {});
    expect(coloured).toContain(`           ${colors.lightGrey("Phase plan reads: Kiln couldn’t find a checkout of acme-labs/inventory.")}\n`);
    expect(coloured).toContain(`           ${colors.lightGrey(`It searched outward from ${searchedFrom}/, never above your home folder.`)}\n`);
    const controls = /\n {11}(Controls: locate-repository \(available\)[^\n]*)\n/.exec(text)![1]!;
    expect(coloured).toContain(`\n           ${colors.grey(controls)}\n`);

    // Check again with no answer searches again: a checkout cloned where the search reaches clears that question.
    addCheckout(f, "acme-labs/inventory", "home/code/acme-labs/inventory");
    expect(await api(address, token, "POST", "/api/check-again", {})).toMatchObject({ status: 200 });
    await waitFor(() => recordOf(f).phases["2b"]!.stop!.locate?.length === 1);
    expect(recordOf(f).phases["2b"]!.stop!.checks[0]!.facts).toEqual(["phase-2b-store-credit.md names acme-labs/ledger, and Kiln couldn’t find a checkout of it"]);
    // The repository found is added and stays set up, whatever happens to the phase.
    expect(recordOf(f).repositories.map((entry) => [entry.name, entry.addedInPhase])).toEqual([["product", undefined], ["returns-api", undefined], ["inventory", "2b"]]);

    // The last answer, from the command line: stored, the stop's check passes, and the phase starts.
    const ledger = addCheckout(f, "acme-labs/ledger", "volumes/work/ledger");
    const status = await statusOf(f);
    expect(status.stop.locate).toMatchObject([{ address_path: "acme-labs/ledger", phase_file: "phase-2b-store-credit.md", available: true }]);
    expect((await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", ledger, "--only-if-status-matches", status.status_token, "--command-id", "bot-ledger"])).code).toBe(0);
    await waitFor(async () => JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-ledger", "--json"])).stdout).operation.state === "completed", 60_000);
    const receipt = await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-ledger"]);
    expect(receipt.stdout.split("\n").slice(0, 2)).toEqual([
      expect.stringMatching(new RegExp(`^Operation \\S+ completed\\. acme-labs/ledger is at ${escaped(displayPath(ledger))}\\. Kiln will remember that on this computer\\.$`)),
      "Added ledger. Phase 2b · Store credit is starting.",
    ]);
    expect(JSON.parse((await kiln(f, ["command-status", f.prdPath, "--command-id", "bot-ledger", "--json"])).stdout).operation).toMatchObject({ outcome: "located_phase_starting", effects: { plan: "advanced", session: "not_started" } });
    await waitFor(() => (recordOf(f).phases["2b"]?.sessionIds.length ?? 0) > 0, 60_000);
    expect(recordOf(f).repositories.map((entry) => [entry.name, entry.mainCheckoutPath, entry.addedInPhase])).toEqual([
      ["product", f.product, undefined],
      ["returns-api", join(f.home, "code", "acme", "returns-api"), undefined],
      ["inventory", join(f.home, "code", "acme-labs", "inventory"), "2b"],
      ["ledger", ledger, "2b"],
    ]);
    run.signals.emit("SIGINT");
    await run.done;
  }, 180_000);

  it("settles located_still_stopped when the plan stop's check still fails after an answer (technical design, \"The command\")", async () => {
    const phase2b = prdDirectoryFiles()["phase-2b-store-credit.md"]!.split("\n");
    const named = [phase2b[0], "", "**Repositories:** acme-labs/inventory, acme-labs/ledger", ...phase2b.slice(1)].join("\n");
    const f = createFeature([
      { actions: [{ write: { repository: "product", path: `docs/prds/${FOLDER}/phase-2b-store-credit.md`, content: named } }, { close: true }, { commit: "docs: close phase 1", repository: "product" }, { push: true, repository: "product" }, { result: "Phase 1 landed." }] },
    ]);
    const { run, address, token } = await started(f);
    await waitFor(() => recordOf(f).phases["2b"]?.stop?.locate?.length === 2, 60_000);
    const inventory = addCheckout(f, "acme-labs/inventory", "volumes/work/inventory");
    // The page's Use this folder: remembered, and the stop still asks about ledger.
    const answer = await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/inventory", folder: inventory });
    expect(answer).toMatchObject({ status: 200, body: { outcome: "located_still_stopped" } });
    const receipt = await kiln(f, ["command-status", f.prdPath, "--command-id", String(answer.body.command_id)]);
    expect(receipt.stdout.split("\n").slice(1, 3)).toEqual(["Phase 2b · Store credit is still at Needs you:", "  phase-2b-store-credit.md names acme-labs/ledger, and Kiln couldn’t find a checkout of it"]);
    expect(recordOf(f).phases["2b"]!.stop!.locate!.map((question) => question.repository)).toEqual(["acme-labs/ledger"]);
    // A refused answer at the stop: 422, the failed check as its reason, nothing remembered.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/ledger", folder: inventory })).toMatchObject({ status: 422, body: { reason: "That checkout’s origin is acme-labs/inventory, not acme-labs/ledger." } });
    expect(readRememberedLocation(f.env, "acme-labs/ledger")).toEqual({ kind: "none" });
    run.signals.emit("SIGINT");
    await run.done;
  }, 180_000);
  it("refuses an answer before Start, shows a stop's saved questions after a restart without searching, and searches again on Check again (AC-ASK-06, AC-ASK-07)", async () => {
    const f = createFeature([{ actions: [{ addRepository: "acme-labs/ledger" }, { result: "Partway." }] }]);
    const first = startKiln(f);
    const address = await first.address;
    const token = await tokenOf(address);
    // Before Start the question is answered only on Documents found.
    const before = await statusOf(f);
    const refused = await kiln(f, ["locate-repository", f.prdPath, "acme-labs/ledger", "/tmp/ledger", "--only-if-status-matches", before.status_token, "--command-id", "c-before"]);
    expect(refused.code).toBe(3);
    expect(refused.stdout).toContain("Refused: Customer returns hasn’t started. Tell Kiln where acme-labs/ledger is on Documents found, in the browser.");
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => recordOf(f).phases["1"]?.stop?.locate !== undefined);
    first.signals.emit("SIGINT");
    await first.done;

    // A restarted kiln run shows the saved question at once, from the record, with the search still unable to reach a checkout.
    const second = startKiln(f);
    const again = await second.address;
    const againToken = await tokenOf(again);
    expect((await snapshotOf(again, againToken)).needsYou!.locate).toMatchObject([{ kind: "where", repository: "acme-labs/ledger" }]);
    expect((await statusOf(f)).stop.locate).toMatchObject([{ address_path: "acme-labs/ledger" }]);

    // Check again on the stopped session's page searches again: a checkout cloned where the search reaches drops the request without a word.
    addCheckout(f, "acme-labs/ledger", "home/code/acme-labs/ledger");
    const target = (await snapshotOf(again, againToken)).needsYou!.phaseRecovery!.target;
    expect(await api(again, againToken, "POST", "/api/check-again", { target: target.live ?? target, intent: "verify" })).toMatchObject({ status: 200 });
    await waitFor(() => recordOf(f).phases["1"]!.stop?.locate === undefined && recordOf(f).phases["1"]!.repositoryRequests === undefined);
    expect(recordOf(f).phases["1"]!.stop!.kind).toBe("done_check");
    second.signals.emit("SIGINT");
    await second.done;
  }, 120_000);
});
