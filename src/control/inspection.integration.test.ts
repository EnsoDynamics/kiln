import { request as httpRequest, createServer as httpServer } from "node:http";
import { appendFileSync, chmodSync, existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, createRepository, commitFiles, git, type Sandbox } from "../test-support/git-repositories.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { newPrdRecord } from "../state/new-record.js";
import { prdStateDirectory, stateRoot, writeJsonAtomically } from "../state/state-files.js";
import { SCHEMA_VERSION, writePrdRecord, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { Engine } from "../engine/engine.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { runKilnCommand } from "../kiln-command.js";
import { readWork } from "./private-state.js";
import { outputPage, LOG_BYTES } from "./logs.js";
import { serialize, type Result } from "./result.js";
import { commandContracts, parseCommand } from "./help.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { processStartTime } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { readHistory } from "./history.js";
import { cacheSnapshot, inspectionSnapshot } from "./projection.js";

let sandbox: Sandbox; let h: Harness | undefined; let server: LocalServer | undefined; let secondServer: LocalServer | undefined; let secondEngine: Engine | undefined;
afterEach(async () => { await secondServer?.close(); secondServer=undefined; secondEngine?.close(); secondEngine=undefined; await server?.close(); server = undefined; await h?.cleanup(); h = undefined; await sandbox?.cleanup(); });
function fixture(name = 'shop with spaces') {
  sandbox ??= createSandbox();
  const repository = createRepository(sandbox, name); commitFiles(sandbox, repository, `docs/prds/${FOLDER}`, prdDirectoryFiles());
  const record = newPrdRecord({ mainCheckoutPath: repository, repositoryName: name, github: `test/${name}`, prdDirectoryFromRoot: `docs/prds/${FOLDER}`, featureName: 'Customer returns', settings: { workspaceFolder: sandbox.root, worktreePath: repository, featureBranch: 'kiln/returns', baseBranch: 'develop', bases: {}, model: 'opus', effort: 'high', keepAwake: false, resumeAfterUsageLimit: true } });
  record.startedAt = '2026-01-01T00:00:00.000Z'; record.plan = [{ id: '1a', title: 'Nested intake', file: 'phase-1a-intake.md', closed: false, repositories: [] }, { id: '2', title: 'Later phase', file: 'phase-2-later.md', closed: false, repositories: [] }];
  const directory = prdStateDirectory(stateRoot(sandbox.env), repository, name, record.prdDirectory);
  writePrdRecord(directory, record);
  return { repository, directory, record, path: join(repository, record.prdDirectory), work: () => readWork(stateRoot(sandbox.env), directory) };
}
function session(f: ReturnType<typeof fixture>, id='local-codex', phase='1a', agent: 'codex'|'claude_code'='codex') {
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, executionId: f.record.executionId!, sessionId: id, phaseId: phase, kind: 'phase', agentId: agent, createdAt: '2026-01-02T00:00:00.000Z', model: 'gpt-model', modelDisplayName: 'Saved model', workingDirectory: f.repository, ...(agent === 'codex' ? { conversation: { threadId: `provider-${id}` } } : {}), runs: [{ startedAt: '2026-01-02T00:00:00.000Z', endedAt: '2026-01-02T01:00:00.000Z', cause:'launch' }, { startedAt: '2026-01-02T02:00:00.000Z', endedAt: '2026-01-02T03:00:00.000Z', cause:'person_resume' }], sleeps: [], steps: [] };
  f.record.phases[phase] ??= { sessionIds: [], repositories: {}, finishedByPerson: false, outsideConfirmations: [] };
  f.record.phases[phase]!.sessionIds.push(id); writeSessionRecord(f.directory, record); writePrdRecord(f.directory, f.record);
  const output = join(f.directory, phase, id, 'output.jsonl'); writeFileSync(output,'',{mode:0o600});
  return { record, output };
}
async function command(args: string[], env = sandbox.env, cwd = sandbox.root) {
  let stdout=''; let stderr=''; const code=await runKilnCommand(args,{cwd,env,stdout:{write:s=>stdout+=s},stderr:{write:s=>stderr+=s}});
  return {code,stdout,stderr, json:()=>JSON.parse(stdout) as Result};
}
function tree(path: string): Record<string,string> { const out: Record<string,string>={}; for(const name of readdirSync(path,{recursive:true,withFileTypes:true})) if(name.isFile()) {const file=join(name.parentPath,name.name);out[file]=readFileSync(file).toString('base64');} return out; }

