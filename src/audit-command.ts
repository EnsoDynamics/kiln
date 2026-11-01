/** The audit client only submits bounded data to the existing authenticated loopback owner. */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { findPrd } from "./add-repository-command.js";
import { recordedInstancePort } from "./state/instance-lock.js";
import { stateRoot } from "./state/state-files.js";
import { TOKEN_HEADER } from "./server/local-server.js";
import { strictJson } from "./audit/storage.js";
import type { CommandContext } from "./kiln-command.js";

export async function runAudit(args: string[], context: CommandContext): Promise<number> {
  const [action, file] = args;
  if (!action || !["status", "snapshot", "submit"].includes(action) || (action === "submit" ? args.length !== 2 : args.length > (action === "status" ? 1 : 2))) { context.stderr.write("Usage: kiln audit status | submit <JSON file>\n"); return 2; }
  try {
    const found = findPrd(stateRoot(context.env), realpathSync(resolve(context.cwd)));
    if (found.kind !== "found") throw new Error("Run this command inside one running Kiln execution's assigned workspace.");
    const port = recordedInstancePort(found.stateDirectory); if (!port) throw new Error("kiln run is not running for this execution.");
    const address = `http://127.0.0.1:${port}`;
    // The retired snapshot command still reaches Kiln, which refuses it without changing state.
    const body = action === "status" ? undefined : file ? strictJson(readFileSync(resolve(context.cwd, file), "utf8")) : {};
    const route = action === "status" ? "" : `/${action === "submit" ? "result" : "snapshot"}`;
    const response = await fetch(`${address}/api/audit${route}`, { method: action === "status" ? "GET" : "POST", headers: { [TOKEN_HEADER]: found.record.token, Origin: address, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(125_000) });
    const answer = await response.json() as { disposition?: string };
    context.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
    return response.ok && answer.disposition !== "unresolved" ? 0 : 1;
  } catch (error) { context.stderr.write(`kiln: ${(error as Error).message}\n`); return 1; }
}
