// Where Kiln keeps its state (technical design, "Kiln's State on Disk"): outside every
// repository by default (AC-GIT-03, AC-WATCH-10), and one directory per PRD per checkout
// (AC-MULTI-01).

import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prdStateDirectory, stateRoot } from "./state-files.js";

describe("the state root", () => {
  it("is in the person's own profile when nothing names it: ~/.local/state/kiln, or %LOCALAPPDATA%\\kiln on Windows", () => {
    const expected = process.platform === "win32" ? join(homedir(), "AppData", "Local", "kiln") : join(homedir(), ".local", "state", "kiln");
    expect(stateRoot({})).toBe(expected);
  });

  it("follows XDG_STATE_HOME on macOS and Linux, and LOCALAPPDATA on Windows", () => {
    const env = { XDG_STATE_HOME: join("/somewhere", "state"), LOCALAPPDATA: join("/somewhere", "local") };
    expect(stateRoot(env)).toBe(process.platform === "win32" ? join("/somewhere", "local", "kiln") : join("/somewhere", "state", "kiln"));
    if (process.platform !== "win32") expect(stateRoot({ XDG_STATE_HOME: "" })).toBe(join(homedir(), ".local", "state", "kiln"));
  });
});

describe("a PRD's state directory", () => {
  const root = join("/state", "kiln");

  it("differs for two checkouts that share a repository name and PRD folder, so their Kilns never meet", () => {
    const first = prdStateDirectory(root, join("/work", "client-a", "acme-shop"), "acme-shop", "docs/prds/customer-returns");
    const second = prdStateDirectory(root, join("/work", "client-b", "acme-shop"), "acme-shop", "docs/prds/customer-returns");
    expect(first).not.toBe(second);
    expect(first).toMatch(/acme-shop-[0-9a-f]{8}[\\/]docs--prds--customer-returns$/);
  });

  it("is the same every time for one checkout and PRD, and differs for another PRD of that checkout", () => {
    const checkout = join("/work", "acme-shop");
    expect(prdStateDirectory(root, checkout, "acme-shop", "docs/prds/customer-returns")).toBe(prdStateDirectory(root, checkout, "acme-shop", "docs/prds/customer-returns"));
    expect(prdStateDirectory(root, checkout, "acme-shop", "docs/prds/gift-cards")).not.toBe(prdStateDirectory(root, checkout, "acme-shop", "docs/prds/customer-returns"));
    expect(prdStateDirectory(root, checkout, "acme-shop", "docs/changes/customer-returns")).not.toBe(prdStateDirectory(root, checkout, "acme-shop", "docs/prds/customer-returns"));
  });
});
