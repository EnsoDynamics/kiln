/** Preparation readiness spans real repositories; secondary repos need no copy of the PRD. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createCometContinuation, COMET_DIRECTORY, COMET_PRD, cometPhase } from "../test-support/comet-continuation-fixture.js";
import { createBareOrigin, createRepository, git } from "../test-support/git-repositories.js";
import type { Harness } from "../test-support/engine-harness.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });

it.skipIf(process.platform !== "darwin")("requires a valid preparation tuple in every affected repository without requiring PRD files in secondary sources", async () => {
  const fixture = await createCometContinuation(); h = fixture.h;
  const apiOrigin = createBareOrigin(h.sandbox, "lending-api");
  const api = createRepository(h.sandbox, "lending-api", apiOrigin);
  git(h.sandbox, api, "push", "-q", "origin", "develop");
  const apiUrl = "https://github.com/fictional/lending-api.git";
  git(h.sandbox, api, "config", `url.${apiOrigin}.insteadOf`, apiUrl);
  git(h.sandbox, api, "remote", "set-url", "origin", apiUrl);
  h.engine.record.repositories.push({ name: "lending-api", kind: "named", mainCheckoutPath: api, github: "fictional/lending-api", baseBranch: "develop", worktreePath: api });

  // Both source branches are local and unpushed. The revised requirements alone go to develop.
  git(h.sandbox, api, "checkout", "-qb", "wt/catalog-accessibility");
  writeFileSync(join(api, "package.json"), JSON.stringify({ scripts: { test: "node --version" } }));
  writeFileSync(join(api, "lending.txt"), "Accessible lending work\n");
  git(h.sandbox, api, "add", "package.json", "lending.txt");
  git(h.sandbox, api, "commit", "-qm", "test(comet): add lending preparation source");
  const apiRevision = git(h.sandbox, api, "rev-parse", "HEAD").trim();
  git(h.sandbox, api, "checkout", "-q", "develop");

  const phase8 = cometPhase(8, true).replace("\n\n**Closed", "\n\n**Repositories:** lending-api\n\n**Closed");
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  fixture.write("phase-8-catalog.md", phase8);
  writeFileSync(join(h.repository, "package.json"), JSON.stringify({ scripts: { test: "node --version" } }));
  git(h.sandbox, h.repository, "add", `${COMET_DIRECTORY}/phase-8-catalog.md`, "package.json");
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): bind two-repository source scope");
  const prdRevision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  fixture.write("phase-8-catalog.md", phase8);
  fixture.write("library-catalog-prd.md", COMET_PRD + `\n## External completion evidence\nPhase 8: repository \`comet-library\` at commit \`${prdRevision}\`.\n\nPhase 8: repository \`lending-api\` at commit \`${apiRevision}\`.\n`);

  const item = (repository: string, revision: string) => `First step: merge Phase 8. In repository \`${repository}\`, merge the local branch \`wt/catalog-accessibility\` at \`${revision}\` into this phase's branch before building.\n\nVerify before building: run \`npm test\`.\n`;
  const publish = (includeApi: boolean) => {
    fixture.write("phase-9-catalog.md", cometPhase(9).replace("\n\n## Acceptance", "\n\n**Repositories:** lending-api\n\n## Acceptance") + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\n${item("comet-library", prdRevision)}${includeApi ? `\n${item("lending-api", apiRevision)}` : ""}`);
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY);
    git(h.sandbox, h.repository, "commit", "-qm", "test(comet): publish preparation tuples"); fixture.publish();
  };
  publish(true);
  const ready = await h.engine.checkCompletedPlan();
  expect(ready.result?.problems).toEqual([]);
  expect(ready.status).toBe("available");
  expect(ready.result?.proposal).toMatchObject({ readiness: "ready", firstEligiblePhase: "9", preparation: [
    { repository: "comet-library", sourceRevision: prdRevision, valid: true, authorization: "phase_preparation" },
    { repository: "lending-api", sourceRevision: apiRevision, valid: true, authorization: "phase_preparation" },
  ] });
  expect(ready.result?.proposal?.prerequisites.find(row => row.phaseId === "8")?.status).toBe("preparation_available");
  expect(ready.result?.added.map(row => row.id)).toEqual(["9", "10", "11", "12", "13", "14", "15"]);

  publish(false);
  const missing = await h.engine.checkCompletedPlan();
  expect(missing.status).toBe("blocked");
  expect(missing.result?.proposal?.preparation.map(binding => binding.repository)).toEqual(["comet-library"]);
  expect(missing.result?.proposal?.prerequisites.find(row => row.phaseId === "8")?.status).toBe("blocked");
  expect(missing.result?.problems.join(" ")).toContain("lending-api");
  expect(h.claudeCalls()).toEqual([]);
  expect(h.kilnGitCalls().some(call => /^(checkout|switch|reset|worktree add|merge |push)\b/.test(call))).toBe(false);
});
