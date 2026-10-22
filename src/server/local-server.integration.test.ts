// The local server against a real engine and the built view: reachable only from this machine
// and closed to other web pages (PRD AC-VIEW-01, AC-VIEW-06), one address per PRD
// (AC-MULTI-02), and the HTTP API reaching the engine only through its commands.

import { writeFileSync } from "node:fs";
import { request } from "node:http";
import { networkInterfaces } from "node:os";
import { connect } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isPortFree } from "../state/instance-lock.js";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let harness: Harness | undefined;
let server: LocalServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  // A base check a connecting view started may still be running git in the repository.
  if (harness) await waitFor(() => harness!.engine.baseCheck !== "checking");
  await harness?.cleanup();
});

/** The next free port in this file's range, 41180 to 41199; kiln-run-repositories takes 41160 to 41179. */
async function freePort(): Promise<number> {
  for (let port = 41180; port < 41200; port++) if (await isPortFree(port)) return port;
  throw new Error("No free port for the test.");
}

async function serve(sessions = [landingSession()]) {
  harness = await createHarness({ sessions });
  const port = await freePort();
  server = await startLocalServer({ engine: harness.engine, port, folderName: "customer-returns", featureName: "Customer returns", token: harness.engine.record.token, heartbeatMs: 100 });
  return { h: harness, port, origin: `http://127.0.0.1:${port}`, token: harness.engine.record.token };
}

