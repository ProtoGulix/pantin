import { infoMessage } from "../messages.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { withOpenPantin } from "../viewer-state.ts";
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
  await store.run(
    () => store.ports.api.getPantin(pantinId),
    (current, response) => store.applyIfStillRequested(current, response),
  );
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

/** Runs an edit on a Pantin, then shows its fresh state. Undefined on failure. */
export async function editPantin<Result>(
  store: ViewerStore,
  pantinId: string,
  edit: (pantinId: string) => Promise<Result>,
): Promise<Result | undefined> {
  const outcome = await store.run(
    async () => {
      const result = await edit(pantinId);
      return { result, pantin: await store.ports.api.getPantin(pantinId) };
    },
    (current, { pantin }) => store.applyIfStillRequested(current, pantin),
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
