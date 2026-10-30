// The actual HTTP server, CLI client, private record and temporary Git workspaces.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { startLocalServer, type LocalServer } from "./local-server.js";
import { isPortFree } from "../state/instance-lock.js";
import { runDelivery } from "../delivery-command.js";
import { readPrdRecord } from "../state/records.js";
import * as records from "../state/records.js";
import { git } from "../test-support/git-repositories.js";
let h:Harness|undefined;let server:LocalServer|undefined;
afterEach(async()=>{await server?.close();server=undefined;await h?.cleanup();h=undefined;});
const target={repository:"github.com/acme/acme-shop",baseBranch:"develop",environment:"test-development"};
async function setup(){h=await createHarness({sessions:[landingSession()]});for(let port=41600;port<41630;port++)if(await isPortFree(port)){server=await startLocalServer({engine:h.engine,port,folderName:"customer-returns",featureName:"Customer returns",token:h.engine.record.token});return{h,origin:`http://127.0.0.1:${port}`,port};}throw new Error("No test port");}
describe("development delivery HTTP and CLI authority",()=>{
  it("authenticates every delivery route and atomically persists revisions through the real CLI",async()=>{
    const{h,origin,port}=await setup();
    await h.engine.changeSettings({developmentDeployments:{enabled:true,targets:[{target,confirmedTarget:target,confirmedNonProduction:true}]}});await h.engine.start({refinementConfirmed:true});await h.engine.settled();
    const headers={"X-Kiln-Token":h.engine.record.token,Origin:origin,"Content-Type":"application/json"};
    expect((await fetch(`${origin}/api/delivery`)).status).toBe(403);
    for(const route of ["assessment","prepare","evidence"]){
      expect((await fetch(`${origin}/api/delivery/${route}`,{method:"POST",headers:{...headers,Origin:"https://other.example"},body:"{}"})).status).toBe(403);
      expect((await fetch(`${origin}/api/delivery/${route}`,{method:"POST",headers:{...headers,"X-Kiln-Token":"bad"},body:"{}"})).status).toBe(403);
    }
    const status=await(await fetch(`${origin}/api/delivery`,{headers})).json() as {executionId:string;revision:number;documentsDigest:string};
    const body={executionId:status.executionId,revision:status.revision,phaseId:"1",documentsDigest:status.documentsDigest,required:false,criteria:[],reason:"No acceptance criterion needs development delivery.",checkpoints:[]};
    expect((await fetch(`${origin}/api/delivery/assessment`,{method:"POST",headers,body:JSON.stringify({...body,executionId:"other"})})).status).toBe(409);
    // An authenticated live server is sufficient; no process-inspection permission is needed in a provider sandbox.
    writeFileSync(join(h.stateDirectory,"instance.lock"),JSON.stringify({port}));const file=join(h.engine.worktreePath,"delivery-assessment.json");writeFileSync(file,JSON.stringify(body));
    let stdout="";let stderr="";const client={cwd:h.engine.worktreePath,env:h.env,stdout:{write:(text:string)=>stdout+=text},stderr:{write:(text:string)=>stderr+=text}};
    expect(await runDelivery(["assess",file],client)).toBe(0);expect(stderr).toBe("");expect(JSON.parse(stdout).revision).toBe(status.revision+1);
    expect(readPrdRecord(h.stateDirectory)!.developmentDelivery!.assessments[0]?.reason).toBe(body.reason);
    expect(await runDelivery(["assess",file],client)).toBe(1);
    const malformed = await h.engine.deliveryCommand("assessment",{...body,revision:status.revision+1,split:{phaseId:"1",documentsDigest:body.documentsDigest,assignments:[{checkpointId:"missing",requirementId:"requiredMerge",originPhaseId:"1",criteria:["AC-RET-01"],leafIds:["1"]}]}});
    expect(malformed).toMatchObject({ok:false,reason:expect.stringContaining("Invalid schema-5")});
    expect(h.engine.record.developmentDelivery!.splits).toEqual([]);expect(readPrdRecord(h.stateDirectory)).toBeDefined();
    // A failed atomic rename cannot return proceed or retain an in-memory ledger mutation.
    const before=structuredClone(h.engine.record.developmentDelivery);const record=join(h.stateDirectory,"prd.json");renameSync(record,`${record}.saved`);mkdirSync(record);
    try{expect(await h.engine.deliveryCommand("assessment",{...body,revision:status.revision+1})).toMatchObject({ok:false});expect(h.engine.record.developmentDelivery).toEqual(before);}finally{rmSync(record,{recursive:true});renameSync(`${record}.saved`,record);}
  });
  it.each([false, true])("rolls back Start target materialization on atomic failure (legacy=%s)", async legacy => {
    const { h } = await setup();
    const choices = { enabled: true, targets: legacy ? [{ target, confirmedTarget: target, confirmedNonProduction: true }] : [] };
    expect(await h.engine.changeSettings({ developmentDeployments: structuredClone(choices) })).toEqual({ ok: true });
    const recordPath = join(h.stateDirectory, "prd.json");
    const original = records.writePrdRecord;
    let failedAtStart = false;
    let materializedTargets: unknown;
    const write = vi.spyOn(records, "writePrdRecord").mockImplementation((directory, record) => {
      if (directory === h.stateDirectory && record.startedAt && !failedAtStart) {
        materializedTargets = structuredClone(record.settings.developmentDeployments?.targets.map(one => one.target));
        renameSync(recordPath, `${recordPath}.saved`); mkdirSync(recordPath);
        failedAtStart = true;
      }
      return original(directory, record);
    });
    try {
      expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, reason: expect.stringContaining("Start could not be saved") });
      expect(failedAtStart).toBe(true);
      expect(materializedTargets).toEqual([legacy ? target : { repository: target.repository, baseBranch: "develop" }]);
      expect(h.engine.record.settings.developmentDeployments).toEqual(choices);
      expect(h.engine.record.startedAt).toBeUndefined();
      expect(h.engine.record.developmentAuthorization).toMatchObject({ enabled: false, grants: [] });
      expect(h.claudeCalls()).toEqual([]);
    } finally {
      write.mockRestore();
      if (failedAtStart) { rmSync(recordPath, { recursive: true }); renameSync(`${recordPath}.saved`, recordPath); }
    }
    if (!legacy) {
      git(h.sandbox, h.repository, "push", "origin", "develop:preview");
      expect(await h.engine.changeSettings({ baseBranch: "preview" })).toEqual({ ok: true });
      expect(h.engine.record.settings.developmentDeployments?.targets).toEqual([]);
    }
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true }); await h.engine.settled();
    expect(readPrdRecord(h.stateDirectory)!.developmentAuthorization?.grants.map(one => one.target)).toEqual([legacy ? target : { repository: target.repository, baseBranch: "preview" }]);
  });
});
