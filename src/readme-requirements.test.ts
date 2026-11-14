// The README states the same minimums Kiln enforces (AC-AGENT-05, AC-SYNC-01), each worded as a
// minimum, and the package's engines field agrees. The minimums module is the one source.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayMinimum, TOOLING_MINIMUMS, toolName, type Tool } from "./agents/tooling-minimums.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; engines: { node: string } };
const tools = Object.keys(TOOLING_MINIMUMS) as Tool[];
/** "Node.js" and "Node" both name Node.js in prose. */
const spellings: Record<Tool, string> = { node: "Node(?:\\.js)?", git: "Git", claudeCode: "Claude Code", codex: "Codex", powershell: "PowerShell" };

function section(heading: string): string {
  const start = readme.indexOf(`\n## ${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const end = readme.indexOf("\n## ", start + 1);
  return readme.slice(start, end < 0 ? undefined : end);
}

/** Every "<tool> <version>" in the text, with what follows it. */
function statements(text: string): { tool: Tool; version: string; after: string }[] {
  return tools.flatMap(tool => [...text.matchAll(new RegExp(`(?<![\\w-])${spellings[tool]} (\\d+\\.\\d+(?:\\.\\d+)?)(?![\\d.]*\\d)(.{0,9})`, "g"))].map(m => ({ tool, version: m[1]!, after: m[2]! })));
}

describe("the README's requirements", () => {
  it("state every minimum in the minimums module, in the requirements table", () => {
    const table = section("Requirements").split("\n").filter(line => line.startsWith("|"));
    for (const tool of tools) {
      const row = table.find(line => new RegExp(`${displayMinimum(tool).replace(/\./g, "\\.")} or later`).test(line) && new RegExp(`(?<![\\w-])${spellings[tool]}(?![\\w-])`).test(line));
      expect(row, `${toolName(tool)} ${displayMinimum(tool)} or later`).toBeDefined();
    }
  });

  it("word every stated version as the enforced minimum, or later, throughout, development instructions included", () => {
    const found = statements(readme);
    for (const tool of ["node", "git"] as Tool[]) expect(statements(section("Development")).map(s => s.tool), toolName(tool)).toContain(tool);
    expect(found.length).toBeGreaterThanOrEqual(tools.length);
    for (const { tool, version, after } of found) {
      expect(version.replace(/\.0$/, ""), `${toolName(tool)} ${version}`).toBe(displayMinimum(tool));
      expect(after, `${toolName(tool)} ${version}`).toMatch(/^ or later/);
    }
  });

  it("never call a requirement a stable-only version", () => {
    expect(section("Requirements")).not.toMatch(/\bstable\b/i);
  });

  it("state the platform support Kiln has: macOS validated, Linux and Windows best effort", () => {
    expect(section("Requirements")).toMatch(/\| Platform \| macOS is validated\. Linux and Windows are best effort/);
  });

  it("agree with the package's engines field", () => {
    expect(manifest.engines.node).toBe(`>=${TOOLING_MINIMUMS.node}`);
  });
});

// AC-NOTES-01: the 1.0.0 notes say what Kiln is, how to install it, what it requires and where to report problems.
describe("the 1.0.0 release notes", () => {
  // The 1.0.0 section of the changelog, up to the next release's heading.
  const notes = /^## \[1\.0\.0\][^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"))?.[1] ?? "";

  it("say what Kiln is, how to install it and where to report problems", () => {
    expect(notes.trim()).not.toBe("");
    expect(notes).toContain("Kiln builds a PRD you already planned with the [Enso Method]");
    expect(notes).toContain("npm install -g @ensodynamics/kiln");
    expect(notes).toContain("https://github.com/EnsoDynamics/kiln/issues");
  });

  it("state every enforced minimum, each as a minimum", () => {
    for (const tool of tools) expect(notes, toolName(tool)).toContain(`${toolName(tool)} ${displayMinimum(tool)} or later`);
    for (const { tool, version, after } of statements(notes)) {
      expect(version.replace(/\.0$/, ""), `${toolName(tool)} ${version}`).toBe(displayMinimum(tool));
      expect(after, `${toolName(tool)} ${version}`).toMatch(/^ or later/);
    }
    expect(notes).toContain("macOS is validated. Linux and Windows are best effort.");
  });
});
