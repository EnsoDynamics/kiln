// The repository search and what each name reaches (find repositories anywhere AC-NAME-02,
// AC-FIND-01 to AC-FIND-05, AC-ASK-02 to AC-ASK-05): real Git checkouts in a temporary home
// folder, laid out as people keep code, with GitHub origins and others.

import { chmodSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { checkAnswer, resolveNames, type ResolveInput } from "./repository-finding.js";
import { GUARDED_FOLDERS, searchCheckouts, searchRoots } from "./repository-search.js";
import { reachRecordNames, resolvePlanRepositories } from "./plan-repositories.js";
import { rememberLocation, readRememberedLocation, repositoryLocationsFolder } from "../state/repository-locations.js";
import type { RepositoryEntry } from "../state/records.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

/** A sandbox whose home folder is `<root>/home`, with the PRD's repository at `~/code/acme/product`. */
function homeWithProduct(prdAt = "home/code/acme/product") {
  sandbox = createSandbox();
  const home = join(sandbox.root, "home");
  mkdirSync(home, { recursive: true });
  const product = checkout(prdAt, "git@github.com:acme/product.git");
  const env = { ...sandbox.env, HOME: home };
  return { sandbox, home, product, env, git: { git: "git", env } };
}

/** A checkout under the sandbox root with the given origin (none when undefined). */
function checkout(at: string, origin?: string): string {
  return createRepository(sandbox!, at, origin);
}

const found = (result: Awaited<ReturnType<typeof searchCheckouts>>, addressPath: string) =>
  result.checkouts.filter((one) => one.addressPath.toLowerCase() === addressPath.toLowerCase()).map((one) => one.folder);

describe("where the search looks (AC-FIND-01)", () => {
  it("finds a checkout beside the PRD's repository, under another organization's folder, and four levels down from the home folder, by its origin alone", async () => {
    const h = homeWithProduct();
    const beside = checkout("home/code/acme/api-renamed", "git@github.com:acme/returns-api.git");
    const otherOrg = checkout("home/code/acme-labs/storefront", "https://github.com/acme-labs/storefront.git");
    const levelFour = checkout("home/a/b/c/deep", "git@github.com:acme/deep.git");
    checkout("home/a/b/c/d/deeper", "git@github.com:acme/deeper.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(result.roots).toEqual([join(h.home, "code", "acme"), join(h.home, "code"), h.home]);
    expect(found(result, "acme/returns-api")).toEqual([beside]);
    expect(found(result, "Acme-Labs/Storefront")).toEqual([otherOrg]);
    expect(found(result, "acme/deep")).toEqual([levelFour]);
    // Level five from the home folder is past the limit.
    expect(found(result, "acme/deeper")).toEqual([]);
    // The PRD's own repository is a candidate like any other, listed once.
    expect(found(result, "acme/product")).toEqual([h.product]);
  });

  it("finds a folder per host then per organization, as clone managers make", async () => {
    const h = homeWithProduct("home/src/github.com/acme/product");
    const storefront = checkout("home/src/github.com/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme-labs/storefront")).toEqual([storefront]);
  });

  it("never searches above the home folder, so a checkout elsewhere is asked about", async () => {
    const h = homeWithProduct();
    checkout("volumes/work/storefront", "git@github.com:acme-labs/storefront.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme-labs/storefront")).toEqual([]);
    const resolution = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-3-dashboard.md" }]));
    expect(resolution.repositories[0]!.question).toMatchObject({ kind: "where", repository: "acme-labs/storefront", searchedFrom: join(h.home, "code", "acme"), checkouts: [], found: 0 });
    expect(resolution.repositories[0]!.question!.searchedTo).toBeUndefined();
  });

  it("outside the home folder, searches from the parent folder and the two folders above it only", async () => {
    const h = homeWithProduct("work/x/y/z/product");
    checkout("work/x/sibling", "git@github.com:acme/sibling.git");
    checkout("work/far", "git@github.com:acme/far.git");
    const roots = searchRoots(h.product, h.home);
    expect(roots.roots).toEqual([join(h.sandbox.root, "work", "x", "y", "z"), join(h.sandbox.root, "work", "x", "y"), join(h.sandbox.root, "work", "x")]);
    expect(roots.searchedTo).toBe(join(h.sandbox.root, "work", "x"));
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme/sibling")).toHaveLength(1);
    expect(found(result, "acme/far")).toEqual([]);
  });

  it("outside the home folder, never climbs to a folder that holds the home folder", async () => {
    // Home is <root>/home; the PRD's repository is <root>/shared/team/product, so <root> holds the home folder.
    const h = homeWithProduct("shared/team/product");
    checkout("shared/neighbour", "git@github.com:acme/neighbour.git");
    checkout("home/code/storefront", "git@github.com:acme/storefront.git");
    checkout("others-home/code/storefront", "git@github.com:acme/storefront.git");
    const roots = searchRoots(h.product, h.home);
    expect(roots.roots).toEqual([join(h.sandbox.root, "shared", "team"), join(h.sandbox.root, "shared")]);
    expect(roots.searchedTo).toBe(join(h.sandbox.root, "shared"));
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme/neighbour")).toHaveLength(1);
    expect(found(result, "acme/storefront")).toEqual([]);
    expect(result.listed.some((folder) => folder === h.sandbox.root || folder.startsWith(h.home))).toBe(false);
    // One level below a folder holding the home folder, the parent is the only root.
    expect(searchRoots(checkout("shared/product", "git@github.com:acme/product-two.git"), h.home).roots).toEqual([join(h.sandbox.root, "shared")]);
  });

  it("still searches a parent folder that is itself a checkout, lists it as a candidate from the root above, and lists each checkout once", async () => {
    const h = homeWithProduct("home/code/acme/product");
    // ~/code/acme is itself a checkout holding the PRD's repository.
    git(h.sandbox, join(h.home, "code", "acme"), "init", "-q", "-b", "develop");
    git(h.sandbox, join(h.home, "code", "acme"), "remote", "add", "origin", "git@github.com:acme/monorepo-parent.git");
    writeFileSync(join(h.home, "code", "acme", "README.md"), "parent\n");
    git(h.sandbox, join(h.home, "code", "acme"), "add", "README.md");
    git(h.sandbox, join(h.home, "code", "acme"), "commit", "-q", "-m", "parent");
    const beside = checkout("home/code/acme/returns-api", "git@github.com:acme/returns-api.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme/returns-api")).toEqual([beside]);
    expect(found(result, "acme/monorepo-parent")).toEqual([join(h.home, "code", "acme")]);
    expect(new Set(result.checkouts.map((one) => one.folder)).size).toBe(result.checkouts.length);
  });
});

