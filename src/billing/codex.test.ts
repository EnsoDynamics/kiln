// Parsing/freshness rules, paired with the generated schema and live metadata qualification.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codexCredits, codexUsagePermission, type AccountResult, type CodexLimits } from "../agents/codex-metadata.js";
import { codexBillingSummary } from "./codex.js";
const at = "2026-10-26T18:00:00Z";
const account: AccountResult = { account: { type: "chatgpt", email: "account@example.test", planType: "business" }, workspaceRouting: { chatgptAccountId: "workspace-a" } };
const usage = (credits: unknown): CodexLimits => ({ accountId: "workspace-a", ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { credits } } } as CodexLimits);
const parse = (credits: unknown) => codexCredits(account, usage(credits), account, at);
describe("Codex workspace billing facts", () => {
  it("matches the regenerated pinned contract and corroborated metadata-only account boundary", () => {
    const contract = JSON.parse(readFileSync(new URL("../../test/fixtures/billing/codex-credit-contract-0.162.1.json", import.meta.url), "utf8"));
    expect(contract.version).toBe("codex-cli 0.162.1");
    expect(contract.schema.CreditsSnapshot.properties).toEqual({ balance: { type: ["string", "null"] }, hasCredits: { type: "boolean" }, unlimited: { type: "boolean" } });
    expect(contract.live).toMatchObject({ chatgptBeforeAndAfter: true, stableUsageIdentity: true, routingCorroborated: true, accountMetadataConsistent: true });
  });
  it("preserves each bucket independently, prefers even an empty map, and never reads reset credits", () => {
    const data = usage({ balance: "50.00", hasCredits: true, unlimited: false });
    data.rateLimitsByLimitId!.other = { credits: { balance: "12", hasCredits: false, unlimited: true } };
    expect(codexCredits(account, data, account, at)).toEqual([
      { scope: "workspace", bucketId: "codex", accountId: "workspace-a", observedAt: at, balance: "50.00", hasCredits: true },
      { scope: "workspace", bucketId: "other", accountId: "workspace-a", observedAt: at, balance: "12", hasCredits: false },
    ]);
    data.rateLimits = { credits: { balance: "999" } }; data.rateLimitsByLimitId = {};
    expect(codexCredits(account, data, account, at)).toEqual([]);
    delete data.rateLimitsByLimitId;
    expect(codexCredits(account, data, account, at)[0]).toMatchObject({ bucketId: "legacy", balance: "999" });
    expect(codexCredits(account, { accountId: "workspace-a", rateLimits: { rateLimitResetCredits: { availableCount: 50 } } } as CodexLimits, account, at)).toEqual([]);
  });
  it.each([null, undefined, {}, { unlimited: true }, { balance: "$50" }, { balance: "secret-credit-canary" }, { balance: "1e4" }, { balance: -1 }, { balance: "-1" }, { hasCredits: "yes" }])("omits unavailable or malformed optional credit data: %j", credits => {
    expect(parse(credits)).toEqual([]);
  });
  it.each([true, false])("reports only boolean availability (%s), with no unlimited-use inference", hasCredits => {
    expect(parse({ hasCredits, unlimited: true, balance: null })[0]).toEqual({ scope: "workspace", bucketId: "codex", accountId: "workspace-a", observedAt: at, hasCredits });
  });
  it("omits credits on any account/workspace mismatch or missing attribution", () => {
    const data = usage({ balance: "50" });
    for (const before of [
      { ...account, account: { ...account.account!, email: "other@example.test" } },
      { ...account, account: { ...account.account!, planType: "pro" } },
      { ...account, account: { type: "apiKey" } },
      { ...account, workspaceRouting: { chatgptAccountId: "other" } },
    ]) expect(codexCredits(before, data, account, at)).toEqual([]);
    const unidentified = { ...data }; delete unidentified.accountId;
    expect(codexCredits(account, unidentified, account, at)).toEqual([]);
    const noIdentity = { account: { type: "chatgpt" } };
    expect(codexCredits(noIdentity, data, noIdentity, at)).toEqual([]);
    const noRouting = { account: account.account! };
    expect(codexCredits(noRouting, data, noRouting, at)).toHaveLength(1);
  });
  it("never changes recovery permission for positive, absent or contradictory credit readings", () => {
    for (const credits of [undefined, { balance: "100", hasCredits: true, unlimited: true }, { balance: "0", hasCredits: false }]) {
      const data = usage(credits);
      expect(codexUsagePermission(account, data, account).state).toBe("blocked");
      data.ordinaryUsageAllowed = true;
      expect(codexUsagePermission(account, data, account).state).toBe("allowed");
      data.rateLimitsByLimitId!.codex!.spendControlReached = true;
      expect(codexUsagePermission(account, data, account)).toMatchObject({ state: "blocked", administrative: true });
    }
  });
  it("drops stale/unattributed credits and labels missing account fields without inferring a plan", () => {
    const reading = { agentId: "codex" as const, startedAt: at, updatedAt: at, accountId: "workspace-a", limits: [], credits: parse({ balance: "50" }) };
    expect(codexBillingSummary(reading, Date.parse(at))).toMatchObject({ agentId: "codex", route: "settings", credits: reading.credits, approved: false });
    for (const r of [{ ...reading, error: "failed" }, { ...reading, accountId: "different" }]) expect(codexBillingSummary(r, Date.parse(at)).credits).toBeUndefined();
    expect(codexBillingSummary({ ...reading, stale: true }, Date.parse(at)).credits).toEqual(reading.credits); // Stale usage windows do not age fresh, independently timestamped credits.
    expect(codexBillingSummary(reading, Date.parse(at) + 300001).credits).toBeUndefined();
    expect(codexBillingSummary(reading, Date.parse(at))).not.toHaveProperty("plan");
  });
});
