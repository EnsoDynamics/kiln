// AC-NEWER-01, AC-NEWER-02, AC-NEWER-04: a release build asks npm once for Kiln's latest version and
// answers it only when it is strictly newer; anything else, a development build included, answers nothing.
// A real HTTP server on loopback stands in for the registry.

import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newerKilnVersion } from "./newer-version.js";

const release = { kind: "release" } as const;
let server: Server;
let registry: string;
let answer: { status: number; body: string; delayMs?: number };
let requests: { url: string | undefined; method: string | undefined; headers: IncomingHttpHeaders }[];

beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, headers: request.headers });
    setTimeout(() => response.writeHead(answer.status, { "Content-Type": "application/json" }).end(answer.body), answer.delayMs ?? 0);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
beforeEach(() => { requests = []; });

const latest = (version: unknown) => { answer = { status: 200, body: JSON.stringify({ name: "@ensodynamics/kiln", version }) }; };

describe("newerKilnVersion", () => {
  it("answers npm's latest when it is strictly newer than the running release", async () => {
    latest("1.2.0");
    expect(await newerKilnVersion("1.1.6", release, { registry })).toBe("1.2.0");
    latest("1.1.10");
    expect(await newerKilnVersion("1.1.9", release, { registry })).toBe("1.1.10");
    latest("2.0.0");
    expect(await newerKilnVersion("1.9.9", release, { registry })).toBe("2.0.0");
  });

  it("answers nothing when npm's latest is the same or older, as for a local build ahead of npm", async () => {
    latest("1.1.6");
    expect(await newerKilnVersion("1.1.6", release, { registry })).toBeUndefined();
    latest("1.1.6");
    expect(await newerKilnVersion("1.2.0", release, { registry })).toBeUndefined();
  });

  it("never asks npm from a development build or from source", async () => {
    latest("9.0.0");
    expect(await newerKilnVersion("1.1.6", { kind: "development", builtAt: "2026-11-13T15:00:00Z" }, { registry })).toBeUndefined();
    expect(await newerKilnVersion("1.1.6", undefined, { registry })).toBeUndefined();
    expect(requests).toEqual([]);
  });

  it("asks only for Kiln's own package, carrying nothing of the person's", async () => {
    latest("1.2.0");
    await newerKilnVersion("1.1.6", release, { registry });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: "/@ensodynamics/kiln/latest", method: "GET" });
    expect(requests[0]!.headers.accept).toBe("application/json");
    expect(Object.keys(requests[0]!.headers).filter(name => !["host", "accept", "user-agent", "accept-encoding", "accept-language", "sec-fetch-mode", "connection"].includes(name))).toEqual([]);
    expect(JSON.stringify(requests[0]!.headers)).not.toContain("1.1.6");
  });

  it("answers nothing for a prerelease or a version it can't read", async () => {
    for (const version of ["1.2.0-beta.1", "v1.2.0", "1.2", 120, undefined]) {
      latest(version);
      expect(await newerKilnVersion("1.1.6", release, { registry })).toBeUndefined();
    }
  });

  it("answers nothing, without an error, when npm fails, answers garbage or is too slow", async () => {
    answer = { status: 500, body: "{}" };
    expect(await newerKilnVersion("1.1.6", release, { registry })).toBeUndefined();
    answer = { status: 200, body: "not json" };
    expect(await newerKilnVersion("1.1.6", release, { registry })).toBeUndefined();
    answer = { status: 200, body: JSON.stringify({ version: "1.2.0" }), delayMs: 500 };
    const started = Date.now();
    expect(await newerKilnVersion("1.1.6", release, { registry, timeoutMs: 100 })).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(400);
    expect(await newerKilnVersion("1.1.6", release, { registry: "http://127.0.0.1:1" })).toBeUndefined();
  });
});
