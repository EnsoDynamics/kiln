// The pull request description's block in the prompts (Kiln Deliver When Audit Loops Run Out
// AC-LEFT-01): every pull request prompt carries it, the development finalization one included;
// every resume of a pull request session carries the block Kiln would give now after its carry-on
// line; and the block itself is For you, then Closing audits, then Settled during the build.
import { describe, expect, it } from "vitest";
import { deliveryBlock, type ForYou } from "../audit/for-you.js";
import { closingAudits } from "../state/audit-loops.js";
import { pullRequestSessionPrompt, resumePrompt } from "./prompts.js";

const loops = { delivery: { used: 4, limit: 4 }, test: { used: 2, limit: 4 } };
const tag = () => "waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex";
const item = (line: string, waived = false): ForYou["items"][number] => ({ id: "item-1", kind: "test", words: "Test gap", problem: "p", action: "a", line, listedBy: "Test audit round 1", listedByActivityId: "a1", ...(waived ? { waiver: { waiverId: "w1", activityKey: "pr", at: "2026-11-19T10:00:00.000Z", via: "browser" as const, account: "alex" } } : {}) });

describe("the block each description opens with (AC-LEFT-01)", () => {
  it("is For you when it lists anything, then Closing audits, then Settled during the build", () => {
    const settled = [{ id: "item-2", problem: "Docs lag.", action: "Update.", listedBy: "Delivery audit round 1", settledBy: "Test audit round 1", how: "Updated." }] as unknown as Parameters<typeof deliveryBlock>[1];
    const block = deliveryBlock({ items: [item("Test gap: AC-1 has no test. Write one.", true)], afterDelivery: ["Release to production."] }, settled, tag, loops);
    expect(block).toMatch(/^## For you\n\n- Test gap: AC-1 has no test\. Write one\. \(Waived: waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex\)\n- Release to production\.\n\n## Closing audits\n\nDelivery audit: 4 loops \(max 4\)\. Test audit: 2 loops \(max 4\)\.\n\n## Settled during the build\n\n/);
  });
  it("is Closing audits alone when nothing is listed or settled, with no acceptance line", () => {
    expect(deliveryBlock({ items: [], afterDelivery: [] }, [], tag, loops)).toBe("## Closing audits\n\nDelivery audit: 4 loops (max 4). Test audit: 2 loops (max 4).");
  });
  it("reads the limits in force: the frozen ones once the first pull request session launched", () => {
    const record = { settings: { auditLoops: { deliveryLimit: 9, testLimit: 9 } }, auditLoops: { epochs: [], loops: [], atPullRequest: { at: "2026-11-19T10:00:00Z", deliveryLimit: 4, testLimit: 3 } } };
    expect(closingAudits(record as Parameters<typeof closingAudits>[0])).toEqual({ delivery: { used: 0, limit: 4 }, test: { used: 0, limit: 3 } });
  });
});

describe("the block in the pull request prompts (AC-LEFT-01)", () => {
  const BLOCK = "## Closing audits\n\nDelivery audit: 1 loop (max 4). Test audit: 1 loop (max 4).";
  const repositories = [{ name: "product", github: "acme/product", worktreePath: "/w/product", baseBranch: "main", isPrd: true }, { name: "returns-api", github: "acme/returns-api", worktreePath: "/w/returns-api", baseBranch: "develop", isPrd: false }];
  const values = { featureName: "Customer returns", prdFile: "docs/prd.md", branch: "feature/returns", repositories, deliveryBlock: BLOCK };
  it.each([["the pull request session", undefined], ["development finalization", JSON.stringify({ executionId: "e", grants: [] })]])("%s gets it with nothing listed, for every pull request, editing one already open", (_name, deliveryAuthority) => {
    const prompt = pullRequestSessionPrompt({ ...values, ...(deliveryAuthority ? { deliveryAuthority } : {}) });
    expect(prompt).toContain(`Open each pull request's description with the block below, word for word, before anything else you write there. Where a pull request is already open, edit its description (\`gh pr edit\`) so this block replaces any block an earlier session wrote, keeping the rest.\n\n${BLOCK}`);
  });
  it.each([["the pull request session", undefined], ["development finalization", JSON.stringify({ executionId: "e", grants: [] })]])("every resume of %s carries the current block after its carry-on line", (_name, deliveryAuthority) => {
    for (const opening of [{ cause: "sleep" as const }, { endedOnItsOwn: true }, { usageLimit: "" }, {}]) {
      const prompt = resumePrompt({ ...opening, time: "2026-11-20T01:00:00Z", deliveryBlock: BLOCK, ...(deliveryAuthority ? { deliveryAuthority } : {}) });
      const carryOn = prompt.indexOf(deliveryAuthority ? "Carry on finalizing delivery" : "Carry on opening the pull request");
      expect(carryOn).toBeGreaterThan(-1);
      expect(prompt.indexOf(`Use this block in place of the one in the first message:\n\n${BLOCK}`)).toBeGreaterThan(carryOn);
    }
  });
  it("a phase resume never carries it", () => {
    expect(resumePrompt({ cause: "sleep", time: "t", phaseDoc: "docs/phase-1.md", deliveryBlock: BLOCK })).not.toContain("Use this block");
  });
});
