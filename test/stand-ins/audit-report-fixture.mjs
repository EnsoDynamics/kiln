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
  const id=String(Math.max(...readdirSync(directory).flatMap(name=>/^phase-(\d+)/.exec(name)?.[1]??[]).map(Number))+1);const path=`${directory}/phase-${id}-repair.md`;
  const label=readdirSync(directory).filter(name=>name.endsWith('-prd.md')).map(name=>/AC-[A-Z0-9]+-\d+/.exec(readFileSync(join(directory,name),'utf8'))?.[0]).find(Boolean);
  writeFileSync(path,`# Phase ${id}: Repair value\n\n## Acceptance criteria covered\n${label}\n\n## Summary\nReturn the required value.\n\n## Phase dependencies\nNone.\n`);toolResult(toolCall('Write',{file_path:join(process.cwd(),path)}),'Completion phase added');
  changed.push(path);report.outcome='completion_phases';report.completionPhases=[id];report.summary='One criterion is not delivered; added a completion phase.';
  if(behavior.decision)report.needsYou=[{problem:behavior.decision,action:'Decide it before the next audit.'}];
 }
 if(testing&&!behavior.noRecord){writeFileSync(`${directory}/test-audit.md`,`# Test audit\n\n${behavior.findingText??'Every criterion has adequate tests.'}\n`);changed.push(`${directory}/test-audit.md`);}
 if(behavior.continueTest){
  report.outcome='continue_test';report.summary='Test work remains for another session.';
  if(behavior.testChange!==false){writeFileSync(testPath,readFileSync(testPath,'utf8')+`// assertion ${s.activityId}\n`);changed.push(testPath);}
 }
 if(behavior.humanAction){
  if(behavior.beyondDelivery??true){if(!behavior.recordedHumanResult)report.afterDeliveryActions=[behavior.humanAction];}
  else{report.outcome='needs_you';report.needsYou=[{problem:`${behavior.humanAction} is due before delivery.`,action:'Perform it and record the result.'}];}
 }
 if(behavior.blocked){report.outcome='needs_you';report.needsYou=[{problem:'Required evidence is unavailable.',action:'Restore the named evidence.'}];}
 mkdirSync(dirname(s.requiredReportPath),{recursive:true});writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');
 command(`git add -- ${changed.join(' ')}`);command('git commit -m "docs(audit): record fixture audit"');command('git push origin HEAD');
 if(behavior.beforeSubmitFile){writeFileSync(behavior.beforeSubmitFile,'ready');while(!readFileSync(behavior.beforeSubmitFile,'utf8').includes('continue'))await new Promise(r=>setTimeout(r,20));}
 if(!behavior.skipSubmit){
  mkdirSync('.proof',{recursive:true});const current=invoke(['status']);
  writeFileSync('.proof/request.json',JSON.stringify({executionId:current.executionId,activityId:current.activityId,revision:current.revision,reportPath:current.requiredReportPath}));
  const id=toolCall('Bash',{command:pinned+' audit submit .proof/request.json'});
  try{toolResult(id,execFileSync(parts[0],[parts[1],'audit','submit','.proof/request.json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:125000}));}catch(error){toolResult(id,String(error.stdout)+String(error.stderr),true);}
 }
}
