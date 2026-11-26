// Names after Start (find repositories anywhere AC-NAME-02, Phase 3): an address path that a
// folder name of the plan reaches is that folder's repository, added from the folder with no
// search and no question, whether a phase about to start or a session names it; and a label
// counts the folder name and the address path as one repository. Real Git, origins reached as
// github.com through an SSH stand-in, the sandbox root as the home folder.

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { recordLabelSet } from "./plan-repositories.js";
import { labelsOf } from "./repository-labels.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

/**
 * The plan's phase documents with the lines given; `acme-labs/admin` checked out twice, as the
 * folder `admin` beside the PRD's repository and at `<root>/archive/admin`, so a search for it
 * would ask which to use.
 */
async function folderAndAddressPath(lines: Record<string, string>, sessions: ScenarioSession[]): Promise<Harness> {
  const files = prdDirectoryFiles();
  for (const [file, line] of Object.entries(lines)) {
    const [title, ...rest] = files[file]!.split("\n");
    files[file] = [title, "", line, ...rest].join("\n");
  }
  harness = await createHarness({ files, sessions });
  const h = harness;
  const origin = createGithubOrigin(h.sandbox, "acme-labs", "admin");
  git(h.sandbox, createRepository(h.sandbox, "admin", origin.url), "push", "-q", "origin", "develop");
  git(h.sandbox, h.sandbox.root, "clone", "-q", origin.url, join(h.sandbox.root, "archive", "admin"));
  Object.assign(h.env, h.sandbox.env, { HOME: h.sandbox.root });
  return h;
}

describe("an address path a folder name of the plan reaches, after Start (AC-NAME-02)", () => {
  it("adds it before the phase that names it from the folder, without a search or a question", async () => {
    const h = await folderAndAddressPath(
      { "phase-2b-store-credit.md": "**Repositories:** acme-labs/admin", "phase-3-returns-dashboard.md": "**Repositories:** admin" },
      [landingSession("one.txt"), { actions: [{ result: "Phase 2b started." }] }],
    );
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop?.locate).toBeUndefined();
    expect(h.engine.record.phases["2b"]!.sessionIds.length).toBeGreaterThan(0);
    expect(h.engine.record.repositories.map((entry) => [entry.name, entry.mainCheckoutPath, entry.addedInPhase])).toEqual([
      ["acme-shop", h.repository, undefined],
      ["admin", join(h.sandbox.root, "admin"), "2b"],
    ]);
  });

  it("adds a session's request for it from the folder, without a search or a question", async () => {
    const h = await folderAndAddressPath(
      // A folder name no folder answers to, in another phase, doesn't refuse the addition.
      { "phase-2b-store-credit.md": "**Repositories:** ghost", "phase-3-returns-dashboard.md": "**Repositories:** admin" },
      [{ actions: [{ result: "I need a decision." }] }],
    );
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(await h.engine.addRepository("acme-labs/admin")).toMatchObject({ ok: true, name: "admin", added: true });
    expect(h.engine.record.phases["1"]!.repositoryRequests).toBeUndefined();
    expect(h.engine.record.repositories.find((entry) => entry.name === "admin")!.mainCheckoutPath).toBe(join(h.sandbox.root, "admin"));
  });
});

describe("a label once Start is pressed (AC-NAME-02, AC-FOLDER-02)", () => {
  it("counts a folder name not yet set up and the address path its checkout has as one repository", async () => {
    const h = await folderAndAddressPath({}, []);
    const record = { repository: { name: "acme-shop", github: "acme/acme-shop", mainCheckoutPath: h.repository }, repositories: [] };
    const set = recordLabelSet(record, [{ repositories: ["admin"] }, { repositories: ["acme-labs/admin"] }]);
    expect(set.map((one) => [one.shortName, one.addressPath])).toEqual([["acme-shop", "acme/acme-shop"], ["admin", "acme-labs/admin"]]);
    expect(labelsOf(set)).toEqual(["acme-shop", "admin"]);
    // Named the other way round, the folder name still counts it.
    expect(recordLabelSet(record, [{ repositories: ["Acme-Labs/Admin"] }, { repositories: ["admin"] }]).map((one) => one.shortName)).toEqual(["acme-shop", "admin"]);
  });
});
