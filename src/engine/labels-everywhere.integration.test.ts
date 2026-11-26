// The last places a repository is named (find repositories anywhere AC-FOLDER-02, Phase 6): a
// plan folder name takes the label of the repository its folder reaches, never another sharing
// its short name; the PRD's repository is shown by its label in the page header and the Reset
// footer; and the audit, readiness and kiln status words name each repository by its label.
// Real Git, origins reached as github.com through an SSH stand-in, the stand-in session.

import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { buildSnapshot } from "./snapshot.js";
import { stayLines } from "../../view/src/lib/reset.js";
import { assignedPath, snapshotChanges } from "../audit/snapshots.js";
import { AuditRefusal, type WorkSnapshot } from "../audit/contracts.js";
import { progressHeading, progressText, statusLabels, type ProgressRow } from "../control/waiver-facts.js";
import { againstText } from "../../view/src/lib/waivers.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

/**
 * Phase 1 names `acme-labs/admin` and `other/acme-shop`; phase 3 names the folder `admin` beside
 * the PRD's repository, whose origin is `acme/admin`. The PRD's `acme-shop` shares its short name
 * with `other/acme-shop`, so it is labelled `acme/acme-shop`.
 */
async function sharedShortNames(): Promise<Harness> {
  const files = prdDirectoryFiles();
  for (const [file, line] of [["phase-1-return-intake.md", "**Repositories:** acme-labs/admin, other/acme-shop"], ["phase-3-returns-dashboard.md", "**Repositories:** admin"]] as const) {
    const [title, ...rest] = files[file]!.split("\n");
    files[file] = [title, "", line, ...rest].join("\n");
  }
  harness = await createHarness({ files, sessions: [{ actions: [{ result: "I need a decision." }] }] });
  const h = harness;
  for (const [owner, name, at] of [["acme", "admin", "admin"], ["acme-labs", "admin", "labs/admin"], ["other", "acme-shop", "other/acme-shop"]] as const) {
    const origin = createGithubOrigin(h.sandbox, owner, name);
    const checkout = createRepository(h.sandbox, at, origin.url);
    git(h.sandbox, checkout, "push", "-q", "origin", "develop");
  }
  Object.assign(h.env, h.sandbox.env, { HOME: h.sandbox.root });
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  return h;
}

describe("a plan folder name's label (AC-FOLDER-02)", () => {
  it("is the label of the repository its folder reaches, though another repository first in plan order shares its short name", async () => {
    const h = await sharedShortNames();
    // Phase 1's repositories are set up at Start; `acme-labs/admin` takes the short name `admin` as Kiln's name for it.
    expect(h.engine.setUpRepositories.map((entry) => [entry.name, entry.github])).toEqual([["acme-shop", "acme/acme-shop"], ["admin", "acme-labs/admin"], ["other+acme-shop", "other/acme-shop"]]);
    // Phase 3's folder name `admin` reaches acme/admin beside the PRD's repository, not the entry of that name.
    expect(h.engine.labelOfWritten("admin")).toBe("acme/admin");
    expect(h.engine.labelOfWritten("acme-labs/admin")).toBe("acme-labs/admin");
    expect(h.engine.labelOf("admin")).toBe("acme-labs/admin");
    // Once that folder is gone the name reaches nothing, and is shown as written, never as the entry `admin`.
    rmSync(join(h.sandbox.root, "admin"), { recursive: true, force: true });
    expect(h.engine.labelOfWritten("admin")).toBe("admin");
  });
});

describe("the PRD's repository by its label (AC-FOLDER-02)", () => {
  it("in the page header, and every repository in the Reset footer", async () => {
    const h = await sharedShortNames();
    expect(buildSnapshot(h.engine).feature).toMatchObject({ repositoryName: "acme-shop", repositoryLabel: "acme/acme-shop" });
    const preview = await h.engine.resetPreview();
    expect(preview.stays.map((stay) => [stay.repository, stay.label])).toEqual([["acme-shop", "acme/acme-shop"], ["admin", "acme-labs/admin"], ["other+acme-shop", "other/acme-shop"]]);
    const lines = stayLines(preview).map((line) => line.text);
    expect(lines.filter((line) => line.startsWith("In ")).map((line) => line.split(",")[0])).toEqual(expect.arrayContaining(["In acme/acme-shop", "In acme-labs/admin", "In other/acme-shop"]));
    expect(lines.join(" ")).not.toMatch(/In (acme-shop|admin|other\+acme-shop),/);
  });
});

