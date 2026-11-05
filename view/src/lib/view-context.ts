// What every screen of one page shares: the page's config, the router, and the live connection's
// output and live-text feeds. Set once by App; components rendered on their own (tests) get none.

import { getContext, setContext } from "svelte";
import type { PageConfig } from "./api.js";
import type { Connection } from "./connection.svelte.js";
import type { Router } from "./router.svelte.js";

export interface ViewContext {
  config: PageConfig;
  router?: Router;
  connection?: Connection;
}

const KEY = Symbol("kiln-view");

export function setViewContext(context: ViewContext): void {
  setContext(KEY, context);
}

export function viewContext(): ViewContext {
  return getContext<ViewContext | undefined>(KEY) ?? { config: { token: "", base: "" } };
}
