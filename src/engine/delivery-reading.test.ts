// Whether a delivery waits to merge (Kiln After Delivery AC-WAIT-01): only the pull request in this
// PRD's repository decides it; a delivery that opened none there never waits.
import { describe, expect, it } from "vitest";
import { deliveryWaiting } from "./delivery-reading.js";
import type { PrdRecord } from "../state/records.js";

type Reading = NonNullable<PrdRecord["afterDelivery"]>["pullRequests"][number];
const pull = (repository: string, number: number) => ({ repository, number, title: "t", url: `https://github.com/acme/${repository}/pull/${number}`, head: "feature/customer-returns", base: "develop", commits: 1, additions: 1, deletions: 0 });
const reading = (repository: string, number: number, state: Reading["state"]): Reading => ({ repository, number, state, readAt: "2026-10-17T19:00:00Z" } as Reading);
const record = (pulls: ReturnType<typeof pull>[], readings: Reading[]) => ({ repository: { name: "acme-shop" }, pullRequests: pulls, afterDelivery: { pullRequests: readings } }) as unknown as Parameters<typeof deliveryWaiting>[0];

describe("deliveryWaiting (AC-WAIT-01)", () => {
  it("never waits when the run's only pull request is in another repository", () => {
    expect(deliveryWaiting(record([pull("acme-api", 57)], [reading("acme-api", 57, "open")]))).toBe(false);
  });
  it("ends the wait when the PRD repository's pull request merged, though another repository's is still open", () => {
    expect(deliveryWaiting(record([pull("acme-api", 57), pull("acme-shop", 218)], [reading("acme-api", 57, "open"), reading("acme-shop", 218, "merged")]))).toBe(false);
  });
  it("waits while the PRD repository's pull request is open, though another repository's merged", () => {
    expect(deliveryWaiting(record([pull("acme-api", 57), pull("acme-shop", 218)], [reading("acme-api", 57, "merged"), reading("acme-shop", 218, "open")]))).toBe(true);
  });
  it("has no answer before the PRD repository's pull request was read", () => {
    expect(deliveryWaiting(record([pull("acme-shop", 218)], [reading("acme-api", 57, "merged")]))).toBeUndefined();
  });
});