describe("only a repository's own checkout counts (AC-FIND-02)", () => {
  it("passes over a worktree, a submodule, a bare repository, a clone inside another checkout, a link and a hidden folder, and finds a clone with a separate Git folder", async () => {
    const h = homeWithProduct();
    const origin = "git@github.com:acme/storefront.git";
    const main = checkout("home/code/acme/storefront", origin);
    git(h.sandbox, main, "worktree", "add", "-q", "-b", "wt", join(h.home, "code", "acme", "storefront-wt"));
    // A clone inside another checkout, as a dependency folder would hold one.
    checkout("home/code/acme/product/vendor/storefront", origin);
    // A bare repository has no .git entry.
    git(h.sandbox, h.sandbox.root, "init", "-q", "--bare", join(h.home, "code", "acme", "storefront-bare.git"));
    git(h.sandbox, join(h.home, "code", "acme", "storefront-bare.git"), "remote", "add", "origin", origin);
    checkout("home/code/acme/.hidden/storefront", origin);
    checkout("home/elsewhere/storefront-linked", origin);
    symlinkSync(join(h.home, "elsewhere"), join(h.home, "code", "linked"));
    // A clone whose Git folder lives elsewhere is a candidate.
    const separate = join(h.home, "code", "acme", "storefront-separate");
    mkdirSync(join(h.sandbox.root, "gitdirs"), { recursive: true });
    git(h.sandbox, h.sandbox.root, "init", "-q", "-b", "develop", `--separate-git-dir=${join(h.sandbox.root, "gitdirs", "separate")}`, separate);
    git(h.sandbox, separate, "remote", "add", "origin", origin);
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    // storefront-linked sits in ~/elsewhere, which the home folder's own walk reaches; the link to it is never followed.
    expect(found(result, "acme/storefront").sort()).toEqual([join(h.home, "elsewhere", "storefront-linked"), main, separate].sort());
    expect(result.listed.some((folder) => folder.includes(".hidden") || folder.includes(`${join(h.home, "code", "linked")}`))).toBe(false);
  });

  it("never finds a submodule, which sits inside its parent's checkout", async () => {
    const h = homeWithProduct();
    const library = checkout("library-source", "git@github.com:acme/library.git");
    const parent = checkout("home/code/acme/app", "git@github.com:acme/app.git");
    git(h.sandbox, parent, "-c", "protocol.file.allow=always", "submodule", "add", "-q", library, "library");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(found(result, "acme/library")).toEqual([]);
    expect(found(result, "acme/app")).toEqual([parent]);
  });

  it("matches an origin through the person's URL rewrites, since Git reads it", async () => {
    const h = homeWithProduct();
    const rewritten = checkout("home/code/acme/storefront", "gh:acme-labs/storefront");
    git(h.sandbox, rewritten, "config", "url.git@github.com:.insteadOf", "gh:");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home });
    expect(result.checkouts.find((one) => one.folder === rewritten)).toMatchObject({ remote: "git@github.com:acme-labs/storefront", addressPath: "acme-labs/storefront", github: "acme-labs/storefront" });
  });

  it("leaves out a candidate Git can't read, and says so once per run", async () => {
    const h = homeWithProduct();
    const broken = checkout("home/code/acme/broken", "git@github.com:acme/broken.git");
    // A git that fails for one folder, as a damaged repository would.
    const bin = join(h.sandbox.root, "bin");
    mkdirSync(bin, { recursive: true });
    const script = join(bin, "git-stand-in");
    writeFileSync(script, `#!/bin/sh\ncase "$PWD" in *broken) echo 'fatal: bad object HEAD' >&2; exit 1;; esac\nexec git "$@"\n`);
    chmodSync(script, 0o755);
    const said: string[] = [];
    const context = { ...input(h, [{ name: "acme/broken", namedIn: "phase-1-x.md" }, { name: "acme/other", namedIn: "phase-1-x.md" }]), git: { git: script, env: h.env }, say: (line: string) => said.push(line) };
    const memory = new Set<string>();
    await resolveNames({ ...context, said: memory });
    await resolveNames({ ...context, said: memory });
    expect(said).toEqual([`Kiln couldn’t read ${broken} while searching for checkouts (fatal: bad object HEAD).`]);
  });
});

