// AC-AGENT-03, AC-TAKE-01/02: replay each recorded real-Claude hook contract (every hook input a
// newer Claude Code sent during npm run test:live-proof, in order) through the packaged
// checkpoint hook. Kiln recognises every input, admits and settles the operations, denies new
// work once the takeover is held and stops the batch, exactly as it answered the live run.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createGate, readGate, withGate } from "./gate.js";
import { compareToMinimum, TOOLING_MINIMUMS } from "../agents/tooling-minimums.js";
import type { LiveTarget } from "./target.js";

const helper = fileURLToPath(new URL("../../dist/live/checkpoint-hook.js", import.meta.url));
const fixtures = new URL("../../test/fixtures/live-control/", import.meta.url);
const versions = readdirSync(fixtures).map(name => /^claude-(.+)-hook-contract\.json$/.exec(name)?.[1]).filter((version): version is string => !!version);
interface HookCall { input: Record<string, unknown>; status: number; answer: Record<string, unknown> | null }
const holds = (call: HookCall) => (call.answer?.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision === "deny" || call.answer?.continue === false;

it("has the minimum's recorded hook contract and one from a newer Claude Code", () => {
  expect(versions).toContain(TOOLING_MINIMUMS.claudeCode);
  expect(versions.some(version => compareToMinimum("claudeCode", version).state === "supported" && version !== TOOLING_MINIMUMS.claudeCode)).toBe(true);
});

it.each(versions)("answers every hook input recorded on Claude Code %s as the live run did, with the contract recognised", async version => {
  const contract = JSON.parse(readFileSync(new URL(`claude-${version}-hook-contract.json`, fixtures), "utf8")) as { provenance: { cliVersion: string }; target: LiveTarget; calls: HookCall[] };
  expect(contract.provenance.cliVersion).toBe(version);
  const root = mkdtempSync(join(tmpdir(), "kiln-hook-replay-"));
  createGate(root, contract.target);
  try {
    for (const call of contract.calls) {
      // The live run's hold was set from outside the hook; it is set here before the first answer that shows it.
      if (holds(call) && !readGate(root).held) await withGate(root, state => { state.held = { operationId: "proof", instructionId: "proof", requestedAt: new Date().toISOString() }; });
      const answer = spawnSync(process.execPath, [helper, root], { input: JSON.stringify(call.input), encoding: "utf8", timeout: 10000 });
      expect(answer.status, answer.stderr).toBe(call.status);
      expect(answer.stdout.trim() ? JSON.parse(answer.stdout) : null).toEqual(call.answer);
    }
    const gate = readGate(root);
    expect(gate.contract).toBeUndefined();
    expect(contract.calls.map(call => call.input.hook_event_name)).toEqual(expect.arrayContaining(["PreToolUse", "PostToolUse", "PostToolBatch"]));
    expect(contract.calls.some(holds)).toBe(true);
    expect(Object.keys(gate.operations).length).toBeGreaterThan(0);
    expect(Object.values(gate.operations).every(operation => operation.hookSettled)).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
