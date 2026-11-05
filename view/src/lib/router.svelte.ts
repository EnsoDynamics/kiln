// The view's client-side routes beneath its one address (technical design, "HTTP API"): the
// progress view at `/<PRD folder name>`, and Phase detail or Full session output at
// `/<PRD folder name>/phase/<id>`.

export type Route = { screen: "progress" } | { screen: "phase"; phaseId: string };

/** The route for a path under the view's base. */
export function routeOf(path: string, base: string): Route {
  const rest = path.startsWith(base) ? path.slice(base.length) : "";
  const match = /^\/phase\/([^/]+)\/?$/.exec(rest);
  return match ? { screen: "phase", phaseId: decodeURIComponent(match[1]!) } : { screen: "progress" };
}

export function phasePath(base: string, phaseId: string): string {
  return `${base}/phase/${encodeURIComponent(phaseId)}`;
}

export class Router {
  route = $state<Route>({ screen: "progress" });

  constructor(private readonly base: string) {}

  /** Reads the address now, and follows the browser's back and forward buttons. */
  start(location: Location): () => void {
    this.route = routeOf(location.pathname, this.base);
    const onPop = () => (this.route = routeOf(window.location.pathname, this.base));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }

  go(path: string): void {
    history.pushState(null, "", path);
    this.route = routeOf(path, this.base);
  }

  /** Swaps the route without a history entry: a phase route that no longer applies becomes the progress view. */
  replace(path: string): void {
    history.replaceState(null, "", path);
    this.route = routeOf(path, this.base);
  }
}

/** A click on a link Kiln routes itself: plain left clicks only, so a new tab still opens. */
export function routedClick(event: MouseEvent, router: Router | undefined, path: string): void {
  if (!router || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.go(path);
}
