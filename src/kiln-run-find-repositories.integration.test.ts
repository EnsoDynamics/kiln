// `kiln run` on a PRD whose phase documents name repositories by the path in their remote
// address (find repositories anywhere, Phase 1): found by origin wherever the search reaches,
// asked about on Documents found when Kiln can't tell, the answer remembered on this computer,
// Change, Start refused while a row asks, and two repositories with one short name kept apart.
// Real git throughout, a temporary home folder, origins reached as github.com through an SSH stand-in.

import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Snapshot } from "./engine/snapshot.js";
import { displayPath } from "./engine/worktree-setup.js";
import { runKilnCommand } from "./kiln-command.js";
import { readPrdRecord, type PrdRecord } from "./state/records.js";
import { forgetLocation, readRememberedLocation } from "./state/repository-locations.js";
import { prdStateDirectory, stateRoot } from "./state/state-files.js";
import { waitFor } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, installKiln, installStandIns, type Sandbox } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";

let PORTS = "";
beforeEach(async () => { PORTS = await reservePortRange(); });

interface Feature { sandbox: Sandbox; home: string; product: string; env: NodeJS.ProcessEnv }
let feature: Feature | undefined;
afterEach(() => feature?.sandbox.cleanup());

/**
 * The PRD's repository at `~/code/acme/product`, its phase documents naming repositories by the
 * lines given, and each code repository at the folder given (relative to the sandbox), with a
 * GitHub origin for its address path.
 */
