import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createCometContinuation, COMET_DIRECTORY, cometPhase } from "../test-support/comet-continuation-fixture.js";
import { git } from "../test-support/git-repositories.js";
import type { Harness } from "../test-support/engine-harness.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });

async function fixture() {
  const f = await createCometContinuation(); h = f.h;
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  writeFileSync(join(h.repository, "package.json"), JSON.stringify({ scripts: { test: "node --version", lint: "node --version" } }));
  git(h.sandbox, h.repository, "add", "package.json");
  git(h.sandbox, h.repository, "commit", "-qm", "test(comet): add preparation checks");
  const revision = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  const write = (pin = revision, destination = "this phase's branch", command = "npm test") => {
    f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${pin}\` into ${destination} before building.\n\nVerify before building: run \`${command}\`.\n`);
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY);
    git(h.sandbox, h.repository, "commit", "-qm", "test(comet): publish preparation instructions"); f.publish();
  };
  return { ...f, revision, write };
}

it("refuses an unknown named preparation destination and gives the configured replacement without work", async () => {
  const f = await fixture(); f.write(f.revision, "branch `unconfigured-target`");
  const before = git(h.sandbox, h.repository, "rev-parse", "HEAD");
  const result = await h.engine.checkCompletedPlan();
  expect(result.status).toBe("blocked");
  expect(result.result!.proposal!.problems).toContain("Phase 9: unknown integration destination unconfigured-target; use this phase's branch or configured develop.");
  expect(result.result!.proposal!.preparation).toMatchObject([{ destination: "unconfigured-target", valid: false }]);
  expect(result.result!.proposal!.prerequisites.find(row => row.phaseId === "8")?.status).toBe("blocked");
  expect(h.engine.record.continuation).toBeUndefined(); expect(h.claudeCalls()).toEqual([]);
  expect(git(h.sandbox, h.repository, "rev-parse", "HEAD")).toBe(before);
  expect(git(h.sandbox, h.repository, "status", "--porcelain")).toBe("");
});

it.skipIf(process.platform !== "darwin")("resolves an abbreviated preparation revision to its independent full Git commit", async () => {
  const f = await fixture(); f.write(f.revision.slice(0, 7));
  const result = await h.engine.checkCompletedPlan();
  expect(result.status).toBe("available");
  expect(result.result!.proposal!.preparation).toMatchObject([{ revision: f.revision.slice(0, 7), sourceRevision: f.revision, sourceRef: "wt/catalog-accessibility", valid: true }]);
  expect(result.result!.proposal!.prerequisites.find(row => row.phaseId === "8")?.status).toBe("preparation_available");
  expect(h.claudeCalls()).toEqual([]); expect(h.engine.record.continuation).toBeUndefined();
});

it("refuses an ambiguous seven-character preparation revision using two real Git commit objects", async () => {
  const f = await fixture();
  const tree = git(h.sandbox, h.repository, "rev-parse", `${f.revision}^{tree}`).trim();
  // Find only the two colliding bodies in memory, then let real Git store/resolve them.
  // Their tree/parent are the generated preparation source, never a person's repository.
  const seen = new Map<string, string>(); let pair: [string, string] | undefined;
  for (let index = 0; index < 250_000 && !pair; index++) {
    const body = `tree ${tree}\nparent ${f.revision}\nauthor Kiln Test <kiln-test@example.com> 1790812800 +0000\ncommitter Kiln Test <kiln-test@example.com> 1790812800 +0000\n\nFictional preparation collision ${index}\n`;
    const prefix = createHash("sha1").update(`commit ${Buffer.byteLength(body)}\0${body}`).digest("hex").slice(0, 7);
    const earlier = seen.get(prefix);
    if (earlier) pair = [earlier, body]; else seen.set(prefix, body);
  }
  if (!pair) throw new Error("No generated seven-character collision within the bounded fixture search.");
  const commits = pair.map(body => execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], { input: body, cwd: h.repository, env: h.sandbox.env, encoding: "utf8" }).trim());
  expect(commits[0]).not.toBe(commits[1]); expect(commits[0]!.slice(0, 7)).toBe(commits[1]!.slice(0, 7));
  const prefix = commits[0]!.slice(0, 7);
  expect(git(h.sandbox, h.repository, "rev-parse", `--disambiguate=${prefix}`).trim().split("\n").sort()).toEqual([...commits].sort());
  git(h.sandbox, h.repository, "update-ref", "refs/heads/wt/catalog-accessibility", commits[0]!);
  f.write(prefix);
  const result = await h.engine.checkCompletedPlan();
  expect(result.status).toBe("blocked"); expect(result.result!.proposal!.preparation).toEqual([]);
  expect(result.result!.proposal!.problems).toContain(`Phase 9: restore source wt/catalog-accessibility at ${prefix} in comet-library; the branch and immutable revision must agree.`);
  expect(h.claudeCalls()).toEqual([]); expect(h.engine.record.continuation).toBeUndefined();
});

it.skipIf(process.platform !== "darwin").each(["preparation", "verification"])("invalidates the bound offer when %s instructions change before Continue", async kind => {
  const f = await fixture(); f.write();
  const first = await h.engine.checkCompletedPlan(); expect(first.status).toBe("available");
  const proposal = first.result!.proposal!; const completedId = h.engine.record.executionId;
  const oldCompletedAt = h.engine.record.completedAt;
  f.write(kind === "preparation" ? f.revision.slice(0, 7) : f.revision, "this phase's branch", kind === "verification" ? "npm run lint" : "npm test");
  const response = await h.engine.continuationCommand("accept", { executionId: completedId, proposalId: proposal.id, commandId: `changed-${kind}`, statusToken: h.engine.controlView().token });
  expect(response).toMatchObject({ ok: false, status: 409, code: "proposal_changed" });
  const refreshed = h.engine.record.completedPlanCheck!.result!.proposal!;
  expect(refreshed.id).not.toBe(proposal.id); expect(refreshed.readiness).toBe("ready");
  if (kind === "preparation") expect(refreshed.preparation[0]!.revision).toBe(f.revision.slice(0, 7));
  else expect(refreshed.preparation[0]!.checks[0]!.argv).toEqual(["npm", "run", "lint"]);
  expect(h.engine.record.executionId).toBe(completedId); expect(h.engine.record.completedAt).toBe(oldCompletedAt);
  expect(h.engine.record.continuation).toBeUndefined(); expect(h.claudeCalls()).toEqual([]);
});
