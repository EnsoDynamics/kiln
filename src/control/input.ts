/** Bounded literal UTF-8 input; filenames are never sent to providers or interpreted by a shell. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { messageProblem } from "../live/target.js";
import { ControlFailure } from "./result.js";
const LIMIT = 32768;
export async function readMessage(file: string | undefined, cwd: string, policy: "reply" | "live" = "reply"): Promise<string> {
  const failure = () => new ControlFailure("invalid_input", "Message input must be UTF-8, at most 32 KiB, and readable within five seconds.", 2);
  let timer: NodeJS.Timeout | undefined;
  const read = async () => {
    let bytes: Buffer;
    if (file) {
      const handle = await open(resolve(cwd, file), constants.O_RDONLY | constants.O_NONBLOCK);
      try { if (!(await handle.stat()).isFile()) throw failure(); const buffer = Buffer.alloc(LIMIT + 1); const got = await handle.read(buffer, 0, buffer.length, 0); bytes = buffer.subarray(0, got.bytesRead); }
      finally { await handle.close(); }
    } else {
      bytes = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []; let size = 0;
        const cleanup = () => { process.stdin.off("data", data); process.stdin.off("end", end); process.stdin.off("error", error); process.stdin.pause(); clearTimeout(deadline); };
        const error = () => { cleanup(); reject(failure()); };
        const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
        const data = (chunk: Buffer) => { size += chunk.length; if (size > LIMIT) error(); else chunks.push(chunk); };
        const deadline = setTimeout(error, 5000);
        process.stdin.on("data", data); process.stdin.once("end", end); process.stdin.once("error", error); process.stdin.resume();
      });
    }
    if (bytes.length > LIMIT) throw failure();
    let message: string; try { message = new TextDecoder("utf-8", { fatal: true, ignoreBOM: policy === "live" }).decode(bytes); } catch { throw failure(); }
    if (policy === "live") { const problem = messageProblem(message); if (problem) throw new ControlFailure("invalid_input", problem, 2); return message; }
    message = message.trim();
    if (!message || message.length > 4000 || message.includes("\0")) throw new ControlFailure("invalid_input", "Reply must contain 1–4,000 characters, without NUL.", 2);
    return message;
  };
  try { return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(failure()), 5000); })]); }
  catch (error) { if (error instanceof ControlFailure) throw error; throw failure(); }
  finally { clearTimeout(timer); }
}
