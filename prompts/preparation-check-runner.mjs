// Tracked native verifier. Project commands run only inside their existing OS/provider sandbox.
// Trusted synchronous command hooks use the provider's JSON protocol on each invocation.
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
let active;
let received = false;
let input = '';
const call = (executable, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { cwd: process.cwd(), env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); active = child;
  const timer = options.timeoutMs ? setTimeout(() => { process.stderr.write('Existing hook exceeded its configured timeout.\n'); process.kill(-process.pid, 'SIGTERM'); }, options.timeoutMs) : undefined;
  let stdout = ''; let stderr = ''; let bytes = 0;
  const consume = (data, error) => { bytes += data.length; if (bytes > 16 * 1024 * 1024) { child.kill('SIGKILL'); reject(new Error('Native verification output exceeds its bound.')); } else { if (error) stderr += data; else stdout += data; if (!options.capture) (error ? process.stderr : process.stdout).write(data); } };
  child.stdout.on('data', data => consume(data, false)); child.stderr.on('data', data => consume(data, true));
  child.on('error', error => { clearTimeout(timer); reject(error); }); child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); }); child.stdin.on('error', () => {}); child.stdin.end(options.input ?? '');
});
async function hooks(groups, event, payload, projectRoot) {
  for (const group of groups ?? []) {
    if (group.matcher && group.matcher !== '*' && !new RegExp(group.matcher).test('Bash')) continue;
    for (const hook of group.hooks ?? []) {
      if (hook.type !== 'command' || hook.async || hook.asyncRewake || hook.once || typeof hook.command !== 'string') throw new Error('Unsupported existing verification hook; no project command is authorized.');
      const response = await call(hook.args ? hook.command : process.env.SHELL ?? '/bin/bash', hook.args ?? ['-c', hook.command], { input: JSON.stringify({ ...payload, hook_event_name: event }), capture: true, env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot }, timeoutMs: (hook.timeout ?? 600) * 1000 });
      if (response.stderr) process.stderr.write(response.stderr);
      if (response.code !== 0) throw new Error(`Existing ${event} hook refused or failed (${response.code ?? response.signal}).`);
      let result = {};
      if (response.stdout.includes('{') || /^\s*\[/.test(response.stdout)) { try { result = JSON.parse(response.stdout); } catch { throw new Error('Existing hook returned unreadable structured output.'); } }
      else if (response.stdout) process.stdout.write(response.stdout);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Existing hook returned an unsupported control result.');
      const specific = result.hookSpecificOutput;
      const decision = specific?.permissionDecision;
      if (['continue', 'suppressOutput'].some(key => result[key] !== undefined && typeof result[key] !== 'boolean') || ['stopReason', 'systemMessage', 'terminalSequence', 'reason'].some(key => result[key] !== undefined && typeof result[key] !== 'string') || result.decision !== undefined && !['approve', 'block'].includes(result.decision) || specific !== undefined && (!specific || typeof specific !== 'object' || Array.isArray(specific) || specific.hookEventName !== event) || decision !== undefined && !['allow', 'deny', 'ask'].includes(decision) || ['permissionDecisionReason', 'additionalContext', 'classifierContext'].some(key => specific?.[key] !== undefined && typeof specific[key] !== 'string')) throw new Error('Existing hook returned an unsupported control result.');
      if (result.continue === false || result.decision === 'block' || decision === 'deny' || decision === 'ask' || specific?.updatedInput !== undefined || specific?.updatedToolOutput !== undefined || specific?.updatedMCPToolOutput !== undefined) throw new Error(result.stopReason ?? result.hookSpecificOutput?.permissionDecisionReason ?? 'Existing hook holds or changes this invocation.');
    }
  }
}
process.stdin.on('data', data => {
  input += data;
  if (received || !input.includes('\n')) return;
  received = true;
  void (async () => {
    const request = JSON.parse(input); const payload = request.input;
    await hooks(request.hooks.PreToolUse, 'PreToolUse', payload, request.projectRoot);
    const result = await call(request.executable, request.args);
    const success = result.code === 0;
    await hooks(success ? request.hooks.PostToolUse : request.hooks.PostToolUseFailure, success ? 'PostToolUse' : 'PostToolUseFailure', { ...payload, tool_response: { stdout: result.stdout, stderr: result.stderr, interrupted: !!result.signal }, ...(success ? {} : { error: `Check exited ${result.code ?? result.signal}` }) }, request.projectRoot);
    process.exitCode = result.code ?? 128;
  })().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 125; }).finally(() => process.stdin.destroy());
});
process.stdin.on('end', () => { if (active) { try { process.kill(-process.pid, 'SIGTERM'); } catch { active.kill('SIGTERM'); } } else process.exitCode = 130; });
process.stdin.resume();
