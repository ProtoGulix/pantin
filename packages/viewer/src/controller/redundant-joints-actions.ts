import {
  previewedJointIds,
  withRedundantJointsDeleted,
  withRedundantJointsPreview,
} from "../redundant-joints-state.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Édition > Supprimer les liaisons fixes redondantes… (ADR 0060 point 5): the
// core's preview first, then the deletion of exactly the previewed ids. The
// viewer decides nothing about redundancy.

/** The preview: an empty one is a message, any other opens the prompt. */
export async function requestRedundantJointsDeletion(store: ViewerStore): Promise<void> {
  const pantinId = store.state.openPantin?.id;
  if (
    pantinId === undefined ||
    store.state.pendingRequestCount > 0 ||
    store.state.importInProgress
  ) {
    return;
  }
  await store.run(
    () => store.ports.api.listRedundantJoints(pantinId),
    (current, list) =>
      current.openPantin?.id === pantinId ? withRedundantJointsPreview(current, list) : current,
  );
}

/** "Supprimer" on the prompt. */
export async function confirmRedundantJointsDeletion(store: ViewerStore): Promise<void> {
  const pantinId = store.state.openPantin?.id;
  const pending = store.state.pendingRedundantJoints;
  if (pantinId === undefined || pending === null) {
    return;
  }
  await store.run(
    () => store.ports.api.deleteRedundantJoints(pantinId, previewedJointIds(pending)),
    (current, response) =>
      current.openPantin?.id === pantinId ? withRedundantJointsDeleted(current, response) : current,
  );
}
