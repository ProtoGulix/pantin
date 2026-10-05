import type { Body } from "@pantin/protocol";
import { bodyNodeId } from "./tree/node-ids.ts";
import { withRevealedNode } from "./tree/tree-state.ts";
import type { ViewerState } from "./viewer-state.ts";

// State transitions of the import form, apart from the main viewer state.

export function withImportStarted(state: ViewerState): ViewerState {
  return { ...state, importInProgress: true, message: null };
}

/** The import failed: the form stays open so the user can retry or cancel. */
export function withImportFailed(state: ViewerState): ViewerState {
  return { ...state, importInProgress: false };
}

/**
 * The core created one body (GLB, STL) or several (one per STEP assembly
 * component). The form closes and the first new body is selected and shown
 * in the tree, so the user sees at once what arrived.
 */
export function withImportedBodies(
  state: ViewerState,
  importedBodies: readonly Body[],
): ViewerState {
  const closed: ViewerState = { ...state, importInProgress: false, pendingImport: null };
  const firstBody = importedBodies[0];
  const pantinId = state.openPantin?.id;
  return firstBody === undefined || pantinId === undefined
    ? closed
    : withRevealedNode(closed, bodyNodeId(pantinId, firstBody.id));
}
