// Mechanical fixture report writer. Judgments and verification IDs must come from real assessors.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('.proof/manifest.json','utf8'));
const cli=(...args)=>JSON.parse(execFileSync(process.execPath,[manifest.cli,'audit',...args],{encoding:'utf8',timeout:125000}));
function status(){const s=cli('status');let cursor=s.nextCursor;while(cursor){const page=cli('status',cursor);s.evidence.push(...page.evidence);cursor=page.nextCursor;}return s;}
const action=process.argv[2];
const s=status();
if(action==='status')console.log(JSON.stringify(s,null,2));
else if(action==='write-report'){
 const snap=s.currentSnapshot;const c=snap.requirements.criteria[0];
 const find=(purpose)=>{const e=s.evidence.findLast(e=>e.kind==='assessment'&&e.assessment.purpose===purpose&&e.assessment.snapshotId===snap.id);if(!e)throw new Error(`No independent ${purpose}`);return e.evidenceId;};
 const skill=s.evidence.findLast(e=>e.kind==='skill');if(!skill)throw new Error('Skill was not loaded');
 const codePath=manifest.codePath??'value.mjs';const testPath=manifest.testPath??'value.test.mjs';
 const code={repository:snap.requirements.repository,path:codePath,blob:snap.repositories[0].files[codePath].blob};
 const test={repository:snap.requirements.repository,path:testPath,blob:snap.repositories[0].files[testPath].blob};
 const owningSession=skill.sessionId;
 const runs=s.evidence.filter(e=>e.sessionId===owningSession&&e.conversationId===skill.conversationId&&e.kind==='command'&&e.command.invocation===`node ${testPath}`&&e.command.startedAt>=snap.createdAt);
 const green=runs.filter(e=>e.command.outcome==='success');const red=runs.filter(e=>e.command.outcome==='error');
 const mutations=s.evidence.filter(e=>e.sessionId===owningSession&&e.conversationId===skill.conversationId&&e.kind==='mutation'&&e.mutation.paths.some(p=>p.replaceAll('\\','/').endsWith('/value.mjs')));
 const tests=s.kind==='test_audit';
 if(tests&&(green.length<2||red.length!==2||mutations.length<2))throw new Error('Need real baseline, two red failures, restoration and final pass');
 const report={schemaVersion:1,executionId:s.executionId,activityId:s.activityId,kind:s.kind,round:s.round,continuationIndex:s.continuationIndex,scope:{repository:snap.requirements.repository,path:snap.requirements.path,kind:'whole_prd',manifestId:snap.requirements.id,criterionKeys:[c.key]},checkedSnapshotId:snap.id,criteria:[{criterionKey:c.key,parts:[{id:'value',quote:c.content,startLine:c.startLine,endLine:c.endLine,applicability:'current',code:[code],tests:tests?[{file:test,selector:testPath,runEvidenceIds:[green.at(-1).evidenceId],runtime:{kind:'checkout'}}]:[]}],assessmentEvidenceIds:[find('assessment')],findings:[],blockerIds:[],...(tests?{testAssessment:{grade:'adequate'}}:{deliveryStatus:'implemented'})}],methodEvidence:{skillEvidenceId:skill.evidenceId,assessmentEvidenceIds:[find('assessment')],reviewEvidenceIds:[find('review')],...(tests?{baselineRunEvidenceIds:[green[0].evidenceId],finalRunEvidenceIds:[green.at(-1).evidenceId],redChecks:[{partIds:['value'],mutationEvidenceIds:[mutations[0].evidenceId],failingRunEvidenceIds:red.map(e=>e.evidenceId),restorationEvidenceIds:[mutations.at(-1).evidenceId],passingRunEvidenceId:green.at(-1).evidenceId}],regradeEvidenceIds:[find('regrade')]}:{})},completionPhases:[],pendingHumanActions:[],blockers:[],outcome:'passed'};
 writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportPath:s.requiredReportPath}));
}else if(action==='submit'){writeFileSync('.proof/request.json',JSON.stringify({executionId:s.executionId,activityId:s.activityId,revision:s.revision,reportPath:s.requiredReportPath}));console.log(JSON.stringify(cli('submit','.proof/request.json'),null,2));}
else throw new Error('status | write-report | submit');
