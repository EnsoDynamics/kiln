import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";


import { createCometContinuation, COMET_DIRECTORY, cometPhase } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import type { Harness } from "../test-support/engine-harness.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { readContinuationProposal } from "./continuation-readiness.js";
let h: Harness;
afterEach(async () => { await h?.cleanup(); });
it("binds a stable integrated offer and changes identity when relevant base/settings move", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const first = await h.engine.checkCompletedPlan();
  expect(first.status).toBe("available"); expect(first.result?.proposal).toMatchObject({ readiness: "ready", firstEligiblePhase: "9", added: Array.from({ length: 7 }, (_, i) => expect.objectContaining({ id: String(i + 9) })) });
  const proposal = first.result!.proposal!;
  expect(readContinuationProposal(h.stateDirectory, proposal.id)).toEqual(proposal);
  expect((await h.engine.checkCompletedPlan()).result?.proposal?.id).toBe(proposal.id);
  writeFileSync(join(h.repository, "base-movement.txt"), "current base moved\n");
  git(h.sandbox, h.repository, "add", "base-movement.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test: move delivery base"); f.publish();
  expect((await h.engine.checkCompletedPlan()).result?.proposal?.id).not.toBe(proposal.id);
  h.engine.record.settings.keepAwake = !h.engine.record.settings.keepAwake;
  expect((await h.engine.checkCompletedPlan()).result?.proposal?.id).not.toBe(proposal.id);
  expect(h.claudeCalls()).toEqual([]);
});
it("keeps unavailable preparation blocked with exact recovery and no provider work", async () => {
  const f = await createCometContinuation(); h = f.h;
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`missing\` at \`${f.externalRevision}\` into this phase's branch before building.\n\nVerify before building: run \`npm test\`.\n`);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: preparation source"); f.publish();
  const check = await h.engine.checkCompletedPlan(); expect(check.status).toBe("blocked");
  expect(check.result?.proposal?.problems.join(" ")).toContain("restore source missing"); expect(check.result?.added).toHaveLength(7); expect(h.claudeCalls()).toEqual([]);
});

it("offers seven phases with local preparation under Continue and requires the existing target grant for develop", async () => {
  const f = await createCometContinuation(); h = f.h;
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  writeFileSync(join(h.repository, "package.json"), JSON.stringify({ scripts: { test: "node --version" } }));
  git(h.sandbox, h.repository, "add", "package.json"); git(h.sandbox, h.repository, "commit", "-qm", "test: catalog validation script");
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  const writePreparation = (destination: string, command = "npm test") => {
    f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${revision}\` into ${destination} before building.\n\nVerify before building: run \`${command}\`.\n`);
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: prepare catalog prerequisite"); f.publish();
  };
  writePreparation("this phase's branch");
  const ready = await h.engine.checkCompletedPlan();
  expect(ready.result?.proposal?.problems).toEqual([]);
  expect(ready.status).toBe("available");
  expect(ready.result?.proposal).toMatchObject({ readiness: "ready", firstEligiblePhase: "9", preparation: [{ authorization: "phase_preparation", sourceRevision: revision }], prerequisites: expect.arrayContaining([{ phaseId: "8", status: "preparation_available", evidence: expect.any(Array) }]) });
  expect(ready.result?.added).toHaveLength(7);
  const terminal = formatDecisionLine({ kind: "complete" }, h.engine, terminalColors({}, {}));
  expect(terminal).toContain("Readiness: Ready"); expect(terminal).toContain("First phase to run: Phase 9"); expect(terminal).toContain("7 new unfinished phases");
  expect(ready.result?.leaves?.find(row => row.id === "8")?.classification).toBe("externally_unverified");
  const { startLocalServer } = await import("../server/local-server.js");
  const { launchChrome } = await import("../test-support/headless-chrome.js");
  const server = await startLocalServer({ engine: h.engine, port: 41987, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  const chrome = await launchChrome();
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(server.address, { width, height: 1000 });
      try {
        await page.waitFor("document.body.innerText.includes('Readiness: Ready') && document.body.innerText.includes('Continue authorizes this preparation.')");
        await page.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Check for new phases') && !b.disabled) && !document.body.innerText.includes('Showing earlier results.')");
        const text = await page.evaluate<string>("document.body.innerText");
        expect(text).toContain("First phase to run: Phase 9");
        expect(text).toContain("7 new unfinished phases");
        expect(text.indexOf("Readiness: Ready")).toBeLessThan(text.indexOf("Earlier catalog delivery"));
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-comet-readiness-${width}.png`, await page.screenshot());
      } finally { await page.close(); }
    }
  } finally { await chrome.close(); await server.close(); }
  writePreparation("this phase's branch", "./nonexistent-check");
  const missing = await h.engine.checkCompletedPlan();
  expect(missing.status).toBe("blocked"); expect(missing.result?.problems.join(" ")).toContain("missing, unsafe or not executable");
  expect(missing.result?.proposal?.prerequisites.find(row => row.phaseId === "8")?.status).toBe("blocked");
  writePreparation("branch `develop`");
  const blocked = await h.engine.checkCompletedPlan();
  expect(blocked.status).toBe("blocked"); expect(blocked.result?.problems.join(" ")).toContain("early-merge target grant");
  expect(h.claudeCalls()).toEqual([]);
});

it("does not mistake an earlier unmerged completion receipt for integrated prerequisite work", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  git(h.sandbox, h.repository, "checkout", "-qb", "prior-unmerged");
  writeFileSync(join(h.repository, "unmerged.txt"), "earlier phase work\n");
  git(h.sandbox, h.repository, "add", "unmerged.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test: earlier unmerged work");
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  const { readBaseline, retainBaseline } = await import("./plan-reconciliation.js");
  const { id: _id, ...baseline } = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!);
  void _id;
  baseline.completions["1"]!.revision = revision;
  h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, baseline).id;
  const check = await h.engine.checkCompletedPlan();
  expect(check.status).toBe("blocked"); expect(check.result?.problems.join(" ")).toContain("not integrated in origin/develop");
  expect(check.result?.proposal?.prerequisites.find(row => row.phaseId === "1")?.status).toBe("blocked");
  for (let id = 9; id <= 15; id++) git(h.sandbox, h.repository, "rm", `${COMET_DIRECTORY}/phase-${id}-catalog.md`);
  git(h.sandbox, h.repository, "commit", "-qm", "test: unchanged historical completion"); f.publish();
  expect((await h.engine.checkCompletedPlan()).status).toBe("unchanged");
});
