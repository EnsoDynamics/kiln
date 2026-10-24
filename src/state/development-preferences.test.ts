import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preferenceGroup, readDevelopmentPreference, saveDevelopmentPreference } from "./development-preferences.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("requirements-repository preference storage", () => {
  it("separates canonical origins and real checkouts, refuses stale concurrent editors and retains exact targets", () => {
    const root = mkdtempSync(join(tmpdir(), "kiln-preferences-")); roots.push(root);
    const path = join(root, "private", "development-deployment-preferences.json"); const group = preferenceGroup("Acme/Product", root);
    const empty = readDevelopmentPreference(path, group); expect(empty).toMatchObject({ revision: 0, enabled: false, targets: [] });
    const target = { repository: "github.com/acme/api", baseBranch: "Develop", environment: "api-dev-123" };
    const saved = saveDevelopmentPreference(path, { ...empty, enabled: true, targets: [target] }, 0);
    expect(saved.revision).toBe(1); expect(readDevelopmentPreference(path, preferenceGroup("acme/product", root))).toEqual(saved);
    expect(() => saveDevelopmentPreference(path, { ...empty, enabled: false, targets: [] }, 0)).toThrow("another window");
    expect(readDevelopmentPreference(path, preferenceGroup("acme/other-product", root)).targets).toEqual([]);
    const other = join(root, "other-checkout"); mkdirSync(other);
    expect(readDevelopmentPreference(path, preferenceGroup("acme/product", other)).targets).toEqual([]);
    saveDevelopmentPreference(path, { ...readDevelopmentPreference(path, preferenceGroup("acme/other-product", root)), enabled: false, targets: [] }, 0);
    expect(readDevelopmentPreference(path, group)).toEqual(saved);
    expect(readFileSync(path, "utf8")).toContain("api-dev-123");
  });
  it("names unreadable or newer preference records instead of manufacturing an empty choice", () => {
    const root = mkdtempSync(join(tmpdir(), "kiln-preferences-")); roots.push(root); const path = join(root, "preferences.json");
    for (const value of ["null", "false", "0", '""', "{", '{"schemaVersion":2,"groups":{}}', '{"schemaVersion":1,"groups":{"invalid":{}}}']) {
      writeFileSync(path, value); expect(() => readDevelopmentPreference(path, preferenceGroup("acme/product", root))).toThrow(path);
    }
  });
});
