import { infoMessage } from "../messages.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { type ViewerState, withOpenPantin } from "../viewer-state.ts";
import { resumeClock } from "./clock-actions.ts";
import { sendConsoleVerbosePreference } from "./console-verbose-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Pantin and body operations that go through the API. Every edit is followed
// by a fresh read of the Pantin: the core owns unsavedChanges.

export async function refreshPantinList(store: ViewerStore): Promise<void> {
  await store.run(
    () => store.ports.api.listPantins(),
    (current, pantins) => ({ ...current, pantins }),
  );
}

export async function openPantin(store: ViewerStore, pantinId: string): Promise<void> {
  store.requestedPantinId = pantinId;
  const opened = await store.run(
    () => store.ports.api.getPantin(pantinId),
    (current, response) => store.applyIfStillRequested(current, response),
  );
  // A pause never survives closing and opening again (ADR 0032 point 1). Only
  // an open that really applied resumes: a failed or stale one may find the
  // same Pantin already on screen, which the user may have paused since.
  if (
    opened !== undefined &&
    store.requestedPantinId === pantinId &&
    store.state.openPantin?.id === pantinId
  ) {
    await resumeClock(store, pantinId);
    await sendConsoleVerbosePreference(store, pantinId);
  }
}

/** Creates and opens a Pantin; resolves true when the core created it. */
export async function createPantin(store: ViewerStore, name: string): Promise<boolean> {
  const created = await store.run(
    () => store.ports.api.createPantin(name),
    (current, response) => {
      store.requestedPantinId = response.id;
      store.pendingImportFile = null;
      return { ...withOpenPantin(current, response), creatingPantin: false };
    },
  );
  if (created === undefined) {
    return false;
  }
  await refreshPantinList(store);
  return true;
}

/**
 * Runs an edit on a Pantin, then shows its fresh state. Undefined on failure.
 * `then` changes the state in the same step as the fresh Pantin: what an edit
 * selects, closes or says must not wait for the list refresh that follows,
 * which a slow core can delay past the user's next click.
 */
export async function editPantin<Result>(
  store: ViewerStore,
  pantinId: string,
  edit: (pantinId: string) => Promise<Result>,
  then: (state: ViewerState, result: Result) => ViewerState = (state) => state,
): Promise<Result | undefined> {
  const outcome = await store.run(
    async () => {
      const result = await edit(pantinId);
      return { result, pantin: await store.ports.api.getPantin(pantinId) };
    },
    (current, { pantin, result }) => {
      const shown = store.applyIfStillRequested(current, pantin);
      return shown === current ? shown : then(shown, result);
    },
  );
  await refreshPantinList(store);
  return outcome?.result;
}

/** Saves the open Pantin; resolves true when the core confirmed the save. */
export async function savePantin(store: ViewerStore): Promise<boolean> {
  const open = store.state.openPantin;
  if (open === null) {
    return false;
  }
  const saved = await editPantin(store, open.id, (pantinId) =>
    store.ports.api.savePantin(pantinId),
  );
  if (saved === undefined) {
    return false;
  }
  store.update({
    ...store.state,
    message: infoMessage("message.saved", { name: saved.document.name }),
  });
  return true;
}

/** Renames a Pantin or a body, whichever the tree node stands for. */
export async function renameNode(store: ViewerStore, nodeId: string, name: string): Promise<void> {
  const ref = parseNodeId(nodeId);
  store.update({ ...store.state, renamingNodeId: null });
  if (ref?.kind === "pantin") {
    await editPantin(store, ref.pantinId, (pantinId) =>
      store.ports.api.renamePantin(pantinId, name),
    );
  } else if (ref?.kind === "body") {
    await editPantin(store, ref.pantinId, (pantinId) =>
      store.ports.api.renameBody(pantinId, ref.bodyId, name),
    );
  } else if (ref?.kind === "assembly") {
    // The display name only: the key, hence the tags, stay (ADR 0019).
    await editPantin(store, ref.pantinId, (pantinId) =>
      store.ports.api.renameAssembly(pantinId, ref.key, name),
    );
  }
}