function createFeature(lines: Record<string, string>, code: Record<string, string>): Feature {
  const sandbox = createSandbox();
  const home = join(sandbox.root, "home");
  mkdirSync(home, { recursive: true });
  const productOrigin = createGithubOrigin(sandbox, "acme", "product");
  const product = createRepository(sandbox, "home/code/acme/product", productOrigin.url);
  const files = prdDirectoryFiles();
  for (const [file, line] of Object.entries(lines)) {
    const [title, ...rest] = files[file]!.split("\n");
    files[file] = [title, "", line, ...rest].join("\n");
  }
  commitFiles(sandbox, product, `docs/prds/${FOLDER}`, files);
  git(sandbox, product, "push", "-q", "origin", "develop");
  for (const [addressPath, at] of Object.entries(code)) {
    const [owner, name] = addressPath.split("/");
    const origin = createGithubOrigin(sandbox, owner!, name!);
    const checkout = createRepository(sandbox, at, origin.url);
    git(sandbox, checkout, "push", "-q", "origin", "develop");
  }
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  installKiln(bin);
  const scenarioPath = join(sandbox.root, "scenario.json");
  writeFileSync(scenarioPath, JSON.stringify({ sessions: [] }));
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
  feature = { sandbox, home, product, env };
  return feature;
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

/** A view connecting to the event stream, as a page load does: on a page a reset built, the start checks run again first. */
async function connectOnce(address: string, token: string): Promise<Snapshot> {
  const abort = new AbortController();
  const response = await fetch(`${new URL(address).origin}/api/events?token=${token}`, { signal: abort.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("The event stream closed before a snapshot.");
      buffer += value;
      const block = buffer.split("\n\n").find((one) => /^event: snapshot$/m.test(one));
      if (block) return JSON.parse(/^data: (.*)$/m.exec(block)![1]!) as Snapshot;
    }
  } finally { abort.abort(); }
}

const snapshotOf = async (address: string, token: string) => (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
const recordOf = (f: Feature): PrdRecord => readPrdRecord(prdStateDirectory(stateRoot(f.env), f.product, "product", `docs/prds/${FOLDER}`))!;

describe("kiln run on a plan that names repositories by their address path", () => {
  it("finds one by its origin, asks where another is, remembers the answer, offers Change, and starts once nothing asks", async () => {
    const f = createFeature(
      { "phase-1-return-intake.md": "**Repositories:** acme/returns-api", "phase-3-returns-dashboard.md": "**Repositories:** acme-labs/storefront, returns-api" },
      { "acme/returns-api": "home/code/acme/returns-api", "acme-labs/storefront": "volumes/work/storefront" },
    );
    const storefront = join(f.sandbox.root, "volumes", "work", "storefront");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);

    // AC-SEE-02: the count of repositories to locate replaces "all checks passed", and the line under it says what to tell Kiln.
    await waitFor(() => kiln.lines().length >= 2);
    expect(kiln.lines()[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs, 3 repositories  ·  1 repository to locate");
    expect(kiln.lines()[1]).toBe(`● Opened ${address}. Tell Kiln where acme-labs/storefront is there, then review it and press Start.`);

    // AC-ASK-01, AC-SEE-01: the row asks, the others show their address path and checkout; a folder name and an address path for returns-api are one row.
    let snapshot = await snapshotOf(address, token);
    expect(snapshot.feature.multiRepository).toBe(true);
    expect(snapshot.repositories.map((row) => [row.name, row.label, row.addressPath, row.checkoutFolder, row.located, row.question?.kind])).toEqual([
      ["product", "product", "acme/product", displayPath(f.product), undefined, undefined],
      // Phase 3 also names it by folder name, so that folder is its checkout, with no search (Names, step 4).
      ["returns-api", "returns-api", "acme/returns-api", displayPath(join(f.home, "code", "acme", "returns-api")), "beside", undefined],
      ["storefront", "storefront", "acme-labs/storefront", undefined, undefined, "where"],
    ]);
    expect(snapshot.repositories[2]!.question).toMatchObject({ repository: "acme-labs/storefront", searchedFrom: displayPath(join(f.home, "code", "acme")), checkouts: [], found: 0 });
    expect(snapshot.documents!.checks.find((check) => check.locate)).toEqual({ name: "1 repository to locate", passed: true, locate: true });
    expect(snapshot.settings.startBlockedBy).toBe("Tell Kiln where acme-labs/storefront is to start.");
    // Each phase's repositories are shown by label.
    expect(snapshot.documents!.plan!.phases.find((phase) => phase.id === "3")!.repositories).toEqual(["storefront", "returns-api"]);

    // Start is refused while a row asks.
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 409, body: { ok: false, reason: "Tell Kiln where acme-labs/storefront is to start." } });

    // AC-ASK-03: a refused answer says which check failed, beside the field, and nothing is remembered.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "ACME-LABS/Storefront", folder: "volumes/work/storefront" })).toEqual({ status: 422, body: { ok: false, reason: "Enter a full path, starting with / or ~." } });
    snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories[2]!.question!.fieldError).toBe("Enter a full path, starting with / or ~.");
    expect(readRememberedLocation(f.env, "acme-labs/storefront")).toEqual({ kind: "none" });
    // Every other failed check is refused the same way: a worktree, and a checkout of another repository.
    const worktree = join(f.sandbox.root, "volumes", "wt-storefront");
    git(f.sandbox, storefront, "worktree", "add", "-q", "-b", "wt", worktree);
    const wrong = createRepository(f.sandbox, "volumes/work/old", "git@github.com:acme/storefront-old.git");
    for (const [folder, reason] of [
      [worktree, `That folder is a worktree of ${displayPath(storefront)}. Give the checkout itself.`],
      [wrong, "That checkout’s origin is acme/storefront-old, not acme-labs/storefront."],
    ] as const) {
      expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder })).toEqual({ status: 422, body: { ok: false, reason } });
      snapshot = await snapshotOf(address, token);
      expect(snapshot.repositories[2]!.question!.fieldError).toBe(reason);
      expect(snapshot.repositories[2]!.checkoutFolder).toBeUndefined();
      expect(readRememberedLocation(f.env, "acme-labs/storefront")).toEqual({ kind: "none" });
    }
    git(f.sandbox, storefront, "worktree", "remove", "--force", worktree);
    git(f.sandbox, storefront, "branch", "-q", "-D", "wt");
    // Only a repository a row asks about can be answered.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme/returns-api", folder: storefront })).toMatchObject({ status: 409 });

    // AC-ASK-04: an accepted answer is remembered on this computer, and the terminal says so.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: storefront })).toEqual({ status: 200, body: { repository: "acme-labs/storefront", folder: storefront } });
    expect(readRememberedLocation(f.env, "acme-labs/storefront")).toMatchObject({ kind: "remembered", location: { addressPath: "acme-labs/storefront", folder: storefront } });
    expect(kiln.lines()).toContainEqual(expect.stringMatching(new RegExp(`^ ?\\d+:\\d\\d  Located acme-labs/storefront at ${storefront.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. Kiln will remember that on this computer\\.$`)));
    snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories[2]).toMatchObject({ name: "storefront", addressPath: "acme-labs/storefront", checkoutFolder: displayPath(storefront), located: "answer" });
    expect(snapshot.repositories[2]!.question).toBeUndefined();
    expect(snapshot.documents!.checks.map((check) => check.name)).toContain("Repositories found on this computer");
    expect(snapshot.settings.startBlockedBy).toBeUndefined();

    // AC-ASK-05: Change asks again with the remembered folder in the field; the answer stands until another is accepted.
    expect(await api(address, token, "POST", "/api/repository-location/change", { repository: "acme-labs/storefront" })).toEqual({ status: 200, body: { ok: true } });
    snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories[2]!.question).toMatchObject({ kind: "where", field: displayPath(storefront) });
    expect(readRememberedLocation(f.env, "acme-labs/storefront").kind).toBe("remembered");
    // Change is offered only for a remembered answer.
    expect(await api(address, token, "POST", "/api/repository-location/change", { repository: "acme/returns-api" })).toMatchObject({ status: 409 });
    // An answer accepted after Change replaces the remembered one.
    const answeredBefore = (readRememberedLocation(f.env, "acme-labs/storefront") as { location: { answeredAt: string } }).location.answeredAt;
    const copy = join(f.sandbox.root, "volumes", "copy", "storefront");
    git(f.sandbox, f.sandbox.root, "clone", "-q", storefront, copy);
    git(f.sandbox, copy, "remote", "set-url", "origin", "git@github.com:acme-labs/storefront.git");
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: copy })).toMatchObject({ status: 200 });
    expect(readRememberedLocation(f.env, "acme-labs/storefront")).toMatchObject({ kind: "remembered", location: { folder: copy } });
    expect((readRememberedLocation(f.env, "acme-labs/storefront") as { location: { answeredAt: string } }).location.answeredAt >= answeredBefore).toBe(true);
    expect((await snapshotOf(address, token)).repositories[2]).toMatchObject({ checkoutFolder: displayPath(copy), located: "answer" });
    // Changed back to the first folder for the rest of the run.
    expect(await api(address, token, "POST", "/api/repository-location/change", { repository: "acme-labs/storefront" })).toMatchObject({ status: 200 });
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: storefront })).toMatchObject({ status: 200 });
    // Kiln writes nothing into any repository or document (AC-ASK-04).
    expect(git(f.sandbox, f.product, "status", "--porcelain")).toBe("");
    expect(git(f.sandbox, storefront, "status", "--porcelain")).toBe("");

    // Start sets each repository up from the checkout found or given, once the base check the answer began is done, as the page waits.
    await waitFor(async () => { const now = await snapshotOf(address, token); return now.settings.baseCheck !== "checking" && now.repositories.every((row) => row.baseCheck !== "checking"); });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => recordOf(f).setupCompletedAt !== undefined);
    const workspace = join(f.home, "code", "acme", ".worktrees", FOLDER);
    expect(recordOf(f).repositories.map((entry) => [entry.name, entry.kind, entry.mainCheckoutPath, entry.github, entry.shortName])).toEqual([
      ["product", "prd", f.product, "acme/product", undefined],
      ["returns-api", "named", join(f.home, "code", "acme", "returns-api"), "acme/returns-api", undefined],
      ["storefront", "named", storefront, "acme-labs/storefront", undefined],
    ]);
    expect(existsSync(join(workspace, "storefront"))).toBe(true);
    // AC-SEE-04: the settings while Kiln works show each row's address path and checkout, fixed, with no Change.
    snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories.map((row) => [row.label, row.addressPath, row.checkoutFolder, row.fixed, row.located])).toEqual([
      ["product", "acme/product", displayPath(f.product), true, undefined],
      ["returns-api", "acme/returns-api", displayPath(join(f.home, "code", "acme", "returns-api")), true, undefined],
      ["storefront", "acme-labs/storefront", displayPath(storefront), true, undefined],
    ]);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  }, 90_000);

  it("gives two repositories with one short name separate worktree folders and shows both by their whole path", async () => {
    const f = createFeature(
      { "phase-1-return-intake.md": "**Repositories:** acme/admin", "phase-3-returns-dashboard.md": "**Repositories:** acme-labs/admin" },
      { "acme/admin": "home/code/acme/admin", "acme-labs/admin": "home/code/acme-labs/admin" },
    );
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    let snapshot = await snapshotOf(address, token);
    // AC-FOLDER-02: both by their whole address path, on the rows and the plan.
    expect(snapshot.repositories.map((row) => [row.name, row.label, row.located, row.checkoutFolder])).toEqual([
      ["product", "product", undefined, displayPath(f.product)],
      // Each found by its origin, one checkout each, used without asking (AC-FIND-01).
      ["acme+admin", "acme/admin", "search", displayPath(join(f.home, "code", "acme", "admin"))],
      ["acme-labs+admin", "acme-labs/admin", "search", displayPath(join(f.home, "code", "acme-labs", "admin"))],
    ]);
    expect(snapshot.documents!.plan!.phases.find((phase) => phase.id === "1")!.repositories).toEqual(["acme/admin"]);
    // A base is chosen by Kiln's name for the repository.
    expect(await api(address, token, "POST", "/api/settings", { bases: { "acme-labs+admin": "develop" } })).toMatchObject({ status: 200 });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => recordOf(f).setupCompletedAt !== undefined);
    // AC-FOLDER-01: each its own worktree folder, built from the whole path, with its short name kept beside it.
    const workspace = join(f.home, "code", "acme", ".worktrees", FOLDER);
    expect(recordOf(f).repositories.map((entry) => [entry.name, entry.shortName, entry.worktreePath])).toEqual([
      ["product", undefined, expect.stringContaining("product")],
      ["acme+admin", "admin", displayPath(join(workspace, "acme+admin"))],
      ["acme-labs+admin", "admin", displayPath(join(workspace, "acme-labs+admin"))],
    ]);
    expect(git(f.sandbox, join(workspace, "acme-labs+admin"), "remote", "get-url", "origin").trim()).toBe("git@github.com:acme-labs/admin.git");
    snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories.map((row) => row.label)).toEqual(["product", "acme/admin", "acme-labs/admin"]);
    expect(kiln.lines()).toContainEqual(expect.stringMatching(/Started {2}· {2}feature\/customer-returns in 3 repositories$/));
    // kiln status's heading names each by its label, never Kiln's name for it (AC-FOLDER-02).
    let status = "";
    // The heading leads the progress block, which shows once phase 1 has a row.
    await waitFor(async () => {
      status = "";
      await runKilnCommand(["status", join(f.product, "docs", "prds", FOLDER)], { cwd: f.sandbox.root, env: f.env, stdout: { write: (text: string) => (status += text) }, stderr: { write: () => true } });
      return status.startsWith("Customer returns · ");
    });
    expect(status.split("\n")[0]).toBe(`Customer returns · product, acme/admin, acme-labs/admin · docs/prds/${FOLDER}`);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  }, 90_000);

  it("labels a plan folder name by the repository its folder reaches, and the PRD's repository in the header and the clean check (AC-FOLDER-02)", async () => {
    const f = createFeature(
      { "phase-1-return-intake.md": "**Repositories:** acme-labs/admin, other/product", "phase-3-returns-dashboard.md": "**Repositories:** admin" },
      // `admin` beside the PRD's repository is acme/admin; acme-labs/admin, first in plan order, shares its short name.
      { "acme/admin": "home/code/acme/admin", "acme-labs/admin": "home/code/acme-labs/admin", "other/product": "home/code/other/product" },
    );
    const kiln = startKiln(f);
    const address = await kiln.address;
    const snapshot = await snapshotOf(address, await tokenOf(address));
    const phases = snapshot.documents!.plan!.phases;
    expect(phases.find((phase) => phase.id === "1")!.repositories).toEqual(["acme-labs/admin", "other/product"]);
    expect(phases.find((phase) => phase.id === "3")!.repositories).toEqual(["acme/admin"]);
    // The PRD's repository shares its short name with other/product, so it is shown by its address path.
    expect(snapshot.feature).toMatchObject({ repositoryName: "product", repositoryLabel: "acme/product" });
    expect(snapshot.documents!.checks.map((check) => check.name)).toContain("Working tree of acme/product is clean");
    kiln.signals.emit("SIGINT");
    await kiln.done;
  }, 90_000);

  it("reports another start check that fails as today, and asks only once it passes (AC-ASK-01)", async () => {
    const f = createFeature({ "phase-3-returns-dashboard.md": "**Repositories:** acme-labs/storefront" }, { "acme-labs/storefront": "volumes/work/storefront" });
    writeFileSync(join(f.product, "notes.txt"), "work in progress\n");
    const kiln = startKiln(f);
    expect(await kiln.done).toBe(1);
    expect(kiln.lines().some((line) => line.includes("has uncommitted changes in 1 file: notes.txt"))).toBe(true);
    expect(kiln.lines().join("\n")).not.toContain("to locate");
    // Once the other check passes, Kiln asks.
    const { rmSync } = await import("node:fs");
    rmSync(join(f.product, "notes.txt"));
    const again = startKiln(f);
    await again.address;
    await waitFor(() => again.lines().length >= 1);
    expect(again.lines()[0]).toMatch(/ {2}· {2}1 repository to locate$/);
    again.signals.emit("SIGINT");
    await again.done;
  });

  it("on a page a reset built, reports a failing start check and asks only once a reload finds it passing (AC-ASK-01)", async () => {
    const f = createFeature({ "phase-3-returns-dashboard.md": "**Repositories:** acme-labs/storefront" }, { "acme-labs/storefront": "volumes/work/storefront" });
    writeFileSync(f.env.KILN_STANDIN_SCENARIO!, JSON.stringify({ sessions: [{ actions: [{ result: "Waiting for a decision." }] }] }));
    const storefront = join(f.sandbox.root, "volumes", "work", "storefront");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: storefront })).toMatchObject({ status: 200 });
    await waitFor(async () => { const now = await snapshotOf(address, token); return now.settings.baseCheck !== "checking" && now.repositories.every((row) => row.baseCheck !== "checking"); });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(async () => (await snapshotOf(address, token)).reset?.available === true, 60_000);

    // Another start check fails after the reset: an uncommitted file in the PRD's checkout.
    writeFileSync(join(f.product, "notes.txt"), "work in progress\n");
    const before = await snapshotOf(address, token);
    const reset = await fetch(`${new URL(address).origin}/api/reset`, { method: "POST", headers: { "X-Kiln-Token": token, Origin: new URL(address).origin, "X-Kiln-Status": before.controlToken!, "X-Kiln-Command-Id": "reset-ask-01" } });
    expect(reset.status, await reset.clone().text()).toBe(200);
    // Change, which would ask again, waits for the failed check too.
    expect((await snapshotOf(address, token)).repositories.find((row) => row.name === "storefront")).toMatchObject({ located: "answer" });
    expect(await api(address, token, "POST", "/api/repository-location/change", { repository: "acme-labs/storefront" })).toEqual({ status: 409, body: { ok: false, reason: "Fix what failed, then reload." } });

    // Kiln no longer remembers the answer, so a reload's checks would ask; the failed check still holds the question.
    forgetLocation(f.env, "acme-labs/storefront");
    await connectOnce(address, token);
    await waitFor(async () => (await snapshotOf(address, token)).repositories.find((row) => row.name === "storefront")!.checkoutFolder === undefined, 30_000);

    // The failed check is reported, and nothing about the repository Kiln would ask about.
    let snapshot = await snapshotOf(address, token);
    expect(snapshot.feature.state).toBe("not_started");
    expect(snapshot.documents!.checksFailed).toBe(true);
    expect(snapshot.documents!.checks.some((check) => !check.passed && check.name.includes("notes.txt"))).toBe(true);
    expect(snapshot.documents!.checks.some((check) => check.locate || / to locate$/.test(check.name))).toBe(false);
    expect(snapshot.repositories.find((row) => row.name === "storefront")).toMatchObject({ addressPath: "acme-labs/storefront" });
    expect(snapshot.repositories.some((row) => row.question !== undefined)).toBe(false);
    expect(snapshot.settings.startBlockedBy).toBe("Fix what failed, then reload.");
    // An answer waits too.
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: storefront })).toEqual({ status: 409, body: { ok: false, reason: "Fix what failed, then reload." } });
    expect(readRememberedLocation(f.env, "acme-labs/storefront")).toEqual({ kind: "none" });

    // Fixed, a reload finds every check passing, and the row asks.
    rmSync(join(f.product, "notes.txt"));
    await connectOnce(address, token);
    await waitFor(async () => (await snapshotOf(address, token)).documents!.checksFailed === undefined, 30_000);
    snapshot = await snapshotOf(address, token);
    expect(snapshot.documents!.checks.filter((check) => !check.passed)).toEqual([]);
    expect(snapshot.repositories.find((row) => row.name === "storefront")!.question).toMatchObject({ kind: "where", repository: "acme-labs/storefront" });
    expect(snapshot.documents!.checks.find((check) => check.locate)).toEqual({ name: "1 repository to locate", passed: true, locate: true });
    expect(snapshot.settings.startBlockedBy).toBe("Tell Kiln where acme-labs/storefront is to start.");
    expect(await api(address, token, "POST", "/api/repository-location", { repository: "acme-labs/storefront", folder: storefront })).toMatchObject({ status: 200 });
    kiln.signals.emit("SIGINT");
    await kiln.done;
  }, 120_000);

  it("takes a listed checkout picked on the page, as the snapshot gives its folder, and sets that checkout up (AC-ASK-02)", async () => {
    const f = createFeature({ "phase-3-returns-dashboard.md": "**Repositories:** acme-labs/storefront" }, { "acme-labs/storefront": "home/code/acme-labs/storefront" });
    const archive = join(f.home, "code", "archive", "storefront");
    git(f.sandbox, f.sandbox.root, "clone", "-q", join(f.home, "code", "acme-labs", "storefront"), archive);
    git(f.sandbox, archive, "remote", "set-url", "origin", "git@github.com:acme-labs/storefront.git");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    const question = (await snapshotOf(address, token)).repositories.find((row) => row.question)!.question!;
    expect(question).toMatchObject({ kind: "which", found: 2 });
    const picked = question.checkouts.find((one) => one.folder === displayPath(archive))!;
    expect(picked.pickable).toBe(true);
    expect(await api(address, token, "POST", "/api/repository-location", { repository: question.repository, folder: picked.folder })).toMatchObject({ status: 200 });
    const snapshot = await snapshotOf(address, token);
    expect(snapshot.repositories.find((row) => row.name === "storefront")).toMatchObject({ located: "answer", checkoutFolder: displayPath(archive) });
    await waitFor(async () => { const now = await snapshotOf(address, token); return now.settings.baseCheck !== "checking" && now.repositories.every((row) => row.baseCheck !== "checking"); });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => recordOf(f).setupCompletedAt !== undefined);
    expect(recordOf(f).repositories.find((entry) => entry.name === "storefront")?.mainCheckoutPath).toBe(archive);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  }, 90_000);

  it("refuses a plan that names a repository by a full remote address or another host, naming the file (AC-NAME-01)", async () => {
    const f = createFeature({ "phase-1-return-intake.md": "**Repositories:** git@github.com:acme/returns-api.git", "phase-3-returns-dashboard.md": "**Repositories:** git.example.com:acme-labs/storefront" }, {});
    const kiln = startKiln(f);
    expect(await kiln.done).toBe(1);
    expect(kiln.lines()).toContain("    phase-1-return-intake.md names git@github.com:acme/returns-api.git, a full remote address. Name the repository by the path in it, acme/returns-api.");
    expect(kiln.lines()).toContain("    phase-3-returns-dashboard.md names git.example.com:acme-labs/storefront. Kiln delivers only to GitHub, so it can’t deliver a repository on git.example.com.");
  });
});
