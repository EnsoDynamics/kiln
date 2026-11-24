// GitHub's `gh pr view` answers recorded on 2026-11-21 (test/fixtures/gh/
// pr-view-states-recorded-2026-11-21.json), for the stand-in `gh` to replay with a test's own number,
// base and commits (Kiln After Delivery, "Verification").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const recorded = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/gh/pr-view-states-recorded-2026-11-21.json", import.meta.url)), "utf8")) as Record<"open" | "conflicting" | "closed" | "merged", Record<string, unknown>>;

/**
 * One pull request's recorded answer in the given state, with this test's identity.
 *
 *   recordedPullRequest("merged", { number: 12, base: "develop", mergeCommit: sha })
 */
export function recordedPullRequest(state: "open" | "conflicting" | "closed" | "merged", values: { number: number; base: string; url?: string; head?: string; mergeCommit?: string; mergedAt?: string; body?: string }): Record<string, unknown> {
  return {
    ...recorded[state], number: values.number, baseRefName: values.base, body: values.body ?? "",
    ...(values.url ? { url: values.url } : {}), ...(values.head ? { headRefOid: values.head } : {}),
    ...(state === "merged" ? { mergeCommit: { oid: values.mergeCommit }, mergedAt: values.mergedAt ?? recorded.merged.mergedAt } : {}),
  };
}
