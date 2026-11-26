// The Pull request description row (Kiln Deliver When Audit Loops Run Out AC-LEFT-01): a session
// delivered its block only when its latest run ended on its own and finished its work, and the row
// passes only when the latest such session was given the block Kiln would give now.
import { describe, expect, it } from "vitest";
import type { SessionRecord, SessionRun } from "../state/records.js";
import { deliveredItsBlock, descriptionRow } from "./description-check.js";
import { DESCRIPTION_CHECK } from "./waivers.js";

const BLOCK = "## Closing audits\n\nDelivery audit: 1 loop (max 4). Test audit: 1 loop (max 4).";
const ended: SessionRun = { cause: "launch", startedAt: "2026-11-20T01:00:00Z", endedAt: "2026-11-20T01:05:00Z", exitCode: 0, result: { subtype: "success", isError: false } };
function session(runs: SessionRun[], extra: Partial<SessionRecord> = {}): SessionRecord {
  return { schemaVersion: 24, sessionId: `s-${Math.random()}`, phaseId: "pr", kind: "pull_request", createdAt: "2026-11-20T01:00:00Z", model: "opus", modelDisplayName: "Opus", runs, sleeps: [], steps: [], agentId: "claude_code", deliveryBlock: { block: BLOCK, run: 0 }, ...extra };
}

describe("a pull request session delivered its block (AC-LEFT-01)", () => {
  it("when its latest run ended on its own with a result that is not an error and exit code 0", () => {
    expect(deliveredItsBlock(session([ended]))).toBe(true);
  });
  it.each([
    ["it is still running", "no end"],
    ["it was interrupted", { interruptedBy: "sigint" as const, interruptedAt: "2026-11-20T01:04:00Z" }],
    ["its launch failed", { spawnError: { code: "ENOENT", message: "missing" } }],
    ["a usage limit refused it", { limitRefusal: { label: "five_hour" } as SessionRun["limitRefusal"] }],
    ["it exited non-zero", { exitCode: 1 }],
    ["its result is an error", { result: { subtype: "error_during_execution", isError: true } }],
    ["it has no result", { result: undefined } as unknown as Partial<SessionRun>],
  ] as [string, Partial<SessionRun> | "no end"][])("never when %s", (_why, change) => {
    const run: SessionRun = change === "no end" ? { ...ended } : { ...ended, ...change };
    if (change === "no end") delete run.endedAt;
    if (change !== "no end" && "result" in change && change.result === undefined) delete run.result;
    expect(deliveredItsBlock(session([run]))).toBe(false);
  });
  it("for Codex, when its turn completed, whatever the app server's exit code", () => {
    const codex = (status: "completed" | "interrupted" | "failed", exitCode: number) => session([{ ...ended, exitCode, codex: { terminal: { status } } as NonNullable<SessionRun["codex"]> }], { agentId: "codex" });
    expect(deliveredItsBlock(codex("completed", 1))).toBe(true);
    expect(deliveredItsBlock(codex("interrupted", 0))).toBe(false);
    expect(deliveredItsBlock(codex("failed", 0))).toBe(false);
  });
  it("only from its latest run: an earlier run that delivered does not count once a later one failed", () => {
    expect(deliveredItsBlock(session([ended, { ...ended, cause: "resume", exitCode: 1 }]))).toBe(false);
  });
});

describe("the Pull request description row (AC-LEFT-01)", () => {
  it("passes when the latest session that delivered was given the block Kiln would give now", () => {
    expect(descriptionRow([session([ended])], BLOCK, 1)).toMatchObject({ name: DESCRIPTION_CHECK, passed: true });
  });
  it("fails with one fixed item when the block changed, no session delivered, or a session predates saved blocks", () => {
    const changed = descriptionRow([session([ended])], `## For you\n\n- Waived item\n\n${BLOCK}`, 1);
    expect(changed).toEqual({ name: DESCRIPTION_CHECK, passed: false, facts: [changed.items![0]!.text], items: [{ kind: "other", subject: DESCRIPTION_CHECK, text: "No pull request session in this run has written this run’s For you and Closing audits into the open pull request’s description.", against: DESCRIPTION_CHECK }] });
    // The same failure twice compares equal: no time or session in it.
    expect(descriptionRow([], BLOCK, 1)).toEqual(changed);
    expect(descriptionRow([(() => { const old = session([ended]); delete old.deliveryBlock; return old; })()], BLOCK, 1).passed).toBe(false);
    expect(descriptionRow([], BLOCK, 2).items![0]!.text).toBe("No pull request session in this run has written this run’s For you and Closing audits into the open pull requests’ descriptions.");
  });
  it("reads the latest session that delivered, past a later one that did not", () => {
    const old = session([ended], { deliveryBlock: { block: "older", run: 0 } });
    const current = session([ended]);
    const failed = session([{ ...ended, exitCode: 1 }], { deliveryBlock: { block: "newest", run: 0 } });
    expect(descriptionRow([old, current, failed], BLOCK, 1).passed).toBe(true);
    expect(descriptionRow([current, old], BLOCK, 1).passed).toBe(false);
  });
  it("counts a block saved for a resume only once that run has run, so a resume that never started leaves the earlier run's block unknown", () => {
    expect(descriptionRow([session([ended], { deliveryBlock: { block: BLOCK, run: 1 } })], BLOCK, 1).passed).toBe(false);
    expect(descriptionRow([session([ended, { ...ended, cause: "person_resume" }], { deliveryBlock: { block: BLOCK, run: 1 } })], BLOCK, 1).passed).toBe(true);
  });
});
