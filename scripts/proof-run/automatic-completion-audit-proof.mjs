import {createHash} from 'node:crypto';
// Actual providers + installed package + authenticated CLI + local bare Git origin.
// KILN_PROOF_PACKAGE_ROOT must name the installed @ensodynamics/kiln directory.
// node scripts/proof-run/automatic-completion-audit-proof.mjs claude|codex
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const provider=process.argv[2];if(!['claude','codex'].includes(provider))throw new Error('claude | codex');
const packageRoot=process.env.KILN_PROOF_PACKAGE_ROOT;if(!packageRoot)throw new Error('Set KILN_PROOF_PACKAGE_ROOT to the installed package');
const digest=createHash('sha256');const walk=folder=>{for(const name of readdirSync(join(packageRoot,folder),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=folder+'/'+name.name;if(name.isDirectory())walk(path);else{digest.update(path);digest.update(readFileSync(join(packageRoot,path)));}}};walk('dist');const packageDistDigest=digest.digest('hex');
const module=async path=>import(pathToFileURL(join(packageRoot,'dist',path)).href);
const {Engine}=await module('engine/engine.js');const {newPrdRecord}=await module('state/new-record.js');
const {readPrdRecord,writePrdRecord}=await module('state/records.js');
const {stateRoot,prdStateDirectory}=await module('state/state-files.js');const {takeInstanceLock}=await module('state/instance-lock.js');
const {startLocalServer}=await module('server/local-server.js');
const root=realpathSync(mkdtempSync(join(tmpdir(),`kiln-auto-audit-${provider}-`)));const workspace=join(root,'workspace');mkdirSync(workspace);const main=join(workspace,'audit-proof');mkdirSync(main);
const env={...process.env,XDG_STATE_HOME:join(root,'private'),LOCALAPPDATA:join(root,'private'),GIT_AUTHOR_NAME:'Kiln Audit Proof',GIT_AUTHOR_EMAIL:'proof@example.invalid',GIT_COMMITTER_NAME:'Kiln Audit Proof',GIT_COMMITTER_EMAIL:'proof@example.invalid'};
const git=(cwd,...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const origin=join(root,'origin.git');git(root,'init','--bare','-b','proof',origin);git(main,'init','-b','proof');git(main,'remote','add','origin',origin);
const directory='docs/prds/audit-proof';mkdirSync(join(main,directory),{recursive:true});mkdirSync(join(main,'.proof'));
writeFileSync(join(main,'value.mjs'),'export function value() { return 42; }\n');
writeFileSync(join(main,'value.test.mjs'),"import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
writeFileSync(join(main,'.gitignore'),'.proof/\n.agent-sessions/\n');
writeFileSync(join(main,'AGENTS.md'),readFileSync(new URL('./automatic-audit-provider-instructions.txt',import.meta.url),'utf8'));
writeFileSync(join(main,directory,'audit-proof-prd.md'),'# PRD: Audit evidence proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Export the value.** The exported value function in value.mjs returns 42 when called.\n');
writeFileSync(join(main,directory,'technical-design.md'),'# Technical Design\nExport value() from value.mjs. Node imports the function. Verify with node value.test.mjs.\n');
writeFileSync(join(main,directory,'phase-1-value.md'),'# Phase 1: Export value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n');
writeFileSync(join(main,'audit-driver.mjs'),readFileSync(new URL('./automatic-audit-driver.mjs',import.meta.url)));
const files=['value.mjs','value.test.mjs','.gitignore','AGENTS.md','audit-driver.mjs',directory];git(main,'add','--',...files);git(main,'commit','-m','test(audit): seed disposable provider proof');git(main,'push','-u','origin','proof');
const agentId=provider==='codex'?'codex':'claude_code';const at=new Date().toISOString();
let record=newPrdRecord({mainCheckoutPath:main,repositoryName:'audit-proof',github:'example/audit-proof',prdDirectoryFromRoot:directory,featureName:'Audit evidence proof',settings:{workspaceFolder:workspace,worktreePath:main,featureBranch:'proof',baseBranch:'proof',bases:{},model:'sonnet',effort:'high',keepAwake:false,resumeAfterUsageLimit:false}});
record.startedAt=at;record.setupCompletedAt=at;record.settings.agentId=agentId;record.settings.agentChoices[agentId]={model:provider==='codex'?'gpt-6.1-sol':'sonnet',effort:'high'};
record.repositories=[{name:'audit-proof',kind:'prd',mainCheckoutPath:main,github:'example/audit-proof',baseBranch:'proof',worktreePath:main,setupCompletedAt:at}];
const stateDirectory=prdStateDirectory(stateRoot(env),main,'audit-proof',directory);writePrdRecord(stateDirectory,record);
writeFileSync(join(main,'.proof','manifest.json'),JSON.stringify({cli:join(packageRoot,'dist','cli.js')}));
// The final GitHub read uses the repository-owned recorded gh contract. Providers,
// audit CLI and all Git operations are real; no external PR is created for this proof.
const bin=join(root,'bin');mkdirSync(bin);
const gh=join(bin,'gh');const ghSource=fileURLToPath(new URL('../../test/stand-ins/gh-stand-in.mjs',import.meta.url));
writeFileSync(gh,`#!/bin/sh\nexec '${process.execPath}' '${ghSource}' "$@"\n`);chmodSync(gh,0o755);
env.PATH=bin+':'+env.PATH;env.KILN_STANDIN_GH_STATE=join(root,'github-read-contract.json');
writeFileSync(env.KILN_STANDIN_GH_STATE,JSON.stringify({pulls:[{repo:'example/audit-proof',number:1,title:'Audit proof',url:'https://github.com/example/audit-proof/pull/1',isDraft:false,isCrossRepository:false,headRefName:'proof',baseRefName:'proof',additions:1,deletions:0,commits:[{oid:git(main,'rev-parse','HEAD')}]}]}));
const makeEngine=()=>new Engine({paths:{mainCheckoutPath:main,repositoryName:'audit-proof',folderName:'audit-proof',prdDirectoryFromRoot:directory,featureName:record.featureName},tools:{git:'git',gh,claude:'claude',codex:'codex'},env,stateDirectory,record});
let engine=makeEngine();
const lock=await takeInstanceLock(stateRoot(env),stateDirectory);if(!lock.taken)throw new Error('Lock unavailable');let server=await startLocalServer({engine,port:lock.port,folderName:'audit-proof',featureName:record.featureName,token:record.token});
writeFileSync(join(root,'proof-manifest.json'),JSON.stringify({root,provider,main,stateDirectory,packageRoot,packageDistDigest},null,2));console.log(JSON.stringify({root,provider,address:server.address}));
try {
 await engine.agents.refresh();
 const decision=await engine.decide();
 console.log(JSON.stringify({decision}));
 let interrupted=false;let interruption;let originalSession;let originalActivity;
 const off=engine.onOutput((_id,lines)=>{
  if(interrupted||engine.current?.session?.kind!=='delivery_audit'||!lines.some(line=>line.text.includes('delivery-audit')))return;
  interrupted=true;originalSession=engine.current.session.sessionId;originalActivity=engine.current.session.activityId;
  interruption=engine.stop('sigint');
 });
 await engine.continue();off();
 if(interruption){
  await interruption;await server.close();
  record=readPrdRecord(stateDirectory);engine=makeEngine();await engine.agents.refresh();
  server=await startLocalServer({engine,port:lock.port,folderName:'audit-proof',featureName:record.featureName,token:record.token});
  const recovery=await engine.decide();console.log(JSON.stringify({recovery,originalSession,originalActivity}));
  await engine.continue();
 }

 const activities=record.completionAudits.activities;
 const result={interrupted,originalSession,originalActivity,activities,phases:record.phases,completedAt:record.completedAt,stop:engine.stoppedPhaseKey()};
 writeFileSync(join(root,'proof-result.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({root,activities:activities.map(a=>({kind:a.kind,round:a.round,accepted:!!a.acceptedResult,done:!!record.phases[`audit-${a.activityId}`]?.doneAt})),stop:result.stop,completedAt:result.completedAt}));
 if(!interrupted||!record.completedAt||activities.length!==2||activities.some(a=>!a.acceptedResult||!record.phases[`audit-${a.activityId}`]?.doneAt)||activities[0].sessionIds.length!==1||activities[0].sessionIds[0]!==originalSession)process.exitCode=1;
} finally {await server.close();lock.release();engine.close();}
