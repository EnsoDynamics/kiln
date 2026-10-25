// Semantic audit candidate for the isolated proof; no application runner imports it.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outsideChanges, gitCommandsIn, gitChange } from '../../dist/session/outside-workspace.js';
import { comparable, realPathOfNearestAncestor } from '../../dist/engine/worktree-setup.js';

const physical = path => realPathOfNearestAncestor(resolve(path));
const cwdPath = path => path?.startsWith('file:') ? fileURLToPath(path) : path;

export function auditEntries(entries, worktrees) {
  const problems = [], calls = [], inherited = [];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  function ancestors(entry) {
    const found = [], seen = new Set([entry.id]);
    while (entry.parentThreadId) {
      if (seen.has(entry.parentThreadId)) { problems.push('Cyclic parent links'); break; }
      seen.add(entry.parentThreadId);
      entry = byId.get(entry.parentThreadId);
      if (!entry) { problems.push('Missing referenced ancestor'); break; }
      found.push(entry);
    }
    return found;
  }
  function owner(entry, turnId) {
    return [entry, ...ancestors(entry)].find(candidate => candidate.turns.some(turn => turn.id === turnId));
  }
  for (const entry of entries) {
    for (const child of entry.childRefs) if (!byId.has(child)) problems.push(`${entry.id}: missing child ${child}`);
    for (const turn of entry.turns) {
      if (turn.itemsView !== 'full' || !['completed', 'interrupted', 'failed'].includes(turn.status)) problems.push(`${entry.id}: incomplete or unsettled turn ${turn.id}`);
      if (!entry.started.includes(turn.id) || !entry.completed.includes(turn.id)) problems.push(`${entry.id}: raw frontier missing for ${turn.id}`);
    }
    for (const start of entry.startEvidence) {
      const source = owner(entry, start.turnId);
      if (!source) problems.push(`${entry.id}: unowned raw turn ${start.turnId}`);
      else if (source !== entry) {
        if (!source.startEvidence.some(record => record.turnId === start.turnId && record.sha256 === start.sha256)) problems.push(`${entry.id}: changed inherited start`);
        else inherited.push({ threadId: entry.id, turnId: start.turnId, owner: source.id });
      }
    }
    for (const context of entry.contexts) {
      const source = owner(entry, context.turnId);
      if (!source || source !== entry && !source.contexts.some(record => record.turnId === context.turnId && record.sha256 === context.sha256)) problems.push(`${entry.id}: unverifiable inherited context`);
    }
    const nativeCommands = entry.nativeCommands.filter(command => command.threadId === entry.id);
    if (nativeCommands.some(command => !['completed', 'failed', 'declined'].includes(command.status))) problems.push(`${entry.id}: unsettled native command`);
    const usedCommands = new Set();
    const patchPaths = new Set();
    for (const decoded of entry.calls) {
      const source = owner(entry, decoded.turnId);
      if (!source) { problems.push(`${entry.id}/${decoded.callId}: unknown originating turn`); continue; }
      if (source !== entry) {
        if (!source.calls.some(call => call.callId === decoded.callId && call.rawSha256 === decoded.rawSha256)) problems.push(`${entry.id}: changed inherited invocation`);
        continue;
      }
      const context = entry.contexts.find(record => record.turnId === decoded.turnId);
      if (!context?.cwd) { problems.push(`${entry.id}: missing call context`); continue; }
      if (decoded.coverage !== 'complete') { problems.push(`${entry.id}/${decoded.callId}: ${decoded.reason}`); continue; }
      for (const operation of decoded.operations) {
        if (operation.name === 'exec_command') {
          const input = operation.input;
          if (typeof input?.cmd !== 'string') { problems.push('Missing recorded command'); continue; }
          const cwd = physical(resolve(context.cwd, input.workdir ?? '.'));
          const matching = nativeCommands.filter(command => command.turnId === decoded.turnId && physical(cwdPath(command.cwd)) === cwd && Array.isArray(command.argv) && command.argv.length === 3 && ['/bin/zsh','/bin/bash','/bin/sh'].includes(command.argv[0]) && (!input.shell || command.argv[0] === input.shell) && ['-c', '-lc'].includes(command.argv[1]) && command.argv[2] === input.cmd);
          const native = matching[0];
          const knownFields = ['cmd','workdir','shell','login','tty','yield_time_ms','max_output_tokens','sandbox_permissions','justification','prefix_rule'];
          if (Object.keys(input).some(key => !knownFields.includes(key))) { problems.push('Unrecognized exec parameter'); continue; }
          if (!native && (input.shell !== undefined || !['zsh','bash','sh'].includes(decoded.shell))) { problems.push(`${entry.id}/${decoded.callId}: no recorded POSIX shell identity`); continue; }
          for (const matched of matching) usedCommands.add(matched.id);
          for (const git of gitCommandsIn(input.cmd, cwd)) if (gitChange(git.subcommand, git.args) && git.place === undefined) problems.push(`${entry.id}: unplaced mutating Git command`);
          calls.push({ name: 'Bash', cwd, at: decoded.at, input: { command: input.cmd } });
        } else if (operation.name === 'apply_patch') {
          const patch = operation.input;
          if (typeof patch !== 'string' || !patch.startsWith('*** Begin Patch\n') || !patch.trimEnd().endsWith('*** End Patch')) { problems.push('Malformed patch input'); continue; }
          const paths = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(match => resolve(context.cwd, match[1]));
          if (!paths.length) { problems.push('Patch has no recorded paths'); continue; }
          for (const path of paths) {
            patchPaths.add(`${decoded.turnId}:${physical(path)}`);
            calls.push({ name: 'Write', cwd: context.cwd, at: decoded.at, input: { file_path: path } });
          }
        } else if (operation.name === 'write_stdin' && operation.input.chars) problems.push(`${entry.id}: interactive input requires a separate reader`);
        else if (['spawn_agent', 'send_message', 'followup_task'].includes(operation.name)) {
          const matches = (entry.delegations ?? []).filter(activity => activity.callId === decoded.callId && activity.turnId === decoded.turnId && byId.has(activity.threadId) && ['started', 'interacted'].includes(activity.kind));
          if (!matches.length || decoded.operations.filter(candidate => ['spawn_agent', 'send_message', 'followup_task'].includes(candidate.name)).length !== 1) problems.push(`${entry.id}/${decoded.callId}: unresolved delegated work`);
        }
      }
    }
    if (nativeCommands.some(command => !usedCommands.has(command.id))) problems.push(`${entry.id}: native command not covered by a decoded invocation`);
    for (const write of entry.nativeWrites ?? []) if (!patchPaths.has(`${write.turnId}:${physical(write.path)}`)) problems.push(`${entry.id}: native file change not covered by a decoded invocation`);
  }
  const findings = outsideChanges({ calls }, worktrees.map(path => comparable(physical(path))));
  return { coverage: problems.length ? 'inconclusive' : 'complete', passed: problems.length === 0 && findings.length === 0, findings, problems, inherited, operationsChecked: calls.length };
}
