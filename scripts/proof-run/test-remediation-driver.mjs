// Mechanical report assembly for real-provider test remediation. Never supplies audit judgment.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('.proof/manifest.json','utf8'));
const cli=(...args)=>JSON.parse(execFileSync(process.execPath,[manifest.cli,'audit',...args],{encoding:'utf8',timeout:125000}));
const status=()=>{const s=cli('status');let cursor=s.nextCursor;while(cursor){const p=cli('status',cursor);s.evidence.push(...p.evidence);cursor=p.nextCursor;}return s;};
const action=process.argv[2],s=status(),snap=s.currentSnapshot;
const currentFile=path=>({repository:snap.requirements.repository,path,blob:execFileSync('git',['hash-object','--',path],{encoding:'utf8'}).trim()});
if(action==='status')console.log(JSON.stringify({...s,fixtureFiles:[currentFile('value.test.mjs'),currentFile('package.json')]},null,2));
else if(action==='snapshot'){
 const a=s.evidence.findLast(e=>e.kind==='assessment'&&e.assessment.purpose==='test_classification'&&e.assessment.testPaths.some(p=>p.path==='value.test.mjs'&&p.blob===currentFile(p.path).blob));
 if(!a)throw new Error('Current independent test-only classification is required');
 const test=a.assessment.testPaths.find(p=>p.path==='value.test.mjs');
 const request={executionId:s.executionId,activityId:s.activityId,revision:s.revision,testPaths:[{...test,configuration:a.assessment.configurationFiles,selectors:['value.test.mjs'],runEvidenceIds:a.assessment.verificationEvidenceIds,assessmentEvidenceId:a.evidenceId,shared:false}],evidencePaths:[]};
 writeFileSync('.proof/request.json',JSON.stringify(request));console.log(JSON.stringify(cli('snapshot','.proof/request.json')));
}else if(action==='write-report'){
 if(s.kind==='delivery_audit'||s.continuationIndex>1){execFileSync(process.execPath,['audit-driver.mjs','write-report'],{stdio:'inherit'});}
 else{
  const find=purpose=>{const a=s.evidence.findLast(e=>e.kind==='assessment'&&e.assessment.purpose===purpose&&e.assessment.snapshotId===snap.id);if(!a)throw new Error('Missing independent '+purpose);return a.evidenceId;};
  const skill=s.evidence.findLast(e=>e.kind==='skill'&&e.sessionId===s.evidence.find(e=>e.evidenceId===find('assessment')).sessionId);if(!skill)throw new Error('Missing skill');
  const runs=s.evidence.filter(e=>e.sessionId===skill.sessionId&&e.conversationId===skill.conversationId&&e.command?.invocation==='node value.test.mjs'&&e.command.startedAt>=snap.createdAt);
  if(runs.length<2||runs.some(e=>e.command.outcome!=='success'))throw new Error('Need observed baseline and final');
  const c=snap.requirements.criteria[0],nextBatch='Replace the typeof-only check with assert.equal(value(),42), run the real red check and independent re-grade.';
  const report={schemaVersion:1,executionId:s.executionId,activityId:s.activityId,kind:s.kind,round:s.round,continuationIndex:s.continuationIndex,scope:{repository:snap.requirements.repository,path:snap.requirements.path,kind:'whole_prd',manifestId:snap.requirements.id,criterionKeys:[c.key]},checkedSnapshotId:snap.id,criteria:[{criterionKey:c.key,parts:[{id:'value',quote:c.content,startLine:c.startLine,endLine:c.endLine,applicability:'current',code:[{repository:snap.requirements.repository,path:'value.mjs',blob:snap.repositories[0].files['value.mjs'].blob}],tests:[]}],assessmentEvidenceIds:[find('assessment')],findings:[{partIds:['value'],missing:'The typeof check cannot detect an incorrect return value.',evidenceIds:[]}],blockerIds:[],testAssessment:{grade:'weak'}}],methodEvidence:{skillEvidenceId:skill.evidenceId,assessmentEvidenceIds:[find('assessment')],reviewEvidenceIds:[find('review')],baselineRunEvidenceIds:[runs[0].evidenceId],finalRunEvidenceIds:[runs.at(-1).evidenceId],redChecks:[]},completionPhases:[],nextTestBatch:{criterionKeys:[c.key],recordPath:snap.requirements.path.replace(/[^/]+$/,'test-audit.md'),nextBatch},pendingHumanActions:[],blockers:[],outcome:'continue_test'};
  writeFileSync(report.nextTestBatch.recordPath,'# Test audit\n\nAC-PROOF-01: Weak. The test does not assert the required value.\n\n## Next batch\n'+nextBatch+'\n');writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportPath:s.requiredReportPath}));
 }
}else if(action==='submit'){writeFileSync('.proof/request.json',JSON.stringify({executionId:s.executionId,activityId:s.activityId,revision:s.revision,reportPath:s.requiredReportPath}));console.log(JSON.stringify(cli('submit','.proof/request.json'),null,2));}
else throw new Error('status | snapshot | write-report | submit');