describe("no permission prompt (AC-FIND-05)", () => {
  it("passes over every guarded folder directly in the home folder, without listing it", async () => {
    const h = homeWithProduct();
    const guarded = ["Desktop", "Documents", "Downloads", "Library", "Pictures", "Music", "Movies"];
    for (const name of guarded) checkout(`home/${name}/storefront`, "git@github.com:acme/storefront.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home, platform: "darwin" });
    expect(found(result, "acme/storefront")).toEqual([]);
    for (const name of guarded) expect(result.listed.filter((folder) => folder.startsWith(join(h.home, name)))).toEqual([]);
    // AppData on Windows; none on Linux, where no prompt exists.
    const windows = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home, platform: "win32" });
    checkout("home/AppData/storefront2", "git@github.com:acme/storefront2.git");
    const windowsAgain = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home, platform: "win32" });
    expect(found(windowsAgain, "acme/storefront2")).toEqual([]);
    expect(windowsAgain.listed.filter((folder) => folder.startsWith(join(h.home, "AppData")))).toEqual([]);
    expect(windows.roots).toHaveLength(3);
    expect(GUARDED_FOLDERS.win32).toEqual(["appdata"]);
    expect(GUARDED_FOLDERS.linux).toEqual([]);
  });

  it("still searches a guarded folder that holds the PRD's repository, as a root", async () => {
    const h = homeWithProduct("home/Documents/GitHub/product");
    const beside = checkout("home/Documents/GitHub/returns-api", "git@github.com:acme/returns-api.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home, platform: "darwin" });
    expect(found(result, "acme/returns-api")).toEqual([beside]);
  });

  it("never reads inside a guarded folder, even one that is itself a checkout", async () => {
    const h = homeWithProduct();
    // Reading Documents/.git would raise the prompt as surely as listing Documents.
    checkout("home/Documents", "git@github.com:acme/storefront.git");
    const result = await searchCheckouts({ git: h.git, prdMainCheckoutPath: h.product, home: h.home, platform: "darwin" });
    expect(found(result, "acme/storefront")).toEqual([]);
    expect(result.listed.filter((folder) => folder.startsWith(join(h.home, "Documents")))).toEqual([]);
  });

  // Linux guards no folder, so there is nothing to ask about there.
  it.runIf((GUARDED_FOLDERS[process.platform] ?? []).length > 0)("asks about a repository only a guarded folder holds, with nothing found", async () => {
    const h = homeWithProduct();
    checkout(`home/${process.platform === "win32" ? "AppData" : "Documents"}/storefront`, "git@github.com:acme/storefront.git");
    const resolution = await resolveNames(input(h, [{ name: "acme/storefront", namedIn: "phase-1-x.md" }]));
    expect(resolution.problems).toEqual([]);
    expect(resolution.repositories[0]!.found).toBeUndefined();
    expect(resolution.repositories[0]!.question).toMatchObject({ kind: "where", repository: "acme/storefront", checkouts: [], found: 0 });
  });
});

type Home = ReturnType<typeof homeWithProduct>;
function input(h: Home, names: ResolveInput["names"], entries: RepositoryEntry[] = []): ResolveInput {
  return { git: h.git, env: h.env, prd: { name: "product", mainCheckoutPath: h.product, github: "acme/product" }, entries, names, home: h.home };
}

