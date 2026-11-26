// Worktree folder names given once and labels worked out each time (find repositories anywhere
// AC-FOLDER-01, AC-FOLDER-02; technical design, "Worktree Folders and Labels").

import { describe, expect, it } from "vitest";
import { giveNames, labelsOf } from "./repository-labels.js";
import { recordLabelSet, repositoryDetails } from "./plan-repositories.js";
import { labelAmong } from "./repository-labels.js";
import type { RepositoryEntry } from "../state/records.js";

const entry = (name: string, github: string, extra: Partial<RepositoryEntry> = {}): RepositoryEntry => ({ name, kind: "named", mainCheckoutPath: `/home/a/${name}`, github, baseBranch: "develop", worktreePath: `/w/${name}`, setupCompletedAt: "2026-11-22T10:00:00Z", ...extra });

describe("the name, given once (AC-FOLDER-01)", () => {
  it("gives a later addition whose short name an entry has the whole-path form, and the entry keeps its folder", () => {
    expect(giveNames([entry("admin", "other/admin")], [{ shortName: "admin", addressPath: "acme/admin" }])).toEqual({ ok: true, names: ["acme+admin"] });
    // Compared without case, as two folders that differ only in case can't share a workspace.
    expect(giveNames([entry("Admin", "other/admin")], [{ shortName: "admin", addressPath: "acme/admin" }])).toEqual({ ok: true, names: ["acme+admin"] });
  });

  it("refuses an addition whose whole-path form an entry already has, naming both repositories", () => {
    expect(giveNames([entry("admin", "other/admin"), entry("acme+admin", "acme/admin-old", { shortName: "admin" })], [{ shortName: "admin", addressPath: "acme/admin" }]))
      .toEqual({ ok: false, problem: "Kiln can’t set up acme/admin: its worktree folder would be acme+admin, which acme/admin-old already has." });
  });

  it("refuses a Start whose whole-path form another repository set up with it keeps as its name, the PRD's included", () => {
    expect(giveNames([], [{ shortName: "product", addressPath: "acme/product", prd: true }, { shortName: "acme+admin", addressPath: "acme/admin-tools" }, { shortName: "admin", addressPath: "acme/admin" }, { shortName: "admin", addressPath: "other/admin" }]))
      .toEqual({ ok: false, problem: "Kiln can’t set up acme/admin: its worktree folder would be acme+admin, which acme/admin-tools would have too." });
    expect(giveNames([], [{ shortName: "acme+shop", addressPath: "acme/product", prd: true }, { shortName: "shop", addressPath: "acme/shop" }, { shortName: "shop", addressPath: "other/shop" }]))
      .toEqual({ ok: false, problem: "Kiln can’t set up acme/shop: its worktree folder would be acme+shop, which acme/product would have too." });
  });

  it("keeps the PRD's repository's own name when a repository set up with it shares its short name", () => {
    expect(giveNames([], [{ shortName: "shop", addressPath: "acme/storefront", prd: true }, { shortName: "shop", addressPath: "other/shop" }])).toEqual({ ok: true, names: ["shop", "other+shop"] });
  });
});

describe("the label, worked out each time (AC-FOLDER-02)", () => {
  it("shows both by their whole path once a second repository with the short name joins, and only then", () => {
    expect(labelsOf([{ shortName: "admin", addressPath: "acme/admin" }, { shortName: "storefront", addressPath: "acme/storefront" }])).toEqual(["admin", "storefront"]);
    expect(labelsOf([{ shortName: "admin", addressPath: "acme/admin" }, { shortName: "admin", addressPath: "acme-labs/admin" }])).toEqual(["acme/admin", "acme-labs/admin"]);
  });

  it("changes an earlier repository's label when the plan as it stands names another with its short name, before that one is set up", () => {
    const record = { repository: { name: "product", github: "acme/product" }, repositories: [entry("product", "acme/product", { kind: "prd" }), entry("admin", "acme/admin")] };
    const before = recordLabelSet(record, [{ repositories: ["acme/admin"] }]);
    expect(labelAmong({ shortName: "admin", addressPath: "acme/admin" }, before)).toBe("admin");
    const after = recordLabelSet(record, [{ repositories: ["acme/admin"] }, { repositories: ["acme-labs/admin"] }]);
    expect(labelAmong({ shortName: "admin", addressPath: "acme/admin" }, after)).toBe("acme/admin");
    // kiln status --json: names stay, labels and address paths beside them.
    expect(repositoryDetails({ ...record, plan: [{ repositories: ["acme-labs/admin"] }] })).toEqual([
      { name: "product", label: "product", address_path: "acme/product" },
      { name: "admin", label: "acme/admin", address_path: "acme/admin" },
    ]);
  });
});
