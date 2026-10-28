// Inject only file-open failures; all successful storage/cleanup uses real private files.
import { existsSync, fstatSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { InspectionSpool, ResponseSpool, ownResult, spoolResult } from "./spool.js";
import { readHistory } from "./history.js";
import { result } from "./result.js";
import type { SavedWork } from "./private-state.js";

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, openSync: vi.fn(actual.openSync), mkdtempSync: vi.fn(actual.mkdtempSync) };
});
const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
const directories = () => vi.mocked(mkdtempSync).mock.results.filter(r => r.type === "return").map(r => String(r.value));
const failure = () => { throw Object.assign(new Error("Injected file descriptor exhaustion"), { code: "EMFILE" }); };
afterEach(() => {
  for (const path of directories()) rmSync(path, { recursive: true, force: true });
  vi.mocked(openSync).mockReset().mockImplementation(actual.openSync);
  vi.mocked(mkdtempSync).mockClear();
});

it("closes already-open history descriptors and removes files when a later list cannot open", () => {
  const root = actual.mkdtempSync(join(tmpdir(), "kiln-spool-test-"));
  const work = { root, directory: root, record: { phases: { "1": { sessionIds: [] } }, plan: [] } } as unknown as SavedWork;
  vi.mocked(openSync).mockImplementationOnce(actual.openSync).mockImplementationOnce(failure);
  try {
    expect(() => readHistory(work)).toThrow("Injected file descriptor exhaustion");
    const fd = vi.mocked(openSync).mock.results.find(r => r.type === "return")!.value as number;
    expect(() => fstatSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
    expect(directories()).toHaveLength(1); for (const path of directories()) expect(existsSync(path)).toBe(false);
  } finally { rmSync(root, { recursive: true }); }
});

it("removes a response directory and releases answer-owned history when response initialization fails", () => {
  const history = new InspectionSpool(); history.list<string>().append("saved record");
  const release = vi.fn(() => history.close()); const answer = ownResult(result({ value: "payload" }), release);
  vi.mocked(openSync).mockImplementationOnce(failure);
  expect(() => spoolResult(answer, true)).toThrow("Injected file descriptor exhaustion");
  expect(release).toHaveBeenCalledOnce(); expect(directories()).toHaveLength(2);
  for (const path of directories()) expect(existsSync(path)).toBe(false);
});

it("removes finalized response files after cancelled HTTP and failed stdout consumers", async () => {
  const http = new ResponseSpool(); http.append(Buffer.from("one valid result\n"));
  const reader = http.stream().getReader(); await reader.cancel(); reader.releaseLock();
  const stdout = new ResponseSpool(); stdout.append(Buffer.from("another result\n"));
  await expect(stdout.writeTo({ write: () => { throw new Error("Injected broken output"); } })).rejects.toThrow("Injected broken output");
  expect(directories()).toHaveLength(2); for (const path of directories()) expect(existsSync(path)).toBe(false);
});

it("releases owned history and unfinished response files on a serialization deadline", () => {
  const history = new InspectionSpool(); const rows = history.list<string>(); rows.append("still saved");
  const release = vi.fn(() => history.close()); const answer = ownResult(result({ rows: rows.values }), release);
  expect(() => spoolResult(answer, true, Date.now() - 1)).toThrow(/deadline/);
  expect(release).toHaveBeenCalledOnce(); expect(directories()).toHaveLength(2);
  for (const path of directories()) expect(existsSync(path)).toBe(false);
});
