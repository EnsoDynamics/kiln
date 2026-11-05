// Actual concurrent TCP binds and private discovery, including Host/Origin/token guards.
import { existsSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runKilnCommand } from "../kiln-command.js";
import { createHarness, type Harness } from "./engine-harness.js";
import { startFixtureController } from "./controller-server.js";

it("atomically binds distinct fixture ports and publishes only their authenticated controller identities", async () => {
  const harnesses: Harness[] = [];
  const controllers: Awaited<ReturnType<typeof startFixtureController>>[] = [];
  const active = new Set<Awaited<ReturnType<typeof startFixtureController>>>();
  try {
    const started = await Promise.allSettled([0, 1].map(async () => {
      const h = await createHarness({ sessions: [] }); harnesses.push(h);
      const hosted = await startFixtureController({ engine: h.engine, folderName: h.engine.paths.folderName, featureName: "Concurrent fixture", token: h.engine.record.token });
      controllers.push(hosted); active.add(hosted); return { h, hosted };
    }));
    const fixtures = started.map(result => { if (result.status === "rejected") throw result.reason; return result.value; });
    const [a, b] = fixtures;
    expect(a!.hosted.port).toBeGreaterThan(0); expect(b!.hosted.port).not.toBe(a!.hosted.port);
    for (const { h, hosted } of fixtures) {
      const origin = new URL(hosted.server.address).origin;
      expect(new URL(origin).port).toBe(String(hosted.port));
      const response = await fetch(`${origin}/api/control/v1/capabilities`, { headers: { "X-Kiln-Token": h.engine.record.token } });
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ execution_id: h.engine.record.executionId, instance: { pid: process.pid } });
      let stdout = ""; let stderr = "";
      const code = await runKilnCommand(["status", join(h.repository, h.engine.record.prdDirectory), "--json"], { cwd: h.sandbox.root, env: h.env, stdout: { write: s => stdout += s }, stderr: { write: s => stderr += s } });
      expect(code, stdout).toBe(0); expect(stderr).toBe(""); expect(JSON.parse(stdout)).toMatchObject({ controller: "reachable", execution_id: h.engine.record.executionId });
      const wrongHost = await new Promise<number>((resolve, reject) => {
        const req = request({ hostname: "127.0.0.1", port: hosted.port, path: "/api/control/v1/capabilities", headers: { Host: "127.0.0.1:0", "X-Kiln-Token": h.engine.record.token } }, res => { res.resume(); res.once("end", () => resolve(res.statusCode!)); });
        req.once("error", reject); req.end();
      });
      expect(wrongHost).toBe(403);
      expect((await fetch(`${origin}/api/control/v1/account/refresh`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: "http://127.0.0.1:0" } })).status).toBe(403);
    }
    expect((await fetch(`${new URL(b!.hosted.server.address).origin}/api/control/v1/capabilities`, { headers: { "X-Kiln-Token": a!.h.engine.record.token } })).status).toBe(403);
    await a!.hosted.server.close(); active.delete(a!.hosted); a!.hosted.release();
    expect(existsSync(join(a!.h.stateDirectory, "instance.lock"))).toBe(false);
    expect(existsSync(join(b!.h.stateDirectory, "instance.lock"))).toBe(true);
  } finally {
    for (const hosted of active) await hosted.server.close();
    for (const hosted of controllers) hosted.release();
    await Promise.all(harnesses.map(h => h.cleanup()));
  }
});
