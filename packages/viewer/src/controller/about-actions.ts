import { CLOSED_ABOUT } from "../about-state.ts";
import { userGuideUrl } from "../links.ts";
import type { ViewerState } from "../viewer-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The Help menu (ADR 0058 point 4): the guide, and the About window, which asks
// the core for its version each time it opens so that a restarted core is seen.

export function openDocumentation(store: ViewerStore): void {
  store.ports.openLink(userGuideUrl(store.state.language));
}

export function closeAbout(store: ViewerStore): void {
  store.update({ ...store.state, about: CLOSED_ABOUT });
}

function withCoreVersion(state: ViewerState, core: ViewerState["about"]["core"]): ViewerState {
  return state.about.open ? { ...state, about: { ...state.about, core } } : state;
}

export async function openAbout(store: ViewerStore): Promise<void> {
  store.update({ ...store.state, about: { open: true, core: { status: "loading" } } });
  try {
    const version = await store.ports.api.getCoreVersion();
    store.update(withCoreVersion(store.state, { status: "known", version }));
  } catch {
    // Any failure means the core cannot be reached or does not know the route
    // (an older core); the window says so, which is the actionable answer.
    store.update(withCoreVersion(store.state, { status: "unreachable" }));
  }
}
