// AC-ACT-03 / AC-CLI-01: the public command's input/result boundary, with real Git/HTTP/journal.
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createHarness, landingSession, waitFor, type Harness } from '../test-support/engine-harness.js';
import { createRepository, git } from '../test-support/git-repositories.js';
import { FOLDER } from '../test-support/fixture-documents.js';
import { startLocalServer, type LocalServer } from '../server/local-server.js';
import { isPortFree } from '../state/instance-lock.js';
import { processStartTime } from '../platform/process-start-time.js';
import { writeJsonAtomically } from '../state/state-files.js';
import { buildSnapshot } from '../engine/snapshot.js';
import type { Receipt } from './commands.js';
import { historyFixture } from '../test-support/codex-history-fixture.js';
import { writeSessionRecord } from '../state/records.js';
import { claudeConfigFolder, findTranscripts } from '../session/transcripts.js';

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const target = () => join(h.repository, `docs/prds/${FOLDER}`);
async function serve() {
  let port = 42300; while (port < 42350 && !await isPortFree(port)) port++;
  if (port === 42350) throw new Error('No free routine-control fixture port');
  server = await startLocalServer({ engine: h.engine, port, folderName: FOLDER, featureName: 'Returns', token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, 'instance.lock'), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../dist/cli.js', import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', data => stdout += String(data)); child.stderr.on('data', data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 20000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }).finally(() => clearTimeout(watchdog));
  expect(stderr).toBe(''); return { code, stdout, json: () => JSON.parse(stdout) };
}
async function mutate(action: string, id: string, flags: string[] = [], text = false) {
  const status = await cli(['status', target(), '--json']); expect(status.code, status.stdout).toBe(0);
  const args = [action, target(), '--command-id', id, '--only-if-status-matches', status.json().status_token as string, ...flags];
  const accepted = await cli([...args, ...(text ? [] : ['--json'])]); expect(accepted.code, accepted.stdout).toBe(0);
  if (text) { expect(accepted.stdout).toContain(`command_id: ${id}`); expect(accepted.stdout).toMatch(/observed_at: \d{4}-\d\d-\d\d .*UTC[+-]\d\d:\d\d/); }
  else expect(accepted.json()).toMatchObject({ schema_version: '1', ok: true, command_id: id, operation: { state: expect.stringMatching(/accepted|in_progress|completed/) } });
  await h.engine.commands.settled();
  const receipt = await cli(['command-status', target(), '--command-id', id, '--json']); expect(receipt.code, receipt.stdout).toBe(0);
  expect(receipt.json().observed_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  return { args, operation: receipt.json().operation as Receipt };
}

it('reads and sets runtime preferences and explicitly requests/cancels deferred pause through the built CLI', async () => {
  h = await createHarness({ sessions: [] }); const release = join(h.sandbox.root, 'release-current');
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { result: 'Current work stopped with a question.' }] }] }));
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => h.engine.controlView().controls.some(c => c.name === 'request-pause' && c.available)); await serve();
  const initial = await cli(['settings', target(), '--json']); expect(initial.code, initial.stdout).toBe(0);
  expect(initial.json()).toMatchObject({ schema_version: '1', data: { keep_awake: h.engine.record.settings.keepAwake, resume_after_usage_limit: true } });
  const setting = await mutate('settings', 'runtime-values', ['--keep-awake', 'off', '--resume-after-usage-limit', 'off'], true);
  expect(setting.operation).toMatchObject({ state: 'completed', settings: { keep_awake: false, resume_after_usage_limit: false }, effects: { session: 'not_started', plan: 'not_advanced' } });
  expect(h.engine.record.settings).toMatchObject({ keepAwake: false, resumeAfterUsageLimit: false });
  const text = await cli(['settings', target()]); expect(text.code).toBe(0); expect(text.stdout).toContain('keep_awake: false'); expect(text.stdout).toContain('resume_after_usage_limit: false');
  await mutate('request-pause', 'pending-pause', [], true); expect(h.engine.record.pause.requestedAt).toEqual(expect.any(String)); expect(h.engine.record.pause.activeSince).toBeUndefined(); expect(h.engine.current?.processRunning).toBe(true);
  await mutate('cancel-pause', 'cancel-pending'); expect(h.engine.record.pause.requestedAt).toBeUndefined(); expect(h.engine.current?.processRunning).toBe(true); expect(h.claudeCalls()).toHaveLength(1);
  writeFileSync(release, 'done'); await h.engine.settled(); expect(h.engine.stoppedPhaseKey()).toBe('1'); expect(h.claudeCalls()).toHaveLength(1);
});

