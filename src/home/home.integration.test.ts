// The home screen (Kiln Requirements Stages AC-HOME-01 to 13): `kiln` with nothing named lists
// what Kiln found by file names and Git, keeps the list current, opens each item in a Kiln of its
// own, and across a folder of repositories shows one list.

import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runKilnCommand } from "../kiln-command.js";
import { waitFor } from "../test-support/engine-harness.js";
import { PRD, PHASES, DESIGN } from "../test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { reservePortRange } from "../test-support/os-ports.js";
import { runHome, type HomeList } from "./home.js";

let sandbox: Sandbox | undefined;
let ports = "";
beforeEach(async () => { ports = await reservePortRange(); });
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

const CLI = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const closed = (markdown: string) => markdown.replace(/^(# .+)$/m, "$1\n\n**Closed:** 2026-11-01");

function repository(name: string) {
  const origin = createGithubOrigin(sandbox!, "acme", name);
  const path = createRepository(sandbox!, name, origin.url);
  git(sandbox!, path, "push", "-qu", "origin", "develop");
  return { path, bare: origin.bare };
}

function env(): NodeJS.ProcessEnv {
  const bin = join(sandbox!.root, "bin");
  installStandIns(bin);
  return { ...sandbox!.env, PATH: [bin, sandbox!.env.PATH ?? process.env.PATH ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
}

/** `kiln` in `cwd` until `whileRunning` is done with its page, then Ctrl+C. */
async function home(cwd: string, whileRunning: (page: { list(): Promise<HomeList>; events(): () => string; open(id: string): Promise<{ status: number; body: { ok: boolean; address?: string; reason?: string } }> }, out: () => string) => Promise<void>, args: string[] = []) {
  let out = "";
  let address = "";
  const signals = new EventEmitter();
  const context = { cwd, env: env(), signals, stdout: { write: (text: string) => (out += text) }, stderr: { write: (text: string) => (out += text) }, openBrowser: async (url: string) => { address = url; return { kind: "opened" as const }; } };
  const childPorts = await reservePortRange();
  const done = args.length ? runKilnCommand(args, context) : runHome(context, { kilnCommand: [process.execPath, CLI], childEnv: { KILN_PORT_RANGE: childPorts } });
  let code: number | undefined;
  void done.then(c => (code = c));
  try {
    await waitFor(() => !!address || code !== undefined, 30_000);
    expect(address, out).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/home$/);
    const origin = new URL(address).origin;
    const html = await (await fetch(address)).text();
    const token = /name="kiln-token" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(token).not.toBe("");
    const streams: AbortController[] = [];
    try { await whileRunning({
      // The page's event stream, as the browser holds it: every list the server sends, as text.
      events: () => {
        let received = "";
        const stream = new AbortController();
        streams.push(stream);
        void fetch(`${origin}/api/home/events?token=${token}`, { signal: stream.signal }).then(async response => {
          const reader = response.body!.getReader();
          for (;;) { const { done, value } = await reader.read(); if (done) break; received += Buffer.from(value).toString("utf8"); }
        }).catch(() => undefined);
        return () => received;
      },
      list: async () => (await (await fetch(`${origin}/api/home/list`, { headers: { "X-Kiln-Token": token } })).json()) as HomeList,
      open: async (id) => {
        const response = await fetch(`${origin}/api/home/open`, { method: "POST", headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ item: id }) });
        return { status: response.status, body: await response.json() as { ok: boolean; address?: string; reason?: string } };
      },
    }, () => out); } finally { for (const stream of streams) stream.abort(); }
  } finally {
    if (code === undefined) signals.emit("SIGINT");
    code = await done;
  }
  return { code, out };
}

it("lists each item in one place by file names and Git, keeps the list current, and opens an item in a Kiln of its own (AC-HOME-01 to 08, 12, 13)", async () => {
  sandbox = createSandbox();
  const shop = repository("acme-shop");
  const repo = shop.path;
  // Ready to start: a brief, an intake record and two planned PRDs, one of which waits for the other's build.
  commitFiles(sandbox, repo, "source-material/gift-card-balance", { "gift-card-balance-brief.md": "# Brief: Gift card balance lookup\n\nText.\n" });
  commitFiles(sandbox, repo, "source-material/wholesale-price-lists", { "wholesale-price-lists-requirements-intake.md": "# Requirements intake: Wholesale price lists\n" });
  commitFiles(sandbox, repo, "docs/initiatives/loyalty-program", {
    "loyalty-program-initiative-prds.md": "# Loyalty program Initiative PRDs\n\n| # | PRD | Depends on | Status |\n|---|---|---|---|\n| 1 | [Points earning](loyalty-program-prd-contracts.md#points-earning) | None | planned |\n| 2 | [Redemption](loyalty-program-prd-contracts.md#redemption) | Points earning | planned |\n",
    "loyalty-program-prd-contracts.md": "## Points earning\n\n**PRD directory, when written:** `docs/prds/points-earning`\n\n## Redemption\n\n**PRD directory, when written:** `docs/prds/redemption`\n",
  });
  // Not listed: material a PRD was written from, and a folder with neither a brief nor an intake record (HOME-004).
  commitFiles(sandbox, repo, "source-material/saved-addresses", { "saved-addresses-brief.md": "# Brief: Saved addresses\n" });
  commitFiles(sandbox, repo, "source-material/stakeholder-feedback", { "notes.md": "Notes\n" });
  // Folded: a PRD with requirements but no phase plan. Not listed: a PRD with every phase built.
  commitFiles(sandbox, repo, "docs/changes/saved-addresses", { "saved-addresses-prd.md": "# PRD: Saved addresses\n" });
  commitFiles(sandbox, repo, "docs/prds/customer-returns", { "customer-returns-prd.md": PRD, "technical-design.md": DESIGN, ...Object.fromEntries(Object.entries(PHASES).map(([file, text]) => [file, closed(text)])) });
  // Under way: a PRD with a phase not yet built, and one started by hand on a branch that hasn't merged.
  commitFiles(sandbox, repo, "docs/prds/order-export", { "order-export-prd.md": "# PRD: Order export\n", "technical-design.md": DESIGN, ...PHASES });
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "switch", "-q", "-c", "prd/return-labels");
  commitFiles(sandbox, repo, "docs/changes/return-labels", { "return-labels-prd.md": "# PRD: Return labels\n" });
  git(sandbox, repo, "push", "-q", "-u", "origin", "prd/return-labels");
  // Under way too: a PRD with every phase built, still on its unmerged branch; Under way's row comes before Not listed.
  git(sandbox, repo, "switch", "-q", "-c", "prd/data-viewer", "develop");
  commitFiles(sandbox, repo, "docs/prds/data-viewer", { "data-viewer-prd.md": "# PRD: Data viewer\n", "technical-design.md": DESIGN, ...Object.fromEntries(Object.entries(PHASES).map(([file, text]) => [file, closed(text)])) });
  // Not ready yet: a brief committed only on a branch of its own, not on the shared branch.
  git(sandbox, repo, "switch", "-q", "-c", "feature/promo-codes", "develop");
  commitFiles(sandbox, repo, "source-material/promo-codes", { "promo-codes-brief.md": "# Brief: Promo codes\n" });
  git(sandbox, repo, "switch", "-q", "develop");
  // Not ready yet: a brief not committed, and an intake not finished.
  mkdirSync(join(repo, "source-material/email-digest"), { recursive: true });
  writeFileSync(join(repo, "source-material/email-digest/email-digest-brief.md"), "# Brief: Email digest\n");
  mkdirSync(join(repo, "source-material/store-locator/received"), { recursive: true });
  writeFileSync(join(repo, "source-material/store-locator/received/call.txt"), "transcript\n");

  // Run from a folder deep inside the repository: the whole repository is covered (AC-HOME-08).
  const { code, out } = await home(join(repo, "docs/prds"), async (page, output) => {
    const list = await page.list();
    expect(list.scope).toMatchObject({ kind: "repository", name: "acme-shop", sharedBranch: "develop" });
    const titles = (items: HomeList["ready"]) => items.map(item => item.title);
    expect(titles(list.ready).sort()).toEqual(["Gift card balance lookup", "Loyalty program: Points earning", "Loyalty program: Redemption", "Wholesale price lists"]);
    expect(list.ready.find(item => item.title === "Gift card balance lookup")).toMatchObject({ kind: "brief", path: "source-material/gift-card-balance", where: "source-material/gift-card-balance/gift-card-balance-brief.md" });
    expect(list.ready.find(item => item.title === "Loyalty program: Redemption")).toMatchObject({ kind: "planned_prd", path: "docs/initiatives/loyalty-program/redemption", buildWaitsFor: ["Points earning"], line: "Its build waits for Points earning." });
    expect(list.notReady.map(item => [item.title, item.line])).toEqual(expect.arrayContaining([
      ["Email digest", "A brief not yet committed on develop. Commit it there and it moves up."],
      ["Store locator", "Material brought in under received/, and its intake record isn't written yet. When it is, this moves up."],
    ]));
    expect(list.notReady.find(item => item.title === "Promo codes")?.line).toBe("A brief not yet committed on develop, only on feature/promo-codes. Commit it there and it moves up.");
    expect(list.notReady).toHaveLength(3);
    expect(titles(list.underWay).sort()).toEqual(["Data viewer", "Order export", "Return labels"]);
    expect(list.underWay.find(item => item.title === "Data viewer")?.line).toBe("Started by hand, on the branch prd/data-viewer, not merged yet. Phase plan of 4, 4 built.");
    expect(list.underWay.find(item => item.title === "Return labels")).toMatchObject({ startedByHand: true, branch: "prd/return-labels", state: "not_running", line: "Started by hand, on the branch prd/return-labels, not merged yet. PRD written, no technical design yet. Kiln continues from there, with the early review once the PRD is refined." });
    expect(list.folded.map(item => item.title)).toEqual(["Saved addresses"]);
    expect(list.folded[0]!.line).toMatch(/^PRD written, no technical design yet\. Last changed /);

    // Source material committed while the page is open appears under Ready to start, pushed to the open page (AC-HOME-07).
    const pushed = page.events();
    await waitFor(() => pushed().includes("event: home"));
    writeFileSync(join(repo, "source-material/store-locator/store-locator-requirements-intake.md"), "# Requirements intake: Store locator\n");
    // Its whole folder is committed: a folder with uncommitted changes stays Not ready yet (AC-HOME-03).
    git(sandbox!, repo, "add", "source-material/store-locator");
    git(sandbox!, repo, "commit", "-qm", "intake record");
    await waitFor(() => pushed().split("event: home").some(event => event.includes("\"title\":\"Store locator\"") && event.split("\"notReady\"")[0]!.includes("\"title\":\"Store locator\"")), 20_000);
    expect((await page.list()).ready.some(item => item.title === "Store locator")).toBe(true);
    expect((await page.list()).notReady.map(item => item.title).sort()).toEqual(["Email digest", "Promo codes"]);

    // kiln run needs a clean checkout: the material still uncommitted goes.
    rmSync(join(repo, "source-material/email-digest"), { recursive: true });
    // Review and start opens the item in a Kiln of its own, at its own address, and the home starts nothing itself (AC-HOME-05).
    const gift = (await page.list()).ready.find(item => item.title === "Gift card balance lookup")!;
    const opened = await page.open(gift.id);
    expect(opened.status, JSON.stringify(opened.body) + output()).toBe(200);
    expect(opened.body.address).toMatch(/\/gift-card-balance$/);
    expect((await fetch(opened.body.address!)).status).toBe(200);
    expect(output()).toContain("Gift card balance lookup · ");
    // Opened again, it goes to the same Kiln rather than starting a second.
    expect((await page.open(gift.id)).body.address).toBe(opened.body.address);
  });
  expect(code).toBe(130);
  expect(out).toContain("Kiln's home screen stopped.");
  // Ctrl+C stopped the Kiln it started too.
  expect(out).toContain("Gift card balance lookup · Kiln stopped.");

  // An item whose Kiln can't start says why: here a PRD refinement part-way through (AC-BEGIN-04).
  // The refinement runs in the branch's own worktree, where its state file sits beside the PRD.
  const refining = join(sandbox.root, "return-labels-worktree");
  git(sandbox, repo, "worktree", "add", "-q", refining, "prd/return-labels");
  writeFileSync(join(refining, "docs/changes/return-labels/return-labels-prd-refinement-state.md"), "round 1\n");
  await home(repo, async (page) => {
    const labels = (await page.list()).underWay.find(item => item.title === "Return labels")!;
    const refused = await page.open(labels.id);
    expect(refused.status).toBe(502);
    expect(refused.body.reason).toContain(`The PRD refinement is part-way through in ${refining}`);
  });
});

