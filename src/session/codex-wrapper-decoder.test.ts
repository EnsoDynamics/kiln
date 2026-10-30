import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeWrapper } from "./codex-wrapper-decoder.mjs";

it("decodes all twelve recorded screenshot-review note calls", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-audit-proof/store-load-wrappers.json", import.meta.url), "utf8")) as { calls: { call_id: string; input: string }[] };
  expect(fixture.calls).toHaveLength(12);
  for (const call of fixture.calls) {
    const result = decodeWrapper(call.call_id, call.input);
    expect(result.coverage).toBe("complete");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.name).toBe("view_image");
  }
});
it("inspects nested storage arguments and never treats loaded notes as established tool inputs", () => {
  const nested = decodeWrapper("nested", 'store("note", [await tools.exec_command({cmd:"git commit -m unexpected",workdir:"/outside"})]);');
  expect(nested.coverage).toBe("complete");
  expect(nested.operations[0]).toEqual({ name: "exec_command", input: {cmd:"git commit -m unexpected",workdir:"/outside"} });
  for (const code of ['store("note", await tools.unknown_writer({}));', 'await tools.exec_command(load("command"));', 'store("notes", [...load("notes"), await tools.unknown_writer({})]);', 'for (const x of load("commands")) await tools.exec_command(x);']) {
    expect(decodeWrapper("unknown", code).coverage).toBe("inconclusive");
  }
});