it('continues to the next eligible activity and rechecks a broken plan without substituting phase advancement', async () => {
  h = await createHarness({ sessions: [] }); const release = join(h.sandbox.root, 'release-first');
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, { actions: [{ result: 'Next phase still needs work.' }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => h.claudeCalls().length === 1 && h.engine.controlView().controls.some(c => c.name === 'request-pause' && c.available));
  h.engine.pause(); writeFileSync(release, 'done'); await h.engine.settled(); expect(h.engine.record.pause.activeSince).toEqual(expect.any(String)); await serve();
  const phase = join(h.engine.worktreePath, `docs/prds/${FOLDER}/phase-2b-store-credit.md`); const bytes = readFileSync(phase); rmSync(phase);
  const continued = await mutate('continue', 'continue-paused', [], true); await h.engine.settled(); expect(continued.operation.state).toBe('completed');
  const stopped = structuredClone(h.engine.record.phases['2b']!.stop!); expect(stopped).toMatchObject({ kind: 'plan', checks: [{ name: 'Phase plan reads', passed: false, facts: ['phase-2-refunds.md lists 2b, which has no file.'] }] }); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.phaseRecoveryTarget()).toBeUndefined();
  await mutate('check-again', 'still-broken'); await h.engine.settled(); expect(h.engine.record.phases['2b']!.stop!.checkedAt > stopped.checkedAt).toBe(true); expect(h.engine.record.phases['2b']!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  writeFileSync(phase, bytes); await mutate('check-again', 'repaired-plan', [], true); await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2); expect(h.claudeCalls()[1]!.prompt).toContain('phase-2b-store-credit.md'); expect(h.engine.record.phases['2b']!.sessionIds).toHaveLength(1); expect(h.engine.record.phases['2b']!.doneAt).toBeUndefined(); expect(h.engine.record.phases['1']!.doneAt).toEqual(expect.any(String));
});

it('confirms and clears only reviewed outside evidence, without altering files, sessions or phase completion', async () => {
  h = await createHarness({ sessions: [] }); const outside = createRepository(h.sandbox, 'outside-reviewed'); const file = join(outside, 'changed.txt');
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ write: { path: file, content: 'Outside work for review.\n' } }, { result: 'Review the outside change.' }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); await serve();
  expect(buildSnapshot(h.engine).needsYou?.outside?.confirmation).toEqual({ offered: true, ticked: false });
  const facts = h.engine.record.phases['1']!; const stop = structuredClone(facts.stop); const bytes = readFileSync(file); const head = git(h.sandbox, outside, 'rev-parse', 'HEAD'); const dirty = git(h.sandbox, outside, 'status', '--porcelain');
  const session = h.engine.latestSession('1')!; const attempts = session.runs.length;
  await waitFor(() => Date.now() > Date.parse(stop!.checkedAt));
  const confirm = await mutate('outside-confirmation', 'confirm-reviewed', ['--confirm-resolved'], true);
  expect(confirm.operation).toMatchObject({ state: 'completed', effects: { session: 'not_started', plan: 'not_advanced' } }); expect(buildSnapshot(h.engine).needsYou?.outside?.confirmation).toEqual({ offered: true, ticked: true });
  await mutate('outside-confirmation', 'clear-reviewed', ['--clear-confirmation']); expect(buildSnapshot(h.engine).needsYou?.outside?.confirmation).toEqual({ offered: true, ticked: false });
  const replay = await cli([...confirm.args, '--json']); expect(replay.code).toBe(0); expect(replay.json().operation.id).toBe(confirm.operation.id); expect(buildSnapshot(h.engine).needsYou?.outside?.confirmation?.ticked).toBe(false);
  expect(facts.stop).toEqual(stop); expect(facts.doneAt).toBeUndefined(); expect(h.engine.latestSession('1')!.runs).toHaveLength(attempts); expect(h.claudeCalls()).toHaveLength(1); expect(readFileSync(file)).toEqual(bytes); expect(git(h.sandbox, outside, 'rev-parse', 'HEAD')).toBe(head); expect(git(h.sandbox, outside, 'status', '--porcelain')).toBe(dirty);
});

