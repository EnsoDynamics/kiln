// Real provider + GitHub boundary proof in an explicitly disposable non-production repository.
// Usage: node scripts/proof-run/development-delivery-proof.mjs seed claude|codex
//        node scripts/proof-run/development-delivery-proof.mjs run <printed-root>
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../../dist/engine/engine.js';
import { recordedPlan, readPlanAt } from '../../dist/engine/plan-reading.js';
import { reconcileDelivery, phaseDeliveryCheck, evaluateRepositories, prepareOperation } from '../../dist/engine/development-delivery.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readPrdRecord, SCHEMA_VERSION, writePrdRecord, writeSessionRecord } from '../../dist/state/records.js';
import { stateRoot, prdStateDirectory } from '../../dist/state/state-files.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
const [mode, argument] = process.argv.slice(2);
const repository = 'EnsoDynamics/kiln-proof-development-delivery-20261024';
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore','pipe','pipe'] }).trim();
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore','pipe','pipe'] }).trim();
if (mode === 'seed') {
  if (!['claude','codex'].includes(argument)) throw new Error('seed claude|codex');
  const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-development-${argument}-`)));
  const main = join(root, 'proof-main'); mkdirSync(main); const workspace = join(root, 'workspace'); mkdirSync(workspace);
  git(main, 'init', '-b', 'main'); git(main, 'config', 'user.name', 'Kiln Development Proof'); git(main, 'config', 'user.email', 'kiln-proof@example.invalid');
  git(main, 'remote', 'add', 'origin', `https://github.com/${repository}.git`); git(main, 'fetch', 'origin', 'main'); git(main, 'reset', '--hard', 'origin/main');
  const prdDirectory = `docs/prds/development-${argument}-proof`; mkdirSync(join(main, prdDirectory), { recursive: true });
  writeFileSync(join(main, prdDirectory, `development-${argument}-proof-prd.md`), '# PRD: Disposable development delivery proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Deliver the changed artifact.** Merge this disposable proof source into the explicitly approved main branch, let its GitHub Actions workflow publish the development artifact, and verify the actual bytes using the recorded provider command.\n');
  writeFileSync(join(main, prdDirectory, 'technical-design.md'), '# Technical Design: Disposable development delivery proof\n\nThe main branch and kiln-disposable-development environment in this dedicated proof repository are non-production. Required check: required-check. .github/workflows/development-proof.yml deploys immutable artifact development-${github.sha}; deployment job deploy uploads delivery.json and verification job verify downloads it. Independent recorded command verification is `node development-probe.mjs {{mergeRevision}} {{environment}}`.\n');
  writeFileSync(join(main, prdDirectory, 'phase-1-deliver-artifact.md'), '# Phase 1: Deliver artifact\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n');
  for (const [from,to] of [['development-delivery-driver.mjs','development-driver.mjs'],['development-delivery-probe.mjs','development-probe.mjs']]) writeFileSync(join(main,to), readFileSync(new URL(from, import.meta.url)));
  writeFileSync(join(main, '.gitignore'), '.kiln-proof/\n');
  git(main, 'add', prdDirectory, 'development-driver.mjs', 'development-probe.mjs', '.gitignore'); git(main, 'commit', '-m', `test(proof): seed ${argument} development delivery fixture`); git(main, 'push', 'origin', 'main');
  const base = git(main, 'rev-parse', 'HEAD'); const branch = `proof/development-${argument}-${Date.now()}`; const worktree = join(workspace, 'proof'); git(main, 'worktree', 'add', '-b', branch, worktree);
  writeFileSync(join(worktree, 'proof-value.txt'), `Disposable ${argument} delivery source\n`);
  const phase = join(worktree, prdDirectory, 'phase-1-deliver-artifact.md'); writeFileSync(phase, readFileSync(phase,'utf8').replace('\n\n', '\n\n**Closed:** 2026-10-24\n\n'));
  git(worktree, 'add', 'proof-value.txt', `${prdDirectory}/phase-1-deliver-artifact.md`); git(worktree, 'commit', '-m', `test(proof): deliver ${argument} artifact checkpoint`); git(worktree, 'push', '-u', 'origin', branch);
  const head = git(worktree,'rev-parse','HEAD'); const bodyFile = join(root,'pull-request-body.txt'); writeFileSync(bodyFile, `Disposable non-production Kiln integration proof.\n\nPRD: ${prdDirectory}/development-${argument}-proof-prd.md\n`);
  const pullUrl = gh('pr','create','--repo',`github.com/${repository}`,'--head',branch,'--base','main','--title',`Kiln ${argument} development-delivery proof`,'--body-file',bodyFile); const pull = Number(pullUrl.split('/').at(-1));
  const manifest = { purpose: 'Kiln development delivery proof', root, provider: argument, main, workspace, worktree, branch, repository, prdDirectory, base, head, pull, pullUrl };
  writeFileSync(join(root,'proof.json'), JSON.stringify(manifest,null,2), { mode: 0o600 }); console.log(JSON.stringify({ root,pullUrl }));
} else if (mode === 'remainder') {
  const root=realpathSync(argument);const manifest=JSON.parse(readFileSync(join(root,'proof.json'),'utf8'));
  if(manifest.root!==root||manifest.purpose!=='Kiln development delivery proof'||manifest.repository!==repository)throw new Error('Not an owned proof');
  if(git(manifest.worktree,'status','--porcelain')||git(manifest.worktree,'branch','--show-current')!==manifest.branch)throw new Error('Proof workspace changed');
  writeFileSync(join(manifest.worktree,'remaining-review-proof.txt'),'Manual later work stays open for review; this file is not a development checkpoint.\n');
  git(manifest.worktree,'add','remaining-review-proof.txt');git(manifest.worktree,'commit','-m','test(proof): retain later source work for final review');git(manifest.worktree,'push','origin',manifest.branch);
  const body=join(root,'remaining-review-body.txt');writeFileSync(body,`Disposable Kiln mixed-completion proof.\n\nPRD: ${manifest.prdDirectory}/development-${manifest.provider}-proof-prd.md\nEarlier verified delivery: ${manifest.pullUrl}\nThis remaining source work stays open for review.\n`);
  const url=gh('pr','create','--repo',repository,'--head',manifest.branch,'--base','main','--title','Kiln mixed-completion proof: later work remains for review','--body-file',body);
  const previous=JSON.parse(gh('pr','view',String(manifest.pull),'--repo',repository,'--json','body')).body;
  writeFileSync(body,JSON.stringify({body:`${previous}\nRemaining review: ${url}\n`}));gh('api',`repos/${repository}/pulls/${manifest.pull}`,'--method','PATCH','--input',body);
  console.log(JSON.stringify({remainingPullUrl:url,head:git(manifest.worktree,'rev-parse','HEAD')}));
} else if (mode === 'run') {
  const root = realpathSync(argument); const manifest = JSON.parse(readFileSync(join(root,'proof.json'),'utf8')); if (manifest.root !== root || manifest.purpose !== 'Kiln development delivery proof') throw new Error('Not an owned proof');
  const env = { ...process.env, XDG_STATE_HOME: join(root,'private-state'), LOCALAPPDATA: join(root,'private-state') };
  const bin = join(root,'bin'); mkdirSync(bin,{recursive:true}); const wrapper = join(bin,'kiln'); writeFileSync(wrapper, `#!/bin/sh\nexec '${process.execPath}' '${join(packageRoot,'dist','cli.js')}' "$@"\n`); chmodSync(wrapper,0o755); env.PATH = `${bin}:${env.PATH}`;
  const agent = manifest.provider === 'codex' ? 'codex' : 'claude_code'; const at = new Date().toISOString();
  const stateDirectory = prdStateDirectory(stateRoot(env),manifest.main,'proof',manifest.prdDirectory);
  const target = {repository:`github.com/${repository}`.toLowerCase(),baseBranch:'main',environment:'kiln-disposable-development'};
  const record = newPrdRecord({mainCheckoutPath:manifest.main,repositoryName:'proof',github:repository,prdDirectoryFromRoot:manifest.prdDirectory,featureName:'Disposable development delivery proof',settings:{workspaceFolder:manifest.workspace,worktreePath:manifest.worktree,featureBranch:manifest.branch,baseBranch:'main',bases:{},model:'sonnet',effort:'low',keepAwake:false,resumeAfterUsageLimit:false}});
  record.settings.agentId=agent; record.settings.agentChoices[agent]={model:agent==='codex'?'gpt-6.1-sol':'sonnet',effort:'low'};
  record.executionId=randomUUID(); record.startedAt=at;record.setupCompletedAt=at;record.developmentAuthorization={revision:1,enabled:true,grants:[{target,confirmedAt:at,source:'start'}]};
  record.repositories=[{name:'proof',kind:'prd',mainCheckoutPath:manifest.main,github:repository,baseBranch:'main',worktreePath:manifest.worktree,baseCommit:manifest.base,setupCompletedAt:at}];
  const plan=readPlanAt(manifest.worktree,manifest.prdDirectory);if(!plan.ok)throw new Error(plan.problem);record.plan=recordedPlan(plan.plan);
  const session={schemaVersion:SCHEMA_VERSION,agentId:agent,sessionId:randomUUID(),phaseId:'1',kind:'phase',createdAt:at,model:record.settings.agentChoices[agent].model,modelDisplayName:agent,effort:'low',workingDirectory:manifest.worktree,runs:[],sleeps:[],steps:[]};
  record.phases['1']={sessionIds:[session.sessionId],finishedByPerson:false,repositories:{proof:{startCommit:manifest.base}},outsideConfirmations:[],stop:{kind:'done_check',at,checkedAt:at,checks:[{name:'Required development delivery verified',passed:false,facts:['Live proof recovery session']} ]}};
  writePrdRecord(stateDirectory,record);writeSessionRecord(stateDirectory,session);
  const engine=new Engine({paths:{mainCheckoutPath:manifest.main,repositoryName:'proof',folderName:manifest.prdDirectory.split('/').at(-1),prdDirectoryFromRoot:manifest.prdDirectory,featureName:record.featureName},tools:{git:'git',gh:'gh',claude:'claude',codex:'codex'},env,stateDirectory,record,onTerminal:event=>console.log('DELIVERY',JSON.stringify(event))});
  const lock=await takeInstanceLock(stateRoot(env),stateDirectory);if(!lock.taken)throw new Error('Proof instance lock failed');
  const server=await startLocalServer({engine,port:lock.port,folderName:manifest.prdDirectory.split('/').at(-1),featureName:record.featureName,token:record.token});
  const source={path:`${manifest.prdDirectory}/technical-design.md`,revision:manifest.head};
  const checkpoint={id:'development-artifact',executionId:record.executionId,phaseId:'1',target,featureBranch:manifest.branch,headSha:manifest.head,baseSha:manifest.base,criteria:['AC-PROOF-01'],dependsOn:[],workflowSource:source,requirements:[{id:'deploy-artifact',purpose:'deployment',source,match:{kind:'github_deployment'}},{id:'verify-artifact',purpose:'verification',source,match:{kind:'command',invocation:'node development-probe.mjs {{mergeRevision}} {{environment}}',cwd:manifest.worktree,fields:{'/revision':'$mergeRevision','/environment':'$environment','/artifactContentsChecked':true}}}],requiredChecks:['required-check'],requireReview:false};
  mkdirSync(join(manifest.worktree,'.kiln-proof'),{recursive:true});writeFileSync(join(manifest.worktree,'.kiln-proof','manifest.json'),JSON.stringify({checkpoint,cli:{executable:process.execPath,script:join(packageRoot,"dist","cli.js")}}));
  let prompt=readFileSync(new URL('./development-delivery-provider-prompt.txt',import.meta.url),'utf8');for(const [key,value]of Object.entries({WORKTREE:manifest.worktree,BRANCH:manifest.branch,REPOSITORY:repository,PULL:String(manifest.pull),HEAD:manifest.head}))prompt=prompt.replaceAll(`{{${key}}}`,value);
  delete record.phases['1'].stop; engine.current={phaseKey:'1',session,commits:[],processRunning:true};
  console.log('PROOF',JSON.stringify({root,address:server.address,provider:agent,sessionId:session.sessionId}));
  try {
    if(agent==='codex') {
      await runCodexSession({executable:'codex',cwd:manifest.worktree,writableRoots:[manifest.workspace],repositories:[{path:manifest.worktree,branch:manifest.branch}],env,record:session,stateDirectory,prompt,cause:'launch',onEvent:event=>{if(event.method==='item/completed')console.log('ITEM',event.params.item.type);}});
    } else await runSessionProcess({claude:'claude',args:launchArguments(session.sessionId,session.model,session.effort),cwd:manifest.worktree,env,prompt,cause:'launch',stateDirectory,record:session,onOutput:lines=>{for(const line of lines)if(line.source==='stderr'||line.source==='exit')console.log(line.source,line.text)}});
    writeSessionRecord(stateDirectory,session); engine.current.processRunning=false;
    const context={record,stateDirectory,prdWorktree:manifest.worktree,prdDirectory:manifest.prdDirectory,git:{git:'git',env},gh:'gh',env,phaseId:'1',now:()=>new Date().toISOString(),commands:id=>engine.deliveryCommands(id)};
    await reconcileDelivery(context);const phaseCheck=phaseDeliveryCheck(context,'1');const final=await evaluateRepositories(context);
    const decision=await engine.decide();
    const result={decision,provider:agent,sessionId:session.sessionId,conversation:session.conversation,run:session.runs.at(-1),phaseCheck,final,ledger:record.developmentDelivery};writeFileSync(join(root,'proof-result.json'),JSON.stringify(result,null,2),{mode:0o600});
    console.log('RESULT',JSON.stringify({phaseCheck,final,unresolved:record.developmentDelivery.checkpoints.map(one=>one.unresolvedReason)}));
    if(!phaseCheck.passed||!final.passed)throw new Error('Real provider proof did not pass; inspect retained proof-result.json');
  }finally{await server.close();lock.release();engine.close();}
} else if (mode === 'recheck' || mode === 'serve' || mode === 'policy-check') {
  const root=realpathSync(argument); const manifest=JSON.parse(readFileSync(join(root,'proof.json'),'utf8'));
  if(manifest.root!==root||manifest.purpose!=='Kiln development delivery proof')throw new Error('Not an owned proof');
  const env={...process.env,XDG_STATE_HOME:join(root,'private-state'),LOCALAPPDATA:join(root,'private-state')};
  const stateDirectory=prdStateDirectory(stateRoot(env),manifest.main,'proof',manifest.prdDirectory);const record=readPrdRecord(stateDirectory);if(!record)throw new Error('No retained execution');
  const engine=new Engine({paths:{mainCheckoutPath:manifest.main,repositoryName:'proof',folderName:manifest.prdDirectory.split('/').at(-1),prdDirectoryFromRoot:manifest.prdDirectory,featureName:record.featureName},tools:{git:'git',gh:'gh',claude:'claude',codex:'codex'},env,stateDirectory,record});
  try {
    const context={record,stateDirectory,prdWorktree:manifest.worktree,prdDirectory:manifest.prdDirectory,git:{git:'git',env},gh:'gh',env,phaseId:'1',now:()=>new Date().toISOString(),commands:id=>engine.deliveryCommands(id)};
    if(mode==='policy-check') {
      const probe=globalThis.structuredClone(record);const checkpoint=globalThis.structuredClone(record.developmentDelivery.checkpoints[0]);
      checkpoint.id='live-unapproved-review-proof';checkpoint.headSha=git(manifest.worktree,'rev-parse','HEAD');checkpoint.operations=[];checkpoint.references=[];checkpoint.evidence=[];delete checkpoint.merge;checkpoint.requireReview=true;probe.developmentDelivery.checkpoints=[checkpoint];
      const probeContext={...context,record:probe};
      let refused;
      try { await prepareOperation(probeContext,{checkpointId:checkpoint.id,operation:{kind:'merge'}}); }catch(error){refused=error.message;}
      if(!refused?.includes('Required review, merge checks or branch protections block'))throw new Error(`Expected real unapproved-review refusal: ${refused}`);
      checkpoint.requiredChecks=['unpassed-required-proof-check'];
      let checksRefused;try{await prepareOperation(probeContext,{checkpointId:checkpoint.id,operation:{kind:'merge'}});}catch(error){checksRefused=error.message;}
      if(!checksRefused?.includes('has not passed'))throw new Error(`Expected required-check refusal: ${checksRefused}`);
      writeFileSync(join(root,'policy-result.json'),JSON.stringify({refused,checksRefused,head:checkpoint.headSha},null,2));console.log(JSON.stringify({refused,checksRefused}));
    } else {
    await reconcileDelivery(context);const phaseCheck=phaseDeliveryCheck(context,'1');const final=await evaluateRepositories(context);
    writeFileSync(join(root,'recheck-result.json'),JSON.stringify({phaseCheck,final,ledger:record.developmentDelivery},null,2)); console.log(JSON.stringify({phaseCheck,final}));
    if(!phaseCheck.passed||!final.passed)throw new Error('Historical delivery recheck failed');
    if(mode==='serve') {
      const decision=await engine.decide(); if(decision.kind!=='complete')throw new Error(`Full engine completion did not pass: ${JSON.stringify(decision)}`);
      const lock=await takeInstanceLock(stateRoot(env),stateDirectory,{range:{first:4710,last:4719}});if(!lock.taken)throw new Error('Proof instance lock failed');
      const server=await startLocalServer({engine,port:lock.port,folderName:manifest.prdDirectory.split('/').at(-1),featureName:record.featureName,token:record.token});
      console.log(JSON.stringify({decision,address:server.address}));
      try { await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);}); }finally{await server.close();lock.release();}
    }
    }
  } finally { engine.close(); }
}else throw new Error('seed claude|codex | run|recheck|serve|remainder|policy-check <root>');