describe("which repository a name reaches (AC-NAME-02, AC-FIND-03, AC-FIND-04)", () => {
  it("counts a folder name and an address path, or two spellings, as one repository, the folder being its checkout", async () => {
    const h = homeWithProduct();
    const beside = checkout("home/code/acme/returns-api", "git@github.com:acme/returns-api.git");
    checkout("home/code/archive/returns-api", "git@github.com:acme/returns-api.git");
    const resolution = await resolveNames(input(h, [
      { name: "returns-api", namedIn: "phase-1-x.md" },
      { name: "acme/returns-api", namedIn: "phase-2-x.md" },
      { name: "ACME/Returns-API", namedIn: "phase-3-x.md" },
      { name: "github.com:acme/returns-api", namedIn: "phase-3-x.md" },
      { name: "acme/product", namedIn: "phase-3-x.md" },
    ]));
    expect(resolution.problems).toEqual([]);
    expect(resolution.repositories).toEqual([{ written: ["returns-api", "acme/returns-api", "ACME/Returns-API", "github.com:acme/returns-api"], shortName: "returns-api", addressPath: "acme/returns-api", found: { name: "returns-api", mainCheckoutPath: beside, github: "acme/returns-api", located: "beside" } }]);
    // A name that reaches the PRD's repository means the PRD's repository.
    expect(resolution.byName.get("acme/product")).toEqual({ kind: "prd" });
  });

  it("finds two folder names with one address path as one repository, the first its checkout", async () => {
    const h = homeWithProduct();
    const first = checkout("home/code/acme/api", "git@github.com:acme/returns-api.git");
    checkout("home/code/acme/api-copy", "git@github.com:acme/returns-api.git");
    const resolution = await resolveNames(input(h, [{ name: "api", namedIn: "phase-1-x.md" }, { name: "api-copy", namedIn: "phase-2-x.md" }]));
    expect(resolution.repositories.map((one) => [one.written, one.found?.mainCheckoutPath])).toEqual([[["api", "api-copy"], first]]);
  });

  it("reaches a set-up entry by its address path, and by a folder name whose checkout has that address path", async () => {
    const h = homeWithProduct();
    const storefront = checkout("home/code/acme/storefront", "git@github.com:acme-labs/storefront.git");
    checkout("home/code/acme/shop", "git@github.com:acme-labs/storefront.git");
    const entry: RepositoryEntry = { name: "storefront", kind: "named", mainCheckoutPath: storefront, github: "acme-labs/storefront", baseBranch: "develop", worktreePath: "/w/storefront", setupCompletedAt: "2026-11-22T00:00:00Z" };
    // An answer remembered since points elsewhere: the set-up entry keeps its checkout (AC-ASK-05).
    const elsewhere = checkout("volumes/storefront", "git@github.com:acme-labs/storefront.git");
    rememberLocation(h.env, "acme-labs/storefront", elsewhere, new Date());
    const resolution = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }, { name: "shop", namedIn: "phase-2-x.md" }], [entry]));
    expect(resolution.byName.get("acme-labs/storefront")).toEqual({ kind: "entry", name: "storefront" });
    expect(resolution.entries).toEqual(["storefront"]);
    expect(resolution.repositories).toEqual([]);
    expect(resolution.byName.get("shop")).toEqual({ kind: "entry", name: "storefront" });
  });

  it("reaches a different folder of an entry's short name as its own repository, not the entry, and names it apart (AC-FOLDER-01)", async () => {
    const h = homeWithProduct();
    const otherAdmin = checkout("home/code/other/admin", "git@github.com:other/admin.git");
    const acmeAdmin = checkout("home/code/acme/admin", "git@github.com:acme/admin.git");
    // Set up from other/admin's address path, so named by its short name.
    const entry: RepositoryEntry = { name: "admin", kind: "named", mainCheckoutPath: otherAdmin, github: "other/admin", baseBranch: "develop", worktreePath: "/w/admin", setupCompletedAt: "2026-11-22T00:00:00Z" };
    const resolution = await resolveNames(input(h, [{ name: "admin", namedIn: "phase-4-x.md" }], [entry]));
    expect(resolution.entries).toEqual([]);
    expect(resolution.repositories.map((one) => [one.addressPath, one.found?.mainCheckoutPath])).toEqual([["acme/admin", acmeAdmin]]);
    const named = await resolvePlanRepositories({ git: h.git, env: h.env, home: h.home, prd: { name: "product", mainCheckoutPath: h.product, github: "acme/product" }, entries: [entry], phases: [{ fileName: "phase-4-x.md", repositories: ["admin"] }] });
    expect(named.named.map((row) => [row.name, row.found?.shortName])).toEqual([["acme+admin", "admin"]]);
  });

  it("keeps an entry named by a folder name to its recorded checkout beside the PRD's repository after that folder is gone", async () => {
    const h = homeWithProduct();
    // Recorded when the folder was beside the PRD's repository; the folder has since gone.
    const entry: RepositoryEntry = { name: "storefront", kind: "named", mainCheckoutPath: join(h.home, "code", "acme", "storefront"), github: "acme/storefront", baseBranch: "develop", worktreePath: "/w/storefront", setupCompletedAt: "2026-11-22T00:00:00Z" };
    const resolution = await resolveNames(input(h, [{ name: "storefront", namedIn: "phase-1-x.md" }], [entry]));
    expect(resolution.byName.get("storefront")).toEqual({ kind: "entry", name: "storefront" });
  });

  it("never reaches an entry set up from a search under a folder name's short name: the folder name reaches only the folder beside (AC-FIND-04)", async () => {
    const h = homeWithProduct();
    const searched = checkout("home/code/acme-labs/admin", "git@github.com:acme-labs/admin.git");
    // Set up from acme-labs/admin's address path, found by the search, so named by its short name.
    const entry: RepositoryEntry = { name: "admin", kind: "named", mainCheckoutPath: searched, github: "acme-labs/admin", baseBranch: "develop", worktreePath: "/w/admin", setupCompletedAt: "2026-11-22T00:00:00Z" };
    const resolution = await resolveNames(input(h, [{ name: "admin", namedIn: "phase-4-x.md" }], [entry]));
    expect(resolution.entries).toEqual([]);
    expect(resolution.problems).toEqual([`phase-4-x.md names admin, which isn’t in ${join(h.home, "code", "acme")}/.`]);
  });

  it("refuses a link beside the PRD's repository even when it points at an entry's recorded checkout (AC-FIND-04)", async () => {
    const h = homeWithProduct();
    const elsewhere = checkout("home/archive/storefront", "git@github.com:acme/storefront.git");
    symlinkSync(elsewhere, join(h.home, "code", "acme", "storefront"));
    const entry: RepositoryEntry = { name: "storefront", kind: "named", mainCheckoutPath: elsewhere, github: "acme/storefront", baseBranch: "develop", worktreePath: "/w/storefront", setupCompletedAt: "2026-11-22T00:00:00Z" };
    const resolution = await resolveNames(input(h, [{ name: "storefront", namedIn: "phase-1-x.md" }], [entry]));
    expect(resolution.entries).toEqual([]);
    expect(resolution.byName.get("storefront")).toMatchObject({ kind: "problem" });
    expect(resolution.problems).toEqual([`storefront in ${join(h.home, "code", "acme")}/ is a link to ${elsewhere}; Kiln needs the checkout itself there.`]);
  });

  it("reaches an entry beside the PRD's repository only by its folder's exact spelling (AC-FIND-04)", async () => {
    const h = homeWithProduct();
    const admin = checkout("home/code/acme/admin", "git@github.com:acme/admin.git");
    const entry: RepositoryEntry = { name: "admin", kind: "named", mainCheckoutPath: admin, github: "acme/admin", baseBranch: "develop", worktreePath: "/w/admin", setupCompletedAt: "2026-11-22T00:00:00Z" };
    expect((await resolveNames(input(h, [{ name: "admin", namedIn: "phase-1-x.md" }], [entry]))).byName.get("admin")).toEqual({ kind: "entry", name: "admin" });
    // `Admin` fails today's listing check before Start, so it fails after Start too, whatever the file system's case rules.
    const resolution = await resolveNames(input(h, [{ name: "Admin", namedIn: "phase-1-x.md" }], [entry]));
    expect(resolution.entries).toEqual([]);
    expect(resolution.problems).toEqual([`phase-1-x.md names Admin, which isn’t in ${join(h.home, "code", "acme")}/.`]);
  });

  it("reaches an entry whose setup was left unfinished by a folder name with its address path, never a second repository (AC-NAME-02)", async () => {
    const h = homeWithProduct();
    const recorded = checkout("home/archive/admin", "git@github.com:acme/admin.git");
    checkout("home/code/acme/admin-copy", "git@github.com:acme/admin.git");
    // Its addition stopped before setup finished, its checkout elsewhere.
    const entry: RepositoryEntry = { name: "admin", kind: "added", mainCheckoutPath: recorded, github: "acme/admin", baseBranch: "develop", worktreePath: "/w/admin", addedInPhase: "1" };
    const resolution = await resolveNames(input(h, [{ name: "admin-copy", namedIn: "phase-1-x.md" }, { name: "acme/admin", namedIn: "phase-2-x.md" }], [entry]));
    expect(resolution.byName.get("admin-copy")).toEqual({ kind: "entry", name: "admin" });
    expect(resolution.byName.get("acme/admin")).toEqual({ kind: "entry", name: "admin" });
    expect(resolution.entries).toEqual(["admin"]);
    expect(resolution.repositories).toEqual([]);
  });

  it("keeps a folder name to the folder beside the PRD's repository, as today, with no search", async () => {
    const h = homeWithProduct();
    checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const resolution = await resolveNames(input(h, [{ name: "storefront", namedIn: "phase-3-x.md" }]));
    expect(resolution.problems).toEqual([`phase-3-x.md names storefront, which isn’t in ${join(h.home, "code", "acme")}/.`]);
  });

  it("uses one checkout found on GitHub, and lists one on another host without letting it be picked", async () => {
    const h = homeWithProduct();
    const mirror = checkout("home/code/mirrors/storefront", "git@git.example.com:acme-labs/storefront.git");
    const where = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]));
    expect(where.repositories[0]!.question).toMatchObject({ kind: "where", checkouts: [{ folder: mirror, remote: "git@git.example.com:acme-labs/storefront.git", pickable: false }], found: 1 });
    // Asking never fails the start checks (AC-FIND-03).
    expect(where.problems).toEqual([]);
    // Two checkouts, none on GitHub: still "where", both listed.
    const mirror2 = checkout("home/code/mirrors2/storefront", "https://git.example.com/acme-labs/storefront");
    const both = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]));
    expect(both.repositories[0]!.question).toMatchObject({ kind: "where", found: 2 });
    expect(both.repositories[0]!.question!.checkouts.map((one) => [one.folder, one.pickable]).sort()).toEqual([[mirror, false], [mirror2, false]].sort());
    const real = checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const which = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]));
    // Two checkouts of one path, one on another host: Kiln asks which, never picks (AC-ASK-02).
    expect(which.repositories[0]!.question).toMatchObject({ kind: "which", found: 3 });
    expect(which.repositories[0]!.question!.checkouts.map((one) => [one.folder, one.pickable]).sort()).toEqual([[mirror, false], [mirror2, false], [real, true]].sort());
  });

  it("uses a checkout the search finds even when it has uncommitted changes (AC-FIND-03)", async () => {
    const h = homeWithProduct();
    const storefront = checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    writeFileSync(join(storefront, "README.md"), "# changed, not committed\n");
    writeFileSync(join(storefront, "notes.txt"), "work in progress\n");
    const resolution = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]));
    expect(resolution.problems).toEqual([]);
    expect(resolution.repositories[0]!.question).toBeUndefined();
    expect(resolution.repositories[0]!.found).toMatchObject({ mainCheckoutPath: storefront, github: "acme-labs/storefront", located: "search" });
  });

  it("asks which when one checkout is beside the PRD's repository and another farther out (ASK-004)", async () => {
    const h = homeWithProduct();
    checkout("home/code/acme/storefront-old", "git@github.com:acme-labs/storefront.git");
    checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const resolution = await resolveNames(input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]));
    expect(resolution.repositories[0]!.question).toMatchObject({ kind: "which", found: 2 });
  });
});

