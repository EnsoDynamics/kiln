// Scripted provider evidence beside the independent installed actual-provider proofs.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function auditReportFixture({prompt,sessionId,transcriptPath,toolCall,toolResult,behavior={}}){
 const pinned=/Pinned CLI: ([^\n]+)/.exec(prompt)[1];
 const parts=JSON.parse('['+pinned.replace(/"\s+"/g,'","')+']');
 parts[1]=parts[1].replace('/src/cli.js','/dist/cli.js');
 const invoke=(args)=>JSON.parse(execFileSync(parts[0],[parts[1],'audit',...args],{encoding:'utf8',timeout:125000}));
 const status=()=>{const s=invoke(['status']);let cursor=s.nextCursor;while(cursor){const page=invoke(['status',cursor]);s.evidence.push(...page.evidence);cursor=page.nextCursor;}return s;};
 const command=(text)=>{const id=toolCall('Bash',{command:text});let out,failed=false;try{out=execFileSync('sh',['-c',text],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){out=String(e.stdout)+String(e.stderr);failed=true;}toolResult(id,out,failed);};
 let s=status();const initial=s.currentSnapshot;let checked=initial;const c=initial.requirements.criteria[0];const directory=dirname(initial.requirements.path);const codePath=`${directory}/value.mjs`;const testPath=`${directory}/value.test.mjs`;
 const skill=s.kind==='delivery_audit'?'delivery-audit':'test-audit';toolResult(toolCall('Skill',{skill}),`Loaded ${skill}`);
 if(behavior.noReport)return;
 mkdirSync('.proof',{recursive:true});
 if(behavior.directFix){writeFileSync(codePath,'export function value() { return 42; }\n');toolResult(toolCall('Write',{file_path:join(process.cwd(),codePath)}),'Small implementation fix');}
 if(behavior.gap||behavior.directFix){
  if(behavior.gap){const id=String(Math.max(...initial.plan.map(p=>Number.parseInt(p.id,10)))+1);const path=`${directory}/phase-${id}-repair.md`;
  writeFileSync(path,`# Phase ${id}: Repair value\n\n**Added by ${s.kind==='test_audit'?'test':'delivery'} audit:** ${s.activityId}\n\n## Acceptance criteria covered\n${c.label}\n\n## Summary\nReturn the required value.\n\n## Phase dependencies\nNone.\n`);toolResult(toolCall('Write',{file_path:join(process.cwd(),path)}),'Completion phase added');}
  s=status();writeFileSync('.proof/request.json',JSON.stringify({executionId:s.executionId,activityId:s.activityId,revision:s.revision,testPaths:[],evidencePaths:[]}));invoke(['snapshot','.proof/request.json']);checked=status().currentSnapshot;
 }
 const testing=s.kind==='test_audit';
 if(testing){const originalCode=readFileSync(codePath,'utf8');command(`node ${testPath}`);writeFileSync(codePath,'export const value = () => 0;\n');toolResult(toolCall('Write',{file_path:join(process.cwd(),codePath)}),'Mutated');command(`node ${testPath}`);command(`node ${testPath}`);writeFileSync(codePath,originalCode);toolResult(toolCall('Write',{file_path:join(process.cwd(),codePath)}),'Restored');command(`node ${testPath}`);writeFileSync(`${directory}/test-audit.md`,'# Test audit\nAdequate evidence for value.\n');toolResult(toolCall('Write',{file_path:join(process.cwd(),directory,'test-audit.md')}),'Written');}
 s=status();const runs=s.evidence.filter(e=>e.sessionId===sessionId&&e.kind==='command'&&e.command.invocation===`node ${testPath}`);
 function assess(purpose){const child=`${purpose}-${s.activityId}`;toolResult(toolCall('Agent',{prompt:`Assess ${checked.id} ${c.key} value`}),`Completed agentId: ${child}`);const dir=join(dirname(transcriptPath()),sessionId,'subagents');mkdirSync(dir,{recursive:true});const text=`Fixture independent ${purpose}: <kiln-assessment>${JSON.stringify({snapshotId:checked.id,criterionKeys:[c.key],partIds:['value'],purpose,testPaths:[],verificationEvidenceIds:runs.map(e=>e.evidenceId)})}</kiln-assessment>`;writeFileSync(join(dir,`agent-${child}.jsonl`),JSON.stringify({type:'assistant',timestamp:new Date().toISOString(),cwd:process.cwd(),message:{content:[{type:'text',text}]}})+'\n');}
 assess('assessment');assess('review');if(testing)assess('regrade');s=status();
 // Reuse the actual-provider mechanical writer: the fixture supplies no accepted gate.
 writeFileSync('.proof/manifest.json',JSON.stringify({cli:parts[1],codePath,testPath}));
 const driver=fileURLToPath(new URL('../../scripts/proof-run/automatic-audit-driver.mjs',import.meta.url));
 execFileSync(process.execPath,[driver,'write-report'],{encoding:'utf8'});
 const report=JSON.parse(readFileSync(s.requiredReportPath,'utf8'));
 if(behavior.humanAction){
  const row=report.criteria[0];
  if(testing)row.testAssessment={status:'person_checked'};else row.deliveryStatus='waiting_human';
  row.parts[0].humanActionId='later-release';
  report.pendingHumanActions=[{id:'later-release',criterionKey:c.key,action:behavior.humanAction,requirementQuote:'Production release is a separate human action after Kiln delivery.',beyondDelivery:behavior.beyondDelivery??true}];
  // A real immutable file reference exercises result admission/projection; this scripted
  // provider does not prove that a person performed the fixture's release action.
  if(behavior.recordedHumanResult)report.pendingHumanActions[0].result=row.parts[0].code[0];
  writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');
 }
 if(behavior.blocked){report.outcome='blocked';report.blockers=[{id:'permission',criterionKeys:[c.key],problem:'Required evidence is unavailable.',requiredAction:'Restore the named evidence.'}];report.criteria[0].blockerIds=['permission'];writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');}
 if(behavior.gap){report.outcome='completion_phases';if(testing)report.criteria[0].testAssessment={status:'not_implemented'};else report.criteria[0].deliveryStatus='not_implemented';report.criteria[0].findings=[{partIds:['value'],missing:'Return the required value.',evidenceIds:[]}];report.completionPhases=checked.plan.filter(p=>!initial.plan.some(old=>old.id===p.id)).map(p=>({id:p.id,path:p.file,originKind:s.kind,originActivityId:s.activityId,criterionKeys:[c.key],missingBehavior:'Return the required value.',dependencies:[]}));writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');}
 if(behavior.continueTest){report.outcome='continue_test';report.criteria[0].testAssessment={grade:'weak'};report.criteria[0].findings=[{partIds:['value'],missing:behavior.findingText??'The remaining value edge needs assertion coverage.',evidenceIds:[]}];report.nextTestBatch={criterionKeys:[c.key],recordPath:directory+'/test-audit.md',nextBatch:'Add the remaining value edge assertion.'};writeFileSync(directory+'/test-audit.md','# Test audit\n'+report.nextTestBatch.nextBatch+'\n');writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');}
 command(`git add -- ${s.requiredReportPath}${behavior.gap?' '+report.completionPhases.map(p=>p.path).join(' '):''}${testing?' '+directory+'/test-audit.md':''}${behavior.directFix?' '+codePath:''}`);command('git commit -m "docs(audit): record fixture audit"');command('git push origin HEAD');
 if(behavior.beforeSubmitFile){writeFileSync(behavior.beforeSubmitFile,'ready');while(!readFileSync(behavior.beforeSubmitFile,'utf8').includes('continue'))await new Promise(r=>setTimeout(r,20));}
 if(!behavior.skipSubmit){const id=toolCall('Bash',{command:pinned+' audit submit .proof/request.json'});try{toolResult(id,execFileSync(process.execPath,[driver,'submit'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch(error){toolResult(id,String(error.stdout)+String(error.stderr),true);}}
}
