import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findExecutable } from "./platform/helper-process.js";
import { resolvePrdPath, type PrdResolution } from "./prd-location.js";
import { commitFiles, createRepository, createSandbox, git, type Sandbox } from "./test-support/git-repositories.js";

let sandbox: Sandbox;
let repository: string;
let gitPath: string;

const resolveFrom = (cwd: string, path: string): Promise<PrdResolution> => resolvePrdPath(path, cwd, gitPath, sandbox.env);
const problemOf = (resolution: PrdResolution) => ("problem" in resolution ? resolution.problem : undefined);
const locationOf = (resolution: PrdResolution) => {
  if ("problem" in resolution) throw new Error(resolution.problem);
  return resolution.location;
};

beforeAll(() => {
  sandbox = createSandbox();
  gitPath = findExecutable("git", sandbox.env)!;
  repository = createRepository(sandbox, "acme-shop");
  commitFiles(sandbox, repository, "docs/prds/customer-returns", { "customer-returns-prd.md": "# PRD\n" });
  commitFiles(sandbox, repository, "docs/changes/returns-fix", { "returns-fix-prd.md": "# PRD\n", "notes.md": "x" });
  mkdirSync(join(repository, "docs/prds/gift-cards"), { recursive: true });
  writeFileSync(join(repository, "docs/prds/gift-cards/technical-design.md"), "x");
});
afterAll(() => sandbox.cleanup());

describe("resolvePrdPath", () => {
  it("accepts a PRD directory, with or without a trailing slash, relative to the current directory", async () => {
    for (const path of ["docs/prds/customer-returns/", "docs/prds/customer-returns"]) {
      const location = locationOf(await resolveFrom(repository, path));
      expect(location).toEqual({
        checkoutRoot: repository,
        mainCheckoutPath: repository,
        repositoryName: "acme-shop",
        prdDirectory: join(repository, "docs", "prds", "customer-returns"),
        prdDirectoryFromRoot: "docs/prds/customer-returns",
        folderName: "customer-returns",
        prdFileName: "customer-returns-prd.md",
        featureName: "Customer returns",
      });
    }
    const fromInside = locationOf(await resolveFrom(join(repository, "docs"), "../docs/changes/returns-fix"));
    expect(fromInside.prdDirectoryFromRoot).toBe("docs/changes/returns-fix");
    expect(locationOf(await resolveFrom(join(repository, "docs/prds/customer-returns"), ".")).folderName).toBe("customer-returns");
  });

  it("accepts the PRD file, and a missing PRD file in an existing PRD directory (the start checks report it)", async () => {
    expect(locationOf(await resolveFrom(repository, "docs/prds/customer-returns/customer-returns-prd.md")).folderName).toBe("customer-returns");
    expect(locationOf(await resolveFrom(repository, "docs/prds/gift-cards/gift-cards-prd.md")).featureName).toBe("Gift cards");
  });

  it("refuses every other path with one line naming the problem", async () => {
    expect(problemOf(await resolveFrom(repository, "docs/prds/nope"))).toBe("docs/prds/nope doesn't exist.");
    expect(problemOf(await resolveFrom(repository, "docs/prds/"))).toMatch(/^docs\/prds\/ isn't a PRD directory/);
    expect(problemOf(await resolveFrom(repository, "docs"))).toMatch(/isn't a PRD directory/);
    expect(problemOf(await resolveFrom(repository, "README.md"))).toMatch(/isn't a PRD directory/);
    mkdirSync(join(repository, "docs/prds/customer-returns/mockups"), { recursive: true });
    expect(problemOf(await resolveFrom(repository, "docs/prds/customer-returns/mockups"))).toMatch(/isn't a PRD directory/);
    expect(problemOf(await resolveFrom(repository, "docs/changes/returns-fix/notes.md"))).toBe(
      "docs/changes/returns-fix/notes.md isn't the PRD: the PRD in docs/changes/returns-fix/ is returns-fix-prd.md.",
    );
    const outside = join(sandbox.root, "not-a-repo", "docs", "prds", "x");
    mkdirSync(outside, { recursive: true });
    expect(problemOf(await resolveFrom(sandbox.root, outside))).toBe(`${outside} isn't in a Git repository.`);
  });

  it("from inside a worktree, finds the main checkout, so the repository name is the main checkout's", async () => {
    const worktree = join(sandbox.root, "acme-shop-kiln", "customer-returns");
    git(sandbox, repository, "worktree", "add", "-q", "-b", "feature/customer-returns", worktree);
    const location = locationOf(await resolveFrom(worktree, "docs/prds/customer-returns"));
    expect(location.checkoutRoot).toBe(worktree);
    expect(location.mainCheckoutPath).toBe(repository);
    expect(location.repositoryName).toBe("acme-shop");
    expect(location.prdDirectory).toBe(join(worktree, "docs", "prds", "customer-returns"));
  });

  it("in a submodule, uses the submodule's own checkout and name", async () => {
    const library = createRepository(sandbox, "shared-library");
    commitFiles(sandbox, library, "docs/prds/pricing", { "pricing-prd.md": "# PRD\n" });
    git(sandbox, repository, "-c", "protocol.file.allow=always", "submodule", "add", "-q", library, "vendor/shared-library");
    const submodule = join(repository, "vendor", "shared-library");
    const location = locationOf(await resolveFrom(repository, "vendor/shared-library/docs/prds/pricing"));
    expect(location.checkoutRoot).toBe(submodule);
    expect(location.mainCheckoutPath).toBe(submodule);
    expect(location.repositoryName).toBe("shared-library");
  });
});
