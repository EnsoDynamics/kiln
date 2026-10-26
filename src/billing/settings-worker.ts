// Disposable passive inventory only. Never initialize a session, execute a helper, or emit raw errors.
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";
import { extractInventory, emptyInventory } from "./contract.js";
try {
  const result = extractInventory(await resolveSettings({ cwd: process.cwd(), settingSources: ["user", "project", "local"] }));
  const encoded = JSON.stringify(result);
  process.stdout.write(Buffer.byteLength(encoded) <= 2 * 1024 * 1024 ? encoded : JSON.stringify(emptyInventory("inventory_result_limit")));
} catch { process.stdout.write(JSON.stringify(emptyInventory("inventory_read_failed"))); }