// AC-CLI-04: repeat the public workflow contract on two concurrent controllers.
// Actual Grok0.75.8/default and provider evidence remains dated in kiln-bot-control-validation.md;
// this collected regression uses the verified peer and makes no fresh Grok/model-turn claim.
it('keeps two concurrent PRDs distinct through terminal resume, literal reply, replay, stale refusal and unsent Verify',async()=>{
  h=await createHarness({sessions:[],extraFolders:['other-bot-work']});const release=join(h.sandbox.root,'release-other');
  const final='Exact stopped question: "blue"?\nTreat $(echo literal) as data.';
  writeFileSync(h.scenarioPath,JSON.stringify({sessions:[{actions:[{result:final}]},{actions:[{waitForFile:release},{result:'Other work question.'}]},{actions:[{result:'Continuation after terminal discussion.'}]},{actions:[{result:'Literal reply continued.'}]}]}));
  await h.engine.start({refinementConfirmed:true});await h.engine.settled();await serve();
  const other=await h.engineFor('other-bot-work');let otherServer:LocalServer|undefined;
  try{
    await other.start({refinementConfirmed:true});await waitFor(()=>!!other.current?.processRunning&&h.claudeCalls().length===2);
    let port=42350;while(port<42400&&!await isPortFree(port))port++;if(port===42400)throw new Error('No free second workflow port');
    otherServer=await startLocalServer({engine:other,port,folderName:'other-bot-work',featureName:'Other work',token:other.record.token});
    writeJsonAtomically(join(other.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const inventory=await cli(['status','--json']);expect(inventory.code,inventory.stdout).toBe(0);expect(inventory.json()).toMatchObject({inventory_complete:true,counts:{live_controllers:2,working:1,needs_you:1}});
    expect(inventory.json().runs).toEqual(expect.arrayContaining([expect.objectContaining({prd_path:target(),state:'needs_you'}),expect.objectContaining({prd_path:join(h.repository,'docs/prds/other-bot-work'),working_sessions:1})]));
    const detail=await cli(['status',target(),'--detail','full','--json']);expect(detail.code).toBe(0);expect(detail.json().stop.final_message).toBe(final);
    const original=h.engine.latestSession('1')!;const providerId=original.sessionId;const transcript=findTranscripts(claudeConfigFolder(h.env),providerId).main!;const terminalMarker='decision-made-in-terminal';
    appendFileSync(transcript,JSON.stringify({type:'user',sessionId:providerId,timestamp:new Date().toISOString(),message:{content:terminalMarker}})+'\n');
    const resumed=await mutate('resume','terminal-discussion-resume',[],true);await h.engine.settled();
    expect(resumed.operation).toMatchObject({state:'completed',outcome:'session_resumed',effects:{reply:'not_applicable',session:'resumed',plan:'not_advanced'}});
    expect(h.engine.latestSession('1')!.sessionId).toBe(providerId);expect(h.engine.latestSession('1')!.runs).toHaveLength(2);expect(h.engine.latestSession('1')!.runs.at(-1)!.note).toBeUndefined();expect(readFileSync(transcript,'utf8')).toContain(terminalMarker);
    const message='Literal reply: "blue" 🐦 $(echo literal)\nKeep this second paragraph.';const file=join(h.sandbox.root,'bot reply.txt');writeFileSync(file,message);
    const reply=await mutate('reply','literal-workflow-reply',['--message-file',file],true);await h.engine.settled();
    expect(h.engine.latestSession('1')!.runs).toHaveLength(3);expect(h.engine.latestSession('1')!.runs.at(-1)!.note).toBe(message);expect(h.engine.latestSession('1')!.runs.at(-1)!.result?.text).toBe('Literal reply continued.');
    const delivered=await cli(['command-status',target(),'--command-id','literal-workflow-reply','--json']);expect(delivered.code).toBe(0);expect(delivered.json().operation.effects).toMatchObject({reply:'delivered',session:'resumed',plan:'not_advanced'});
    const replay=await cli([...reply.args,'--json']);expect(replay.code).toBe(0);expect(replay.json().operation.id).toBe(reply.operation.id);expect(h.engine.latestSession('1')!.runs).toHaveLength(3);
    const stale=await cli(reply.args.map(arg=>arg==='literal-workflow-reply'?'fresh-id-with-old-token':arg).concat('--json'));expect(stale.code,stale.stdout).toBe(3);expect(stale.json().errors[0].code).toBe('stale_status_token');expect(h.engine.latestSession('1')!.runs).toHaveLength(3);
    const phase=join(h.engine.worktreePath,`docs/prds/${FOLDER}/phase-1-return-intake.md`);writeFileSync(phase,readFileSync(phase,'utf8').replace('\n','\n\n**Closed:** 2026-10-28\n'));
    git(h.sandbox,h.engine.worktreePath,'add',`docs/prds/${FOLDER}/phase-1-return-intake.md`);git(h.sandbox,h.engine.worktreePath,'commit','-qm','test(workflow): finish disposable phase');git(h.sandbox,h.engine.worktreePath,'push','-qu','origin',h.engine.record.settings.featureBranch);
    const unsent='Preserve this unsent reply "blue" 🐦';writeFileSync(file,unsent);const complete=await mutate('reply','already-complete-reply',['--message-file',file]);
    expect(complete.operation).toMatchObject({state:'completed',outcome:'phase_already_complete',reply_text:unsent,effects:{reply:'not_sent',session:'not_started',plan:'not_advanced'}});expect(h.engine.latestSession('1')!.runs).toHaveLength(3);
    const current=await cli(['status',target(),'--json']);const noAck=await cli(['verify-and-advance',target(),'--command-id','without-ack','--only-if-status-matches',current.json().status_token,'--json']);
    expect(noAck.code).toBe(3);expect(noAck.json().errors[0].code).toBe('unsent_reply_acknowledgement_required');
    const refused=await cli(['command-status',target(),'--command-id','without-ack','--json']);expect(refused.code).toBe(0);expect(refused.json().operation).toMatchObject({state:'refused',outcome:'unsent_reply_acknowledgement_required',reason:expect.stringContaining('A preserved reply was not sent.')});expect(refused.json().operation.reason).toContain('acknowledge');
    h.engine.record.pause.requestedAt=new Date().toISOString();const advanced=await mutate('verify-and-advance','explicit-advance',['--without-sending-reply'],true);await h.engine.settled();
    expect(advanced.operation.effects.plan).toBe('advanced');expect(h.engine.record.phases['1']!.doneAt).toEqual(expect.any(String));expect(h.engine.record.pause.activeSince).toEqual(expect.any(String));
    const retained=await cli(['command-status',target(),'--command-id','already-complete-reply','--json']);expect(retained.json().operation).toMatchObject({reply_text:unsent,acknowledged_by:advanced.operation.id,effects:{reply:'not_sent'}});
    const verifyReplay=await cli([...advanced.args,'--json']);expect(verifyReplay.code).toBe(0);expect(verifyReplay.json().operation.id).toBe(advanced.operation.id);expect(h.engine.latestSession('1')!.runs).toHaveLength(3);
    expect(other.current?.processRunning).toBe(true);expect(other.latestSession('1')!.runs).toHaveLength(1);expect(h.claudeCalls()).toHaveLength(4);
  }finally{writeFileSync(release,'done');await other.settled();await otherServer?.close();}
});

// AC-ACT-05: acceptance/progress is queryable while an actual provider-readiness subprocess waits.
it('queries a durable in-progress reply before provider dispatch, then its separate completed outcome',async()=>{
  h=await createHarness({sessions:[{actions:[{result:'Initial question.'}]},{actions:[{result:'Reply continued.'}]}]});
  await h.engine.start({refinementConfirmed:true});await h.engine.settled();await serve();
  const release=join(h.sandbox.root,'release-auth-read');h.env.KILN_STANDIN_AUTH_AFTER_WAIT=release;
  const file=join(h.sandbox.root,'progress reply.txt');writeFileSync(file,'Acknowledge this literal reply.');
  try{
    const status=await cli(['status',target(),'--json']);expect(status.code).toBe(0);
    const accepted=await cli(['reply',target(),'--command-id','progress-reply','--only-if-status-matches',status.json().status_token,'--message-file',file,'--json']);
    expect(accepted.code,accepted.stdout).toBe(0);expect(accepted.json()).toMatchObject({ok:true,command_id:'progress-reply',operation:{state:'in_progress',outcome:null,effects:{session:'not_started',plan:'not_advanced'}}});
    const id=accepted.json().operation.id;const progress=await cli(['command-status',target(),'--command-id','progress-reply','--json']);
    expect(progress.code,progress.stdout).toBe(0);expect(progress.json()).toMatchObject({ok:true,command_id:'progress-reply',operation:{id,state:'in_progress',outcome:null,effects:{session:'not_started',plan:'not_advanced'}}});expect(h.claudeCalls()).toHaveLength(1);
    writeFileSync(release,'continue');await h.engine.commands.settled();await h.engine.settled();
    const completed=await cli(['command-status',target(),'--command-id','progress-reply','--json']);expect(completed.code,completed.stdout).toBe(0);expect(completed.json().operation).toMatchObject({id,state:'completed',outcome:'session_resumed',effects:{session:'resumed',plan:'not_advanced'}});expect(h.claudeCalls()).toHaveLength(2);
  }finally{writeFileSync(release,'continue');}
});

// AC-CLI-02: synthetic provider credentials and private capabilities never enter public responses.
it('excludes provider credential canaries from account, inventory and operation output in both formats',async()=>{
  h=await createHarness({sessions:[]});
  const providerKeys=['fixture-anthropic-credential-not-real','fixture-openai-credential-not-real'];
  Object.assign(h.env,{ANTHROPIC_API_KEY:providerKeys[0],OPENAI_API_KEY:providerKeys[1]});await serve();
  await waitFor(()=>h.engine.controlView().controls.some(c=>c.name==='settings'&&c.available));
  const accepted=await mutate('settings','private-output-setting',['--keep-awake','off']);
  const privateValues=[...providerKeys,h.engine.record.token,h.engine.record.billing!.key];
  for(const json of [false,true])for(const args of [['account',target()],['status'],['status',target(),'--detail','full'],['command-status',target(),'--command-id','private-output-setting'],accepted.args]){
    const answer=await cli([...args,...(json?['--json']:[])]);expect(answer.code,answer.stdout).toBe(0);if(json)expect(answer.json()).toMatchObject({schema_version:'1',ok:true});
    for(const credential of privateValues)expect(answer.stdout).not.toContain(credential);
  }
  expect(h.claudeCalls()).toHaveLength(0);
});


it('acknowledges uncertainty through the explicit built CLI flag and persists a receipt without advancing', async () => {
  h = await createHarness({ sessions: [{ actions: [] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const f = historyFixture();
  try {
    f.addThread('parent', { target: join(h.engine.worktreePath, 'inside.txt') });
    f.append('parent', f.record('response_item', { type: 'custom_tool_call', name: 'exec', call_id: 'unknown-cli', input: 'unknownHelper();', internal_chat_message_metadata_passthrough: { turn_id: 'parent-turn-0' } }));
    Object.assign(h.tools, { codex: f.options.executable }); h.env.KILN_CODEX_HISTORY_FIXTURE = f.options.env.KILN_CODEX_HISTORY_FIXTURE;
    h.engine.record.settings.agentId = 'codex'; h.engine.record.settings.agentChoices.codex = { model: 'gpt-6.1-sol', effort: 'high' };
    const facts = h.engine.record.phases['1']!; const session = h.engine.latestSession('1')!;
    session.agentId = 'codex'; session.conversation = { threadId: 'parent', codexHome: f.codexHome }; writeSessionRecord(h.stateDirectory, session);
    facts.stop!.checks = [(await h.engine.readWorkspaceEvidence('1')).check];
    await serve();
    const accepted = await mutate('outside-confirmation', 'accept-uncertain-history', ['--confirm-resolved', '--accept-uncertainty']);
    expect(accepted.operation).toMatchObject({ state: 'completed', effects: { session: 'not_started', plan: 'not_advanced' } });
    expect(buildSnapshot(h.engine).needsYou!.outside!.uncertainty).toEqual({ offered: true, ticked: true });
    expect(facts.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
    const replay = await cli([...accepted.args, '--json']); expect(replay.json().operation.id).toBe(accepted.operation.id);
    await mutate('outside-confirmation', 'clear-uncertain-history', ['--clear-confirmation', '--accept-uncertainty']);
    expect(buildSnapshot(h.engine).needsYou!.outside!.uncertainty?.ticked).toBe(false);
  } finally { await f.sandbox.cleanup(); }
});
