// What someone landing on the public repository finds: how to contribute and report problems
// (AC-REPO-01 to 03), and a release guide that describes the process, not the credentials (AC-REPO-06).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
interface FormField { type: string; id?: string; attributes: { label?: string; options?: string[] }; validations?: { required?: boolean } }
const form = (name: string) => parse(read(`.github/ISSUE_TEMPLATE/${name}`)) as { name: string; description: string; body: FormField[] };
const required = (fields: FormField[]) => fields.filter(f => f.validations?.required).map(f => f.attributes.label);

describe("the public repository files", () => {
  it("CONTRIBUTING welcomes forks, issues and feedback, says pull requests are generally not accepted and why, and the README links it", () => {
    const contributing = read("CONTRIBUTING.md");
    expect(contributing).toMatch(/\*\*Fork it freely\.\*\*/);
    expect(contributing).toMatch(/\*\*Issues and feedback are welcome,\*\*/);
    expect(contributing).toMatch(/\*\*Pull requests\*\* are generally not accepted/);
    expect(contributing).toMatch(/I don't have the time to do that well/);
    expect(read("README.md")).toContain("[CONTRIBUTING](CONTRIBUTING.md)");
  });

  it("SECURITY sends vulnerabilities privately to the maintainer, says what to include, and names the supported version with no response guarantee", () => {
    const security = read("SECURITY.md");
    expect(security).toContain("email doug@ensodynamics.com. Do not open a public GitHub issue");
    for (const detail of ["`kiln --version`", "the agent (Claude Code or Codex) and its version", "operating system", "reproduce"]) expect(security).toContain(detail);
    expect(security).toContain("There is no guaranteed response time");
    expect(security).toContain("The latest version published on npm is the supported version");
  });

  it("offers a bug report form asking for versions, agent, system, what happened and what was expected, and a feedback form, with no blank issues", () => {
    const bug = form("bug-report.yml");
    // GitHub skips an issue form without a name, description and body.
    for (const f of [bug, form("feedback-or-question.yml")]) { expect(f.name.trim()).not.toBe(""); expect(f.description.trim()).not.toBe(""); expect(f.body.length).toBeGreaterThan(0); }
    expect(required(bug.body)).toEqual(["Kiln version", "Agent", "Operating system", "What happened", "What you expected"]);
    expect(bug.body.find(f => f.id === "agent-version")?.attributes.label).toBe("Agent version");
    expect(bug.body.find(f => f.id === "agent")?.attributes.options).toEqual(expect.arrayContaining(["Claude Code", "Codex"]));
    expect(required(form("feedback-or-question.yml").body)).toEqual(["Your feedback or question"]);
    expect((parse(read(".github/ISSUE_TEMPLATE/config.yml")) as { blank_issues_enabled: boolean }).blank_issues_enabled).toBe(false);
  });

  it("shows a pull request note that pull requests are generally not accepted, linking CONTRIBUTING", () => {
    const template = read(".github/pull_request_template.md");
    expect(template).toContain("Pull requests are generally not accepted");
    expect(template).toContain("(https://github.com/EnsoDynamics/kiln/blob/main/CONTRIBUTING.md)");
  });

  it("the release guide and readiness review describe a scoped token in the maintainer's password manager, not its settings or vault record", () => {
    for (const path of ["docs/release/kiln-npm-release-steps.md", "docs/release/kiln-public-release-readiness-review.md"]) {
      const guide = read(path);
      expect(guide, path).toMatch(/scoped npm token kept in the maintainer's password manager until (?:OIDC )?trusted publishing replaces it/);
      expect(guide, path).not.toMatch(/2FA|two-factor|Keeper|bypass|expires 20\d\d|\b20\d\d-\d\d-\d\d\b.*expir|vault record|bootstrap token\*\*/i);
    }
    expect(read("docs/release/kiln-npm-release-steps.md")).toContain("`docs/release/notes/kiln-release-notes-<version>.md`");
  });
});
