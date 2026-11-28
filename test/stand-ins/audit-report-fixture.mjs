// Scripted audit session writing Kiln's version-2 report (method-neutral audits): the skill's
// own procedure is out of Kiln's view, so the fixture only loads the skill, changes what the
// behavior names, commits and pushes, then submits through the pinned CLI.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
export async function auditReportFixture({prompt,toolCall,toolResult,behavior={}}){
 const pinned=/Pinned CLI: ([^\n]+)/.exec(prompt)[1];
 const parts=JSON.parse('['+pinned.replace(/"\s+"/g,'","')+']');
 parts[1]=parts[1].replace(/([\\/])src([\\/])cli\.js$/, '$1dist$2cli.js');
 const invoke=(args)=>JSON.parse(execFileSync(parts[0],[parts[1],'audit',...args],{encoding:'utf8',timeout:125000}));
 const command=(text)=>{const id=toolCall('Bash',{command:text});let out,failed=false;try{out=execFileSync('sh',['-c',text],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){out=String(e.stdout)+String(e.stderr);failed=true;}toolResult(id,out,failed);};
 const s=invoke(['status']);
 const directory=dirname(s.requiredReportPath);const codePath=`${directory}/value.mjs`;const testPath=`${directory}/value.test.mjs`;
 const skill=s.kind==='delivery_audit'?'delivery-audit':'test-audit';toolResult(toolCall('Skill',{skill}),`Loaded ${skill}`);
 if(behavior.noReport)return;
 const testing=s.kind==='test_audit';
 const changed=[s.requiredReportPath];
 const report={schemaVersion:2,executionId:s.executionId,activityId:s.activityId,kind:s.kind,outcome:'passed',summary:'Fixture audit found nothing left.',completionPhases:[],needsYou:[],...(testing?{changedImplementation:false}:{})};
 if(behavior.directFix){writeFileSync(codePath,'export function value() { return 42; }\n');toolResult(toolCall('Write',{file_path:join(process.cwd(),codePath)}),'Small implementation fix');changed.push(codePath);if(testing)report.changedImplementation=true;}
 if(behavior.gap){
  // `gapPhases` appends that many phases in one report (one audit's phases are one delivery loop, AC-LOOP-02).
  const label=readdirSync(directory).filter(name=>name.endsWith('-prd.md')).map(name=>/AC-[A-Z0-9]+-\d+/.exec(readFileSync(join(directory,name),'utf8'))?.[0]).find(Boolean);
  const ids=[];
  for(let n=0;n<(behavior.gapPhases??1);n++){
   const id=String(Math.max(...readdirSync(directory).flatMap(name=>/^phase-(\d+)/.exec(name)?.[1]??[]).map(Number))+1);const path=`${directory}/phase-${id}-repair.md`;
   writeFileSync(path,`# Phase ${id}: Repair value\n\n## Acceptance criteria covered\n${label}\n\n## Summary\nReturn the required value.\n\n## Phase dependencies\nNone.\n`);toolResult(toolCall('Write',{file_path:join(process.cwd(),path)}),'Completion phase added');
   changed.push(path);ids.push(id);
  }
  report.outcome='completion_phases';report.completionPhases=ids;report.summary='One criterion is not delivered; added a completion phase.';
  if(behavior.decision)report.needsYou=[{kind:behavior.decisionKind??'other',problem:behavior.decision,action:'Decide it before the next audit.',...(behavior.decisionKind==='blocker'||behavior.decisionKind==='business_question'||behavior.decisionKind==='critical_next_step'?{waitsOn:'The pull request.'}:{})}];
 }
 if(testing&&!behavior.noRecord){writeFileSync(`${directory}/test-audit.md`,`# Test audit\n\n${behavior.findingText??'Every criterion has adequate tests.'}\n`);changed.push(`${directory}/test-audit.md`);}
 if(behavior.continueTest){
  report.outcome='continue_test';report.summary='Test work remains for another session.';
  if(behavior.testChange!==false){writeFileSync(testPath,readFileSync(testPath,'utf8')+`// assertion ${s.activityId}\n`);changed.push(testPath);}
 }
 if(behavior.humanAction){
  if(behavior.beyondDelivery??true){if(!behavior.recordedHumanResult)report.afterDeliveryActions=[behavior.humanAction];}
  else{report.outcome='needs_you';report.needsYou=[{kind:'blocker',problem:`${behavior.humanAction} is due before delivery.`,action:'Perform it and record the result.',waitsOn:'Delivery.'}];}
 }
 if(behavior.blocked){report.outcome='needs_you';report.needsYou=[{kind:'blocker',problem:'Required evidence is unavailable.',action:'Restore the named evidence.',waitsOn:'The rest of the audit.'}];}
 // Explicit items for a person (Kiln Deliver When Audit Loops Run Out AC-ITEM-01), and an outcome or raised rows to report.
 if(behavior.items)report.needsYou.push(...behavior.items);
 if(behavior.outcome)report.outcome=behavior.outcome;
 // A session of test fixes that continues names the rows it raised (AC-LAST-01); `raised: false` leaves it out.
 if(behavior.raised)report.raised=behavior.raised;
 else if(behavior.raised!==false&&report.outcome==='continue_test'&&s.continuationIndex>1)report.raised=['AC-PROOF-01'];
 // Items earlier audits left for a person, as the prompt lists them: list each again or settle it.
 const outstanding=[...(/Items earlier audits left for a person \(outstanding\):\n([\s\S]*?)\n\n/.exec(prompt)?.[1]??'').matchAll(/^- (item-\d+) \((?:[^;]*; )?listed by [^)]*\): (.*?)(?: \(waived .*)?$/gm)].map(m=>({id:m[1],text:m[2]}));
 if(behavior.relist)report.needsYou.push(...outstanding.map(item=>({id:item.id,problem:item.text,action:'Still open.',...(behavior.relistKind?{kind:behavior.relistKind}:{})})));
 if(behavior.settle)report.settled=outstanding.map(item=>({id:item.id,how:behavior.settle}));
 // A new item that is a criterion's test row names it (Kiln Audit Loop Limits, "Report Contract").
 if(behavior.criterion)for(const item of report.needsYou)if(!item.id)item.criterion=behavior.criterion;
 // The batches of test work a continue_test report leaves (Kiln Planned Test Fix Batches): [{criteria}], in order.
 if(behavior.fixBatches)report.fixBatches=behavior.fixBatches;
 // The report's own summary, so a page can tell two reports apart.
 if(behavior.summary)report.summary=behavior.summary;
 // A report naming another execution, which admission refuses.
 if(behavior.wrongExecution)report.executionId='another-execution';
 mkdirSync(dirname(s.requiredReportPath),{recursive:true});writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');
 command(`git add -- ${changed.join(' ')}`);command('git commit -m "docs(audit): record fixture audit"');if(!behavior.noPush)command('git push origin HEAD');
 if(behavior.beforeSubmitFile){writeFileSync(behavior.beforeSubmitFile,'ready');while(!readFileSync(behavior.beforeSubmitFile,'utf8').includes('continue'))await new Promise(r=>setTimeout(r,20));}
 if(!behavior.skipSubmit){
  mkdirSync('.proof',{recursive:true});const current=invoke(['status']);
  writeFileSync('.proof/request.json',JSON.stringify({executionId:current.executionId,activityId:current.activityId,revision:current.revision,reportPath:current.requiredReportPath}));
  const id=toolCall('Bash',{command:pinned+' audit submit .proof/request.json'});
  try{toolResult(id,execFileSync(parts[0],[parts[1],'audit','submit','.proof/request.json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:125000}));}catch(error){toolResult(id,String(error.stdout)+String(error.stderr),true);}
 }
}
