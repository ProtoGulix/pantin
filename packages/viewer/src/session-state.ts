import type { PantinResponse } from "@pantin/protocol";
import { infoMessage } from "./messages.ts";
import { bodyIdOfNode, pantinNodeId, parseNodeId } from "./tree/node-ids.ts";
import { type ViewerState, withOpenPantin } from "./viewer-state.ts";

// The two views and their transitions, as pure functions. List view: no
// Pantin open (openPantin null). Edit view: exactly one open Pantin.

export type ViewMode = "list" | "edit";

export function viewModeOf(state: ViewerState): ViewMode {
  return state.openPantin === null ? "list" : "edit";
}

/** Back to the list: nothing of the closed Pantin stays on screen. */
export function withPantinClosed(state: ViewerState): ViewerState {
  return {
    ...state,
    listSelectedPantinId: state.openPantin?.id ?? state.listSelectedPantinId,
    openPantin: null,
    expandedNodeIds: new Set(),
    selectedNodeId: null,
    renamingNodeId: null,
    contextMenu: null,
    pendingImport: null,
    importInProgress: false,
    closePrompt: false,
    pendingDeleteBodyId: null,
  };
}

/** Close directly when everything is saved; otherwise ask first. */
export function withCloseRequested(state: ViewerState): ViewerState {
  if (state.openPantin === null) {
    return state;
  }
  return state.openPantin.unsavedChanges
    ? { ...state, closePrompt: true, contextMenu: null, pendingDeleteBodyId: null }
    : withPantinClosed(state);
}

/**
 * The core threw the unsaved edits away (POST .../discard) and sent back the
 * saved Pantin: nothing is left to ask, so the edit view closes.
 */
export function withEditsDiscarded(state: ViewerState, saved: PantinResponse): ViewerState {
  return withPantinClosed(withOpenPantin(state, saved));
}

export function withCloseCancelled(state: ViewerState): ViewerState {
  return { ...state, closePrompt: false };
}

export function withListSelection(state: ViewerState, pantinId: string | null): ViewerState {
  const exists = state.pantins.some((summary) => summary.id === pantinId);
  return { ...state, listSelectedPantinId: exists ? pantinId : null };
}

/** Asks to confirm the deletion of the body a node stands for (never a source node). */
export function withDeleteRequested(state: ViewerState, nodeId: string): ViewerState {
  const ref = parseNodeId(nodeId);
  const bodyId = bodyIdOfNode(nodeId);
  const exists = state.openPantin?.document.bodies.some((body) => body.id === bodyId) ?? false;
  if (ref?.kind !== "body" || bodyId === null || !exists) {
    return state;
  }
  return {
    ...state,
    pendingDeleteBodyId: bodyId,
    selectedNodeId: nodeId,
    contextMenu: null,
    closePrompt: false,
  };
}

export function withDeleteCancelled(state: ViewerState): ViewerState {
  return { ...state, pendingDeleteBodyId: null };
}

/** The core answered the DELETE with the whole Pantin: show it, select the Pantin. */
export function withBodyDeleted(
  state: ViewerState,
  response: PantinResponse,
  bodyName: string,
): ViewerState {
  const shown = withOpenPantin({ ...state, pendingDeleteBodyId: null }, response);
  return {
    ...shown,
    selectedNodeId: pantinNodeId(response.id),
    message: infoMessage("message.deleted", { name: bodyName }),
  };
}