describe("audit refusal reasons by label (AC-FOLDER-02)", () => {
  it("names a path Kiln can't read and each changed repository by its label", async () => {
    const h = await sharedShortNames();
    const entry = h.engine.record.repositories.find((one) => one.github === "acme-labs/admin")!;
    expect(() => assignedPath(entry, "missing.txt", h.engine.labelOf(entry.name))).toThrow(AuditRefusal);
    expect(() => assignedPath(entry, "missing.txt", h.engine.labelOf(entry.name))).toThrow(/^Cannot read acme-labs\/admin\/missing\.txt: /);
    const repository = (name: string, branch: string, identity: string): WorkSnapshot["repositories"][number] => ({ repository: name, identity, branch, head: "0".repeat(40), files: {} });
    const base = { requirements: { id: "r", criteria: [] }, plan: [], testPaths: [] } as unknown as WorkSnapshot;
    const checked = { ...base, repositories: [repository("admin", "a", "x"), repository("other+acme-shop", "a", "x")] } as WorkSnapshot;
    const current = { ...base, repositories: [repository("admin", "b", "y"), repository("acme-shop", "a", "x")] } as WorkSnapshot;
    const label = (name: string) => h.engine.labelOf(name);
    expect(snapshotChanges(h.engine.record, checked, current, label).map((change) => change.description)).toEqual([
      "Changed repository identity: acme-labs/admin",
      "Changed branch: acme-labs/admin (a → b)",
      "Removed assigned repository other/acme-shop",
      "Added assigned repository acme/acme-shop",
    ]);
  });
});

describe("kiln status and the Waivers screen by label (AC-FOLDER-02)", () => {
  it("names each repository by its label in the heading, a waived item and Checked against", () => {
    const answer = {
      prd: { name: "Customer returns", directory: "docs/prds/customer-returns" },
      repositories: ["acme-shop", "acme-labs+admin"],
      repository_details: [{ name: "acme-shop", label: "acme/acme-shop", address_path: "acme/acme-shop" }, { name: "acme-labs+admin", label: "acme-labs/admin", address_path: "acme-labs/admin" }],
    };
    const heading = progressHeading(answer);
    expect(heading).toBe("Customer returns · acme/acme-shop, acme-labs/admin · docs/prds/customer-returns");
    const row = { key: "1", label: "Phase 1", title: "Return intake", state: "complete", warnings: [], counts: { passed: 1, failed: 0, waived: 1 }, waived_checks: 1, waiver_id: null, waivers: [],
      checks: [{ name: "Everything committed", items: [{ kind: "repository_work", subject: "acme-labs+admin", waived: true, text: "uncommitted work" }] }] } as unknown as ProgressRow;
    const text = progressText(heading, [row], undefined, [], statusLabels(answer));
    expect(text).toContain("waived  Everything committed · acme-labs/admin");
    expect(text).not.toContain("acme-labs+admin");
    const label = (name: string) => statusLabels(answer)(name);
    expect(againstText({ kind: "repository_work", subject: "acme-labs+admin", against: "4c1a9e07aaaaaaaa:clean" }, "Everything committed", [], label)).toBe("acme-labs/admin · head 4c1a9e07");
    expect(againstText({ kind: "other", subject: "", against: "acme-shop=4c1a9e07aaaaaaaa,acme-labs+admin=eae98b13bbbbbbbb" }, "Audit", [], label)).toBe("acme/acme-shop · head 4c1a9e07, acme-labs/admin · head eae98b13");
  });
});
