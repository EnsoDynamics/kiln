import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonLineSplitter, jsonLines } from "./json-lines.js";

describe("JSON Lines splitting", () => {
  it("ends lines only at \\n, keeping U+2028/U+2029 and multibyte characters split across chunks", async () => {
    const records = [{ text: "a\u2028b\u2029c" }, { text: "é".repeat(5) }, {}];
    const bytes = Buffer.from(records.map(record => JSON.stringify(record)).join("\n"));
    const chunks = Array.from({ length: bytes.length }, (_, index) => bytes.subarray(index, index + 1));
    const lines: string[] = []; for await (const line of jsonLines(Readable.from(chunks))) lines.push(line);
    expect(lines.map(line => JSON.parse(line))).toEqual(records);
  });
  it("returns complete lines as they arrive and an unterminated final line at the end", () => {
    const lines = new JsonLineSplitter();
    expect(lines.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(lines.push(":2}\n\n")).toEqual(['{"b":2}', ""]);
    expect(lines.push("tail")).toEqual([]); expect(lines.end()).toEqual(["tail"]);
  });
});
