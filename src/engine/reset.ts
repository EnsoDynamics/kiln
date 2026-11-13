// Reset Kiln for a PRD (run restart AC-RESET-01 to 06; technical design "Reset"): what a reset
// forgets, the fresh not-started record it writes, the discard of the rest of the PRD's state
// directory, and the finishing of a reset a stop or a failing step left behind.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { newBillingState } from "../billing/authority.js";
import { readReceipts, type Receipt, type ResetForgets } from "../control/commands.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { newPrdRecord } from "../state/new-record.js";
import { readPrdRecord, writePrdRecord, type PrdRecord } from "../state/records.js";
import { defaultSettings } from "./worktree-setup.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** What the reset confirmation shows, read when it opens (technical design "The confirmation"). */
export interface ResetPreview {
  forgets: ResetForgets;
  stays: { repository: string; branch: string; ownCommits?: number; worktree?: string; uncommittedFiles?: number; pullRequests: { number: number; url: string }[]; unknown: string[] }[];
  /** Leaves Closed in the plan on the feature branch, PRD's repository. */
  closedOnBranch?: number;
}

/** The reason a step that throws gives (technical design "Reset", A step that fails). */
export function resetFailureReason(error: unknown): string {
  return `The reset didn't finish: ${error instanceof Error ? error.message : String(error)}. Run kiln run again to finish it.`;
}

/**
 * What a reset forgets, counted from the record (the confirmation's first column, AC-RESET-03).
 *
 *   resetForgets(record)  // { phaseResults: 2, sessions: 3, stops: 1, waivers: 0, audits: 0, deliveries: 0 }
 */
export function resetForgets(record: PrdRecord): ResetForgets {
  const phases = Object.values(record.phases);
  return {
    phaseResults: phases.filter(facts => facts.doneAt !== undefined || facts.stop !== undefined).length,
    sessions: new Set(phases.flatMap(facts => facts.sessionIds)).size,
    stops: phases.filter(facts => facts.stop !== undefined).length,
    waivers: record.waivers?.length ?? 0,
    audits: record.completionAudits?.activities.length ?? 0,
    deliveries: record.continuation?.executions.length ?? 0,
  };
}

/**
 * The fresh not-started record a reset writes (step 3), as a first `kiln run` writes one: default
 * settings with no origin read, the old record's GitHub repository and page token, and the reset's
 * new execution ID. It reads nothing from Git or GitHub, so finishing a reset can repeat it.
 */
export function freshResetRecord(old: PrdRecord, executionId: string): PrdRecord {
  const paths = { mainCheckoutPath: old.repository.mainCheckoutPath, repositoryName: old.repository.name, folderName: basename(old.prdDirectory), prdDirectoryFromRoot: old.prdDirectory };
  const record = newPrdRecord({ mainCheckoutPath: paths.mainCheckoutPath, repositoryName: paths.repositoryName, github: old.repository.github, prdDirectoryFromRoot: paths.prdDirectoryFromRoot, featureName: old.featureName, settings: defaultSettings(paths, undefined) });
  return { ...record, executionId, billing: newBillingState(executionId), token: old.token };
}

/**
 * Step 4: deletes everything in the PRD's state directory except the instance lock, the record
 * step 3 wrote, the receipt files of this and every earlier reset, their command-index entries and
 * the sequence cursor (technical design "How reset discards").
 */
export function discardResetState(stateDirectory: string): void {
  const resets = readReceipts(stateDirectory).filter(receipt => receipt.instruction.action === "reset");
  const keptReceipts = new Set(resets.map(receipt => join("controls", hash(receipt.execution_id), `${hash(receipt.command_id)}.json`)));
  const keptIndex = new Set(resets.map(receipt => join("control-index", `${hash(receipt.command_id)}.json`)));
  keptIndex.add(join("control-index", "sequence.json"));
  for (const entry of readdirSync(stateDirectory)) {
    if (entry === "instance.lock" || entry === "prd.json") continue;
    if (entry === "controls" || entry === "control-index") {
      for (const inner of readdirSync(join(stateDirectory, entry))) {
        const relative = join(entry, inner);
        if (entry === "control-index") { if (!keptIndex.has(relative)) rmSync(join(stateDirectory, relative), { recursive: true, force: true }); continue; }
        // A receipt directory per execution: keep only the reset receipts in it.
        const files = readdirSync(join(stateDirectory, relative));
        for (const file of files) if (!keptReceipts.has(join(relative, file))) rmSync(join(stateDirectory, relative, file), { recursive: true, force: true });
        if (readdirSync(join(stateDirectory, relative)).length === 0) rmSync(join(stateDirectory, relative), { recursive: true, force: true });
      }
      continue;
    }
    rmSync(join(stateDirectory, entry), { recursive: true, force: true });
  }
}

/** Steps 3 and 4, whichever remain for a reset whose new execution is `executionId`. */
export function finishResetSteps(stateDirectory: string, executionId: string): void {
  const record = readPrdRecord(stateDirectory);
  if (record && record.executionId !== executionId) writePrdRecord(stateDirectory, freshResetRecord(record, executionId));
  discardResetState(stateDirectory);
}

/**
 * Recovery, before `kiln run` reads the record (technical design "Reset", Recovery): a reset receipt
 * that never settled is finished and settled `completed`, or, when it recorded nothing to discard,
 * settled `failed`, `not_applied`. Returns whether a reset was finished, so the run starts as a first run.
 */
export function recoverReset(stateDirectory: string): boolean {
  if (!existsSync(join(stateDirectory, "controls"))) return false;
  let finished = false;
  for (const receipt of readReceipts(stateDirectory).filter(one => one.instruction.action === "reset" && one.stage !== "settled" || one.instruction.action === "reset" && one.state === "indeterminate")) {
    const settled: Receipt = { ...receipt, stage: "settled", updated_at: new Date().toISOString() };
    if (!receipt.reset) Object.assign(settled, { state: "failed", outcome: "not_applied", reason: "The reset stopped before it discarded anything. Nothing was reset." });
    else {
      finishResetSteps(stateDirectory, receipt.reset.new_execution_id);
      Object.assign(settled, { state: "completed", outcome: "reset", reason: null });
      finished = true;
    }
    writeDurableMetadata(join(stateDirectory, "controls", hash(receipt.execution_id), `${hash(receipt.command_id)}.json`), { checksum: hash(settled), receipt: settled });
  }
  return finished;
}
