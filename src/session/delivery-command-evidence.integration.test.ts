// Live provider proofs establish these contracts; failures here vary only retained history/results.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { historyFixture } from "../test-support/codex-history-fixture.js";
import { auditCodexConversation } from "./codex-evidence.js";
import { readTranscript } from "./transcripts.js";
const fixtures: ReturnType<typeof historyFixture>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });
function fixture() { const f = historyFixture(); fixtures.push(f); return f; }
const silent = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-audit-proof/silent-command-output-0.162.1.json", import.meta.url),"utf8")) as {item:{aggregatedOutput:null;exitCode:0}};
const at = (seconds: number) => new Date(Date.UTC(2026,9,24,12,0,seconds)).toISOString();

describe("authoritative delivery command provenance", () => {
  it("keeps Claude call/result identities and timestamps for repeated commands, errors and interrupted calls", () => {
    const f=fixture();const file=join(f.sandbox.root,"claude.jsonl");
    const lines: unknown[]=[];
    for(const [id,second,error] of [["first",0,false],["failed",2,true],["pending",4,undefined]] as const){
      lines.push({type:"assistant",timestamp:at(second),cwd:f.root,message:{content:[{type:"tool_use",name:"Bash",id,input:{command:"node verify.mjs source test-development"}}]}});
      if(error!==undefined)lines.push({type:"user",timestamp:at(second+1),message:{content:[{type:"tool_result",tool_use_id:id,is_error:error,content:error?"verification failed":"artifact checked"}]}});
    }
    writeFileSync(file,lines.map(one=>JSON.stringify(one)).join("\n"));const result=readTranscript(file);
    expect(result.problem).toBeUndefined();expect(result.calls.map(call=>({id:call.id,at:call.at,result:call.result}))).toEqual([
      {id:"first",at:at(0),result:{at:at(1),isError:false,text:"artifact checked"}},
      {id:"failed",at:at(2),result:{at:at(3),isError:true,text:"verification failed"}},
      {id:"pending",at:at(4),result:undefined},
    ]);
  });
  it.each(["qualified","silent output","missing result","ambiguous invocation","unrelated calls","undecodable required input","unsupported required input","unsupported exec parameters","missing unrelated command","invalid unrelated directory","malformed unrelated patch","empty unrelated patch","unsupported native command","unfinished unrelated command","unfinished unrelated write","malformed unrelated write","unsupported unrelated write","provider native search","invalid native directory","malformed raw write"] as const)("projects Codex's actual native command result without recycling an earlier success: %s",async mode=>{
    const f=fixture();const thread=f.addThread("parent",{command:"node verify.mjs source test-development",native:["/bin/zsh","-lc","node verify.mjs source test-development"]});
    const original=readFileSync(thread.metadata.path,"utf8").trim().split("\n").map(line=>JSON.parse(line) as {type:string;timestamp:string;payload:Record<string,unknown>});
    const prefix=original.filter(one=>!["response_item"].includes(one.type)&&one.payload.type!=="item_completed"&&one.payload.type!=="task_complete");
    const raw=[...prefix];const items:Record<string,unknown>[]=[];
    for(let i=0;i<2;i++){
      const second=i*2;const id=`native-${i}`;
      raw.push({type:"response_item",timestamp:at(second),payload:mode==="undecodable required input"?{type:"custom_tool_call",name:"exec",call_id:`call-${i}`,input:'await tools.exec_command({cmd:load("required-command")});'}:{type:"function_call",name:"exec_command",call_id:`call-${i}`,arguments:JSON.stringify({cmd:"node verify.mjs source test-development",...(mode==="unsupported required input"?{new_parameter:true}:{})})}});
      raw.push({type:"event_msg",timestamp:at(second+1),payload:{type:"item_completed",thread_id:"parent",turn_id:"parent-turn-0",...(mode!=="ambiguous invocation"?{started_at_ms:Date.parse(at(second))+10}:{}),item:{type:"CommandExecution",id,command:["/bin/zsh","-lc","node verify.mjs source test-development"],cwd:f.root,status:i===0?"completed":"failed"}}});
      items.push({type:"commandExecution",id,status:i===0?"completed":"failed",...(mode==="missing result"&&i===1?{}:{exitCode:i===0?0:1,aggregatedOutput:i===0?(mode==="silent output"?silent.item.aggregatedOutput:"actual earlier success"):"actual later failure"})});
    }
    raw.push({type:"event_msg",timestamp:at(5),payload:{type:"task_complete",turn_id:"parent-turn-0"}});writeFileSync(thread.metadata.path,raw.map(one=>JSON.stringify(one)).join("\n")+"\n");
    thread.turns[0]!.items=items;f.save();
    if(mode==="unrelated calls") {
      for(const [id,input] of [["display", 'text("read" + 1);'], ["browser", 'text(await tools.web__run({search_query:[{q:"example"}]}));'], ["dynamic-git", `text(await tools.exec_command({cmd:'git -C "$OTHER_CHECKOUT" commit -m external'}));`], ["stdin", 'text(await tools.write_stdin({session_id:7,chars:"x"}));']] as const) f.append("parent",f.record("response_item",{type:"custom_tool_call",name:"exec",call_id:id,input,internal_chat_message_metadata_passthrough:{turn_id:"parent-turn-0"}}));
    }
    if (mode === "unrelated calls") {
      for (let i=0;i<205;i++) f.append("parent",f.record("response_item",{type:"custom_tool_call",name:"apply_patch",call_id:`outside-${i}`,input:`*** Begin Patch\n*** Add File: ${join(f.outside, `unrelated-${i}.txt`)}\n+x\n*** End Patch`,internal_chat_message_metadata_passthrough:{turn_id:"parent-turn-0"}}));
    }
    const unrelatedCalls: Record<string, Record<string, unknown>> = {
      "unsupported exec parameters": {type:"function_call",name:"exec_command",arguments:JSON.stringify({cmd:"echo harmless",new_parameter:true})},
      "missing unrelated command": {type:"function_call",name:"exec_command",arguments:JSON.stringify({})},
      "invalid unrelated directory": {type:"function_call",name:"exec_command",arguments:JSON.stringify({cmd:"echo harmless",workdir:42})},
      "malformed unrelated patch": {type:"custom_tool_call",name:"apply_patch",input:"rejected patch"},
      "empty unrelated patch": {type:"custom_tool_call",name:"apply_patch",input:"*** Begin Patch\n*** End Patch"},
    };
    if (unrelatedCalls[mode]) f.append("parent",f.record("response_item",{...unrelatedCalls[mode],call_id:"unrelated",internal_chat_message_metadata_passthrough:{turn_id:"parent-turn-0"}}));
    if (mode === "unsupported native command" || mode === "unfinished unrelated command") {
      f.append("parent",f.record("event_msg",{type:"item_completed",thread_id:"parent",turn_id:"parent-turn-0",item:{type:"CommandExecution",id:"unrelated-native",command:mode === "unsupported native command"?[]:["/bin/zsh","-lc","echo pending"],cwd:f.root,status:mode === "unsupported native command"?"completed":"inProgress"}}));
      thread.turns[0]!.items.push({type:"commandExecution",id:"unrelated-native",status:mode === "unsupported native command"?"completed":"inProgress"});
    }
    if (["unfinished unrelated write","malformed unrelated write","unsupported unrelated write"].includes(mode)) {
      thread.turns[0]!.items.push({type:"fileChange",id:"unrelated-write",status:mode === "unfinished unrelated write"?"inProgress":"completed",...(mode === "malformed unrelated write"?{}:{changes:[{path:join(f.outside,"unrelated.txt"),kind:{type:mode === "unsupported unrelated write"?"future_operation":"add"}}]})});
    }
    if (mode === "provider native search") f.append("parent",f.record("response_item",{type:"web_search_call",id:"unrelated-search"}));
    if (mode === "invalid native directory") f.append("parent",f.record("event_msg",{type:"item_completed",thread_id:"parent",turn_id:"parent-turn-0",item:{type:"CommandExecution",id:"unrelated-native",command:["/bin/zsh","-lc","node verify.mjs source test-development"],cwd:"file://remote/other",status:"completed"}}));
    if (mode === "malformed raw write") f.append("parent",f.record("event_msg",{type:"item_completed",thread_id:"parent",turn_id:"parent-turn-0",started_at_ms:Date.parse(at(6)),item:{type:"FileChange",id:"unrelated-write",status:"completed",changes:{[join(f.outside,"unrelated.txt")]:null}}}));
    f.save();
    const result=await auditCodexConversation({...f.options,commandProjection:true});
    expect(result.coverage).toBe("complete");expect(result.problems).toEqual([]);
    if(mode==="ambiguous invocation"||mode==="undecodable required input"||mode==="unsupported required input")expect(result.commands??[]).toEqual([]);
    else expect(result.commands).toEqual([
      {source:"parent/parent-turn-0",callId:"native-0",command:"node verify.mjs source test-development",cwd:f.root,calledAt:at(0),resultAt:at(1),outcome:"success",exitCode:0,output:mode==="silent output"?"":"actual earlier success"},
      ...(mode==="missing result"?[]:[{source:"parent/parent-turn-0",callId:"native-1",command:"node verify.mjs source test-development",cwd:f.root,calledAt:at(2),resultAt:at(3),outcome:"error",exitCode:1,output:"actual later failure"}]),
    ]);
  });
});

