// Disposable passive inventory only. Never initialize a session, execute a helper, or emit raw errors.
// Passivity rests on the Agent SDK's documented resolver contract, checked by the
// passive boundary test's canaries. An SDK without the resolver yields no inventory.
import { emptyInventory, resolveInventory } from "./contract.js";
try {
  const encoded = JSON.stringify(await resolveInventory(await import("@anthropic-ai/claude-agent-sdk"), process.cwd()));
  process.stdout.write(Buffer.byteLength(encoded) <= 2 * 1024 * 1024 ? encoded : JSON.stringify(emptyInventory("inventory_result_limit")));
} catch { process.stdout.write(JSON.stringify(emptyInventory("inventory_read_failed"))); }
