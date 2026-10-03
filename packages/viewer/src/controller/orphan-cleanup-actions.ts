import {
  deletionBatches,
  mergedResponses,
  withOrphanCleanupDone,
  withOrphanPreview,
} from "../orphan-cleanup-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Fichier > Nettoyer les fichiers orphelins… (ADR 0038 point 7): the core's
// dry run first, then the deletion of exactly the previewed names.

/** The preview: an empty one is a message, any other opens the prompt. */
export async function requestOrphanCleanup(store: ViewerStore): Promise<void> {
  const pantinId = store.state.openPantin?.id;
  if (pantinId === undefined || store.state.pendingRequestCount > 0) {
    return;
  }
  await store.run(
    () => store.ports.api.listOrphanMeshes(pantinId),
    (current, list) =>
      current.openPantin?.id === pantinId ? withOrphanPreview(current, list) : current,
  );
}

// Sequential on purpose: the core deletes in its save queue, one request at a time.
async function deleteInBatches(store: ViewerStore, pantinId: string, fileNames: readonly string[]) {
  const responses = [];
  for (const batch of deletionBatches(fileNames)) {
    responses.push(await store.ports.api.deleteOrphanMeshes(pantinId, batch));
  }
  return mergedResponses(responses);
}

/** "Supprimer" on the prompt: the previewed names, never a fresh list. */
export async function confirmOrphanCleanup(store: ViewerStore): Promise<void> {
  const pantinId = store.state.openPantin?.id;
  const pending = store.state.pendingOrphanCleanup;
  if (pantinId === undefined || pending === null) {
    return;
  }
  const fileNames = pending.files.map(({ fileName }) => fileName);
  await store.run(
    () => deleteInBatches(store, pantinId, fileNames),
    (current, response) =>
      current.openPantin?.id === pantinId ? withOrphanCleanupDone(current, response) : current,
  );
}
