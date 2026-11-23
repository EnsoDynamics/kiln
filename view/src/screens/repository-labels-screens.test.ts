// Each repository by its label on the screens Phase 5 of Kiln find repositories anywhere covers
// (AC-FOLDER-02): the early-merge targets, the catch-up offer and the audit card on Phase detail,
// for two repositories with one short name set up as `admin` and `acme-labs+admin`.

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { PhaseView } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import CatchUpOffer from "../components/CatchUpOffer.svelte";
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
