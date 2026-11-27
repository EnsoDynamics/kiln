// Opt-in authenticated proof, not part of the main program (Kiln Requirements Stages, Phase 2, Delivery).
// In one disposable repository with a local origin: a real stage session drafts a small PRD and is
// sent one live feedback message while it works, as Kiln delivers one, and then a real feedback
// session applies a second message to the PRD it wrote. Run after `npm run build`.
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
import { createGate, withGate } from "../../dist/live/gate.js";
import { consumedUuids } from "../../dist/live/target.js";
import { claudeConfigFolder } from "../../dist/session/transcripts.js";
import { writeDurableMetadata } from "../../dist/control/durable-file.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-requirements-feedback-proof-")));
const repository = join(root, "proof");
const stateDirectory = join(root, "state");
const branch = "feature/count-cards";
mkdirSync(repository);
mkdirSync(stateDirectory);
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
git("init", "-q", "-b", branch);
git("config", "user.name", "Kiln requirements proof");
git("config", "user.email", "proof@example.invalid");
git("init", "--bare", "-q", join(root, "origin.git"));
git("remote", "add", "origin", join(root, "origin.git"));
const brief = "source-material/count-cards/count-cards-brief.md";
mkdirSync(join(repository, "source-material/count-cards"), { recursive: true });
writeFileSync(join(repository, brief), "# Brief: Count cards\n\nA volunteer needs to record the number of cards in each box during a shift. On a single local page, they enter a box label and a positive whole count. Show the entries and their total. Keep them after a reload on this computer. No accounts, sharing, editing, or export.\n");
git("add", brief);
git("commit", "-qm", "docs(brief): describe the card counter");
git("push", "-qu", "origin", branch);
const base = git("rev-parse", "HEAD");
const cli = process.env.KILN_LIVE_PROOF_CLAUDE ?? "claude";
const cliVersion = execFileSync(cli, ["--version"], { encoding: "utf8" }).trim().split(/\s/)[0];
const entry = await resolveSkill({ name: "using-the-enso-method", agent: "claude_code", cwd: repository, claude: cli, env: process.env });
assert.equal(entry.kind, "found", entry.message);

async function run(task, work, messages, live) {
  const sessionId = randomUUID();
  const record = { schemaVersion: SCHEMA_VERSION, sessionId, phaseId: "req-" + sessionId, kind: "requirements", agentId: "claude_code", createdAt: new Date().toISOString(), model: "fable", modelDisplayName: "Fable", effort: "high", workingDirectory: repository, runs: [], sleeps: [], steps: [] };
  writeSessionRecord(stateDirectory, record);
  const prompt = requirementsPrompt(task, { skillPath: entry.skill.path, work, worktree: repository, branch, holds: "prd_refined without a technical design, and requirements_finished", messages });
  console.log(JSON.stringify({ task, root, sessionId }));
  const gate = join(root, `gate-${sessionId}`);
  const attemptId = randomUUID();
  if (live) createGate(gate, { executionId: randomUUID(), activityId: randomUUID(), activityKey: record.phaseId, sessionId, providerSessionId: sessionId, attemptId });
  let control; let sending; const consumed = new Set();
  const result = await runSessionProcess({ claude: cli, args: [...launchArguments(sessionId, record.model, record.effort), ...(live ? ["--replay-user-messages"] : [])], cwd: repository, env: process.env, prompt, cause: "launch", stateDirectory, record,
    ...(live ? {
      live: { attemptId, gateDirectory: gate, configRoot: claudeConfigFolder(process.env), profile: `claude-code-${cliVersion}/${process.platform}`, agentVersion: cliVersion, literalInput: true, messageContract: "unproven", hookContract: "unproven" },
      onSpawned: value => { control = value; },
      onLiveEvent: event => {
        for (const uuid of consumedUuids(event)) consumed.add(uuid);
        // Sent once the session is at work, as Kiln delivers feedback to a running stage: its id line, then the person's text.
        if (!sending && event.type === "assistant" && event.message?.content?.some(block => block.type === "tool_use") && control?.inputOpen()) sending = withGate(gate, state => {
          state.inputs ??= {}; state.inputs[live.uuid] = { terminal: false };
          writeDurableMetadata(join(gate, "gate.json"), state);
          live.write = control.sendMessage(`Kiln feedback ${live.id}:\n${live.text}`, live.uuid);
        });
      },
    } : {}) });
  if (live) { await sending; assert.equal(await live.write, "written", "the live message must be written"); assert.ok(consumed.has(live.uuid), "the session must confirm it read the live message"); }
  assert.equal(result.exitCode, 0, result.result?.text || result.spawnError);
  const report = readStageReport(result.result?.text ?? "", task);
  assert.ok(report?.finished, result.result?.text);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(git("branch", "--show-current"), branch);
  return report;
}

const live = { id: "m-1", uuid: randomUUID(), text: "The page should also show how many boxes have been counted, beside the total." };
const drafted = await run("stage", `${brief} at ${base}`, "", live);
assert.ok(drafted.ran.length, "the stage session must run a stage");
assert.deepEqual(drafted.messages?.find(m => m.id === "m-1")?.outcome, "worked_in", JSON.stringify(drafted));
const { directory } = await locateWrittenPrd({ git: "git", env: process.env }, repository, base, undefined, drafted.prdDirectory);
assert.ok(directory, "the stage session must write a PRD Kiln can find");
const prdFile = `${directory}/${directory.split("/").at(-1)}-prd.md`;
const before = git("rev-parse", "HEAD");
const applied = await run("feedback", directory, "Message m-2:\nA count of zero is allowed: an empty box is still recorded.", undefined);
assert.deepEqual(applied.messages, [{ id: "m-2", outcome: "worked_in" }], JSON.stringify(applied));
assert.ok(applied.changes?.length, "the feedback session must say what changed");
assert.ok(applied.next && applied.milestones, "the feedback session must report where the work stands");
assert.ok(git("diff", "--name-only", `${before}..HEAD`).split("\n").includes(prdFile), "the feedback must change the PRD");
console.log(JSON.stringify({ passed: true, cliVersion, directory, drafted: { ran: drafted.ran, messages: drafted.messages }, applied: { messages: applied.messages, changes: applied.changes, next: applied.next }, commit: git("rev-parse", "HEAD") }));
