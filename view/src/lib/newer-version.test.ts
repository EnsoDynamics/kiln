// AC-NEWER-02, AC-NEWER-03: the view asks Kiln's own server for npm's newer Kiln with the page's token,
// and treats anything but a version as no notice. The route itself is proved against the real
// server in local-server.integration.test.ts; here `fetch` stands in so the page's side is checked.

import { afterEach, describe, expect, it, vi } from "vitest";
import { newerVersion } from "./api.js";

const config = { token: "a".repeat(64), base: "/customer-returns" };
afterEach(() => { vi.unstubAllGlobals(); });

function answering(response: Response | Error) {
  const fetch = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("newerVersion", () => {
  it("asks Kiln's own server with the page's token and answers the newer version", async () => {
    const fetch = answering(Response.json({ latest: "1.2.0" }));
    expect(await newerVersion(config)).toBe("1.2.0");
    expect(fetch).toHaveBeenCalledWith("/api/newer-version", { headers: { "X-Kiln-Token": config.token } });
  });

  it("answers nothing when there is no newer Kiln, the server refuses, or the request fails", async () => {
    answering(Response.json({ latest: null }));
    expect(await newerVersion(config)).toBeUndefined();
    answering(Response.json({ latest: "1.2.0" }, { status: 403 }));
    expect(await newerVersion(config)).toBeUndefined();
    answering(new Response("not json"));
    expect(await newerVersion(config)).toBeUndefined();
    answering(new TypeError("Failed to fetch"));
    expect(await newerVersion(config)).toBeUndefined();
  });
});
