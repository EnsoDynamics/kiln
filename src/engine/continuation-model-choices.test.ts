// A continuation's model choices (Kiln Phase Model Tiers AC-KEEP-02, KEEP-003): the new execution's
// settings drop a kept choice equal to Kiln's current default and keep every other choice.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { newPrdRecord } from "../state/new-record.js";
import type { ModelChoices } from "../state/records.js";
import type { ContinuationProposal } from "./continuation-readiness.js";
import { newAcceptance } from "./continuation-setup.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-continue-models-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function accepted(modelChoices: ModelChoices) {
  const record = newPrdRecord({ mainCheckoutPath: join(dir, "acme-shop"), repositoryName: "acme-shop", github: "acme/acme-shop", prdDirectoryFromRoot: "docs/prds/customer-returns", featureName: "Customer returns", settings: { workspaceFolder: join(dir, ".worktrees", "customer-returns"), worktreePath: join(dir, ".worktrees", "customer-returns", "acme-shop"), featureBranch: "feature/customer-returns", baseBranch: "develop", bases: {}, keepAwake: true, resumeAfterUsageLimit: true, modelChoices } });
  record.startedAt = "2026-10-01T10:00:00.000Z"; record.completedAt = "2026-10-01T12:00:00.000Z";
  const proposal = { id: "p".repeat(64), repositories: [{ name: "acme-shop", path: join(dir, "acme-shop"), identity: "acme/acme-shop", baseBranch: "develop", baseRevision: "a".repeat(40) }] } as unknown as ContinuationProposal;
  // Kiln checks the state root, two folders above a PRD's state directory, so it sits inside the private temporary folder, not a shared one.
  const stateDirectory = join(dir, "state", "customer-returns");
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  return newAcceptance(record, stateDirectory, proposal, "c".repeat(64), { id: "r1", command_id: "cmd-1" } as Receipt, "2026-11-01T10:00:00.000Z").settings.modelChoices;
}

describe("continuing a finished PRD", () => {
  it("drops a kept choice equal to Kiln's current default, so the added phases take their tiers", () => {
    expect(accepted({ phases: { "2": "default" }, kept: { agentId: "claude_code", model: "opus", effort: "medium" } })).toEqual({ phases: { "2": "default" } });
    expect(accepted({ phases: {}, kept: { agentId: "codex", model: "gpt-6.1-sol", effort: "high" } })).toEqual({ phases: {} });
  });

  it("keeps any other kept choice, marked Changed by you on each added phase, and every entry as it is", () => {
    expect(accepted({ phases: {}, audits: { agentId: "claude_code", model: "sonnet", effort: "low" }, kept: { agentId: "claude_code", model: "opus", effort: "high" } }))
      .toEqual({ phases: {}, audits: { agentId: "claude_code", model: "sonnet", effort: "low" }, kept: { agentId: "claude_code", model: "opus", effort: "high" } });
  });
});
