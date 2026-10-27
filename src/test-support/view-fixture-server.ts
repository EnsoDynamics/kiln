// Serves the built browser view the way Kiln's local server does (the page, its assets, and
// the same security headers and Content Security Policy), with a fixture Snapshot on the event
// stream in place of a running engine, so a real browser can render each screen from a
// mockup's sample data (technical design, Testing Approach, "The view").

import { readFileSync, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "../engine/snapshot.js";
import { SECURITY_HEADERS } from "../server/local-server.js";
import type { OutputLine } from "../session/session-output.js";

const VIEW = fileURLToPath(new URL("../../dist/view/", import.meta.url));
const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

export interface ViewFixtureServer {
  readonly address: string;
  /** Sends a new snapshot, or any other event, to every open page. */
  send(event: "snapshot" | "output" | "partial", data: unknown): void;
  /** The commands pages sent, `POST /api/pause` and so on, with any JSON body after a space. */
  readonly commands: string[];
  close(): Promise<void>;
}

/**
 *   const server = await serveViewFixture({ port: 41250, folder: "customer-returns", snapshot: runningSnapshot() });
 *   server.address  // "http://127.0.0.1:41250/customer-returns"
 */
export async function serveViewFixture(options: {
  port: number;
  folder: string;
  snapshot: Snapshot;
  output?: OutputLine[];
  /** How often heartbeats go out; 0 sends none, as a Kiln that hangs with the stream still open. */
  heartbeatMs?: number;
  /** Commands refused with a 409 and this reason, keyed `METHOD /path`. */
  refuse?: Record<string, string>;
  /** Controlled response for browser workflow tests; production HTTP behavior is tested separately. */
  respond?: (command: string, body: string, headers: IncomingHttpHeaders) => Promise<{ status: number; body: unknown } | null>;
}): Promise<ViewFixtureServer> {
  if (!existsSync(join(VIEW, "index.html"))) throw new Error("The view isn't built; run npm run build first.");
  let snapshot = options.snapshot;
  const streams = new Set<ServerResponse>();
  const commands: string[] = [];
  const root = `/${options.folder}`;
  const headers = (type: string) => ({ ...SECURITY_HEADERS, "Content-Type": type });

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/events") {
      response.writeHead(200, { ...headers("text/event-stream"), Connection: "keep-alive" });
      streams.add(response);
      write(response, "snapshot", snapshot);
      const every = options.heartbeatMs ?? 1000;
      const heartbeat = every > 0 ? setInterval(() => write(response, "heartbeat", new Date().toISOString()), every) : undefined;
      request.on("close", () => {
        clearInterval(heartbeat);
        streams.delete(response);
      });
      return;
    }
    if (url.pathname.startsWith("/api/sessions/")) {
      const before = Number.parseInt(url.searchParams.get("before") ?? "", 10);
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 200;
      const all = options.output ?? [];
      const lines = all.filter((line) => !Number.isFinite(before) || line.line < before).slice(-limit);
      response.writeHead(200, headers("application/json"));
      response.end(JSON.stringify({ lines, total: all.length }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      request.setEncoding("utf8").on("data", (chunk: string) => (body += chunk));
      request.on("end", async () => {
        const command = `${request.method} ${url.pathname}`;
        commands.push(body ? `${command} ${body}` : command);
        if (options.respond) {
          const answer = await options.respond(command, body, request.headers);
          if (!answer) { response.destroy(); return; }
          response.writeHead(answer.status, headers("application/json")); response.end(JSON.stringify(answer.body)); return;
        }
        const refused = options.refuse?.[command];
        response.writeHead(refused ? 409 : 200, headers("application/json"));
        response.end(JSON.stringify(refused ? { ok: false, reason: refused } : { ok: true }));
      });
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      const file = resolve(VIEW, `.${url.pathname}`);
      if (!file.startsWith(resolve(VIEW) + sep) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, headers(TYPES[extname(file)] ?? "application/octet-stream"));
      response.end(readFileSync(file));
      return;
    }
    if (url.pathname === root || url.pathname.startsWith(`${root}/`)) {
      const html = readFileSync(join(VIEW, "index.html"), "utf8")
        .replace("__KILN_TITLE__", () => `${snapshot.feature.name} · Kiln`)
        .replace("__KILN_TOKEN__", () => "fixture-token")
        .replace("__KILN_BASE__", () => root);
      response.writeHead(200, headers("text/html; charset=utf-8"));
      response.end(html);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolveListen());
  });

  return {
    address: `http://127.0.0.1:${options.port}${root}`,
    commands,
    send(event, data) {
      if (event === "snapshot") snapshot = data as Snapshot;
      for (const stream of streams) write(stream, event, data);
    },
    close: () =>
      new Promise<void>((resolveClose) => {
        for (const stream of streams) stream.destroy();
        server.close(() => resolveClose());
        server.closeAllConnections();
      }),
  };
}

function write(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