// The recorded 0.162.1 yielded-exec wait, replayed with command projection beside three
// commands, then mutated the ways newer Codex versions change their tool inputs (AC-AGENT-01, 07).
describe("Codex command evidence across newer tool inputs", () => {
  const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-audit-proof/yielded-exec-wait-0.162.1.json", import.meta.url), "utf8")) as { raw: { type: string; payload: Record<string, unknown> } };
  const commands = { direct: "node verify.mjs direct", workdir: "node verify.mjs workdir", cell: "node verify.mjs cell" };
  type Mutation = { direct?: Record<string, unknown>; image?: Record<string, unknown>; wait?: Record<string, unknown>; record?: { type: string; payload: Record<string, unknown> } };
  async function replay(mutation: Mutation = {}) {
    const f = fixture(); const thread = f.addThread("parent", { command: "unused", native: ["/bin/zsh", "-lc", "unused"] });
    const prefix = readFileSync(thread.metadata.path, "utf8").trim().split("\n").map(line => JSON.parse(line) as { type: string; timestamp: string; payload: Record<string, unknown> })
      .filter(one => one.type !== "response_item" && one.payload.type !== "item_completed" && one.payload.type !== "task_complete");
    const turn = { internal_chat_message_metadata_passthrough: { turn_id: "parent-turn-0" } };
    const image = { path: "/PROOF/image.png", ...mutation.image };
    const calls = [
      { id: "direct", command: commands.direct, payload: { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: commands.direct, shell: "/bin/zsh", yield_time_ms: 10000, ...mutation.direct }) } },
      { id: "workdir", command: commands.workdir, payload: { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: commands.workdir, workdir: ".", login: true, max_output_tokens: 2000 }) } },
      { id: "cell", command: commands.cell, payload: { type: "custom_tool_call", name: "exec", input: `image(await tools.view_image(${JSON.stringify(image)})); text(await tools.exec_command({cmd:${JSON.stringify(commands.cell)},yield_time_ms:1000}));` } },
    ];
    const raw = [...prefix]; const items: Record<string, unknown>[] = [];
    calls.forEach(({ id, command, payload }, i) => {
      raw.push({ type: "response_item", timestamp: at(i * 3), payload: { ...payload, call_id: id, ...turn } });
      raw.push({ type: "event_msg", timestamp: at(i * 3 + 1), payload: { type: "item_completed", thread_id: "parent", turn_id: "parent-turn-0", started_at_ms: Date.parse(at(i * 3)) + 10, item: { type: "CommandExecution", id: `${id}-native`, command: ["/bin/zsh", "-lc", command], cwd: f.root, status: "completed" } } });
      items.push({ type: "commandExecution", id: `${id}-native`, status: "completed", exitCode: 0, aggregatedOutput: `${id} output` });
    });
    const wait = mutation.wait ? { ...recorded.raw.payload, arguments: JSON.stringify({ ...JSON.parse(recorded.raw.payload.arguments as string), ...mutation.wait }) } : recorded.raw.payload;
    raw.push({ type: recorded.raw.type, timestamp: at(10), payload: { ...wait, ...turn } });
    if (mutation.record) raw.push({ ...mutation.record, timestamp: at(11) });
    raw.push({ type: "event_msg", timestamp: at(12), payload: { type: "task_complete", turn_id: "parent-turn-0" } });
    writeFileSync(thread.metadata.path, raw.map(one => JSON.stringify(one)).join("\n") + "\n");
    thread.turns[0]!.items = items; f.save();
    return { f, result: await auditCodexConversation({ ...f.options, commandProjection: true }) };
  }
  const receipt = (f: ReturnType<typeof fixture>, id: keyof typeof commands, second: number) => ({ source: "parent/parent-turn-0", callId: `${id}-native`, command: commands[id], cwd: f.root, calledAt: at(second), resultAt: at(second + 1), outcome: "success", exitCode: 0, output: `${id} output` });

  it("gives every recorded command its receipt beside the recorded wait", async () => {
    const { f, result } = await replay();
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.compatibility).toBeUndefined();
    expect(result.commands).toEqual([receipt(f, "direct", 0), receipt(f, "workdir", 3), receipt(f, "cell", 6)]);
  });
  it("withholds only the receipt of a call with an exec_command parameter Kiln doesn't recognise, and names the parameter", async () => {
    const { f, result } = await replay({ direct: { environment_id: "remote-sandbox" } });
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete");
    expect(result.commands).toEqual([receipt(f, "workdir", 3), receipt(f, "cell", 6)]);
    expect(result.compatibility).toEqual(["exec_command parameter environment_id is not recognised, so that command has no receipt"]);
    // The detail names the parameter, never its value or the command.
    expect(JSON.stringify(result.compatibility)).not.toContain("remote-sandbox");
    expect(JSON.stringify(result.compatibility)).not.toContain(commands.direct);
  });
  it("keeps the receipt of a call carrying additional_permissions from exec_permission_approvals", async () => {
    const { f, result } = await replay({ direct: { sandbox_permissions: "with_additional_permissions", additional_permissions: { file_system: { write: ["/proof/reports"] } }, justification: "write the report", prefix_rule: ["node", "verify.mjs"], tty: false } });
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.compatibility).toBeUndefined();
    expect(result.commands).toEqual([receipt(f, "direct", 0), receipt(f, "workdir", 3), receipt(f, "cell", 6)]);
  });
  it("keeps a cell's command receipt when its earlier view_image call carries parameters Kiln doesn't read", async () => {
    const { f, result } = await replay({ image: { environment_id: "local", future_image_option: { opaque: true } } });
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.compatibility).toBeUndefined();
    expect(result.commands).toEqual([receipt(f, "direct", 0), receipt(f, "workdir", 3), receipt(f, "cell", 6)]);
  });
  it("changes nothing when the recorded wait carries terminate and a parameter Kiln doesn't read", async () => {
    const { f, result } = await replay({ wait: { terminate: true, future_wait_option: "opaque" } });
    expect(result.problems).toEqual([]); expect(result.coverage).toBe("complete"); expect(result.compatibility).toBeUndefined();
    expect(result.commands).toEqual([receipt(f, "direct", 0), receipt(f, "workdir", 3), receipt(f, "cell", 6)]);
  });
  it("refuses all evidence on a record type Kiln doesn't recognise and names the type", async () => {
    const { result } = await replay({ record: { type: "future_record", payload: { opaque: "user text" } } });
    expect(result.coverage).toBe("inconclusive");
    expect(result.compatibility).toEqual(["history record type future_record is not recognised"]);
    expect(JSON.stringify(result.compatibility)).not.toContain("user text");
  });
});
