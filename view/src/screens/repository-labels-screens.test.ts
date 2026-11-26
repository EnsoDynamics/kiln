// Each repository by its label on the screens Phase 5 of Kiln find repositories anywhere covers
// (AC-FOLDER-02): the early-merge targets, the catch-up offer and the audit card on Phase detail,
// for two repositories with one short name set up as `admin` and `acme-labs+admin`.

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { PhaseView } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import CatchUpOffer from "../components/CatchUpOffer.svelte";
import CompletedPlanCheck from "../components/CompletedPlanCheck.svelte";
import ExecutionHistory from "../components/ExecutionHistory.svelte";
import DocumentsFound from "./DocumentsFound.svelte";
import PhaseDetail from "./PhaseDetail.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();

it("names each early-merge target by its label", () => {
  const snapshot = documentsFoundSnapshot();
  const row = snapshot.repositories[0]!;
  snapshot.repositories = [
    { ...row, name: "admin", label: "acme/admin", github: "github.com/acme/admin", baseBranch: "develop" },
    { ...row, name: "acme-labs+admin", label: "acme-labs/admin", github: "github.com/acme-labs/admin", baseBranch: "develop" },
  ];
  snapshot.settings.developmentDeployments = { enabled: true, targets: [] };
  const html = render(DocumentsFound, { props: { snapshot, config: { token: "fixture-token", base: "/customer-returns" }, connected: true, now: Date.now() } }).body;
  const section = text(html.split('aria-label="Early merges"')[1]!.split("</section>")[0]!);
  expect(section).toContain("acme/admin");
  expect(section).toContain("acme-labs/admin");
  expect(section).not.toContain("acme-labs+admin");
});

it("names each repository of the catch-up offer by its label", () => {
  const offer = { repositories: [{ name: "admin", label: "acme/admin", branch: "feature/x", base: "develop", behind: 1 }, { name: "acme-labs+admin", label: "acme-labs/admin", branch: "feature/x", base: "develop", behind: 3 }] };
  const words = text(render(CatchUpOffer, { props: { offer, where: "stop" } }).body);
  expect(words).toContain("In acme/admin, the branch is 1 commit behind develop.");
  expect(words).toContain("In acme-labs/admin, the branch is 3 commits behind develop.");
  expect(words).not.toContain("acme-labs+admin");
});

it("names each repository of the audit card on Phase detail by its label", () => {
  const snapshot = runningSnapshot();
  const audit: PhaseView = { id: "audit-da1", activityId: "audit-da1", kind: "delivery_audit", title: "Delivery audit", file: "Round 1", round: 1, continuationIndex: 1, state: "done", finishedByPerson: false, sessionStartedAt: "2026-10-17T14:00:00Z", doneAt: "2026-10-17T14:09:00Z", details: { from: "2026-10-17T14:00:00Z", to: "2026-10-17T14:09:00Z", model: "Opus", worktree: "/w", branch: "feature/x", sessionId: "s-da1" }, audit: { checks: [], criteria: [], repositories: [{ name: "acme-labs+admin", label: "acme-labs/admin", revision: "a1b2c3d" }], blockers: [], pendingActions: [] } };
  snapshot.activities = [...snapshot.phases, audit];
  const words = text(render(PhaseDetail, { props: { snapshot, phaseId: "audit-da1", connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
  expect(words).toContain("acme-labs/admin: a1b2c3d");
  expect(words).not.toContain("acme-labs+admin");
});

it("names the PRD's repository by its label in the page header and the clean-checkout check (Phase 6)", () => {
  const snapshot = documentsFoundSnapshot();
  const row = snapshot.repositories[0]!;
  // The PRD's acme-shop shares its short name with other/acme-shop, so it is shown as acme/acme-shop.
  snapshot.feature = { ...snapshot.feature, repositoryName: "acme-shop", repositoryLabel: "acme/acme-shop", multiRepository: true };
  snapshot.repositories = [{ ...row, name: "acme-shop", label: "acme/acme-shop" }, { ...row, name: "other+acme-shop", label: "other/acme-shop", kind: "named", github: "github.com/other/acme-shop" }];
  snapshot.documents!.checks = [{ name: "Repositories found on this computer", passed: true }, { name: "Working tree of acme/acme-shop is clean", passed: true }];
  const html = render(DocumentsFound, { props: { snapshot, config: { token: "fixture-token", base: "/customer-returns" }, connected: true, now: Date.now() } }).body;
  expect(text(html.split(/class="where[^"]*"/)[1]!.split("</div>")[0]!)).toContain("Repository acme/acme-shop");
  // Redrawn with the label in its own name span, as the check names it.
  expect(html).toMatch(/<span class="mono check-name[^"]*">acme\/acme-shop<\/span>/);
  expect(text(html)).toContain("Working tree of acme/acme-shop is clean");
});

it("names each earlier delivery by its label (Phase 7)", () => {
  const snapshot = runningSnapshot();
  snapshot.continuation = { executions: [{ executionId: "earlier-1", completedAt: "2026-11-01T12:00:00Z", branch: "feature/x", deliveries: [{ repository: "acme-labs+admin", label: "acme-labs/admin", url: "https://github.com/acme-labs/admin/pull/7" }, { repository: "github.com/acme/admin", label: "acme/admin", url: "https://github.com/acme/admin/pull/3" }] }] };
  const words = text(render(ExecutionHistory, { props: { snapshot, config: { token: "fixture-token", base: "/customer-returns" }, connected: true } }).body);
  expect(words).toContain("acme-labs/admin · Earlier delivery");
  expect(words).toContain("acme/admin · Earlier delivery");
  expect(words).not.toMatch(/acme-labs\+admin|github\.com\/acme/);
});

it("names the repository a continuation's preparation integrates in by its label (Phase 7)", () => {
  const preparation = { phaseId: "4", prerequisites: ["1"], repository: "acme-labs+admin", label: "acme-labs/admin", sourceRef: "wt/x", sourceRevision: "a1b2c3d", destination: "assigned_feature", checks: [], repositoryIdentity: "acme-labs/admin", baseBranch: "develop", baseRevision: "b2c3d4e", authorization: "phase_preparation", valid: true };
  const check = { status: "available", attemptedAt: "2026-11-01T12:00:00Z", sources: [], errors: [], result: { added: [{ id: "4", title: "Restock", file: "phase-4-restock.md" }], leaves: [], uncommitted: [], source: { path: "docs/prds/customer-returns" }, proposal: { id: "p1", readiness: "ready", preparation: [preparation], problems: [], repositories: [], prerequisites: [], authorization: [], grantEligible: false } } } as unknown as Parameters<typeof CompletedPlanCheck>[1]["check"];
  const words = text(render(CompletedPlanCheck, { props: { check, connected: true, prdDirectory: "docs/prds/customer-returns" } }).body);
  expect(words).toContain("Phase 4 preparation: integrate Phase 1 in acme-labs/admin from wt/x");
  expect(words).not.toContain("acme-labs+admin");
});
