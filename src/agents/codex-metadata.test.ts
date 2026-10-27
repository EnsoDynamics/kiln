import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codexAccount, codexModels, latestSol } from "./codex-metadata.js";
import type { ModelEntry } from "../account/model-list.js";
const model = (value: string, levels = ["high"]): ModelEntry => ({ value, resolvedModel: value, displayName: value, description: "", supportsEffort: true, supportedEffortLevels: levels, supportsAutoMode: true });
describe("Codex metadata rules", () => {
  it("preserves the installed provider's reported names and every reasoning effort from a real metadata-only capture", () => {
    const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/codex-metadata/model-list-0.162.1.json", import.meta.url), "utf8"));
    const models = codexModels(recorded.data);
    expect(models.map((m) => m.displayName)).toEqual(recorded.data.filter((m: { hidden: boolean }) => !m.hidden).map((m: { displayName: string }) => m.displayName));
    expect(models.find((m) => m.value === "gpt-6.1-sol")?.supportedEffortLevels).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
  });
  it("selects the unique numeric latest Sol with High, with no other-family or server-default fallback", () => {
    expect(latestSol([model("gpt-6-sol"), model("gpt-6.9-sol"), model("gpt-6.10-sol"), model("gpt-9-astra")])).toBe("gpt-6.10-sol");
    expect(latestSol([model("gpt-6.1-sol", ["low"]), model("gpt-6-sol")])).toBeUndefined();
    expect(latestSol([model("gpt-9-astra")])).toBeUndefined();
    expect(latestSol([model("gpt-6-sol"), model("gpt-6.0-sol")])).toBeUndefined();
  });
  it("keeps empty maps, missing percentages/resets and unknown account fields unknown", () => {
    const account = { account: { type: "chatgpt", email: "known@example.invalid" } };
    const empty = codexAccount(account, { accountId: "known", rateLimitsByLimitId: {}, rateLimits: { primary: { usedPercent: 0 } } }, account, "2026-10-23T00:00:00Z", "2026-10-23T00:00:01Z");
    expect(empty.limits).toEqual([]); expect(empty.limitsError).toContain("unknown"); expect(empty.email).toBe("known@example.invalid");
    const result = codexAccount(account, { accountId: "known", rateLimitsByLimitId: { a: { primary: { windowDurationMins: 10080 }, secondary: { usedPercent: 80 } }, b: { primary: { usedPercent: 12 } } } }, account, "2026-10-23T00:00:00Z", "2026-10-23T00:00:01Z");
    expect(result.limits).toHaveLength(3); expect(result.limits[0]).toMatchObject({ durationMinutes: 10080, nearLimit: false });
    expect(result.limits[0]!.percent).toBeUndefined(); expect(result.limits[0]!.resetsAt).toBeUndefined(); expect(result.limits[1]!.nearLimit).toBe(true);
  });
});
