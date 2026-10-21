import {
  reloadNeedsConfirmation,
  shouldRereadOnFocus,
} from "../external-edits/external-edit-model.ts";
import type { ViewerStore } from "./viewer-store.ts";

// The files of an open Pantin changed outside Pantin (ADR 0063 point 5): the window
// re-reads the Pantin when it gets the focus back, and the banner offers to reload.

/**
 * Reads the open Pantin again and shows the answer: the core checks the disk on every
 * read. A failed read leaves the screen as it was and says why in the message line.
 */
export async function readOpenPantinAgain(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  await store.run(
    () => store.ports.api.getPantin(open.id),
    (current, response) => {
      const shown = store.applyIfStillRequested(current, response);
      // Nothing is left to reload once the outside edit is gone.
      return { ...shown, pendingReload: shown.pendingReload && response.changedOutside.length > 0 };
    },
  );
}

/** The window got the focus back. `now` is injected so the debounce is testable. */
export async function rereadOnFocus(store: ViewerStore, now: number): Promise<void> {
  const allowed = shouldRereadOnFocus({
    pantinOpen: store.state.openPantin !== null,
    requestInFlight: store.state.pendingRequestCount > 0,
    lastRereadAt: store.lastFocusRereadAt,
    now,
  });
  if (!allowed) {
    return;
  }
  store.lastFocusRereadAt = now;
  await readOpenPantinAgain(store);
}

async function reloadFromDisk(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  await store.run(
    () => store.ports.api.discardPantin(open.id),
    (current, saved) => ({
      ...store.applyIfStillRequested(current, saved),
      pendingReload: false,
    }),
  );
}

/** The banner's action: reloads at once, or asks first when edits would be lost. */
export async function requestReload(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null || open.changedOutside.length === 0) {
    return;
  }
  if (reloadNeedsConfirmation(open)) {
    store.update({ ...store.state, pendingReload: true });
    return;
  }
  await reloadFromDisk(store);
}

export function confirmReload(store: ViewerStore): Promise<void> {
  return reloadFromDisk(store);
}

export function cancelReload(store: ViewerStore): void {
  store.update({ ...store.state, pendingReload: false });
}

export function externalEditIntents(store: ViewerStore): { reloadFromDisk(): void } {
  return { reloadFromDisk: () => void requestReload(store) };
}
