// Kiln supports GitHub-hosted repositories only (PRD, "Depends On"); `origin` must point at
// github.com in one of the three URL forms Git uses for it (technical design, "Command line").

export interface GithubRepository {
  owner: string;
  name: string;
}

const NAME = "([A-Za-z0-9_.-]+)";
const ORIGIN_FORMS = [
  new RegExp(`^https://(?:[^@/]+@)?github\\.com/${NAME}/${NAME}$`, "i"),
  new RegExp(`^git@github\\.com:${NAME}/${NAME}$`, "i"),
  new RegExp(`^ssh://git@github\\.com(?::\\d+)?/${NAME}/${NAME}$`, "i"),
];

/**
 * The `<owner>/<name>` an origin URL points at on github.com, or undefined for any other host
 * (GitHub Enterprise hosts and SSH host aliases included).
 *
 *   parseGithubOrigin("git@github.com:EnsoDynamics/kiln.git")  // { owner: "EnsoDynamics", name: "kiln" }
 *   parseGithubOrigin("git@github-work:EnsoDynamics/kiln.git") // undefined
 */
export function parseGithubOrigin(url: string): GithubRepository | undefined {
  for (const form of ORIGIN_FORMS) {
    const match = form.exec(url.trim());
    if (match) return { owner: match[1]!, name: match[2]!.replace(/\.git$/i, "") };
  }
  return undefined;
}
