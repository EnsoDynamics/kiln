// Standing guard against exact agent version pins (AC-AGENT-01; technical design, Standing guard
// against new exact pins). Every requirement on agent tooling is a minimum held in
// tooling-minimums.ts, so a version literal anywhere else in what Kiln runs or tells people and
// agents is a pin. TypeScript and JavaScript are read through their syntax tree, so only string,
// template and regular expression literals count and a comment recording where a behaviour was
// observed stays. Other files (command contracts, prompt texts, PowerShell) are read whole.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SCANNED = ["src", "scripts", "prompts"];
const MINIMUMS = "src/agents/tooling-minimums.ts";

/**
 * Three dot-separated whole numbers, each dot optionally escaped with a backslash, not part of
 * a longer dotted number: `2.1.311` and `/^2\.1\.311/` count; `127.0.0.1` in either form does not.
 */
const VERSION = /(?<![\d.\\])(?<!\d\\\.)(?<!\d\.)\d+\\?\.\d+\\?\.\d+(?!\\?\.\d)(?!\d)/g;

/** A file and the exact literal it may carry, each with its reason. Any other version in these files still fails. */
const EXEMPT: { file: string; literal: string; reason: string }[] = [
  { file: "src/session/codex-evidence.ts", literal: "0.162.1", reason: "the saved audit profile codex-0.162.1-static-v1 that older records carry" },
  { file: "src/control/server.ts", literal: "1.0.0", reason: "Kiln's own version, in kiln_version" },
  { file: "src/agents/codex-metadata-rpc.ts", literal: "1.0.0", reason: "Kiln's own version, in its Codex app-server clientInfo" },
  { file: "src/session/codex-history-rpc.ts", literal: "1.0.0", reason: "Kiln's own version, in its Codex app-server clientInfo" },
  { file: "src/session/codex-work-rpc.ts", literal: "1.0.0", reason: "Kiln's own version, in its Codex app-server clientInfo" },
  { file: "scripts/proof-run/codex-rpc.mjs", literal: "0.1.0", reason: "the audit proof peer's own identity" },
  { file: "scripts/proof-run/codex-launch-probe-proof.mjs", literal: "1.0.0", reason: "the launch probe MCP server's own identity" },
];

const CODE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

function files(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const scanned = (path: string) => {
  const file = relative(root, path).split("\\").join("/");
  return !/\.test\./.test(file) && !file.startsWith("src/test-support/") && !file.startsWith("test/fixtures/") && file !== MINIMUMS;
};

/** The text a file states: its literals for code, all of it otherwise. */
function statedText(path: string, text: string): string[] {
  if (!CODE.has(extname(path))) return [text];
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, /\.m?jsx?$|\.cjs$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const literals: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literals.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

const versionLiterals = (text: string) => [...text.matchAll(VERSION)].map(match => match[0].split("\\").join(""));

it("finds version literals in their plain and escaped forms, and no dotted address", () => {
  expect(versionLiterals("needs 2.1.311 or /^2\\.1\\.311(?:\\s|$)/ and codex-0.162.1-static-v1")).toEqual(["2.1.311", "2.1.311", "0.162.1"]);
  expect(versionLiterals("http://127.0.0.1:4100 and /127\\.0\\.0\\.1/ and 2.1 and 10.0.0.0.1")).toEqual([]);
  expect(statedText("a.ts", "// observed on 2.1.307\nconst a = \"x\"; /* 2.1.308 */ const b = `v${a}2.1.309`; const c = /2\\.1\\.310/;").flatMap(versionLiterals)).toEqual(["2.1.309", "2.1.310"]);
  expect(statedText("a.json", "{\"limits\": \"2.1.311 only\"}").flatMap(versionLiterals)).toEqual(["2.1.311"]);
});

/** Each version literal a file states that its exemption doesn't name exactly. */
const pins = (file: string, text: string) => statedText(file, text).flatMap(versionLiterals).filter(literal => !EXEMPT.some(exempt => exempt.file === file && exempt.literal === literal)).map(literal => `${file}: ${literal}`);

it("exempts only the named literal in the named file", () => {
  expect(pins("src/control/server.ts", "const v = \"1.0.0\";")).toEqual([]);
  expect(pins("src/control/server.ts", "const v = \"2.1.311\";")).toEqual(["src/control/server.ts: 2.1.311"]);
  expect(pins("src/engine/engine.ts", "const v = \"1.0.0\";")).toEqual(["src/engine/engine.ts: 1.0.0"]);
  expect(pins("src/engine/engine.ts", "if (/^2\\.1\\.311(?:\\s|$)/.test(out)) live();")).toEqual(["src/engine/engine.ts: 2.1.311"]);
});

it("states no exact agent version outside the minimums module (AC-AGENT-01)", () => {
  const found: string[] = [];
  for (const path of SCANNED.flatMap(directory => files(join(root, directory))).filter(scanned)) found.push(...pins(relative(root, path).split("\\").join("/"), readFileSync(path, "utf8")));
  expect(found, "Requirements on agent tooling are minimums in src/agents/tooling-minimums.ts; compare with compareToMinimum instead of an exact version.").toEqual([]);
});
