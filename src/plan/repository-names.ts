// What a name on a `**Repositories:**` line can be (find repositories anywhere AC-NAME-01;
// technical design, "Names"): a folder name beside the PRD's repository, as before, or the
// path in a repository's remote address, which is the same on every computer.

export type RepositoryName =
  | { kind: "folder"; name: string }
  /** `addressPath` as written, without a host; compare it with `sameAddressPath`. */
  | { kind: "path"; addressPath: string }
  /** Not a name: the problem, given the phase file that wrote it (or none, for a request by command). */
  | { kind: "problem"; problem: (fileName?: string) => string };

/**
 * Reads one name as the first row of the design's table that fits.
 *
 *   readRepositoryName("acme-labs/admin")                        // { kind: "path", addressPath: "acme-labs/admin" }
 *   readRepositoryName("github.com:acme-labs/admin")             // { kind: "path", addressPath: "acme-labs/admin" }
 *   readRepositoryName("storefront")                             // { kind: "folder", name: "storefront" }
 *   readRepositoryName("/Volumes/work/storefront").problem("phase-2b-store-credit.md")
 *   // "phase-2b-store-credit.md names /Volumes/work/storefront, a path on one computer. Name the repository by the path in its remote address, <owner>/<repository>."
 */
export function readRepositoryName(item: string): RepositoryName {
  const names = (fileName?: string) => (fileName === undefined ? `${item} is` : `${fileName} names ${item},`);
  if (item.includes("://") || /^[^:]*@[^:]*:/.test(item)) {
    const remote = parseRemoteAddress(item);
    const path = remote?.addressPath ?? item;
    return { kind: "problem", problem: (fileName) => `${names(fileName)} a full remote address. Name the repository by the path in it, ${path}.` };
  }
  if (/^[/~.]/.test(item) || /^[A-Za-z]:/.test(item) || item.includes("\\")) {
    return { kind: "problem", problem: (fileName) => `${names(fileName)} a path on one computer. Name the repository by the path in its remote address, <owner>/<repository>.` };
  }
  const hosted = /^([^/:]{2,}):(.*)$/.exec(item);
  if (hosted) {
    const [, host, path] = hosted;
    if (host!.toLowerCase() !== "github.com") {
      return { kind: "problem", problem: (fileName) => `${fileName === undefined ? item : `${fileName} names ${item}`}. Kiln delivers only to GitHub, so it can’t deliver a repository on ${host}.` };
    }
    return pathOrProblem(path!);
  }
  if (item.includes("/")) return pathOrProblem(item);
  return { kind: "folder", name: item };
}

function pathOrProblem(path: string): RepositoryName {
  const parts = path.split("/");
  if (parts.length < 2 || parts.some((part) => part.trim() === "")) {
    return { kind: "problem", problem: (fileName) => (fileName === undefined ? "That is an empty name." : `${fileName} has an empty name on its Repositories line.`) };
  }
  return { kind: "path", addressPath: path };
}

/** Address paths are compared without case (AC-NAME-01). */
export function sameAddressPath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The last part of an address path: `acme-labs/admin` gives `admin`. */
export function lastPart(addressPath: string): string {
  return addressPath.split("/").at(-1)!;
}

/**
 * The whole-path form of a worktree folder's name and a remembered answer's file: the parts
 * joined by `+`, which no GitHub path part holds (technical design, "Design Decisions").
 *
 *   wholePathForm("acme-labs/admin")  // "acme-labs+admin"
 */
export function wholePathForm(addressPath: string): string {
  return addressPath.split("/").join("+");
}

export interface RemoteAddress {
  host: string;
  /** The part after the host, without a leading `/`, a trailing `/` or a trailing `.git`. */
  addressPath: string;
}

/**
 * The host and address path of an `origin`, in the URL forms and the `host:path` form alike; a
 * path on the computer has none (technical design, "Reading candidates").
 *
 *   parseRemoteAddress("git@github.com:acme-labs/storefront.git")  // { host: "github.com", addressPath: "acme-labs/storefront" }
 *   parseRemoteAddress("https://git.example.com/platform/payments/billing")  // { host: "git.example.com", addressPath: "platform/payments/billing" }
 *   parseRemoteAddress("/srv/git/storefront.git")  // undefined
 */
export function parseRemoteAddress(url: string): RemoteAddress | undefined {
  const text = url.trim();
  let host: string;
  let path: string;
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?(\/.*)?$/.exec(text);
  if (scheme) {
    if (/^file:/i.test(text)) return undefined;
    host = scheme[1]!;
    path = scheme[2] ?? "";
  } else {
    const scp = /^(?:[^@/:]+@)?([^/:]{2,}):(.*)$/.exec(text);
    if (!scp) return undefined;
    host = scp[1]!;
    path = scp[2]!;
  }
  path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  return path === "" ? undefined : { host, addressPath: path };
}