describe('inspection at real filesystem / Git / HTTP / stdout boundaries',()=>{
  it.each(['claude_code', 'codex'] as const)('retains %s fresh instructions before any conversation, live and disconnected, without starting work', async agent => {
    sandbox=createSandbox(); h=await createHarness({sessions:[]});
    // Restore an execution between workspace setup and its first launch, then
    // let the real plan reader record the pre-session stop.
    h.engine.record.settings.worktreePath=h.repository;
    h.engine.record.startedAt=new Date().toISOString();
    h.engine.record.setupCompletedAt=h.engine.record.startedAt;
    expect(await h.engine.decide()).toMatchObject({kind:'start_phase',phaseId:'1'});
    rmSync(join(h.engine.worktreePath,`docs/prds/${FOLDER}/phase-2b-store-credit.md`));
    expect(await h.engine.decide()).toEqual({kind:'plan_stop',phaseKey:'1'});
    expect(h.engine.latestSession('1')).toBeUndefined();
    h.engine.record.settings.agentId=agent;
    if(agent==='codex') {
      // A first readiness stop in a multi-repository execution starts a fresh
      // session at the workspace root, distinct from either repository.
      const other=createRepository(h.sandbox,'other-repository');
      h.engine.record.settings.workspaceFolder=h.sandbox.root;
      h.engine.record.repositories=[h.repository,other].map((path,index)=>({name:index?'other-repository':'acme-shop',kind:index?'added' as const:'prd' as const,mainCheckoutPath:path,github:`test/repo-${index}`,baseBranch:'develop',worktreePath:path,setupCompletedAt:h!.engine.record.startedAt!}));
      h.engine.record.phases['1']!.stop!.kind='selection';
    }
    writePrdRecord(h.stateDirectory,h.engine.record);
    const browser=buildSnapshot(h.engine).needsYou!;
    expect(browser).toMatchObject({kind:agent==='codex'?'selection':'plan',resumeOffered:false});
    expect(h.engine.sessionFolder).toBe(agent==='codex'?h.sandbox.root:h.repository);
    expect(browser.freshSessionCommand).toContain(agent==='codex'?'codex':'claude');
    const port=await freePort(); server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Returns',token:h.engine.record.token});
    writeJsonAtomically(join(h.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const path=join(h.repository,`docs/prds/${FOLDER}`);
    const expected={session_id:null,provider_session_id:null,agent,phase_key:browser.phaseId,working_directory:h.engine.sessionFolder,resumable:false,reason:'No saved session.',resume_command:null,resume_argv:null,continuation_prompt:null,fresh_session_instructions:{command:browser.freshSessionCommand,prompt:browser.freshSessionPrompt}};
    const live=await command(['handoff',path,'--json'],h.env,h.sandbox.root);
    expect(live.code,live.stdout).toBe(0); expect(live.json().data).toMatchObject(expected);
    const text=await command(['handoff',path],h.env,h.sandbox.root);
    expect(text.code).toBe(0); expect(text.stdout).toContain(browser.freshSessionCommand); expect(text.stdout).toContain(browser.freshSessionPrompt);
    await server.close(); server=undefined; rmSync(join(h.stateDirectory,'instance.lock'));
    const before=tree(stateRoot(h.env));
    const offline=await command(['handoff',path,'--json'],h.env,h.sandbox.root);
    expect(offline.code,offline.stdout).toBe(0); expect(offline.json().data).toMatchObject(expected);
    const built=join(dirname(fileURLToPath(import.meta.url)),'../../dist/cli.js');
    const child=spawnSync(process.execPath,[built,'handoff',path,'--json'],{cwd:h.sandbox.root,env:h.env,encoding:'utf8'});
    expect(child.status,child.stdout).toBe(0); expect(child.stderr).toBe(''); expect(JSON.parse(child.stdout).data).toMatchObject(expected);
    expect(tree(stateRoot(h.env))).toEqual(before); expect(h.claudeCalls()).toHaveLength(0);
    expect(Object.values(h.engine.record.phases).every(p=>p.sessionIds.length===0)).toBe(true);
    expect((await command(['handoff',path,'--session-id','missing','--json'],h.env)).code).toBe(2);
  });
  it('reports absent fresh instructions explicitly when no conversation or browser recovery was saved',async()=>{
    sandbox=createSandbox(); const f=fixture(); const before=tree(stateRoot(sandbox.env));
    const answer=await command(['handoff',f.path,'--json']);
    expect(answer.code).toBe(0); expect(answer.json().data).toMatchObject({session_id:null,resumable:false,reason:'No saved session.',working_directory:null,resume_command:null,resume_argv:null,continuation_prompt:null,fresh_session_instructions:null});
    expect(tree(stateRoot(sandbox.env))).toEqual(before);
  });
  it.each(['paused', 'complete'] as const)('retains latest observed activity in %s detail, live inventory and disconnected cache', async state => {
    sandbox=createSandbox(); h=await createHarness({sessions:[{actions:[{result:'Saved final output.'}]}]});
    await h.engine.start({refinementConfirmed:true}); await h.engine.settled();
    const session=h.engine.latestSession('1')!;
    delete h.engine.record.phases['1']!.stop;
    h.engine.current=undefined;
    const transition='2026-11-01T12:00:00.000Z';
    if(state==='paused') h.engine.record.pause.activeSince=transition;
    else h.engine.record.completedAt=transition;
    writePrdRecord(h.stateDirectory,h.engine.record);
    const port=await freePort(); server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Returns',token:h.engine.record.token});
    writeJsonAtomically(join(h.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const path=join(h.repository,`docs/prds/${FOLDER}`);
    const expected={observed_at:transition,description:state==='paused'?'Run paused.':'Run completed.'};
    expect((await command(['status',path,'--json'],h.env)).json()).toMatchObject({state,last_activity:{...expected,state:'current'}});
    const inventory=(await command(['status','--json'],h.env)).json();
    expect(inventory.runs).toEqual(expect.arrayContaining([expect.objectContaining({prd_path:path,last_activity:expect.objectContaining(expected)})]));
    // Later saved output remains the latest observation, even without a current view.
    const outputAt='2026-11-01T12:01:00.000Z';
    appendFileSync(join(h.stateDirectory,'1',session.sessionId,'output.jsonl'),JSON.stringify({line:999,at:outputAt,source:'assistant',text:'Later saved observation 🐦'})+'\n');
    const later={observed_at:outputAt,description:'Later saved observation 🐦'};
    expect((await command(['status',path,'--json'],h.env)).json().last_activity).toMatchObject(later);
    cacheSnapshot(h.engine,inspectionSnapshot(h.engine));
    await server.close(); server=undefined; h.engine.close(); rmSync(join(h.stateDirectory,'instance.lock'));
    const before=tree(stateRoot(h.env));
    const disconnected=await command(['status',path,'--json'],h.env);
    expect(disconnected.code,disconnected.stdout).toBe(0);
    expect(disconnected.json()).toMatchObject({state,status_token:null,last_activity:{...later,state:'stale'}});
    expect((await command(['status',path],h.env)).stdout).toContain('Later saved observation 🐦');
    expect(tree(stateRoot(h.env))).toEqual(before);
  });
  it('reports saved attempt and skill observations without a current view and marks unreadable latest output',async()=>{
    sandbox=createSandbox(); const f=fixture(); const s=session(f);
    s.record.lastSkill={name:'deliverable-review',at:'2026-01-02T04:00:00.000Z'};writeSessionRecord(f.directory,s.record);
    expect((await command(['status',f.path,'--json'])).json().last_activity).toMatchObject({observed_at:'2026-01-02T04:00:00.000Z',description:'deliverable-review skill started.',state:'stale'});
    chmodSync(s.output,0);
    const failed=await command(['status',f.path,'--json']);
    expect(failed.code).toBe(4);expect(failed.json().last_activity).toMatchObject({state:'unavailable'});
    const inventory=await command(['status','--json']);
    expect(inventory.code).toBe(4);expect(inventory.json()).toMatchObject({ok:false,inventory_complete:false});
    expect(inventory.json().errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'state_unavailable'})]));
    expect(inventory.json().runs).toEqual(expect.arrayContaining([expect.objectContaining({last_activity:{observed_at:'2026-01-02T04:00:00.000Z',description:'deliverable-review skill started.',state:'unavailable',reason:expect.any(String)}})]));
    chmodSync(s.output,0o600);
  });
  it('provides complete text/JSON help from unrelated cwd without tools or a controller; every example parses',async()=>{
    sandbox=createSandbox(); const env={...sandbox.env,PATH:''};
    expect(await command([],env)).toMatchObject({code:2,stderr:''});
    expect((await command([],env)).stdout).toContain('kiln --help');
    for(const c of commandContracts){
      const help=await command([...c.path,'--help','--json'],env); expect(help.code,c.path.join(' ')).toBe(0);
      expect(help.json()).toHaveProperty('command.result_fields');
      expect((await command([...c.path,'-h'],env)).stdout).toContain(c.purpose);
      for(const example of c.examples) expect(()=>parseCommand(example.argv.slice(1)),JSON.stringify(example.argv)).not.toThrow();
    }
    const root=await command(['--help','--json'],env);expect((root.json().commands as unknown[]).length).toBe(commandContracts.length);
    expect((await command(['status','--bad','--json'],env)).code).toBe(2);
    const built=join(dirname(fileURLToPath(import.meta.url)),'../../dist/cli.js');
    const child=spawnSync(process.execPath,[built,'audit','submit','--help','--json'],{cwd:sandbox.root,env,encoding:'utf8'});
    expect(child.status).toBe(0);expect(JSON.parse(child.stdout).command.path).toEqual(['audit','submit']);expect(child.stderr).toBe('');
  });
  it('independently inventories every supported command and legacy helper without confusing execution contracts',async()=>{
    sandbox=createSandbox();const root=(await command(['--help','--json'])).json();
    const actual=(root.commands as {path:string[]}[]).map(c=>c.path.join(' ')).sort();
    expect(actual).toEqual(['status','logs','handoff','account','settings','command-status','message','take-over','reply','resume','verify-and-advance','request-pause','cancel-pause','continue','check-again','outside-confirmation','run','add-repository','audit','audit status','audit snapshot','audit submit','delivery','delivery status','delivery assess','delivery prepare','delivery evidence'].sort());
    const reply=JSON.parse((await command(['reply','--help','--json'])).stdout).command;
    expect(Object.keys(reply.flags)).toEqual(expect.arrayContaining(['message-file','message-from-stdin','command-id','only-if-status-matches','help','json']));
    expect(reply.examples).toHaveLength(2);expect(reply.required_exclusive_groups).toContainEqual({exactly_one:['message-file','message-from-stdin']});
    expect(reply.result_fields.operation).toContain('indeterminate');
    const legacy=JSON.parse((await command(['audit','submit','--help','--json'])).stdout).command;
    expect(legacy.exits['1']).toContain('failure');expect(legacy.result_fields).not.toHaveProperty('schema_version');
  });
  it('finds all stopped unfinished work without an age cutoff, excludes closed completed/setup and keeps reads pure',async()=>{
    sandbox=createSandbox();const a=fixture('repo-a');const b=fixture('repo-b');const c=fixture('closed');c.record.completedAt='2026-02-01T00:00:00Z';writePrdRecord(c.directory,c.record);
    const d=fixture('setup');delete d.record.startedAt;writePrdRecord(d.directory,d.record);
    const before=tree(stateRoot(sandbox.env));const inventory=await command(['status','--json']);
    expect(inventory.code).toBe(0);expect(inventory.json().counts).toMatchObject({live_controllers:0,stopped_unfinished:2});
    expect((inventory.json().runs as Result[]).map(r=>r.prd_path).sort()).toEqual([a.path,b.path].sort());
    expect(tree(stateRoot(sandbox.env))).toEqual(before);
    expect((await command(['status',c.path,'--json'])).json().state).toBe('complete');
    rmSync(stateRoot(sandbox.env),{recursive:true});expect((await command(['status','--json'])).json()).toMatchObject({ok:true,counts:{live_controllers:0,stopped_unfinished:0}});
  });
  it('resolves real main/worktree/file aliases including spaces, and exact retained paths after removal',async()=>{
    sandbox=createSandbox();const f=fixture();const alias=join(sandbox.root,'alias');git(sandbox,f.repository,'worktree','add','--detach',alias);
    for(const path of [f.path,join(alias,f.record.prdDirectory),join(f.path,`${FOLDER}-prd.md`)])expect((await command(['status',path,'--json'])).json().prd_path).toBe(f.path);
    expect((await command(['status',f.path,'--json'],sandbox.env,sandbox.root)).code).toBe(0);
    rmSync(f.path,{recursive:true});expect((await command(['status',f.path,'--json'])).json().document_state).toBe('document_unavailable');
    expect((await command(['status',join(sandbox.root,'other',FOLDER),'--json'])).code).toBe(2);
  });
  it('reports corrupt, unreadable, unsafe and unknown-version records as incomplete without migrations or secret output',async()=>{
    sandbox=createSandbox();const f=fixture();const before=readFileSync(join(f.directory,'prd.json'),'utf8');
    chmodSync(join(f.directory,'prd.json'),0);let answer=await command(['status','--json']);expect(answer.code).toBe(4);expect(answer.json().inventory_complete).toBe(false);chmodSync(join(f.directory,'prd.json'),0o600);
    f.record.schemaVersion=999;writeJsonAtomically(join(f.directory,'prd.json'),f.record);expect((await command(['status','--json'])).code).toBe(4);
    writeFileSync(join(f.directory,'prd.json'),before);const link=join(dirname(f.directory),'docs--prds--escape');symlinkSync(f.directory,link);expect((await command(['status','--json'])).code).toBe(4);rmSync(link);
    const root=stateRoot(sandbox.env);chmodSync(root,0o777);expect((await command(['status','--json'])).code).toBe(4);chmodSync(root,0o700);
    f.record.schemaVersion=8;writeJsonAtomically(join(f.directory,'prd.json'),f.record);const original=tree(root);answer=await command(['status','--json']);expect(answer.code).toBe(0);expect(tree(root)).toEqual(original);expect(answer.stdout).not.toContain(f.record.token);expect(answer.stdout).not.toContain(f.record.billing!.key);
  });
  it('refuses old protocols, reused ports and partial probe timeouts instead of treating them as no work',async()=>{
    sandbox=createSandbox();const f=fixture();const port=await freePort();let mode='old';let posts=0;
    const old=httpServer((req,res)=>{if(req.method!=='GET')posts++;if(mode==='timeout')return;res.setHeader('Content-Type','application/json');if(mode==='old'){res.writeHead(404);res.end('{}');}else res.end(JSON.stringify({protocol_major:1,execution_id:'another-execution',prd_path:f.path,instance:{pid:process.pid,process_start_time:null},features:[]}));});
    await new Promise<void>(resolve=>old.listen(port,'127.0.0.1',resolve));
    try{
      writeJsonAtomically(join(f.directory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
      for(mode of ['old','reused','timeout']){
        const answer=await command(['status','--json']);expect(answer.code).toBe(4);expect(answer.json().inventory_complete).toBe(false);expect(answer.json().counts).toMatchObject({live_controllers:0,unknown:1});
        expect((answer.json().runs as Result[])[0]!.controller).toBe(mode==='timeout'?'unreachable':'incompatible');
      }
      expect(posts).toBe(0);
    }finally{old.closeAllConnections();await new Promise<void>(resolve=>old.close(()=>resolve()));}
  });
  it('returns every owned conversation/attempt, distinct Codex IDs, explicit missing and unproven ownership, and no invented future session',async()=>{
    sandbox=createSandbox();const f=fixture();session(f,'old-claude','1a','claude_code');session(f,'old-codex');const current=session(f,'current-codex','2');
    const history=(await command(['status',f.path,'--detail','full','--json'])).json().session_history as ReturnType<typeof readHistory>;
    expect(history.complete).toBe(true);expect(history.phases.find(p=>p.phase_key==='1a')!.conversations).toHaveLength(2);expect(history.phases.find(p=>p.phase_key==='2')!.conversations).toHaveLength(1);
    expect(history.phases.find(p=>p.phase_key==='1a')!.conversations[1]).toMatchObject({session_id:'old-codex',provider_session_id:'provider-old-codex',attempts:[{cause:'launch'},{cause:'person_resume'}]});
    const rawSessionPath=join(f.directory,'2',current.record.sessionId,'session.json');
    writeJsonAtomically(rawSessionPath,{...current.record,schemaVersion:999});expect((await command(['status',f.path,'--detail','full','--json'])).code).toBe(4);
    writeSessionRecord(f.directory,current.record);
    delete current.record.executionId;writeSessionRecord(f.directory,current.record);
    expect((await command(['status',f.path,'--detail','full','--json'])).code).toBe(4);
    f.record.phases['2']!.sessionIds.push('missing');writePrdRecord(f.directory,f.record);expect((await command(['status',f.path,'--detail','full','--json'])).json().session_history).toMatchObject({complete:false});
    expect((await command(['handoff',f.path,'--session-id','foreign','--json'])).code).toBe(4);
  });
  it('returns a complete single history result larger than a log page and explicitly reports deadline incompleteness',async()=>{
    sandbox=createSandbox();const f=fixture();const saved=session(f);saved.record.runs=Array.from({length:100},(_,i)=>({startedAt:`2026-01-02T00:${String(i%60).padStart(2,'0')}:00Z`,endedAt:'2026-01-03T00:00:00Z',cause:i?'person_resume' as const:'launch' as const}));writeSessionRecord(f.directory,saved.record);
    const answer=await command(['status',f.path,'--detail','full','--json']);expect(answer.code).toBe(0);expect(Buffer.byteLength(answer.stdout)).toBeGreaterThan(LOG_BYTES);
    const phases=(answer.json().session_history as ReturnType<typeof readHistory>).phases;expect(phases.flatMap(p=>p.conversations)[0]!.attempts).toHaveLength(100);
    const incomplete=readHistory(f.work(),undefined,Date.now()-1);expect(incomplete.complete).toBe(false);expect(incomplete.errors.length).toBeGreaterThan(0);
  });
  it('returns the exact browser stop, account observations and provider-specific terminal instructions without starting work',async()=>{
    sandbox=createSandbox();h=await createHarness({sessions:[{actions:[{result:'Literal final question: "UPS?"\nDo not run $(anything).'}]}]});
    await h.engine.start({refinementConfirmed:true});await h.engine.settled();
    const port=await freePort();server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Returns',token:h.engine.record.token});
    writeJsonAtomically(join(h.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const path=join(h.repository,`docs/prds/${FOLDER}`);const browser=buildSnapshot(h.engine).needsYou!;
    const detail=(await command(['status',path,'--detail','full','--json'],h.env,h.sandbox.root)).json();
    expect(detail.stop).toMatchObject({final_message:browser.finalMessage,checks:browser.checks,resumeCommand:browser.resumeCommand});
    // AC-ACT-01: pin the complete inventory, not an every() over a possibly empty list.
    const controlNames=['reply','resume','verify-and-advance','request-pause','cancel-pause','continue','check-again','settings','outside-confirmation','message','take-over'].sort();
    const controls=detail.controls as {name:string;available:boolean;reason:string|null}[];
    expect(controls.map(c=>c.name).sort()).toEqual(controlNames);
    for(const c of controls){expect(typeof c.available).toBe('boolean');if(!c.available)expect(c.reason?.trim().length).toBeGreaterThan(0);}
    for(const name of ['reply','resume','settings'])expect(controls.find(c=>c.name===name)?.available).toBe(true);

    const handoff=await command(['handoff',path,'--json'],h.env,h.sandbox.root);
    expect(handoff.code,handoff.stdout).toBe(0);expect(handoff.json().data).toMatchObject({resume_command:browser.resumeCommand,continuation_prompt:browser.resumePrompt??null,working_directory:h.engine.worktreePath,resumable:true});
    const account=(await command(['account',path,'--json'],h.env,h.sandbox.root)).json().data as Record<string,unknown>;
    expect(account.next_attempt).toMatchObject({observed_at:h.engine.agents.state.account!.updatedAt,state:'current'});
    const calls=h.claudeCalls().length;await command(['account',path,'--refresh','--json'],h.env,h.sandbox.root);expect(h.claudeCalls()).toHaveLength(calls);
    await server.close();server=undefined;rmSync(join(h.stateDirectory,'instance.lock'));
    const stopped=(await command(['status',path,'--json'],h.env,h.sandbox.root)).json();expect(stopped.facts).toMatchObject({state:'stale'});expect(stopped.stop).toMatchObject({final_message:browser.finalMessage});
    const retained=stopped.controls as {name:string;available:boolean;reason:string|null}[];
    expect(retained.map(c=>c.name).sort()).toEqual(controlNames);
    for(const c of retained){expect(c.available).toBe(false);expect(c.reason).toContain('disconnected');}

  });
  it('keeps active handoffs unavailable and retains earlier-conversation instructions when the controller closes',async()=>{
    sandbox=createSandbox();const gate=join(sandbox.root,'release-agent');
    h=await createHarness({sessions:[{actions:[{waitForFile:gate},{result:'finished'}]}]});
    await h.engine.start({refinementConfirmed:true});await waitFor(()=>!!h!.engine.current?.processRunning);
    const port=await freePort();server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Returns',token:h.engine.record.token});
    writeJsonAtomically(join(h.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const path=join(h.repository,`docs/prds/${FOLDER}`);
    const active=await command(['handoff',path,'--json'],h.env,h.sandbox.root);expect(active.code).toBe(4);expect(active.json().data).toMatchObject({resumable:false,active_under_kiln:true,resume_command:null});
    writeFileSync(gate,'done');await h.engine.settled();
    const current=h.engine.latestSession('1')!;
    const earlier={...structuredClone(current),sessionId:'earlier-conversation',phaseId:'2a',createdAt:current.createdAt};
    earlier.runs.at(-1)!.startedAt=new Date(Date.parse(current.runs.at(-1)!.startedAt)-1000).toISOString();
    h.engine.record.phases['2a']={sessionIds:[earlier.sessionId],repositories:{},finishedByPerson:false,outsideConfirmations:[]};
    // A later prelaunch stop has no conversation; default handoff still uses
    // the latest saved conversation, while an explicit selector stays exact.
    delete h.engine.record.phases['1']!.stop;
    h.engine.record.phases['3']={sessionIds:[],repositories:{},finishedByPerson:false,outsideConfirmations:[],stop:{kind:'plan',at:new Date().toISOString(),checkedAt:new Date().toISOString(),checks:[]}};
    writeSessionRecord(h.stateDirectory,earlier);writePrdRecord(h.stateDirectory,h.engine.record);
    // Reopen the server to capture selected historical instructions at an actual controller boundary.
    await server.close();server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Returns',token:h.engine.record.token});
    const fallback=await command(['handoff',path,'--json'],h.env,h.sandbox.root);
    expect(fallback.code,fallback.stdout).toBe(0);
    const latest=fallback.json().data as Record<string,unknown>;
    expect(latest).toMatchObject({session_id:current.sessionId,provider_session_id:current.sessionId,phase_key:'1',working_directory:current.workingDirectory,resumable:true,continuation_prompt:expect.stringContaining('phase-1-return-intake.md'),fresh_session_instructions:{prompt:expect.stringContaining('phase-1-return-intake.md')}});
    const historical=await command(['handoff',path,'--session-id',earlier.sessionId,'--json'],h.env,h.sandbox.root);
    expect(historical.code).toBe(4);const instructions=historical.json().data as Record<string,unknown>;
    expect(instructions.continuation_prompt).toContain('phase-2a-card-refunds.md');expect(instructions.fresh_session_instructions).toMatchObject({prompt:expect.stringContaining('phase-2a-card-refunds.md')});
    await server.close();server=undefined;rmSync(join(h.stateDirectory,'instance.lock'));
    const offline=(await command(['handoff',path,'--session-id',earlier.sessionId,'--json'],h.env,h.sandbox.root)).json().data as Record<string,unknown>;
    expect(offline.continuation_prompt).toEqual(instructions.continuation_prompt);expect(offline.fresh_session_instructions).toEqual(instructions.fresh_session_instructions);
    const offlineLatest=await command(['handoff',path,'--json'],h.env,h.sandbox.root);
    expect(offlineLatest.code,offlineLatest.stdout).toBe(0);
    expect(offlineLatest.json().data).toMatchObject({session_id:current.sessionId,provider_session_id:current.sessionId,phase_key:'1',working_directory:current.workingDirectory,resumable:true,continuation_prompt:latest.continuation_prompt,fresh_session_instructions:latest.fresh_session_instructions});
  });
  it('preserves independently dated attempt/current accounts, usage windows, effective models and named nested/audit activity',async()=>{
    sandbox=createSandbox();const f=fixture();const s=session(f);s.record.initModel='effective-provider-model';
    s.record.codex={launchIntent:{version:'0.162.1',cwd:f.repository,writableRoots:[f.repository],repositories:[],skills:[]},originalAccount:{at:'2026-01-01T00:00:00Z',email:'original@example.invalid'}};
    s.record.runs.at(-1)!.billing={agentId:'codex',route:'subscription',sources:[],email:'attempt@example.invalid',observedAt:'2026-01-02T02:00:00Z',diagnostics:[],approved:false};writeSessionRecord(f.directory,s.record);
    f.record.phases['1a']!.stop={kind:'done_check',at:'2026-01-03T00:00:00Z',checkedAt:'2026-01-03T00:00:00Z',checks:[]};
    f.record.billing!.lastLaunch={agentId:'codex',route:'subscription',sources:[],email:'last@example.invalid',observedAt:'2026-01-02T00:00:00Z',diagnostics:[],approved:false};writePrdRecord(f.directory,f.record);
    const next={agentId:'codex',email:'next@example.invalid',plan:'Next plan',startedAt:'2026-01-04T00:00:00Z',updatedAt:'2026-01-04T00:00:01Z',limitsObservedAt:'2026-01-04T00:00:00Z',limits:[{id:'five-hour',kind:'session',label:'5-hour',shortLabel:'5h',percent:72,resetsAt:'2026-01-04T05:00:00Z',durationMinutes:300,nearLimit:false}],stale:true};
    writeJsonAtomically(join(f.directory,'inspection-view.json'),{version:1,execution_id:f.record.executionId,observed_at:'2026-01-04T00:00:01Z',snapshot:{feature:{state:'needs_you',currentPhaseId:'1a',phasesDone:0,phasesTotal:2},account:next}});
    const answer=(await command(['status',f.path,'--detail','full','--json'])).json();
    expect(answer).toMatchObject({requested_model:{model:'gpt-model'},effective_model:{model:'effective-provider-model'},phases:{completed:0,total:2},activity:{phase_id:'1a',title:'Nested intake'}});
    expect(answer.account).toMatchObject({last_attempt:{value:{email:'attempt@example.invalid'},observed_at:'2026-01-02T02:00:00Z',state:'stale'},original_attempt:{value:{email:'original@example.invalid'}},next_attempt:{value:{email:'next@example.invalid'},observed_at:'2026-01-04T00:00:01Z',state:'stale'},usage:{value:[{percent:72,resetsAt:'2026-01-04T05:00:00Z',durationMinutes:300}],state:'stale'}});
    f.record.completionAudits!.activities=[{activityId:'audit-id',sequence:1,kind:'test_audit',round:3,continuationIndex:2,createdAt:'2026-01-05T00:00:00Z',sessionIds:[],reportPath:'audit.json',skill:{name:'test-audit',path:'/skill',digest:'digest'},snapshots:[],attempts:[]}];
    f.record.phases={...f.record.phases,'audit-audit-id':{sessionIds:[],stop:{kind:'done_check',at:'2026-01-05T00:00:00Z',checkedAt:'2026-01-05T00:00:00Z',checks:[]},repositories:{},finishedByPerson:false,outsideConfirmations:[]}};delete f.record.phases['1a']!.stop;writePrdRecord(f.directory,f.record);rmSync(join(f.directory,'inspection-view.json'));
    const audit=(await command(['status',f.path,'--json'])).json();expect(audit.activity).toMatchObject({kind:'test_audit',round:3,continuation_index:2,title:'Test audit',phase_id:null});
  });
  it('handles incomplete/malformed saved records and compact metadata errors within both final stdout budgets',async()=>{
    sandbox=createSandbox();const f=fixture();const s=session(f);
    const line=JSON.stringify({line:1,at:'2026-01-02T00:00:00Z',source:'out',text:'complete entry'});
    writeFileSync(s.output,line+'\n{"line":2,"text":"partial');
    expect(outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:50,json:true}).lines).toEqual([{number:1,at:'2026-01-02T00:00:00Z',source:'out',text:'complete entry',fragment:null}]);
    writeFileSync(s.output,'{"line":1,"text":"bad JSON"\n');
    // Final serializers must also refuse invalid UTF-8 rather than substitute characters.

    for(const json of [false,true]){const output=await command(['logs',f.path,...(json?['--json']:[])]);expect(output.code).toBe(4);expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(LOG_BYTES);}
    writeFileSync(s.output,Buffer.concat([Buffer.from('{"line":1,"at":"now","source":"out","text":"'),Buffer.from([0xff]),Buffer.from('"}\n')]));
    expect((await command(['logs',f.path,'--json'])).code).toBe(4);
    writeFileSync(s.output,line+'\n'+JSON.stringify({line:2,at:'now',source:'out',text:'second'})+'\n');
    const work=f.work();work.canonical='/'+'long-path'.repeat(3000);
    for(const json of [false,true]){expect(()=>outputPage(work,{phase:'1a',id:s.record.sessionId},{max:1,json})).toThrow(/metadata|budget/);}
  });
  it('pages actual saved entries in both final serializers, reconstructs fragments exactly, and pins older output across appends',()=>{
    sandbox=createSandbox();const f=fixture();const s=session(f);
    const originals=['', 'quotes " \\ \n\u0001', 'é😀漢\n'.repeat(14000), ...Array.from({length:75},(_,i)=>`entry ${i}`)];
    writeFileSync(s.output,originals.map((text,i)=>JSON.stringify({line:i+1,at:'2026-01-02T00:00:00Z',source:'codex',text})).join('\n')+'\n');
    for(const json of [false,true]){
      let cursor: string|undefined;const pieces=new Map<number,{start:number;text:string}[]>();let pages=0;let first:Result|undefined;
      do{
        const page=outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:50,json,...(cursor?{cursor}:{})});
        expect(Buffer.byteLength(serialize(page,json))).toBeLessThanOrEqual(LOG_BYTES);first??=page;
        const lines=page.lines as {number:number;text:string;fragment:{start:number}|null}[];
        for(const line of lines){const list=pieces.get(line.number)??[];list.push({start:line.fragment?.start??0,text:line.text});pieces.set(line.number,list);}
        cursor=page.next_before as string|undefined;pages++;expect(pages).toBeLessThan(200);
      }while(cursor);
      expect(pieces.size).toBe(originals.length);for(const [n,parts]of pieces)expect(parts.sort((a,b)=>a.start-b.start).map(p=>p.text).join('')).toBe(originals[n-1]);
      expect(first!.requested_lines).toBe(50);expect(first!.has_older).toBe(true);
    }
    const savedBytes=readFileSync(s.output);
    writeFileSync(s.output,JSON.stringify({line:1,at:'2026-01-02T00:00:00Z',source:'out',text:'x'.repeat(40000)})+'\n');
    for(const json of [false,true])expect(Buffer.byteLength(serialize(outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:1,json}),json))).toBe(LOG_BYTES);
    writeFileSync(s.output,savedBytes);
    const first=outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:2,json:true});const cursor=first.next_before as string;
    const older=outputPage(f.work(),null,{max:2,json:true,cursor});appendFileSync(s.output,JSON.stringify({line:79,at:'later',source:'out',text:'new activity'})+'\n');
    expect(outputPage(f.work(),null,{max:2,json:true,cursor}).lines).toEqual(older.lines);
    const broken=readFileSync(s.output,'utf8').replace('quotes','BROKEN');writeFileSync(s.output,broken);expect(()=>outputPage(f.work(),null,{max:2,json:true,cursor})).toThrow(/changed|rebuilt/);
  });
  it('keeps cursor/session/execution binding, empty/missing/corrupt output and invalid inputs distinct',async()=>{
    sandbox=createSandbox();const f=fixture();const s=session(f);session(f,'other');
    expect(outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:50,json:true})).toMatchObject({reason:'no_output',lines:[],has_older:false});
    writeFileSync(s.output,[1,2].map(line=>JSON.stringify({line,at:'now',source:'out',text:'literal $(touch /tmp/no)'})).join('\n')+'\n');
    const first=outputPage(f.work(),{phase:'1a',id:s.record.sessionId},{max:1,json:true});
    expect(()=>outputPage(f.work(),null,{max:1,json:true,cursor:first.next_before as string,session:'other'})).toThrow(/session/);
    const selected=readWork(stateRoot(sandbox.env),f.directory);selected.record.executionId='different-execution';expect(()=>outputPage(selected,null,{max:1,json:true,cursor:first.next_before as string})).toThrow(/execution/);
    for(const args of [['logs',f.path,'--max-lines','0'],['logs',f.path,'--max-lines','201'],['logs',f.path,'--max-lines','2','--max-lines','3'],['logs',f.path,'--older-output-cursor','invalid']])expect((await command([...args,'--json'])).code).toBe(2);
    rmSync(s.output);expect((await command(['logs',f.path,'--session-id',s.record.sessionId,'--json'])).code).toBe(4);
    for(const c of ['resume','request-pause'])expect((await command([c,f.path,'--only-if-status-matches','opaque','--command-id','unique','--json'])).code).toBe(4); // A disconnected controller cannot admit controls.
    expect(existsSync('/tmp/no')).toBe(false);
  });
  it('authenticates two live repositories and rechecks identity rather than trusting ports; preserves token/Host/Origin restrictions',async()=>{
    sandbox=createSandbox();h=await createHarness({sessions:[]});const port=await freePort();
    server=await startLocalServer({engine:h.engine,port,folderName:FOLDER,featureName:'Customer returns',token:h.engine.record.token});
    writeJsonAtomically(join(h.stateDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port});
    const origin=`http://127.0.0.1:${port}`;const headers={'X-Kiln-Token':h.engine.record.token};
    const f=fixture('second-real-repository');
    const secondDirectory=prdStateDirectory(stateRoot(h.env),f.repository,'second-real-repository',f.record.prdDirectory);
    writePrdRecord(secondDirectory,f.record);
    secondEngine=new Engine({paths:{mainCheckoutPath:f.repository,repositoryName:'second-real-repository',folderName:FOLDER,prdDirectoryFromRoot:f.record.prdDirectory,featureName:'Second PRD'},tools:h.tools,env:h.env,stateDirectory:secondDirectory,record:f.record});
    const secondPort=await freePort();
    secondServer=await startLocalServer({engine:secondEngine,port:secondPort,folderName:FOLDER,featureName:'Second PRD',token:f.record.token});
    writeJsonAtomically(join(secondDirectory,'instance.lock'),{pid:process.pid,processStartTime:await processStartTime(process.pid),port:secondPort});
    const inventory=await command(['status','--json'],h.env,h.sandbox.root);expect(inventory.code).toBe(0);expect(inventory.json().counts).toMatchObject({live_controllers:2});
    expect((inventory.json().runs as Result[]).map(r=>r.prd_path)).toContain(f.path);
    secondEngine.record.completedAt='2026-01-02T00:00:00Z';writePrdRecord(secondDirectory,secondEngine.record);
    expect((await command(['status','--json'],h.env)).json().counts).toMatchObject({live_controllers:2});
    await secondServer.close();secondServer=undefined;rmSync(join(secondDirectory,'instance.lock'));
    expect((await command(['status','--json'],h.env)).json().counts).toMatchObject({live_controllers:1});
    expect((await fetch(origin+'/api/control/v1/capabilities')).status).toBe(403);
    expect((await fetch(origin+'/api/control/v1/account/refresh',{method:'POST',headers})).status).toBe(403);
    expect(await new Promise(resolve=>{const req=httpRequest({host:'127.0.0.1',port,path:'/api/control/v1/status',headers:{...headers,Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.end()})).toBe(403);
    const status=await command(['status',join(h.repository,`docs/prds/${FOLDER}`),'--detail','full','--json'],h.env,h.sandbox.root);expect(status.code).toBe(0);expect(status.stdout).not.toContain(h.engine.record.token);expect(status.json().status_token).toEqual(expect.any(String));expect((status.json().controls as {name:string;available:boolean}[]).find(c=>c.name==='settings')?.available).toBe(true);
    const original=h.engine.record.executionId!;h.engine.record.executionId='replaced';expect((await command(['status','--json'],h.env)).code).toBe(4);h.engine.record.executionId=original;
    await server.close();server=undefined;
    expect((await command(['status','--json'],h.env)).code).toBe(4); // process still live but no matching controller
  });
});
async function freePort(){for(let p=41480;p<41500;p++)if(await isPortFree(p))return p;throw new Error('No free test port');}
