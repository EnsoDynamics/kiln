// JSON Lines end only at "\n". Node's readline also ends lines at U+2028 and U+2029, which JSON
// (and Codex and Claude history) leave unescaped inside strings, so it splits valid records apart.
import { StringDecoder } from "node:string_decoder";

/**
 * Splits UTF-8 text arriving in chunks into "\n"-terminated lines, scanning each chunk once.
 *   const lines = new JsonLineSplitter();
 *   lines.push(Buffer.from('{"a":"x\u2028y"}\n{"b"')); // → ['{"a":"x\u2028y"}']
 *   lines.push(':1}\n'); lines.end();                 // → ['{"b":1}'], then []
 */
export class JsonLineSplitter {
  private readonly decoder = new StringDecoder("utf8");
  private pending: string[] = [];
  push(chunk: Buffer | string): string[] {
    const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    const lines: string[] = [];
    let start = 0; let newline: number;
    while ((newline = text.indexOf("\n", start)) !== -1) {
      this.pending.push(text.slice(start, newline)); lines.push(this.pending.join("")); this.pending = [];
      start = newline + 1;
    }
    if (start < text.length) this.pending.push(text.slice(start));
    return lines;
  }
  /** The final line when the input does not end with "\n". */
  end(): string[] {
    this.pending.push(this.decoder.end());
    const last = this.pending.join(""); this.pending = [];
    return last ? [last] : [];
  }
}

/** Calls `onLine` for each line of a stream, including an unterminated final line. */
export function onJsonLines(input: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  const lines = new JsonLineSplitter();
  input.on("data", (chunk: Buffer | string) => { for (const line of lines.push(chunk)) onLine(line); });
  input.on("end", () => { for (const line of lines.end()) onLine(line); });
}

/** Iterates the lines of a stream, including an unterminated final line. */
export async function* jsonLines(input: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const lines = new JsonLineSplitter();
  for await (const chunk of input) yield* lines.push(chunk as Buffer | string);
  yield* lines.end();
}
