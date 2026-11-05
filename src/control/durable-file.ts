/** Private metadata authorizes cursor identity; publish only after its bytes are durable. */
import { openSync, closeSync, fsyncSync, renameSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ensurePrivateDirectory } from "../state/state-files.js";
export function writeDurableMetadata(path: string, value: unknown): void {
  const created: string[] = [];
  for (let directory = dirname(path); !existsSync(directory); directory = dirname(directory)) created.push(directory);
  ensurePrivateDirectory(dirname(path));
  if (process.platform !== "win32") for (const directory of created.reverse()) {
    const parent = openSync(dirname(directory), "r"); try { fsyncSync(parent); } finally { closeSync(parent); }
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, path);
    if (process.platform !== "win32") { const parent = openSync(dirname(path), "r"); try { fsyncSync(parent); } finally { closeSync(parent); } }
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
