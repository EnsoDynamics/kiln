// Actual providers + installed package + authenticated CLI + local bare Git origin.
// KILN_PROOF_PACKAGE_ROOT must name the installed @ensodynamics/kiln directory.
// node scripts/proof-run/completion-audit-proof.mjs claude|codex
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const provider=process.argv[2];if(!['claude','codex'].includes(provider))throw new Error('claude | codex');
const packageRoot=process.env.KILN_PROOF_PACKAGE_ROOT;if(!packageRoot)throw new Error('Set KILN_PROOF_PACKAGE_ROOT to the installed package');
const module=async path=>import(pathToFileURL(join(packageRoot,'dist',path)).href);
const {Engine}=await module('engine/engine.js');const {newPrdRecord}=await module('state/new-record.js');
const {SCHEMA_VERSION,writePrdRecord,writeSessionRecord}=await module('state/records.js');
const {stateRoot,prdStateDirectory}=await module('state/state-files.js');const {takeInstanceLock}=await module('state/instance-lock.js');
const {startLocalServer}=await module('server/local-server.js');const {launchArguments,runSessionProcess}=await module('session/claude-session.js');const {runCodexSession}=await module('session/codex-session.js');
const root=realpathSync(mkdtempSync(join(tmpdir(),`kiln-completion-${provider}-`)));const workspace=join(root,'workspace');mkdirSync(workspace);const main=join(workspace,'audit-proof');mkdirSync(main);
const env={...process.env,XDG_STATE_HOME:join(root,'private'),LOCALAPPDATA:join(root,'private'),GIT_AUTHOR_NAME:'Kiln Audit Proof',GIT_AUTHOR_EMAIL:'proof@example.invalid',GIT_COMMITTER_NAME:'Kiln Audit Proof',GIT_COMMITTER_EMAIL:'proof@example.invalid'};
const git=(cwd,...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
const origin=join(root,'origin.git');git(root,'init','--bare','-b','proof',origin);git(main,'init','-b','proof');git(main,'remote','add','origin',origin);
const directory='docs/prds/audit-proof';mkdirSync(join(main,directory),{recursive:true});mkdirSync(join(main,'.proof'));
writeFileSync(join(main,'value.mjs'),'export function value() { return 42; }\n');
writeFileSync(join(main,'value.test.mjs'),"import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
writeFileSync(join(main,'.gitignore'),'.proof/\n.agent-sessions/\n');
writeFileSync(join(main,'AGENTS.md'),'# Disposable audit proof\nWork only in this repository on proof. Local commit and push to this local bare origin are authorized. No release, external messages, infrastructure or remote GitHub writes. For this proof, do not edit requirements or implementation. Kiln handles continuation.\n');
writeFileSync(join(main,directory,'audit-proof-prd.md'),'# PRD: Audit evidence proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Export the value.** The exported value function in value.mjs returns 42 when called.\n');
writeFileSync(join(main,directory,'technical-design.md'),'# Technical Design\nExport value() from value.mjs. Node imports the function. Verify with node value.test.mjs.\n');
writeFileSync(join(main,directory,'phase-1-value.md'),'# Phase 1: Export value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n');
writeFileSync(join(main,'audit-driver.mjs'),readFileSync(new URL('./completion-audit-driver.mjs',import.meta.url)));
const files=['value.mjs','value.test.mjs','.gitignore','AGENTS.md','audit-driver.mjs',directory];git(main,'add','--',...files);git(main,'commit','-m','test(audit): seed disposable provider proof');git(main,'push','-u','origin','proof');
const agentId=provider==='codex'?'codex':'claude_code';const at=new Date().toISOString();
const record=newPrdRecord({mainCheckoutPath:main,repositoryName:'audit-proof',github:'example/audit-proof',prdDirectoryFromRoot:directory,featureName:'Audit evidence proof',settings:{workspaceFolder:workspace,worktreePath:main,featureBranch:'proof',baseBranch:'proof',bases:{},model:'sonnet',effort:'high',keepAwake:false,resumeAfterUsageLimit:false}});
record.startedAt=at;record.setupCompletedAt=at;record.settings.agentId=agentId;record.settings.agentChoices[agentId]={model:provider==='codex'?'gpt-6.1-sol':'sonnet',effort:'high'};
record.repositories=[{name:'audit-proof',kind:'prd',mainCheckoutPath:main,github:'example/audit-proof',baseBranch:'proof',worktreePath:main,setupCompletedAt:at}];
const installedPlugins=provider==='claude'?JSON.parse(readFileSync(join(homedir(),'.claude/plugins/installed_plugins.json'),'utf8')):undefined;
const skill=provider==='codex'?join(homedir(),'.agents/skills/delivery-audit/SKILL.md'):join(installedPlugins.plugins['enso-method@enso-method'][0].installPath,'skills/delivery-audit/SKILL.md');
const activity={activityId:randomUUID(),sequence:1,kind:'delivery_audit',round:1,continuationIndex:1,createdAt:at,sessionIds:[randomUUID()],reportPath:'',skill:{name:'delivery-audit',path:skill,digest:createHash('sha256').update(readFileSync(skill)).digest('hex')},snapshots:[],attempts:[]};activity.reportPath=`${directory}/kiln-audit-${activity.activityId}.json`;record.completionAudits.activities.push(activity);
const session={schemaVersion:SCHEMA_VERSION,agentId,sessionId:activity.sessionIds[0],activityId:activity.activityId,phaseId:'',kind:'delivery_audit',createdAt:at,model:record.settings.agentChoices[agentId].model,modelDisplayName:agentId,effort:'high',workingDirectory:main,runs:[],sleeps:[],steps:[]};
const stateDirectory=prdStateDirectory(stateRoot(env),main,'audit-proof',directory);writePrdRecord(stateDirectory,record);writeSessionRecord(stateDirectory,session);
writeFileSync(join(main,'.proof','manifest.json'),JSON.stringify({cli:join(packageRoot,'dist','cli.js')}));
const engine=new Engine({paths:{mainCheckoutPath:main,repositoryName:'audit-proof',folderName:'audit-proof',prdDirectoryFromRoot:directory,featureName:record.featureName},tools:{git:'git',gh:'gh',claude:'claude',codex:'codex'},env,stateDirectory,record});
const lock=await takeInstanceLock(stateRoot(env),stateDirectory);if(!lock.taken)throw new Error('Lock unavailable');const server=await startLocalServer({engine,port:lock.port,folderName:'audit-proof',featureName:record.featureName,token:record.token});
let prompt=readFileSync(new URL('./completion-audit-provider-prompt.txt',import.meta.url),'utf8');for(const [key,value]of Object.entries({WORKTREE:main,BRANCH:'proof',SKILL:skill}))prompt=prompt.replaceAll(`{{${key}}}`,value);
writeFileSync(join(root,'proof-manifest.json'),JSON.stringify({root,provider,main,stateDirectory,sessionId:session.sessionId,activityId:activity.activityId,packageRoot},null,2));console.log(JSON.stringify({root,provider,address:server.address}));
try{
 if(provider==='codex')await runCodexSession({executable:'codex',cwd:main,writableRoots:[workspace],repositories:[{path:main,branch:'proof'}],env,record:session,stateDirectory,prompt,cause:'launch'});
 else await runSessionProcess({claude:'claude',args:launchArguments(session.sessionId,session.model,session.effort),cwd:main,env,prompt,cause:'launch',stateDirectory,record:session});
 writeSessionRecord(stateDirectory,session);
 const result=await engine.auditCommand('result',{executionId:record.executionId,activityId:activity.activityId,revision:record.completionAudits.revision,reportPath:activity.reportPath});
 writeFileSync(join(root,'proof-result.json'),JSON.stringify({result,session},null,2),{mode:0o600});console.log(JSON.stringify({root,disposition:result.disposition,checks:result.checks}));if(result.disposition!=='recorded')process.exitCode=1;
}finally{await server.close();lock.release();engine.close();}
