import { describe, expect, it } from "vitest";
import { supportedCodexVersion } from "./codex-version.js";

describe("Codex minimum stable version", () => {
  it.each(["0.162.1", "0.162.2", "0.165.0", "0.1000.0", "1.0.0", "99.0.0", "0.165.0+build.1"])("accepts %s without an upper version cap", version => {
    expect(supportedCodexVersion(`codex-cli ${version}\n`)).toBe(version);
  });
  it.each(["0.162.0", "0.161.999", "0.99.999", "0.0.0", "0.165.0-dev", "1.0.0-rc.1", "v0.165.0", "0.165", "00.165.0", "9007199254740992.0.0", "0.165.0 extra", ""])("rejects old, prerelease or malformed %s", version => {
    expect(supportedCodexVersion(`codex-cli ${version}`)).toBeUndefined();
  });
  it("requires the Codex CLI version format", () => {
    expect(supportedCodexVersion("another-cli 0.165.0")).toBeUndefined();
  });
});