describe("the answer and the remembered answer (AC-ASK-03, AC-ASK-04, AC-ASK-05)", () => {
  it("checks a folder given as the answer in the design's order, each failure in its words", async () => {
    const h = homeWithProduct();
    const good = checkout("volumes/work/storefront", "git@github.com:acme-labs/storefront.git");
    const other = checkout("volumes/work/old", "git@github.com:acme/storefront-old.git");
    const local = checkout("volumes/work/local", "git@git.example.com:acme-labs/storefront.git");
    const none = checkout("volumes/work/none");
    mkdirSync(join(h.sandbox.root, "volumes", "plain"), { recursive: true });
    symlinkSync(good, join(h.sandbox.root, "volumes", "link"));
    git(h.sandbox, good, "worktree", "add", "-q", "-b", "wt", join(h.sandbox.root, "volumes", "wt"));
    const path = "acme-labs/storefront";
    expect(await checkAnswer(h.git, "volumes/work/storefront", path)).toEqual({ ok: false, message: "Enter a full path, starting with / or ~." });
    expect(await checkAnswer(h.git, join(h.sandbox.root, "nowhere"), path)).toEqual({ ok: false, message: "That folder doesn’t exist." });
    expect(await checkAnswer(h.git, join(h.sandbox.root, "volumes", "link"), path)).toEqual({ ok: false, message: `That folder is a link to ${good}. Give the checkout itself.` });
    expect(await checkAnswer(h.git, join(h.sandbox.root, "volumes", "plain"), path)).toEqual({ ok: false, message: "That folder isn’t a Git checkout." });
    // A bare repository, even one whose origin has the path, and a folder inside a checkout are not checkouts.
    const bare = join(h.sandbox.root, "volumes", "bare.git");
    git(h.sandbox, h.sandbox.root, "init", "-q", "--bare", bare);
    git(h.sandbox, bare, "remote", "add", "origin", "git@github.com:acme-labs/storefront.git");
    expect(await checkAnswer(h.git, bare, path)).toEqual({ ok: false, message: "That folder isn’t a Git checkout." });
    mkdirSync(join(good, "src"), { recursive: true });
    expect(await checkAnswer(h.git, join(good, "src"), path)).toEqual({ ok: false, message: "That folder isn’t a Git checkout." });
    expect(await checkAnswer(h.git, join(h.sandbox.root, "volumes", "wt"), path)).toEqual({ ok: false, message: `That folder is a worktree of ${good}. Give the checkout itself.` });
    expect(await checkAnswer(h.git, other, path)).toEqual({ ok: false, message: "That checkout’s origin is acme/storefront-old, not acme-labs/storefront." });
    expect(await checkAnswer(h.git, none, path)).toEqual({ ok: false, message: "That checkout has no origin remote." });
    expect(await checkAnswer(h.git, local, path)).toEqual({ ok: false, message: "That checkout’s origin, git@git.example.com:acme-labs/storefront.git, isn’t on GitHub. Kiln delivers only to GitHub." });
    const library = checkout("volumes/library", "git@github.com:acme-labs/storefront.git");
    const parent = checkout("volumes/parent", "git@github.com:acme/parent.git");
    git(h.sandbox, parent, "-c", "protocol.file.allow=always", "submodule", "add", "-q", library, "storefront");
    expect(await checkAnswer(h.git, join(parent, "storefront"), path)).toEqual({ ok: false, message: `That folder is a submodule of ${parent}. Give a checkout of its own.` });
    expect(await checkAnswer(h.git, good, "ACME-LABS/storefront")).toEqual({ ok: true, folder: good, github: "acme-labs/storefront", remote: "git@github.com:acme-labs/storefront.git" });
  });

  it("uses a remembered answer for every PRD on the computer, checks it each time, and forgets it with a line when it fails", async () => {
    const h = homeWithProduct();
    const folder = checkout("volumes/work/storefront", "git@github.com:acme-labs/storefront.git");
    rememberLocation(h.env, "acme-labs/storefront", folder, new Date("2026-11-22T10:00:00Z"));
    // Kiln writes nothing into any repository: the answer is in the state root.
    expect(readdirSync(repositoryLocationsFolder(h.env))).toEqual(["acme-labs+storefront.json"]);
    const said: string[] = [];
    const named = [{ name: "Acme-Labs/Storefront", namedIn: "phase-1-x.md" }];
    const first = await resolveNames({ ...input(h, named), say: (line) => said.push(line) });
    expect(first.repositories[0]!.found).toEqual({ name: "storefront", mainCheckoutPath: folder, github: "acme-labs/storefront", located: "answer" });
    // Another PRD on this computer, in another repository, uses it without asking.
    const otherPrd = checkout("home/code/other/billing", "git@github.com:other/billing.git");
    const second = await resolveNames({ ...input(h, named), prd: { name: "billing", mainCheckoutPath: otherPrd, github: "other/billing" } });
    expect(second.repositories[0]!.found?.located).toBe("answer");
    git(h.sandbox, folder, "remote", "set-url", "origin", "git@github.com:acme/elsewhere.git");
    const third = await resolveNames({ ...input(h, named), say: (line) => said.push(line) });
    // The address path as the plan writes it.
    expect(said).toEqual([`Kiln no longer remembers Acme-Labs/Storefront at ${folder}. That checkout’s origin is acme/elsewhere, not Acme-Labs/Storefront.`]);
    expect(readRememberedLocation(h.env, "acme-labs/storefront")).toEqual({ kind: "none" });
    expect(third.repositories[0]!.question?.kind).toBe("where");
    // When the remembered folder fails, Kiln searches again: a checkout cloned where the search reaches is found and used.
    rememberLocation(h.env, "acme-labs/storefront", folder, new Date("2026-11-22T11:00:00Z"));
    const near = checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const fourth = await resolveNames({ ...input(h, named), say: (line) => said.push(line) });
    expect(said).toHaveLength(2);
    expect(said[1]).toBe(`Kiln no longer remembers Acme-Labs/Storefront at ${folder}. That checkout’s origin is acme/elsewhere, not Acme-Labs/Storefront.`);
    expect(readRememberedLocation(h.env, "acme-labs/storefront")).toEqual({ kind: "none" });
    expect(fourth.repositories[0]!.found).toEqual({ name: "storefront", mainCheckoutPath: near, github: "acme-labs/storefront", located: "search" });
    expect(fourth.repositories[0]!.question).toBeUndefined();
  });

  it("keeps a remembered folder Kiln couldn't check, reporting it as an unreadable checkout", async () => {
    const h = homeWithProduct();
    const folder = checkout("volumes/work/storefront", "git@github.com:acme-labs/storefront.git");
    rememberLocation(h.env, "acme-labs/storefront", folder, new Date());
    const bin = join(h.sandbox.root, "bin");
    mkdirSync(bin, { recursive: true });
    const script = join(bin, "git-stand-in");
    writeFileSync(script, `#!/bin/sh\ncase "$PWD" in */volumes/work/storefront) echo 'fatal: timed out' >&2; exit 1;; esac\nexec git "$@"\n`);
    chmodSync(script, 0o755);
    const resolution = await resolveNames({ ...input(h, [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }]), git: { git: script, env: h.env } });
    expect(resolution.problems).toEqual([`Couldn't read ${folder}'s checkout: fatal: timed out`]);
    expect(readRememberedLocation(h.env, "acme-labs/storefront").kind).toBe("remembered");
  });

  it("deletes a store file Kiln can't parse, with its line, and leaves a newer one in place, saying so once per run", async () => {
    const h = homeWithProduct();
    mkdirSync(repositoryLocationsFolder(h.env), { recursive: true });
    writeFileSync(join(repositoryLocationsFolder(h.env), "acme-labs+storefront.json"), "{ not json");
    writeFileSync(join(repositoryLocationsFolder(h.env), "acme+billing.json"), JSON.stringify({ schemaVersion: 2, addressPath: "acme/billing", folder: "/x", answeredAt: "2026-11-22T10:00:00Z" }));
    const said: string[] = [];
    const memory = new Set<string>();
    const named = [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }, { name: "acme/billing", namedIn: "phase-1-x.md" }];
    await resolveNames({ ...input(h, named), say: (line) => said.push(line), said: memory });
    await resolveNames({ ...input(h, named), say: (line) => said.push(line), said: memory });
    expect(said[0]).toMatch(/^Kiln no longer remembers acme-labs\/storefront: it couldn’t read its record \(.+\)\.$/);
    expect(said.filter((line) => line === "Kiln can’t use what a newer Kiln remembers about acme/billing. Update Kiln to use it.")).toHaveLength(1);
    expect(readdirSync(repositoryLocationsFolder(h.env))).toEqual(["acme+billing.json"]);
  });

  it("Change asks again as if nothing were remembered, one checkout on GitHub included, listing the remembered folder", async () => {
    const h = homeWithProduct();
    const remembered = checkout("volumes/work/storefront", "git@github.com:acme-labs/storefront.git");
    rememberLocation(h.env, "acme-labs/storefront", remembered, new Date());
    const named = [{ name: "acme-labs/storefront", namedIn: "phase-1-x.md" }];
    const nothingFound = await resolveNames({ ...input(h, named), changing: ["acme-labs/storefront"] });
    expect(nothingFound.repositories[0]!.question).toMatchObject({ kind: "where", found: 0, checkouts: [], field: remembered });
    const near = checkout("home/code/acme-labs/storefront", "git@github.com:acme-labs/storefront.git");
    const oneFound = await resolveNames({ ...input(h, named), changing: ["acme-labs/storefront"] });
    expect(oneFound.repositories[0]!.question).toMatchObject({ kind: "which", found: 1, checkouts: [{ folder: near, pickable: true }, { folder: remembered, pickable: true, remembered: true }] });
  });
});

