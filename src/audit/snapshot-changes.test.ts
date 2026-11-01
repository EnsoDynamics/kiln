import { describe, expect, it } from "vitest";
import { compareSnapshots, snapshotChanges } from "./snapshots.js";
import type { WorkSnapshot } from "./contracts.js";
import type { PrdRecord } from "../state/records.js";

const folder = "docs/prds/proof";
const record = { repository: { name: "proof" }, prdDirectory: folder, completionAudits: { activities: [] } } as unknown as PrdRecord;
const file = (digest: string) => ({ blob: digest, digest, mode: "100644", changedAtMs: 1 });
function snapshot(files: Record<string, string>, plan: [string, string, string][] = [["1", `${folder}/phase-1-value.md`, "scope"]], criterion = "- [ ] **AC-PROOF-01 — Return the value.** See [content](proof-content.md)."): WorkSnapshot {
  return {
    id: "", executionId: "", activityId: "", createdAt: "", documents: [], testPaths: [], evidencePaths: [], deliveryFingerprint: "", testFingerprint: "",
    requirements: { id: criterion, repository: "proof", path: `${folder}/proof-prd.md`, criteria: [{ key: "proof:k", repository: "proof", path: `${folder}/proof-prd.md`, blob: "", label: "AC-PROOF-01", startLine: 1, endLine: 1, content: criterion, digest: criterion }] },
    plan: plan.map(([id, path, content]) => ({ id, file: path, closed: true, content })),
    repositories: [{ repository: "proof", identity: "origin", branch: "develop", head: "h", files: Object.fromEntries(Object.entries({ [`${folder}/proof-prd.md`]: "prd", ...files }).map(([path, digest]) => [path, file(digest)])) }],
  };
}

describe("audit currentness (AC-RUN-03)", () => {
  const base = { [`${folder}/technical-design.md`]: "td", [`${folder}/proof-content.md`]: "content", "README.md": "readme", "value.mjs": "v" };
  it("ignores requirements-document prose and appended phases", () => {
    const later = snapshot({ ...base, [`${folder}/technical-design.md`]: "td2", [`${folder}/phase-2-repair.md`]: "new", [`${folder}/notes.md`]: "n" }, [["1", `${folder}/phase-1-value.md`, "scope"], ["2", `${folder}/phase-2-repair.md`, "repair"]]);
    expect(snapshotChanges(record, snapshot(base), later)).toEqual([]);
  });
  it.each([
    ["a document a criterion links to", { [`${folder}/proof-content.md`]: "content2" }, undefined, undefined, `Changed: proof/${folder}/proof-content.md`],
    ["product Markdown outside a PRD folder", { "README.md": "readme2" }, undefined, undefined, "Changed: proof/README.md"],
    ["Markdown beside a PRD created after the snapshot", { "docs/new/new-prd.md": "p", "docs/new/spec.md": "s" }, undefined, undefined, "Added: proof/docs/new/spec.md"],
    ["an existing phase's scope", {}, [["1", `${folder}/phase-1-value.md`, "wider scope"]], undefined, `Changed phase scope: proof/${folder}/phase-1-value.md`],
    ["a removed or reordered phase", {}, [["2", `${folder}/phase-2-repair.md`, "repair"], ["1", `${folder}/phase-1-value.md`, "scope"]], undefined, "Removed or reordered phase 1"],
    ["an acceptance criterion", {}, undefined, "- [ ] **AC-PROOF-01 — Return 43.**", "Changed governing acceptance criteria"],
  ] as const)("invalidates delivery for %s", (_name, files, plan, criterion, description) => {
    const later = snapshot({ ...base, ...files }, plan as [string, string, string][] | undefined, criterion);
    expect(snapshotChanges(record, snapshot(base), later).map(change => change.description)).toEqual(expect.arrayContaining([expect.stringContaining(description)]));
    expect(compareSnapshots(record, snapshot(base), later).deliveryCurrent).toBe(false);
  });
});