it("covers each repository directly inside a folder in one list, naming its repository and those with nothing found (AC-HOME-09, AC-HOME-10, AC-HOME-11)", async () => {
  sandbox = createSandbox();
  const folder = join(sandbox.root, "acme");
  mkdirSync(folder);
  const make = (name: string) => {
    const origin = createGithubOrigin(sandbox!, "acme", name);
    const path = createRepository(sandbox!, join("acme", name), origin.url);
    git(sandbox!, path, "push", "-qu", "origin", "develop");
    return path;
  };
  const shop = make("acme-shop");
  make("acme-docs");
  commitFiles(sandbox, shop, "source-material/gift-card-balance", { "gift-card-balance-brief.md": "# Brief: Gift card balance lookup\n" });
  // A PRD that changes several repositories is listed once, under the one holding its documents.
  commitFiles(sandbox, shop, "docs/prds/customer-returns", { "customer-returns-prd.md": PRD, "technical-design.md": DESIGN, "phase-1-intake.md": "# Phase 1: Intake\n\n**Repositories:** acme-shop, acme-admin\n\n## Acceptance criteria covered\nAC-1\n" });
  await home(folder, async (page) => {
    // A second kiln for the same scope opens the first one's address and exits (AC-HOME-01).
    let second = "";
    let opened = "";
    const code = await runKilnCommand([], { cwd: folder, env: env(), stdout: { write: (text: string) => (second += text) }, stderr: { write: (text: string) => (second += text) }, openBrowser: async (url: string) => { opened = url; return { kind: "opened" as const }; } });
    expect(code).toBe(0);
    expect(second).toMatch(/^Kiln's home screen for acme is already running at http:\/\/127\.0\.0\.1:\d+\/home\n$/);
    expect(second).toContain(opened);
    let refused = "";
    expect(await runKilnCommand(["new", "docs/prds/x"], { cwd: folder, env: env(), stdout: { write: () => undefined }, stderr: { write: (text: string) => (refused += text) } })).toBe(2);
    expect(refused).toBe("kiln: kiln new takes no arguments.\nUsage: kiln new\nUse kiln new --help for details.\n");
    const list = await page.list();
    expect(list.scope).toMatchObject({ kind: "folder", name: "acme", repositories: ["acme-docs", "acme-shop"], nothingFound: ["acme-docs"] });
    expect(list.ready.map(item => [item.repository, item.title])).toEqual([["acme-shop", "Gift card balance lookup"]]);
    expect(list.underWay.map(item => [item.repository, item.title, item.alsoChanges])).toEqual([["acme-shop", "Customer returns", ["acme-admin"]]]);
  });
  // With nothing found, the screen leads with bringing source material in (AC-HOME-11): the list is empty.
  await home(join(folder, "acme-docs"), async (page) => {
    const list = await page.list();
    expect([list.underWay, list.ready, list.notReady, list.folded].every(items => items.length === 0)).toBe(true);
    expect(list.scope.nothingFound).toEqual(["acme-docs"]);
  }, ["new"]);
});
