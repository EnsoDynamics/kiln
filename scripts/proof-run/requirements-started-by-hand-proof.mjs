// Opt-in authenticated proof (Kiln Requirements Stages, Delivery: a stage session continuing a PRD
// started by hand, AC-BEGIN-04). One disposable repository with a local origin holds a short PRD
// written by hand on its own unmerged branch. The stage session is told only the PRD directory,
// as Kiln tells it when the standing is unknown, finds where the PRD stands with the installed
// method, runs the next stage and reports in Kiln's form, with everything committed on that branch.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkill } from "../../dist/audit/workflow.js";
import { requirementsPrompt } from "../../dist/session/prompts.js";
import { launchArguments, runSessionProcess } from "../../dist/session/claude-session.js";
import { readStageReport } from "../../dist/requirements/stages.js";
import { locateWrittenPrd } from "../../dist/requirements/git.js";
import { SCHEMA_VERSION, writeSessionRecord } from "../../dist/state/records.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-started-by-hand-proof-")));
const repository = join(root, "proof");
const stateDirectory = join(root, "state");
const branch = "prd/count-cards";
mkdirSync(repository);
mkdirSync(stateDirectory);
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
git("init", "-q", "-b", "develop");
git("config", "user.name", "Kiln requirements proof");
git("config", "user.email", "proof@example.invalid");
git("init", "--bare", "-q", join(root, "origin.git"));
git("remote", "add", "origin", join(root, "origin.git"));
writeFileSync(join(repository, "README.md"), "# Card counter\n");
git("add", "README.md");
git("commit", "-qm", "chore: start the repository");
git("push", "-qu", "origin", "develop");
const base = git("rev-parse", "HEAD");
// The PRD was drafted by hand on a branch of its own, as the method makes for a PRD started by hand.
git("switch", "-q", "-c", branch);
const directory = "docs/prds/count-cards";
mkdirSync(join(repository, directory), { recursive: true });
writeFileSync(join(repository, directory, "count-cards-prd.md"), `# PRD: Count cards

## Summary

A volunteer records how many cards are in each box during a shift, on one local page, and sees the total.

## Business Context

Shifts end with a hand count on paper that is often lost. One page on the shift computer replaces the paper.

## Acceptance Criteria

- [ ] **AC-COUNT-01 — Record a box.** The volunteer enters a box label and a positive whole count, and the entry is listed.
- [ ] **AC-COUNT-02 — See the total.** The page shows the sum of every listed count.
- [ ] **AC-COUNT-03 — Keep the entries.** The entries are still listed after the page is reloaded on the same computer.

## Out of Scope

- Accounts, sharing, editing an entry, and export.
`);
git("add", directory);
git("commit", "-qm", "docs(count cards): draft the PRD by hand");
git("push", "-qu", "origin", branch);
const cli = process.env.KILN_LIVE_PROOF_CLAUDE ?? "claude";
const entry = await resolveSkill({ name: "using-the-enso-method", agent: "claude_code", cwd: repository, claude: cli, env: process.env });
assert.equal(entry.kind, "found", entry.message);
const sessionId = randomUUID();
const record = { schemaVersion: SCHEMA_VERSION, sessionId, phaseId: "req-" + sessionId, kind: "requirements", agentId: "claude_code", createdAt: new Date().toISOString(), model: process.env.KILN_LIVE_PROOF_MODEL ?? "fable", modelDisplayName: "Fable", effort: "high", workingDirectory: repository, runs: [], sleeps: [], steps: [] };
writeSessionRecord(stateDirectory, record);
// As Kiln launches the first session of a PRD started by hand: the work is the PRD directory, and the early review isn't held yet.
const prompt = requirementsPrompt("stage", { skillPath: entry.skill.path, work: directory, worktree: repository, branch, holds: "prd_refined without a technical design, and requirements_finished" });
console.log(JSON.stringify({ root, sessionId, started: new Date().toISOString() }));
const result = await runSessionProcess({ claude: cli, args: launchArguments(sessionId, record.model, record.effort), cwd: repository, env: process.env, prompt, cause: "launch", stateDirectory, record });
assert.equal(result.exitCode, 0, result.result?.text || result.spawnError);
const report = readStageReport(result.result?.text ?? "", "stage");
assert.ok(report, result.result?.text);
assert.ok(report.finished, result.result?.text);
// The session found where the PRD stands: it never ran a step before the PRD, and ran a stage or stood at a stop.
assert.notEqual(report.next?.kind, "before_prd");
assert.ok(report.ran.length > 0 || report.milestones.some(m => m.name === "prd_refined" || m.name === "requirements_finished"), JSON.stringify(report));
assert.ok(!report.ran.some(one => /prd-writing-standards/.test(one.skill) && git("log", "--format=%H", `${base}..HEAD`, "--", `${directory}/count-cards-prd.md`).split("\n").length < 2), "the PRD was written again from nothing");
assert.equal(git("status", "--porcelain"), "");
assert.equal(git("branch", "--show-current"), branch);
const located = await locateWrittenPrd({ git: "git", env: process.env }, repository, base, directory, report.prdDirectory);
assert.equal(located.directory, directory, JSON.stringify(located));
console.log(JSON.stringify({ passed: true, ran: report.ran, next: report.next, milestones: report.milestones, commit: git("rev-parse", "HEAD"), finished: new Date().toISOString() }));
