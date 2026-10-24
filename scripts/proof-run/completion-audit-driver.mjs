// Mechanical report assembly for the actual-provider proof; all evidence IDs come from Kiln.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync('.proof/manifest.json','utf8'));
const action=process.argv[2];
function cli(args){return JSON.parse(execFileSync(process.execPath,[manifest.cli,'audit',...args],{encoding:'utf8',timeout:130000}));}
function status(){let current=cli(['status']);let evidence=[...current.evidence];while(current.nextCursor){const next=cli(['status',current.nextCursor]);evidence.push(...next.evidence);current={...current,nextCursor:next.nextCursor};}return {...current,evidence};}
function mutate(name,body){const s=status();writeFileSync('.proof/request.json',JSON.stringify({executionId:s.executionId,activityId:s.activityId,revision:s.revision,...body}));return cli([name,'.proof/request.json']);}
if(action==='status')console.log(JSON.stringify(status(),null,2));
else if(action==='snapshot'){const s=mutate('snapshot',{testPaths:[],evidencePaths:[]});writeFileSync('.proof/snapshot.json',JSON.stringify(s));console.log(JSON.stringify(s,null,2));}
else if(action==='write-report'){
 const s=status();const snapshot=JSON.parse(readFileSync('.proof/snapshot.json','utf8'));const criterion=snapshot.requirements.criteria[0];
 const evidence=(kind,purpose)=>{const matches=s.evidence.filter(e=>e.kind===kind&&(!purpose||e.assessment?.purpose===purpose&&e.assessment.snapshotId===snapshot.snapshotId));if(!matches.length)throw new Error(`No real ${kind}/${purpose??''} evidence yet`);return matches.at(-1).evidenceId;};
 const code=snapshot.repositories[0].files['value.mjs'];
 const report={schemaVersion:1,executionId:s.executionId,activityId:s.activityId,kind:s.kind,round:s.round,continuationIndex:s.continuationIndex,scope:{repository:'audit-proof',path:'docs/prds/audit-proof/audit-proof-prd.md',kind:'whole_prd',manifestId:snapshot.requirements.id,criterionKeys:[criterion.key]},checkedSnapshotId:snapshot.snapshotId,criteria:[{criterionKey:criterion.key,parts:[{id:'value',quote:criterion.content,startLine:criterion.startLine,endLine:criterion.endLine,applicability:'current',code:[{repository:'audit-proof',path:'value.mjs',blob:code.blob}],tests:[]}],assessmentEvidenceIds:[evidence('assessment','assessment')],findings:[],blockerIds:[],deliveryStatus:'implemented'}],methodEvidence:{skillEvidenceId:evidence('skill'),assessmentEvidenceIds:[evidence('assessment','assessment')],reviewEvidenceIds:[evidence('assessment','review')]},completionPhases:[],pendingHumanActions:[],blockers:[],outcome:'passed'};
 writeFileSync(s.requiredReportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({reportPath:s.requiredReportPath}));
}else if(action==='submit'){const s=status();console.log(JSON.stringify(mutate('submit',{reportPath:s.requiredReportPath}),null,2));}
else throw new Error('status | snapshot | write-report | submit');
