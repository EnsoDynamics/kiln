// The location label (Kiln Requirements Stages AC-BEGIN-07; technical design, "Location label"):
// until the PRD's folder exists, every screen's header names the source material folder, or the
// initiative and planned PRD, where it would name the PRD folder. The snapshot side is proved in
// src/requirements/requirements.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, folderMissingSnapshot, pausingSnapshot, runningSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import StateHeader from "../components/StateHeader.svelte";
import DocumentsFound from "./DocumentsFound.svelte";
import FolderMissing from "./FolderMissing.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import Requirements from "./Requirements.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const at = (location: Snapshot["feature"]["location"]): Snapshot => {
  const base = runningSnapshot();
  return {
    ...base,
    feature: { ...base.feature, prdFolder: "source-material/count-boxes/", ...(location ? { location } : {}) },
    requirements: { origin: { kind: "brief", path: "source-material/count-boxes", title: "Count boxes", files: ["source-material/count-boxes/count-boxes-brief.md"], commit: "a".repeat(40), committedAt: "2026-11-27T13:00:00Z" }, plan: { status: "none", agent: "Claude Code", canReadAgain: true }, rows: [], feedback: [] },
  } as Snapshot;
};
const now = RUNNING_NOW;
// Each screen with a header, on its own fixture, given the same location: the headers above every screen of a run.
const placed = (base: Snapshot, snapshot: Snapshot): Snapshot => ({ ...base, feature: { ...base.feature, prdFolder: snapshot.feature.prdFolder, ...(snapshot.feature.location ? { location: snapshot.feature.location } : {}) } });
const screens = (snapshot: Snapshot) => [
  text(render(Requirements, { props: { snapshot, connected: true, now } }).body),
  text(render(StateHeader, { props: { snapshot, connected: true, now } }).body),
  text(render(DocumentsFound, { props: { snapshot: placed(documentsFoundSnapshot(), snapshot), config: { token: "t", base: "" }, connected: true, now } }).body),
  text(render(FolderMissing, { props: { snapshot: placed(folderMissingSnapshot("gone"), snapshot), connected: true, now, lastSeenAt: undefined } }).body),
  text(render(PhaseDetail, { props: { snapshot: placed(runningSnapshot(), snapshot), phaseId: "2b", connected: true, now, lastSeenAt: now } }).body),
  text(render(PhaseDetail, { props: { snapshot: placed(pausingSnapshot(), snapshot), phaseId: "2b", connected: true, now, lastSeenAt: now } }).body),
];

it("names the source material folder before the PRD's folder exists", () => {
  const shown = screens(at({ kind: "source_material", folder: "source-material/count-boxes/" }));
  expect(shown).toHaveLength(6);
  for (const one of shown) {
    expect(one).toContain("Source material source-material/count-boxes/");
    expect(one).not.toContain("PRD folder");
  }
});

it("names the initiative and planned PRD for a planned PRD", () => {
  for (const shown of screens(at({ kind: "planned_prd", initiative: "docs/initiatives/shifts/", prd: "rotas" }))) {
    expect(shown).toContain("Initiative docs/initiatives/shifts/ Planned PRD rotas");
    expect(shown).not.toContain("PRD folder");
  }
});

it("names the PRD folder once it exists", () => {
  const snapshot = at(undefined);
  snapshot.feature.prdFolder = "docs/prds/count-boxes/";
  for (const shown of screens(snapshot)) {
    expect(shown).toContain("PRD folder docs/prds/count-boxes/");
    expect(shown).not.toContain("Source material");
  }
});