describe("worktree folder names for a clash (AC-FOLDER-01)", () => {
  it("gives every repository sharing a short name its whole-path form, keeping the PRD's repository's own", async () => {
    const h = homeWithProduct();
    checkout("home/code/acme/admin", "git@github.com:acme/admin.git");
    checkout("home/code/acme-labs/admin", "git@github.com:acme-labs/admin.git");
    checkout("home/code/other/product", "git@github.com:other/product.git");
    const result = await resolvePlanRepositories({
      git: h.git, env: h.env, home: h.home, prd: { name: "product", mainCheckoutPath: h.product, github: "acme/product" }, entries: [],
      phases: [{ fileName: "phase-1-x.md", repositories: ["acme/admin", "acme-labs/admin", "other/product"] }],
    });
    expect(result.problems).toEqual([]);
    expect(result.named.map((row) => [row.name, row.found?.shortName])).toEqual([["acme+admin", "admin"], ["acme-labs+admin", "admin"], ["other+product", "product"]]);
  });

  it("after Start, weighs only the repositories found, so one set up beside a left-out repository of the same short name keeps its short name", async () => {
    const h = homeWithProduct();
    checkout("home/code/acme/admin", "git@github.com:acme/admin.git");
    // other/admin has no checkout on this computer, so its finding ends in a question.
    const phases = [{ fileName: "phase-3-x.md", repositories: ["acme/admin", "other/admin"] }];
    const before = await resolvePlanRepositories({ git: h.git, env: h.env, home: h.home, prd: { name: "product", mainCheckoutPath: h.product, github: "acme/product" }, entries: [], phases });
    // Before Start both are set up together at Start, so both take the whole-path form.
    expect(before.named.map((row) => [row.name, !!row.found])).toEqual([["acme+admin", true], ["other+admin", false]]);
    // A continuation or a base-branch start leaves other/admin out, so acme/admin is weighed alone.
    const after = await reachRecordNames({ ...h.git, env: { ...h.env, HOME: h.home } }, { repository: { name: "product", github: "acme/product" }, repositories: [] }, h.product, phases);
    const reached = after.get("acme/admin");
    expect(reached?.kind === "repository" && [reached.row.name, reached.row.found?.name, reached.row.found?.shortName]).toEqual(["admin", "admin", undefined]);
    const left = after.get("other/admin");
    expect(left?.kind === "repository" && !left.row.found && left.row.question?.repository).toBe("other/admin");
  });

  it("refuses a Start where a folder beside the PRD's repository has the whole-path form another repository would take", async () => {
    const h = homeWithProduct();
    checkout("home/code/acme/acme+admin", "git@github.com:acme/admin-tools.git");
    checkout("home/code/acme-labs/acme/admin", "git@github.com:acme/admin.git");
    checkout("home/code/other/admin", "git@github.com:other/admin.git");
    const result = await resolvePlanRepositories({
      git: h.git, env: h.env, home: h.home, prd: { name: "product", mainCheckoutPath: h.product, github: "acme/product" }, entries: [],
      phases: [{ fileName: "phase-1-x.md", repositories: ["acme+admin", "acme/admin", "other/admin"] }],
    });
    expect(result.named).toEqual([]);
    expect(result.problems).toEqual(["Kiln can’t set up acme/admin: its worktree folder would be acme+admin, which acme/admin-tools would have too."]);
  });
});
