import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { CompletedPlanCheck as Check } from "../../../src/engine/completed-plan-discovery.js";
import CompletedPlanCheck from "./CompletedPlanCheck.svelte";

const check = { status: "unchanged", attemptedAt: "2026-11-20T15:00:00Z", lastSuccessfulAt: "2026-11-20T15:00:00Z", errors: [] } as unknown as Check;
const words = (loading: boolean) => render(CompletedPlanCheck, { props: { check, connected: true, config: { token: "t", base: "/customer-returns" }, prdDirectory: "docs/prds/customer-returns", loading } }).body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the check the page makes as it opens (AC-FIND-01, AC-FIND-04)", () => {
  it("reads as checking, with the earlier answer marked as earlier, until that check answers", () => {
    const during = words(true);
    expect(during).toContain("Checking for new phases");
    expect(during).toContain("Showing earlier results. The current phase count is unknown.");
    expect(during).not.toContain("No new phases found");
    const after = words(false);
    expect(after).toContain("No new phases found");
    expect(after).not.toContain("Showing earlier results.");
  });
});
