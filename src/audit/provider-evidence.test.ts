import { describe, expect, it } from "vitest";
import { codexDelegationReceiver } from "./provider-evidence.js";

// Observed Codex 0.162.1 contract: spawn returns a canonical task name; followup_task
// acknowledges with an explicit empty string. Full provider proof retains raw histories.
const invocation = (id: string, name: string, args: Record<string, unknown>, turn = "owned") => ({ type: "response_item", payload: { type: "function_call", namespace: "collaboration", name, call_id: id, arguments: JSON.stringify(args), internal_chat_message_metadata_passthrough: { turn_id: turn } } });
const output = (id: string, value: string) => ({ type: "response_item", payload: { type: "function_call_output", call_id: id, output: value } });
describe("Codex assessment receiver provenance", () => {
  it.each(["assessment", "/root/assessment"])("binds an empty follow-up acknowledgement through the prior observed spawn (%s)", target => {
    const spawn = invocation("spawn", "spawn_agent", { task_name: "assessment", message: "opaque initial task" });
    const follow = invocation("follow", "followup_task", { target, message: "opaque corrected task" });
    const rows = [spawn, output("spawn", '{"task_name":"/root/assessment"}'), follow, output("follow", "")];
    expect(codexDelegationReceiver(rows, follow, new Set(["owned"]))).toBe("/root/assessment");
  });
  it.each(["missing acknowledgement", "wrong target", "unowned spawn", "missing spawn output", "later spawn", "empty spawn"])("does not infer a receiver from %s", mode => {
    const spawn = invocation("spawn", "spawn_agent", { task_name: "assessment" }, mode === "unowned spawn" ? "foreign" : "owned");
    const follow = invocation("follow", "followup_task", { target: mode === "wrong target" ? "other" : "assessment" });
    const spawnOutput = output("spawn", mode === "empty spawn" ? "" : '{"task_name":"/root/assessment"}');
    const rows = mode === "later spawn" ? [follow,output("follow",""),spawn,spawnOutput] : [spawn,...(mode === "missing spawn output" ? [] : [spawnOutput]),follow,...(mode === "missing acknowledgement" ? [] : [output("follow","")])];
    expect(codexDelegationReceiver(rows,follow,new Set(["owned"]))).toBeUndefined();
  });
  it("rejects ambiguous aliases and malformed nonempty acknowledgements", () => {
    const first=invocation("one","spawn_agent",{task_name:"assessment"}),second=invocation("two","spawn_agent",{task_name:"assessment"}),follow=invocation("follow","followup_task",{target:"assessment"});
    const rows=[first,output("one",'{"task_name":"/root/assessment"}'),second,output("two",'{"task_name":"/root/other"}'),follow,output("follow","")];
    expect(()=>codexDelegationReceiver(rows,follow,new Set(["owned"]))).toThrow(/Ambiguous/);
    expect(()=>codexDelegationReceiver([follow,output("follow","not-json")],follow,new Set(["owned"]))).toThrow();
  });
});
