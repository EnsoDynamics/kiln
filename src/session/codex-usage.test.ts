import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { codexUsagePermission } from "../agents/codex-metadata.js";
import type { AgentAccount } from "../agents/metadata.js";
import type { SessionRecord, SessionRun } from "../state/records.js";
import { codexUsageRefusal, codexUsageRelease, consumeCodexUsage } from "./codex-usage.js";

const at = "2026-10-23T19:00:00Z";
const account = { account: { type: "chatgpt" } };
const error = { message: "Exhausted. Reset tomorrow.", codexErrorInfo: "usageLimitExceeded" };
const run = () => ({ startedAt: at, endedAt: at, cause: "launch", codex: { account: { accountId: "A" }, intentAt: at, terminal: { status: "failed", error }, humanRequests: [], modelActivityAt: [] } }) as unknown as SessionRun;
const session = () => ({ model: "original-model", effort: "high", conversation: { threadId: "same-conversation" }, codex: { usageRecovery: { generation: 0 } } }) as unknown as SessionRecord;
const reading = (accountId = "A", state: "allowed" | "blocked" | "unknown" = "allowed"): AgentAccount => ({ agentId: "codex", startedAt: "2026-10-23T19:00:01Z", updatedAt: "2026-10-23T19:00:02Z", limits: [], accountId, codexUsage: { state, reason: state } });

describe("pinned Codex refusal and semantic release", () => {
  it("uses only the current failed terminal's scalar provider error, never prose, 429, intermediate retries or interruptions", () => {
    expect(codexUsageRefusal(run(), "original-model")).toEqual({ agentId: "codex", label: "A usage limit", at, codex: { code: "usageLimitExceeded", accountId: "A", model: "original-model" } });
    for (const code of [undefined, "rateLimitExceeded", "sessionBudgetExceeded", "unauthorized", { httpConnectionFailed: { httpStatusCode: 429 } }]) {
      const r = run(); r.codex!.terminal!.error = { ...error, codexErrorInfo: code };
      expect(codexUsageRefusal(r, "original-model")).toBeUndefined();
    }
    const r = run(); r.codex!.terminal = { status: "completed" }; r.codex!.errors = [{ at, threadId: "same", turnId: "own", error, willRetry: true }];
    expect(codexUsageRefusal(r, "original-model")).toBeUndefined();
    r.codex!.terminal = { status: "failed", error }; r.interruptedBy = "sleep";
    expect(codexUsageRefusal(r, "original-model")).toBeUndefined();
    delete r.interruptedBy; r.codex!.terminal.at = at; r.codex!.modelActivityAt = ["2026-10-23T19:00:01Z"];
    expect(codexUsageRefusal(r, "original-model")).toBeUndefined();
  });

  it("requires bracketed stable usage identity and explicit ordinary permission; optional routing alone is not required", () => {
    const permission = (usage: Parameters<typeof codexUsagePermission>[1]) => codexUsagePermission(account, usage, account);
    expect(permission({ accountId: "A", ordinaryUsageAllowed: true }).state).toBe("allowed");
    expect(permission({ accountId: "A", ordinaryUsageAllowed: false }).state).toBe("blocked");
    for (const fields of [{}, { ordinaryUsageAllowed: null }]) expect(permission({ accountId: "A", ...fields, rateLimits: { primary: { usedPercent: 0, resetsAt: 1 } } }).state).toBe("unknown");
    expect(permission({ accountId: "", ordinaryUsageAllowed: true }).state).toBe("unknown");
    expect(codexUsagePermission({ ...account, workspaceRouting: { chatgptAccountId: "B" } }, { accountId: "A", ordinaryUsageAllowed: true }, account).state).toBe("unknown");
    expect(codexUsagePermission(account, { accountId: "A", ordinaryUsageAllowed: true }, { account: { type: "apiKey" } }).state).toBe("unknown");
    expect(permission({ accountId: "A", ordinaryUsageAllowed: true, rateLimitsByLimitId: { alias: { spendControlReached: true } } })).toMatchObject({ state: "blocked", administrative: true });
    expect(permission({ accountId: "A", ordinaryUsageAllowed: true, rateLimits: { rateLimitReachedType: "workspace_owner_credits_depleted" } })).toMatchObject({ state: "blocked", administrative: true });
    // The multi-bucket map is authoritative even when empty; legacy cannot add a phantom block.
    expect(permission({ accountId: "A", ordinaryUsageAllowed: true, rateLimitsByLimitId: {}, rateLimits: { spendControlReached: true } }).state).toBe("allowed");
  });

  it("persists consumption, ignores timestamp/percentage/email changes and releases only for a real transition or stable changed account", () => {
    let s = session(); const refusal = codexUsageRefusal(run(), s.model)!;
    consumeCodexUsage(s, codexUsageRelease(s, refusal, reading()));
    s = JSON.parse(JSON.stringify(s));
    expect(codexUsageRelease(s, refusal, { ...reading(), email: "different@example.invalid", updatedAt: "2026-10-24T19:00:02Z", limits: [{ kind: "alias", label: "Alias", shortLabel: "Alias", percent: 0, nearLimit: false }] })).toMatchObject({ state: "blocked", suppressed: true });
    expect(codexUsageRelease(s, refusal, reading("A", "unknown")).state).toBe("unknown");
    expect(codexUsageRelease(s, refusal, reading()).suppressed).toBe(true);
    expect(codexUsageRelease(s, refusal, reading("B")).state).toBe("allowed");
    expect(codexUsageRelease(s, refusal, reading("A", "blocked")).state).toBe("blocked");
    expect(codexUsageRelease(s, refusal, reading()).state).toBe("allowed");
    consumeCodexUsage(s, codexUsageRelease(s, refusal, reading()));
    expect(codexUsageRelease(s, refusal, reading()).suppressed).toBe(true);
    const missingIdentity = reading(); delete missingIdentity.accountId;
    expect(codexUsageRelease(s, refusal, missingIdentity).state).toBe("unknown");
    expect(codexUsageRelease(s, refusal, { ...reading(), startedAt: "2026-10-23T18:59:59Z" }).state).toBe("unknown");
  });

  it("validates uncommon failure/permission shapes against schemas generated by the installed pinned CLI", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-usage/usage-contracts-0.162.1.json", import.meta.url), "utf8"));
    const ajv = new Ajv({ unknownFormats: "ignore" });
    expect(ajv.validate(fixture.schemas.ErrorNotification.schema, { threadId: "thread", turnId: "turn", error, willRetry: false })).toBe(true);
    const schema = fixture.schemas.GetAccountRateLimitsResponse.schema;
    for (const ordinaryUsageAllowed of [true, false, null]) expect(ajv.validate(schema, { rateLimits: {}, rateLimitsByLimitId: {}, accountId: "A", ordinaryUsageAllowed })).toBe(true);
  });
});