/** A raw request, so a test can send any Host and Origin a browser or another page might. */
function raw(port: number, path: string, headers: Record<string, string>, method = "GET", body?: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { ...headers, ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {}) } }, (res) => {
      let text = "";
      res.setEncoding("utf8").on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("the local server", () => {
  it("serves the view at its one address, with the feature in the tab's title and the PRD's token in the page", async () => {
    const { port, origin, token } = await serve();
    const page = await fetch(`${origin}/customer-returns`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<title>Customer returns · Kiln</title>");
    expect(html).toContain(`<meta name="kiln-token" content="${token}">`);
    // A trailing slash redirects, so the view has one address; client routes beneath it serve the view.
    const slash = await raw(port, "/customer-returns/", { Host: `127.0.0.1:${port}` });
    expect(slash.status).toBe(308);
    expect(slash.headers.location).toBe("/customer-returns");
    expect((await fetch(`${origin}/customer-returns/phase/2b`)).status).toBe(200);
    // Another PRD's path isn't served here.
    expect((await fetch(`${origin}/gift-cards`)).status).toBe(404);

    // The built assets, fonts included, come from Kiln itself (AC-INSTALL-02).
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]!);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) expect((await fetch(`${origin}${asset}`)).status).toBe(200);
    const css = await (await fetch(`${origin}${assets.find((asset) => asset.endsWith(".css"))}`)).text();
    // The three typefaces are bundled (AC-LOOK-04, AC-INSTALL-02), and nothing loads from elsewhere.
    for (const font of ["instrument-serif-latin-400", "inter-latin-400", "inter-latin-600", "jetbrains-mono-latin-400"]) {
      expect(css).toMatch(new RegExp(`url\\(/assets/${font}-normal-[^)]+\\.woff2\\)`));
    }
    expect(css).not.toMatch(/https?:\/\//);
    const script = await (await fetch(`${origin}${assets.find((asset) => asset.endsWith(".js"))}`)).text();
    expect(script).not.toMatch(/fonts\.googleapis|fetch\(["'`]https?:/);
    // The feature name is the largest text: no other size reaches the h1's smallest, 48px (AC-LOOK-02).
    expect(css).toMatch(/h1\.svelte-[a-z0-9]+\{[^}]*font-size:clamp\(48px,6\.4vw,76px\)/);
    const sizes = [...css.matchAll(/font-size:([\d.]+)px/g)].map((match) => Number(match[1]));
    expect(Math.max(...sizes)).toBeLessThan(48);
    // Each color has one role (AC-LOOK-04): amber for messages that need the person, green for done, red for the keep-awake box.
    expect(css).toMatch(/\.message\.svelte-[a-z0-9]+\{[^}]*color:var\(--amber\)/);
    expect(css).toMatch(/\.closed\.svelte-[a-z0-9]+\{[^}]*color:var\(--green\)/);
    expect(css).toMatch(/\.awake\.svelte-[a-z0-9]+ input:where\(\.svelte-[a-z0-9]+\)\{accent-color:var\(--red\)\}/);
    expect(css).toMatch(/--red:#e2694f;--red-hover:#f0866e;--amber:#e6b450/);
    // A path outside the view's folder isn't served.
    expect((await raw(port, "/assets/../../package.json", { Host: `127.0.0.1:${port}` })).status).toBe(404);
  });

  it("answers only at its own Host, which defeats DNS rebinding", async () => {
    const { port, token } = await serve();
    expect((await raw(port, "/customer-returns", { Host: `127.0.0.1:${port}` })).status).toBe(200);
    expect((await raw(port, "/customer-returns", { Host: `localhost:${port}` })).status).toBe(200);
    for (const host of ["evil.example", `evil.example:${port}`, `127.0.0.1:${port + 1}`, "127.0.0.1"]) {
      expect((await raw(port, "/customer-returns", { Host: host })).status, host).toBe(403);
      expect((await raw(port, "/api/snapshot", { Host: host, "X-Kiln-Token": token })).status, host).toBe(403);
    }
  });

  it("refuses API requests without the PRD's token, and changes from another site's Origin", async () => {
    const { h, port, token } = await serve();
    const host = `127.0.0.1:${port}`;
    expect((await raw(port, "/api/snapshot", { Host: host })).status).toBe(403);
    expect((await raw(port, "/api/snapshot", { Host: host, "X-Kiln-Token": "0".repeat(64) })).status).toBe(403);
    // The token goes in a header for fetches; only the event stream takes it as a query parameter.
    expect((await raw(port, `/api/snapshot?token=${token}`, { Host: host })).status).toBe(403);
    const snapshot = await raw(port, "/api/snapshot", { Host: host, "X-Kiln-Token": token });
    expect(snapshot.status).toBe(200);
    expect(JSON.parse(snapshot.body).feature.name).toBe("Customer returns");

    const change = JSON.stringify({ effort: "low" });
    // A change with no Origin, or another site's, is refused even with the token.
    expect((await raw(port, "/api/settings", { Host: host, "X-Kiln-Token": token }, "POST", change)).status).toBe(403);
    expect((await raw(port, "/api/settings", { Host: host, "X-Kiln-Token": token, Origin: "https://evil.example" }, "POST", change)).status).toBe(403);
    expect((await raw(port, "/api/settings", { Host: host, "X-Kiln-Token": token, Origin: `http://localhost:${port}` }, "POST", change)).status).toBe(403);
    expect((await raw(port, "/api/settings", { Host: host, "X-Kiln-Token": token, Origin: "null" }, "POST", change)).status).toBe(403);
    expect((await raw(port, "/api/start", { Host: host, Origin: `http://${host}` }, "POST", JSON.stringify({ refinementConfirmed: true }))).status).toBe(403);
    // Every control and every read: Start, Pause, Keep going and Check again from another site, and output without the token.
    for (const [method, path] of [["POST", "/api/start"], ["POST", "/api/pause"], ["DELETE", "/api/pause"], ["POST", "/api/check-again"], ["POST", "/api/resume"], ["POST", "/api/outside-confirmation"], ["DELETE", "/api/outside-confirmation"]] as const) {
      expect((await raw(port, path, { Host: host, "X-Kiln-Token": token, Origin: "https://evil.example" }, method, JSON.stringify({ refinementConfirmed: true }))).status, `${method} ${path}`).toBe(403);
    }
    expect((await raw(port, "/api/sessions/any/output", { Host: host })).status).toBe(403);
    // Multi-repo AC-OUTSIDE-03: with the token and Kiln's own Origin, the confirmation reaches the engine, which refuses it while nothing has failed.
    const confirm = await raw(port, "/api/outside-confirmation", { Host: host, "X-Kiln-Token": token, Origin: `http://${host}` }, "POST");
    expect(confirm.status).toBe(409);
    expect(JSON.parse(confirm.body).reason).toBe("Stayed in the workspace hasn't failed, so there is nothing to confirm.");
    expect(h.engine.record.settings.effort).toBe("high");
    expect(h.engine.record.startedAt).toBeUndefined();

    const allowed = await raw(port, "/api/settings", { Host: host, "X-Kiln-Token": token, Origin: `http://${host}` }, "POST", change);
    expect(allowed.status).toBe(200);
    expect(h.engine.record.settings.effort).toBe("low");
  });

  it("sends no CORS headers, and every response forbids caching, sniffing and framing", async () => {
    const { port, token } = await serve();
    const host = `127.0.0.1:${port}`;
    for (const response of [
      await raw(port, "/customer-returns", { Host: host, Origin: "https://evil.example" }),
      await raw(port, "/api/snapshot", { Host: host, "X-Kiln-Token": token, Origin: "https://evil.example" }),
      await raw(port, "/api/snapshot", { Host: host }),
      await raw(port, "/api/snapshot", { Host: host, "X-Kiln-Token": token }, "OPTIONS"),
    ]) {
      expect(Object.keys(response.headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      // Nothing the view loads or sends leaves the machine (AC-INSTALL-02): every source is Kiln's own origin.
      expect(response.headers["content-security-policy"]).toBe(
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
    }
  });

  it("listens on loopback only, never on the machine's network addresses", async () => {
    const { port } = await serve();
    const external = Object.values(networkInterfaces())
      .flat()
      .filter((address) => address && !address.internal && address.family === "IPv4")
      .map((address) => address!.address);
    // Not on IPv6 loopback either: only 127.0.0.1 is bound.
    for (const address of ["::1", ...external]) {
      const reached = await new Promise<boolean>((resolve) => {
        const socket = connect({ host: address, port }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
        socket.setTimeout(2000, () => {
          socket.destroy();
          resolve(false);
        });
      });
      expect(reached, address).toBe(false);
    }
  });

  it("streams a snapshot on connect and on every change, with a heartbeat, and runs the base check when a view connects", async () => {
    const { h, origin, token } = await serve();
    expect((await fetch(`${origin}/api/events`)).status).toBe(403);
    const abort = new AbortController();
    const response = await fetch(`${origin}/api/events?token=${token}`, { signal: abort.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    const events = () => [...text.matchAll(/^event: (\w+)$/gm)].map((match) => match[1]);
    const snapshots = () => [...text.matchAll(/^event: snapshot\ndata: (.*)$/gm)].map((match) => JSON.parse(match[1]!));
    const readUntil = async (condition: () => boolean) => {
      while (!condition()) text += (await reader.read()).value ?? "";
    };
    await readUntil(() => events().includes("heartbeat") && snapshots().some((snapshot) => snapshot.settings.baseCheck === "ok"));
    expect(events()[0]).toBe("snapshot");
    const last = snapshots().at(-1);
    expect(last.settings).toMatchObject({ baseBranch: "develop", baseBranches: ["develop"], baseCheck: "ok", fieldErrors: {} });

    // A change reaches the open view without a reload.
    await h.engine.changeSettings({ keepAwake: false });
    await readUntil(() => snapshots().at(-1).settings.keepAwake === false);
    abort.abort();
  });

  it("streams a working session's live text, then its finished line (AC-WATCH-05)", async () => {
    const landing = landingSession();
    const session = { actions: [landing.actions[0]!, { partial: "Building " }, { partial: "the phase." }, { text: "Building the phase." }, ...landing.actions.slice(1)] };
    const { h, origin, token } = await serve([session]);
    const abort = new AbortController();
    const response = await fetch(`${origin}/api/events?token=${token}`, { signal: abort.signal });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    const data = (event: string) => [...text.matchAll(new RegExp(`^event: ${event}\\ndata: (.*)$`, "gm"))].map((match) => JSON.parse(match[1]!));
    // A connecting view runs the base check, which Start waits out.
    await waitFor(() => h.engine.baseCheck === "ok");
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    while (!data("output").some((event) => event.lines.some((line: { text: string }) => line.text === "Building the phase."))) text += (await reader.read()).value ?? "";
    const sessionId = h.engine.latestSession("1")!.sessionId;
    expect(data("partial")).toEqual([
      { sessionId, source: "claude", text: "Building " },
      { sessionId, source: "claude", text: "the phase." },
    ]);
    // The live text comes before its finished line, which replaces it.
    expect(text.indexOf("event: partial")).toBeLessThan(text.indexOf('"text":"Building the phase."'));
    abort.abort();
    await h.engine.settled();
  });

  it("passes the engine's refusals on, with their reasons and field messages", async () => {
    const { h, origin, token } = await serve();
    const post = async (path: string, body?: unknown, method = "POST") => {
      const response = await fetch(`${origin}${path}`, { method, headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: (await response.json()) as { reason?: string; settings: { fieldErrors: Record<string, string> } } };
    };
    expect(await post("/api/settings", { effort: "extreme" })).toMatchObject({ status: 400 });
    expect(await post("/api/settings", { colour: "red" })).toMatchObject({ status: 400, body: { reason: "Unknown setting: colour." } });
    expect(await post("/api/settings", { keepAwake: "yes" })).toMatchObject({ status: 400 });
    const taken = await post("/api/settings", { featureBranch: "develop" });
    expect(taken.body.settings.fieldErrors.featureBranch).toBe("That branch already exists. Choose a name no branch has; a new name starts this PRD over from develop.");
    expect(await post("/api/start", { refinementConfirmed: true })).toMatchObject({ status: 409, body: { fieldErrors: { featureBranch: expect.any(String) } } });
    await post("/api/settings", { featureBranch: "feature/customer-returns" });
    // Nothing to pause or check before Start.
    expect(await post("/api/pause")).toMatchObject({ status: 409, body: { reason: "Nothing is running to pause after." } });
    expect(await post("/api/pause", undefined, "DELETE")).toMatchObject({ status: 409 });
    expect(await post("/api/check-again")).toMatchObject({ status: 409 });

    expect(await post("/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await h.engine.settled();
    // The worktree and branches are fixed once Start is pressed (AC-START-06).
    expect(await post("/api/settings", { worktreePath: "/elsewhere" })).toMatchObject({ status: 409 });
    expect(await post("/api/start", { refinementConfirmed: true })).toMatchObject({ status: 409 });
    // A session's full output pages by line number.
    const sessionId = h.engine.latestSession("1")!.sessionId;
    const page = await fetch(`${origin}/api/sessions/${sessionId}/output?limit=2`, { headers: { "X-Kiln-Token": token } });
    const output = (await page.json()) as { lines: { line: number; at: string }[]; total: number };
    expect(output.lines).toHaveLength(2);
    expect(output.lines.at(-1)!.line).toBe(output.total);
    // Earlier output loads page by page, each line timestamped (AC-WATCH-05, AC-WATCH-10).
    const pageBefore = async (before: number, limit: number) =>
      (await (await fetch(`${origin}/api/sessions/${sessionId}/output?before=${before}&limit=${limit}`, { headers: { "X-Kiln-Token": token } })).json()) as typeof output;
    expect((await pageBefore(output.total, 1)).lines.map((line) => line.line)).toEqual([output.total - 1]);
    expect((await pageBefore(3, 200)).lines.map((line) => line.line)).toEqual([1, 2]);
    expect((await pageBefore(1, 200)).lines).toEqual([]);
    const all = await pageBefore(output.total + 1, 1000);
    expect(all.lines.map((line) => line.line)).toEqual(Array.from({ length: output.total }, (_, index) => index + 1));
    for (const line of all.lines) expect(new Date(line.at).toISOString()).toBe(line.at);
    expect((await fetch(`${origin}/api/sessions/nope/output`, { headers: { "X-Kiln-Token": token } })).status).toBe(404);
  });

  it("carries out each control the view sends: Pause, Keep going, Check again, and Start after a pause (AC-VIEW-02, AC-VIEW-03)", async () => {
    const { h, origin, token } = await serve([]);
    const release = join(h.sandbox.root, "release");
    // Phase 1 closes and commits but doesn't push, so it stops at Needs you; 2b then lands.
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, { close: true }, { commit: "feat: intake" }, { result: "Done." }] }, landingSession("src/credit.txt")] }));
    const send = async (method: string, path: string, body?: unknown) =>
      (await fetch(`${origin}${path}`, { method, headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).status;

    expect(await send("POST", "/api/start", { refinementConfirmed: true })).toBe(200);
    await waitFor(() => h.claudeCalls().length === 1);
    expect(await send("POST", "/api/pause")).toBe(200);
    expect(h.engine.record.pause.requestedAt).toBeDefined();
    expect(await send("DELETE", "/api/pause")).toBe(200);
    expect(h.engine.record.pause.requestedAt).toBeUndefined();
    expect(await send("POST", "/api/pause")).toBe(200);

    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    expect(await send("POST", "/api/check-again")).toBe(200);
    await h.engine.settled();
    expect(h.engine.record.phases["1"]).toMatchObject({ finishedByPerson: true, doneAt: expect.any(String) });
    // The pause pressed before the stop holds once the phase is Done; Start with no body carries on.
    expect(h.engine.record.pause.activeSince).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(await send("POST", "/api/start")).toBe(200);
    await waitFor(() => h.claudeCalls().length === 2);
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-2b-store-credit.md");
    await h.engine.settled();
  });

  it("carries Resume and its note to the engine, answering once its check has run (usage-limit recovery AC-RESUME-01 to 03)", async () => {
    const { h, origin, token } = await serve([{ actions: [{ text: "Building the intake form." }, { result: "Which fields does the form need?" }] }, landingSession("src/intake.txt")]);
    const post = async (body?: unknown) => {
      const response = await fetch(`${origin}/api/resume`, { method: "POST", headers: { "X-Kiln-Token": token, Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: (await response.json()) as { ok?: boolean; reason?: string } };
    };
    // Not offered before anything stopped.
    expect(await post()).toEqual({ status: 409, body: { ok: false, reason: "Resume isn't offered here." } });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(await post({ note: ["not", "text"] })).toEqual({ status: 400, body: { ok: false, reason: "The note must be text." } });
    expect(await post({ note: "x".repeat(4_001) })).toMatchObject({ status: 400 });
    expect(await post({ note: "Use the mockup's fields." })).toEqual({ status: 200, body: { ok: true } });
    await h.engine.settled();
    expect(h.claudeCalls()[1]!.prompt.startsWith("The person running Kiln says:\n\nUse the mockup's fields.\n\n")).toBe(true);
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("closes every open event stream when it closes", async () => {
    const { origin, token } = await serve();
    const response = await fetch(`${origin}/api/events?token=${token}`);
    const reader = response.body!.getReader();
    await reader.read();
    await server!.close();
    server = undefined;
    // The stream ends, cleanly or with its socket closed.
    const ended = await (async () => {
      try {
        for (;;) if ((await reader.read()).done) return true;
      } catch {
        return true;
      }
    })();
    expect(ended).toBe(true);
    await expect(fetch(`${origin}/customer-returns`)).rejects.toThrow();
  });
});
