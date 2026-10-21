import { withConsoleVerbose } from "../console/console-state.ts";
import { describeFailure } from "../messages.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Verbose mode of the console (ADR 0061 point 8). Apart from console-actions.ts
// so that opening a Pantin (pantin-actions.ts) does not import the diagram.

export function showCoreVerbose(store: ViewerStore, verbose: boolean): void {
  const console = withConsoleVerbose(store.state.console, verbose);
  if (console !== store.state.console) {
    store.update({ ...store.state, console });
  }
}

/**
 * Sends the viewer's verbose preference to the core when a Pantin is opened,
 * as the clock is resumed (ADR 0061 point 8, ADR 0032 point 10): verbose is a
 * runtime flag of the core, never saved. A failure only tells the user.
 */
export async function sendConsoleVerbosePreference(
  store: ViewerStore,
  pantinId: string,
): Promise<void> {
  await setConsoleVerbose(store, pantinId, store.ports.readConsoleVerbose());
}

async function setConsoleVerbose(
  store: ViewerStore,
  pantinId: string,
  verbose: boolean,
): Promise<void> {
  try {
    const answer = await store.ports.api.setConsoleVerbose(pantinId, verbose);
    if (store.state.openPantin?.id === pantinId) {
      showCoreVerbose(store, answer.verbose);
    }
  } catch (error) {
    store.update({ ...store.state, message: describeFailure(error) });
  }
}

/** The toolbar toggle: remembers the choice, then asks the core; the core's answer is shown. */
export async function toggleConsoleVerbose(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open !== null) {
    const verbose = !store.state.console.verbose;
    store.ports.storeConsoleVerbose(verbose);
    await setConsoleVerbose(store, open.id, verbose);
  }
}
