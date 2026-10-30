import { homedir } from "node:os";
import { codexVerificationArguments, preparationHooks, preparationEnvironment, preparationPermissions, verificationSandbox } from "./preparation-permissions.js";
/** Sequential native checks at one committed source checkpoint. No shell or provider claims. */
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, existsSync, lstatSync, openSync, readFileSync, readlinkSync, realpathSync, writeSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gitRead, remoteBase } from "./completed-plan-sources.js";
import { runGit, type GitContext } from "./git-reads.js";
import { findExecutable, spawnDetached, endProcessTree } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { createGate, readGate } from "../live/gate.js";
import { LiveOwnedProcesses, captureOwnedProcesses } from "../live/owned-processes.js";
import { requireExited } from "../live/ownership.js";
import type { PrdRecord } from "../state/records.js";
import { mergeTargetKey } from "../state/development-delivery.js";
import { preparationAttemptNeedsReconciliation, preparationDigest, type PreparationState, type PreparationCheckpoint, type PreparationCheckAttempt } from "./preparation-state.js";
import { checkArgv } from "./preparation-documents.js";

export interface PreparationContext { record: PrdRecord; stateDirectory: string; git: GitContext; env: NodeJS.ProcessEnv; signal: AbortSignal; codex?: string | undefined; sessionId?: string | undefined; transcriptPath?: string | undefined; authorizeCommands?(): Promise<void>; save(): void; now(): string }
function environmentDigest(context: PreparationContext, environment: NodeJS.ProcessEnv): string {
  const values = { ...environment };
  if (context.record.settings.agentId === "codex" && values.PATH) {
    const original = new Set((context.env.PATH ?? "").split(delimiter));
    const aliases = join(context.env.CODEX_HOME ?? join(homedir(), ".codex"), "tmp", "arg0");
    // Qualified Codex creates a new arg0 shim directory for each native invocation.
    // Bind its managed namespace, all configured PATH bytes and each resolved tool;
    // a per-process random alias name is not project configuration movement.
    values.PATH = values.PATH.split(delimiter).map(path => !original.has(path) && dirname(path) === aliases && /^codex-arg0[\w-]+$/.test(path.slice(aliases.length + 1)) ? join(aliases, "<native-shims>") : path).join(delimiter);
  }
  return preparationDigest(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}
function inside(root: string, path: string): string {
  const canonical = realpathSync(path); const delta = relative(realpathSync(root), canonical);
  if (delta === ".." || delta.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(delta)) throw new Error(`Preparation path escapes its assigned worktree: ${path}`);
  return canonical;
}
export async function preparationCheckpoint(context: PreparationContext): Promise<PreparationCheckpoint> {
  const { record, git } = context; const state = record.preparation!;
  const repositories: PreparationCheckpoint["repositories"] = [];
  for (const repo of record.repositories.filter(repo => repo.setupCompletedAt)) {
    const root = realpathSync(repo.worktreePath);
    if (root !== resolve(repo.worktreePath) || lstatSync(repo.worktreePath).isSymbolicLink()) throw new Error(`Restore the canonical assigned worktree ${repo.worktreePath}.`);
    const branch = (await gitRead(git, root, ["branch", "--show-current"])).trim();
    const head = (await gitRead(git, root, ["rev-parse", "HEAD"])).trim();
    const tree = (await gitRead(git, root, ["rev-parse", "HEAD^{tree}"])).trim();
    const index = await gitRead(git, root, ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (branch !== record.settings.featureBranch || index.trim()) throw new Error(`Commit the prepared source and resolve conflicts in ${repo.name} on its assigned branch before verification. Unrelated files remain intact.`);
    const origin = (await gitRead(git, root, ["config", "--get", "remote.origin.url"])).trim();
    const { parseGithubOrigin } = await import("../github-origin.js");
    const identity = parseGithubOrigin(origin);
    if (!identity || `${identity.owner}/${identity.name}`.toLowerCase() !== repo.github.toLowerCase()) throw new Error(`Repository identity changed in ${repo.name}.`);
    const names = (await gitRead(git, root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])).split("\0").filter(Boolean).sort();
    const fingerprint = createHash("sha256");
    for (const name of names) {
      const path = resolve(root, name); inside(root, dirname(path)); const stat = lstatSync(path);
      if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Unsupported source entry ${repo.name}/${name}.`);
      fingerprint.update(JSON.stringify([name, stat.mode, stat.isSymbolicLink() ? readlinkSync(path) : createHash("sha256").update(readFileSync(path)).digest("hex")]));
    }
    repositories.push({ name: repo.name, identity: repo.github, worktree: root, branch, head, tree, index, files: fingerprint.digest("hex") });
  }
  for (const binding of state.bindings) {
    const repo = record.repositories.find(repo => repo.name === binding.repository)!;
    if (!repo || repo.github !== binding.repositoryIdentity) throw new Error(`Preparation repository ${binding.repository} is unavailable.`);
    const source = (await gitRead(git, repo.mainCheckoutPath, ["rev-parse", "--verify", "--end-of-options", `${binding.sourceRef}^{commit}`])).trim();
    if (source !== binding.sourceRevision) throw new Error(`Preparation source ${binding.sourceRef} moved. Reconcile the pinned source before retrying.`);
    const covered = await runGit(git, repo.worktreePath, ["merge-base", "--is-ancestor", binding.sourceRevision, "HEAD"]);
    if (covered.exitCode !== 0) throw new Error(`Integrate the pinned ${binding.repository} source ${binding.sourceRevision} before dependent implementation.`);
    if (binding.authorization === "delivery_target") {
      const target = { repository: `github.com/${binding.repositoryIdentity}`.toLowerCase(), baseBranch: binding.baseBranch };
      if (!record.developmentAuthorization?.enabled || !record.developmentAuthorization.grants.some(grant => mergeTargetKey(grant.target) === mergeTargetKey(target) && grant.target.environment === undefined)) throw new Error(`The exact fresh-run target grant for ${binding.repository}/${binding.baseBranch} is unavailable.`);
      const base = await remoteBase(git, repo.mainCheckoutPath, binding.baseBranch);
      if ((await runGit(git, repo.mainCheckoutPath, ["merge-base", "--is-ancestor", binding.sourceRevision, base])).exitCode !== 0 || (await runGit(git, repo.worktreePath, ["merge-base", "--is-ancestor", base, "HEAD"])).exitCode !== 0) throw new Error(`Verify the pinned preparation in origin/${binding.baseBranch} and synchronize ${binding.repository}'s assigned branch before continuing.`);
    } else if (binding.destination !== "assigned_feature" && binding.destination !== record.settings.featureBranch) throw new Error("Preparation destination no longer matches the assigned branch.");
  }
  const tools = (await Promise.all(state.bindings.flatMap(binding => binding.checks.map((_, index) => resolveCheck(context, binding, index))))).map(check => ({ ...check, digest: preparationDigest(readFileSync(check.executable).toString("base64")) }));
  const environment = preparationDigest({ env: Object.entries(context.env).sort(([a], [b]) => a.localeCompare(b)), tools, runtime: { executable: process.execPath, version: process.version }, permissions: await preparationPermissions(context) });
  return { id: preparationDigest({ repositories, environment }), repositories, environment };
}
export async function reconcilePreparationAttempt(attempt: PreparationCheckAttempt): Promise<void> {
  if (!attempt.pid || !attempt.processStartTime || !existsSync(attempt.gateDirectory)) throw new Error("Verification launch/process ownership is unresolved. Reconcile that check and its external effects before retrying preparation.");
  await requireExited({ pid: attempt.pid, processStartTime: attempt.processStartTime });
  let gate = readGate(attempt.gateDirectory);
  if (gate.obstacle || gate.processObservations?.length) {
    await captureOwnedProcesses(attempt.gateDirectory, attempt.pid, attempt.processStartTime);
    gate = readGate(attempt.gateDirectory);
  }
  if (gate.obstacle || gate.processObservations?.length) throw new Error(gate.obstacle ?? "Verification descendant ownership remains unresolved.");
  for (const process of gate.tracked) await requireExited({ pid: process.pid, processStartTime: process.startTime });
}
async function resolveCheck(context: PreparationContext, binding: PreparationState["bindings"][number], index: number) {
  const check = binding.checks[index]!; const repo = context.record.repositories.find(repo => repo.name === binding.repository)!;
  if (JSON.stringify(checkArgv(check.command)) !== JSON.stringify(check.argv)) throw new Error("Verification invocation changed.");
  const root = realpathSync(repo.worktreePath); const directory = inside(root, resolve(root, check.directory));
  const environment = await preparationEnvironment(context, directory);
  const tool = check.argv[0]!;
  const executable = tool.startsWith("./") ? inside(root, resolve(directory, tool)) : findExecutable(tool, environment);
  if (!executable) throw new Error(`Required validation executable ${tool} is unavailable in the existing environment.`);
  // Resolve definitions from the committed prepared work, not merely the original source.
  if (tool === "npm") {
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    const script = check.argv[1] === "run" ? check.argv[2] : check.argv[1];
    if (!script || !manifest.scripts?.[script]) throw new Error(`Validation script ${check.command} is missing from the prepared package.json.`);
  } else if (!tool.startsWith("./") && (!/^python(?:3(?:\.\d+)?)?$/.test(tool) || check.argv[1] !== "-m" || !readFileSync(join(root, "README.md"), "utf8").includes(check.command))) throw new Error("The prepared README does not document this validation tool.");
  return { executable: realpathSync(executable), environmentDigest: environmentDigest(context, environment), argv: check.argv.slice(1), directory, timeoutSeconds: check.timeoutSeconds };
}
async function executeCheck(context: PreparationContext, attempt: PreparationCheckAttempt): Promise<void> {
  let output: number | undefined;
  let hooks: Awaited<ReturnType<typeof preparationHooks>>;
  let nativeCommand: { executable: string; args: string[] };
  let child: ReturnType<typeof spawnDetached>;
  try {
    const environment = await preparationEnvironment(context, attempt.directory);
    if (environmentDigest(context, environment) !== attempt.environmentDigest) throw new Error("The established validation environment changed before project-command launch.");
    output = openSync(attempt.output, "wx", 0o600);
    const sandbox = verificationSandbox(context, attempt.gateDirectory);
    hooks = await preparationHooks(context, attempt.directory);
    nativeCommand = context.record.settings.agentId === "codex" ? { executable: context.codex!, args: [...codexVerificationArguments(context), attempt.executable, ...attempt.argv] } : { executable: sandbox.executable, args: [...sandbox.args, attempt.executable, ...attempt.argv] };
    child = spawnDetached(process.execPath, [fileURLToPath(new URL("../../prompts/preparation-check-runner.mjs", import.meta.url))], { cwd: attempt.directory, env: context.record.settings.agentId === "codex" ? context.env : environment, stdin: "pipe" });
  } catch (error) {
    // No spawn occurred. A lost launch-intent acknowledgement never reaches here,
    // and remains unknown on restart rather than being inferred safe to repeat.
    if (output !== undefined) closeSync(output);
    attempt.outcome = "failed"; attempt.launchFailure = "not_launched";
    attempt.endedAt = context.now(); attempt.reason = (error as Error).message;
    context.save(); return;
  }
  const outputFile = output;
  let failure: string | undefined; let outputBytes = 0; let tracker: LiveOwnedProcesses | undefined;
  const result = new Promise<{ code: number | null; signal?: string }>(resolve => {
    child.on("error", error => { failure = error.message; resolve({ code: null }); });
    child.on("close", (code, signal) => resolve({ code, ...(signal ? { signal } : {}) }));
  });
  const terminate = (reason: string) => { failure ??= reason; void endProcessTree(child.pid, "SIGTERM"); };
  const abort = () => terminate("Verification interrupted by controller shutdown.");
  const timer = setTimeout(() => terminate(`Verification timed out after ${attempt.timeoutSeconds} seconds.`), attempt.timeoutSeconds * 1000);
  const killer = setInterval(() => { if (failure) void endProcessTree(child.pid, "SIGKILL"); }, 1000);
  context.signal.addEventListener("abort", abort, { once: true });
  const consume = (data: Buffer) => { outputBytes += data.length; if (outputBytes > 16 * 1024 * 1024) terminate("Verification output exceeds 16 MiB."); else try { writeSync(outputFile, data); } catch (error) { terminate(`Verification output could not be retained: ${(error as Error).message}`); } };
  child.stdout!.on("data", consume); child.stderr!.on("data", consume);
  try {
    if (child.pid) {
      attempt.pid = child.pid; const startTime = await processStartTime(child.pid); if (startTime) attempt.processStartTime = startTime;
      context.save();
      if (!attempt.processStartTime) terminate("Verification process start identity is unavailable.");
      else { await captureOwnedProcesses(attempt.gateDirectory, child.pid, attempt.processStartTime); tracker = new LiveOwnedProcesses(attempt.gateDirectory, child.pid, attempt.processStartTime); tracker.start(); child.stdin!.write(JSON.stringify({ ...nativeCommand, hooks, projectRoot: context.record.repositories.find(repo => repo.name === context.record.preparation!.bindings.find(binding => binding.id === attempt.bindingId)!.repository)!.worktreePath, input: { session_id: context.sessionId, transcript_path: context.transcriptPath, cwd: attempt.directory, permission_mode: "auto", hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: attempt.id, tool_input: { command: context.record.preparation!.bindings.find(binding => binding.id === attempt.bindingId)!.checks[attempt.checkIndex]!.command } } }) + "\n"); }
    }
    if (context.signal.aborted) abort();
    const outcome = await result;
    if (!child.pid && failure) {
      // Node's spawn error with no PID positively establishes no child launch.
      attempt.outcome = "failed"; attempt.launchFailure = "not_launched";
      attempt.endedAt = context.now(); attempt.reason = failure; return;
    }
    await tracker?.close();
    // A process exiting does not establish that its descendants released the checkpoint.
    await endProcessTree(child.pid, "SIGKILL");
    if (attempt.pid && attempt.processStartTime) await reconcilePreparationAttempt(attempt);
    else throw new Error("Verification process identity is unresolved.");
    fsyncSync(outputFile);
    attempt.outputDigest = preparationDigest(readFileSync(attempt.output).toString("base64"));
    const directory = openSync(attempt.gateDirectory, "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
    attempt.endedAt = context.now();
    if (outcome.code !== null) attempt.exitCode = outcome.code;
    attempt.outcome = !failure && outcome.code === 0 ? "succeeded" : context.signal.aborted ? "interrupted" : "failed";
    if (failure || outcome.code !== 0) attempt.reason = failure ?? `Validation exited ${outcome.code ?? outcome.signal ?? "without a result"}.`;
  } catch (error) {
    attempt.outcome = "unresolved"; attempt.reason = (error as Error).message;
    await endProcessTree(child.pid, "SIGKILL");
    await result;
    await tracker?.close();
  }
  finally { clearTimeout(timer); clearInterval(killer); context.signal.removeEventListener("abort", abort); closeSync(outputFile); context.save(); }
}
export async function verifyPreparation(context: PreparationContext): Promise<PreparationCheckpoint> {
  const state = context.record.preparation!;
  for (const attempt of state.attempts.filter(preparationAttemptNeedsReconciliation)) {
    await reconcilePreparationAttempt(attempt);
    attempt.outcome = "unresolved"; attempt.reason = "The controller lost this check's result. Resume preparation to investigate and resubmit after reconciling external effects."; context.save();
    throw new Error(attempt.reason);
  }
  const checkpoint = await preparationCheckpoint(context);
  state.stage = "verification"; state.checkpoint = checkpoint; delete state.verifiedCheckpoint; context.save();
  for (const binding of state.bindings) for (let index = 0; index < binding.checks.length; index++) {
    context.signal.throwIfAborted();
    if ((await preparationCheckpoint(context)).id !== checkpoint.id) throw new Error("Prepared source/configuration moved before verification; no implementation is admitted.");
    const previous = state.attempts.findLast(row => row.bindingId === binding.id && row.checkIndex === index && row.checkpointId === checkpoint.id);
    if (previous?.outcome === "succeeded") {
      if (previous.outputDigest && previous.endedAt && previous.exitCode === 0 && existsSync(previous.output) && preparationDigest(readFileSync(previous.output).toString("base64")) === previous.outputDigest) continue;
      previous.outcome = "unresolved"; previous.reason = "The retained check output is missing or changed. Resume preparation to reconcile that check before repeating it."; context.save(); throw new Error(previous.reason);
    }
    const id = randomUUID(); const gateDirectory = join(context.stateDirectory, "preparation-checks", id);
    createGate(gateDirectory, { executionId: context.record.executionId!, activityId: `preparation-${state.phaseId}`, activityKey: state.phaseId, sessionId: id, providerSessionId: id, attemptId: id });
    const attempt: PreparationCheckAttempt = { id, bindingId: binding.id, checkIndex: index, checkpointId: checkpoint.id, ...await resolveCheck(context, binding, index), startedAt: context.now(), gateDirectory, output: join(gateDirectory, "output.txt"), outcome: "running" };
    state.attempts.push(attempt); context.save(); // launch intent precedes spawn
    await executeCheck(context, attempt);
    let after: PreparationCheckpoint;
    try { after = await preparationCheckpoint(context); }
    catch (error) { if (attempt.outcome !== "unresolved") attempt.outcome = "failed"; attempt.reason = [attempt.reason, `Source/configuration changed during validation: ${(error as Error).message}`].filter(Boolean).join(" "); context.save(); throw error; }
    if (after.id !== checkpoint.id) { if (attempt.outcome !== "unresolved") attempt.outcome = "failed"; attempt.reason = [attempt.reason, "Source/configuration changed while validation was running."].filter(Boolean).join(" "); context.save(); }
    if (attempt.outcome !== "succeeded") throw new Error(attempt.reason ?? "The engine did not observe a successful validation result.");
  }
  state.verifiedCheckpoint = checkpoint; context.save();
  return checkpoint;
}
