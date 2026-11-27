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

// AC-GUIDE-01: the README and the command-line guide say where the tier comes from, how to change a
// phase's model and Model defaults in the browser and from a terminal, and what the usage fallback does.
describe("the guide to model tiers, Model defaults and the usage fallback", () => {
  const guide = readFileSync(new URL("../docs/kiln-command-line-and-bot-control.md", import.meta.url), "utf8");
  /** A `###` subsection of the README, up to the next heading of any level from 2 to 3. */
  function subsection(heading: string): string {
    const start = readme.indexOf(`\n### ${heading}\n`);
    expect(start, heading).toBeGreaterThanOrEqual(0);
    const end = readme.slice(start + 1).search(/\n##+ /);
    return readme.slice(start, end < 0 ? undefined : start + 1 + end);
  }
  const choosing = subsection("Choosing models");
  const fallback = subsection("The usage fallback");
  const terminal = subsection("Driving Kiln from the terminal or a bot");
  const guideModels = guide.slice(guide.indexOf("\n## Choosing models\n"));

  it("say the tier comes from the phase document's Model tier line, and a phase without one runs as standard", () => {
    expect(choosing).toContain("phase document's `**Model tier:**` line");
    expect(choosing).toMatch(/\*\*demanding\*\*, \*\*standard\*\* or \*\*mechanical\*\*/);
    expect(choosing).toContain("A phase document with no such line is **Not rated** and runs as standard.");
  });

  it("say how to change a phase's model in the browser and from a terminal", () => {
    expect(choosing).toMatch(/press \*\*Change\*\* on a phase that hasn't started/);
    expect(choosing).toContain("until you press **Use the default**");
    expect(terminal).toContain("`kiln model` changes a phase's model or the Audits choice");
    expect(guide.indexOf("\n## Choosing models\n")).toBeGreaterThanOrEqual(0);
    expect(guideModels).toContain("kiln model <PRD-path> --phase 3 --agent codex");
    expect(guideModels).toContain("kiln model <PRD-path> --audits --use-default");
  });

  it("say how to change Model defaults in the browser and from a terminal", () => {
    expect(choosing).toContain("The **Model defaults** link in the delivery panel or the run's settings opens the page");
    expect(choosing).toContain("**Restore Kiln's defaults**");
    expect(terminal).toContain("`kiln model-defaults` prints and changes Model defaults, the fallback switch and its threshold");
    for (const command of ["kiln model-defaults set --row mechanical", "kiln model-defaults restore", "kiln model-defaults fallback --on --threshold 90"]) {
      expect(guideModels, command).toContain(command);
    }
  });

  it("say the fallback is off by default, decided only at launch, and spends the other agent's account", () => {
    expect(fallback).toContain("**Use the fallback when usage is nearly out**, off until you turn it on");
    expect(fallback).toContain("It is decided only at launch, never partway through an activity");
    expect(fallback).toContain("**The fallback spends your other agent's account**");
    expect(guideModels).toContain("each time Kiln launches an activity that hasn't started, it reads both accounts");
    expect(guideModels).toContain("It spends the other agent's account.");
  });
});

describe("the README's guide to the requirements stages (Kiln Requirements Stages AC-GUIDE-01)", () => {
  it("says Kiln can start from source material, what it is and how to bring it in, where Kiln waits and stops, how to give feedback and how stage models are chosen", () => {
    const source = section("Starting from source material");
    expect(source).toContain("**Source material** is what a PRD is written from");
    for (const kind of ["`source-material/<name>/<name>-brief.md`", "`source-material/<name>/<name>-requirements-intake.md`", "`docs/initiatives/<name>/<name>-initiative-prds.md`"]) expect(source).toContain(kind);
    expect(source).toContain("**Bringing it in** is a conversation");
    expect(source).toContain("**The early review**");
    expect(source).toContain("**The final review**, always");
    expect(source).toContain("only **Start the build** begins it");
    expect(source).toContain("**Giving feedback.** Say it whenever it comes to mind");
    expect(source).toContain("**A PRD started by hand** continues from where it stands.");
    expect(section("Quick start")).toContain("kiln run source-material/<name>");
    const models = readme.slice(readme.indexOf("### Choosing models"), readme.indexOf("### The usage fallback"));
    expect(models).toContain("| Requirements stages, and the sessions that read the plan and apply feedback | Claude Code · Fable · high | Codex · GPT Astra · high |");
    expect(models).toContain("| Refining the design | Claude Code · Opus · high | Codex · GPT Sol · extra high |");
    expect(models).toContain("**Change one requirements stage.**");
  });

  it("no longer says Kiln starts only where planning ends, and the agent instructions no longer say it drives only the implementation half", () => {
    expect(readme).not.toContain("starts where planning ends");
    const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
    expect(agents).not.toContain("drives the implementation half");
    expect(agents).toContain("the requirements stages, then the implementation");
  });
});
