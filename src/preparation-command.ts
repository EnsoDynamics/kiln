/** Session-facing references only; submissions never run validation or launch providers. */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { findPrd, lookupProblem } from "./add-repository-command.js";
import { recordedInstancePort } from "./state/instance-lock.js";
import { stateRoot } from "./state/state-files.js";
import { TOKEN_HEADER } from "./server/local-server.js";
import type { CommandContext } from "./kiln-command.js";
export async function runPreparation(args: string[], context: CommandContext): Promise<number> {
  const [action, file] = args;
  if (!["status", "submit"].includes(action ?? "") || args.length !== (action === "status" ? 1 : 2)) { context.stderr.write("Usage: kiln preparation status | submit <JSON file>\n"); return 2; }
  try {
    const directory = realpathSync(resolve(context.cwd)); const found = await findPrd(stateRoot(context.env), directory);
    if (found.kind !== "found") throw new Error(`Run this command in the assigned preparation workspace. ${lookupProblem(found, directory)}`);
    const port = recordedInstancePort(found.stateDirectory); if (!port) throw new Error("Kiln is not running for this execution.");
    const address = `http://127.0.0.1:${port}`;
    const state = found.record.preparation; if (!state) throw new Error("No preparation is assigned to this execution.");
    const query = new URLSearchParams({ executionId: found.record.executionId!, phaseId: state.phaseId });
    const body = file ? readFileSync(resolve(context.cwd, file), "utf8") : undefined;
    const response = await fetch(`${address}/api/preparation${action === "status" ? `?${query}` : "/result"}`, { method: action === "status" ? "GET" : "POST", headers: { [TOKEN_HEADER]: found.record.token, Origin: address, "Content-Type": "application/json" }, ...(body ? { body } : {}), signal: AbortSignal.timeout(125_000) });
    context.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`); return response.ok ? 0 : 1;
  } catch (error) { context.stderr.write(`kiln: ${(error as Error).message}\n`); return 1; }
}
