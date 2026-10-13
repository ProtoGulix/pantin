import type { PantinApiClient } from "../api-client.ts";
import { withMapping } from "../io/io-state.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the mapping reads need of the store, spelled out so that this file does
// not import the store, which calls it after every document change.
interface IoLoadStore {
  state: ViewerState;
  ports: { api: Pick<PantinApiClient, "getIoMapping"> };
  run<Result>(
    request: () => Promise<Result>,
    apply: (current: ViewerState, result: Result) => ViewerState,
  ): Promise<Result | undefined>;
}

// Reads the I/O mapping of the open Pantin (ADR 0049 point 5). Apart from
// io-actions.ts: the store reloads after any document change (viewer-store.ts).

export async function loadIoMapping(store: IoLoadStore): Promise<void> {
  const open = store.state.openPantin;
  if (open === null) {
    return;
  }
  await store.run(
    () => store.ports.api.getIoMapping(open.id),
    // An answer for a Pantin closed or replaced meanwhile is dropped.
    (current, mapping) =>
      current.openPantin?.id === open.id
        ? { ...current, io: withMapping(current.io, open.id, mapping) }
        : current,
  );
}

// The one hook after any document change (ADR 0049 point 11), called by
// ViewerStore.update: the core answered with a new Pantin, so the mapping's
// problems, unmapped tags and owners may have changed, and no edit has to
// remember it. An I/O edit brings its own fresh mapping in the same update and
// needs no second read.
export function reloadIoAfterDocumentChange(
  store: IoLoadStore,
  previous: ViewerState,
  next: ViewerState,
): void {
  const changed = next.openPantin !== null && next.openPantin !== previous.openPantin;
  const fresh = next.io.mapping !== null && next.io.mapping !== previous.io.mapping;
  if (changed && next.centralLayout === "io" && !fresh) {
    void loadIoMapping(store);
  }
}
