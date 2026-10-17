import { describe, expect, it } from "vitest";
import { parseGithubOrigin } from "./github-origin.js";

describe("parseGithubOrigin", () => {
  it.each([
    ["https://github.com/EnsoDynamics/kiln.git", "EnsoDynamics/kiln"],
    ["https://github.com/EnsoDynamics/kiln", "EnsoDynamics/kiln"],
    ["https://doug@github.com/EnsoDynamics/kiln.git", "EnsoDynamics/kiln"],
    ["https://GitHub.com/EnsoDynamics/kiln.git", "EnsoDynamics/kiln"],
    ["git@github.com:EnsoDynamics/kiln.git", "EnsoDynamics/kiln"],
    ["git@github.com:EnsoDynamics/kiln", "EnsoDynamics/kiln"],
    ["ssh://git@github.com/EnsoDynamics/kiln.git", "EnsoDynamics/kiln"],
    ["ssh://git@github.com:443/EnsoDynamics/my.repo.git", "EnsoDynamics/my.repo"],
  ])("accepts %s", (url, expected) => {
    const repository = parseGithubOrigin(url);
    expect(repository && `${repository.owner}/${repository.name}`).toBe(expected);
  });

  it.each([
    "https://github.example.com/EnsoDynamics/kiln.git",
    "git@github-work:EnsoDynamics/kiln.git",
    "https://gitlab.com/EnsoDynamics/kiln.git",
    "/tmp/origin.git",
    "https://github.com/EnsoDynamics",
    "https://github.com/EnsoDynamics/kiln/extra",
  ])("rejects %s", (url) => {
    expect(parseGithubOrigin(url)).toBeUndefined();
  });
});
