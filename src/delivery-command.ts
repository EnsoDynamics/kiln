/** Structured delivery client; it has no grant or remote-command operation. */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { findPrd } from "./add-repository-command.js";
import { recordedInstancePort } from "./state/instance-lock.js";
import { stateRoot } from "./state/state-files.js";
import { TOKEN_HEADER } from "./server/local-server.js";
import type { CommandContext } from "./kiln-command.js";
export async function runDelivery(args: string[], context: CommandContext): Promise<number> {
  const [action, file] = args;
  if (!action || !["status", "assess", "prepare", "evidence"].includes(action) || args.length !== (action === "status" ? 1 : 2)) { context.stderr.write("Usage: kiln delivery status | assess|prepare|evidence <JSON file>\n"); return 2; }
  try {
    const found = findPrd(stateRoot(context.env), realpathSync(resolve(context.cwd)));
    if (found.kind !== "found") throw new Error("Run this command inside one running Kiln execution's assigned workspace.");
    const port = recordedInstancePort(found.stateDirectory); if (!port) throw new Error("kiln run is not running for this execution.");
    const address = `http://127.0.0.1:${port}`;
    const body = file ? JSON.parse(readFileSync(resolve(context.cwd, file), "utf8")) as unknown : undefined;
    const response = await fetch(`${address}/api/delivery${action === "status" ? "" : `/${action === "assess" ? "assessment" : action}`}`, { method: action === "status" ? "GET" : "POST", headers: { [TOKEN_HEADER]: found.record.token, Origin: address, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(125_000) });
    const answer = await response.json() as { result?: { disposition?: string }; reason?: string };
    context.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
    return response.ok && answer.result?.disposition !== "unresolved" ? 0 : 1;
  } catch (error) { context.stderr.write(`kiln: ${(error as Error).message}\n`); return 1; }
}
