// A phase's own session splits it midway and builds the first sub-phase: Kiln credits that session, and the delivery
// assessment it recorded, to the sub-phase it built. Real Git, stand-in agent sessions, no person involved.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { git } from "../test-support/git-repositories.js";
import { documentsDigest, finishedBy, recordAssessment, type DeliveryContext } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";

let h: Harness | undefined; let flags: string | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; if (flags) rmSync(flags, { recursive: true, force: true }); flags = undefined; });
const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop" };
const DESIGN = `docs/prds/${FOLDER}/technical-design.md`;
function context(h: Harness, phaseId: string): DeliveryContext { return { record: h.engine.record, stateDirectory: h.stateDirectory, prdWorktree: h.engine.worktreePath, prdDirectory: h.engine.paths.prdDirectoryFromRoot, git: { git: h.tools.git, env: h.env }, gh: h.tools.gh, env: h.env, phaseId, now: () => new Date().toISOString(), commands: () => Promise.resolve([]) }; }
const flag = (name: string) => join(flags!, name);

/**
 * Phase 1's session splits Phase 1 into 1a and 1b, builds and closes 1a and records 1a's assessment. Phase 1b's
 * session then corrects the shared technical design, as later sessions routinely do, and finishes 1b. Each session
 * pauses at a flag so the test can record its assessment, as a real session does through Kiln, and, with `between`,
 * change the record or the worktree while 1b's session is running, before it commits.
 */
async function splitMidway(between?: (h: Harness) => void): Promise<Harness> {
  flags = mkdtempSync(join(tmpdir(), "kiln-split-credit-"));
  const splitting = { actions: [
    { skill: "enso-method:implement-from-requirements" },
    { split: [{ id: "1a", slug: "intake-form", title: "Intake form", closed: true }, { id: "1b", slug: "intake-email", title: "Intake email" }] },
    { write: { path: "src/intake-form.txt", content: "form\n" } },
    { touch: flag("1a-built") }, { waitForFile: flag("1a-assessed") },
    { commit: "feat: split phase 1 and build 1a" }, { push: true }, { result: "Phase 1a landed." }, { exit: 0 },
  ] };
  const second = { actions: [
    { skill: "enso-method:implement-from-requirements" },
    { bash: `printf '\\nA correction made while building 1b.\\n' >> ${DESIGN}` },
    { write: { path: "src/intake-email.txt", content: "email\n" } },
    { close: true }, { touch: flag("1b-built") }, { waitForFile: flag("1b-assessed") },
    { commit: "feat: build 1b" }, { push: true }, { result: "Phase 1b landed." }, { exit: 0 },
  ] };
  h = await createHarness({ sessions: [splitting, second, landingSession("src/credit.txt")] });
  await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target }] } });
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  const harness = h;
  const assess = async (leaf: string, launched: string, before?: (h: Harness) => void) => {
    await waitFor(() => existsSync(flag(`${leaf}-built`)));
    const c = context(harness, launched);
    await recordAssessment(c, { phaseId: leaf, documentsDigest: documentsDigest(c, leaf), required: false, criteria: [], reason: `Phase ${leaf} needs no development deployment.`, checkpoints: [] });
    before?.(harness);
    writeFileSync(flag(`${leaf}-assessed`), "");
  };
  await assess("1a", "1");
  await assess("1b", "1b", between);
  await h.engine.settled();
  return h;
}

describe("a phase split midway by its own session (development delivery)", () => {
  it("credits the splitting session to 1a and carries on past 1a after a later phase edits the shared design", async () => {
    const h = await splitMidway();
    // The splitting session is filed under Phase 1 and credited with 1a, the leaf it built.
    expect(h.engine.record.phases["1"]?.sessionIds).toHaveLength(1);
    expect(finishedBy(h.engine.record, "1a")?.[0]).toBe("1");
    expect(h.engine.record.phases["1a"]).toBeUndefined();
    // 1a stays bound to the documents its check passed against, although 1b's session changed the design since.
    const bound = h.engine.record.developmentDelivery!.accepted?.find(one => one.phaseId === "1a");
    expect(bound?.documentsDigest).toBeDefined();
    expect(bound!.documentsDigest).not.toBe(documentsDigest(context(h, "1a"), "1a"));
    // Kiln went on to Phase 2b's session without a person.
    expect(h.claudeCalls()).toHaveLength(3);
    expect(h.engine.record.phases["2b"]?.sessionIds).toHaveLength(1);
  });

  it("binds 1a from the commit the splitting session finished on when an earlier Kiln recorded no binding", async () => {
    // As the live run was left: no binding recorded for 1a before 1b's session changed the shared design.
    const h = await splitMidway(h => { const state = h.engine.record.developmentDelivery!; state.accepted = (state.accepted ?? []).filter(one => one.phaseId !== "1a"); });
    expect(h.engine.record.phases["1a"]).toBeUndefined();
    const finish = h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha!;
    expect(git(h.sandbox, h.engine.worktreePath, "show", `${finish}:${DESIGN}`)).not.toContain("A correction made while building 1b.");
    expect(h.engine.record.developmentDelivery!.accepted?.find(one => one.phaseId === "1a")?.documentsDigest).toBe(h.engine.record.developmentDelivery!.assessments.find(one => one.phaseId === "1a")?.documentsDigest);
    expect(h.engine.record.phases["2b"]?.sessionIds).toHaveLength(1);
  });

  it("says a stop is only bookkeeping, credited to the splitting session, when Kiln cannot rebuild 1a's binding", async () => {
    // No binding and no finish commit to rebuild it from, so 1a needs an assessment no session is left to give.
    const h = await splitMidway(h => {
      const state = h.engine.record.developmentDelivery!; state.accepted = (state.accepted ?? []).filter(one => one.phaseId !== "1a");
      delete h.engine.record.phases["1"]!.repositories["acme-shop"]!.pushedSha;
    });
    expect(h.engine.record.phases["1a"]?.sessionIds).toEqual([]);
    expect(h.engine.record.phases["1a"]?.stop?.checks).toContainEqual(expect.objectContaining({ facts: ["Phase 1a needs a current development-delivery assessment."] }));
    const needsYou = buildSnapshot(h.engine).needsYou!;
    expect(needsYou.phaseId).toBe("1a");
    expect(needsYou.bookkeeping).toEqual({ finishedBy: "1" });
    // Not when a person finished it: then no check passed at that finish to fall back on.
    h.engine.record.phases["1"]!.finishedByPerson = true;
    expect(buildSnapshot(h.engine).needsYou!.bookkeeping).toBeUndefined();
    h.engine.record.phases["1"]!.finishedByPerson = false;
    // Marking it complete carries on to Phase 2b with no session on 1a.
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true }); await h.engine.settled();
    const offer = h.engine.markCompleteOffer(); if (!offer.offered) throw new Error(`Mark complete not offered: ${offer.reason}`);
    h.engine.commands.submit({ command_id: "bookkeeping-1a", execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action: "waive-and-advance", inputs: { check_run_id: offer.checkRunId, via: "browser" } }, "caller", true);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.record.phases["1a"]?.stop).toBeUndefined();
    expect(h.engine.record.phases["2b"]?.sessionIds).toHaveLength(1);
  });
});
