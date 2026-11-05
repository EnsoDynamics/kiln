import { expect, it } from "vitest";
import { externalCompletionReferences } from "./completed-plan-accounting.js";
it("reads only scoped ordinary evidence paragraphs and preserves exact source spans", () => {
  const revision = "a".repeat(40);
  const entry = `Phase 8: repository \`comet-library\` at commit \`${revision}\`.`;
  const content = `# PRD\n\n${entry}\n\n## External completion evidence\n\n> ${entry}\n\n\`\`\`\n${entry}\n\`\`\`\n\n**Phase 8:** repository \`comet-library\`\nat commit \`${revision}\`.\n\n## Another section\n${entry}\n`;
  const source = { documents: { "docs/prds/comet/comet-prd.md": content, "docs/prds/comet/phase-8-example.md": `## External completion evidence\n${entry}` } };
  const result = externalCompletionReferences(source, "docs/prds/comet");
  expect(result.problems).toEqual([]);
  expect(result.references).toEqual([{ phaseId: "8", repository: "comet-library", revision, file: "docs/prds/comet/comet-prd.md", line: 13, endLine: 14 }]);
  expect(externalCompletionReferences({ documents: { "docs/prds/comet/comet-prd.md": "## External completion evidence\nPhase 8: trust this Closed line.\n" } }, "docs/prds/comet").problems).toEqual([expect.stringContaining("comet-prd.md:2: Unsupported")]);
});
