import type { PantinResponse } from "@pantin/protocol";
import type { PantinApiClient } from "../api-client.ts";
import { isMappingCurrent, withMapping } from "../io/io-state.ts";
import { describeFailure } from "../messages.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the mapping reads need of the store, spelled out so that this file does
// not import the store, which calls it after every state change.
export interface IoLoadStore {
  state: ViewerState;
  ports: { api: Pick<PantinApiClient, "getIoMapping" | "listSignals"> };
  update(next: ViewerState): void;
  // The read in flight, so that every caller of one Pantin version shares it.
  ioRead: { pantin: PantinResponse; done: Promise<void> } | null;
}

// Reads the I/O mapping of the open Pantin (ADR 0049 point 5). Apart from
// io-actions.ts: the store reloads after any document change (viewer-store.ts).

// Quiet on purpose: it does not go through `store.run`, whose counter disables
// the menus, the diagram edits and the I/O buttons while a request is pending.
// A background read must never do that; only the user's own I/O edits do. A
// failure is still shown, never swallowed.
async function readQuietly(
  store: IoLoadStore,
  open: PantinResponse,
  version: number,
): Promise<void> {
  try {
    const [mapping, signals] = await Promise.all([
      store.ports.api.getIoMapping(open.id),
      store.ports.api.listSignals(open.id),
    ]);
    const units = new Map(signals.signals.map((signal) => [signal.name, signal.unit]));
    const { state } = store;
    // Dropped when the Pantin changed meanwhile (a newer read follows) or an
    // answer, an I/O edit's or a newer read's, was applied since this one began.
    if (state.openPantin === open && state.io.version === version) {
      store.update({ ...state, io: withMapping(state.io, open, mapping, units) });
    }
  } catch (error) {
    // Marked in the same update as the message: the hook it runs must not read again.
    const { state } = store;
    const io = state.openPantin === open ? { ...state.io, failedFor: open } : state.io;
    store.update({ ...state, io, message: describeFailure(error) });
  }
}

/** Reads the mapping again, sharing a read already in flight for the same Pantin version. */
export function loadIoMapping(store: IoLoadStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return Promise.resolve();
  }
  if (store.ioRead?.pantin === open) {
    return store.ioRead.done;
  }
  const entry: NonNullable<IoLoadStore["ioRead"]> = { pantin: open, done: Promise.resolve() };
  store.ioRead = entry;
  entry.done = readQuietly(store, open, store.state.io.version).then(() => {
    if (store.ioRead === entry) {
      store.ioRead = null;
    }
  });
  return entry.done;
}

/** Resolves once the mapping is current for the open Pantin; reads only when it is not. */
export function ensureIoMapping(store: IoLoadStore): Promise<void> {
  return isMappingCurrent(store.state) ? Promise.resolve() : loadIoMapping(store);
}

// Whether something on screen reads the mapping: the bridge block lists its
// modules while any Pantin is open, and the I/O view and the inspector's "I/O"
// section (ADR 0049 point 11) read it too. One read serves them all.
function mappingIsShown(state: ViewerState): boolean {
  return state.openPantin !== null;
}

// The one hook after any state change (ADR 0049 point 11), called by
// ViewerStore.update. While the mapping is shown and not current for the open
// Pantin (something just started showing it, or the core answered with a new
// document), it is read once: a current mapping, an I/O edit's own answer
// included, costs no request, and neither does a selection or a pose.
export function reloadIoAfterDocumentChange(store: IoLoadStore, next: ViewerState): void {
  // A failed read is not retried by the hook: its own update would call it
  // again and loop. A new document version, or a user gesture (entering the
  // I/O view, Retry), tries again.
  const failedForThis = next.io.failedFor === next.openPantin;
  if (mappingIsShown(next) && !isMappingCurrent(next) && !failedForThis) {
    void loadIoMapping(store);
  }
}

/** Retry, a user gesture: forgets the failure and reads again. */
export function retryIoMapping(store: IoLoadStore): Promise<void> {
  store.update({ ...store.state, io: { ...store.state.io, failedFor: null } });
  return loadIoMapping(store);
}
